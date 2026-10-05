use wasm_bindgen::prelude::*;

use crate::api_state::{from_json, to_json, with_engine_mut};
use crate::civilization::get_civ_state;
use crate::factions;
use crate::ship_damage::apply_damage;
use crate::simulation::simulate_galaxy;
use crate::system_payload::{
    build_cluster_summary, build_system_payload, compute_chain_targets, jump_years_elapsed,
    ship_years_elapsed,
};
use crate::types::*;

#[wasm_bindgen]
pub fn jump_to_system(target_system_id: u32, fuel_cost: f64) -> Result<String, JsValue> {
    with_engine_mut(|engine| {
        let cluster = &engine.cluster;
        let ps = &mut engine.player_state;
        let current = &cluster[ps.current_system_id as usize];
        let target = &cluster[target_system_id as usize];

        let dx = target.x - current.x;
        let dy = target.y - current.y;
        let distance = (dx * dx + dy * dy).sqrt();
        let years_elapsed = jump_years_elapsed(distance);
        let ship_years = ship_years_elapsed(distance);
        let pre_jump_era = ps.galaxy_year / ERA_LENGTH;
        let new_galaxy_year = ps.galaxy_year + years_elapsed;

        ps.fuel = (ps.fuel - fuel_cost).max(0.0);
        ps.galaxy_year = new_galaxy_year;

        let from_system_id = ps.current_system_id;
        ps.current_system_id = target_system_id;

        if !ps.visited_systems.contains(&target_system_id) {
            ps.visited_systems.push(target_system_id);
        }

        ps.last_visit_year.insert(target_system_id, new_galaxy_year);

        let target_civ = get_civ_state(target_system_id, new_galaxy_year, target.economy);
        let faction_state = factions::get_system_faction_state(
            target_system_id,
            new_galaxy_year,
            target_civ.politics,
        );
        ps.faction_memory.insert(
            target_system_id,
            FactionMemoryEntry {
                faction_id: faction_state.controlling_faction_id.clone(),
                contesting_faction_id: faction_state.contesting_faction_id.clone(),
                galaxy_year: new_galaxy_year,
            },
        );
        if !ps
            .known_factions
            .contains(&faction_state.controlling_faction_id)
        {
            ps.known_factions
                .push(faction_state.controlling_faction_id.clone());
        }
        if let Some(ref contesting) = faction_state.contesting_faction_id {
            if !ps.known_factions.contains(contesting) {
                ps.known_factions.push(contesting.clone());
            }
        }

        simulate_galaxy(
            cluster,
            &mut engine.galaxy_state,
            &engine.player_state,
            years_elapsed,
        );

        let system_payload = build_system_payload(
            target,
            new_galaxy_year,
            &engine.player_state,
            None,
            Some(pre_jump_era),
            Some(years_elapsed),
        );

        let cluster_summary = build_cluster_summary(cluster, new_galaxy_year);
        let chain_targets = compute_chain_targets(cluster, &engine.player_state);
        engine.player_state.chain_targets = chain_targets.clone();

        let result = JumpResult {
            system_payload,
            cluster_summary,
            years_elapsed,
            ship_years_elapsed: ship_years,
            new_galaxy_year,
            galaxy_sim_state: engine.galaxy_state.systems.clone(),
            chain_targets,
            jump_log_entry: JumpLogEntry {
                from_system_id,
                to_system_id: target_system_id,
                years_elapsed,
                ship_years_elapsed: ship_years,
                galaxy_year_after: new_galaxy_year,
            },
            player_state: engine.player_state.clone(),
        };

        to_json(&result)
    })
}

#[wasm_bindgen]
pub fn tick_flight(context_json: &str) -> Result<String, JsValue> {
    let ctx: FlightTickContext = from_json(context_json, "flight context")?;

    with_engine_mut(|engine| {
        let ps = &mut engine.player_state;
        let stats = ps.effective_stats();

        ps.fuel = (ps.fuel + ctx.fuel_rate * ctx.dt).clamp(0.0, stats.max_fuel);

        let outcome = apply_damage(ps.shields, ps.heat, &stats, &ctx);
        ps.shields = outcome.shields;
        ps.heat = outcome.heat;

        let total_cargo: u32 = ps.cargo.values().sum();
        let mut remaining_capacity = stats.max_cargo.saturating_sub(total_cargo);
        for harvest in &ctx.cargo_harvests {
            let qty = harvest.qty.min(remaining_capacity);
            if qty > 0 {
                *ps.cargo.entry(harvest.good).or_insert(0) += qty;
                remaining_capacity -= qty;
            }
        }

        let result = FlightTickResult {
            fuel: ps.fuel,
            heat: ps.heat,
            shields: ps.shields,
            cargo: ps.cargo.clone(),
            dead: outcome.death_cause.is_some(),
            death_cause: outcome.death_cause,
            cargo_full: remaining_capacity == 0,
        };

        to_json(&result)
    })
}

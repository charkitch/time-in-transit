mod prng;
mod types;
mod cluster_generator;
mod star_properties;
mod system_profiles;
mod dyson_generator;
mod topopolis_generator;
mod system_generator;
mod civilization;
mod factions;
mod trading;
mod events;
mod simulation;
mod content;
mod world_interaction_field;
mod system_payload;

use wasm_bindgen::prelude::*;
use std::sync::Mutex;

use types::*;
use cluster_generator::generate_cluster;
use system_generator::generate_solar_system;
use civilization::get_civ_state;
use trading::get_market;
use events::{select_game_event, EventContext, EventPool};
use simulation::{init_galaxy_state, simulate_galaxy};
use system_payload::{build_system_payload, build_cluster_summary, compute_chain_targets, jump_years_elapsed};

// ─── Persistent state across WASM calls ─────────────────────────────────────

static ENGINE_STATE: Mutex<Option<EngineState>> = Mutex::new(None);

struct EngineState {
    cluster: Vec<StarSystemData>,
    galaxy_state: GalaxyState,
    player_state: PlayerState,
}

// ─── WASM API ───────────────────────────────────────────────────────────────

/// Initialize the game engine. Called once at game start or load.
///
/// Arguments:
/// - `player_state_json`: JSON-serialized PlayerState (or empty string for new game)
///
/// Returns: JSON-serialized InitResult
#[wasm_bindgen]
pub fn init_game(player_state_json: &str) -> Result<String, JsValue> {
    content::refresh_event_cache();
    let cluster = generate_cluster();

    let player_state: PlayerState = if player_state_json.is_empty() {
        PlayerState {
            credits: STARTING_CREDITS,
            cargo: std::collections::HashMap::new(),
            cargo_cost_basis: std::collections::HashMap::new(),
            fuel: STARTING_FUEL,
            shields: 100.0,
            current_system_id: 0,
            visited_systems: vec![0],
            galaxy_year: GALAXY_YEAR_START,
            player_choices: std::collections::HashMap::new(),
            last_visit_year: std::collections::HashMap::new(),
            known_factions: vec![],
            faction_memory: std::collections::HashMap::new(),
            seen_system_dialog_ids: vec![],
            chain_targets: vec![],
            player_history: crate::types::PlayerHistory::default(),
            heat: 0.0,
        }
    } else {
        serde_json::from_str(player_state_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse player state: {}", e)))?
    };

    let galaxy_state = init_galaxy_state(&cluster, player_state.galaxy_year);

    let system_payload = build_system_payload(
        &cluster[player_state.current_system_id as usize],
        player_state.galaxy_year,
        &player_state,
        None,
        None, // no era transition at init
        None, // no transit time line at init
    );

    let cluster_summary = build_cluster_summary(&cluster, player_state.galaxy_year);

    let sim_state_snapshot = galaxy_state.systems.clone();

    // Store engine state
    let mut state = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    *state = Some(EngineState {
        cluster: cluster.clone(),
        galaxy_state,
        player_state: player_state.clone(),
    });

    let chain_targets = compute_chain_targets(&cluster, &player_state);

    let result = InitResult {
        system_payload,
        cluster_summary,
        cluster,
        galaxy_sim_state: sim_state_snapshot,
        chain_targets,
    };

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

/// Get the current player state from the engine.
///
/// Returns: JSON-serialized PlayerState
#[wasm_bindgen]
pub fn get_player_state() -> Result<String, JsValue> {
    let engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_ref()
        .ok_or_else(|| JsValue::from_str("Engine not initialized"))?;

    serde_json::to_string(&engine.player_state)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

/// Set the player state in the engine (for save/load round-trip).
#[wasm_bindgen]
pub fn set_player_state(json: &str) -> Result<(), JsValue> {
    let player_state: PlayerState = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse player state: {}", e)))?;

    let mut engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_mut()
        .ok_or_else(|| JsValue::from_str("Engine not initialized"))?;

    engine.player_state = player_state;
    Ok(())
}

/// Primary game call — execute a hyperspace jump.
/// Reads player state from ENGINE_STATE, applies all jump mutations in place.
///
/// Arguments:
/// - `target_system_id`: destination system ID
/// - `fuel_cost`: fuel consumed by the jump (computed by TS from distance)
///
/// Returns: JSON-serialized JumpResult (now includes player_state snapshot)
#[wasm_bindgen]
pub fn jump_to_system(target_system_id: u32, fuel_cost: f64) -> Result<String, JsValue> {
    let mut engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_mut()
        .ok_or_else(|| JsValue::from_str("Engine not initialized — call init_game first"))?;

    let cluster = &engine.cluster;
    let ps = &mut engine.player_state;
    let current = &cluster[ps.current_system_id as usize];
    let target = &cluster[target_system_id as usize];

    // Calculate distance and years
    let dx = target.x - current.x;
    let dy = target.y - current.y;
    let distance = (dx * dx + dy * dy).sqrt();
    let years_elapsed = jump_years_elapsed(distance);
    let pre_jump_era = ps.galaxy_year / ERA_LENGTH;
    let new_galaxy_year = ps.galaxy_year + years_elapsed;

    // ── Apply jump mutations to player state ──
    ps.fuel = (ps.fuel - fuel_cost).max(0.0);
    ps.galaxy_year = new_galaxy_year;

    let from_system_id = ps.current_system_id;
    ps.current_system_id = target_system_id;

    if !ps.visited_systems.contains(&target_system_id) {
        ps.visited_systems.push(target_system_id);
    }

    ps.last_visit_year.insert(target_system_id, new_galaxy_year);

    // Update faction memory from target system
    let target_civ = get_civ_state(target_system_id, new_galaxy_year, target.economy);
    let faction_state = factions::get_system_faction_state(target_system_id, new_galaxy_year, target_civ.politics);
    ps.faction_memory.insert(target_system_id, FactionMemoryEntry {
        faction_id: faction_state.controlling_faction_id.clone(),
        contesting_faction_id: faction_state.contesting_faction_id.clone(),
        galaxy_year: new_galaxy_year,
    });
    if !ps.known_factions.contains(&faction_state.controlling_faction_id) {
        ps.known_factions.push(faction_state.controlling_faction_id.clone());
    }
    if let Some(ref contesting) = faction_state.contesting_faction_id {
        if !ps.known_factions.contains(contesting) {
            ps.known_factions.push(contesting.clone());
        }
    }

    // Simulate the galaxy forward
    simulate_galaxy(cluster, &mut engine.galaxy_state, &engine.player_state, years_elapsed);

    // Build the destination system payload
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

    let result = JumpResult {
        system_payload,
        cluster_summary,
        years_elapsed,
        new_galaxy_year,
        galaxy_sim_state: engine.galaxy_state.systems.clone(),
        chain_targets,
        jump_log_entry: JumpLogEntry {
            from_system_id,
            to_system_id: target_system_id,
            years_elapsed,
            galaxy_year_after: new_galaxy_year,
        },
        player_state: engine.player_state.clone(),
    };

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

/// Get market prices for a specific system (used when docked).
/// Reads player state from ENGINE_STATE.
///
/// Returns: JSON-serialized Vec<MarketEntry>
#[wasm_bindgen]
pub fn get_system_market(system_id: u32) -> Result<String, JsValue> {
    let engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_ref()
        .ok_or_else(|| JsValue::from_str("Engine not initialized"))?;

    let ps = &engine.player_state;
    let star = &engine.cluster[system_id as usize];
    let civ_state = get_civ_state(system_id, ps.galaxy_year, star.economy);
    let system_choices = ps.player_choices.get(&system_id);
    let market = get_market(
        system_id,
        civ_state.economy,
        Some(&civ_state),
        system_choices,
        Some(&ps.cargo),
    );

    serde_json::to_string(&market)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

/// Select a game event for a specific context.
/// Reads player state from ENGINE_STATE.
///
/// Returns: JSON-serialized Option<GameEvent>
#[wasm_bindgen]
pub fn get_game_event(
    system_id: u32,
    context: &str,
    secret_base_id: &str,
    surface: &str,
    site_class: &str,
    host_type: &str,
) -> Result<String, JsValue> {
    let engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_ref()
        .ok_or_else(|| JsValue::from_str("Engine not initialized"))?;

    let player_state = &engine.player_state;
    let star = &engine.cluster[system_id as usize];
    let civ_state = get_civ_state(system_id, player_state.galaxy_year, star.economy);
    let system_choices = player_state.player_choices.get(&system_id);
    let event_seed = player_state.galaxy_year.wrapping_mul(31337).wrapping_add(system_id.wrapping_mul(1009));
    let triggers = content::all_triggers();

    let pool = match context {
        "landing" => {
            if secret_base_id.is_empty() {
                EventPool::Landing
            } else {
                let system = generate_solar_system(star);
                match system
                    .secret_bases
                    .iter()
                    .find(|b| b.id == secret_base_id)
                    .map(|b| b.base_type)
                {
                    Some(SecretBaseType::Asteroid) => EventPool::AsteroidBase,
                    Some(SecretBaseType::OortCloud) => EventPool::OortCloudBase,
                    Some(SecretBaseType::MaximumSpace) => EventPool::MaximumSpace,
                    None => EventPool::Landing,
                }
            }
        }
        "system_entry" => EventPool::SystemEntry,
        "proximity_star" => EventPool::ProximityStar,
        "proximity_base" => EventPool::ProximityBase,
        "planet_landing" => EventPool::PlanetLanding,
        "dyson_landing" => EventPool::DysonLanding,
        "topopolis_landing" => EventPool::TopopolisLanding,
        "triggered" => EventPool::Triggered,
        _ => EventPool::Landing,
    };

    let surface = if surface.is_empty() {
        None
    } else {
        serde_json::from_str::<SurfaceType>(&format!("\"{}\"", surface)).ok()
    };
    let site_class = if site_class.is_empty() { None } else { Some(site_class) };
    let host_type = if host_type.is_empty() { None } else { Some(host_type) };

    let ctx = EventContext {
        civ_state: &civ_state,
        player_state: &player_state,
        system_choices,
        triggers: &triggers,
        surface,
        site_class,
        host_type,
        current_cluster: 0,
        current_system_id: system_id,
    };

    let event = select_game_event(pool, &ctx, event_seed);

    serde_json::to_string(&event)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

#[wasm_bindgen]
pub fn get_landing_event(
    system_id: u32,
    secret_base_id: &str,
) -> Result<String, JsValue> {
    get_game_event(system_id, "landing", secret_base_id, "", "", "")
}

/// Get the current cluster summary (all 30 systems' state).
///
/// Returns: JSON-serialized Vec<ClusterSystemSummary>
#[wasm_bindgen]
pub fn get_cluster_summary(galaxy_year: u32) -> Result<String, JsValue> {
    let engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_ref()
        .ok_or_else(|| JsValue::from_str("Engine not initialized"))?;

    let summary = build_cluster_summary(&engine.cluster, galaxy_year);
    serde_json::to_string(&summary)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

/// Apply a choice effect from an event to the engine's player state.
///
/// Arguments:
/// - `system_id`: the system where the event occurred
/// - `event_id`: the event ID being completed
/// - `root_event_id`: the root event ID for chain tracking
/// - `choice_effect_json`: JSON-serialized ChoiceEffect
///
/// Returns: JSON-serialized PlayerState snapshot
#[wasm_bindgen]
pub fn apply_choice_effect(
    system_id: u32,
    event_id: &str,
    root_event_id: &str,
    choice_effect_json: &str,
) -> Result<String, JsValue> {
    let effect: ChoiceEffect = serde_json::from_str(choice_effect_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse choice effect: {}", e)))?;

    let mut engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_mut()
        .ok_or_else(|| JsValue::from_str("Engine not initialized"))?;

    let ps = &mut engine.player_state;

    // Apply credits/fuel rewards
    ps.credits += effect.credits_reward;
    ps.fuel = (ps.fuel + effect.fuel_reward).max(0.0).min(STARTING_FUEL);

    // Apply system choices
    let choices = ps.player_choices.entry(system_id).or_insert_with(SystemChoices::default);
    choices.trading_reputation += effect.trading_reputation;
    for good in &effect.banned_goods {
        if !choices.banned_goods.contains(good) {
            choices.banned_goods.push(*good);
        }
    }
    choices.price_modifier *= effect.price_modifier;
    if effect.faction_tag.is_some() {
        choices.faction_tag = effect.faction_tag.clone();
    }
    let tracking_id = if root_event_id.is_empty() { event_id } else { root_event_id };
    if !choices.completed_event_ids.contains(&tracking_id.to_string()) {
        choices.completed_event_ids.push(tracking_id.to_string());
    }
    for flag in &effect.sets_flags {
        choices.flags.insert(flag.clone());
    }
    for trigger in &effect.fires {
        choices.fired_triggers.insert(trigger.clone());
    }

    // Apply galactic flags
    for flag in &effect.sets_galactic_flags {
        ps.player_history.galactic_flags.insert(flag.clone());
    }

    // Advance galaxy time and simulation
    let years_advance = effect.galaxy_years_advance;
    if years_advance > 0 {
        ps.galaxy_year += years_advance;
    }

    // Record global event completion
    ps.player_history.completed_events.insert(
        tracking_id.to_string(),
        CompletedEvent { system_id, galaxy_year: ps.galaxy_year },
    );

    // Run galaxy simulation forward if years advanced.
    // Done after all player_state mutations so the borrow on `ps` is released.
    if years_advance > 0 {
        simulate_galaxy(
            &engine.cluster,
            &mut engine.galaxy_state,
            &engine.player_state,
            years_advance,
        );
    }

    serde_json::to_string(&engine.player_state)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

/// Execute a buy trade. Validates credits and cargo capacity.
///
/// Returns: JSON-serialized PlayerState snapshot
#[wasm_bindgen]
pub fn trade_buy(good_json: &str, qty: u32, price: i32) -> Result<String, JsValue> {
    let good: GoodName = serde_json::from_str(good_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse good: {}", e)))?;

    let mut engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_mut()
        .ok_or_else(|| JsValue::from_str("Engine not initialized"))?;

    let ps = &mut engine.player_state;
    let total_cost = price * qty as i32;
    if ps.credits < total_cost {
        return Err(JsValue::from_str("Insufficient credits"));
    }
    let total_cargo: u32 = ps.cargo.values().sum();
    if total_cargo + qty > MAX_CARGO {
        return Err(JsValue::from_str("Cargo hold full"));
    }

    ps.credits -= total_cost;
    let old_qty = *ps.cargo.get(&good).unwrap_or(&0);
    let old_basis = *ps.cargo_cost_basis.get(&good).unwrap_or(&0.0);
    let new_qty = old_qty + qty;
    ps.cargo_cost_basis.insert(good, (old_basis * old_qty as f64 + price as f64 * qty as f64) / new_qty as f64);
    ps.cargo.insert(good, new_qty);

    serde_json::to_string(&*ps)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

/// Execute a sell trade.
///
/// Returns: JSON-serialized PlayerState snapshot
#[wasm_bindgen]
pub fn trade_sell(good_json: &str, qty: u32, price: i32) -> Result<String, JsValue> {
    let good: GoodName = serde_json::from_str(good_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse good: {}", e)))?;

    let mut engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_mut()
        .ok_or_else(|| JsValue::from_str("Engine not initialized"))?;

    let ps = &mut engine.player_state;
    let held = *ps.cargo.get(&good).unwrap_or(&0);
    let sell_qty = qty.min(held);
    if sell_qty == 0 {
        return Err(JsValue::from_str("No cargo to sell"));
    }

    ps.credits += price * sell_qty as i32;
    let remaining = held - sell_qty;
    if remaining == 0 {
        ps.cargo.remove(&good);
        ps.cargo_cost_basis.remove(&good);
    } else {
        ps.cargo.insert(good, remaining);
    }

    serde_json::to_string(&*ps)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

/// Per-frame flight state tick. Applies fuel/heat/shields/cargo changes.
///
/// Arguments:
/// - `context_json`: JSON-serialized FlightTickContext
///
/// Returns: JSON-serialized FlightTickResult
#[wasm_bindgen]
pub fn tick_flight(context_json: &str) -> Result<String, JsValue> {
    let ctx: FlightTickContext = serde_json::from_str(context_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse flight context: {}", e)))?;

    let mut engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_mut()
        .ok_or_else(|| JsValue::from_str("Engine not initialized"))?;

    let ps = &mut engine.player_state;

    // 1. Fuel: net rate (scooping - boost consumption)
    ps.fuel = (ps.fuel + ctx.fuel_rate * ctx.dt).clamp(0.0, STARTING_FUEL);

    // 2–4. Heat: apply heat sources, then cooling, then clamp
    ps.heat += ctx.heat_rate * ctx.dt;
    if ctx.cooling_active && ps.heat > 0.0 {
        ps.heat -= COOLING_RATE * ctx.dt;
    }
    ps.heat = ps.heat.clamp(0.0, HEAT_MAX);

    // 5. Overheat shield damage
    if ps.heat >= HEAT_MAX {
        ps.shields -= OVERHEAT_SHIELD_DMG * ctx.dt;
    }

    // 6. Hazard shield damage
    ps.shields -= ctx.shield_damage_rate * ctx.dt;

    // 7. Shield regen when cool and not dead
    if !ctx.is_dead && ps.heat < REGEN_HEAT_CEIL && ps.shields < 100.0 {
        ps.shields += SHIELD_REGEN_RATE * ctx.dt;
    }

    // 8. Clamp shields
    ps.shields = ps.shields.clamp(0.0, 100.0);

    // 9. Apply cargo harvests
    let total_cargo: u32 = ps.cargo.values().sum();
    let mut remaining_capacity = MAX_CARGO.saturating_sub(total_cargo);
    for harvest in &ctx.cargo_harvests {
        let qty = harvest.qty.min(remaining_capacity);
        if qty > 0 {
            *ps.cargo.entry(harvest.good).or_insert(0) += qty;
            remaining_capacity -= qty;
        }
    }

    // 10–11. Death check
    let dead = !ctx.is_dead
        && ps.shields <= 0.0
        && (ctx.shield_damage_rate > 0.0 || ps.heat >= HEAT_MAX);
    let death_cause = if dead {
        Some(if ps.heat >= HEAT_MAX && ctx.active_hazard == HazardType::None {
            HazardType::Overheat
        } else {
            ctx.active_hazard
        })
    } else {
        None
    };

    let result = FlightTickResult {
        fuel: ps.fuel,
        heat: ps.heat,
        shields: ps.shields,
        cargo: ps.cargo.clone(),
        dead,
        death_cause,
        cargo_full: remaining_capacity == 0,
    };

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn test_player_state(galaxy_year: u32) -> PlayerState {
        PlayerState {
            credits: STARTING_CREDITS,
            cargo: HashMap::new(),
            cargo_cost_basis: HashMap::new(),
            fuel: STARTING_FUEL,
            shields: 100.0,
            current_system_id: 0,
            visited_systems: vec![0],
            galaxy_year,
            player_choices: HashMap::new(),
            last_visit_year: HashMap::new(),
            known_factions: vec![],
            faction_memory: HashMap::new(),
            seen_system_dialog_ids: vec![],
            chain_targets: vec![],
            player_history: crate::types::PlayerHistory::default(),
            heat: 0.0,
        }
    }

    #[test]
    fn jump_years_elapsed_uses_flooring() {
        let dist_round_up = (25.6 / 10.0_f64).powf(1.0 / 1.4);
        let dist_round_down = (25.4 / 10.0_f64).powf(1.0 / 1.4);
        assert_eq!(jump_years_elapsed(dist_round_up), 25);
        assert_eq!(jump_years_elapsed(dist_round_down), 25);
    }

    #[test]
    fn jump_payload_includes_exact_transit_years_line() {
        let cluster = generate_cluster();
        let star = &cluster[1];
        let galaxy_year = GALAXY_YEAR_START + ERA_LENGTH + 37;
        let current_era = galaxy_year / ERA_LENGTH;
        let player = test_player_state(galaxy_year - 137);

        let payload = build_system_payload(
            star,
            galaxy_year,
            &player,
            None,
            Some(current_era - 1),
            Some(137),
        );

        assert!(payload
            .system_entry_lines
            .iter()
            .any(|line| line == "+137 YEARS IN TRANSIT"));
        assert!(!payload
            .system_entry_lines
            .iter()
            .any(|line| line.contains("years have passed")));
    }

    #[test]
    fn init_payload_does_not_include_transit_line() {
        let cluster = generate_cluster();
        let star = &cluster[0];
        let player = test_player_state(GALAXY_YEAR_START);

        let payload = build_system_payload(
            star,
            GALAXY_YEAR_START,
            &player,
            None,
            None,
            None,
        );

        assert!(!payload
            .system_entry_lines
            .iter()
            .any(|line| line.contains("YEARS IN TRANSIT")));
    }
}

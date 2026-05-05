use wasm_bindgen::prelude::*;

use crate::api_state::{from_json, to_json, EngineState, ENGINE_STATE};
use crate::cluster_generator::generate_cluster;
use crate::content;
use crate::simulation::init_galaxy_state;
use crate::system_payload::{build_cluster_summary, build_system_payload, compute_chain_targets};
use crate::types::*;

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
            player_history: PlayerHistory::default(),
            heat: 0.0,
            ship_upgrades: vec![],
            crew: vec![],
        }
    } else {
        from_json(player_state_json, "player state")?
    };

    let galaxy_state = init_galaxy_state(&cluster, player_state.galaxy_year);

    let system_payload = build_system_payload(
        &cluster[player_state.current_system_id as usize],
        player_state.galaxy_year,
        &player_state,
        None,
        None,
        None,
    );

    let cluster_summary = build_cluster_summary(&cluster, player_state.galaxy_year);
    let sim_state_snapshot = galaxy_state.systems.clone();

    let mut state = ENGINE_STATE
        .lock()
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
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

    to_json(&result)
}

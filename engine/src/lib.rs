mod prng;
mod types;
mod cluster_generator;
mod star_properties;
mod system_profiles;
mod dyson_generator;
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

/// Primary game call — execute a hyperspace jump.
///
/// Arguments:
/// - `target_system_id`: destination system ID
/// - `player_state_json`: JSON-serialized PlayerState
///
/// Returns: JSON-serialized JumpResult
#[wasm_bindgen]
pub fn jump_to_system(target_system_id: u32, player_state_json: &str) -> Result<String, JsValue> {
    let player_state: PlayerState = serde_json::from_str(player_state_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse player state: {}", e)))?;

    let mut engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_mut()
        .ok_or_else(|| JsValue::from_str("Engine not initialized — call init_game first"))?;

    let cluster = &engine.cluster;
    let current = &cluster[player_state.current_system_id as usize];
    let target = &cluster[target_system_id as usize];

    // Calculate distance and years
    let dx = target.x - current.x;
    let dy = target.y - current.y;
    let distance = (dx * dx + dy * dy).sqrt();
    let years_elapsed = jump_years_elapsed(distance);
    let pre_jump_era = player_state.galaxy_year / ERA_LENGTH;
    let new_galaxy_year = player_state.galaxy_year + years_elapsed;

    // Simulate the galaxy forward
    simulate_galaxy(cluster, &mut engine.galaxy_state, &player_state, years_elapsed);

    // Build the destination system payload
    let system_payload = build_system_payload(
        target,
        new_galaxy_year,
        &player_state,
        None,
        Some(pre_jump_era),
        Some(years_elapsed),
    );

    let cluster_summary = build_cluster_summary(cluster, new_galaxy_year);

    let chain_targets = compute_chain_targets(cluster, &player_state);

    let result = JumpResult {
        system_payload,
        cluster_summary,
        years_elapsed,
        new_galaxy_year,
        galaxy_sim_state: engine.galaxy_state.systems.clone(),
        chain_targets,
    };

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

/// Get market prices for a specific system (used when docked).
///
/// Returns: JSON-serialized Vec<MarketEntry>
#[wasm_bindgen]
pub fn get_system_market(system_id: u32, player_state_json: &str) -> Result<String, JsValue> {
    let player_state: PlayerState = serde_json::from_str(player_state_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse player state: {}", e)))?;

    let engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_ref()
        .ok_or_else(|| JsValue::from_str("Engine not initialized"))?;

    let star = &engine.cluster[system_id as usize];
    let civ_state = get_civ_state(system_id, player_state.galaxy_year, star.economy);
    let system_choices = player_state.player_choices.get(&system_id);
    let market = get_market(
        system_id,
        civ_state.economy,
        Some(&civ_state),
        system_choices,
        Some(&player_state.cargo),
    );

    serde_json::to_string(&market)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

/// Select a game event for a specific context.
///
/// Returns: JSON-serialized Option<GameEvent>
#[wasm_bindgen]
pub fn get_game_event(
    system_id: u32,
    player_state_json: &str,
    context: &str,
    secret_base_id: &str,
    surface: &str,
    site_class: &str,
    host_type: &str,
) -> Result<String, JsValue> {
    let player_state: PlayerState = serde_json::from_str(player_state_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse player state: {}", e)))?;

    let engine = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = engine.as_ref()
        .ok_or_else(|| JsValue::from_str("Engine not initialized"))?;

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
    player_state_json: &str,
    secret_base_id: &str,
) -> Result<String, JsValue> {
    get_game_event(system_id, player_state_json, "landing", secret_base_id, "", "", "")
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

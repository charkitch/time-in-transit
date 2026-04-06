mod prng;
mod types;
mod cluster_generator;
mod system_generator;
mod civilization;
mod factions;
mod trading;
mod events;
mod simulation;
mod content;
mod world_interaction_field;

use wasm_bindgen::prelude::*;
use std::sync::Mutex;

use types::*;
use cluster_generator::generate_cluster;
use system_generator::generate_solar_system;
use civilization::get_civ_state;
use factions::{get_faction, get_system_faction_state};
use trading::get_market;
use events::{select_game_event, EventContext, EventPool};
use simulation::{init_galaxy_state, simulate_galaxy};
use content::story_chains;

// ─── Persistent state across WASM calls ─────────────────────────────────────

static ENGINE_STATE: Mutex<Option<EngineState>> = Mutex::new(None);

struct EngineState {
    cluster: Vec<StarSystemData>,
    galaxy_state: GalaxyState,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn build_cluster_summary(cluster: &[StarSystemData], galaxy_year: u32) -> Vec<ClusterSystemSummary> {
    cluster.iter().map(|star| {
        let civ = get_civ_state(star.id, galaxy_year, star.economy);
        let faction = get_system_faction_state(star.id, galaxy_year, civ.politics);
        ClusterSystemSummary {
            id: star.id,
            name: star.name.clone(),
            x: star.x,
            y: star.y,
            star_type: star.star_type,
            politics: civ.politics,
            economy: civ.economy,
            controlling_faction_id: faction.controlling_faction_id,
            contesting_faction_id: faction.contesting_faction_id,
            is_contested: faction.is_contested,
            tech_level: star.tech_level,
            population: star.population,
        }
    }).collect()
}

fn compute_chain_targets(
    cluster: &[StarSystemData],
    player_state: &PlayerState,
) -> Vec<ChainTarget> {
    let mut targets = Vec::new();
    let any_flag = |flag: &str| -> bool {
        player_state.player_choices.values().any(|c| c.flags.contains(flag))
    };

    for chain in story_chains() {
        // Find which stage we're at: the last completed stage
        let mut active_stage_idx: Option<usize> = None;
        for (i, stage) in chain.stages.iter().enumerate() {
            if any_flag(stage.completion_flag) {
                active_stage_idx = Some(i);
            } else {
                break;
            }
        }

        // If a stage was completed, we need a target for the next event
        let stage_idx = match active_stage_idx {
            Some(i) => i,
            None => continue,
        };
        let stage = &chain.stages[stage_idx];

        // Check if already have a target for this chain at this stage
        if player_state.chain_targets.iter().any(|ct| {
            ct.chain_id == chain.chain_id && ct.stage == stage.stage_label
        }) {
            // Keep existing target
            if let Some(existing) = player_state.chain_targets.iter().find(|ct| {
                ct.chain_id == chain.chain_id && ct.stage == stage.stage_label
            }) {
                targets.push(existing.clone());
            }
            continue;
        }

        // Pick a target system: must have the right base type & be far enough away
        let current = &cluster[player_state.current_system_id as usize];
        let mut candidates: Vec<&StarSystemData> = Vec::new();

        for star in cluster {
            if star.id == player_state.current_system_id {
                continue;
            }
            let dx = star.x - current.x;
            let dy = star.y - current.y;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist < chain.min_distance {
                continue;
            }
            if let Some(required_base) = chain.required_base_type {
                let sys = generate_solar_system(star);
                if !sys.secret_bases.iter().any(|b| b.base_type == required_base) {
                    continue;
                }
            }
            candidates.push(star);
        }

        if candidates.is_empty() {
            continue;
        }

        // Deterministic pick based on chain_id + stage
        let seed = chain.chain_id.bytes().fold(0u32, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u32))
            .wrapping_add(stage_idx as u32 * 7919);
        let idx = (seed as usize) % candidates.len();

        targets.push(ChainTarget {
            chain_id: chain.chain_id.to_string(),
            target_system_id: candidates[idx].id,
            stage: stage.stage_label.to_string(),
        });
    }

    targets
}

fn build_system_payload(
    star: &StarSystemData,
    galaxy_year: u32,
    player_state: &PlayerState,
    secret_base_id: Option<&str>,
    pre_jump_era: Option<u32>,
    jump_years_in_transit: Option<u32>,
) -> SystemPayload {
    let system = generate_solar_system(star);
    let civ_state = get_civ_state(star.id, galaxy_year, star.economy);
    let faction_state = get_system_faction_state(star.id, galaxy_year, civ_state.politics);

    let system_choices = player_state.player_choices.get(&star.id);
    let market = get_market(
        star.id,
        civ_state.economy,
        Some(&civ_state),
        system_choices,
        Some(&player_state.cargo),
    );

    let triggers = content::all_triggers();

    // Select event for this payload context
    let event_seed = galaxy_year.wrapping_mul(31337).wrapping_add(star.id.wrapping_mul(1009));
    let ctx = EventContext {
        civ_state: &civ_state,
        player_state,
        system_choices,
        triggers: &triggers,
        surface: None,
        site_class: None,
        host_type: None,
        current_cluster: 0,
        current_system_id: star.id,
    };
    let game_event = if let Some(base_id) = secret_base_id {
        let base_type = system.secret_bases.iter()
            .find(|b| b.id == base_id)
            .map(|b| b.base_type);
        let pool = match base_type {
            Some(SecretBaseType::Asteroid) => EventPool::AsteroidBase,
            Some(SecretBaseType::OortCloud) => EventPool::OortCloudBase,
            Some(SecretBaseType::MaximumSpace) => EventPool::MaximumSpace,
            None => EventPool::Landing,
        };
        select_game_event(pool, &ctx, event_seed)
    } else {
        select_game_event(EventPool::SystemEntry, &ctx, event_seed)
    };

    // Build system entry lines
    let mut lines = Vec::new();

    // Era transition narration
    let current_era = galaxy_year / ERA_LENGTH;
    if let Some(prev_era) = pre_jump_era {
        if current_era != prev_era {
            let eras_crossed = current_era - prev_era;
            lines.push(format!("— GALAXY YEAR {} —", galaxy_year));
            if eras_crossed == 1 {
                lines.push("Centuries have passed. Empires have risen and fallen in your absence.".to_string());
            } else {
                lines.push("Eras have passed. The galaxy you knew is ancient history.".to_string());
            }
            lines.push(String::new());
        }
    }

    lines.push(format!("ENTERING {}", star.name.to_uppercase()));
    if let Some(years) = jump_years_in_transit {
        lines.push(format!("+{} YEARS IN TRANSIT", years));
    }

    let control_faction = get_faction(&faction_state.controlling_faction_id);
    let contest_faction = faction_state.contesting_faction_id.as_ref()
        .and_then(|id| get_faction(id));

    if faction_state.is_contested {
        if let (Some(ctrl), Some(cont)) = (control_faction, contest_faction) {
            lines.push(format!("CONTESTED — {} vs {}",
                ctrl.name.to_uppercase(), cont.name.to_uppercase()));
        }
    } else if let Some(ctrl) = control_faction {
        lines.push(format!("CONTROLLED BY {}", ctrl.name.to_uppercase()));
    }

    // Secret base hints
    for base in &system.secret_bases {
        match base.base_type {
            SecretBaseType::Asteroid => lines.push("FAINT SIGNAL DETECTED IN ASTEROID BELT".to_string()),
            SecretBaseType::OortCloud => lines.push("ANOMALOUS BEACON — EXTREME OUTER SYSTEM".to_string()),
            SecretBaseType::MaximumSpace => lines.push("UNKNOWN TRANSMISSION FROM BEYOND SYSTEM EDGE".to_string()),
        }
    }

    // Check faction memory for changes
    if let Some(memory) = player_state.faction_memory.get(&star.id) {
        if memory.faction_id != faction_state.controlling_faction_id {
            if let Some(old_faction) = get_faction(&memory.faction_id) {
                lines.push(format!("LAST VISIT: YEAR {}. {} NO LONGER HOLDS THIS SYSTEM.",
                    memory.galaxy_year, old_faction.name.to_uppercase()));
            }
        }
    }

    // Iron star arrival dialog — shown only once per save
    let system_entry_dialog = if star.star_type == StarType::Iron
        && !player_state.seen_system_dialog_ids.iter().any(|id| id == "iron_star_arrival")
    {
        Some(content::iron_star_arrival_dialog())
    } else {
        None
    };

    SystemPayload {
        system,
        civ_state,
        faction_state,
        market,
        game_event,
        system_entry_lines: lines,
        system_entry_dialog,
    }
}

fn jump_years_elapsed(distance: f64) -> u32 {
    (10.0 * distance.powf(1.4)).floor() as u32
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

use std::collections::HashMap;
use time_in_transit_engine::types::*;

pub fn test_player_state(galaxy_year: u32) -> PlayerState {
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
        player_history: PlayerHistory::default(),
        heat: 0.0,
        ship_upgrades: vec![],
    }
}

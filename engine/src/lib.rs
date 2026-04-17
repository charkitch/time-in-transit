#[cfg(test)]
mod noise;
mod prng;
mod types;
mod cluster_generator;
mod star_properties;
mod system_profiles;
mod dyson_generator;
mod topopolis_generator;
mod climate;
mod station_archetypes;
mod system_generator;
mod civilization;
mod factions;
mod trading;
mod events;
mod simulation;
mod content;
mod world_interaction_field;
mod system_payload;

mod api_state;
mod api_init;
mod api_flight;
mod api_trading;
mod api_events;
mod api_query;

#[cfg(test)]
mod tests {
    use crate::types::*;
    use crate::cluster_generator::generate_cluster;
    use crate::system_payload::{build_system_payload, jump_years_elapsed};
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
            player_history: PlayerHistory::default(),
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

mod civilization;
mod climate;
mod cluster_generator;
mod content;
mod dyson_generator;
mod events;
mod factions;
#[cfg(test)]
mod noise;
mod prng;
mod simulation;
mod star_properties;
mod station_archetypes;
mod system_generator;
mod system_payload;
mod system_profiles;
mod topopolis_generator;
mod trading;
mod types;
mod world_interaction_field;

mod api_events;
mod api_flight;
mod api_init;
mod api_query;
mod api_state;
mod api_station;
mod api_trading;

#[cfg(test)]
mod tests {
    use crate::cluster_generator::generate_cluster;
    use crate::system_payload::{build_system_payload, jump_years_elapsed, ship_years_elapsed};
    use crate::types::*;
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
    fn jump_years_elapsed_linear_with_accel_overhead() {
        // 10-year accel/decel overhead + 14 years per galaxy unit (~10 ly/unit at 0.93c)
        assert_eq!(jump_years_elapsed(1.0), 24); // 10 + 14
        assert_eq!(jump_years_elapsed(8.0), 122); // 10 + 112
        assert_eq!(jump_years_elapsed(25.0), 360); // 10 + 350
                                                   // Fractional distances floor the cruise portion
        assert_eq!(jump_years_elapsed(1.5), 31); // 10 + floor(21)
    }

    #[test]
    fn ship_years_less_than_external_years() {
        // At 0.93c, Lorentz factor ≈ 0.3676 — ship ages ~37% of external time
        let ext_8 = jump_years_elapsed(8.0); // 122
        let ship_8 = ship_years_elapsed(8.0); // 122 * 0.3676 ≈ 44.8
        assert!(ship_8 > 44.0 && ship_8 < 46.0);
        assert!(ship_8 < ext_8 as f64);

        let ext_25 = jump_years_elapsed(25.0); // 360
        let ship_25 = ship_years_elapsed(25.0); // 360 * 0.3676 ≈ 132.3
        assert!(ship_25 > 131.0 && ship_25 < 133.0);
        assert!(ship_25 < ext_25 as f64);
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
            .any(|line| line == "+137 YEARS IN TRANSIT (50 YEARS SHIP TIME)"));
        assert!(!payload
            .system_entry_lines
            .iter()
            .any(|line| line.contains("years have passed")));
    }

    #[test]
    fn era_crossing_shows_narration() {
        let cluster = generate_cluster();
        let star = &cluster[1];
        // Jump that crosses 3 eras: from era 12 to era 15
        let galaxy_year = GALAXY_YEAR_START + ERA_LENGTH * 15 + 50;
        let pre_jump_era = (GALAXY_YEAR_START + ERA_LENGTH * 12) / ERA_LENGTH;
        let player = test_player_state(galaxy_year - 800);

        let payload = build_system_payload(
            star,
            galaxy_year,
            &player,
            None,
            Some(pre_jump_era),
            Some(800),
        );

        assert!(payload
            .system_entry_lines
            .iter()
            .any(|line| line.contains("Centuries have passed")));
    }

    #[test]
    fn init_payload_does_not_include_transit_line() {
        let cluster = generate_cluster();
        let star = &cluster[0];
        let player = test_player_state(GALAXY_YEAR_START);

        let payload = build_system_payload(star, GALAXY_YEAR_START, &player, None, None, None);

        assert!(!payload
            .system_entry_lines
            .iter()
            .any(|line| line.contains("YEARS IN TRANSIT")));
    }
}

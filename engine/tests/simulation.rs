mod helpers;

use helpers::test_player_state;
use time_in_transit_engine::cluster_generator::generate_cluster;
use time_in_transit_engine::simulation::{init_galaxy_state, simulate_galaxy};
use time_in_transit_engine::types::*;

#[test]
fn simulation_advances_year() {
    let cluster = generate_cluster();
    let mut state = init_galaxy_state(&cluster, GALAXY_YEAR_START);
    let player = test_player_state(GALAXY_YEAR_START);
    let old_year = state.galaxy_year;
    simulate_galaxy(&cluster, &mut state, &player, 200);
    assert_eq!(state.galaxy_year, old_year + 200);
}

#[test]
fn stability_stays_bounded() {
    let cluster = generate_cluster();
    let mut state = init_galaxy_state(&cluster, GALAXY_YEAR_START);
    let player = test_player_state(GALAXY_YEAR_START);
    simulate_galaxy(&cluster, &mut state, &player, 1000);
    for sys in &state.systems {
        assert!(sys.stability >= 0.0 && sys.stability <= 1.0);
        assert!(sys.prosperity >= 0.0 && sys.prosperity <= 1.0);
    }
}

#[test]
fn player_choices_influence_simulation() {
    let cluster = generate_cluster();
    let player_a = test_player_state(GALAXY_YEAR_START);

    let mut player_b = test_player_state(GALAXY_YEAR_START);
    let choices = SystemChoices {
        faction_tag: Some(FACTION_TAG_REBEL_ALLY.to_string()),
        trading_reputation: -3,
        ..Default::default()
    };
    player_b.player_choices.insert(0, choices);

    let mut state_a = init_galaxy_state(&cluster, GALAXY_YEAR_START);
    let mut state_b = init_galaxy_state(&cluster, GALAXY_YEAR_START);

    simulate_galaxy(&cluster, &mut state_a, &player_a, 500);
    simulate_galaxy(&cluster, &mut state_b, &player_b, 500);

    let sys_a = &state_a.systems[0];
    let sys_b = &state_b.systems[0];
    assert!(
        sys_a.stability != sys_b.stability || sys_a.prosperity != sys_b.prosperity,
        "Player choices should influence simulation"
    );
}

#[test]
fn direct_faction_alignment_strengthens_that_faction() {
    let cluster = generate_cluster();
    let unaligned = test_player_state(GALAXY_YEAR_START);

    let mut aligned = test_player_state(GALAXY_YEAR_START);
    let choices = SystemChoices {
        faction_tag: Some("faction-0".to_string()),
        ..Default::default()
    };
    aligned.player_choices.insert(0, choices);

    let mut state_unaligned = init_galaxy_state(&cluster, GALAXY_YEAR_START);
    let mut state_aligned = init_galaxy_state(&cluster, GALAXY_YEAR_START);

    simulate_galaxy(&cluster, &mut state_unaligned, &unaligned, 2);
    simulate_galaxy(&cluster, &mut state_aligned, &aligned, 2);

    let strength = |state: &GalaxyState| state.systems[0].faction_strength["faction-0"];
    assert!(
        strength(&state_aligned) > strength(&state_unaligned),
        "direct faction alignment should strengthen that faction"
    );
}

use crate::civilization::get_civ_state;
use crate::factions::{all_factions, get_system_faction_state};
use crate::prng::Prng;
use crate::types::*;
use std::collections::HashMap;

/// Simulate the galaxy forward by `years` from current state.
///
/// This is the "years between the stars" — while the player is in hyperspace,
/// the galaxy evolves. Factions grow/shrink, stability shifts, economies
/// boom or crash. Player actions feed into the simulation as inputs.
///
/// The simulation runs per-system, per-year-step (in chunks of ~50 years
/// to keep it fast). Each step:
/// 1. Derive base politics/economy from CivilizationSystem (era-based)
/// 2. Layer simulation state on top (stability, prosperity, faction strength)
/// 3. Player actions ripple: faction tags boost aligned factions, trade
///    reputation affects prosperity, event choices shift stability
pub fn simulate_galaxy(
    cluster: &[StarSystemData],
    galaxy_state: &mut GalaxyState,
    player_state: &PlayerState,
    years: u32,
) {
    let step_size = 50u32;
    let steps = years.div_ceil(step_size);

    for step in 0..steps {
        let year_in_step = (step + 1) * step_size;
        let current_year = galaxy_state.galaxy_year + year_in_step.min(years);

        // Seed for this simulation step — incorporates galaxy year for non-determinism
        // across different jump orders
        let step_seed = current_year.wrapping_mul(0x45D9F3B).wrapping_add(step);

        for sys_state in galaxy_state.systems.iter_mut() {
            let system_id = sys_state.system_id;
            let star = &cluster[system_id as usize];

            let mut rng = Prng::from_index(step_seed, system_id);

            // Get the era-derived base state
            let civ = get_civ_state(system_id, current_year, star.economy);
            let faction_state = get_system_faction_state(system_id, current_year, civ.politics);

            // ── Stability dynamics ──────────────────────────────────────────
            // Contested systems lose stability, uncontested gain it
            let contest_pressure = if faction_state.is_contested {
                -0.08
            } else {
                0.02
            };

            // Political volatility: some politics are inherently unstable
            let political_stability = match civ.politics {
                PoliticalType::DriftSovereignty => -0.05,
                PoliticalType::PalimpsestAuthority => -0.03,
                PoliticalType::SilenceMandate | PoliticalType::WoundTithe => -0.02,
                PoliticalType::RemembranceCompact => 0.03,
                PoliticalType::Kindness | PoliticalType::Arrival => 0.04,
                PoliticalType::Murmuration | PoliticalType::Vigil => 0.02,
                PoliticalType::RequiemParliament => 0.01,
                _ => 0.0,
            };

            // Random events: coups, plagues, golden ages
            let event_roll = rng.next();
            let event_effect = if event_roll < 0.03 {
                // Catastrophe
                sys_state
                    .recent_events
                    .push(format!("Y{}: Crisis in {}", current_year, star.name));
                -0.20
            } else if event_roll > 0.95 {
                // Golden age
                sys_state
                    .recent_events
                    .push(format!("Y{}: Golden age in {}", current_year, star.name));
                0.15
            } else {
                0.0
            };

            // Player influence on stability
            let player_stability = player_state
                .player_choices
                .get(&system_id)
                .map(|choices| {
                    let rep_effect = choices.trading_reputation as f64 * 0.01;
                    let faction_effect = match choices.faction_tag.as_deref() {
                        Some(FACTION_TAG_REBEL_ALLY) => -0.05, // destabilizing
                        Some(FACTION_TAG_GOV_ALLY) => 0.05,    // stabilizing
                        _ => 0.0, // corp_ally is intentionally stability-neutral
                    };
                    rep_effect + faction_effect
                })
                .unwrap_or(0.0);

            sys_state.stability = (sys_state.stability
                + contest_pressure
                + political_stability
                + event_effect
                + player_stability)
                .clamp(0.0, 1.0);

            // ── Prosperity dynamics ─────────────────────────────────────────
            let econ_base = match civ.economy {
                EconomyType::Synthesis | EconomyType::Resonance => 0.03,
                EconomyType::Tributary | EconomyType::Extraction => 0.01,
                EconomyType::Tithe => 0.0,
                EconomyType::Remnant => -0.02,
                EconomyType::Everything => 0.05,
            };

            // Stability feeds prosperity
            let stability_effect = (sys_state.stability - 0.5) * 0.1;

            // Trade activity boost from player visits
            let trade_boost = if player_state
                .last_visit_year
                .get(&system_id)
                .map(|&y| current_year.saturating_sub(y) < 100)
                .unwrap_or(false)
            {
                0.03
            } else {
                0.0
            };

            let prosperity_noise = rng.float(-0.02, 0.02);

            sys_state.prosperity = (sys_state.prosperity
                + econ_base
                + stability_effect
                + trade_boost
                + prosperity_noise)
                .clamp(0.0, 1.0);

            // ── Faction strength dynamics ───────────────────────────────────
            let factions = all_factions();
            for faction in factions.iter() {
                let strength = sys_state
                    .faction_strength
                    .entry(faction.id.clone())
                    .or_insert(0.5);

                let is_controller = faction.id == faction_state.controlling_faction_id;
                let is_contester =
                    faction_state.contesting_faction_id.as_ref() == Some(&faction.id);

                let control_bonus = if is_controller {
                    0.05
                } else if is_contester {
                    0.02
                } else {
                    -0.02
                };

                let affinity_bonus = if faction.political_affinity.contains(&civ.politics) {
                    0.03
                } else {
                    -0.01
                };

                // Player alignment boost
                let player_boost = player_state
                    .player_choices
                    .get(&system_id)
                    .and_then(|c| c.faction_tag.as_deref())
                    .map(|tag| {
                        // If player is allied with a faction whose politics match this faction's affinity
                        match tag {
                            FACTION_TAG_CORP_ALLY
                                if faction
                                    .political_affinity
                                    .contains(&PoliticalType::PalimpsestAuthority) =>
                            {
                                0.05
                            }
                            FACTION_TAG_REBEL_ALLY
                                if faction
                                    .political_affinity
                                    .contains(&PoliticalType::DriftSovereignty) =>
                            {
                                0.05
                            }
                            FACTION_TAG_GOV_ALLY
                                if faction
                                    .political_affinity
                                    .contains(&PoliticalType::SilenceMandate) =>
                            {
                                0.05
                            }
                            _ => 0.0,
                        }
                    })
                    .unwrap_or(0.0);

                let noise = rng.float(-0.03, 0.03);

                *strength = (*strength + control_bonus + affinity_bonus + player_boost + noise)
                    .clamp(0.0, 1.0);
            }

            // Trim old events to last 5
            if sys_state.recent_events.len() > 5 {
                let drain = sys_state.recent_events.len() - 5;
                sys_state.recent_events.drain(0..drain);
            }
        }
    }

    galaxy_state.galaxy_year += years;
}

/// Initialize galaxy state for all systems
pub fn init_galaxy_state(cluster: &[StarSystemData], galaxy_year: u32) -> GalaxyState {
    let systems = cluster
        .iter()
        .map(|star| {
            let factions = all_factions();
            let faction_strength: HashMap<String, f64> =
                factions.iter().map(|f| (f.id.clone(), 0.5)).collect();

            SystemSimState {
                system_id: star.id,
                stability: 0.6 + (star.tech_level as f64 * 0.02),
                prosperity: match star.economy {
                    EconomyType::Synthesis | EconomyType::Resonance => 0.7,
                    EconomyType::Tributary | EconomyType::Extraction => 0.5,
                    EconomyType::Tithe => 0.4,
                    EconomyType::Remnant => 0.3,
                    EconomyType::Everything => 0.8,
                },
                faction_strength,
                recent_events: vec![],
            }
        })
        .collect();

    GalaxyState {
        galaxy_year,
        systems,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cluster_generator::generate_cluster;

    fn empty_player() -> PlayerState {
        PlayerState {
            credits: STARTING_CREDITS,
            cargo: HashMap::new(),
            cargo_cost_basis: HashMap::new(),
            fuel: STARTING_FUEL,
            shields: 100.0,
            current_system_id: 0,
            visited_systems: vec![0],
            galaxy_year: GALAXY_YEAR_START,
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
    fn simulation_advances_year() {
        let cluster = generate_cluster();
        let mut state = init_galaxy_state(&cluster, GALAXY_YEAR_START);
        let player = empty_player();
        let old_year = state.galaxy_year;
        simulate_galaxy(&cluster, &mut state, &player, 200);
        assert_eq!(state.galaxy_year, old_year + 200);
    }

    #[test]
    fn stability_stays_bounded() {
        let cluster = generate_cluster();
        let mut state = init_galaxy_state(&cluster, GALAXY_YEAR_START);
        let player = empty_player();
        simulate_galaxy(&cluster, &mut state, &player, 1000);
        for sys in &state.systems {
            assert!(sys.stability >= 0.0 && sys.stability <= 1.0);
            assert!(sys.prosperity >= 0.0 && sys.prosperity <= 1.0);
        }
    }

    #[test]
    fn player_choices_influence_simulation() {
        let cluster = generate_cluster();
        let player_a = empty_player();

        let mut player_b = empty_player();
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

        // System 0 should differ between the two simulations
        let sys_a = &state_a.systems[0];
        let sys_b = &state_b.systems[0];
        // They won't be exactly equal due to player influence
        assert!(
            sys_a.stability != sys_b.stability || sys_a.prosperity != sys_b.prosperity,
            "Player choices should influence simulation"
        );
    }
}

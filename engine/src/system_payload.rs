use crate::civilization::get_civ_state;
use crate::climate::{derive_climate, BodyIndex};
use crate::content;
use crate::events::{select_game_event, EventContext, EventPool};
use crate::factions::{get_faction, get_system_faction_state};
use crate::system_generator::generate_solar_system;
use crate::trading::get_market;
use crate::types::*;

pub fn build_cluster_summary(
    cluster: &[StarSystemData],
    galaxy_year: u32,
) -> Vec<ClusterSystemSummary> {
    cluster
        .iter()
        .map(|star| {
            let mut civ = get_civ_state(star.id, galaxy_year, star.economy);
            if star.special_kind == SpecialSystemKind::TheCrown {
                civ.politics = PoliticalType::CrownPatchwork;
                civ.economy = EconomyType::Everything;
            }
            let faction = get_system_faction_state(star.id, galaxy_year, civ.politics);
            ClusterSystemSummary {
                id: star.id,
                name: star.name.clone(),
                x: star.x,
                y: star.y,
                star_type: star.star_type,
                special_kind: star.special_kind,
                politics: civ.politics,
                economy: civ.economy,
                controlling_faction_id: faction.controlling_faction_id,
                contesting_faction_id: faction.contesting_faction_id,
                is_contested: faction.is_contested,
                tech_level: star.tech_level,
                population: star.population,
            }
        })
        .collect()
}

pub fn compute_chain_targets(
    cluster: &[StarSystemData],
    player_state: &PlayerState,
) -> Vec<ChainTarget> {
    let mut targets = Vec::new();
    let any_flag = |flag: &str| -> bool {
        player_state
            .player_choices
            .values()
            .any(|c| c.flags.contains(flag))
    };

    for chain in content::story_chains() {
        if chain.completion_flag.is_some_and(any_flag) {
            continue;
        }

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

        // Keep existing target if we already picked one for this stage
        if let Some(existing) = player_state
            .chain_targets
            .iter()
            .find(|ct| ct.chain_id == chain.chain_id && ct.stage == stage.stage_label)
        {
            targets.push(existing.clone());
            continue;
        }

        // Consequence chains radiate from where the story began;
        // quest chains radiate from where the player is now
        let origin = match chain.kind {
            content::StoryChainKind::Consequence => chain
                .start_event_id
                .and_then(|id| player_state.player_history.completed_events.get(id))
                .map(|ev| &cluster[ev.system_id as usize])
                .unwrap_or(&cluster[player_state.current_system_id as usize]),
            content::StoryChainKind::Quest => &cluster[player_state.current_system_id as usize],
        };
        let mut candidates: Vec<&StarSystemData> = Vec::new();

        for star in cluster {
            if star.id == player_state.current_system_id {
                continue;
            }
            let dx = star.x - origin.x;
            let dy = star.y - origin.y;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist < chain.min_distance {
                continue;
            }
            if let Some(required_base) = chain.required_base_type {
                let sys = generate_solar_system(star);
                if !sys
                    .secret_bases
                    .iter()
                    .any(|b| b.base_type == required_base)
                {
                    continue;
                }
            }
            candidates.push(star);
        }

        if candidates.is_empty() {
            continue;
        }

        // Deterministic pick based on chain_id + stage
        let seed = chain
            .chain_id
            .bytes()
            .fold(0u32, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u32))
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

pub fn build_system_payload(
    star: &StarSystemData,
    galaxy_year: u32,
    player_state: &PlayerState,
    secret_base_id: Option<&str>,
    pre_jump_era: Option<u32>,
    jump_years_in_transit: Option<u32>,
) -> SystemPayload {
    let mut system = generate_solar_system(star);
    let system_flags = player_state.player_choices.get(&star.id).map(|c| &c.flags);

    // Apply dynamic climate state to each planet and its moons
    // Home planet (system 0, planet 0) stays cap-free — it's the first thing the player sees.
    system
        .planets
        .iter_mut()
        .enumerate()
        .for_each(|(pi, planet)| {
            let pi = pi as u32;
            if planet.planet_type == PlanetType::Rocky && !(star.id == 0 && pi == 0) {
                let (climate, intensity, cap) = derive_climate(
                    star.id,
                    BodyIndex::Planet(pi),
                    galaxy_year,
                    planet.surface_type,
                    system_flags,
                );
                planet.climate_state = climate;
                planet.climate_intensity = intensity;
                planet.polar_cap_size = cap;
            }
            planet.moons.iter_mut().enumerate().for_each(|(mi, moon)| {
                let (climate, intensity, cap) = derive_climate(
                    star.id,
                    BodyIndex::Moon {
                        planet: pi,
                        moon: mi as u32,
                    },
                    galaxy_year,
                    moon.surface_type,
                    system_flags,
                );
                moon.climate_state = climate;
                moon.climate_intensity = intensity;
                moon.polar_cap_size = cap;
            });
        });

    let mut civ_state = get_civ_state(star.id, galaxy_year, star.economy);
    if star.special_kind == SpecialSystemKind::TheCrown {
        civ_state.politics = PoliticalType::CrownPatchwork;
        civ_state.economy = EconomyType::Everything;
    }
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
    let event_seed = galaxy_year
        .wrapping_mul(31337)
        .wrapping_add(star.id.wrapping_mul(1009));
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
        current_system_special_kind: star.special_kind,
    };
    let game_event = if let Some(base_id) = secret_base_id {
        let base_type = system
            .secret_bases
            .iter()
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
            lines.push(format!("— GALAXY YEAR {} —", galaxy_year));
            lines.push(
                "Centuries have passed. Empires have risen and fallen in your absence.".to_string(),
            );
            lines.push(String::new());
        }
    }

    lines.push(format!("ENTERING {}", star.name.to_uppercase()));
    if let Some(years) = jump_years_in_transit {
        let ship_time = years as f64 * LORENTZ_FACTOR;
        lines.push(format!(
            "+{} YEARS IN TRANSIT ({} SHIP TIME)",
            years,
            format_duration(ship_time)
        ));
    }

    let control_faction = get_faction(&faction_state.controlling_faction_id);
    let contest_faction = faction_state
        .contesting_faction_id
        .as_ref()
        .and_then(|id| get_faction(id));

    if faction_state.is_contested {
        if let (Some(ctrl), Some(cont)) = (control_faction, contest_faction) {
            lines.push(format!(
                "CONTESTED — {} vs {}",
                ctrl.name.to_uppercase(),
                cont.name.to_uppercase()
            ));
        }
    } else if let Some(ctrl) = control_faction {
        lines.push(format!("CONTROLLED BY {}", ctrl.name.to_uppercase()));
    }

    // Secret base hints
    for base in &system.secret_bases {
        match base.base_type {
            SecretBaseType::Asteroid => {
                lines.push("FAINT SIGNAL DETECTED IN ASTEROID BELT".to_string())
            }
            SecretBaseType::OortCloud => {
                lines.push("ANOMALOUS BEACON — EXTREME OUTER SYSTEM".to_string())
            }
            SecretBaseType::MaximumSpace => {
                lines.push("UNKNOWN TRANSMISSION FROM BEYOND SYSTEM EDGE".to_string())
            }
        }
    }

    // Check faction memory for changes
    if let Some(memory) = player_state.faction_memory.get(&star.id) {
        if memory.faction_id != faction_state.controlling_faction_id {
            if let Some(old_faction) = get_faction(&memory.faction_id) {
                lines.push(format!(
                    "LAST VISIT: YEAR {}. {} NO LONGER HOLDS THIS SYSTEM.",
                    memory.galaxy_year,
                    old_faction.name.to_uppercase()
                ));
            }
        }
    }

    // Special system arrival dialogs — shown only once per save
    let system_entry_dialog = if star.special_kind == SpecialSystemKind::IronStar
        && !player_state
            .seen_system_dialog_ids
            .iter()
            .any(|id| id == "iron_star_arrival")
    {
        Some(content::iron_star_arrival_dialog())
    } else if star.special_kind == SpecialSystemKind::TheCrown
        && !player_state
            .seen_system_dialog_ids
            .iter()
            .any(|id| id == "the_crown_arrival")
    {
        Some(content::the_crown_arrival_dialog())
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

pub fn jump_years_elapsed(distance: f64) -> u32 {
    10 + ((distance * 14.0).floor() as u32)
}

/// Proper time experienced by the ship during a jump (Lorentz-contracted).
/// At 0.93c the Lorentz factor ≈ 0.368, compressing centuries into decades.
pub fn ship_years_elapsed(distance: f64) -> f64 {
    let external = 10.0 + distance * 14.0;
    external * LORENTZ_FACTOR
}

fn format_duration(years: f64) -> String {
    let whole_years = years.floor() as u64;
    if whole_years > 0 {
        return format!("{} YEARS", whole_years);
    }
    let total_days = (years * 365.25) as u64;
    let m = total_days / 30;
    let d = total_days % 30;
    match (m, d) {
        (0, d) => format!("{} DAYS", d),
        (m, 0) => format!("{} MONTHS", m),
        (m, d) => format!("{} MONTHS {} DAYS", m, d),
    }
}

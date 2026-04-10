use std::collections::HashMap;

use crate::content;
use crate::prng::PRNG;
use crate::types::*;

#[derive(Debug, Clone, Copy)]
pub enum EventPool {
    Landing,
    AsteroidBase,
    OortCloudBase,
    MaximumSpace,
    Triggered,
    SystemEntry,
    ProximityStar,
    ProximityBase,
    PlanetLanding,
    DysonLanding,
}

pub struct EventContext<'a> {
    pub civ_state: &'a CivilizationState,
    pub player_state: &'a PlayerState,
    pub system_choices: Option<&'a SystemChoices>,
    pub triggers: &'a HashMap<String, Trigger>,
    pub surface: Option<SurfaceType>,
    pub site_class: Option<&'a str>,
    pub host_type: Option<&'a str>,
    pub current_cluster: u32,
    pub current_system_id: u32,
}

fn system_choices_or_default<'a>(ctx: &'a EventContext<'a>) -> SystemChoices {
    ctx.system_choices.cloned().unwrap_or_default()
}

fn check_condition(cond: &EventCondition, ctx: &EventContext) -> bool {
    let choices = system_choices_or_default(ctx);
    let any_system_has_flag = |flag: &str| {
        ctx.player_state
            .player_choices
            .values()
            .any(|c| c.flags.contains(flag))
    };
    match cond {
        EventCondition::PoliticsIs(pols) => pols.contains(&ctx.civ_state.politics),
        EventCondition::MinGalaxyYear(y) => ctx.civ_state.galaxy_year >= *y,
        EventCondition::HasFactionTag(tag) => choices.faction_tag.as_deref() == Some(tag.as_str()),
        EventCondition::HasCargo(item) => ctx
            .player_state
            .cargo
            .keys()
            .any(|good| format!("{:?}", good).eq_ignore_ascii_case(item)),
        EventCondition::VisitedSystem(id) => {
            if let Ok(system_id) = id.parse::<u32>() {
                ctx.player_state.visited_systems.contains(&system_id)
            } else {
                false
            }
        }
        EventCondition::MinCluster(n) => ctx.current_cluster >= *n,
        EventCondition::MinReputation(r) => choices.trading_reputation >= *r,
        EventCondition::FlagSet(flag) => choices.flags.contains(flag),
        EventCondition::FlagNotSet(flag) => !choices.flags.contains(flag),
        EventCondition::AnyFlagSet(flag) => any_system_has_flag(flag),
        EventCondition::AnyFlagNotSet(flag) => !any_system_has_flag(flag),
        EventCondition::SurfaceIs(surfaces) => {
            ctx.surface.map_or(false, |surface| surfaces.contains(&surface))
        }
        EventCondition::SiteClassIs(classes) => {
            ctx.site_class
                .map(|site_class| classes.iter().any(|class| class == site_class))
                .unwrap_or(false)
        }
        EventCondition::HostTypeIs(host_types) => {
            ctx.host_type
                .map(|host_type| host_types.iter().any(|ht| ht == host_type))
                .unwrap_or(false)
        }
        EventCondition::TriggerFired(id) => choices.fired_triggers.contains(id),
        EventCondition::ChainTargetHere(chain_id) => {
            ctx.player_state.chain_targets.iter().any(|ct| {
                ct.chain_id == *chain_id && ct.target_system_id == ctx.current_system_id
            })
        }
        EventCondition::GalacticFlag(flag) => ctx.player_state.player_history.galactic_flags.contains(flag),
        EventCondition::GalacticFlagNotSet(flag) => !ctx.player_state.player_history.galactic_flags.contains(flag),
    }
}

/// Returns the selection weight for this event (0.0 = unavailable).
fn event_weight(event: &GameEvent, ctx: &EventContext) -> f64 {
    let prior = ctx.player_state.player_history.completed_events.get(&event.id);

    if let Some(completed) = prior {
        let w = event.repeatability.repeat_weight();
        if w == 0.0 { return 0.0; }
        // Never repeat in the same system
        if completed.system_id == ctx.current_system_id { return 0.0; }
        // Suppress repeats within 20 galaxy years
        if ctx.player_state.galaxy_year.saturating_sub(completed.galaxy_year) < 20 { return 0.0; }
        if !conditions_met(event, ctx) { return 0.0; }
        return w;
    }

    if !conditions_met(event, ctx) { return 0.0; }
    1.0
}

fn conditions_met(event: &GameEvent, ctx: &EventContext) -> bool {
    let choices = system_choices_or_default(ctx);
    let inline_ok = event.requires.iter().all(|c| check_condition(c, ctx));

    let trigger_ok = match &event.triggered_by {
        Some(trigger_id) => {
            choices.fired_triggers.contains(trigger_id)
                && ctx
                    .triggers
                    .get(trigger_id)
                    .map(|trigger| trigger.conditions.iter().all(|c| check_condition(c, ctx)))
                    .unwrap_or(false)
        }
        None => !event.triggered_only,
    };

    inline_ok && trigger_ok
}

fn pool_events(pool: EventPool) -> Vec<GameEvent> {
    match pool {
        EventPool::Landing => content::landing_events(),
        EventPool::AsteroidBase => content::asteroid_base_events(),
        EventPool::OortCloudBase => content::oort_cloud_base_events(),
        EventPool::MaximumSpace => content::maximum_space_events(),
        EventPool::Triggered => content::triggered_events(),
        EventPool::SystemEntry => content::system_entry_events(),
        EventPool::ProximityStar => content::proximity_star_events(),
        EventPool::ProximityBase => content::proximity_base_events(),
        EventPool::PlanetLanding => content::planet_landing_events(),
        EventPool::DysonLanding => content::dyson_landing_events(),
    }
}

pub fn select_game_event(pool: EventPool, ctx: &EventContext, seed: u32) -> Option<GameEvent> {
    let mut all = pool_events(pool);
    if !matches!(pool, EventPool::Triggered) {
        all.extend(pool_events(EventPool::Triggered));
    }

    let weighted: Vec<(GameEvent, f64)> = all
        .into_iter()
        .filter_map(|event| {
            let w = event_weight(&event, ctx);
            if w > 0.0 { Some((event, w)) } else { None }
        })
        .collect();

    if weighted.is_empty() {
        return None;
    }

    let total: f64 = weighted.iter().map(|(_, w)| w).sum();
    let mut rng = PRNG::new(seed);
    let mut roll = rng.next() * total;
    for (event, w) in &weighted {
        roll -= w;
        if roll <= 0.0 {
            return Some(event.clone());
        }
    }
    Some(weighted.last().unwrap().0.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashMap, HashSet};

    fn test_civ() -> CivilizationState {
        CivilizationState {
            system_id: 0,
            galaxy_year: 6000,
            era: 12,
            politics: PoliticalType::RemembranceCompact,
            economy: EconomyType::Tithe,
            banned_goods: vec![],
            price_modifier: 1.0,
            luxury_mod: 1.0,
            anarchy_variance: false,
            tech_bonus: vec![],
        }
    }

    fn test_player() -> PlayerState {
        PlayerState {
            credits: 1000,
            cargo: HashMap::new(),
            cargo_cost_basis: HashMap::new(),
            fuel: 7.0,
            shields: 100.0,
            current_system_id: 0,
            visited_systems: vec![0],
            galaxy_year: 6000,
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
    fn event_counts() {
        assert!(content::landing_events().len() >= 10);
        assert!(content::asteroid_base_events().len() >= 9);
        assert!(content::oort_cloud_base_events().len() >= 7);
        assert!(content::maximum_space_events().len() >= 8);
        assert!(content::triggered_events().len() >= 1);
        assert!(content::dyson_landing_events().len() >= 2);
    }

    #[test]
    fn select_returns_event() {
        let civ = test_civ();
        let player = test_player();
        let triggers = content::all_triggers();
        let ctx = EventContext {
            civ_state: &civ,
            player_state: &player,
            system_choices: None,
            triggers: &triggers,
            surface: None,
            site_class: None,
            host_type: None,
            current_cluster: 0,
            current_system_id: 0,
        };
        assert!(select_game_event(EventPool::Landing, &ctx, 42).is_some());
    }

    #[test]
    fn selection_is_deterministic_for_same_seed_and_context() {
        let civ = test_civ();
        let player = test_player();
        let triggers = content::all_triggers();
        let ctx = EventContext {
            civ_state: &civ,
            player_state: &player,
            system_choices: None,
            triggers: &triggers,
            surface: None,
            site_class: None,
            host_type: None,
            current_cluster: 0,
            current_system_id: 0,
        };

        let first = select_game_event(EventPool::Landing, &ctx, 4242)
            .map(|event| event.id)
            .unwrap_or_default();
        let second = select_game_event(EventPool::Landing, &ctx, 4242)
            .map(|event| event.id)
            .unwrap_or_default();

        assert_eq!(first, second);
    }

    #[test]
    fn triggered_event_requires_fired_trigger_and_flag() {
        let civ = test_civ();
        let player = test_player();
        let triggers = content::all_triggers();

        let mut choices = SystemChoices::default();
        choices.fired_triggers.insert("rebel-contact-ready".to_string());
        let ctx_without_flag = EventContext {
            civ_state: &civ,
            player_state: &player,
            system_choices: Some(&choices),
            triggers: &triggers,
            surface: None,
            site_class: None,
            host_type: None,
            current_cluster: 0,
            current_system_id: 0,
        };
        let no_event = select_game_event(EventPool::Triggered, &ctx_without_flag, 1);
        assert!(no_event.is_none());

        let mut choices_with_flag = choices;
        choices_with_flag.flags = HashSet::from(["dead_drop_accepted".to_string()]);
        let ctx_with_flag = EventContext {
            civ_state: &civ,
            player_state: &player,
            system_choices: Some(&choices_with_flag),
            triggers: &triggers,
            surface: None,
            site_class: None,
            host_type: None,
            current_cluster: 0,
            current_system_id: 0,
        };
        let event = select_game_event(EventPool::Triggered, &ctx_with_flag, 2);
        assert!(event.is_some());
        assert_eq!(event.unwrap().id, "REBEL_CONTACT_FOLLOWS_UP");
    }
}

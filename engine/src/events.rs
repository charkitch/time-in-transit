use std::collections::HashMap;

use crate::content;
use crate::prng::Prng;
use crate::types::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
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
    TopopolisLanding,
}

pub const ALL_EVENT_POOLS: &[EventPool] = &[
    EventPool::Landing,
    EventPool::AsteroidBase,
    EventPool::OortCloudBase,
    EventPool::MaximumSpace,
    EventPool::Triggered,
    EventPool::SystemEntry,
    EventPool::ProximityStar,
    EventPool::ProximityBase,
    EventPool::PlanetLanding,
    EventPool::DysonLanding,
    EventPool::TopopolisLanding,
];

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
    pub current_system_special_kind: SpecialSystemKind,
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
    let years_since_event = |event_id: &str| {
        ctx.player_state
            .player_history
            .completed_events
            .get(event_id)
            .map(|completed| {
                ctx.player_state
                    .galaxy_year
                    .saturating_sub(completed.galaxy_year)
            })
    };
    match cond {
        EventCondition::PoliticsIs(pols) => pols.contains(&ctx.civ_state.politics),
        EventCondition::SpecialSystemIs(system_kinds) => system_kinds
            .iter()
            .any(|kind| kind == ctx.current_system_special_kind.as_str()),
        EventCondition::MinGalaxyYear(y) => ctx.civ_state.galaxy_year >= *y,
        EventCondition::MinYearsSinceEvent { event_id, years } => years_since_event(event_id)
            .map(|elapsed| elapsed >= *years)
            .unwrap_or(false),
        EventCondition::MaxYearsSinceEvent { event_id, years } => years_since_event(event_id)
            .map(|elapsed| elapsed <= *years)
            .unwrap_or(false),
        EventCondition::EventCompletedInCurrentSystem { event_id } => ctx
            .player_state
            .player_history
            .completed_events
            .get(event_id)
            .map(|completed| completed.system_id == ctx.current_system_id)
            .unwrap_or(false),
        EventCondition::EventCompletedOutsideCurrentSystem { event_id } => ctx
            .player_state
            .player_history
            .completed_events
            .get(event_id)
            .map(|completed| completed.system_id != ctx.current_system_id)
            .unwrap_or(false),
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
        EventCondition::SurfaceIs(surfaces) => ctx
            .surface
            .is_some_and(|surface| surfaces.contains(&surface)),
        EventCondition::SiteClassIs(classes) => ctx
            .site_class
            .map(|site_class| classes.iter().any(|class| class == site_class))
            .unwrap_or(false),
        EventCondition::HostTypeIs(host_types) => ctx
            .host_type
            .map(|host_type| host_types.iter().any(|ht| ht == host_type))
            .unwrap_or(false),
        EventCondition::TriggerFired(id) => choices.fired_triggers.contains(id),
        EventCondition::ChainTargetHere(chain_id) => ctx
            .player_state
            .chain_targets
            .iter()
            .any(|ct| ct.chain_id == *chain_id && ct.target_system_id == ctx.current_system_id),
        EventCondition::GalacticFlag(flag) => ctx
            .player_state
            .player_history
            .galactic_flags
            .contains(flag),
        EventCondition::GalacticFlagNotSet(flag) => !ctx
            .player_state
            .player_history
            .galactic_flags
            .contains(flag),
    }
}

/// Returns the selection weight for this event (0.0 = unavailable).
fn event_weight(event: &GameEvent, ctx: &EventContext) -> f64 {
    let prior = ctx
        .player_state
        .player_history
        .completed_events
        .get(&event.id);

    if let Some(completed) = prior {
        let w = event.repeatability.repeat_weight();
        if w == 0.0 {
            return 0.0;
        }
        // Never repeat in the same system
        if completed.system_id == ctx.current_system_id {
            return 0.0;
        }
        // Suppress repeats within 20 galaxy years
        if ctx
            .player_state
            .galaxy_year
            .saturating_sub(completed.galaxy_year)
            < 20
        {
            return 0.0;
        }
        if !conditions_met(event, ctx) {
            return 0.0;
        }
        return w;
    }

    if !conditions_met(event, ctx) {
        return 0.0;
    }
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
    content::events_for_pool(pool)
}

/// Strip choices whose `requires` conditions aren't met, recursing into nested moments.
fn filter_unavailable_choices(choices: &mut Vec<EventChoice>, ctx: &EventContext) {
    choices.retain(|c| c.requires.iter().all(|cond| check_condition(cond, ctx)));
    choices.iter_mut().for_each(|c| {
        if let Some(ref mut moment) = c.next_moment {
            filter_unavailable_choices(&mut moment.choices, ctx);
        }
    });
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
            if w > 0.0 {
                Some((event, w))
            } else {
                None
            }
        })
        .collect();

    if weighted.is_empty() {
        return None;
    }

    let finalize = |event: &GameEvent| {
        let mut selected = event.clone();
        filter_unavailable_choices(&mut selected.choices, ctx);
        selected
    };

    let total: f64 = weighted.iter().map(|(_, w)| w).sum();
    let mut rng = Prng::new(seed);
    let mut roll = rng.next() * total;
    for (event, w) in &weighted {
        roll -= w;
        if roll <= 0.0 {
            return Some(finalize(event));
        }
    }
    // Fallback: floating-point rounding can overshoot — weighted is non-empty (early return above)
    Some(finalize(
        &weighted
            .last()
            .expect("weighted pool confirmed non-empty")
            .0,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use content_types::Repeatability;
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
            ship_upgrades: vec![],
        }
    }

    fn empty_effect() -> ChoiceEffect {
        ChoiceEffect {
            trading_reputation: 0,
            banned_goods: vec![],
            price_modifier: 1.0,
            faction_tag: None,
            credits_reward: 0,
            fuel_reward: 0.0,
            sets_flags: vec![],
            fires: vec![],
            sets_galactic_flags: vec![],
            galaxy_years_advance: 0,
            grants_upgrade: None,
        }
    }

    fn test_event_with_requires(requires: Vec<EventCondition>) -> GameEvent {
        GameEvent {
            id: "TEST_EVENT".to_string(),
            title: "Test".to_string(),
            narrative_lines: vec!["Test.".to_string()],
            choices: vec![EventChoice {
                id: "ok".to_string(),
                label: "Ok".to_string(),
                description: "Continue".to_string(),
                effect: empty_effect(),
                requires: vec![],
                requires_min_tech: None,
                requires_credits: None,
                next_moment: None,
            }],
            requires,
            triggered_by: None,
            triggered_only: false,
            repeatability: Repeatability::Unique,
        }
    }

    #[test]
    fn event_counts() {
        assert!(content::events_for_pool(EventPool::Landing).len() >= 10);
        assert!(content::events_for_pool(EventPool::AsteroidBase).len() >= 9);
        assert!(content::events_for_pool(EventPool::OortCloudBase).len() >= 7);
        assert!(content::events_for_pool(EventPool::MaximumSpace).len() >= 8);
        assert!(content::events_for_pool(EventPool::PlanetLanding).len() >= 8);
        assert!(!content::events_for_pool(EventPool::Triggered).is_empty());
        assert!(content::events_for_pool(EventPool::DysonLanding).len() >= 2);
        assert!(content::events_for_pool(EventPool::TopopolisLanding).len() >= 2);
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
            current_system_special_kind: SpecialSystemKind::None,
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
            current_system_special_kind: SpecialSystemKind::None,
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
        choices
            .fired_triggers
            .insert("rebel-contact-ready".to_string());
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
            current_system_special_kind: SpecialSystemKind::None,
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
            current_system_special_kind: SpecialSystemKind::None,
        };
        let event = select_game_event(EventPool::Triggered, &ctx_with_flag, 2);
        assert!(event.is_some());
        assert_eq!(
            event.expect("triggered event should be selected").id,
            "REBEL_CONTACT_FOLLOWS_UP"
        );
    }

    #[test]
    fn special_system_condition_filters_events() {
        let civ = test_civ();
        let player = test_player();
        let triggers = content::all_triggers();
        let matching_ctx = EventContext {
            civ_state: &civ,
            player_state: &player,
            system_choices: None,
            triggers: &triggers,
            surface: None,
            site_class: None,
            host_type: None,
            current_cluster: 0,
            current_system_id: 7,
            current_system_special_kind: SpecialSystemKind::TheCrown,
        };
        let non_matching_ctx = EventContext {
            current_system_special_kind: SpecialSystemKind::None,
            ..matching_ctx
        };
        let event = GameEvent {
            id: "TEST_SPECIAL_SYSTEM".to_string(),
            title: "Test".to_string(),
            narrative_lines: vec!["Only here.".to_string()],
            choices: vec![EventChoice {
                id: "ok".to_string(),
                label: "Ok".to_string(),
                description: "Continue".to_string(),
                effect: empty_effect(),
                requires: vec![],
                requires_min_tech: None,
                requires_credits: None,
                next_moment: None,
            }],
            requires: vec![EventCondition::SpecialSystemIs(vec![
                "the_crown".to_string()
            ])],
            triggered_by: None,
            triggered_only: false,
            repeatability: Repeatability::Unique,
        };

        assert_eq!(event_weight(&event, &matching_ctx), 1.0);
        assert_eq!(event_weight(&event, &non_matching_ctx), 0.0);
    }

    #[test]
    fn relative_time_conditions_use_completed_event_history() {
        let civ = test_civ();
        let mut player = test_player();
        player.galaxy_year = 6000;
        player.player_history.completed_events.insert(
            "ORIGIN_EVENT".to_string(),
            CompletedEvent {
                system_id: 0,
                galaxy_year: 5500,
            },
        );
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
            current_system_special_kind: SpecialSystemKind::None,
        };

        assert_eq!(
            event_weight(
                &test_event_with_requires(vec![EventCondition::MinYearsSinceEvent {
                    event_id: "ORIGIN_EVENT".to_string(),
                    years: 500,
                }]),
                &ctx
            ),
            1.0
        );
        assert_eq!(
            event_weight(
                &test_event_with_requires(vec![EventCondition::MinYearsSinceEvent {
                    event_id: "ORIGIN_EVENT".to_string(),
                    years: 501,
                }]),
                &ctx
            ),
            0.0
        );
        assert_eq!(
            event_weight(
                &test_event_with_requires(vec![EventCondition::MaxYearsSinceEvent {
                    event_id: "ORIGIN_EVENT".to_string(),
                    years: 500,
                }]),
                &ctx
            ),
            1.0
        );
        assert_eq!(
            event_weight(
                &test_event_with_requires(vec![EventCondition::MaxYearsSinceEvent {
                    event_id: "ORIGIN_EVENT".to_string(),
                    years: 499,
                }]),
                &ctx
            ),
            0.0
        );
    }

    #[test]
    fn origin_conditions_compare_completed_event_system_to_current_system() {
        let civ = test_civ();
        let mut player = test_player();
        player.player_history.completed_events.insert(
            "ORIGIN_EVENT".to_string(),
            CompletedEvent {
                system_id: 7,
                galaxy_year: 5500,
            },
        );
        let triggers = content::all_triggers();
        let ctx_at_origin = EventContext {
            civ_state: &civ,
            player_state: &player,
            system_choices: None,
            triggers: &triggers,
            surface: None,
            site_class: None,
            host_type: None,
            current_cluster: 0,
            current_system_id: 7,
            current_system_special_kind: SpecialSystemKind::None,
        };
        let ctx_elsewhere = EventContext {
            current_system_id: 8,
            ..ctx_at_origin
        };

        assert_eq!(
            event_weight(
                &test_event_with_requires(vec![EventCondition::EventCompletedInCurrentSystem {
                    event_id: "ORIGIN_EVENT".to_string(),
                }]),
                &ctx_at_origin
            ),
            1.0
        );
        assert_eq!(
            event_weight(
                &test_event_with_requires(vec![
                    EventCondition::EventCompletedOutsideCurrentSystem {
                        event_id: "ORIGIN_EVENT".to_string(),
                    }
                ]),
                &ctx_at_origin
            ),
            0.0
        );
        assert_eq!(
            event_weight(
                &test_event_with_requires(vec![
                    EventCondition::EventCompletedOutsideCurrentSystem {
                        event_id: "ORIGIN_EVENT".to_string(),
                    }
                ]),
                &ctx_elsewhere
            ),
            1.0
        );
    }

    #[test]
    fn crown_sunmere_site_selects_its_authored_event() {
        let civ = test_civ();
        let player = test_player();
        let triggers = content::all_triggers();
        let ctx = EventContext {
            civ_state: &civ,
            player_state: &player,
            system_choices: None,
            triggers: &triggers,
            surface: Some(SurfaceType::Continental),
            site_class: Some("crown_sunmere_grove"),
            host_type: Some("planet"),
            current_cluster: 0,
            current_system_id: 7,
            current_system_special_kind: SpecialSystemKind::TheCrown,
        };

        let event = select_game_event(EventPool::PlanetLanding, &ctx, 9)
            .expect("expected Crown Sunmere site event");
        assert_eq!(event.id, "CROWN_SUNMERE_HELIOSTAT_GROVE");
    }
}

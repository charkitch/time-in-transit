//! Content-graph wiring checks: everything content consumes (flags, faction
//! tags, triggers) must have a producer, and everything content produces must
//! have a consumer — or be declared an open hook awaiting payoff content.
//!
//! The open-hook lists below are the authoring backlog, not an exemption:
//! each entry is a story beat that exists but pays off nothing yet. See
//! plans/story-enrichment-loop.md. Entries must be removed once consumed —
//! the tests fail on stale entries.

use std::collections::BTreeSet;

use crate::content::test_support::{all_events, collect_choice_effects, collect_event_conditions};
use crate::content::{all_triggers, story_chains};
use crate::types::{
    EventCondition, FACTION_TAG_CORP_ALLY, FACTION_TAG_GOV_ALLY, FACTION_TAG_REBEL_ALLY,
};

/// Faction tags consumed by the galaxy simulation (stability and faction
/// strength in simulation.rs) rather than by an authored condition.
const SIMULATION_FACTION_TAGS: &[&str] = &[
    FACTION_TAG_CORP_ALLY,
    FACTION_TAG_GOV_ALLY,
    FACTION_TAG_REBEL_ALLY,
];

const OPEN_FLAG_HOOKS: &[&str] = &[
    "accord_collapsed",
    "alien_graveloom_tithe_paid",
    "ashundi_accord",
    "ashundi_distrust",
    "draimar_exposed",
    "hadiq_ally",
    "hadiq_captured",
    "harvest_scar_inlet_built",
    "harvest_scar_relic_preserved",
    "korathi_accord",
    "korathi_distrust",
    "renn_ally",
    "renn_captured",
    "seval_ally",
    "tessaly_captured",
    "tessaly_friend",
    "thennic_peace",
];

const OPEN_FACTION_TAG_HOOKS: &[&str] = &[
    "alien_reliquary_trusted",
    "faction-0",
    "faction-2",
    "faction-3",
];

const OPEN_GALACTIC_FLAG_HOOKS: &[&str] = &[];

struct Wiring {
    produced_flags: BTreeSet<String>,
    consumed_flags: BTreeSet<String>,
    produced_galactic_flags: BTreeSet<String>,
    consumed_galactic_flags: BTreeSet<String>,
    produced_faction_tags: BTreeSet<String>,
    consumed_faction_tags: BTreeSet<String>,
    fired_triggers: BTreeSet<String>,
    consumed_triggers: BTreeSet<String>,
    defined_triggers: BTreeSet<String>,
}

fn wiring() -> Wiring {
    let events = all_events();
    let triggers = all_triggers();
    let effects: Vec<_> = events
        .iter()
        .flat_map(|event| collect_choice_effects(&event.choices))
        .collect();
    let conditions: Vec<&EventCondition> = collect_event_conditions(&events)
        .into_iter()
        .chain(triggers.values().flat_map(|t| t.conditions.iter()))
        .collect();

    Wiring {
        produced_flags: effects
            .iter()
            .flat_map(|e| e.sets_flags.iter().cloned())
            .collect(),
        consumed_flags: conditions
            .iter()
            .filter_map(|c| match c {
                EventCondition::FlagSet(flag)
                | EventCondition::FlagNotSet(flag)
                | EventCondition::AnyFlagSet(flag)
                | EventCondition::AnyFlagNotSet(flag) => Some(flag.clone()),
                _ => None,
            })
            .collect(),
        produced_galactic_flags: effects
            .iter()
            .flat_map(|e| e.sets_galactic_flags.iter().cloned())
            .collect(),
        consumed_galactic_flags: conditions
            .iter()
            .filter_map(|c| match c {
                EventCondition::GalacticFlag(flag) | EventCondition::GalacticFlagNotSet(flag) => {
                    Some(flag.clone())
                }
                _ => None,
            })
            .collect(),
        produced_faction_tags: effects
            .iter()
            .filter_map(|e| e.faction_tag.clone())
            .collect(),
        consumed_faction_tags: conditions
            .iter()
            .filter_map(|c| match c {
                EventCondition::HasFactionTag(tag) => Some(tag.clone()),
                _ => None,
            })
            .collect(),
        fired_triggers: effects
            .iter()
            .flat_map(|e| e.fires.iter().cloned())
            .collect(),
        consumed_triggers: conditions
            .iter()
            .filter_map(|c| match c {
                EventCondition::TriggerFired(id) => Some(id.clone()),
                _ => None,
            })
            .chain(events.iter().filter_map(|e| e.triggered_by.clone()))
            .collect(),
        defined_triggers: triggers.keys().cloned().collect(),
    }
}

/// Flags consumed by story-chain progression in Rust rather than by an
/// authored condition (see content::story_chains and compute_chain_targets).
fn chain_completion_flags() -> BTreeSet<String> {
    story_chains()
        .iter()
        .flat_map(|chain| {
            chain
                .completion_flag
                .into_iter()
                .chain(chain.stages.iter().map(|stage| stage.completion_flag))
        })
        .map(str::to_string)
        .collect()
}

/// Flags consumed by climate::derive_climate overrides, shaped like
/// "p<N>_<suffix>" or "m<N>_<M>_<suffix>" (e.g. "p0_nuclear").
fn is_climate_override_flag(flag: &str) -> bool {
    ["nuclear", "ice_age", "warming", "toxic"]
        .iter()
        .filter_map(|suffix| flag.strip_suffix(suffix))
        .any(is_climate_body_prefix)
}

fn is_climate_body_prefix(prefix: &str) -> bool {
    let numeric = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    let indices = |rest: &str, count: usize| {
        rest.strip_suffix('_').is_some_and(|mid| {
            let parts: Vec<&str> = mid.split('_').collect();
            parts.len() == count && parts.iter().all(|part| numeric(part))
        })
    };
    prefix
        .strip_prefix('p')
        .map(|rest| indices(rest, 1))
        .or_else(|| prefix.strip_prefix('m').map(|rest| indices(rest, 2)))
        .unwrap_or(false)
}

fn assert_no_dangling(label: &str, offenders: Vec<String>) {
    assert!(
        offenders.is_empty(),
        "{label}:\n  {}",
        offenders.join("\n  ")
    );
}

fn missing(candidates: &BTreeSet<String>, covered: impl Fn(&str) -> bool) -> Vec<String> {
    candidates
        .iter()
        .filter(|candidate| !covered(candidate))
        .cloned()
        .collect()
}

fn assert_producers_consumed(
    label: &str,
    produced: &BTreeSet<String>,
    is_consumed: impl Fn(&str) -> bool,
    open_hooks: &[&str],
) {
    let hooks: BTreeSet<&str> = open_hooks.iter().copied().collect();
    assert_no_dangling(
        &format!("{label} produced but never consumed (author the payoff or declare an open hook)"),
        missing(produced, |value| {
            is_consumed(value) || hooks.contains(value)
        }),
    );
    assert_no_dangling(
        &format!("stale open-hook entries for {label} (now consumed, or no longer produced)"),
        hooks
            .iter()
            .filter(|hook| is_consumed(hook) || !produced.contains(**hook))
            .map(ToString::to_string)
            .collect(),
    );
}

#[test]
fn consumed_flags_have_producers() {
    let w = wiring();
    assert_no_dangling(
        "conditions reference flags nothing ever sets",
        missing(&w.consumed_flags, |flag| w.produced_flags.contains(flag)),
    );
    assert_no_dangling(
        "conditions reference galactic flags nothing ever sets",
        missing(&w.consumed_galactic_flags, |flag| {
            w.produced_galactic_flags.contains(flag)
        }),
    );
    assert_no_dangling(
        "conditions reference faction tags nothing ever grants",
        missing(&w.consumed_faction_tags, |tag| {
            w.produced_faction_tags.contains(tag)
        }),
    );
}

#[test]
fn produced_flags_have_consumers() {
    let w = wiring();
    let chain_flags = chain_completion_flags();
    assert_producers_consumed(
        "flags",
        &w.produced_flags,
        |flag| {
            w.consumed_flags.contains(flag)
                || chain_flags.contains(flag)
                || is_climate_override_flag(flag)
        },
        OPEN_FLAG_HOOKS,
    );
    assert_producers_consumed(
        "galactic flags",
        &w.produced_galactic_flags,
        |flag| w.consumed_galactic_flags.contains(flag),
        OPEN_GALACTIC_FLAG_HOOKS,
    );
    assert_producers_consumed(
        "faction tags",
        &w.produced_faction_tags,
        |tag| w.consumed_faction_tags.contains(tag) || SIMULATION_FACTION_TAGS.contains(&tag),
        OPEN_FACTION_TAG_HOOKS,
    );
}

/// Price or trade-ban effects on a stationless planet would mutate a market
/// the player cannot visit, so planet_landing events with them must gate on
/// HasStation (system_generator.rs decides which planets have stations).
/// Reputation alone is exempt — goodwill travels to the system's ports.
#[test]
fn planet_landing_market_effects_require_station() {
    let offenders = crate::content::events_for_pool(crate::events::EventPool::PlanetLanding)
        .iter()
        .filter(|event| {
            let touches_market = collect_choice_effects(&event.choices)
                .iter()
                .any(|e| e.price_modifier != 1.0 || !e.banned_goods.is_empty());
            touches_market && !event.requires.contains(&EventCondition::HasStation)
        })
        .map(|event| event.id.clone())
        .collect();
    assert_no_dangling(
        "planet_landing events touch the market without requiring HasStation",
        offenders,
    );
}

/// True when a choice's effect changes nothing about the world: no flags, no
/// trigger, no economy/faction/crew/upgrade consequence.
fn is_neutral(effect: &crate::types::ChoiceEffect) -> bool {
    effect.trading_reputation == 0
        && effect.banned_goods.is_empty()
        && effect.price_modifier == 1.0
        && effect.faction_tag.is_none()
        && effect.credits_reward == 0
        && effect.fuel_reward == 0.0
        && effect.sets_flags.is_empty()
        && effect.fires.is_empty()
        && effect.sets_galactic_flags.is_empty()
        && effect.galaxy_years_advance == 0
        && effect.grants_upgrade.is_none()
        && effect.recruits_crew.is_none()
}

/// Terminal choices (no next_moment) whose effect is entirely neutral —
/// "EVENT_ID choice_id" paths. Some are intentional flavor beats; the report
/// exists to make each one a deliberate decision rather than an accident.
fn dead_end_choice_paths(choices: &[crate::types::EventChoice], prefix: &str) -> Vec<String> {
    choices
        .iter()
        .flat_map(|choice| {
            let path = format!("{prefix} {}", choice.id);
            match &choice.next_moment {
                Some(moment) => dead_end_choice_paths(&moment.choices, &path),
                None if is_neutral(&choice.effect) => vec![path],
                None => vec![],
            }
        })
        .collect()
}

/// Informational report, not a gate: `cargo test -- --ignored report_dead_end`.
#[test]
#[ignore = "informational report for the story-enrichment backlog"]
fn report_dead_end_choices() {
    let paths: Vec<String> = all_events()
        .iter()
        .flat_map(|event| dead_end_choice_paths(&event.choices, &event.id))
        .collect();
    println!(
        "{} terminal choices with no effect:\n  {}",
        paths.len(),
        paths.join("\n  ")
    );
}

#[test]
fn triggers_are_wired() {
    let w = wiring();
    assert_no_dangling(
        "trigger references without a triggers/ definition",
        missing(&w.consumed_triggers, |id| w.defined_triggers.contains(id)),
    );
    assert_no_dangling(
        "trigger references nothing ever fires",
        missing(&w.consumed_triggers, |id| w.fired_triggers.contains(id)),
    );
    assert_no_dangling(
        "choices fire triggers nothing consumes",
        missing(&w.fired_triggers, |id| w.consumed_triggers.contains(id)),
    );
    assert_no_dangling(
        "defined triggers nothing ever fires",
        missing(&w.defined_triggers, |id| w.fired_triggers.contains(id)),
    );
}

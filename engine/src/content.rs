use std::collections::HashMap;
use std::sync::Mutex;

use crate::events::{EventPool, ALL_EVENT_POOLS};
use crate::types::{GameEvent, SecretBaseType, SystemEntryDialog, Trigger, TriggerFile};

// ─── Story Chain Definitions ─────────────────────────────────────────────────

pub struct StoryChainDef {
    pub chain_id: &'static str,
    pub stages: &'static [ChainStageDef],
    pub min_distance: f64,
    pub required_base_type: Option<SecretBaseType>,
}

pub struct ChainStageDef {
    pub completion_flag: &'static str,
    pub stage_label: &'static str,
}

pub fn story_chains() -> Vec<StoryChainDef> {
    vec![
        StoryChainDef {
            chain_id: "quasar_array",
            stages: &[
                ChainStageDef {
                    completion_flag: "quasar_array_stage1_done",
                    stage_label: "stage2",
                },
                ChainStageDef {
                    completion_flag: "quasar_array_stage2_done",
                    stage_label: "stage3",
                },
                ChainStageDef {
                    completion_flag: "quasar_array_stage3_done",
                    stage_label: "stage4",
                },
            ],
            min_distance: 12.0,
            required_base_type: Some(SecretBaseType::OortCloud),
        },
        StoryChainDef {
            chain_id: "cartographers_wake",
            stages: &[
                ChainStageDef {
                    completion_flag: "cartographers_wake_stage1_done",
                    stage_label: "stage2",
                },
                ChainStageDef {
                    completion_flag: "cartographers_wake_stage2_done",
                    stage_label: "stage3",
                },
                ChainStageDef {
                    completion_flag: "cartographers_wake_stage3_done",
                    stage_label: "stage4",
                },
            ],
            min_distance: 12.0,
            required_base_type: Some(SecretBaseType::Asteroid),
        },
        StoryChainDef {
            chain_id: "burnt_accord",
            stages: &[
                ChainStageDef {
                    completion_flag: "burnt_accord_stage1_done",
                    stage_label: "stage2",
                },
                ChainStageDef {
                    completion_flag: "burnt_accord_stage2_done",
                    stage_label: "stage3",
                },
                ChainStageDef {
                    completion_flag: "burnt_accord_stage3_done",
                    stage_label: "stage4",
                },
                ChainStageDef {
                    completion_flag: "burnt_accord_stage4_done",
                    stage_label: "stage5",
                },
            ],
            min_distance: 14.0,
            required_base_type: Some(SecretBaseType::MaximumSpace),
        },
    ]
}

fn decode_bincode<T: serde::de::DeserializeOwned>(label: &str, raw: &[u8]) -> T {
    let (value, _) = bincode::serde::decode_from_slice(raw, bincode::config::standard())
        .unwrap_or_else(|e| panic!("Failed to decode bincode {}: {}", label, e));
    value
}

fn parse_event(label: &str, raw: &[u8]) -> GameEvent {
    decode_bincode(label, raw)
}

fn parse_trigger_file(label: &str, raw: &[u8]) -> TriggerFile {
    decode_bincode(label, raw)
}

fn parse_dialog(label: &str, raw: &[u8]) -> SystemEntryDialog {
    decode_bincode(label, raw)
}

mod generated_content_registry {
    include!(concat!(env!("OUT_DIR"), "/generated_content_registry.rs"));
}

type EventCache = HashMap<EventPool, Vec<GameEvent>>;

fn load_events(entries: &[(&str, &[u8])]) -> Vec<GameEvent> {
    entries
        .iter()
        .map(|(label, raw)| parse_event(label, raw))
        .collect()
}

fn load_pool_events(pool: EventPool) -> Vec<GameEvent> {
    load_events(generated_content_registry::event_entries_for_pool(pool))
}

static EVENT_CACHE: Mutex<Option<EventCache>> = Mutex::new(None);

fn build_event_pools() -> EventCache {
    ALL_EVENT_POOLS
        .iter()
        .copied()
        .map(|pool| (pool, load_pool_events(pool)))
        .collect()
}

pub fn refresh_event_cache() {
    let pools = build_event_pools();
    let mut cache = EVENT_CACHE
        .lock()
        .unwrap_or_else(|e| panic!("Event cache lock poisoned: {}", e));
    *cache = Some(pools);
}

fn cached_pool_events(pool: EventPool) -> Option<Vec<GameEvent>> {
    let cache = EVENT_CACHE
        .lock()
        .unwrap_or_else(|e| panic!("Event cache lock poisoned: {}", e));
    cache.as_ref().and_then(|pools| pools.get(&pool).cloned())
}

pub(crate) fn events_for_pool(pool: EventPool) -> Vec<GameEvent> {
    cached_pool_events(pool).unwrap_or_else(|| load_pool_events(pool))
}

pub fn all_triggers() -> HashMap<String, Trigger> {
    generated_content_registry::TRIGGER_FILES
        .iter()
        .flat_map(|(label, raw)| parse_trigger_file(label, raw).triggers)
        .map(|trigger| (trigger.id.clone(), trigger))
        .collect()
}

fn dialog_by_label(label: &str) -> SystemEntryDialog {
    generated_content_registry::dialog_entry_by_label(label)
        .map(|(entry_label, raw)| parse_dialog(entry_label, raw))
        .unwrap_or_else(|| panic!("Missing dialog {}", label))
}

pub fn iron_star_arrival_dialog() -> SystemEntryDialog {
    dialog_by_label("dialogs/iron_star_arrival.yaml")
}

pub fn the_crown_arrival_dialog() -> SystemEntryDialog {
    dialog_by_label("dialogs/the_crown_arrival.yaml")
}

#[cfg(test)]
mod tests {
    use serde::de::DeserializeOwned;
    use std::fmt::Debug;

    use super::*;

    fn assert_sorted(entries: &[(&str, &[u8])]) {
        let labels: Vec<&str> = entries.iter().map(|(label, _)| *label).collect();
        let mut sorted = labels.clone();
        sorted.sort();
        assert_eq!(labels, sorted);
    }

    fn find_entry<'a>(entries: &'a [(&'a str, &'a [u8])], label: &str) -> &'a [u8] {
        entries
            .iter()
            .find_map(|(entry_label, raw)| (*entry_label == label).then_some(*raw))
            .unwrap_or_else(|| panic!("Missing generated entry {}", label))
    }

    fn assert_yaml_fixture_matches_generated_bincode<T>(
        label: &str,
        yaml_raw: &str,
        bincode_raw: &[u8],
    ) where
        T: DeserializeOwned + serde::Serialize + PartialEq + Debug,
    {
        let from_yaml: T = serde_yaml::from_str(yaml_raw)
            .unwrap_or_else(|e| panic!("Failed to parse fixture YAML {}: {}", label, e));
        let (from_bincode, _): (T, _) =
            bincode::serde::decode_from_slice(bincode_raw, bincode::config::standard())
                .unwrap_or_else(|e| panic!("Failed to decode generated bincode {}: {}", label, e));
        assert_eq!(from_yaml, from_bincode, "Typed mismatch for {}", label);
    }

    #[test]
    fn generated_event_registry_count_matches_discovered_files() {
        let pools = build_event_pools();
        let total = ALL_EVENT_POOLS
            .iter()
            .map(|pool| pools.get(pool).map_or(0, Vec::len))
            .sum::<usize>();
        assert_eq!(total, generated_content_registry::TOTAL_EVENT_FILE_COUNT);
    }

    #[test]
    fn generated_registry_has_lexical_ordering() {
        assert_sorted(generated_content_registry::LANDING_EVENT_FILES);
        assert_sorted(generated_content_registry::ASTEROID_BASE_EVENT_FILES);
        assert_sorted(generated_content_registry::OORT_CLOUD_EVENT_FILES);
        assert_sorted(generated_content_registry::MAXIMUM_SPACE_EVENT_FILES);
        assert_sorted(generated_content_registry::TRIGGERED_EVENT_FILES);
        assert_sorted(generated_content_registry::SYSTEM_ENTRY_EVENT_FILES);
        assert_sorted(generated_content_registry::PROXIMITY_STAR_EVENT_FILES);
        assert_sorted(generated_content_registry::PROXIMITY_BASE_EVENT_FILES);
        assert_sorted(generated_content_registry::PLANET_LANDING_EVENT_FILES);
        assert_sorted(generated_content_registry::DYSON_LANDING_EVENT_FILES);
        assert_sorted(generated_content_registry::TOPOPOLIS_LANDING_EVENT_FILES);
        assert_sorted(generated_content_registry::TRIGGER_FILES);
        assert_sorted(generated_content_registry::DIALOG_FILES);
    }

    #[test]
    fn generated_event_pool_lookup_matches_per_pool_constants() {
        assert_eq!(
            generated_content_registry::event_entries_for_pool(EventPool::Landing).len(),
            generated_content_registry::LANDING_EVENT_FILES.len()
        );
        assert_eq!(
            generated_content_registry::event_entries_for_pool(EventPool::AsteroidBase).len(),
            generated_content_registry::ASTEROID_BASE_EVENT_FILES.len()
        );
        assert_eq!(
            generated_content_registry::event_entries_for_pool(EventPool::OortCloudBase).len(),
            generated_content_registry::OORT_CLOUD_EVENT_FILES.len()
        );
        assert_eq!(
            generated_content_registry::event_entries_for_pool(EventPool::MaximumSpace).len(),
            generated_content_registry::MAXIMUM_SPACE_EVENT_FILES.len()
        );
        assert_eq!(
            generated_content_registry::event_entries_for_pool(EventPool::Triggered).len(),
            generated_content_registry::TRIGGERED_EVENT_FILES.len()
        );
        assert_eq!(
            generated_content_registry::event_entries_for_pool(EventPool::SystemEntry).len(),
            generated_content_registry::SYSTEM_ENTRY_EVENT_FILES.len()
        );
        assert_eq!(
            generated_content_registry::event_entries_for_pool(EventPool::ProximityStar).len(),
            generated_content_registry::PROXIMITY_STAR_EVENT_FILES.len()
        );
        assert_eq!(
            generated_content_registry::event_entries_for_pool(EventPool::ProximityBase).len(),
            generated_content_registry::PROXIMITY_BASE_EVENT_FILES.len()
        );
        assert_eq!(
            generated_content_registry::event_entries_for_pool(EventPool::PlanetLanding).len(),
            generated_content_registry::PLANET_LANDING_EVENT_FILES.len()
        );
        assert_eq!(
            generated_content_registry::event_entries_for_pool(EventPool::DysonLanding).len(),
            generated_content_registry::DYSON_LANDING_EVENT_FILES.len()
        );
        assert_eq!(
            generated_content_registry::event_entries_for_pool(EventPool::TopopolisLanding).len(),
            generated_content_registry::TOPOPOLIS_LANDING_EVENT_FILES.len()
        );
    }

    #[test]
    fn generated_trigger_and_dialog_registry_payloads_parse() {
        for (label, raw) in generated_content_registry::TRIGGER_FILES {
            let parsed = parse_trigger_file(label, raw);
            assert!(!parsed.triggers.is_empty());
        }
        for (label, raw) in generated_content_registry::DIALOG_FILES {
            let parsed = parse_dialog(label, raw);
            assert!(!parsed.id.is_empty());
            assert!(!parsed.body_lines.is_empty());
        }
    }

    #[test]
    fn representative_event_yaml_matches_generated_bincode() {
        assert_yaml_fixture_matches_generated_bincode::<GameEvent>(
            "landing/acquisition_proposal.yaml",
            include_str!("../content/events/landing/acquisition_proposal.yaml"),
            find_entry(
                generated_content_registry::event_entries_for_pool(EventPool::Landing),
                "landing/acquisition_proposal.yaml",
            ),
        );
        assert_yaml_fixture_matches_generated_bincode::<GameEvent>(
            "triggered/rebel_contact_follows_up.yaml",
            include_str!("../content/events/triggered/rebel_contact_follows_up.yaml"),
            find_entry(
                generated_content_registry::event_entries_for_pool(EventPool::Triggered),
                "triggered/rebel_contact_follows_up.yaml",
            ),
        );
    }

    #[test]
    fn representative_trigger_yaml_matches_generated_bincode() {
        assert_yaml_fixture_matches_generated_bincode::<TriggerFile>(
            "triggers/rebel_chain.yaml",
            include_str!("../content/triggers/rebel_chain.yaml"),
            find_entry(
                generated_content_registry::TRIGGER_FILES,
                "triggers/rebel_chain.yaml",
            ),
        );
    }

    #[test]
    fn representative_dialog_yaml_matches_generated_bincode() {
        assert_yaml_fixture_matches_generated_bincode::<SystemEntryDialog>(
            "dialogs/iron_star_arrival.yaml",
            include_str!("../content/dialogs/iron_star_arrival.yaml"),
            find_entry(
                generated_content_registry::DIALOG_FILES,
                "dialogs/iron_star_arrival.yaml",
            ),
        );
        assert_eq!(
            generated_content_registry::dialog_entry_by_label("dialogs/iron_star_arrival.yaml")
                .map(|(label, _)| label),
            Some("dialogs/iron_star_arrival.yaml")
        );
    }
}

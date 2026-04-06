use std::collections::HashMap;
use std::sync::Mutex;

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
                ChainStageDef { completion_flag: "quasar_array_stage1_done", stage_label: "stage2" },
                ChainStageDef { completion_flag: "quasar_array_stage2_done", stage_label: "stage3" },
                ChainStageDef { completion_flag: "quasar_array_stage3_done", stage_label: "stage4" },
            ],
            min_distance: 12.0,
            required_base_type: Some(SecretBaseType::OortCloud),
        },
        StoryChainDef {
            chain_id: "cartographers_wake",
            stages: &[
                ChainStageDef { completion_flag: "cartographers_wake_stage1_done", stage_label: "stage2" },
                ChainStageDef { completion_flag: "cartographers_wake_stage2_done", stage_label: "stage3" },
                ChainStageDef { completion_flag: "cartographers_wake_stage3_done", stage_label: "stage4" },
            ],
            min_distance: 12.0,
            required_base_type: Some(SecretBaseType::Asteroid),
        },
        StoryChainDef {
            chain_id: "burnt_accord",
            stages: &[
                ChainStageDef { completion_flag: "burnt_accord_stage1_done", stage_label: "stage2" },
                ChainStageDef { completion_flag: "burnt_accord_stage2_done", stage_label: "stage3" },
                ChainStageDef { completion_flag: "burnt_accord_stage3_done", stage_label: "stage4" },
                ChainStageDef { completion_flag: "burnt_accord_stage4_done", stage_label: "stage5" },
            ],
            min_distance: 14.0,
            required_base_type: Some(SecretBaseType::MaximumSpace),
        },
    ]
}

fn parse_event(label: &str, raw: &str) -> GameEvent {
    serde_yaml::from_str::<GameEvent>(raw)
        .unwrap_or_else(|e| panic!("Failed to parse event YAML {}: {}", label, e))
}

fn parse_trigger_file(label: &str, raw: &str) -> TriggerFile {
    serde_yaml::from_str::<TriggerFile>(raw)
        .unwrap_or_else(|e| panic!("Failed to parse trigger YAML {}: {}", label, e))
}

fn parse_dialog(label: &str, raw: &str) -> SystemEntryDialog {
    serde_yaml::from_str::<SystemEntryDialog>(raw)
        .unwrap_or_else(|e| panic!("Failed to parse dialog YAML {}: {}", label, e))
}

#[allow(dead_code)]
mod generated_event_registry {
    include!(concat!(env!("OUT_DIR"), "/generated_event_registry.rs"));
}

fn load_events(entries: &[(&str, &str)]) -> Vec<GameEvent> {
    entries.iter().map(|(label, raw)| parse_event(label, raw)).collect()
}

#[derive(Clone)]
struct EventPools {
    landing: Vec<GameEvent>,
    asteroid_base: Vec<GameEvent>,
    oort_cloud: Vec<GameEvent>,
    maximum_space: Vec<GameEvent>,
    triggered: Vec<GameEvent>,
    system_entry: Vec<GameEvent>,
    proximity_star: Vec<GameEvent>,
    proximity_base: Vec<GameEvent>,
    planet_landing: Vec<GameEvent>,
    dyson_landing: Vec<GameEvent>,
}

static EVENT_CACHE: Mutex<Option<EventPools>> = Mutex::new(None);

fn build_event_pools() -> EventPools {
    EventPools {
        landing: load_events(generated_event_registry::LANDING_EVENT_FILES),
        asteroid_base: load_events(generated_event_registry::ASTEROID_BASE_EVENT_FILES),
        oort_cloud: load_events(generated_event_registry::OORT_CLOUD_EVENT_FILES),
        maximum_space: load_events(generated_event_registry::MAXIMUM_SPACE_EVENT_FILES),
        triggered: load_events(generated_event_registry::TRIGGERED_EVENT_FILES),
        system_entry: load_events(generated_event_registry::SYSTEM_ENTRY_EVENT_FILES),
        proximity_star: load_events(generated_event_registry::PROXIMITY_STAR_EVENT_FILES),
        proximity_base: load_events(generated_event_registry::PROXIMITY_BASE_EVENT_FILES),
        planet_landing: load_events(generated_event_registry::PLANET_LANDING_EVENT_FILES),
        dyson_landing: load_events(generated_event_registry::DYSON_LANDING_EVENT_FILES),
    }
}

pub fn refresh_event_cache() {
    let pools = build_event_pools();
    let mut cache = EVENT_CACHE.lock().unwrap_or_else(|e| panic!("Event cache lock poisoned: {}", e));
    *cache = Some(pools);
}

fn cached_pool_events(getter: impl FnOnce(&EventPools) -> &Vec<GameEvent>) -> Option<Vec<GameEvent>> {
    let cache = EVENT_CACHE.lock().unwrap_or_else(|e| panic!("Event cache lock poisoned: {}", e));
    cache.as_ref().map(|pools| getter(pools).clone())
}

pub fn landing_events() -> Vec<GameEvent> {
    cached_pool_events(|p| &p.landing)
        .unwrap_or_else(|| load_events(generated_event_registry::LANDING_EVENT_FILES))
}

pub fn asteroid_base_events() -> Vec<GameEvent> {
    cached_pool_events(|p| &p.asteroid_base)
        .unwrap_or_else(|| load_events(generated_event_registry::ASTEROID_BASE_EVENT_FILES))
}

pub fn oort_cloud_base_events() -> Vec<GameEvent> {
    cached_pool_events(|p| &p.oort_cloud)
        .unwrap_or_else(|| load_events(generated_event_registry::OORT_CLOUD_EVENT_FILES))
}

pub fn maximum_space_events() -> Vec<GameEvent> {
    cached_pool_events(|p| &p.maximum_space)
        .unwrap_or_else(|| load_events(generated_event_registry::MAXIMUM_SPACE_EVENT_FILES))
}

pub fn triggered_events() -> Vec<GameEvent> {
    cached_pool_events(|p| &p.triggered)
        .unwrap_or_else(|| load_events(generated_event_registry::TRIGGERED_EVENT_FILES))
}

pub fn system_entry_events() -> Vec<GameEvent> {
    cached_pool_events(|p| &p.system_entry)
        .unwrap_or_else(|| load_events(generated_event_registry::SYSTEM_ENTRY_EVENT_FILES))
}

pub fn proximity_star_events() -> Vec<GameEvent> {
    cached_pool_events(|p| &p.proximity_star)
        .unwrap_or_else(|| load_events(generated_event_registry::PROXIMITY_STAR_EVENT_FILES))
}

pub fn proximity_base_events() -> Vec<GameEvent> {
    cached_pool_events(|p| &p.proximity_base)
        .unwrap_or_else(|| load_events(generated_event_registry::PROXIMITY_BASE_EVENT_FILES))
}

pub fn planet_landing_events() -> Vec<GameEvent> {
    cached_pool_events(|p| &p.planet_landing)
        .unwrap_or_else(|| load_events(generated_event_registry::PLANET_LANDING_EVENT_FILES))
}

pub fn dyson_landing_events() -> Vec<GameEvent> {
    cached_pool_events(|p| &p.dyson_landing)
        .unwrap_or_else(|| load_events(generated_event_registry::DYSON_LANDING_EVENT_FILES))
}

pub fn all_triggers() -> HashMap<String, Trigger> {
    let mut out = HashMap::new();
    for trigger_file in [
        parse_trigger_file("triggers/rebel_chain.yaml", include_str!("../content/triggers/rebel_chain.yaml")),
    ] {
        for trigger in trigger_file.triggers {
            out.insert(trigger.id.clone(), trigger);
        }
    }
    out
}

pub fn iron_star_arrival_dialog() -> SystemEntryDialog {
    parse_dialog(
        "dialogs/iron_star_arrival.yaml",
        include_str!("../content/dialogs/iron_star_arrival.yaml"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_event_registry_count_matches_discovered_files() {
        let pools = build_event_pools();
        let total = pools.landing.len()
            + pools.asteroid_base.len()
            + pools.oort_cloud.len()
            + pools.maximum_space.len()
            + pools.triggered.len()
            + pools.system_entry.len()
            + pools.proximity_star.len()
            + pools.proximity_base.len()
            + pools.planet_landing.len()
            + pools.dyson_landing.len();
        assert_eq!(total, generated_event_registry::TOTAL_EVENT_FILE_COUNT);
    }

    #[test]
    fn generated_registry_has_lexical_ordering() {
        fn assert_sorted(entries: &[(&str, &str)]) {
            let labels: Vec<&str> = entries.iter().map(|(label, _)| *label).collect();
            let mut sorted = labels.clone();
            sorted.sort();
            assert_eq!(labels, sorted);
        }

        assert_sorted(generated_event_registry::LANDING_EVENT_FILES);
        assert_sorted(generated_event_registry::ASTEROID_BASE_EVENT_FILES);
        assert_sorted(generated_event_registry::OORT_CLOUD_EVENT_FILES);
        assert_sorted(generated_event_registry::MAXIMUM_SPACE_EVENT_FILES);
        assert_sorted(generated_event_registry::TRIGGERED_EVENT_FILES);
        assert_sorted(generated_event_registry::SYSTEM_ENTRY_EVENT_FILES);
        assert_sorted(generated_event_registry::PROXIMITY_STAR_EVENT_FILES);
        assert_sorted(generated_event_registry::PROXIMITY_BASE_EVENT_FILES);
        assert_sorted(generated_event_registry::PLANET_LANDING_EVENT_FILES);
        assert_sorted(generated_event_registry::DYSON_LANDING_EVENT_FILES);
    }
}

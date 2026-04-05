use std::collections::HashMap;

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

fn load_events(entries: &[(&str, &str)]) -> Vec<GameEvent> {
    entries.iter().map(|(label, raw)| parse_event(label, raw)).collect()
}

pub fn landing_events() -> Vec<GameEvent> {
    load_events(&[
        ("landing/refugee_fleet.yaml", include_str!("../content/events/landing/refugee_fleet.yaml")),
        ("landing/acquisition_proposal.yaml", include_str!("../content/events/landing/acquisition_proposal.yaml")),
        ("landing/docking_inspection.yaml", include_str!("../content/events/landing/docking_inspection.yaml")),
        ("landing/the_archivist.yaml", include_str!("../content/events/landing/the_archivist.yaml")),
        ("landing/dead_drop_message.yaml", include_str!("../content/events/landing/dead_drop_message.yaml")),
        ("landing/unregulated_market.yaml", include_str!("../content/events/landing/unregulated_market.yaml")),
        ("landing/museum_of_ancients.yaml", include_str!("../content/events/landing/museum_of_ancients.yaml")),
        ("landing/quarantine_advisory.yaml", include_str!("../content/events/landing/quarantine_advisory.yaml")),
        ("landing/sector_toll.yaml", include_str!("../content/events/landing/sector_toll.yaml")),
        ("landing/the_lineage.yaml", include_str!("../content/events/landing/the_lineage.yaml")),
    ])
}

pub fn asteroid_base_events() -> Vec<GameEvent> {
    load_events(&[
        ("asteroid_base/smuggler_haven.yaml", include_str!("../content/events/asteroid_base/smuggler_haven.yaml")),
        ("asteroid_base/the_chop_shop.yaml", include_str!("../content/events/asteroid_base/the_chop_shop.yaml")),
        ("asteroid_base/ghost_signal.yaml", include_str!("../content/events/asteroid_base/ghost_signal.yaml")),
        ("asteroid_base/the_broker.yaml", include_str!("../content/events/asteroid_base/the_broker.yaml")),
        ("asteroid_base/miners_dispute.yaml", include_str!("../content/events/asteroid_base/miners_dispute.yaml")),
        ("asteroid_base/cartographers_wake_intro.yaml", include_str!("../content/events/asteroid_base/cartographers_wake_intro.yaml")),
        ("asteroid_base/cartographers_wake_collector.yaml", include_str!("../content/events/asteroid_base/cartographers_wake_collector.yaml")),
        ("asteroid_base/cartographers_wake_workshop.yaml", include_str!("../content/events/asteroid_base/cartographers_wake_workshop.yaml")),
        ("asteroid_base/cartographers_wake_finale.yaml", include_str!("../content/events/asteroid_base/cartographers_wake_finale.yaml")),
    ])
}

pub fn oort_cloud_base_events() -> Vec<GameEvent> {
    load_events(&[
        ("oort_cloud/array_oort_briefing.yaml", include_str!("../content/events/oort_cloud/array_oort_briefing.yaml")),
        ("oort_cloud/array_ice_node.yaml", include_str!("../content/events/oort_cloud/array_ice_node.yaml")),
        ("oort_cloud/array_oort_spine_repairs.yaml", include_str!("../content/events/oort_cloud/array_oort_spine_repairs.yaml")),
        ("oort_cloud/array_oort_final_manifest.yaml", include_str!("../content/events/oort_cloud/array_oort_final_manifest.yaml")),
        ("oort_cloud/the_listener.yaml", include_str!("../content/events/oort_cloud/the_listener.yaml")),
        ("oort_cloud/ice_monks.yaml", include_str!("../content/events/oort_cloud/ice_monks.yaml")),
        ("oort_cloud/frozen_derelict.yaml", include_str!("../content/events/oort_cloud/frozen_derelict.yaml")),
    ])
}

pub fn maximum_space_events() -> Vec<GameEvent> {
    load_events(&[
        ("maximum_space/the_void_station.yaml", include_str!("../content/events/maximum_space/the_void_station.yaml")),
        ("maximum_space/edge_signal.yaml", include_str!("../content/events/maximum_space/edge_signal.yaml")),
        ("maximum_space/the_last_broadcast.yaml", include_str!("../content/events/maximum_space/the_last_broadcast.yaml")),
    ])
}

pub fn triggered_events() -> Vec<GameEvent> {
    load_events(&[
        ("triggered/rebel_contact_follows_up.yaml", include_str!("../content/events/triggered/rebel_contact_follows_up.yaml")),
    ])
}

pub fn system_entry_events() -> Vec<GameEvent> {
    load_events(&[
        ("system_entry/age_worn_transponder.yaml", include_str!("../content/events/system_entry/age_worn_transponder.yaml")),
    ])
}

pub fn proximity_star_events() -> Vec<GameEvent> {
    load_events(&[
        ("proximity_star/coronal_whisper.yaml", include_str!("../content/events/proximity_star/coronal_whisper.yaml")),
    ])
}

pub fn proximity_base_events() -> Vec<GameEvent> {
    load_events(&[
        ("proximity_base/buoy_tapper.yaml", include_str!("../content/events/proximity_base/buoy_tapper.yaml")),
    ])
}

pub fn planet_landing_events() -> Vec<GameEvent> {
    load_events(&[
        ("planet_landing/dust_choir.yaml", include_str!("../content/events/planet_landing/dust_choir.yaml")),
    ])
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

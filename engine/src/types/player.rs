use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use super::{CrewMember, EffectiveShipStats, GoodName, ShipUpgrade};

// ─── Player State ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedEvent {
    pub system_id: u32,
    pub galaxy_year: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerHistory {
    #[serde(default)]
    pub completed_events: HashMap<String, CompletedEvent>,
    #[serde(default)]
    pub galactic_flags: HashSet<String>,
}

// These tags must stay in sync with factionTag values in engine/content/events/
pub const FACTION_TAG_REBEL_ALLY: &str = "rebel_ally";
pub const FACTION_TAG_GOV_ALLY: &str = "gov_ally";
pub const FACTION_TAG_CORP_ALLY: &str = "corp_ally";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemChoices {
    pub trading_reputation: i32,
    pub banned_goods: Vec<GoodName>,
    pub price_modifier: f64,
    pub faction_tag: Option<String>,
    pub completed_event_ids: Vec<String>,
    #[serde(default)]
    pub flags: HashSet<String>,
    #[serde(default)]
    pub fired_triggers: HashSet<String>,
}

impl Default for SystemChoices {
    fn default() -> Self {
        Self {
            trading_reputation: 0,
            banned_goods: vec![],
            price_modifier: 1.0,
            faction_tag: None,
            completed_event_ids: vec![],
            flags: HashSet::new(),
            fired_triggers: HashSet::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub credits: i32,
    pub cargo: HashMap<GoodName, u32>,
    pub cargo_cost_basis: HashMap<GoodName, f64>,
    pub fuel: f64,
    pub shields: f64,
    pub current_system_id: u32,
    pub visited_systems: Vec<u32>,
    pub galaxy_year: u32,
    pub player_choices: HashMap<u32, SystemChoices>,
    pub last_visit_year: HashMap<u32, u32>,
    pub known_factions: Vec<String>,
    pub faction_memory: HashMap<u32, FactionMemoryEntry>,
    #[serde(default)]
    pub seen_system_dialog_ids: Vec<String>,
    #[serde(default)]
    pub chain_targets: Vec<ChainTarget>,
    #[serde(default)]
    pub player_history: PlayerHistory,
    #[serde(default)]
    pub heat: f64,
    pub ship_upgrades: Vec<ShipUpgrade>,
    pub crew: Vec<CrewMember>,
}

impl PlayerState {
    pub(crate) fn effective_stats(&self) -> EffectiveShipStats {
        EffectiveShipStats::compute(
            self.ship_upgrades
                .iter()
                .map(|u| u.bonuses())
                .chain(self.crew.iter().map(|c| c.bonuses())),
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactionMemoryEntry {
    pub faction_id: String,
    pub contesting_faction_id: Option<String>,
    pub galaxy_year: u32,
}

// ─── Story Chains ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainTarget {
    pub chain_id: String,
    pub target_system_id: u32,
    pub stage: String,
}

// ─── Events / Content Types (defined in content-types subcrate) ─────────────

pub use content_types::{
    ChoiceEffect, EventChoice, EventCondition, GameEvent, SystemEntryDialog, Trigger, TriggerFile,
};

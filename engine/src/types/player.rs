use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use super::{GoodName, PoliticalType, SurfaceType};

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

// ─── Events ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChoiceEffect {
    #[serde(default)]
    pub trading_reputation: i32,
    #[serde(default)]
    pub banned_goods: Vec<GoodName>,
    #[serde(default = "default_price_mod")]
    pub price_modifier: f64,
    #[serde(default)]
    pub faction_tag: Option<String>,
    #[serde(default)]
    pub credits_reward: i32,
    #[serde(default)]
    pub fuel_reward: f64,
    #[serde(default)]
    pub sets_flags: Vec<String>,
    #[serde(default)]
    pub fires: Vec<String>,
    #[serde(default)]
    pub sets_galactic_flags: Vec<String>,
}

fn default_price_mod() -> f64 { 1.0 }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventChoice {
    pub id: String,
    pub label: String,
    pub description: String,
    pub effect: ChoiceEffect,
    #[serde(default)]
    pub requires_min_tech: Option<i32>,
    #[serde(default)]
    pub requires_credits: Option<i32>,
    #[serde(default)]
    pub next_moment: Option<Box<EventMoment>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventMoment {
    pub narrative_lines: Vec<String>,
    pub choices: Vec<EventChoice>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum EventCondition {
    PoliticsIs(Vec<PoliticalType>),
    MinGalaxyYear(u32),
    HasFactionTag(String),
    HasCargo(String),
    VisitedSystem(String),
    MinCluster(u32),
    MinReputation(i32),
    FlagSet(String),
    FlagNotSet(String),
    AnyFlagSet(String),
    AnyFlagNotSet(String),
    SurfaceIs(Vec<SurfaceType>),
    SiteClassIs(Vec<String>),
    HostTypeIs(Vec<String>),
    TriggerFired(String),
    ChainTargetHere(String),
    GalacticFlag(String),
    GalacticFlagNotSet(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Repeatability {
    Unique,
    Rare,
    Uncommon,
    Common,
}

impl Default for Repeatability {
    fn default() -> Self { Repeatability::Unique }
}

impl Repeatability {
    pub fn repeat_weight(self) -> f64 {
        match self {
            Repeatability::Unique => 0.0,
            Repeatability::Rare => 0.25,
            Repeatability::Uncommon => 0.5,
            Repeatability::Common => 1.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameEvent {
    pub id: String,
    pub title: String,
    pub narrative_lines: Vec<String>,
    pub choices: Vec<EventChoice>,
    #[serde(default)]
    pub requires: Vec<EventCondition>,
    #[serde(default)]
    pub triggered_by: Option<String>,
    #[serde(default)]
    pub triggered_only: bool,
    #[serde(default)]
    pub repeatability: Repeatability,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trigger {
    pub id: String,
    pub conditions: Vec<EventCondition>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerFile {
    pub triggers: Vec<Trigger>,
}

// ─── System Entry Dialog ─────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemEntryDialog {
    pub id: String,
    pub title: String,
    pub body_lines: Vec<String>,
    pub show_once: bool,
}

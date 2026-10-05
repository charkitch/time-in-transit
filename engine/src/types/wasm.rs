use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::*;

// ─── WASM Boundary Types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterSystemSummary {
    pub id: u32,
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub star_type: StarType,
    pub special_kind: SpecialSystemKind,
    pub politics: PoliticalType,
    pub economy: EconomyType,
    pub controlling_faction_id: String,
    pub contesting_faction_id: Option<String>,
    pub is_contested: bool,
    pub tech_level: i32,
    pub population: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPayload {
    pub system: SolarSystemData,
    pub civ_state: CivilizationState,
    pub faction_state: SystemFactionState,
    pub market: Vec<MarketEntry>,
    pub game_event: Option<GameEvent>,
    pub system_entry_lines: Vec<String>,
    pub system_entry_dialog: Option<SystemEntryDialog>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpLogEntry {
    pub from_system_id: u32,
    pub to_system_id: u32,
    pub years_elapsed: u32,
    pub ship_years_elapsed: f64,
    pub galaxy_year_after: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpResult {
    pub system_payload: SystemPayload,
    pub cluster_summary: Vec<ClusterSystemSummary>,
    pub years_elapsed: u32,
    pub ship_years_elapsed: f64,
    pub new_galaxy_year: u32,
    pub galaxy_sim_state: Vec<SystemSimState>,
    pub chain_targets: Vec<ChainTarget>,
    pub jump_log_entry: JumpLogEntry,
    pub player_state: PlayerState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitResult {
    pub system_payload: SystemPayload,
    pub cluster_summary: Vec<ClusterSystemSummary>,
    pub cluster: Vec<StarSystemData>,
    pub galaxy_sim_state: Vec<SystemSimState>,
    pub chain_targets: Vec<ChainTarget>,
}

// ─── Galaxy Simulation State ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalaxyState {
    pub galaxy_year: u32,
    pub systems: Vec<SystemSimState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSimState {
    pub system_id: u32,
    pub stability: f64,  // 0.0 = chaos, 1.0 = stable
    pub prosperity: f64, // 0.0 = collapse, 1.0 = boom
    pub faction_strength: HashMap<String, f64>,
    pub recent_events: Vec<String>,
}

// ─── Flight Tick Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum HazardType {
    #[default]
    None,
    Overheat,
    StarCollision,
    PlanetCollision,
    MoonCollision,
    AsteroidCollision,
    DysonShellCollision,
    TopopolisCollision,
    MicroquasarJet,
    PulsarBeam,
    BlackHole,
    TidalDisruption,
    BattleZone,
    XRayStream,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CargoHarvest {
    pub good: GoodName,
    pub qty: u32,
}

/// One tick of damage, aggregated from every source by the client's damage ledger.
/// Rates are per second; bursts are flat amounts.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipDamage {
    pub shield_rate: f64,
    pub shield_burst: f64,
    pub heat_rate: f64,
    pub heat_burst: f64,
    /// Heat that only lands when there are no shields left to absorb the hit.
    pub unshielded_heat_burst: f64,
    /// Source blamed for this tick's damage; `None` when nothing is hurting the ship.
    pub cause: HazardType,
    /// Whether running out of shields this tick destroys the ship.
    pub lethal_on_depletion: bool,
    pub destroyed_by: Option<HazardType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightTickContext {
    pub dt: f64,
    pub fuel_rate: f64,
    /// Non-damage thermal load (fuel scooping).
    pub heat_rate: f64,
    pub cooling_active: bool,
    pub damage: ShipDamage,
    pub is_dead: bool,
    #[serde(default)]
    pub cargo_harvests: Vec<CargoHarvest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightTickResult {
    pub fuel: f64,
    pub heat: f64,
    pub shields: f64,
    pub cargo: HashMap<GoodName, u32>,
    pub dead: bool,
    pub death_cause: Option<HazardType>,
    pub cargo_full: bool,
}

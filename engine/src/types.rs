use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Constants ──────────────────────────────────────────────────────────────

pub const CLUSTER_SEED: u32 = 0xDEADBEEF;
pub const CLUSTER_SIZE: usize = 30;
pub const GALAXY_YEAR_START: u32 = 3200;
pub const ERA_LENGTH: u32 = 250;
pub const STARTING_CREDITS: i32 = 1000;
pub const STARTING_FUEL: f64 = 7.0;

// ─── Enums ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GoodName {
    Food,
    Textiles,
    Radioactives,
    Liquor,
    Luxuries,
    Narcotics,
    Computers,
}

impl GoodName {
    pub const ALL: &'static [GoodName] = &[
        GoodName::Food,
        GoodName::Textiles,
        GoodName::Radioactives,
        GoodName::Liquor,
        GoodName::Luxuries,
        GoodName::Narcotics,
        GoodName::Computers,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EconomyType {
    Agricultural,
    Industrial,
    HighTech,
    RichIndustrial,
    PoorAgricultural,
    Refinery,
}

impl EconomyType {
    pub const ALL: &'static [EconomyType] = &[
        EconomyType::Agricultural,
        EconomyType::Industrial,
        EconomyType::HighTech,
        EconomyType::RichIndustrial,
        EconomyType::PoorAgricultural,
        EconomyType::Refinery,
    ];

}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PoliticalType {
    Democracy,
    LibertineDemocracy,
    CorporateState,
    MilitaryDictatorship,
    StagnantMilitancy,
    Theocracy,
    Anarchist,
    Technocracy,
    Feudal,
}

impl PoliticalType {
    pub const ALL: &'static [PoliticalType] = &[
        PoliticalType::Democracy,
        PoliticalType::LibertineDemocracy,
        PoliticalType::CorporateState,
        PoliticalType::MilitaryDictatorship,
        PoliticalType::StagnantMilitancy,
        PoliticalType::Theocracy,
        PoliticalType::Anarchist,
        PoliticalType::Technocracy,
        PoliticalType::Feudal,
    ];

}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum StarType {
    G,
    K,
    M,
    F,
    A,
}

impl StarType {
    pub const ALL: &'static [StarType] = &[StarType::G, StarType::K, StarType::M, StarType::F, StarType::A];
    pub const WEIGHTS: &'static [f64] = &[0.35, 0.25, 0.20, 0.12, 0.08];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SurfaceType {
    Continental,
    Ocean,
    Marsh,
    Venus,
    Barren,
    Desert,
    Ice,
    Volcanic,
    ForestMoon,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GasGiantType {
    Jovian,
    Saturnian,
    Neptunian,
    Inferno,
    Chromatic,
}

impl GasGiantType {
    pub const ALL: &'static [GasGiantType] = &[
        GasGiantType::Jovian,
        GasGiantType::Saturnian,
        GasGiantType::Neptunian,
        GasGiantType::Inferno,
        GasGiantType::Chromatic,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SecretBaseType {
    Asteroid,
    OortCloud,
    MaximumSpace,
}

// ─── Data Structures ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StarSystemData {
    pub id: u32,
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub star_type: StarType,
    pub economy: EconomyType,
    pub tech_level: i32,
    pub population: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoonData {
    pub id: String,
    pub surface_type: SurfaceType,
    pub radius: f64,
    pub orbit_radius: f64,
    pub orbit_speed: f64,
    pub orbit_phase: f64,
    pub color: u32,
    pub has_clouds: bool,
    pub cloud_density: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanetData {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub planet_type: PlanetType,
    pub surface_type: SurfaceType,
    pub gas_type: GasGiantType,
    pub radius: f64,
    pub orbit_radius: f64,
    pub orbit_speed: f64,
    pub orbit_phase: f64,
    pub color: u32,
    pub has_rings: bool,
    pub ring_count: u32,
    pub ring_inclination: f64,
    pub has_clouds: bool,
    pub cloud_density: f64,
    pub great_spot: bool,
    pub great_spot_lat: f64,
    pub great_spot_size: f64,
    pub moons: Vec<MoonData>,
    pub has_station: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlanetType {
    #[serde(rename = "rocky")]
    Rocky,
    #[serde(rename = "gas_giant")]
    GasGiant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AsteroidBeltData {
    pub inner_radius: f64,
    pub outer_radius: f64,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretBaseData {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub base_type: SecretBaseType,
    pub orbit_radius: f64,
    pub orbit_phase: f64,
    pub orbit_speed: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolarSystemData {
    pub star_type: StarType,
    pub star_radius: f64,
    pub planets: Vec<PlanetData>,
    pub asteroid_belt: Option<AsteroidBeltData>,
    pub main_station_planet_id: String,
    pub secret_bases: Vec<SecretBaseData>,
}

// ─── Civilization State ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CivilizationState {
    pub system_id: u32,
    pub galaxy_year: u32,
    pub era: u32,
    pub politics: PoliticalType,
    pub economy: EconomyType,
    pub banned_goods: Vec<GoodName>,
    pub price_modifier: f64,
    pub luxury_mod: f64,
    pub anarchy_variance: bool,
    pub tech_bonus: Vec<GoodName>,
}

// ─── Faction ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Faction {
    pub id: String,
    pub name: String,
    pub color: u32,
    pub political_affinity: Vec<PoliticalType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemFactionState {
    pub controlling_faction_id: String,
    pub contesting_faction_id: Option<String>,
    pub is_contested: bool,
}

// ─── Trading ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketEntry {
    pub good: GoodName,
    pub buy_price: i32,
    pub sell_price: i32,
    pub stock: i32,
    pub banned: bool,
}

// ─── Player / Choices ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemChoices {
    pub trading_reputation: i32,
    pub banned_goods: Vec<GoodName>,
    pub price_modifier: f64,
    pub faction_tag: Option<String>,
    pub completed_event_ids: Vec<String>,
}

impl Default for SystemChoices {
    fn default() -> Self {
        Self {
            trading_reputation: 0,
            banned_goods: vec![],
            price_modifier: 1.0,
            faction_tag: None,
            completed_event_ids: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactionMemoryEntry {
    pub faction_id: String,
    pub contesting_faction_id: Option<String>,
    pub galaxy_year: u32,
}

// ─── Events ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

fn default_price_mod() -> f64 { 1.0 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventChoice {
    pub id: String,
    pub label: String,
    pub description: String,
    pub effect: ChoiceEffect,
    pub requires_min_tech: Option<i32>,
    pub requires_credits: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LandingEvent {
    pub id: String,
    pub title: String,
    pub narrative_lines: [String; 3],
    pub choices: Vec<EventChoice>,
    pub applicable_politics: Option<Vec<PoliticalType>>,
    pub min_galaxy_year: Option<u32>,
    pub required_faction_tag: Option<String>,
}

// ─── WASM Boundary Types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterSystemSummary {
    pub id: u32,
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub star_type: StarType,
    pub politics: PoliticalType,
    pub economy: EconomyType,
    pub controlling_faction_id: String,
    pub contesting_faction_id: Option<String>,
    pub is_contested: bool,
    pub tech_level: i32,
    pub population: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemPayload {
    pub system: SolarSystemData,
    pub civ_state: CivilizationState,
    pub faction_state: SystemFactionState,
    pub market: Vec<MarketEntry>,
    pub landing_event: Option<LandingEvent>,
    pub system_entry_lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JumpResult {
    pub system_payload: SystemPayload,
    pub cluster_summary: Vec<ClusterSystemSummary>,
    pub years_elapsed: u32,
    pub new_galaxy_year: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitResult {
    pub system_payload: SystemPayload,
    pub cluster_summary: Vec<ClusterSystemSummary>,
    pub cluster: Vec<StarSystemData>,
}

// ─── Galaxy Simulation State ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalaxyState {
    pub galaxy_year: u32,
    pub systems: Vec<SystemSimState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSimState {
    pub system_id: u32,
    pub stability: f64,        // 0.0 = chaos, 1.0 = stable
    pub prosperity: f64,       // 0.0 = collapse, 1.0 = boom
    pub faction_strength: HashMap<String, f64>,
    pub recent_events: Vec<String>,
}

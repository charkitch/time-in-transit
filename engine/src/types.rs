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
    #[serde(rename = "WD")]
    WD,
    #[serde(rename = "NS")]
    NS,
    #[serde(rename = "PU")]
    PU,
    #[serde(rename = "XB")]
    XB,
    #[serde(rename = "MG")]
    MG,
    #[serde(rename = "BH")]
    BH,
    #[serde(rename = "XBB")]
    XBB,
    #[serde(rename = "SGR")]
    SGR,
    #[serde(rename = "IRON")]
    Iron,
}

impl StarType {
    pub const ALL: &'static [StarType] = &[
        StarType::G, StarType::K, StarType::M, StarType::F, StarType::A,
        StarType::WD, StarType::NS, StarType::PU, StarType::XB,
        StarType::MG, StarType::BH, StarType::XBB, StarType::SGR,
        // StarType::Iron is hand-placed, not randomly generated
    ];
    pub const WEIGHTS: &'static [f64] = &[
        0.16, 0.13, 0.11, 0.07, 0.05,
        0.08, 0.07, 0.06, 0.05, 0.06,
        0.05, 0.08, 0.13,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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
    Mountain,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DysonBiomeProfile {
    Continental,
    Mixed,
    Desert,
    Arctic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GasGiantType {
    Jovian,
    Saturnian,
    Neptunian,
    Inferno,
    Chromatic,
    Helium,
}

impl GasGiantType {
    pub const ALL: &'static [GasGiantType] = &[
        GasGiantType::Jovian,
        GasGiantType::Saturnian,
        GasGiantType::Neptunian,
        GasGiantType::Inferno,
        GasGiantType::Chromatic,
        // GasGiantType::Helium is reserved for the Iron star system profile
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecretBaseType {
    Asteroid,
    OortCloud,
    MaximumSpace,
}

// ─── Data Structures ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct AsteroidBeltData {
    pub inner_radius: f64,
    pub outer_radius: f64,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretBaseData {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub base_type: SecretBaseType,
    pub orbit_radius: f64,
    pub orbit_phase: f64,
    pub orbit_speed: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DysonInteractionMode {
    TargetableOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DysonWeatherBandData {
    pub start_angle: f64,
    pub end_angle: f64,
    pub has_clouds: bool,
    pub cloud_density: f64,
    pub has_lightning: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DysonShellSegmentData {
    pub id: String,
    pub name: String,
    pub band_index: u32,
    pub segment_index: u32,
    pub orbit_radius: f64,
    pub orbit_speed: f64,
    pub orbit_phase: f64,
    pub orbit_inclination: f64,
    pub orbit_node: f64,
    pub curve_radius: f64,
    pub arc_width: f64,
    pub arc_height: f64,
    pub color: u32,
    pub star_phase: f64,
    pub interaction_mode: DysonInteractionMode,
    pub weather_bands: Vec<DysonWeatherBandData>,
    pub biome_profile: DysonBiomeProfile,
    pub biome_seed: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryCompanionData {
    pub star_type: StarType,
    pub radius: f64,
    pub color: u32,
    pub orbit_radius: f64,
    pub orbit_speed: f64,
    pub orbit_phase: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolarSystemData {
    pub star_type: StarType,
    pub star_radius: f64,
    pub companion: Option<BinaryCompanionData>,
    pub planets: Vec<PlanetData>,
    pub dyson_shells: Vec<DysonShellSegmentData>,
    pub asteroid_belt: Option<AsteroidBeltData>,
    pub main_station_planet_id: String,
    pub secret_bases: Vec<SecretBaseData>,
}

// ─── Civilization State ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct Faction {
    pub id: String,
    pub name: String,
    pub color: u32,
    pub political_affinity: Vec<PoliticalType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFactionState {
    pub controlling_faction_id: String,
    pub contesting_faction_id: Option<String>,
    pub is_contested: bool,
}

// ─── Trading ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketEntry {
    pub good: GoodName,
    pub buy_price: i32,
    pub sell_price: i32,
    pub stock: i32,
    pub banned: bool,
}

// ─── Player / Choices ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactionMemoryEntry {
    pub faction_id: String,
    pub contesting_faction_id: Option<String>,
    pub galaxy_year: u32,
}

// ─── Events ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

fn default_price_mod() -> f64 { 1.0 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventChoice {
    pub id: String,
    pub label: String,
    pub description: String,
    pub effect: ChoiceEffect,
    pub requires_min_tech: Option<i32>,
    pub requires_credits: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LandingEvent {
    pub id: String,
    pub title: String,
    pub narrative_lines: [String; 3],
    pub choices: Vec<EventChoice>,
    pub applicable_politics: Option<Vec<PoliticalType>>,
    pub min_galaxy_year: Option<u32>,
    pub required_faction_tag: Option<String>,
}

// ─── System Entry Dialog ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemEntryDialog {
    pub id: String,
    pub title: String,
    pub body_lines: Vec<String>,
    pub show_once: bool,
}

// ─── WASM Boundary Types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct SystemPayload {
    pub system: SolarSystemData,
    pub civ_state: CivilizationState,
    pub faction_state: SystemFactionState,
    pub market: Vec<MarketEntry>,
    pub landing_event: Option<LandingEvent>,
    pub system_entry_lines: Vec<String>,
    pub system_entry_dialog: Option<SystemEntryDialog>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpResult {
    pub system_payload: SystemPayload,
    pub cluster_summary: Vec<ClusterSystemSummary>,
    pub years_elapsed: u32,
    pub new_galaxy_year: u32,
    pub galaxy_sim_state: Vec<SystemSimState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitResult {
    pub system_payload: SystemPayload,
    pub cluster_summary: Vec<ClusterSystemSummary>,
    pub cluster: Vec<StarSystemData>,
    pub galaxy_sim_state: Vec<SystemSimState>,
}

// ─── Galaxy Simulation State ────────────────────────────────────────────────

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
    pub stability: f64,        // 0.0 = chaos, 1.0 = stable
    pub prosperity: f64,       // 0.0 = collapse, 1.0 = boom
    pub faction_strength: HashMap<String, f64>,
    pub recent_events: Vec<String>,
}

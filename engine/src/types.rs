use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// ─── Constants ──────────────────────────────────────────────────────────────

pub const CLUSTER_SEED: u32 = 0xDEADBEEF;
pub const CLUSTER_SIZE: usize = 30;
pub const GALAXY_YEAR_START: u32 = 3200;
pub const ERA_LENGTH: u32 = 250;
pub const STARTING_CREDITS: i32 = 1000;
pub const STARTING_FUEL: f64 = 7.0;
pub const MAX_CARGO: u32 = 20;
pub const HEAT_MAX: f64 = 100.0;
pub const COOLING_RATE: f64 = 10.0;
pub const OVERHEAT_SHIELD_DMG: f64 = 20.0;
pub const SHIELD_REGEN_RATE: f64 = 5.0;
pub const REGEN_HEAT_CEIL: f64 = 50.0;

// ─── Enums ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GoodName {
    #[serde(rename = "Starwind Rations")]
    StarwindRations,
    #[serde(rename = "Hullskin Lace")]
    HullskinLace,
    #[serde(rename = "Burial Sunstone")]
    BurialSunstone,
    #[serde(rename = "Rain Choir Spools")]
    RainChoirSpools,
    #[serde(rename = "Reactor Salt")]
    ReactorSalt,
    #[serde(rename = "Pilgrim Maps")]
    PilgrimMaps,
    #[serde(rename = "Witness Ink")]
    WitnessInk,
    #[serde(rename = "Gravitic Bone")]
    GraviticBone,
    #[serde(rename = "Embassy Masks")]
    EmbassyMasks,
    #[serde(rename = "Dream Resin")]
    DreamResin,
    #[serde(rename = "Silence Vials")]
    SilenceVials,
    #[serde(rename = "Jurisdiction Seals")]
    JurisdictionSeals,
    #[serde(rename = "Debt Petals")]
    DebtPetals,
    #[serde(rename = "Memory Caskets")]
    MemoryCaskets,
    #[serde(rename = "Oath Filaments")]
    OathFilaments,
    #[serde(rename = "Quasar Glass")]
    QuasarGlass,
    #[serde(rename = "Weather Keys")]
    WeatherKeys,
    #[serde(rename = "Ancestral Backups")]
    AncestralBackups,
    #[serde(rename = "Surrender Codes")]
    SurrenderCodes,
    #[serde(rename = "Impossible Seeds")]
    ImpossibleSeeds,
    #[serde(rename = "Relativistic Ash")]
    RelativisticAsh,
    #[serde(rename = "Pulsar Silk")]
    PulsarSilk,
    #[serde(rename = "Combat Intelligence")]
    CombatIntelligence,
}

impl GoodName {
    pub const ALL: &'static [GoodName] = &[
        GoodName::StarwindRations,
        GoodName::HullskinLace,
        GoodName::BurialSunstone,
        GoodName::RainChoirSpools,
        GoodName::ReactorSalt,
        GoodName::PilgrimMaps,
        GoodName::WitnessInk,
        GoodName::GraviticBone,
        GoodName::EmbassyMasks,
        GoodName::DreamResin,
        GoodName::SilenceVials,
        GoodName::JurisdictionSeals,
        GoodName::DebtPetals,
        GoodName::MemoryCaskets,
        GoodName::OathFilaments,
        GoodName::QuasarGlass,
        GoodName::WeatherKeys,
        GoodName::AncestralBackups,
        GoodName::SurrenderCodes,
        GoodName::ImpossibleSeeds,
        GoodName::RelativisticAsh,
        GoodName::PulsarSilk,
        GoodName::CombatIntelligence,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EconomyType {
    Remnant,
    Tithe,
    Extraction,
    Tributary,
    Resonance,
    Synthesis,
}

impl EconomyType {
    pub const ALL: &'static [EconomyType] = &[
        EconomyType::Remnant,
        EconomyType::Tithe,
        EconomyType::Extraction,
        EconomyType::Tributary,
        EconomyType::Resonance,
        EconomyType::Synthesis,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PoliticalType {
    RemembranceCompact,
    RequiemParliament,
    Murmuration,
    Kindness,
    SilenceMandate,
    Vigil,
    CovenantOfEchoes,
    WoundTithe,
    PalimpsestAuthority,
    TheAsking,
    Arrival,
    DriftSovereignty,
}

impl PoliticalType {
    pub const ALL: &'static [PoliticalType] = &[
        PoliticalType::RemembranceCompact,
        PoliticalType::RequiemParliament,
        PoliticalType::Murmuration,
        PoliticalType::Kindness,
        PoliticalType::SilenceMandate,
        PoliticalType::Vigil,
        PoliticalType::CovenantOfEchoes,
        PoliticalType::WoundTithe,
        PoliticalType::PalimpsestAuthority,
        PoliticalType::TheAsking,
        PoliticalType::Arrival,
        PoliticalType::DriftSovereignty,
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
    #[serde(rename = "MQ")]
    MQ,
    #[serde(rename = "SGR")]
    SGR,
    #[serde(rename = "IRON")]
    Iron,
}

impl StarType {
    pub const ALL: &'static [StarType] = &[
        StarType::G, StarType::K, StarType::M, StarType::F, StarType::A,
        StarType::WD, StarType::NS, StarType::PU, StarType::XB,
        StarType::MG, StarType::BH, StarType::XBB, StarType::MQ, StarType::SGR,
        // StarType::Iron is hand-placed, not randomly generated
    ];
    pub const WEIGHTS: &'static [f64] = &[
        0.16, 0.13, 0.11, 0.07, 0.05,
        0.08, 0.07, 0.06, 0.05, 0.06,
        0.05, 0.07, 0.01, 0.13,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StationArchetype {
    TradeHub,
    RefinerySpindle,
    CitadelBastion,
    AlienLatticeHive,
    AlienOrreryReliquary,
    AlienGraveloom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InteractionTopology {
    Sphere,
    ShellPatch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InteractionProfile {
    Rocky,
    GasGiant,
    DysonShell,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionFieldData {
    pub topology: InteractionTopology,
    pub profile: InteractionProfile,
    pub width: u16,
    pub height: u16,
    pub values: Vec<u8>,
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
    pub station_archetype: Option<StationArchetype>,
    pub interaction_field: InteractionFieldData,
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
    pub interaction_field: InteractionFieldData,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MarketListingMode {
    ListedBuySell,
    SellOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MarketLegality {
    Legal,
    Licensed,
    Prohibited,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketEntry {
    pub good: GoodName,
    pub buy_price: i32,
    pub sell_price: i32,
    pub stock: i32,
    pub banned: bool,
    pub listing_mode: MarketListingMode,
    pub legality: MarketLegality,
}

// ─── Player / Choices ───────────────────────────────────────────────────────

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
    #[serde(default)]
    pub sets_flags: Vec<String>,
    #[serde(default)]
    pub fires: Vec<String>,
    #[serde(default)]
    pub sets_galactic_flags: Vec<String>,
}

fn default_price_mod() -> f64 { 1.0 }

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventMoment {
    pub narrative_lines: Vec<String>,
    pub choices: Vec<EventChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trigger {
    pub id: String,
    pub conditions: Vec<EventCondition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerFile {
    pub triggers: Vec<Trigger>,
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
    pub galaxy_year_after: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpResult {
    pub system_payload: SystemPayload,
    pub cluster_summary: Vec<ClusterSystemSummary>,
    pub years_elapsed: u32,
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

// ─── Flight Tick Types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum HazardType {
    None,
    Overheat,
    StarCollision,
    PlanetCollision,
    MoonCollision,
    StationCollision,
    DysonShellCollision,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightTickContext {
    pub dt: f64,
    pub fuel_rate: f64,
    pub heat_rate: f64,
    pub cooling_active: bool,
    pub shield_damage_rate: f64,
    pub active_hazard: HazardType,
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

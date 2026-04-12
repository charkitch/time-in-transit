use serde::{Deserialize, Serialize};

use super::EconomyType;

// ─── Climate ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClimateState {
    Stable,
    IceAge,
    Warming,
    NuclearWinter,
    ToxicBloom,
}

// ─── Star / Planet Enums ─────────────────────────────────────────────────────

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
pub enum PlanetType {
    Rocky,
    #[serde(rename = "gas_giant")]
    GasGiant,
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
pub enum DysonInteractionMode {
    TargetableOnly,
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

// ─── World Data Structs ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionFieldData {
    pub topology: InteractionTopology,
    pub profile: InteractionProfile,
    pub width: u16,
    pub height: u16,
    pub values: Vec<u8>,
}

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
    pub polar_cap_size: f64,
    pub climate_state: ClimateState,
    pub climate_intensity: f64,
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
    pub polar_cap_size: f64,
    pub climate_state: ClimateState,
    pub climate_intensity: f64,
    pub axial_tilt: f64,
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

use serde::{Deserialize, Serialize};

// ─── Trade Goods ─────────────────────────────────────────────────────────────

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
    #[serde(rename = "Transfer Plasma")]
    TransferPlasma,
}

impl GoodName {
    pub fn harvest_only(self) -> bool {
        matches!(self, GoodName::RelativisticAsh | GoodName::PulsarSilk | GoodName::CombatIntelligence | GoodName::QuasarGlass | GoodName::TransferPlasma)
    }

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
        GoodName::TransferPlasma,
    ];
}

// ─── Civ / Economy / Trade Enums ─────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EconomyType {
    Remnant,
    Tithe,
    Extraction,
    Tributary,
    Resonance,
    Synthesis,
    Everything,
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
    CrownPatchwork,
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

// ─── Civ / Faction / Market Structs ──────────────────────────────────────────

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

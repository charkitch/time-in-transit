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
        matches!(
            self,
            GoodName::RelativisticAsh
                | GoodName::PulsarSilk
                | GoodName::CombatIntelligence
                | GoodName::QuasarGlass
                | GoodName::TransferPlasma
        )
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

// ─── Political Types ─────────────────────────────────────────────────────────

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
    /// All political types available for random selection in civilization generation.
    /// CrownPatchwork is excluded — it's hand-assigned to The Crown system only.
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

// ─── Surface Types ───────────────────────────────────────────────────────────

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
    #[serde(default)]
    pub galaxy_years_advance: u32,
}

fn default_price_mod() -> f64 {
    1.0
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventChoice {
    pub id: String,
    pub label: String,
    pub description: String,
    pub effect: ChoiceEffect,
    #[serde(default)]
    pub requires: Vec<EventCondition>,
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

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Repeatability {
    #[default]
    Unique,
    Rare,
    Uncommon,
    Common,
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

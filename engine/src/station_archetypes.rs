use crate::prng::Prng;
use crate::types::*;

pub(crate) const ASTEROID_BASE_NAMES: &[&str] = &[
    "Hollowed Rock",
    "Cinder Station",
    "Belt Refuge",
    "The Burrow",
    "Slag Haven",
    "Tumbling Dock",
    "Ore Shadow",
    "Gravel Nest",
];
pub(crate) const OORT_CLOUD_BASE_NAMES: &[&str] = &[
    "Frost Haven",
    "Deep Ice",
    "Outer Dark Relay",
    "Frozen Whisper",
    "The Cold Cradle",
    "Ice Tomb Station",
    "Frostbite Dock",
    "Pale Signal",
];
pub(crate) const MAXIMUM_SPACE_NAMES: &[&str] = &[
    "The Terminus",
    "Void's Edge",
    "The Last Light",
    "Absolute Zero",
    "The Final Signal",
    "Edge of Nothing",
    "The Farthest Shore",
    "Silence Station",
];

pub(crate) fn pick_station_archetype(star: &StarSystemData, rng: &mut Prng) -> StationArchetype {
    let is_outer_system = star.id >= 20;
    let is_weird_star = matches!(
        star.star_type,
        StarType::Pulsar
            | StarType::XrayBinary
            | StarType::XrayBurster
            | StarType::Microquasar
            | StarType::Iron
    );
    let mut alien_weight = 0.12 + f64::max(0.0, (star.tech_level - 4) as f64 * 0.05);
    if is_outer_system {
        alien_weight += 0.10;
    }
    if is_weird_star {
        alien_weight += 0.16;
    }
    alien_weight = alien_weight.clamp(0.08, 0.62);

    if rng.next() < alien_weight {
        if star.tech_level >= 7 && rng.next() < 0.34 {
            StationArchetype::AlienGraveloom
        } else if rng.next() < 0.5 {
            StationArchetype::AlienLatticeHive
        } else {
            StationArchetype::AlienOrreryReliquary
        }
    } else if star.tech_level >= 6 && rng.next() < 0.34 {
        StationArchetype::CitadelBastion
    } else if rng.next() < 0.45 {
        StationArchetype::RefinerySpindle
    } else {
        StationArchetype::TradeHub
    }
}

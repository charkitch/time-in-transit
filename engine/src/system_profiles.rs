use crate::prng::Prng;
use crate::types::*;

const ROCKY_SURFACE_WEIGHTS: &[(SurfaceType, f64)] = &[
    (SurfaceType::Barren, 0.22),
    (SurfaceType::Desert, 0.20),
    (SurfaceType::Ice, 0.13),
    (SurfaceType::Volcanic, 0.10),
    (SurfaceType::Venus, 0.10),
    (SurfaceType::Continental, 0.10),
    (SurfaceType::Mountain, 0.08),
    (SurfaceType::Ocean, 0.04),
    (SurfaceType::Marsh, 0.02),
    (SurfaceType::ForestMoon, 0.01),
];

const MOON_SURFACE_WEIGHTS: &[(SurfaceType, f64)] = &[
    (SurfaceType::Barren, 0.42),
    (SurfaceType::Ice, 0.28),
    (SurfaceType::Volcanic, 0.12),
    (SurfaceType::Desert, 0.08),
    (SurfaceType::Venus, 0.04),
    (SurfaceType::Continental, 0.03),
    (SurfaceType::Ocean, 0.015),
    (SurfaceType::Marsh, 0.004),
    (SurfaceType::ForestMoon, 0.001),
];

// Dead stars (WD, HE) — post-stellar-evolution, stripped atmospheres
const ROCKY_WEIGHTS_DEAD: &[(SurfaceType, f64)] = &[
    (SurfaceType::Barren, 0.38),
    (SurfaceType::Desert, 0.26),
    (SurfaceType::Ice, 0.20),
    (SurfaceType::Volcanic, 0.08),
    (SurfaceType::Venus, 0.05),
    (SurfaceType::Continental, 0.03),
];
const MOON_WEIGHTS_DEAD: &[(SurfaceType, f64)] = &[
    (SurfaceType::Barren, 0.55),
    (SurfaceType::Ice, 0.30),
    (SurfaceType::Volcanic, 0.09),
    (SurfaceType::Desert, 0.06),
];

// Harsh compact (NS, PU, MG, SGR) — radiation-flooded, no habitable worlds
const ROCKY_WEIGHTS_HARSH: &[(SurfaceType, f64)] = &[
    (SurfaceType::Barren, 0.50),
    (SurfaceType::Volcanic, 0.28),
    (SurfaceType::Desert, 0.12),
    (SurfaceType::Venus, 0.06),
    (SurfaceType::Ice, 0.04),
];
const MOON_WEIGHTS_HARSH: &[(SurfaceType, f64)] = &[
    (SurfaceType::Barren, 0.65),
    (SurfaceType::Volcanic, 0.25),
    (SurfaceType::Desert, 0.10),
];
const GAS_HARSH: &[GasGiantType] = &[
    GasGiantType::Jovian,
    GasGiantType::Neptunian,
    GasGiantType::Inferno,
];

// Iron star — things that cannot be, sometimes are
const ROCKY_WEIGHTS_IRON: &[(SurfaceType, f64)] = &[
    (SurfaceType::Barren, 0.70),
    (SurfaceType::Volcanic, 0.20),
    (SurfaceType::Desert, 0.10),
];
const MOON_WEIGHTS_IRON: &[(SurfaceType, f64)] =
    &[(SurfaceType::Barren, 0.85), (SurfaceType::Volcanic, 0.15)];

// Exotic compact (BH, XB, XBB, MQ) — maximum hostility, tidal disruption
const ROCKY_WEIGHTS_EXOTIC: &[(SurfaceType, f64)] = &[
    (SurfaceType::Barren, 0.55),
    (SurfaceType::Volcanic, 0.30),
    (SurfaceType::Desert, 0.10),
    (SurfaceType::Venus, 0.05),
];
const MOON_WEIGHTS_EXOTIC: &[(SurfaceType, f64)] =
    &[(SurfaceType::Barren, 0.75), (SurfaceType::Volcanic, 0.25)];
const GAS_EXOTIC: &[GasGiantType] = &[GasGiantType::Inferno, GasGiantType::Jovian];

pub struct SystemProfile {
    pub rocky_weights: &'static [(SurfaceType, f64)],
    pub moon_weights: &'static [(SurfaceType, f64)],
    pub gas_giant_types: &'static [GasGiantType],
    pub inner_count: (i32, i32),
    pub outer_count: (i32, i32),
    pub asteroid_chance: f64,
    pub ring_chance: f64,
}

pub fn system_profile_for(st: StarType, special: SpecialSystemKind) -> SystemProfile {
    // Crown system: megastructure-dominant with some planets for visual interest
    if special == SpecialSystemKind::TheCrown {
        return SystemProfile {
            rocky_weights: ROCKY_SURFACE_WEIGHTS,
            moon_weights: MOON_SURFACE_WEIGHTS,
            gas_giant_types: GasGiantType::ALL,
            inner_count: (1, 2),
            outer_count: (0, 1),
            asteroid_chance: 0.30,
            ring_chance: 0.50,
        };
    }

    match st {
        StarType::G | StarType::K | StarType::M | StarType::F | StarType::A => SystemProfile {
            rocky_weights: ROCKY_SURFACE_WEIGHTS,
            moon_weights: MOON_SURFACE_WEIGHTS,
            gas_giant_types: GasGiantType::ALL,
            inner_count: (1, 3),
            outer_count: (1, 3),
            asteroid_chance: 0.50,
            ring_chance: 0.60,
        },
        StarType::WhiteDwarf => SystemProfile {
            rocky_weights: ROCKY_WEIGHTS_DEAD,
            moon_weights: MOON_WEIGHTS_DEAD,
            gas_giant_types: GasGiantType::ALL,
            inner_count: (1, 2),
            outer_count: (1, 2),
            asteroid_chance: 0.65,
            ring_chance: 0.50,
        },
        StarType::NeutronStar | StarType::Pulsar | StarType::Magnetar | StarType::GammaRepeater => {
            SystemProfile {
                rocky_weights: ROCKY_WEIGHTS_HARSH,
                moon_weights: MOON_WEIGHTS_HARSH,
                gas_giant_types: GAS_HARSH,
                inner_count: (0, 2),
                outer_count: (1, 2),
                asteroid_chance: 0.70,
                ring_chance: 0.40,
            }
        }
        StarType::BlackHole
        | StarType::XrayBinary
        | StarType::XrayBurster
        | StarType::Microquasar => SystemProfile {
            rocky_weights: ROCKY_WEIGHTS_EXOTIC,
            moon_weights: MOON_WEIGHTS_EXOTIC,
            gas_giant_types: GAS_EXOTIC,
            inner_count: (0, 1),
            outer_count: (1, 2),
            asteroid_chance: 0.80,
            ring_chance: 0.35,
        },
        StarType::Iron => SystemProfile {
            rocky_weights: ROCKY_WEIGHTS_IRON,
            moon_weights: MOON_WEIGHTS_IRON,
            gas_giant_types: &[GasGiantType::Helium],
            inner_count: (0, 1),
            outer_count: (0, 1),
            asteroid_chance: 0.90,
            ring_chance: 0.15,
        },
    }
}

pub fn planet_name(system_name: &str, index: usize) -> String {
    const ROMAN: &[&str] = &["I", "II", "III", "IV", "V", "VI"];
    let numeral = if index < ROMAN.len() {
        ROMAN[index]
    } else {
        return format!("{} {}", system_name, index + 1);
    };
    format!("{} {}", system_name, numeral)
}

pub fn pick_weighted_surface(rng: &mut Prng, weights: &[(SurfaceType, f64)]) -> SurfaceType {
    let mut roll = rng.next();
    for &(surface_type, weight) in weights {
        roll -= weight;
        if roll <= 0.0 {
            return surface_type;
        }
    }
    // Fallback: floating-point rounding can overshoot — all call sites pass non-empty weight slices
    weights.last().expect("weight table must be non-empty").0
}

pub fn generate_rocky_moon_count(rng: &mut Prng) -> i32 {
    let roll = rng.next();
    if roll < 0.60 {
        0
    } else if roll < 0.82 {
        1
    } else if roll < 0.93 {
        2
    } else {
        0
    }
}

pub fn generate_rocky_moon_radius(rng: &mut Prng) -> f64 {
    if rng.next() < 0.08 {
        rng.float(38.0, 56.0)
    } else {
        rng.float(16.0, 30.0)
    }
}

pub fn generate_rocky_clouds(rng: &mut Prng, surface_type: SurfaceType) -> (bool, f64) {
    match surface_type {
        SurfaceType::Continental
        | SurfaceType::Ocean
        | SurfaceType::Marsh
        | SurfaceType::ForestMoon
        | SurfaceType::Mountain => {
            let chance = match surface_type {
                SurfaceType::Ocean => 0.90,
                SurfaceType::Continental | SurfaceType::Marsh => 0.80,
                SurfaceType::ForestMoon => 0.70,
                SurfaceType::Mountain => 0.55,
                _ => 0.75,
            };
            let has = rng.next() < chance;
            let density = if has {
                match surface_type {
                    SurfaceType::Ocean => rng.float(0.35, 0.70),
                    SurfaceType::Continental | SurfaceType::Marsh => rng.float(0.25, 0.60),
                    SurfaceType::ForestMoon => rng.float(0.20, 0.50),
                    SurfaceType::Mountain => rng.float(0.15, 0.45),
                    _ => rng.float(0.20, 0.55),
                }
            } else {
                rng.float(0.0, 1.0) // consume RNG to stay deterministic
            };
            (has, density)
        }
        SurfaceType::Venus => {
            let _consume = rng.next(); // consume the chance roll
            let density = rng.float(0.50, 0.70);
            (true, density)
        }
        SurfaceType::Ice => {
            let has = rng.next() < 0.30;
            let density = if has {
                rng.float(0.10, 0.30)
            } else {
                rng.float(0.0, 1.0)
            };
            (has, density)
        }
        _ => {
            // Barren, Desert, Volcanic — no clouds
            let _consume = rng.next();
            let _consume2 = rng.float(0.0, 1.0);
            (false, 0.0)
        }
    }
}

pub fn generate_moon_clouds(rng: &mut Prng, surface_type: SurfaceType) -> (bool, f64) {
    let (has, density) = generate_rocky_clouds(rng, surface_type);
    (has, density * 0.6) // moons have thinner atmospheres
}

pub fn generate_great_spot(rng: &mut Prng, gas_type: GasGiantType) -> (bool, f64, f64) {
    let chance = match gas_type {
        GasGiantType::Jovian => 0.60,
        GasGiantType::Neptunian => 0.50,
        GasGiantType::Inferno => 0.40,
        GasGiantType::Chromatic => 0.35,
        GasGiantType::Saturnian => 0.25,
        GasGiantType::Helium => 0.20,
    };
    let has = rng.next() < chance;
    let lat = match gas_type {
        GasGiantType::Jovian => rng.float(0.1, 0.5), // mid-latitudes
        GasGiantType::Neptunian => rng.float(-0.6, -0.1), // southern
        GasGiantType::Saturnian => rng.float(0.6, 0.9), // polar
        _ => rng.float(-0.5, 0.5),                   // anywhere mid
    };
    let size = rng.float(0.3, 1.0);
    (has, lat, size)
}

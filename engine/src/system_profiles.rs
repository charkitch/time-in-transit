use crate::prng::Prng;
use crate::types::*;
use strum::EnumCount;

// ─── Thermal blending math ─────────────────────────────────────────────────────

/// Gaussian bump centered at `center` with given `width` and `peak` height.
fn bump(x: f64, center: f64, width: f64, peak: f64) -> f64 {
    peak * (-(((x - center) / width).powi(2))).exp()
}

/// Smooth ramp from 0 to `peak`, starting at `start` and rising asymptotically.
fn ramp_up(x: f64, start: f64, peak: f64) -> f64 {
    if x < start {
        0.0
    } else {
        peak * (1.0 - (-(x - start) * 0.8).exp())
    }
}

// ─── Stellar zone ──────────────────────────────────────────────────────────────

pub struct StellarZone {
    /// Normalizing distance — the habitable sweet spot is at orbit ≈ luminosity.
    pub luminosity: f64,
    /// 0.0 = normal main-sequence, 1.0 = no habitable surfaces possible.
    pub hostility: f64,
}

const SURFACE_TYPE_COUNT: usize = SurfaceType::COUNT;
/// Excludes Helium — Iron systems use force_gas_type instead of weight-based picking.
const GAS_WEIGHT_COUNT: usize = GasGiantType::COUNT - 1;

/// Compute surface-type weights as a continuous function of thermal_ratio.
/// Habitable surfaces (Continental, Ocean, Marsh, ForestMoon) are suppressed
/// by the hostility factor.
pub fn compute_surface_weights(
    thermal_ratio: f64,
    hostility: f64,
) -> [(SurfaceType, f64); SURFACE_TYPE_COUNT] {
    let hab = 1.0 - hostility;
    [
        (SurfaceType::Venus, bump(thermal_ratio, 0.35, 0.25, 0.30)),
        (SurfaceType::Volcanic, bump(thermal_ratio, 0.45, 0.45, 0.25)),
        (SurfaceType::Desert, bump(thermal_ratio, 0.75, 0.50, 0.20)),
        (
            SurfaceType::Continental,
            bump(thermal_ratio, 1.00, 0.25, 0.25) * hab,
        ),
        (
            SurfaceType::Ocean,
            bump(thermal_ratio, 1.00, 0.20, 0.15) * hab,
        ),
        (
            SurfaceType::Marsh,
            bump(thermal_ratio, 1.10, 0.25, 0.10) * hab,
        ),
        (
            SurfaceType::ForestMoon,
            bump(thermal_ratio, 1.05, 0.18, 0.05) * hab,
        ),
        (SurfaceType::Mountain, bump(thermal_ratio, 1.25, 0.45, 0.12)),
        (
            SurfaceType::Barren,
            0.10 + ramp_up(thermal_ratio, 1.5, 0.25),
        ),
        (SurfaceType::Ice, ramp_up(thermal_ratio, 1.3, 0.35)),
    ]
}

/// Moon variant: same curves but habitable peaks halved, Barren/Ice baseline doubled.
pub fn compute_moon_weights(
    thermal_ratio: f64,
    hostility: f64,
) -> [(SurfaceType, f64); SURFACE_TYPE_COUNT] {
    let hab = 1.0 - hostility;
    [
        (SurfaceType::Venus, bump(thermal_ratio, 0.35, 0.25, 0.15)),
        (SurfaceType::Volcanic, bump(thermal_ratio, 0.45, 0.45, 0.20)),
        (SurfaceType::Desert, bump(thermal_ratio, 0.75, 0.50, 0.12)),
        (
            SurfaceType::Continental,
            bump(thermal_ratio, 1.00, 0.25, 0.12) * hab,
        ),
        (
            SurfaceType::Ocean,
            bump(thermal_ratio, 1.00, 0.20, 0.07) * hab,
        ),
        (
            SurfaceType::Marsh,
            bump(thermal_ratio, 1.10, 0.25, 0.05) * hab,
        ),
        (
            SurfaceType::ForestMoon,
            bump(thermal_ratio, 1.05, 0.18, 0.02) * hab,
        ),
        (SurfaceType::Mountain, bump(thermal_ratio, 1.25, 0.45, 0.08)),
        (
            SurfaceType::Barren,
            0.20 + ramp_up(thermal_ratio, 1.5, 0.30),
        ),
        (SurfaceType::Ice, ramp_up(thermal_ratio, 1.2, 0.40)),
    ]
}

/// Compute gas giant type weights based on orbital thermal_ratio.
/// Inferno dominates close in (hot Jupiters), Neptunian/Chromatic dominate far out.
pub fn compute_gas_weights(thermal_ratio: f64) -> [(GasGiantType, f64); GAS_WEIGHT_COUNT] {
    [
        (GasGiantType::Inferno, bump(thermal_ratio, 0.3, 0.3, 0.30)),
        (GasGiantType::Jovian, bump(thermal_ratio, 0.9, 0.5, 0.35)),
        (GasGiantType::Saturnian, bump(thermal_ratio, 1.2, 0.5, 0.25)),
        (GasGiantType::Neptunian, bump(thermal_ratio, 1.8, 0.6, 0.30)),
        (GasGiantType::Chromatic, bump(thermal_ratio, 2.5, 0.8, 0.20)),
    ]
}

// ─── Weighted picking with normalization ────────────────────────────────────────

/// Roll a weighted pick from non-normalized `(item, weight)` pairs.
/// Returns `fallback` if total weight is zero.
fn pick_weighted<T: Copy>(rng: &mut Prng, weights: &[(T, f64)], fallback: T) -> T {
    let total: f64 = weights.iter().map(|(_, w)| w).sum();
    if total <= 0.0 {
        return fallback;
    }
    let roll = rng.next() * total;
    weights
        .iter()
        .scan(roll, |remaining, &(item, weight)| {
            *remaining -= weight;
            Some((item, *remaining))
        })
        .find(|&(_, remaining)| remaining <= 0.0)
        .map(|(item, _)| item)
        .unwrap_or_else(|| weights.last().expect("weight table must be non-empty").0)
}

pub fn pick_surface(rng: &mut Prng, weights: &[(SurfaceType, f64)]) -> SurfaceType {
    pick_weighted(rng, weights, SurfaceType::Barren)
}

pub fn pick_gas_type(rng: &mut Prng, weights: &[(GasGiantType, f64)]) -> GasGiantType {
    pick_weighted(rng, weights, GasGiantType::Jovian)
}

// ─── System profile ─────────────────────────────────────────────────────────────

pub struct SystemProfile {
    pub zone: StellarZone,
    pub inner_count: (i32, i32),
    pub outer_count: (i32, i32),
    pub asteroid_chance: f64,
    pub ring_chance: f64,
    pub hot_jupiter_chance: f64,
    /// Iron systems exclusively use Helium gas giants, bypassing compute_gas_weights.
    pub force_gas_type: Option<GasGiantType>,
}

pub fn system_profile_for(st: StarType, special: SpecialSystemKind) -> SystemProfile {
    if special == SpecialSystemKind::TheCrown {
        return SystemProfile {
            zone: StellarZone {
                luminosity: 2400.0,
                hostility: 0.0,
            },
            inner_count: (1, 2),
            outer_count: (0, 1),
            asteroid_chance: 0.30,
            ring_chance: 0.50,
            hot_jupiter_chance: 0.0,
            force_gas_type: None,
        };
    }

    let mut profile = match st {
        StarType::G => SystemProfile {
            zone: StellarZone {
                luminosity: 2400.0,
                hostility: 0.0,
            },
            inner_count: (1, 3),
            outer_count: (1, 3),
            asteroid_chance: 0.50,
            ring_chance: 0.60,
            hot_jupiter_chance: 0.06,
            force_gas_type: None,
        },
        StarType::K => SystemProfile {
            zone: StellarZone {
                luminosity: 1800.0,
                hostility: 0.0,
            },
            inner_count: (1, 3),
            outer_count: (1, 3),
            asteroid_chance: 0.50,
            ring_chance: 0.60,
            hot_jupiter_chance: 0.05,
            force_gas_type: None,
        },
        StarType::M => SystemProfile {
            zone: StellarZone {
                luminosity: 1200.0,
                hostility: 0.0,
            },
            inner_count: (1, 3),
            outer_count: (0, 2),
            asteroid_chance: 0.45,
            ring_chance: 0.55,
            hot_jupiter_chance: 0.03,
            force_gas_type: None,
        },
        StarType::F => SystemProfile {
            zone: StellarZone {
                luminosity: 3200.0,
                hostility: 0.0,
            },
            inner_count: (1, 3),
            outer_count: (1, 3),
            asteroid_chance: 0.50,
            ring_chance: 0.60,
            hot_jupiter_chance: 0.07,
            force_gas_type: None,
        },
        StarType::A => SystemProfile {
            zone: StellarZone {
                luminosity: 4200.0,
                hostility: 0.0,
            },
            inner_count: (1, 3),
            outer_count: (1, 3),
            asteroid_chance: 0.50,
            ring_chance: 0.60,
            hot_jupiter_chance: 0.08,
            force_gas_type: None,
        },
        StarType::WhiteDwarf => SystemProfile {
            zone: StellarZone {
                luminosity: 1400.0,
                hostility: 0.7,
            },
            inner_count: (1, 2),
            outer_count: (1, 2),
            asteroid_chance: 0.65,
            ring_chance: 0.50,
            hot_jupiter_chance: 0.0,
            force_gas_type: None,
        },
        StarType::NeutronStar | StarType::Pulsar | StarType::Magnetar => SystemProfile {
            zone: StellarZone {
                luminosity: if st == StarType::Magnetar {
                    600.0
                } else {
                    800.0
                },
                hostility: 1.0,
            },
            inner_count: (0, 2),
            outer_count: (1, 2),
            asteroid_chance: 0.70,
            ring_chance: 0.40,
            hot_jupiter_chance: 0.0,
            force_gas_type: None,
        },
        StarType::BlackHole
        | StarType::XrayBinary
        | StarType::XrayBurster
        | StarType::Microquasar => SystemProfile {
            zone: StellarZone {
                luminosity: match st {
                    StarType::BlackHole | StarType::Microquasar => 1000.0,
                    StarType::XrayBinary => 900.0,
                    _ => 800.0,
                },
                hostility: 1.0,
            },
            inner_count: (0, 1),
            outer_count: (1, 2),
            asteroid_chance: 0.80,
            ring_chance: 0.35,
            hot_jupiter_chance: 0.0,
            force_gas_type: None,
        },
        StarType::Iron => SystemProfile {
            zone: StellarZone {
                luminosity: 400.0,
                hostility: 1.0,
            },
            inner_count: (0, 1),
            outer_count: (0, 1),
            asteroid_chance: 0.90,
            ring_chance: 0.15,
            hot_jupiter_chance: 0.0,
            force_gas_type: Some(GasGiantType::Helium),
        },
    };

    if special == SpecialSystemKind::Home {
        profile.hot_jupiter_chance = 0.0;
    }

    profile
}

// ─── Utility functions (unchanged) ──────────────────────────────────────────────

pub fn planet_name(system_name: &str, index: usize) -> String {
    const ROMAN: &[&str] = &["I", "II", "III", "IV", "V", "VI"];
    let numeral = if index < ROMAN.len() {
        ROMAN[index]
    } else {
        return format!("{} {}", system_name, index + 1);
    };
    format!("{} {}", system_name, numeral)
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
        GasGiantType::Jovian => rng.float(0.1, 0.5),
        GasGiantType::Neptunian => rng.float(-0.6, -0.1),
        GasGiantType::Saturnian => rng.float(0.6, 0.9),
        _ => rng.float(-0.5, 0.5),
    };
    let size = rng.float(0.3, 1.0);
    (has, lat, size)
}

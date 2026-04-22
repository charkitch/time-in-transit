use crate::prng::Prng;
use crate::types::*;
use std::collections::HashSet;

/// Identifies a body for climate derivation. Determines both the seed offset
/// (so each body has independent RNG) and the event flag prefix.
pub(crate) enum BodyIndex {
    Planet(u32),
    Moon { planet: u32, moon: u32 },
}

impl BodyIndex {
    fn flag_prefix(&self) -> String {
        match self {
            BodyIndex::Planet(i) => format!("p{}_", i),
            BodyIndex::Moon { planet, moon } => format!("m{}_{}_", planet, moon),
        }
    }

    fn seed_index(&self) -> u32 {
        match self {
            BodyIndex::Planet(i) => *i,
            BodyIndex::Moon { planet, moon } => planet * 100 + moon,
        }
    }
}

fn base_cap_size(rng: &mut Prng, surface: SurfaceType) -> f64 {
    match surface {
        SurfaceType::Ice => rng.float(0.5, 1.0),
        SurfaceType::Continental | SurfaceType::Mountain => rng.float(0.0, 0.6),
        SurfaceType::Ocean => rng.float(0.0, 0.4),
        SurfaceType::ForestMoon | SurfaceType::Marsh => rng.float(0.0, 0.3),
        SurfaceType::Desert | SurfaceType::Barren => {
            if rng.next() < 0.4 {
                rng.float(0.1, 0.4)
            } else {
                0.0
            }
        }
        SurfaceType::Volcanic => {
            if rng.next() < 0.2 {
                rng.float(0.05, 0.2)
            } else {
                0.0
            }
        }
        SurfaceType::Venus => 0.0,
    }
}

fn valid_climate_for_surface(climate: ClimateState, surface: SurfaceType) -> bool {
    match climate {
        ClimateState::IceAge => !matches!(surface, SurfaceType::Venus | SurfaceType::Ice),
        ClimateState::Warming => !matches!(surface, SurfaceType::Venus | SurfaceType::Volcanic),
        ClimateState::NuclearWinter => !matches!(surface, SurfaceType::Venus | SurfaceType::Barren),
        ClimateState::ToxicBloom => !matches!(surface, SurfaceType::Venus | SurfaceType::Ice),
        ClimateState::Stable => true,
    }
}

/// Derive climate state, intensity (0–1), and polar cap size for a body.
/// Uses a forked PRNG seeded from system/body/year so the main RNG stream
/// is untouched. Event flags (e.g. "p0_nuclear", "m0_1_nuclear") can override the result.
pub(crate) fn derive_climate(
    system_id: u32,
    body: BodyIndex,
    galaxy_year: u32,
    surface: SurfaceType,
    flags: Option<&HashSet<String>>,
) -> (ClimateState, f64, f64) {
    let mut rng = Prng::from_index(
        CLUSTER_SEED,
        system_id
            .wrapping_mul(311)
            .wrapping_add(body.seed_index() * 31)
            .wrapping_add(galaxy_year / 80),
    );

    // Check event flag overrides first. Iterate the (typically small) flag set once
    // and strip_prefix to avoid per-check format!() allocations.
    let prefix = body.flag_prefix();
    let climate = flags
        .and_then(|f| {
            f.iter().find_map(|flag| {
                flag.strip_prefix(prefix.as_str())
                    .and_then(|suffix| match suffix {
                        "nuclear" => Some(ClimateState::NuclearWinter),
                        "ice_age" => Some(ClimateState::IceAge),
                        "warming" => Some(ClimateState::Warming),
                        "toxic" => Some(ClimateState::ToxicBloom),
                        _ => None,
                    })
            })
        })
        .unwrap_or_else(|| pick_climate(&mut rng, surface));

    // Intensity 0–1: how far along the climate shift is.
    // Stable planets get 0. Others get a random stage so each planet is
    // at a different point in its transition.
    let intensity = match climate {
        ClimateState::Stable => 0.0,
        _ => rng.float(0.15, 1.0),
    };

    let base = base_cap_size(&mut rng, surface);
    let cap_size = match climate {
        ClimateState::Stable => base,
        // Ice age: caps grow with intensity. At 0.15 ≈ slight growth, at 1.0 ≈ full glaciation
        ClimateState::IceAge => {
            let scale = 1.0 + intensity * 0.8; // 1.12x – 1.8x
            (base * scale).min(1.0).max(intensity * 0.4)
        }
        // Warming: caps shrink with intensity. Low intensity ≈ mild, high ≈ nearly gone
        ClimateState::Warming => base * (1.0 - intensity * 0.8),
        // Nuclear winter: ash caps scale with intensity
        ClimateState::NuclearWinter => 0.15 + intensity * 0.55,
        // Toxic bloom: haze caps scale with intensity
        ClimateState::ToxicBloom => 0.1 + intensity * 0.4,
    };

    (climate, intensity, cap_size)
}

fn pick_climate(rng: &mut Prng, surface: SurfaceType) -> ClimateState {
    let roll = rng.next();
    let candidate = if roll < 0.70 {
        ClimateState::Stable
    } else if roll < 0.82 {
        ClimateState::IceAge
    } else if roll < 0.92 {
        ClimateState::Warming
    } else if roll < 0.97 {
        ClimateState::NuclearWinter
    } else {
        ClimateState::ToxicBloom
    };
    if valid_climate_for_surface(candidate, surface) {
        candidate
    } else {
        ClimateState::Stable
    }
}

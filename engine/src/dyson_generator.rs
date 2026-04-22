use crate::prng::Prng;
use crate::types::*;
use crate::world_interaction_field::build_dyson_shell_interaction_field;
use std::f64::consts::PI;

pub fn generate_dyson_shells(star: &StarSystemData) -> Vec<DysonShellSegmentData> {
    if star.star_type != StarType::Iron {
        return vec![];
    }

    const TAU: f64 = PI * 2.0;
    const DYSON_COLORS: &[u32] = &[0x6D7077, 0x8B8F97, 0x9A8F84, 0x7E858E];
    const MINI_STAR_PHASES: &[f64] = &[0.0, 0.25, 0.5, 0.75, 1.0];

    // Separate RNG stream so adding Dyson shells does not perturb existing system generation.
    let mut rng = Prng::from_index(0xD150_0001, star.id.wrapping_mul(31337).wrapping_add(911));
    let mut shells: Vec<DysonShellSegmentData> = Vec::new();

    let band_count = 2;
    let mut orbit_radius = rng.float(3500.0, 4500.0);

    // Shared orbital plane: small inclination spread so shells form a coherent ring.
    let base_inclination = rng.float(-0.15, 0.15);
    let base_node = rng.float(0.0, TAU);

    for band in 0..band_count {
        let segment_count = rng.int(3, 5);
        let orbit_speed = rng.float(0.000003, 0.000011) * (1.0 + band as f64 * 0.18);

        for segment in 0..segment_count {
            let phase_jitter = rng.float(-0.08, 0.08);
            let orbit_phase =
                ((segment as f64 / segment_count as f64) * TAU + phase_jitter + TAU) % TAU;

            // Sector-mixed weather on a single shell segment.
            let cut_a = rng.float(0.22, 0.40) * TAU;
            let cut_b = rng.float(0.58, 0.78) * TAU;
            let weather_bands = vec![
                DysonWeatherBandData {
                    start_angle: 0.0,
                    end_angle: cut_a,
                    has_clouds: false,
                    cloud_density: 0.0,
                    has_lightning: false,
                },
                DysonWeatherBandData {
                    start_angle: cut_a,
                    end_angle: cut_b,
                    has_clouds: true,
                    cloud_density: rng.float(0.30, 0.58),
                    has_lightning: false,
                },
                DysonWeatherBandData {
                    start_angle: cut_b,
                    end_angle: TAU,
                    has_clouds: true,
                    cloud_density: rng.float(0.52, 0.82),
                    has_lightning: true,
                },
            ];

            let orbit_inclination = base_inclination + rng.float(-0.12, 0.12);
            let orbit_node = base_node + rng.float(-0.12, 0.12);

            const BIOME_PROFILES: &[(DysonBiomeProfile, f64)] = &[
                (DysonBiomeProfile::Continental, 0.45),
                (DysonBiomeProfile::Mixed, 0.25),
                (DysonBiomeProfile::Desert, 0.15),
                (DysonBiomeProfile::Arctic, 0.15),
            ];
            let mut biome_roll = rng.next();
            let biome_profile = {
                let mut chosen = DysonBiomeProfile::Mixed;
                for &(profile, weight) in BIOME_PROFILES {
                    biome_roll -= weight;
                    if biome_roll <= 0.0 {
                        chosen = profile;
                        break;
                    }
                }
                chosen
            };
            let biome_seed = rng.float(0.0, 100.0);
            let interaction_field = build_dyson_shell_interaction_field(
                star.id,
                band as u32,
                segment as u32,
                biome_profile,
            );

            shells.push(DysonShellSegmentData {
                id: format!("{}-dyson-b{}-s{}", star.id, band, segment),
                name: format!("{} SHELL B{}-{}", star.name, band + 1, segment + 1),
                band_index: band as u32,
                segment_index: segment as u32,
                orbit_radius,
                orbit_speed,
                orbit_phase,
                orbit_inclination,
                orbit_node,
                curve_radius: rng.float(900.0, 1600.0),
                arc_width: rng.float(950.0, 1900.0),
                arc_height: rng.float(420.0, 980.0),
                color: *rng.pick(DYSON_COLORS),
                star_phase: *rng.pick(MINI_STAR_PHASES),
                interaction_mode: DysonInteractionMode::TargetableOnly,
                weather_bands,
                biome_profile,
                biome_seed,
                interaction_field,
            });
        }

        orbit_radius += rng.float(2500.0, 3500.0);
    }

    shells
}

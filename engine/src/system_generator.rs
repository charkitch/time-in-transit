use crate::dyson_generator::generate_dyson_shells;
use crate::prng::Prng;
use crate::star_properties::{
    generate_binary_companion, star_radius_range, GAS_COLORS, MOON_COLORS, ROCKY_COLORS,
};
use crate::station_archetypes::{
    pick_station_archetype, ASTEROID_BASE_NAMES, MAXIMUM_SPACE_NAMES, OORT_CLOUD_BASE_NAMES,
};
use crate::system_profiles::{
    generate_great_spot, generate_moon_clouds, generate_rocky_clouds, generate_rocky_moon_count,
    generate_rocky_moon_radius, pick_weighted_surface, planet_name, system_profile_for,
};
use crate::topopolis_generator::generate_topopolis;
use crate::types::*;
use crate::world_interaction_field::build_planet_interaction_field;
use std::f64::consts::PI;

pub fn generate_solar_system(star: &StarSystemData) -> SolarSystemData {
    let mut rng = Prng::from_index(CLUSTER_SEED, star.id.wrapping_mul(97).wrapping_add(13));

    // Home system (id 0) now uses normal generation like every other system.

    let profile = system_profile_for(star.star_type, star.special_kind);

    let inner_count = rng.int(profile.inner_count.0, profile.inner_count.1);
    let outer_count = rng.int(profile.outer_count.0, profile.outer_count.1);
    let has_asteroids = rng.next() < profile.asteroid_chance;
    let (radius_min, radius_max) = star_radius_range(star.star_type);
    let star_radius = rng.float(radius_min, radius_max);

    let companion = generate_binary_companion(star.star_type, &mut rng);

    let binary_outer_edge = companion.as_ref().map_or(0.0, |binary_companion| {
        let compact_outer_edge = binary_companion.orbit_radius * 0.4 + star_radius;
        let companion_outer_edge = binary_companion.orbit_radius + binary_companion.radius;
        f64::max(compact_outer_edge, companion_outer_edge)
    });

    let mut planets: Vec<PlanetData> = Vec::new();

    // Inner rocky planets
    let mut orbit_base: f64 = if companion.is_some() {
        binary_outer_edge + 400.0
    } else {
        1000.0
    };
    for i in 0..inner_count {
        let orbit_radius = orbit_base + rng.float(200.0, 600.0);
        orbit_base = orbit_radius + rng.float(300.0, 500.0);
        let planet_radius = rng.float(60.0, 120.0);
        let moon_count = generate_rocky_moon_count(&mut rng);
        let mut moons: Vec<MoonData> = Vec::new();
        let mut moon_orbit_min = planet_radius * 1.5;
        for m in 0..moon_count {
            let moon_radius = generate_rocky_moon_radius(&mut rng);
            let moon_orbit = moon_orbit_min + moon_radius + rng.float(20.0, 80.0);
            moon_orbit_min = moon_orbit + moon_radius;
            let moon_surface = pick_weighted_surface(&mut rng, profile.moon_weights);
            let (moon_has_clouds, moon_cloud_density) =
                generate_moon_clouds(&mut rng, moon_surface);
            moons.push(MoonData {
                id: format!("{}-p{}-m{}", star.id, i, m),
                surface_type: moon_surface,
                radius: moon_radius,
                orbit_radius: moon_orbit,
                orbit_speed: rng.float(0.0003, 0.001),
                orbit_phase: rng.float(0.0, PI * 2.0),
                color: *rng.pick(MOON_COLORS),
                has_clouds: moon_has_clouds,
                cloud_density: moon_cloud_density,
                polar_cap_size: 0.0,
                climate_state: ClimateState::Stable,
                climate_intensity: 0.0,
            });
        }
        let rocky_surface = if star.id == 0 && i == 0 {
            // Keep the first planet in the home system continental
            let _ = pick_weighted_surface(&mut rng, profile.rocky_weights);
            SurfaceType::Continental
        } else {
            pick_weighted_surface(&mut rng, profile.rocky_weights)
        };
        let (has_clouds, cloud_density) = if star.id == 0 && i == 0 {
            // Home planet always has clouds
            let _ = generate_rocky_clouds(&mut rng, rocky_surface);
            (true, 0.45)
        } else {
            generate_rocky_clouds(&mut rng, rocky_surface)
        };
        let interaction_field = build_planet_interaction_field(
            star.id,
            i as u32,
            PlanetType::Rocky,
            rocky_surface,
            GasGiantType::Jovian,
        );
        let has_station = star.tech_level >= 3 || i == 0;
        planets.push(PlanetData {
            id: format!("{}-p{}", star.id, i),
            name: planet_name(&star.name, i as usize),
            planet_type: PlanetType::Rocky,
            surface_type: rocky_surface,
            gas_type: GasGiantType::Jovian,
            radius: planet_radius,
            orbit_radius,
            orbit_speed: rng.float(0.00005, 0.0002),
            orbit_phase: rng.float(0.0, PI * 2.0),
            color: *rng.pick(ROCKY_COLORS),
            has_rings: false,
            ring_count: 1,
            ring_inclination: 0.0,
            has_clouds,
            cloud_density,
            great_spot: false,
            great_spot_lat: 0.0,
            great_spot_size: 0.0,
            moons,
            has_station,
            station_archetype: if has_station {
                if star.id == 0 && i == 0 {
                    // Keep the home station as the familiar ring (TradeHub)
                    let _ = pick_station_archetype(star, &mut rng);
                    Some(StationArchetype::TradeHub)
                } else {
                    Some(pick_station_archetype(star, &mut rng))
                }
            } else {
                None
            },
            interaction_field,
            polar_cap_size: 0.0,
            climate_state: ClimateState::Stable,
            climate_intensity: 0.0,
            axial_tilt: 0.0,
        });
    }

    // Asteroid belt
    let belt_inner = orbit_base + rng.float(300.0, 600.0);
    let asteroid_belt = if has_asteroids {
        let outer = belt_inner + rng.float(400.0, 700.0);
        Some(AsteroidBeltData {
            inner_radius: belt_inner,
            outer_radius: outer,
            count: 400,
        })
    } else {
        None
    };

    orbit_base = asteroid_belt
        .as_ref()
        .map_or(belt_inner, |b| b.outer_radius)
        + rng.float(800.0, 1500.0);

    // Outer gas giants
    for i in 0..outer_count {
        let orbit_radius = orbit_base + rng.float(1000.0, 3000.0);
        orbit_base = orbit_radius + rng.float(1500.0, 3000.0);
        let gas_type = rng.pick_clone(profile.gas_giant_types);
        let planet_radius = rng.float(180.0, 300.0);
        let has_rings = rng.next() < profile.ring_chance;
        let ring_roll = rng.next();
        let ring_count = if !has_rings {
            1
        } else if ring_roll < 0.05 {
            3
        } else if ring_roll < 0.20 {
            2
        } else {
            1
        };
        let ring_inclination = if has_rings {
            rng.float(-0.38, 0.38)
        } else {
            0.0
        };
        let ring_outer_muls = [0.0, 2.2, 2.6, 2.8];
        let ring_outer_edge = if has_rings {
            planet_radius * ring_outer_muls[ring_count as usize]
        } else {
            0.0
        };
        let moon_count = rng.int(2, 6);
        let mut moons: Vec<MoonData> = Vec::new();
        let mut moon_orbit_min = f64::max(planet_radius * 1.5, ring_outer_edge + 40.0);
        for m in 0..moon_count {
            let moon_radius = rng.float(25.0, 55.0);
            let moon_orbit = moon_orbit_min + moon_radius + rng.float(40.0, 180.0);
            moon_orbit_min = moon_orbit + moon_radius;
            let moon_surface = pick_weighted_surface(&mut rng, profile.moon_weights);
            let (moon_has_clouds, moon_cloud_density) =
                generate_moon_clouds(&mut rng, moon_surface);
            moons.push(MoonData {
                id: format!("{}-g{}-m{}", star.id, i, m),
                surface_type: moon_surface,
                radius: moon_radius,
                orbit_radius: moon_orbit,
                orbit_speed: rng.float(0.0001, 0.0006),
                orbit_phase: rng.float(0.0, PI * 2.0),
                color: *rng.pick(MOON_COLORS),
                has_clouds: moon_has_clouds,
                cloud_density: moon_cloud_density,
                polar_cap_size: 0.0,
                climate_state: ClimateState::Stable,
                climate_intensity: 0.0,
            });
        }
        let (great_spot, great_spot_lat, great_spot_size) = generate_great_spot(&mut rng, gas_type);
        // Rare Uranus-style extreme tilt (~5% of gas giants), forked PRNG
        let axial_tilt = {
            let mut tilt_rng = Prng::from_index(
                CLUSTER_SEED,
                star.id
                    .wrapping_mul(199)
                    .wrapping_add(i as u32 * 59)
                    .wrapping_add(0xA71),
            );
            if tilt_rng.next() < 0.05 {
                tilt_rng.float(1.05, 1.71)
            } else {
                0.0
            }
        };
        let interaction_field = build_planet_interaction_field(
            star.id,
            (inner_count + i) as u32,
            PlanetType::GasGiant,
            SurfaceType::Barren,
            gas_type,
        );
        planets.push(PlanetData {
            id: format!("{}-g{}", star.id, i),
            name: planet_name(&star.name, (inner_count + i) as usize),
            planet_type: PlanetType::GasGiant,
            surface_type: SurfaceType::Barren,
            gas_type,
            radius: planet_radius,
            orbit_radius,
            orbit_speed: rng.float(0.000008, 0.00003),
            orbit_phase: rng.float(0.0, PI * 2.0),
            color: *rng.pick(GAS_COLORS),
            has_rings,
            ring_count,
            ring_inclination,
            has_clouds: false,
            cloud_density: 0.0,
            great_spot,
            great_spot_lat,
            great_spot_size,
            moons,
            has_station: false,
            station_archetype: None,
            interaction_field,
            polar_cap_size: 0.0,
            climate_state: ClimateState::Stable,
            climate_intensity: 0.0,
            axial_tilt,
        });
    }

    // Secret bases
    let mut secret_bases: Vec<SecretBaseData> = Vec::new();
    let outer_edge = orbit_base;

    // Crown system: guaranteed Oort cloud station
    if star.special_kind == SpecialSystemKind::TheCrown {
        secret_bases.push(SecretBaseData {
            id: format!("{}-secret-oort", star.id),
            name: "Crown's Edge Station".to_string(),
            base_type: SecretBaseType::OortCloud,
            orbit_radius: outer_edge + rng.float(6000.0, 9000.0),
            orbit_phase: rng.float(0.0, PI * 2.0),
            orbit_speed: rng.float(0.000003, 0.000006),
        });
    }

    // Asteroid belt base (~25% of systems with belts)
    if let Some(ref belt) = asteroid_belt {
        if rng.next() < 0.25 {
            let mid_belt = (belt.inner_radius + belt.outer_radius) / 2.0;
            secret_bases.push(SecretBaseData {
                id: format!("{}-secret-asteroid", star.id),
                name: rng.pick(ASTEROID_BASE_NAMES).to_string(),
                base_type: SecretBaseType::Asteroid,
                orbit_radius: mid_belt + rng.float(-100.0, 100.0),
                orbit_phase: rng.float(0.0, PI * 2.0),
                orbit_speed: rng.float(0.000015, 0.00004),
            });
        }
    }

    // Oort cloud base (~15%) — skip if Crown already placed one
    if star.special_kind != SpecialSystemKind::TheCrown && rng.next() < 0.15 {
        secret_bases.push(SecretBaseData {
            id: format!("{}-secret-oort", star.id),
            name: rng.pick(OORT_CLOUD_BASE_NAMES).to_string(),
            base_type: SecretBaseType::OortCloud,
            orbit_radius: outer_edge + rng.float(5000.0, 10000.0),
            orbit_phase: rng.float(0.0, PI * 2.0),
            orbit_speed: rng.float(0.000002, 0.000008),
        });
    }

    // Maximum space (~8%)
    if rng.next() < 0.08 {
        secret_bases.push(SecretBaseData {
            id: format!("{}-secret-void", star.id),
            name: rng.pick(MAXIMUM_SPACE_NAMES).to_string(),
            base_type: SecretBaseType::MaximumSpace,
            orbit_radius: outer_edge + rng.float(20000.0, 35000.0),
            orbit_phase: rng.float(0.0, PI * 2.0),
            orbit_speed: rng.float(0.0000005, 0.000002),
        });
    }

    let main_station_planet_id = planets
        .iter()
        .find(|p| p.has_station)
        .or_else(|| planets.first())
        .map(|p| p.id.clone())
        .unwrap_or_default();

    let dyson_shells = generate_dyson_shells(star);
    let topopolis_coils = generate_topopolis(star);

    SolarSystemData {
        star_type: star.star_type,
        star_radius,
        companion,
        planets,
        dyson_shells,
        topopolis_coils,
        asteroid_belt,
        main_station_planet_id,
        secret_bases,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cluster_generator::generate_cluster;

    #[test]
    fn generates_planets() {
        let cluster = generate_cluster();
        let system = generate_solar_system(&cluster[0]);
        assert!(!system.planets.is_empty());
        assert!(!system.main_station_planet_id.is_empty());
        assert!(system.planets.iter().all(|planet| {
            let field = &planet.interaction_field;
            field.width > 0
                && field.height > 0
                && field.values.len() == (field.width as usize * field.height as usize)
        }));
    }

    #[test]
    fn deterministic() {
        let cluster = generate_cluster();
        let a = generate_solar_system(&cluster[5]);
        let b = generate_solar_system(&cluster[5]);
        assert_eq!(a.planets.len(), b.planets.len());
        assert_eq!(a.star_radius, b.star_radius);
        for (pa, pb) in a.planets.iter().zip(b.planets.iter()) {
            assert_eq!(pa.id, pb.id);
            assert_eq!(pa.orbit_radius, pb.orbit_radius);
            assert_eq!(pa.interaction_field.values, pb.interaction_field.values);
        }
    }

    #[test]
    fn xb_systems_leave_clear_space_around_binary_pair() {
        let xb_star = StarSystemData {
            id: 999,
            name: "Test XB".to_string(),
            x: 0.0,
            y: 0.0,
            star_type: StarType::XrayBinary,
            special_kind: SpecialSystemKind::None,
            economy: EconomyType::Synthesis,
            tech_level: 5,
            population: 9,
        };

        let system = generate_solar_system(&xb_star);
        let companion = system
            .companion
            .as_ref()
            .expect("XB systems should have a companion");
        let compact_outer_edge = companion.orbit_radius * 0.4 + system.star_radius;
        let companion_outer_edge = companion.orbit_radius + companion.radius;
        let binary_outer_edge = f64::max(compact_outer_edge, companion_outer_edge);
        let innermost_planet = system
            .planets
            .iter()
            .map(|planet| planet.orbit_radius)
            .fold(f64::INFINITY, f64::min);

        assert!(companion.orbit_radius >= 850.0);
        assert!(innermost_planet >= binary_outer_edge + 200.0);
    }

    #[test]
    fn xbb_systems_have_main_sequence_companions_and_compact_radius() {
        let xbb_star = StarSystemData {
            id: 1000,
            name: "Test XBB".to_string(),
            x: 0.0,
            y: 0.0,
            star_type: StarType::XrayBurster,
            special_kind: SpecialSystemKind::None,
            economy: EconomyType::Synthesis,
            tech_level: 5,
            population: 9,
        };

        let system = generate_solar_system(&xbb_star);
        let companion = system
            .companion
            .as_ref()
            .expect("XBB systems should have a companion");
        let compact_outer_edge = companion.orbit_radius * 0.4 + system.star_radius;
        let companion_outer_edge = companion.orbit_radius + companion.radius;
        let binary_outer_edge = f64::max(compact_outer_edge, companion_outer_edge);
        let innermost_planet = system
            .planets
            .iter()
            .map(|planet| planet.orbit_radius)
            .fold(f64::INFINITY, f64::min);

        assert!(matches!(
            companion.star_type,
            StarType::G | StarType::K | StarType::M
        ));
        assert!((28.0..=48.0).contains(&system.star_radius));
        assert!(innermost_planet >= binary_outer_edge + 200.0);
    }

    #[test]
    fn star_type_weights_align_with_star_type_table() {
        assert_eq!(StarType::ALL.len(), StarType::WEIGHTS.len());
    }

    #[test]
    fn mq_systems_have_hotter_companions_and_clear_space() {
        let mq_star = StarSystemData {
            id: 1001,
            name: "Test MQ".to_string(),
            x: 0.0,
            y: 0.0,
            star_type: StarType::Microquasar,
            special_kind: SpecialSystemKind::None,
            economy: EconomyType::Synthesis,
            tech_level: 5,
            population: 9,
        };

        let system = generate_solar_system(&mq_star);
        let companion = system
            .companion
            .as_ref()
            .expect("MQ systems should have a companion");
        let compact_outer_edge = companion.orbit_radius * 0.4 + system.star_radius;
        let companion_outer_edge = companion.orbit_radius + companion.radius;
        let binary_outer_edge = f64::max(compact_outer_edge, companion_outer_edge);
        let innermost_planet = system
            .planets
            .iter()
            .map(|planet| planet.orbit_radius)
            .fold(f64::INFINITY, f64::min);

        assert!(matches!(
            companion.star_type,
            StarType::A | StarType::F | StarType::G
        ));
        assert!((80.0..=120.0).contains(&system.star_radius));
        assert!(innermost_planet >= binary_outer_edge + 200.0);
    }

    #[test]
    fn iron_systems_generate_dyson_shells() {
        let cluster = generate_cluster();
        let iron_star = cluster
            .iter()
            .find(|star| star.star_type == StarType::Iron)
            .expect("Expected iron star in cluster");

        let system = generate_solar_system(iron_star);
        assert!(!system.dyson_shells.is_empty());

        let mut band_ids: Vec<u32> = system
            .dyson_shells
            .iter()
            .map(|segment| segment.band_index)
            .collect();
        band_ids.sort_unstable();
        band_ids.dedup();
        assert_eq!(band_ids.len(), 2);
        assert!((6..=10).contains(&system.dyson_shells.len()));
        assert!(system
            .dyson_shells
            .iter()
            .all(|segment| segment.weather_bands.len() == 3));
        assert!(system
            .dyson_shells
            .iter()
            .all(|segment| segment.interaction_mode == DysonInteractionMode::TargetableOnly));
        assert!(system
            .dyson_shells
            .iter()
            .all(|segment| { matches!(segment.star_phase, 0.0 | 0.25 | 0.5 | 0.75 | 1.0) }));
        assert!(system.dyson_shells.iter().all(|segment| {
            let field = &segment.interaction_field;
            field.width > 0
                && field.height > 0
                && field.values.len() == (field.width as usize * field.height as usize)
        }));
    }

    #[test]
    fn non_iron_systems_do_not_generate_dyson_shells() {
        let cluster = generate_cluster();
        let non_iron = cluster
            .iter()
            .find(|star| star.star_type != StarType::Iron)
            .expect("Expected at least one non-iron star");

        let system = generate_solar_system(non_iron);
        assert!(system.dyson_shells.is_empty());
    }
}

use crate::dyson_generator::generate_dyson_shells;
use crate::prng::Prng;
use crate::star_properties::{
    generate_binary_companion, star_radius_range, GAS_COLORS, MOON_COLORS, ROCKY_COLORS,
};
use crate::station_archetypes::{
    pick_station_archetype, ASTEROID_BASE_NAMES, MAXIMUM_SPACE_NAMES, OORT_CLOUD_BASE_NAMES,
};
use crate::system_profiles::{
    compute_gas_weights, compute_moon_weights, compute_surface_weights, generate_great_spot,
    generate_moon_clouds, generate_rocky_clouds, generate_rocky_moon_count,
    generate_rocky_moon_radius, pick_gas_type, pick_surface, planet_name, system_profile_for,
    StellarZone,
};
use crate::topopolis_generator::generate_topopolis;
use crate::types::*;
use crate::world_interaction_field::build_planet_interaction_field;
use std::f64::consts::PI;

// ─── Gas giant helpers ──────────────────────────────────────────────────────────

struct RingProps {
    has_rings: bool,
    ring_count: u32,
    ring_inclination: f64,
    outer_edge: f64,
}

fn generate_rings(rng: &mut Prng, ring_chance: f64, planet_radius: f64) -> RingProps {
    let has_rings = rng.next() < ring_chance;
    let ring_roll = rng.next();
    let ring_count = if !has_rings {
        0
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
    let outer_edge = match ring_count {
        1 => planet_radius * 2.2,
        2 => planet_radius * 2.6,
        3 => planet_radius * 2.8,
        _ => 0.0,
    };
    RingProps {
        has_rings,
        ring_count,
        ring_inclination,
        outer_edge,
    }
}

fn generate_gas_moons(
    rng: &mut Prng,
    id_prefix: &str,
    count: i32,
    planet_radius: f64,
    ring_outer_edge: f64,
    zone: &StellarZone,
    thermal_ratio: f64,
) -> Vec<MoonData> {
    let moon_weights = compute_moon_weights(thermal_ratio, zone.hostility);
    let mut moon_orbit_min = f64::max(planet_radius * 1.5, ring_outer_edge + 40.0);
    (0..count)
        .map(|m| {
            let moon_radius = rng.float(25.0, 55.0);
            let moon_orbit = moon_orbit_min + moon_radius + rng.float(40.0, 180.0);
            moon_orbit_min = moon_orbit + moon_radius;
            let moon_surface = pick_surface(rng, &moon_weights);
            let (moon_has_clouds, moon_cloud_density) = generate_moon_clouds(rng, moon_surface);
            MoonData {
                id: format!("{}-m{}", id_prefix, m),
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
            }
        })
        .collect()
}

// ─── Solar system generation ────────────────────────────────────────────────────

pub fn generate_solar_system(star: &StarSystemData) -> SolarSystemData {
    let mut rng = Prng::from_index(CLUSTER_SEED, star.id.wrapping_mul(97).wrapping_add(13));

    // Home system (id 0) now uses normal generation like every other system.

    let profile = system_profile_for(star.star_type, star.special_kind);

    let has_hot_jupiter = rng.next() < profile.hot_jupiter_chance;
    let mut inner_count = rng.int(profile.inner_count.0, profile.inner_count.1);
    if has_hot_jupiter {
        inner_count = (inner_count - 1).max(0);
    }
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
    let luminosity = profile.zone.luminosity;
    let hostility = profile.zone.hostility;

    // Inner planets (rocky, or a hot Jupiter in the first slot)
    let mut orbit_base: f64 = if companion.is_some() {
        binary_outer_edge + 400.0
    } else {
        1000.0
    };

    // Hot Jupiter: a gas giant that migrated inward
    if has_hot_jupiter {
        let orbit_radius = orbit_base + rng.float(200.0, 600.0);
        orbit_base = orbit_radius + rng.float(300.0, 500.0);
        let planet_radius = rng.float(180.0, 300.0);
        let thermal_ratio = orbit_radius / luminosity;
        let gas_weights = compute_gas_weights(thermal_ratio);
        let gas_type = pick_gas_type(&mut rng, &gas_weights);
        let rings = generate_rings(&mut rng, profile.ring_chance, planet_radius);
        let moon_count = rng.int(1, 4);
        let id_prefix = format!("{}-hj", star.id);
        let moons = generate_gas_moons(
            &mut rng,
            &id_prefix,
            moon_count,
            planet_radius,
            rings.outer_edge,
            &profile.zone,
            thermal_ratio,
        );
        let (great_spot, great_spot_lat, great_spot_size) = generate_great_spot(&mut rng, gas_type);
        let interaction_field = build_planet_interaction_field(
            star.id,
            0,
            PlanetType::GasGiant,
            SurfaceType::Barren,
            gas_type,
        );
        planets.push(PlanetData {
            id: id_prefix,
            name: planet_name(&star.name, 0),
            planet_type: PlanetType::GasGiant,
            surface_type: SurfaceType::Barren,
            gas_type,
            radius: planet_radius,
            orbit_radius,
            orbit_speed: rng.float(0.00005, 0.0002),
            orbit_phase: rng.float(0.0, PI * 2.0),
            color: *rng.pick(GAS_COLORS),
            has_rings: rings.has_rings,
            ring_count: rings.ring_count,
            ring_inclination: rings.ring_inclination,
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
            axial_tilt: 0.0,
        });
    }

    // Inner rocky planets
    let planet_index_offset = if has_hot_jupiter { 1 } else { 0 };
    for i in 0..inner_count {
        let planet_index = planet_index_offset + i;
        let orbit_radius = orbit_base + rng.float(200.0, 600.0);
        orbit_base = orbit_radius + rng.float(300.0, 500.0);
        let planet_radius = rng.float(60.0, 120.0);
        let thermal_ratio = orbit_radius / luminosity;
        let moon_count = generate_rocky_moon_count(&mut rng);
        let moon_weights = compute_moon_weights(thermal_ratio, hostility);
        let mut moon_orbit_min = planet_radius * 1.5;
        let moons: Vec<MoonData> = (0..moon_count)
            .map(|m| {
                let moon_radius = generate_rocky_moon_radius(&mut rng);
                let moon_orbit = moon_orbit_min + moon_radius + rng.float(20.0, 80.0);
                moon_orbit_min = moon_orbit + moon_radius;
                let moon_surface = pick_surface(&mut rng, &moon_weights);
                let (moon_has_clouds, moon_cloud_density) =
                    generate_moon_clouds(&mut rng, moon_surface);
                MoonData {
                    id: format!("{}-p{}-m{}", star.id, planet_index, m),
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
                }
            })
            .collect();
        let planet_override = star
            .planet_overrides
            .iter()
            .find(|o| o.planet_index == i as u32);
        let surface_weights = compute_surface_weights(thermal_ratio, hostility);
        let rolled_surface = pick_surface(&mut rng, &surface_weights);
        let rocky_surface = planet_override.map_or(rolled_surface, |o| o.surface);
        let rolled_clouds = generate_rocky_clouds(&mut rng, rocky_surface);
        let (has_clouds, cloud_density) = planet_override
            .and_then(|o| o.clouds)
            .unwrap_or(rolled_clouds);
        let interaction_field = build_planet_interaction_field(
            star.id,
            planet_index as u32,
            PlanetType::Rocky,
            rocky_surface,
            GasGiantType::Jovian,
        );
        let has_station = star.tech_level >= 3 || planet_index == 0;
        // M-dwarf habitable zone planets are tidally locked
        let climate_state = if star.star_type == StarType::M && (0.8..=1.2).contains(&thermal_ratio)
        {
            ClimateState::TidallyLocked
        } else {
            ClimateState::Stable
        };
        planets.push(PlanetData {
            id: format!("{}-p{}", star.id, planet_index),
            name: planet_override
                .and_then(|o| o.name.clone())
                .unwrap_or_else(|| planet_name(&star.name, planet_index as usize)),
            planet_type: PlanetType::Rocky,
            surface_type: rocky_surface,
            gas_type: GasGiantType::Jovian,
            radius: planet_radius,
            orbit_radius,
            orbit_speed: rng.float(0.00005, 0.0002),
            orbit_phase: rng.float(0.0, PI * 2.0),
            color: *rng.pick(ROCKY_COLORS),
            has_rings: false,
            ring_count: 0,
            ring_inclination: 0.0,
            has_clouds,
            cloud_density,
            great_spot: false,
            great_spot_lat: 0.0,
            great_spot_size: 0.0,
            moons,
            has_station,
            station_archetype: if has_station {
                let rolled = pick_station_archetype(star, &mut rng);
                Some(
                    planet_override
                        .and_then(|o| o.station_archetype)
                        .unwrap_or(rolled),
                )
            } else {
                None
            },
            interaction_field,
            polar_cap_size: 0.0,
            climate_state,
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
    let gas_index_offset = planet_index_offset + inner_count;
    for i in 0..outer_count {
        let orbit_radius = orbit_base + rng.float(1000.0, 3000.0);
        orbit_base = orbit_radius + rng.float(1500.0, 3000.0);
        let thermal_ratio = orbit_radius / luminosity;
        let gas_type = if let Some(forced) = profile.force_gas_type {
            let _ = rng.next(); // consume RNG slot for determinism
            forced
        } else {
            let gas_weights = compute_gas_weights(thermal_ratio);
            pick_gas_type(&mut rng, &gas_weights)
        };
        let planet_radius = rng.float(180.0, 300.0);
        let rings = generate_rings(&mut rng, profile.ring_chance, planet_radius);
        let moon_count = rng.int(2, 6);
        let id_prefix = format!("{}-g{}", star.id, i);
        let moons = generate_gas_moons(
            &mut rng,
            &id_prefix,
            moon_count,
            planet_radius,
            rings.outer_edge,
            &profile.zone,
            thermal_ratio,
        );
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
        let total_index = gas_index_offset + i;
        let interaction_field = build_planet_interaction_field(
            star.id,
            total_index as u32,
            PlanetType::GasGiant,
            SurfaceType::Barren,
            gas_type,
        );
        planets.push(PlanetData {
            id: id_prefix,
            name: planet_name(&star.name, total_index as usize),
            planet_type: PlanetType::GasGiant,
            surface_type: SurfaceType::Barren,
            gas_type,
            radius: planet_radius,
            orbit_radius,
            orbit_speed: rng.float(0.000008, 0.00003),
            orbit_phase: rng.float(0.0, PI * 2.0),
            color: *rng.pick(GAS_COLORS),
            has_rings: rings.has_rings,
            ring_count: rings.ring_count,
            ring_inclination: rings.ring_inclination,
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
            planet_overrides: vec![],
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
            planet_overrides: vec![],
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
            planet_overrides: vec![],
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

    #[test]
    fn crown_system_generates_sunmere_as_first_world() {
        let cluster = generate_cluster();
        let crown = cluster
            .iter()
            .find(|star| star.special_kind == SpecialSystemKind::TheCrown)
            .expect("Expected Crown system in cluster");

        let system = generate_solar_system(crown);
        let first = system
            .planets
            .first()
            .expect("Crown should generate at least one planet");

        assert_eq!(first.name, "Sunmere");
        assert_eq!(first.surface_type, SurfaceType::Continental);
        assert!(first.has_clouds);
        assert!(first.cloud_density >= 0.58);
    }

    fn make_star(id: u32, star_type: StarType) -> StarSystemData {
        StarSystemData {
            id,
            name: format!("Test-{}", id),
            x: 0.0,
            y: 0.0,
            star_type,
            special_kind: SpecialSystemKind::None,
            economy: EconomyType::Synthesis,
            tech_level: 5,
            population: 100,
            planet_overrides: vec![],
        }
    }

    fn habitable_surface(s: SurfaceType) -> bool {
        matches!(
            s,
            SurfaceType::Continental
                | SurfaceType::Ocean
                | SurfaceType::Marsh
                | SurfaceType::ForestMoon
        )
    }

    #[test]
    fn hostile_stars_produce_no_habitable_surfaces() {
        [
            StarType::NeutronStar,
            StarType::Pulsar,
            StarType::Magnetar,
            StarType::BlackHole,
            StarType::XrayBinary,
            StarType::XrayBurster,
            StarType::Microquasar,
            StarType::Iron,
        ]
        .iter()
        .for_each(|&st| {
            (0..200).for_each(|seed| {
                let star = make_star(seed, st);
                let system = generate_solar_system(&star);
                system.planets.iter().for_each(|p| {
                    if p.planet_type == PlanetType::Rocky {
                        assert!(
                            !habitable_surface(p.surface_type),
                            "Seed {seed}, star {:?}: rocky planet got {:?}",
                            st,
                            p.surface_type
                        );
                    }
                    p.moons.iter().for_each(|m| {
                        assert!(
                            !habitable_surface(m.surface_type),
                            "Seed {seed}, star {:?}: moon got {:?}",
                            st,
                            m.surface_type
                        );
                    });
                });
            });
        });
    }

    #[test]
    fn g_type_thermal_gradient_shapes_surfaces() {
        let mut scorched_venus_count = 0u32;
        let mut scorched_habitable_count = 0u32;

        (0..500).for_each(|seed| {
            let star = make_star(seed, StarType::G);
            let profile = system_profile_for(StarType::G, SpecialSystemKind::None);
            let system = generate_solar_system(&star);
            system
                .planets
                .iter()
                .filter(|p| p.planet_type == PlanetType::Rocky)
                .for_each(|p| {
                    let tr = p.orbit_radius / profile.zone.luminosity;
                    if tr < 0.5 {
                        if p.surface_type == SurfaceType::Venus {
                            scorched_venus_count += 1;
                        }
                        if habitable_surface(p.surface_type) {
                            scorched_habitable_count += 1;
                        }
                    }
                });
        });

        // In the scorched zone, habitable worlds should be extremely rare
        assert!(
            scorched_habitable_count <= 2,
            "Too many habitable planets in scorched zone: {scorched_habitable_count}"
        );
    }

    #[test]
    fn m_dwarf_habitable_planets_are_tidally_locked() {
        let mut locked_count = 0u32;
        let mut habitable_m_count = 0u32;

        (0..500).for_each(|seed| {
            let star = make_star(seed, StarType::M);
            let profile = system_profile_for(StarType::M, SpecialSystemKind::None);
            let system = generate_solar_system(&star);
            system
                .planets
                .iter()
                .filter(|p| p.planet_type == PlanetType::Rocky)
                .for_each(|p| {
                    let tr = p.orbit_radius / profile.zone.luminosity;
                    if (0.8..=1.2).contains(&tr) {
                        habitable_m_count += 1;
                        if p.climate_state == ClimateState::TidallyLocked {
                            locked_count += 1;
                        }
                    }
                });
        });

        // Every planet in the M-dwarf habitable zone should be tidally locked
        assert_eq!(
            locked_count, habitable_m_count,
            "Not all M-dwarf habitable-zone planets are tidally locked: {locked_count}/{habitable_m_count}"
        );
    }

    #[test]
    fn gas_type_varies_with_orbital_distance() {
        let mut inner_inferno = 0u32;
        let mut outer_cold = 0u32;
        let mut inner_total = 0u32;
        let mut outer_total = 0u32;

        (0..500).for_each(|seed| {
            let star = make_star(seed, StarType::G);
            let profile = system_profile_for(StarType::G, SpecialSystemKind::None);
            let system = generate_solar_system(&star);
            system
                .planets
                .iter()
                .filter(|p| p.planet_type == PlanetType::GasGiant)
                .for_each(|p| {
                    let tr = p.orbit_radius / profile.zone.luminosity;
                    if tr < 0.8 {
                        inner_total += 1;
                        if p.gas_type == GasGiantType::Inferno {
                            inner_inferno += 1;
                        }
                    }
                    if tr > 2.0 {
                        outer_total += 1;
                        if matches!(
                            p.gas_type,
                            GasGiantType::Neptunian | GasGiantType::Chromatic
                        ) {
                            outer_cold += 1;
                        }
                    }
                });
        });

        // Inner gas giants should lean Inferno; outer should lean cold types
        if inner_total > 10 {
            assert!(
                inner_inferno * 4 > inner_total,
                "Inner gas giants should favor Inferno: {inner_inferno}/{inner_total}"
            );
        }
        if outer_total > 10 {
            assert!(
                outer_cold * 3 > outer_total,
                "Outer gas giants should favor Neptunian/Chromatic: {outer_cold}/{outer_total}"
            );
        }
    }

    #[test]
    fn anomaly_overrides_hostility() {
        let star = StarSystemData {
            id: 42,
            name: "Anomaly Test".to_string(),
            x: 0.0,
            y: 0.0,
            star_type: StarType::NeutronStar,
            special_kind: SpecialSystemKind::None,
            economy: EconomyType::Synthesis,
            tech_level: 5,
            population: 100,
            planet_overrides: vec![
                ZoneAnomaly::RelicAtmosphere.to_override(0),
                ZoneAnomaly::TidalHeating.to_override(1),
            ],
        };

        let system = generate_solar_system(&star);
        let rocky_planets: Vec<_> = system
            .planets
            .iter()
            .filter(|p| p.planet_type == PlanetType::Rocky)
            .collect();

        if let Some(first) = rocky_planets.first() {
            assert_eq!(
                first.surface_type,
                SurfaceType::Continental,
                "RelicAtmosphere should force Continental"
            );
        }
        if let Some(second) = rocky_planets.get(1) {
            assert_eq!(
                second.surface_type,
                SurfaceType::Ocean,
                "TidalHeating should force Ocean"
            );
        }
    }

    #[test]
    fn anomaly_targets_rocky_index_not_global_index() {
        // Find a G-type seed that produces a hot Jupiter, then verify
        // that anomaly planet_index 0 targets the first *rocky* planet,
        // not the hot Jupiter.
        let seed = (1u32..10000)
            .find(|&id| {
                let star = make_star(id, StarType::G);
                let system = generate_solar_system(&star);
                system
                    .planets
                    .first()
                    .is_some_and(|p| p.planet_type == PlanetType::GasGiant)
            })
            .expect("no G-type seed produced a hot Jupiter in 10k tries");

        let star = StarSystemData {
            id: seed,
            name: format!("Test-{}", seed),
            x: 0.0,
            y: 0.0,
            star_type: StarType::G,
            special_kind: SpecialSystemKind::None,
            economy: EconomyType::Synthesis,
            tech_level: 5,
            population: 100,
            planet_overrides: vec![ZoneAnomaly::RelicAtmosphere.to_override(0)],
        };

        let system = generate_solar_system(&star);
        let first_rocky = system
            .planets
            .iter()
            .find(|p| p.planet_type == PlanetType::Rocky)
            .expect("system should have at least one rocky planet");
        assert_eq!(
            first_rocky.surface_type,
            SurfaceType::Continental,
            "Anomaly planet_index 0 should target first rocky planet, not the hot Jupiter"
        );
    }

    #[test]
    fn weight_normalization_never_produces_zero_total() {
        // Verify compute_surface_weights produces positive total at various thermal ratios
        [0.1, 0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0]
            .iter()
            .for_each(|&tr| {
                [0.0, 0.5, 0.7, 1.0].iter().for_each(|&hostility| {
                    let weights = compute_surface_weights(tr, hostility);
                    let total: f64 = weights.iter().map(|(_, w)| w).sum();
                    assert!(
                        total > 0.0,
                        "Zero total weight at thermal_ratio={tr}, hostility={hostility}"
                    );
                });
            });
    }
}

use crate::prng::PRNG;
use crate::types::*;
use std::f64::consts::PI;

const ROCKY_COLORS: &[u32] = &[0x8B6914, 0xA0522D, 0x7a6248, 0xB87333, 0x996633, 0xCC9966];
const GAS_COLORS: &[u32] = &[0x6688AA, 0x7A9B8C, 0x9B7A6A, 0x5577AA, 0x886699, 0x4466AA];
const MOON_COLORS: &[u32] = &[0x777788, 0x888877, 0xAA9988, 0x667788];

fn star_color(st: StarType) -> u32 {
    match st {
        StarType::G   => 0xFFEE88,
        StarType::K   => 0xFFAA44,
        StarType::M   => 0xFF6633,
        StarType::F   => 0xFFFFFF,
        StarType::A   => 0xAABBFF,
        StarType::WD  => 0xF0F0FF,
        StarType::HE  => 0x88CCAA,
        StarType::NS  => 0xCCDDFF,
        StarType::PU  => 0x44AAFF,
        StarType::XB  => 0xFF6688,
        StarType::MG  => 0xDD44FF,
        StarType::BH  => 0x220022,
        StarType::SBH => 0x110011,
        StarType::XBB => 0xFF4466,
        StarType::SGR => 0xFFAA22,
    }
}

fn star_radius_range(st: StarType) -> (f64, f64) {
    match st {
        StarType::WD  => (30.0, 50.0),
        StarType::HE  => (200.0, 280.0),
        StarType::NS  => (60.0, 100.0),
        StarType::PU  => (60.0, 100.0),
        StarType::XB  => (60.0, 100.0),
        StarType::MG  => (8.0, 12.0),
        StarType::BH  => (150.0, 250.0),
        StarType::SBH => (500.0, 800.0),
        StarType::XBB => (280.0, 400.0),
        StarType::SGR => (8.0, 12.0),
        _ => (400.0, 600.0),
    }
}

const ROCKY_SURFACE_WEIGHTS: &[(SurfaceType, f64)] = &[
    (SurfaceType::Barren, 0.24),
    (SurfaceType::Desert, 0.22),
    (SurfaceType::Ice, 0.14),
    (SurfaceType::Volcanic, 0.10),
    (SurfaceType::Venus, 0.10),
    (SurfaceType::Continental, 0.10),
    (SurfaceType::Ocean, 0.05),
    (SurfaceType::Marsh, 0.04),
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

const ASTEROID_BASE_NAMES: &[&str] = &[
    "Hollowed Rock", "Cinder Station", "Belt Refuge", "The Burrow",
    "Slag Haven", "Tumbling Dock", "Ore Shadow", "Gravel Nest",
];
const OORT_CLOUD_BASE_NAMES: &[&str] = &[
    "Frost Haven", "Deep Ice", "Outer Dark Relay", "Frozen Whisper",
    "The Cold Cradle", "Ice Tomb Station", "Frostbite Dock", "Pale Signal",
];
const MAXIMUM_SPACE_NAMES: &[&str] = &[
    "The Terminus", "Void's Edge", "The Last Light", "Absolute Zero",
    "The Final Signal", "Edge of Nothing", "The Farthest Shore", "Silence Station",
];

fn planet_name(system_name: &str, index: usize) -> String {
    const ROMAN: &[&str] = &["I", "II", "III", "IV", "V", "VI"];
    let numeral = if index < ROMAN.len() {
        ROMAN[index]
    } else {
        return format!("{} {}", system_name, index + 1);
    };
    format!("{} {}", system_name, numeral)
}

fn pick_weighted_surface(rng: &mut PRNG, weights: &[(SurfaceType, f64)]) -> SurfaceType {
    let mut roll = rng.next();
    for &(surface_type, weight) in weights {
        roll -= weight;
        if roll <= 0.0 {
            return surface_type;
        }
    }
    weights.last().unwrap().0
}

fn generate_rocky_moon_count(rng: &mut PRNG) -> i32 {
    let roll = rng.next();
    if roll < 0.60 { 0 }
    else if roll < 0.82 { 1 }
    else if roll < 0.93 { 2 }
    else { 0 }
}

fn generate_rocky_moon_radius(rng: &mut PRNG) -> f64 {
    if rng.next() < 0.08 {
        rng.float(38.0, 56.0)
    } else {
        rng.float(16.0, 30.0)
    }
}

fn generate_rocky_clouds(rng: &mut PRNG, surface_type: SurfaceType) -> (bool, f64) {
    match surface_type {
        SurfaceType::Continental | SurfaceType::Ocean | SurfaceType::Marsh | SurfaceType::ForestMoon => {
            let chance = match surface_type {
                SurfaceType::Ocean => 0.90,
                SurfaceType::Continental | SurfaceType::Marsh => 0.80,
                SurfaceType::ForestMoon => 0.70,
                _ => 0.75,
            };
            let has = rng.next() < chance;
            let density = if has {
                match surface_type {
                    SurfaceType::Ocean => rng.float(0.35, 0.70),
                    SurfaceType::Continental | SurfaceType::Marsh => rng.float(0.25, 0.60),
                    SurfaceType::ForestMoon => rng.float(0.20, 0.50),
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
            let density = if has { rng.float(0.10, 0.30) } else { rng.float(0.0, 1.0) };
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

fn generate_moon_clouds(rng: &mut PRNG, surface_type: SurfaceType) -> (bool, f64) {
    let (has, density) = generate_rocky_clouds(rng, surface_type);
    (has, density * 0.6) // moons have thinner atmospheres
}

fn generate_great_spot(rng: &mut PRNG, gas_type: GasGiantType) -> (bool, f64, f64) {
    let chance = match gas_type {
        GasGiantType::Jovian => 0.60,
        GasGiantType::Neptunian => 0.50,
        GasGiantType::Inferno => 0.40,
        GasGiantType::Chromatic => 0.35,
        GasGiantType::Saturnian => 0.25,
    };
    let has = rng.next() < chance;
    let lat = match gas_type {
        GasGiantType::Jovian => rng.float(0.1, 0.5),       // mid-latitudes
        GasGiantType::Neptunian => rng.float(-0.6, -0.1),  // southern
        GasGiantType::Saturnian => rng.float(0.6, 0.9),    // polar
        _ => rng.float(-0.5, 0.5),                          // anywhere mid
    };
    let size = rng.float(0.3, 1.0);
    (has, lat, size)
}

pub fn generate_solar_system(star: &StarSystemData) -> SolarSystemData {
    let mut rng = PRNG::from_index(CLUSTER_SEED, star.id.wrapping_mul(97).wrapping_add(13));

    let inner_count = rng.int(1, 3);
    let outer_count = rng.int(1, 3);
    let has_asteroids = rng.next() < 0.5;
    let (radius_min, radius_max) = star_radius_range(star.star_type);
    let star_radius = rng.float(radius_min, radius_max);

    // Binary companion for XB star type
    let companion = if star.star_type == StarType::XB {
        let companion_types = [StarType::G, StarType::K, StarType::F, StarType::A];
        let companion_type = *rng.pick(&companion_types);
        Some(BinaryCompanionData {
            star_type: companion_type,
            radius: rng.float(350.0, 550.0),
            color: star_color(companion_type),
            orbit_radius: rng.float(400.0, 600.0),
            orbit_speed: rng.float(0.0003, 0.0006),
            orbit_phase: rng.float(0.0, PI * 2.0),
        })
    } else {
        None
    };

    let mut planets: Vec<PlanetData> = Vec::new();

    // Inner rocky planets
    let mut orbit_base: f64 = 1000.0;
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
            let moon_surface = pick_weighted_surface(&mut rng, MOON_SURFACE_WEIGHTS);
            let (moon_has_clouds, moon_cloud_density) = generate_moon_clouds(&mut rng, moon_surface);
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
            });
        }
        let rocky_surface = pick_weighted_surface(&mut rng, ROCKY_SURFACE_WEIGHTS);
        let (has_clouds, cloud_density) = generate_rocky_clouds(&mut rng, rocky_surface);
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
            has_station: star.tech_level >= 3 || i == 0,
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

    orbit_base = asteroid_belt.as_ref().map_or(belt_inner, |b| b.outer_radius) + rng.float(800.0, 1500.0);

    // Outer gas giants
    for i in 0..outer_count {
        let orbit_radius = orbit_base + rng.float(1000.0, 3000.0);
        orbit_base = orbit_radius + rng.float(1500.0, 3000.0);
        let gas_type = rng.pick_clone(GasGiantType::ALL);
        let planet_radius = rng.float(180.0, 300.0);
        let has_rings = rng.next() < 0.6;
        let ring_roll = rng.next();
        let ring_count = if !has_rings { 1 } else if ring_roll < 0.05 { 3 } else if ring_roll < 0.20 { 2 } else { 1 };
        let ring_inclination = if has_rings { rng.float(-0.38, 0.38) } else { 0.0 };
        let ring_outer_muls = [0.0, 2.2, 2.6, 2.8];
        let ring_outer_edge = if has_rings { planet_radius * ring_outer_muls[ring_count as usize] } else { 0.0 };
        let moon_count = rng.int(2, 6);
        let mut moons: Vec<MoonData> = Vec::new();
        let mut moon_orbit_min = f64::max(planet_radius * 1.5, ring_outer_edge + 40.0);
        for m in 0..moon_count {
            let moon_radius = rng.float(25.0, 55.0);
            let moon_orbit = moon_orbit_min + moon_radius + rng.float(40.0, 180.0);
            moon_orbit_min = moon_orbit + moon_radius;
            let moon_surface = pick_weighted_surface(&mut rng, MOON_SURFACE_WEIGHTS);
            let (moon_has_clouds, moon_cloud_density) = generate_moon_clouds(&mut rng, moon_surface);
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
            });
        }
        let (great_spot, great_spot_lat, great_spot_size) = generate_great_spot(&mut rng, gas_type);
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
        });
    }

    let main_station_planet_id = planets.iter()
        .find(|p| p.has_station)
        .map(|p| p.id.clone())
        .unwrap_or_else(|| planets[0].id.clone());

    // Secret bases
    let mut secret_bases: Vec<SecretBaseData> = Vec::new();
    let outer_edge = orbit_base;

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

    // Oort cloud base (~15%)
    if rng.next() < 0.15 {
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

    SolarSystemData {
        star_type: star.star_type,
        star_radius,
        companion,
        planets,
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
        }
    }
}

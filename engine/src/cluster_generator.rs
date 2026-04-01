use crate::prng::PRNG;
use crate::types::*;

const HYPERSPACE_MAX_RANGE: f64 = 25.0;

const SYLLABLES_START: &[&str] = &[
    "Ac", "Be", "Ce", "Di", "En", "Fe", "Ge", "Hi", "Is", "Jo", "Ka", "La", "Me",
    "No", "Or", "Pa", "Qu", "Re", "Si", "Te", "Ul", "Ve", "Wo", "Xe", "Za",
];
const SYLLABLES_MID: &[&str] = &[
    "ar", "bi", "ce", "da", "et", "fi", "ge", "ho", "in", "ja", "ki", "lo", "ma",
    "ni", "on", "pe", "ri", "sa", "ti", "un", "ve",
];
const SYLLABLES_END: &[&str] = &[
    "aar", "ble", "dis", "eon", "fis", "gon", "hus", "ion", "jex", "kus", "lis",
    "mex", "nis", "oos", "pus", "rix", "sus", "tix", "uun", "vex",
];

fn generate_name(rng: &mut PRNG) -> String {
    let parts = rng.int(1, 2);
    let mut name = rng.pick_clone(SYLLABLES_START).to_string();
    if parts > 1 {
        name.push_str(rng.pick_clone(SYLLABLES_MID));
    }
    name.push_str(rng.pick_clone(SYLLABLES_END));
    name
}

fn pick_star_type(rng: &mut PRNG) -> StarType {
    let r = rng.next();
    let mut cumul = 0.0;
    for (i, &weight) in StarType::WEIGHTS.iter().enumerate() {
        cumul += weight;
        if r < cumul {
            return StarType::ALL[i];
        }
    }
    StarType::G
}

pub fn generate_cluster() -> Vec<StarSystemData> {
    let mut rng = PRNG::new(CLUSTER_SEED);
    let mut systems: Vec<StarSystemData> = Vec::new();
    let min_dist: f64 = 8.0;

    let mut attempts = 0;
    while systems.len() < CLUSTER_SIZE && attempts < 2000 {
        attempts += 1;
        let x = rng.float(5.0, 95.0);
        let y = rng.float(5.0, 95.0);

        let too_close = systems.iter().any(|s| {
            let dx = s.x - x;
            let dy = s.y - y;
            (dx * dx + dy * dy).sqrt() < min_dist
        });
        if too_close {
            continue;
        }

        let id = systems.len() as u32;
        let mut sys_rng = PRNG::from_index(CLUSTER_SEED, id);
        let star_type = pick_star_type(&mut sys_rng);
        let tech_level = sys_rng.int(1, 14);
        let economy = sys_rng.pick_clone(EconomyType::ALL);

        systems.push(StarSystemData {
            id,
            name: generate_name(&mut sys_rng),
            x,
            y,
            star_type,
            economy,
            tech_level,
            population: sys_rng.int(10, 10000),
        });
    }

    // Keep the home system visually distinctive
    if !systems.is_empty() {
        systems[0].star_type = StarType::A;
    }

    // Hand-place the iron star near origin so it's reachable early.
    if systems.len() > 1 {
        let origin = &systems[0];
        let mut nearest_reachable_idx: Option<usize> = None;
        let mut nearest_reachable_dist = f64::MAX;
        let mut nearest_non_origin_idx = 1usize;
        let mut nearest_non_origin_dist = f64::MAX;

        for (idx, sys) in systems.iter().enumerate().skip(1) {
            let dx = sys.x - origin.x;
            let dy = sys.y - origin.y;
            let dist = (dx * dx + dy * dy).sqrt();

            if dist < nearest_non_origin_dist {
                nearest_non_origin_dist = dist;
                nearest_non_origin_idx = idx;
            }
            if dist <= HYPERSPACE_MAX_RANGE && dist < nearest_reachable_dist {
                nearest_reachable_dist = dist;
                nearest_reachable_idx = Some(idx);
            }
        }

        let iron_idx = nearest_reachable_idx.unwrap_or(nearest_non_origin_idx);
        systems[iron_idx].star_type = StarType::Iron;
    }

    systems
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_30_systems() {
        let cluster = generate_cluster();
        assert_eq!(cluster.len(), 30);
    }

    #[test]
    fn min_distance_enforced() {
        let cluster = generate_cluster();
        for i in 0..cluster.len() {
            for j in (i + 1)..cluster.len() {
                let dx = cluster[i].x - cluster[j].x;
                let dy = cluster[i].y - cluster[j].y;
                let dist = (dx * dx + dy * dy).sqrt();
                assert!(dist >= 8.0, "Systems {} and {} too close: {}", i, j, dist);
            }
        }
    }

    #[test]
    fn deterministic() {
        let a = generate_cluster();
        let b = generate_cluster();
        for (sa, sb) in a.iter().zip(b.iter()) {
            assert_eq!(sa.name, sb.name);
            assert_eq!(sa.x, sb.x);
            assert_eq!(sa.y, sb.y);
        }
    }

    #[test]
    fn origin_remains_a_type() {
        let cluster = generate_cluster();
        assert_eq!(cluster[0].star_type, StarType::A);
    }

    #[test]
    fn iron_star_is_reachable_from_origin() {
        let cluster = generate_cluster();
        let origin = &cluster[0];

        let iron_systems: Vec<&StarSystemData> = cluster
            .iter()
            .filter(|s| s.star_type == StarType::Iron)
            .collect();
        assert_eq!(iron_systems.len(), 1, "Expected exactly one iron star");

        let iron = iron_systems[0];
        let dx = iron.x - origin.x;
        let dy = iron.y - origin.y;
        let dist = (dx * dx + dy * dy).sqrt();
        assert!(
            dist <= HYPERSPACE_MAX_RANGE,
            "Iron star is out of one-jump range from origin: {}",
            dist
        );
    }

    #[test]
    fn deterministic_iron_placement() {
        let a = generate_cluster();
        let b = generate_cluster();

        let a_iron = a
            .iter()
            .find(|s| s.star_type == StarType::Iron)
            .expect("Missing iron star in first cluster");
        let b_iron = b
            .iter()
            .find(|s| s.star_type == StarType::Iron)
            .expect("Missing iron star in second cluster");

        assert_eq!(a_iron.id, b_iron.id);
        assert_eq!(a_iron.x, b_iron.x);
        assert_eq!(a_iron.y, b_iron.y);
    }
}

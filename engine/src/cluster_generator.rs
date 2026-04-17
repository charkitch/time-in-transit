use std::collections::HashSet;

use crate::prng::PRNG;
use crate::types::*;

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
    StarType::ALL.iter()
        .zip(StarType::WEIGHTS.iter())
        .scan(0.0, |acc, (&st, &w)| { *acc += w; Some((st, *acc)) })
        .find(|&(_, cumul)| r < cumul)
        .map(|(st, _)| st)
        .unwrap_or(StarType::G)
}

pub fn generate_cluster() -> Vec<StarSystemData> {
    let mut rng = PRNG::new(CLUSTER_SEED);
    let mut systems: Vec<StarSystemData> = Vec::new();
    let mut used_exotics: HashSet<StarType> = HashSet::new();
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
        let mut star_type = pick_star_type(&mut sys_rng);

        // Each exotic type appears at most once in the cluster
        if star_type.is_exotic() && used_exotics.contains(&star_type) {
            let remaining_exotics: Vec<StarType> = StarType::ALL.iter()
                .copied()
                .filter(|t| t.is_exotic() && !used_exotics.contains(t))
                .collect();
            star_type = if remaining_exotics.is_empty() {
                sys_rng.pick_clone(StarType::COMMON)
            } else {
                sys_rng.pick_clone(&remaining_exotics)
            };
        }
        if star_type.is_exotic() {
            used_exotics.insert(star_type);
        }

        let tech_level = sys_rng.int(1, 14);
        let economy = sys_rng.pick_clone(EconomyType::ALL);

        systems.push(StarSystemData {
            id,
            name: generate_name(&mut sys_rng),
            x,
            y,
            star_type,
            special_kind: SpecialSystemKind::None,
            economy,
            tech_level,
            population: sys_rng.int(10, 10000),
        });
    }

    // Home system gets a familiar sun-like star
    if !systems.is_empty() {
        systems[0].star_type = StarType::G;
    }

    // Place IRON and Crown.
    // Production: far from origin in opposite directions (endgame content).
    // Dev: near origin so they're reachable immediately for testing.
    if systems.len() > 2 {
        let origin_x = systems[0].x;
        let origin_y = systems[0].y;

        let mut ranked: Vec<(usize, f64)> = systems.iter().enumerate().skip(1)
            .map(|(i, s)| {
                let dx = s.x - origin_x;
                let dy = s.y - origin_y;
                (i, (dx * dx + dy * dy).sqrt())
            })
            .collect();

        #[cfg(feature = "dev-placement")]
        ranked.sort_by(|a, b| a.1.total_cmp(&b.1)); // nearest first
        #[cfg(not(feature = "dev-placement"))]
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1)); // farthest first

        let iron_idx = ranked[0].0;
        systems[iron_idx].star_type = StarType::Iron;
        systems[iron_idx].special_kind = SpecialSystemKind::IronStar;

        // Crown: farthest system from origin that's also far from IRON
        // (roughly opposite direction). Score = distance_from_origin + distance_from_iron.
        let non_iron: Vec<(usize, f64)> = ranked.iter()
            .filter(|(i, _)| *i != iron_idx)
            .copied()
            .collect();
        // In dev, ranked is nearest-first so [0] is close; in prod, farthest-first.
        let crown_idx = non_iron.first().map(|(i, _)| *i).unwrap_or(2);

        if crown_idx < systems.len() {
            systems[crown_idx].star_type = StarType::G;
            systems[crown_idx].special_kind = SpecialSystemKind::TheCrown;
            systems[crown_idx].name = "The Crown".to_string();
        }
    }

    systems
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Threshold for asserting Iron/Crown placement is beyond hyperspace range.
    /// Mirrors the runtime constant in the TS-side `HYPERSPACE.maxRange`.
    const HYPERSPACE_MAX_RANGE: f64 = 25.0;

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
    fn origin_remains_g_type() {
        let cluster = generate_cluster();
        assert_eq!(cluster[0].star_type, StarType::G);
    }

    #[test]
    fn iron_star_placement() {
        let cluster = generate_cluster();
        let origin = &cluster[0];
        let iron = cluster.iter().find(|s| s.star_type == StarType::Iron).expect("cluster should contain iron star");
        let dx = iron.x - origin.x;
        let dy = iron.y - origin.y;
        let dist = (dx * dx + dy * dy).sqrt();
        if cfg!(feature = "dev-placement") {
            assert!(dist <= HYPERSPACE_MAX_RANGE, "Iron should be near origin in dev, got {}", dist);
        } else {
            assert!(dist > HYPERSPACE_MAX_RANGE, "Iron should be far from origin in prod, got {}", dist);
        }
    }

    #[test]
    fn print_cluster_types() {
        let cluster = generate_cluster();
        for (i, s) in cluster.iter().enumerate() {
            let mut sys_rng = PRNG::from_index(CLUSTER_SEED, i as u32);
            let r = sys_rng.next();
            println!("System {}: {} - {:?} (r={:.4})", i, s.name, s.star_type, r);
        }
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

    #[test]
    fn iron_star_has_special_kind() {
        let cluster = generate_cluster();
        let iron = cluster.iter().find(|s| s.star_type == StarType::Iron).expect("cluster should contain iron star");
        assert_eq!(iron.special_kind, SpecialSystemKind::IronStar);
    }

    #[test]
    fn exactly_one_crown_system() {
        let cluster = generate_cluster();
        let crowns: Vec<&StarSystemData> = cluster
            .iter()
            .filter(|s| s.special_kind == SpecialSystemKind::TheCrown)
            .collect();
        assert_eq!(crowns.len(), 1, "Expected exactly one Crown system");
    }

    #[test]
    fn crown_system_properties() {
        let cluster = generate_cluster();
        let crown = cluster.iter()
            .find(|s| s.special_kind == SpecialSystemKind::TheCrown)
            .expect("Missing Crown system");
        assert_eq!(crown.star_type, StarType::G);
        assert_eq!(crown.name, "The Crown");
    }

    #[test]
    fn crown_placement() {
        let cluster = generate_cluster();
        let origin = &cluster[0];
        let crown = cluster.iter()
            .find(|s| s.special_kind == SpecialSystemKind::TheCrown)
            .expect("cluster should contain Crown system");
        let dx = crown.x - origin.x;
        let dy = crown.y - origin.y;
        let dist = (dx * dx + dy * dy).sqrt();
        if cfg!(feature = "dev-placement") {
            assert!(dist <= HYPERSPACE_MAX_RANGE, "Crown should be near origin in dev, got {}", dist);
        } else {
            assert!(dist > HYPERSPACE_MAX_RANGE, "Crown should be far from origin in prod, got {}", dist);
        }
    }

    #[test]
    fn deterministic_crown_placement() {
        let a = generate_cluster();
        let b = generate_cluster();
        let a_crown = a.iter().find(|s| s.special_kind == SpecialSystemKind::TheCrown).expect("cluster should contain Crown system");
        let b_crown = b.iter().find(|s| s.special_kind == SpecialSystemKind::TheCrown).expect("cluster should contain Crown system");
        assert_eq!(a_crown.id, b_crown.id);
        assert_eq!(a_crown.x, b_crown.x);
        assert_eq!(a_crown.y, b_crown.y);
    }

    #[test]
    fn unique_exotic_star_types() {
        let cluster = generate_cluster();
        let exotics: Vec<StarType> = cluster.iter()
            .map(|s| s.star_type)
            .filter(|t| t.is_exotic())
            .collect();
        let unique: HashSet<StarType> = exotics.iter().copied().collect();
        assert_eq!(exotics.len(), unique.len(), "Duplicate exotic types found");
    }

    #[test]
    fn non_special_systems_have_none_kind() {
        let cluster = generate_cluster();
        let non_special: Vec<&StarSystemData> = cluster.iter()
            .filter(|s| s.special_kind == SpecialSystemKind::None)
            .collect();
        assert_eq!(non_special.len(), 28, "Expected 28 non-special systems (30 - iron - crown)");
    }
}

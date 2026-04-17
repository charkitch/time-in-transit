use crate::prng::PRNG;
use crate::types::*;
use crate::civilization::political_clusters;

const FACTION_COLORS: &[u32] = &[
    0xFF4444, // red
    0xFF8833, // orange
    0x4488FF, // blue
    0xAA44FF, // purple
    0x44DDAA, // teal
    0xFFCC22, // gold
];

const PREFIXES: &[&str] = &["Kor", "Vel", "Ash", "Dra", "Sol", "Nyx"];
const SUFFIXES: &[&str] = &["athi", "eron", "undi", "imar", "ossa", "enth"];

fn generate_factions() -> Vec<Faction> {
    let mut rng = PRNG::from_index(CLUSTER_SEED, 0xFAC710);
    let clusters = political_clusters();
    let mut factions: Vec<Faction> = (0..6usize)
        .map(|i| {
            let name = format!("{}{}", PREFIXES[i], SUFFIXES[i]);
            let cluster_idx = if i < clusters.len() { i } else { rng.int(0, clusters.len() as i32 - 1) as usize };
            let political_affinity = clusters[cluster_idx].to_vec();
            Faction {
                id: format!("faction-{}", i),
                name,
                color: FACTION_COLORS[i],
                political_affinity,
            }
        })
        .collect();

    // The Crown's own faction — not generated, hand-placed
    factions.push(Faction {
        id: "faction-crown".to_string(),
        name: "The Crown Patchwork".to_string(),
        color: 0xFFDD44,
        political_affinity: vec![PoliticalType::CrownPatchwork],
    });

    factions
}

use std::sync::OnceLock;

static FACTIONS: OnceLock<Vec<Faction>> = OnceLock::new();

pub fn all_factions() -> &'static Vec<Faction> {
    FACTIONS.get_or_init(generate_factions)
}

pub fn get_faction(id: &str) -> Option<&'static Faction> {
    all_factions().iter().find(|f| f.id == id)
}

pub fn get_system_faction_state(
    system_id: u32,
    galaxy_year: u32,
    politics: PoliticalType,
) -> SystemFactionState {
    let era = galaxy_year / ERA_LENGTH;
    let factions = all_factions();
    let clusters = political_clusters();

    let mut rng = PRNG::from_index(
        CLUSTER_SEED ^ system_id.wrapping_mul(0x9E3779B9) ^ era.wrapping_mul(0x517CC1B7).wrapping_add(0xFAC),
        era,
    );

    // Score each faction
    let mut scores: Vec<(usize, f64)> = factions.iter().enumerate().map(|(i, f)| {
        let affinity_match = if f.political_affinity.contains(&politics) { 3.0 } else { 0.5 };
        let noise = rng.next() * 1.5;
        (i, affinity_match + noise)
    }).collect();

    scores.sort_by(|a, b| b.1.total_cmp(&a.1));
    let controlling_faction = &factions[scores[0].0];

    // Determine contestation probability
    let mut contest_chance = 0.25;

    if era > 0 {
        let mut prev_rng = PRNG::from_index(
            CLUSTER_SEED ^ system_id.wrapping_mul(0x9E3779B9) ^ (era - 1).wrapping_mul(0x517CC1B7).wrapping_add(0xFAC),
            era - 1,
        );
        let mut prev_scores: Vec<(usize, f64)> = factions.iter().enumerate().map(|(i, f)| {
            let affinity_match = if f.political_affinity.contains(&politics) { 3.0 } else { 0.5 };
            let noise = prev_rng.next() * 1.5;
            (i, affinity_match + noise)
        }).collect();
        prev_scores.sort_by(|a, b| b.1.total_cmp(&a.1));
        if factions[prev_scores[0].0].id != controlling_faction.id {
            contest_chance = 0.60;
        }
    }

    let mut contest_rng = PRNG::from_index(
        CLUSTER_SEED ^ system_id.wrapping_mul(0x9E3779B9) ^ era.wrapping_mul(0x517CC1B7).wrapping_add(0xC0E),
        era,
    );
    let is_contested = contest_rng.next() < contest_chance;

    let mut contesting_faction_id: Option<String> = None;
    if is_contested {
        let control_cluster = clusters.iter().find(|c| {
            c.iter().any(|p| controlling_faction.political_affinity.contains(p))
        });

        let other_factions: Vec<&Faction> = factions.iter().filter(|f| {
            if f.id == controlling_faction.id { return false; }
            let f_cluster = clusters.iter().find(|c| {
                c.iter().any(|p| f.political_affinity.contains(p))
            });
            f_cluster != control_cluster
        }).collect();

        if !other_factions.is_empty() {
            contesting_faction_id = Some(contest_rng.pick(&other_factions).id.clone());
        } else {
            let fallback: Vec<&Faction> = factions.iter().filter(|f| f.id != controlling_faction.id).collect();
            if !fallback.is_empty() {
                contesting_faction_id = Some(contest_rng.pick(&fallback).id.clone());
            }
        }
    }

    SystemFactionState {
        controlling_faction_id: controlling_faction.id.clone(),
        is_contested: contesting_faction_id.is_some(),
        contesting_faction_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn six_factions() {
        assert_eq!(all_factions().len(), 7);
    }

    #[test]
    fn known_names() {
        let names: Vec<&str> = all_factions().iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"Korathi"));
        assert!(names.contains(&"Veleron"));
    }

    #[test]
    fn deterministic_control() {
        let a = get_system_faction_state(5, 3500, PoliticalType::RemembranceCompact);
        let b = get_system_faction_state(5, 3500, PoliticalType::RemembranceCompact);
        assert_eq!(a.controlling_faction_id, b.controlling_faction_id);
        assert_eq!(a.contesting_faction_id, b.contesting_faction_id);
    }
}

use crate::prng::Prng;
use crate::trading::{is_luxury_good, legality_for_good, strategic_goods};
use crate::types::*;

// ─── Political clusters (70% chance to stay within cluster across eras) ─────

const POLITICAL_CLUSTERS: &[&[PoliticalType]] = &[
    // A: Memory
    &[
        PoliticalType::RemembranceCompact,
        PoliticalType::RequiemParliament,
    ],
    // B: Inscrutability
    &[PoliticalType::Murmuration, PoliticalType::Kindness],
    // C: Suppression
    &[PoliticalType::SilenceMandate, PoliticalType::Vigil],
    // D: Cosmic Devotion
    &[PoliticalType::CovenantOfEchoes, PoliticalType::WoundTithe],
    // E: Opacity
    &[PoliticalType::PalimpsestAuthority, PoliticalType::TheAsking],
    // F: Beyond
    &[PoliticalType::Arrival],
    // G: Dissolution
    &[PoliticalType::DriftSovereignty],
];

pub fn political_clusters() -> &'static [&'static [PoliticalType]] {
    POLITICAL_CLUSTERS
}

fn cluster_of(p: PoliticalType) -> &'static [PoliticalType] {
    POLITICAL_CLUSTERS
        .iter()
        .find(|cluster| cluster.contains(&p))
        .copied()
        .unwrap_or(PoliticalType::ALL)
}

// ─── Banned goods per politics ──────────────────────────────────────────────

fn banned_goods(politics: PoliticalType) -> Vec<GoodName> {
    GoodName::ALL
        .iter()
        .copied()
        .filter(|good| legality_for_good(politics, *good) == MarketLegality::Prohibited)
        .collect()
}

fn price_modifier(politics: PoliticalType) -> f64 {
    match politics {
        PoliticalType::SilenceMandate => 1.20,
        PoliticalType::CovenantOfEchoes | PoliticalType::WoundTithe => 1.15,
        PoliticalType::Vigil => 1.10,
        PoliticalType::Kindness | PoliticalType::Arrival => 0.95,
        _ => 1.0,
    }
}

// ─── Economy whitelists per politics ────────────────────────────────────────

fn allowed_economies(politics: PoliticalType) -> &'static [EconomyType] {
    match politics {
        PoliticalType::RemembranceCompact => &[
            EconomyType::Tithe,
            EconomyType::Tributary,
            EconomyType::Synthesis,
            EconomyType::Resonance,
        ],
        PoliticalType::RequiemParliament => &[
            EconomyType::Tithe,
            EconomyType::Remnant,
            EconomyType::Tributary,
        ],
        PoliticalType::Murmuration => &[
            EconomyType::Tithe,
            EconomyType::Tributary,
            EconomyType::Resonance,
        ],
        PoliticalType::Kindness => &[
            EconomyType::Tributary,
            EconomyType::Resonance,
            EconomyType::Synthesis,
            EconomyType::Tithe,
        ],
        PoliticalType::SilenceMandate => &[
            EconomyType::Extraction,
            EconomyType::Tributary,
            EconomyType::Tithe,
        ],
        PoliticalType::Vigil => &[
            EconomyType::Tithe,
            EconomyType::Extraction,
            EconomyType::Tributary,
        ],
        PoliticalType::CovenantOfEchoes => &[
            EconomyType::Tithe,
            EconomyType::Remnant,
            EconomyType::Tributary,
        ],
        PoliticalType::WoundTithe => &[
            EconomyType::Extraction,
            EconomyType::Tithe,
            EconomyType::Remnant,
        ],
        PoliticalType::PalimpsestAuthority => &[
            EconomyType::Tributary,
            EconomyType::Resonance,
            EconomyType::Synthesis,
        ],
        PoliticalType::TheAsking => &[
            EconomyType::Tributary,
            EconomyType::Synthesis,
            EconomyType::Resonance,
        ],
        PoliticalType::Arrival => &[
            EconomyType::Resonance,
            EconomyType::Synthesis,
            EconomyType::Tributary,
        ],
        PoliticalType::DriftSovereignty => &[
            EconomyType::Remnant,
            EconomyType::Tributary,
            EconomyType::Tithe,
            EconomyType::Extraction,
        ],
        PoliticalType::CrownPatchwork => &[
            EconomyType::Synthesis,
            EconomyType::Resonance,
            EconomyType::Tributary,
            EconomyType::Tithe,
        ],
    }
}

// ─── Political derivation ───────────────────────────────────────────────────

fn derive_politics_raw(system_id: u32, era: u32) -> PoliticalType {
    let seed = CLUSTER_SEED ^ system_id.wrapping_mul(0x9E3779B9) ^ era.wrapping_mul(0x517CC1B7);
    let mut rng = Prng::from_index(seed, era);
    rng.pick_clone(PoliticalType::ALL)
}

fn derive_politics(system_id: u32, era: u32, prev_era: Option<u32>) -> PoliticalType {
    let seed = CLUSTER_SEED ^ system_id.wrapping_mul(0x9E3779B9) ^ era.wrapping_mul(0x517CC1B7);
    let mut rng = Prng::from_index(seed, era);

    if let Some(prev) = prev_era {
        let prev_politics = derive_politics_raw(system_id, prev);
        let cluster = cluster_of(prev_politics);
        let stay = rng.next() < 0.70;
        if stay {
            let seed2 = CLUSTER_SEED
                ^ system_id.wrapping_mul(0x9E3779B9)
                ^ era.wrapping_mul(0x517CC1B7).wrapping_add(1);
            let mut cluster_rng = Prng::from_index(seed2, era);
            return cluster_rng.pick_clone(cluster);
        }
    }

    let seed3 = CLUSTER_SEED
        ^ system_id.wrapping_mul(0x9E3779B9)
        ^ era.wrapping_mul(0x517CC1B7).wrapping_add(2);
    Prng::from_index(seed3, era).pick_clone(PoliticalType::ALL)
}

pub fn derive_economy(
    base_economy: EconomyType,
    politics: PoliticalType,
    rng: &mut Prng,
) -> EconomyType {
    let allowed = allowed_economies(politics);
    if allowed.contains(&base_economy) {
        return base_economy;
    }
    rng.pick_clone(allowed)
}

// ─── Public API ─────────────────────────────────────────────────────────────

pub fn get_civ_state(
    system_id: u32,
    galaxy_year: u32,
    base_economy: EconomyType,
) -> CivilizationState {
    let era = galaxy_year / ERA_LENGTH;
    let prev_era = if era > 0 { Some(era - 1) } else { None };

    let politics = derive_politics(system_id, era, prev_era);

    let econ_seed = CLUSTER_SEED
        ^ system_id.wrapping_mul(0x9E3779B9)
        ^ era.wrapping_mul(0x517CC1B7).wrapping_add(3);
    let mut econ_rng = Prng::from_index(econ_seed, era);
    let economy = derive_economy(base_economy, politics, &mut econ_rng);

    let banned = banned_goods(politics);
    let price_mod = price_modifier(politics);
    let luxury_mod = if politics == PoliticalType::PalimpsestAuthority
        && GoodName::ALL.iter().any(|good| is_luxury_good(*good))
    {
        1.30
    } else {
        1.0
    };
    let anarchy_variance = politics == PoliticalType::DriftSovereignty;
    let tech_bonus = if politics == PoliticalType::Kindness {
        strategic_goods()
    } else {
        vec![]
    };

    CivilizationState {
        system_id,
        galaxy_year,
        era,
        politics,
        economy,
        banned_goods: banned,
        price_modifier: price_mod,
        luxury_mod,
        anarchy_variance,
        tech_bonus,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_politics() {
        let a = get_civ_state(5, 3500, EconomyType::Tributary);
        let b = get_civ_state(5, 3500, EconomyType::Tributary);
        assert_eq!(a.politics, b.politics);
        assert_eq!(a.economy, b.economy);
    }

    #[test]
    fn era_changes() {
        let era0 = get_civ_state(0, 3200, EconomyType::Tithe);
        let era1 = get_civ_state(0, 3500, EconomyType::Tithe);
        // Different eras — politics may differ (or may not due to cluster continuity)
        assert_eq!(era0.era, 12); // 3200/250
        assert_eq!(era1.era, 14); // 3500/250
    }

    #[test]
    fn banned_goods_populated() {
        // SilenceMandate should ban vice goods and information goods.
        let state = CivilizationState {
            system_id: 0,
            galaxy_year: 3200,
            era: 12,
            politics: PoliticalType::SilenceMandate,
            economy: EconomyType::Extraction,
            banned_goods: banned_goods(PoliticalType::SilenceMandate),
            price_modifier: 1.20,
            luxury_mod: 1.0,
            anarchy_variance: false,
            tech_bonus: vec![],
        };
        assert!(state.banned_goods.contains(&GoodName::DreamResin));
        assert!(state.banned_goods.contains(&GoodName::SilenceVials));
    }
}

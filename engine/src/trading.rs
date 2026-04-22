use std::collections::HashMap;

use crate::prng::Prng;
use crate::types::*;

const REPUTATION_SELL_BONUS: f64 = 0.02;
const MIN_LISTED_GOODS: usize = 5;
const MAX_LISTED_GOODS: usize = 9;

fn base_price(good: GoodName) -> i32 {
    match good {
        GoodName::StarwindRations => 48,
        GoodName::HullskinLace => 96,
        GoodName::BurialSunstone => 268,
        GoodName::RainChoirSpools => 144,
        GoodName::ReactorSalt => 240,
        GoodName::PilgrimMaps => 210,
        GoodName::WitnessInk => 182,
        GoodName::GraviticBone => 318,
        GoodName::EmbassyMasks => 414,
        GoodName::DreamResin => 386,
        GoodName::SilenceVials => 520,
        GoodName::JurisdictionSeals => 302,
        GoodName::DebtPetals => 236,
        GoodName::MemoryCaskets => 560,
        GoodName::OathFilaments => 452,
        GoodName::QuasarGlass => 672,
        GoodName::WeatherKeys => 598,
        GoodName::AncestralBackups => 790,
        GoodName::SurrenderCodes => 828,
        GoodName::ImpossibleSeeds => 910,
        GoodName::RelativisticAsh => 1280,
        GoodName::PulsarSilk => 1820,
        GoodName::CombatIntelligence => 1460,
        GoodName::TransferPlasma => 1580,
    }
}

fn volatility(good: GoodName) -> f64 {
    match good {
        GoodName::StarwindRations => 0.10,
        GoodName::HullskinLace => 0.12,
        GoodName::BurialSunstone => 0.20,
        GoodName::RainChoirSpools => 0.18,
        GoodName::ReactorSalt => 0.22,
        GoodName::PilgrimMaps => 0.25,
        GoodName::WitnessInk => 0.18,
        GoodName::GraviticBone => 0.26,
        GoodName::EmbassyMasks => 0.24,
        GoodName::DreamResin => 0.32,
        GoodName::SilenceVials => 0.34,
        GoodName::JurisdictionSeals => 0.28,
        GoodName::DebtPetals => 0.28,
        GoodName::MemoryCaskets => 0.36,
        GoodName::OathFilaments => 0.28,
        GoodName::QuasarGlass => 0.30,
        GoodName::WeatherKeys => 0.34,
        GoodName::AncestralBackups => 0.38,
        GoodName::SurrenderCodes => 0.44,
        GoodName::ImpossibleSeeds => 0.46,
        GoodName::RelativisticAsh => 0.38,
        GoodName::PulsarSilk => 0.48,
        GoodName::CombatIntelligence => 0.42,
        GoodName::TransferPlasma => 0.40,
    }
}

fn rarity(good: GoodName) -> f64 {
    match good {
        GoodName::StarwindRations => 0.10,
        GoodName::HullskinLace => 0.18,
        GoodName::BurialSunstone => 0.52,
        GoodName::RainChoirSpools => 0.34,
        GoodName::ReactorSalt => 0.42,
        GoodName::PilgrimMaps => 0.54,
        GoodName::WitnessInk => 0.36,
        GoodName::GraviticBone => 0.56,
        GoodName::EmbassyMasks => 0.64,
        GoodName::DreamResin => 0.62,
        GoodName::SilenceVials => 0.72,
        GoodName::JurisdictionSeals => 0.58,
        GoodName::DebtPetals => 0.48,
        GoodName::MemoryCaskets => 0.78,
        GoodName::OathFilaments => 0.66,
        GoodName::QuasarGlass => 0.76,
        GoodName::WeatherKeys => 0.76,
        GoodName::AncestralBackups => 0.82,
        GoodName::SurrenderCodes => 0.88,
        GoodName::ImpossibleSeeds => 0.93,
        GoodName::RelativisticAsh => 0.98,
        GoodName::PulsarSilk => 0.98,
        GoodName::CombatIntelligence => 0.98,
        GoodName::TransferPlasma => 0.98,
    }
}

pub fn is_luxury_good(good: GoodName) -> bool {
    matches!(
        good,
        GoodName::EmbassyMasks
            | GoodName::MemoryCaskets
            | GoodName::OathFilaments
            | GoodName::QuasarGlass
            | GoodName::ImpossibleSeeds
    )
}

pub fn strategic_goods() -> Vec<GoodName> {
    vec![
        GoodName::AncestralBackups,
        GoodName::WeatherKeys,
        GoodName::SurrenderCodes,
        GoodName::JurisdictionSeals,
    ]
}

fn is_vice(good: GoodName) -> bool {
    matches!(
        good,
        GoodName::DreamResin | GoodName::SilenceVials | GoodName::MemoryCaskets
    )
}

fn is_juridical(good: GoodName) -> bool {
    matches!(
        good,
        GoodName::JurisdictionSeals | GoodName::DebtPetals | GoodName::SurrenderCodes
    )
}

fn is_strategic(good: GoodName) -> bool {
    matches!(
        good,
        GoodName::AncestralBackups
            | GoodName::SurrenderCodes
            | GoodName::WeatherKeys
            | GoodName::QuasarGlass
    )
}

pub fn legality_for_good(politics: PoliticalType, good: GoodName) -> MarketLegality {
    match politics {
        PoliticalType::RemembranceCompact => {
            if matches!(good, GoodName::SurrenderCodes) {
                MarketLegality::Prohibited
            } else if matches!(good, GoodName::SilenceVials) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
        PoliticalType::RequiemParliament => {
            if matches!(good, GoodName::AncestralBackups | GoodName::SurrenderCodes) {
                MarketLegality::Prohibited
            } else if matches!(good, GoodName::MemoryCaskets | GoodName::BurialSunstone) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
        PoliticalType::Murmuration => {
            if matches!(good, GoodName::WitnessInk) {
                MarketLegality::Prohibited
            } else if matches!(good, GoodName::OathFilaments | GoodName::BurialSunstone) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
        PoliticalType::Kindness => {
            if matches!(good, GoodName::SurrenderCodes) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
        PoliticalType::SilenceMandate => {
            if matches!(
                good,
                GoodName::DreamResin
                    | GoodName::SilenceVials
                    | GoodName::WitnessInk
                    | GoodName::SurrenderCodes
            ) {
                MarketLegality::Prohibited
            } else if matches!(
                good,
                GoodName::AncestralBackups | GoodName::WeatherKeys | GoodName::JurisdictionSeals
            ) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
        PoliticalType::Vigil => {
            if matches!(good, GoodName::DreamResin | GoodName::SurrenderCodes) {
                MarketLegality::Prohibited
            } else if matches!(good, GoodName::WeatherKeys | GoodName::GraviticBone) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
        PoliticalType::CovenantOfEchoes => {
            if matches!(good, GoodName::DreamResin | GoodName::JurisdictionSeals) {
                MarketLegality::Prohibited
            } else if matches!(
                good,
                GoodName::BurialSunstone
                    | GoodName::PilgrimMaps
                    | GoodName::OathFilaments
                    | GoodName::ImpossibleSeeds
            ) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
        PoliticalType::WoundTithe => {
            if matches!(good, GoodName::PilgrimMaps) {
                MarketLegality::Prohibited
            } else if matches!(
                good,
                GoodName::WeatherKeys | GoodName::GraviticBone | GoodName::ReactorSalt
            ) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
        PoliticalType::PalimpsestAuthority => {
            // Nothing explicitly prohibited, but everything juridical/strategic/vice is Licensed
            if is_juridical(good) || is_strategic(good) || is_vice(good) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
        PoliticalType::TheAsking => {
            if matches!(good, GoodName::MemoryCaskets | GoodName::AncestralBackups) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
        PoliticalType::Arrival => {
            // Everything just... works.
            MarketLegality::Legal
        }
        PoliticalType::DriftSovereignty => {
            if matches!(good, GoodName::SurrenderCodes) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
        PoliticalType::CrownPatchwork => {
            // The Crown's patchwork of micro-governments: almost everything is legal
            if matches!(good, GoodName::SurrenderCodes) {
                MarketLegality::Licensed
            } else {
                MarketLegality::Legal
            }
        }
    }
}

fn economy_modifier(economy: EconomyType, good: GoodName) -> i32 {
    match (economy, good) {
        (EconomyType::Remnant, GoodName::StarwindRations) => -38,
        (EconomyType::Remnant, GoodName::DebtPetals) => -34,
        (EconomyType::Remnant, GoodName::EmbassyMasks) => 92,
        (EconomyType::Remnant, GoodName::SurrenderCodes) => 110,

        (EconomyType::Tithe, GoodName::StarwindRations) => -28,
        (EconomyType::Tithe, GoodName::HullskinLace) => -16,
        (EconomyType::Tithe, GoodName::RainChoirSpools) => -20,
        (EconomyType::Tithe, GoodName::ImpossibleSeeds) => 140,

        (EconomyType::Extraction, GoodName::ReactorSalt) => -78,
        (EconomyType::Extraction, GoodName::QuasarGlass) => -56,
        (EconomyType::Extraction, GoodName::GraviticBone) => -40,
        (EconomyType::Extraction, GoodName::StarwindRations) => 34,

        (EconomyType::Tributary, GoodName::HullskinLace) => -28,
        (EconomyType::Tributary, GoodName::ReactorSalt) => -36,
        (EconomyType::Tributary, GoodName::StarwindRations) => 26,
        (EconomyType::Tributary, GoodName::PilgrimMaps) => 40,

        (EconomyType::Resonance, GoodName::EmbassyMasks) => -44,
        (EconomyType::Resonance, GoodName::QuasarGlass) => -120,
        (EconomyType::Resonance, GoodName::OathFilaments) => -55,
        (EconomyType::Resonance, GoodName::MemoryCaskets) => -40,

        (EconomyType::Synthesis, GoodName::AncestralBackups) => -180,
        (EconomyType::Synthesis, GoodName::WeatherKeys) => -110,
        (EconomyType::Synthesis, GoodName::JurisdictionSeals) => -60,
        (EconomyType::Synthesis, GoodName::ImpossibleSeeds) => 85,
        _ => 0,
    }
}

fn listing_probability(economy: EconomyType, good: GoodName) -> f64 {
    if good.harvest_only() {
        return 0.0;
    }
    let rarity_discount = (1.0 - rarity(good)) * 0.38;
    let econ = economy_modifier(economy, good);
    let abundance_bonus = ((-econ).max(0) as f64 / 220.0) * 0.30;
    (0.16 + rarity_discount + abundance_bonus).clamp(0.10, 0.82)
}

struct PriceContext<'a> {
    economy: EconomyType,
    politics_mod: f64,
    luxury_mod: f64,
    tech_bonus: &'a [GoodName],
    anarchy_variance: bool,
    choice_mod: f64,
}

fn compute_price(rng: &mut Prng, good: GoodName, ctx: &PriceContext) -> i32 {
    let PriceContext {
        economy,
        politics_mod,
        luxury_mod,
        tech_bonus,
        anarchy_variance,
        choice_mod,
    } = ctx;
    let base = base_price(good);
    let econ_mod = economy_modifier(*economy, good);
    let spread = volatility(good);
    let variance = if *anarchy_variance {
        rng.float(-spread * 1.8, spread * 1.8)
    } else {
        rng.float(-spread, spread)
    };

    let mut price = ((base + econ_mod) as f64 * (1.0 + variance)).round() as i32;
    price = (price as f64 * politics_mod).round() as i32;
    if is_luxury_good(good) {
        price = (price as f64 * luxury_mod).round() as i32;
    }
    if tech_bonus.contains(&good) {
        price = (price as f64 * 0.90).round() as i32;
    }
    (price as f64 * choice_mod).round().max(1.0) as i32
}

fn pick_missing(listed: &mut Vec<GoodName>, candidates: &[GoodName], rng: &mut Prng) {
    let mut missing: Vec<GoodName> = candidates
        .iter()
        .copied()
        .filter(|good| !listed.contains(good) && !good.harvest_only())
        .collect();
    if missing.is_empty() {
        return;
    }
    let idx = rng.int(0, (missing.len() - 1) as i32) as usize;
    listed.push(missing.swap_remove(idx));
}

pub fn get_market(
    system_id: u32,
    economy: EconomyType,
    civ_state: Option<&CivilizationState>,
    system_choices: Option<&SystemChoices>,
    player_cargo: Option<&HashMap<GoodName, u32>>,
) -> Vec<MarketEntry> {
    let era = civ_state.map_or(0, |c| c.era);
    let mut rng = Prng::from_index(
        CLUSTER_SEED,
        system_id
            .wrapping_mul(53)
            .wrapping_add(7)
            .wrapping_add(era.wrapping_mul(1000)),
    );

    let civ_banned: Vec<GoodName> = civ_state.map_or(vec![], |c| c.banned_goods.clone());
    let choice_banned: Vec<GoodName> = system_choices.map_or(vec![], |c| c.banned_goods.clone());
    let politics = civ_state.map(|c| c.politics);

    let tech_bonus: Vec<GoodName> = civ_state.map_or(vec![], |c| c.tech_bonus.clone());
    let price_ctx = PriceContext {
        economy,
        politics_mod: civ_state.map_or(1.0, |c| c.price_modifier),
        luxury_mod: civ_state.map_or(1.0, |c| c.luxury_mod),
        tech_bonus: &tech_bonus,
        anarchy_variance: civ_state.is_some_and(|c| c.anarchy_variance),
        choice_mod: system_choices.map_or(1.0, |c| c.price_modifier),
    };
    let rep_bonus = system_choices.map_or(1.0, |c| {
        1.0 + c.trading_reputation as f64 * REPUTATION_SELL_BONUS
    });

    let mut listed_goods: Vec<GoodName> = GoodName::ALL
        .iter()
        .copied()
        .filter(|&good| rng.next() < listing_probability(economy, good))
        .collect();

    while listed_goods.len() < MIN_LISTED_GOODS {
        pick_missing(&mut listed_goods, GoodName::ALL, &mut rng);
    }
    while listed_goods.len() > MAX_LISTED_GOODS {
        let idx = rng.int(0, (listed_goods.len() - 1) as i32) as usize;
        listed_goods.swap_remove(idx);
    }

    let mut entries: Vec<MarketEntry> = Vec::new();

    for &good in GoodName::ALL {
        if !listed_goods.contains(&good) {
            continue;
        }

        let civ_legality = politics.map_or(MarketLegality::Legal, |p| legality_for_good(p, good));
        let banned = civ_banned.contains(&good) || choice_banned.contains(&good);
        let legality = if banned {
            MarketLegality::Prohibited
        } else {
            civ_legality
        };

        let price = compute_price(&mut rng, good, &price_ctx);

        let sell_price = match legality {
            MarketLegality::Prohibited => 0,
            _ => (price as f64 * 0.85 * rep_bonus).round().max(1.0) as i32,
        };

        let buy_price = match legality {
            MarketLegality::Prohibited => 0,
            _ => price.max(1),
        };

        let stock = match legality {
            MarketLegality::Prohibited => 0,
            _ => rng.int(0, 30),
        };

        entries.push(MarketEntry {
            good,
            buy_price,
            sell_price,
            stock,
            banned: matches!(legality, MarketLegality::Prohibited),
            listing_mode: MarketListingMode::ListedBuySell,
            legality,
        });
    }

    if let Some(cargo) = player_cargo {
        for &good in GoodName::ALL {
            let qty = cargo.get(&good).copied().unwrap_or(0);
            if qty == 0 || listed_goods.contains(&good) {
                continue;
            }

            let civ_legality =
                politics.map_or(MarketLegality::Legal, |p| legality_for_good(p, good));
            let banned = civ_banned.contains(&good) || choice_banned.contains(&good);
            let legality = if banned {
                MarketLegality::Prohibited
            } else {
                civ_legality
            };
            if legality == MarketLegality::Prohibited {
                continue;
            }

            let price = compute_price(&mut rng, good, &price_ctx);
            let sell_price = (price as f64 * 0.72 * rep_bonus).round().max(1.0) as i32;

            entries.push(MarketEntry {
                good,
                buy_price: 0,
                sell_price,
                stock: 0,
                banned: false,
                listing_mode: MarketListingMode::SellOnly,
                legality,
            });
        }
    }

    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn market_has_high_variance_listing_window() {
        let market = get_market(0, EconomyType::Tithe, None, None, None);
        let listed = market
            .iter()
            .filter(|m| m.listing_mode == MarketListingMode::ListedBuySell)
            .count();
        assert!(listed >= MIN_LISTED_GOODS);
        assert!(listed <= MAX_LISTED_GOODS);
    }

    #[test]
    fn prices_positive_when_legal() {
        let market = get_market(5, EconomyType::Synthesis, None, None, None);
        for entry in &market {
            if entry.legality == MarketLegality::Prohibited {
                continue;
            }
            if entry.listing_mode == MarketListingMode::ListedBuySell {
                assert!(entry.buy_price >= 1);
            }
            assert!(entry.sell_price >= 1);
        }
    }

    #[test]
    fn sell_less_than_buy_for_listed_items() {
        let market = get_market(10, EconomyType::Tributary, None, None, None);
        for entry in &market {
            if entry.listing_mode == MarketListingMode::ListedBuySell && entry.buy_price > 0 {
                assert!(entry.sell_price <= entry.buy_price);
            }
        }
    }

    #[test]
    fn held_unlisted_goods_can_show_sell_only_rows() {
        let mut cargo = HashMap::new();
        cargo.insert(GoodName::ImpossibleSeeds, 2);

        let mut found = false;
        for system_id in 0..60 {
            let market = get_market(system_id, EconomyType::Tithe, None, None, Some(&cargo));
            if market.iter().any(|entry| {
                entry.good == GoodName::ImpossibleSeeds
                    && entry.listing_mode == MarketListingMode::SellOnly
                    && entry.sell_price > 0
            }) {
                found = true;
                break;
            }
        }
        assert!(found);
    }
}

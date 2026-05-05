use serde::{Deserialize, Serialize};
use strum::{Display, EnumIter, EnumString};

use super::constants::*;

// ─── Ship Upgrades ──────────────────────────────────────────────────────────

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Display, EnumString, EnumIter,
)]
pub enum ShipUpgrade {
    ReinforcedHull,
    ExtendedTank,
    CargoExpansion,
    ImprovedCooling,
    ShieldBooster,
    AdvancedScanner,
    EfficientScoops,
    FuelInjectors,
}

impl ShipUpgrade {
    pub(crate) fn bonuses(self) -> StatBonuses {
        match self {
            ShipUpgrade::ReinforcedHull => StatBonuses {
                max_shields: 20.0,
                ..Default::default()
            },
            ShipUpgrade::ExtendedTank => StatBonuses {
                max_fuel: 2.0,
                ..Default::default()
            },
            ShipUpgrade::CargoExpansion => StatBonuses {
                max_cargo: 5,
                ..Default::default()
            },
            ShipUpgrade::ImprovedCooling => StatBonuses {
                cooling_rate: 3.0,
                ..Default::default()
            },
            ShipUpgrade::ShieldBooster => StatBonuses {
                shield_regen_rate: 2.0,
                ..Default::default()
            },
            ShipUpgrade::AdvancedScanner => StatBonuses {
                scan_range: 1.0,
                ..Default::default()
            },
            ShipUpgrade::EfficientScoops => StatBonuses {
                harvest_efficiency: 0.25,
                ..Default::default()
            },
            ShipUpgrade::FuelInjectors => StatBonuses {
                jump_fuel_cost_mod: -0.1,
                ..Default::default()
            },
        }
    }
}

// ─── Stat Bonuses ───────────────────────────────────────────────────────────

#[derive(Default)]
pub(crate) struct StatBonuses {
    pub max_fuel: f64,
    pub max_shields: f64,
    pub max_cargo: u32,
    pub cooling_rate: f64,
    pub shield_regen_rate: f64,
    pub scan_range: f64,
    pub harvest_efficiency: f64,
    pub jump_fuel_cost_mod: f64,
}

// ─── Effective Ship Stats ───────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveShipStats {
    pub max_fuel: f64,
    pub max_shields: f64,
    pub max_cargo: u32,
    pub cooling_rate: f64,
    pub shield_regen_rate: f64,
    pub heat_max: f64,
    pub regen_heat_ceil: f64,
    pub overheat_shield_dmg: f64,
    pub scan_range: f64,
    pub harvest_efficiency: f64,
    pub jump_fuel_cost_mod: f64,
}

impl Default for EffectiveShipStats {
    fn default() -> Self {
        Self {
            max_fuel: MAX_FUEL,
            max_shields: MAX_SHIELDS,
            max_cargo: MAX_CARGO,
            cooling_rate: COOLING_RATE,
            shield_regen_rate: SHIELD_REGEN_RATE,
            heat_max: HEAT_MAX,
            regen_heat_ceil: REGEN_HEAT_CEIL,
            overheat_shield_dmg: OVERHEAT_SHIELD_DMG,
            scan_range: 0.0,
            harvest_efficiency: 1.0,
            jump_fuel_cost_mod: 1.0,
        }
    }
}

impl EffectiveShipStats {
    pub(crate) fn compute(bonuses: impl Iterator<Item = StatBonuses>) -> Self {
        bonuses.fold(Self::default(), |mut stats, b| {
            stats.max_fuel += b.max_fuel;
            stats.max_shields += b.max_shields;
            stats.max_cargo += b.max_cargo;
            stats.cooling_rate += b.cooling_rate;
            stats.shield_regen_rate += b.shield_regen_rate;
            stats.scan_range += b.scan_range;
            stats.harvest_efficiency += b.harvest_efficiency;
            stats.jump_fuel_cost_mod = (stats.jump_fuel_cost_mod + b.jump_fuel_cost_mod).max(0.1);
            stats
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use strum::IntoEnumIterator;

    #[test]
    fn empty_bonuses_match_defaults() {
        assert_eq!(
            EffectiveShipStats::compute(std::iter::empty()),
            EffectiveShipStats::default()
        );
    }

    #[test]
    fn defaults_match_constants() {
        let stats = EffectiveShipStats::default();
        assert_eq!(stats.max_fuel, MAX_FUEL);
        assert_eq!(stats.max_shields, MAX_SHIELDS);
        assert_eq!(stats.max_cargo, MAX_CARGO);
        assert_eq!(stats.cooling_rate, COOLING_RATE);
        assert_eq!(stats.shield_regen_rate, SHIELD_REGEN_RATE);
        assert_eq!(stats.heat_max, HEAT_MAX);
        assert_eq!(stats.regen_heat_ceil, REGEN_HEAT_CEIL);
        assert_eq!(stats.overheat_shield_dmg, OVERHEAT_SHIELD_DMG);
    }

    #[test]
    fn single_upgrade_applies_bonus() {
        let upgrades = [ShipUpgrade::ExtendedTank];
        let stats = EffectiveShipStats::compute(upgrades.iter().map(|u| u.bonuses()));
        assert_eq!(stats.max_fuel, MAX_FUEL + 2.0);
        assert_eq!(stats.max_shields, MAX_SHIELDS); // unchanged
    }

    #[test]
    fn multiple_upgrades_stack() {
        let upgrades = [
            ShipUpgrade::ExtendedTank,
            ShipUpgrade::ReinforcedHull,
            ShipUpgrade::CargoExpansion,
        ];
        let stats = EffectiveShipStats::compute(upgrades.iter().map(|u| u.bonuses()));
        assert_eq!(stats.max_fuel, MAX_FUEL + 2.0);
        assert_eq!(stats.max_shields, MAX_SHIELDS + 20.0);
        assert_eq!(stats.max_cargo, MAX_CARGO + 5);
    }

    #[test]
    fn from_str_round_trips() {
        ShipUpgrade::iter().for_each(|variant| {
            let parsed: ShipUpgrade = variant.to_string().parse().unwrap();
            assert_eq!(parsed, variant);
        });
    }

    #[test]
    fn from_str_rejects_unknown() {
        assert!("Nonexistent".parse::<ShipUpgrade>().is_err());
    }

    #[test]
    fn jump_fuel_cost_mod_has_floor() {
        let bonuses = (0..20).map(|_| StatBonuses {
            jump_fuel_cost_mod: -0.1,
            ..Default::default()
        });
        let stats = EffectiveShipStats::compute(bonuses);
        assert_eq!(stats.jump_fuel_cost_mod, 0.1);
    }
}

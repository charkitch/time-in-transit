use serde::{Deserialize, Serialize};
use strum::{Display, EnumIter, EnumString};

use super::ship_stats::StatBonuses;

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Display, EnumString, EnumIter,
)]
pub enum CrewMember {
    Enne,
    TessalyVane,
    Renn,
    TheListener,
    IceMonksAbbot,
}

impl CrewMember {
    pub(crate) fn bonuses(self) -> StatBonuses {
        match self {
            CrewMember::Enne => StatBonuses {
                scan_range: 2.0,
                jump_fuel_cost_mod: -0.1,
                ..Default::default()
            },
            CrewMember::TessalyVane => StatBonuses {
                max_cargo: 3,
                ..Default::default()
            },
            CrewMember::Renn => StatBonuses {
                cooling_rate: 3.0,
                jump_fuel_cost_mod: -0.1,
                ..Default::default()
            },
            CrewMember::TheListener => StatBonuses {
                scan_range: 3.0,
                harvest_efficiency: 0.2,
                ..Default::default()
            },
            CrewMember::IceMonksAbbot => StatBonuses {
                shield_regen_rate: 3.0,
                cooling_rate: 2.0,
                ..Default::default()
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use strum::IntoEnumIterator;

    #[test]
    fn from_str_round_trips() {
        CrewMember::iter().for_each(|variant| {
            let parsed: CrewMember = variant.to_string().parse().unwrap();
            assert_eq!(parsed, variant);
        });
    }

    #[test]
    fn from_str_rejects_unknown() {
        assert!("Nonexistent".parse::<CrewMember>().is_err());
    }

    #[test]
    fn each_member_has_nonzero_bonus() {
        CrewMember::iter().for_each(|variant| {
            let b = variant.bonuses();
            let has_bonus = b.max_fuel != 0.0
                || b.max_shields != 0.0
                || b.max_cargo != 0
                || b.cooling_rate != 0.0
                || b.shield_regen_rate != 0.0
                || b.scan_range != 0.0
                || b.harvest_efficiency != 0.0
                || b.jump_fuel_cost_mod != 0.0;
            assert!(has_bonus, "{variant} has no bonuses");
        });
    }
}

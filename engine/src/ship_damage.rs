//! The single place flight damage is turned into shield and heat changes.

use crate::types::{EffectiveShipStats, FlightTickContext, HazardType};

pub(crate) struct DamageOutcome {
    pub shields: f64,
    pub heat: f64,
    pub death_cause: Option<HazardType>,
}

pub(crate) fn apply_damage(
    shields: f64,
    heat: f64,
    stats: &EffectiveShipStats,
    ctx: &FlightTickContext,
) -> DamageOutcome {
    let damage = &ctx.damage;
    let dt = ctx.dt;
    let under_fire = damage.cause != HazardType::None;

    let unshielded_heat = if shields <= 0.0 {
        damage.unshielded_heat_burst
    } else {
        0.0
    };
    let damage_heat = damage.heat_rate * dt + damage.heat_burst + unshielded_heat;
    let cooling = if ctx.cooling_active && damage_heat == 0.0 {
        stats.cooling_rate * dt
    } else {
        0.0
    };
    let heat = (heat + ctx.heat_rate * dt + damage_heat - cooling).clamp(0.0, stats.heat_max);
    let overheated = heat >= stats.heat_max;

    let overheat_bleed = if overheated {
        stats.overheat_shield_dmg * dt
    } else {
        0.0
    };
    let damaged = shields - overheat_bleed - damage.shield_rate * dt - damage.shield_burst;
    let can_regen =
        !ctx.is_dead && !under_fire && heat < stats.regen_heat_ceil && damaged < stats.max_shields;
    let regen = if can_regen {
        stats.shield_regen_rate * dt
    } else {
        0.0
    };
    let shields = (damaged + regen).clamp(0.0, stats.max_shields);

    let depleted = shields <= 0.0 && (damage.lethal_on_depletion || overheated);
    let death_cause = if ctx.is_dead {
        None
    } else if damage.destroyed_by.is_some() {
        damage.destroyed_by
    } else if depleted {
        Some(if under_fire {
            damage.cause
        } else {
            HazardType::Overheat
        })
    } else {
        None
    };

    DamageOutcome {
        shields,
        heat,
        death_cause,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ShipDamage;

    const DT: f64 = 0.1;

    fn ctx(damage: ShipDamage) -> FlightTickContext {
        FlightTickContext {
            dt: DT,
            fuel_rate: 0.0,
            heat_rate: 0.0,
            cooling_active: true,
            damage,
            is_dead: false,
            cargo_harvests: vec![],
        }
    }

    fn apply(shields: f64, heat: f64, ctx: &FlightTickContext) -> DamageOutcome {
        apply_damage(shields, heat, &EffectiveShipStats::default(), ctx)
    }

    #[test]
    fn sustained_damage_scales_with_dt() {
        let stats = EffectiveShipStats::default();
        let out = apply(
            stats.max_shields,
            0.0,
            &ctx(ShipDamage {
                shield_rate: 20.0,
                heat_rate: 30.0,
                cause: HazardType::BattleZone,
                lethal_on_depletion: true,
                ..Default::default()
            }),
        );
        assert_eq!(out.shields, stats.max_shields - 20.0 * DT);
        assert_eq!(out.heat, 30.0 * DT);
        assert_eq!(out.death_cause, None);
    }

    #[test]
    fn bursts_apply_as_flat_amounts() {
        let stats = EffectiveShipStats::default();
        let out = apply(
            stats.max_shields,
            0.0,
            &ctx(ShipDamage {
                shield_burst: 30.0,
                heat_burst: 25.0,
                cause: HazardType::PulsarBeam,
                lethal_on_depletion: true,
                ..Default::default()
            }),
        );
        assert_eq!(out.shields, stats.max_shields - 30.0);
        assert_eq!(out.heat, 25.0);
    }

    #[test]
    fn lethal_depletion_kills_with_cause() {
        let out = apply(
            1.0,
            0.0,
            &ctx(ShipDamage {
                shield_rate: 200.0,
                cause: HazardType::BlackHole,
                lethal_on_depletion: true,
                ..Default::default()
            }),
        );
        assert_eq!(out.shields, 0.0);
        assert_eq!(out.death_cause, Some(HazardType::BlackHole));
    }

    #[test]
    fn non_lethal_depletion_leaves_ship_alive() {
        let out = apply(
            5.0,
            0.0,
            &ctx(ShipDamage {
                shield_burst: 18.0,
                unshielded_heat_burst: 4.0,
                cause: HazardType::TopopolisCollision,
                ..Default::default()
            }),
        );
        assert_eq!(out.shields, 0.0);
        assert_eq!(out.heat, 0.0);
        assert_eq!(out.death_cause, None);
    }

    #[test]
    fn unshielded_hits_spill_into_heat() {
        let out = apply(
            0.0,
            10.0,
            &ctx(ShipDamage {
                shield_burst: 18.0,
                unshielded_heat_burst: 4.0,
                cause: HazardType::TopopolisCollision,
                ..Default::default()
            }),
        );
        assert_eq!(out.heat, 14.0);
        assert_eq!(out.death_cause, None);
    }

    #[test]
    fn unshielded_overheat_kills_with_damage_cause() {
        let stats = EffectiveShipStats::default();
        let out = apply(
            0.0,
            stats.heat_max - 1.0,
            &ctx(ShipDamage {
                unshielded_heat_burst: 4.0,
                cause: HazardType::TopopolisCollision,
                ..Default::default()
            }),
        );
        assert_eq!(out.death_cause, Some(HazardType::TopopolisCollision));
    }

    #[test]
    fn overheat_bleeds_shields_and_kills_as_overheat() {
        let stats = EffectiveShipStats::default();
        let mut scooping = ctx(ShipDamage::default());
        scooping.heat_rate = 15.0;
        scooping.cooling_active = false;

        let bleeding = apply(stats.max_shields, stats.heat_max, &scooping);
        assert_eq!(
            bleeding.shields,
            stats.max_shields - stats.overheat_shield_dmg * DT
        );
        assert_eq!(bleeding.death_cause, None);

        let dead = apply(0.0, stats.heat_max, &scooping);
        assert_eq!(dead.death_cause, Some(HazardType::Overheat));
    }

    #[test]
    fn instant_kill_ignores_shields() {
        let stats = EffectiveShipStats::default();
        let out = apply(
            stats.max_shields,
            0.0,
            &ctx(ShipDamage {
                destroyed_by: Some(HazardType::StarCollision),
                ..Default::default()
            }),
        );
        assert_eq!(out.death_cause, Some(HazardType::StarCollision));
    }

    #[test]
    fn dead_ship_cannot_die_again() {
        let mut already_dead = ctx(ShipDamage {
            destroyed_by: Some(HazardType::StarCollision),
            ..Default::default()
        });
        already_dead.is_dead = true;
        assert_eq!(apply(0.0, 0.0, &already_dead).death_cause, None);
    }

    #[test]
    fn shields_regen_only_when_not_under_fire() {
        let stats = EffectiveShipStats::default();
        let calm = apply(50.0, 0.0, &ctx(ShipDamage::default()));
        assert_eq!(calm.shields, 50.0 + stats.shield_regen_rate * DT);

        let under_fire = apply(
            50.0,
            0.0,
            &ctx(ShipDamage {
                heat_rate: 10.0,
                cause: HazardType::MicroquasarJet,
                ..Default::default()
            }),
        );
        assert_eq!(under_fire.shields, 50.0);
    }

    #[test]
    fn damage_heat_suppresses_cooling() {
        let stats = EffectiveShipStats::default();
        let cooled = apply(stats.max_shields, 50.0, &ctx(ShipDamage::default()));
        assert_eq!(cooled.heat, 50.0 - stats.cooling_rate * DT);

        let heated = apply(
            stats.max_shields,
            50.0,
            &ctx(ShipDamage {
                heat_burst: 5.0,
                cause: HazardType::PulsarBeam,
                ..Default::default()
            }),
        );
        assert_eq!(heated.heat, 55.0);
    }
}

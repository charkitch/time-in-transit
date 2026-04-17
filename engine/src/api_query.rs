use wasm_bindgen::prelude::*;

use crate::types::*;
use crate::api_state::with_engine_mut;
use crate::civilization::get_civ_state;
use crate::trading::get_market;
use crate::simulation::simulate_galaxy;
use crate::system_payload::build_cluster_summary;

#[wasm_bindgen]
pub fn get_player_state() -> Result<String, JsValue> {
    crate::api_state::with_engine(|engine| {
        serde_json::to_string(&engine.player_state)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
    })
}

#[wasm_bindgen]
pub fn set_player_state(json: &str) -> Result<(), JsValue> {
    let player_state: PlayerState = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse player state: {}", e)))?;

    with_engine_mut(|engine| {
        engine.player_state = player_state;
        Ok(())
    })
}

#[wasm_bindgen]
pub fn get_system_market(system_id: u32) -> Result<String, JsValue> {
    crate::api_state::with_engine(|engine| {
        let ps = &engine.player_state;
        let star = &engine.cluster[system_id as usize];
        let civ_state = get_civ_state(system_id, ps.galaxy_year, star.economy);
        let system_choices = ps.player_choices.get(&system_id);
        let market = get_market(
            system_id,
            civ_state.economy,
            Some(&civ_state),
            system_choices,
            Some(&ps.cargo),
        );

        serde_json::to_string(&market)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
    })
}

#[wasm_bindgen]
pub fn get_cluster_summary(galaxy_year: u32) -> Result<String, JsValue> {
    crate::api_state::with_engine(|engine| {
        let summary = build_cluster_summary(&engine.cluster, galaxy_year);
        serde_json::to_string(&summary)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
    })
}

#[wasm_bindgen]
pub fn apply_choice_effect(
    system_id: u32,
    event_id: &str,
    root_event_id: &str,
    choice_effect_json: &str,
) -> Result<String, JsValue> {
    let effect: ChoiceEffect = serde_json::from_str(choice_effect_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse choice effect: {}", e)))?;

    with_engine_mut(|engine| {
        let ps = &mut engine.player_state;

        ps.credits += effect.credits_reward;
        ps.fuel = (ps.fuel + effect.fuel_reward).max(0.0).min(STARTING_FUEL);

        let choices = ps.player_choices.entry(system_id).or_insert_with(SystemChoices::default);
        choices.trading_reputation += effect.trading_reputation;
        for good in &effect.banned_goods {
            if !choices.banned_goods.contains(good) {
                choices.banned_goods.push(*good);
            }
        }
        choices.price_modifier *= effect.price_modifier;
        if effect.faction_tag.is_some() {
            choices.faction_tag = effect.faction_tag.clone();
        }
        let tracking_id = if root_event_id.is_empty() { event_id } else { root_event_id };
        if !choices.completed_event_ids.contains(&tracking_id.to_string()) {
            choices.completed_event_ids.push(tracking_id.to_string());
        }
        for flag in &effect.sets_flags {
            choices.flags.insert(flag.clone());
        }
        for trigger in &effect.fires {
            choices.fired_triggers.insert(trigger.clone());
        }

        for flag in &effect.sets_galactic_flags {
            ps.player_history.galactic_flags.insert(flag.clone());
        }

        let years_advance = effect.galaxy_years_advance;
        if years_advance > 0 {
            ps.galaxy_year += years_advance;
        }

        ps.player_history.completed_events.insert(
            tracking_id.to_string(),
            CompletedEvent { system_id, galaxy_year: ps.galaxy_year },
        );

        if years_advance > 0 {
            simulate_galaxy(
                &engine.cluster,
                &mut engine.galaxy_state,
                &engine.player_state,
                years_advance,
            );
        }

        serde_json::to_string(&engine.player_state)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
    })
}

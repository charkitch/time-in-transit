use wasm_bindgen::prelude::*;

use crate::api_state::with_engine_mut;
use crate::types::*;

#[wasm_bindgen]
pub fn station_refuel() -> Result<String, JsValue> {
    with_engine_mut(|engine| {
        let ps = &mut engine.player_state;
        let stats = EffectiveShipStats::compute(&ps.ship_upgrades);
        let fuel_needed = (stats.max_fuel - ps.fuel).max(0.0);
        let cost = (fuel_needed * FUEL_PRICE_PER_UNIT).round() as i32;

        if cost <= 0 {
            return Err(JsValue::from_str("Tank already full"));
        }
        if ps.credits < cost {
            return Err(JsValue::from_str("Insufficient credits"));
        }

        ps.credits -= cost;
        ps.fuel = stats.max_fuel;

        serde_json::to_string(&*ps)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
    })
}

#[wasm_bindgen]
pub fn station_repair() -> Result<String, JsValue> {
    with_engine_mut(|engine| {
        let ps = &mut engine.player_state;
        let stats = EffectiveShipStats::compute(&ps.ship_upgrades);
        let shield_missing = (stats.max_shields - ps.shields).max(0.0).floor() as i32;
        let cost = shield_missing * SHIELD_REPAIR_COST_PER_POINT;

        if cost <= 0 {
            return Err(JsValue::from_str("Shields already full"));
        }
        if ps.credits < cost {
            return Err(JsValue::from_str("Insufficient credits"));
        }

        ps.credits -= cost;
        ps.shields = stats.max_shields;

        serde_json::to_string(&*ps)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
    })
}

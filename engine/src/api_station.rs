use wasm_bindgen::prelude::*;

use crate::api_state::{to_json, with_engine_mut};
use crate::types::*;

#[wasm_bindgen]
pub fn station_refuel() -> Result<String, JsValue> {
    with_engine_mut(|engine| {
        let ps = &mut engine.player_state;
        let stats = ps.effective_stats();
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

        to_json(&*ps)
    })
}

#[wasm_bindgen]
pub fn station_repair() -> Result<String, JsValue> {
    with_engine_mut(|engine| {
        let ps = &mut engine.player_state;
        let stats = ps.effective_stats();
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

        to_json(&*ps)
    })
}

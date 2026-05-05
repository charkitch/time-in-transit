use wasm_bindgen::prelude::*;

use crate::api_state::{from_json, to_json, with_engine_mut};
use crate::types::*;

#[wasm_bindgen]
pub fn trade_buy(good_json: &str, qty: u32, price: i32) -> Result<String, JsValue> {
    let good: GoodName = from_json(good_json, "good")?;

    with_engine_mut(|engine| {
        let ps = &mut engine.player_state;
        let total_cost = price * qty as i32;
        if ps.credits < total_cost {
            return Err(JsValue::from_str("Insufficient credits"));
        }
        let total_cargo: u32 = ps.cargo.values().sum();
        let stats = ps.effective_stats();
        if total_cargo + qty > stats.max_cargo {
            return Err(JsValue::from_str("Cargo hold full"));
        }

        ps.credits -= total_cost;
        let old_qty = *ps.cargo.get(&good).unwrap_or(&0);
        let old_basis = *ps.cargo_cost_basis.get(&good).unwrap_or(&0.0);
        let new_qty = old_qty + qty;
        ps.cargo_cost_basis.insert(
            good,
            (old_basis * old_qty as f64 + price as f64 * qty as f64) / new_qty as f64,
        );
        ps.cargo.insert(good, new_qty);

        to_json(&*ps)
    })
}

#[wasm_bindgen]
pub fn trade_sell(good_json: &str, qty: u32, price: i32) -> Result<String, JsValue> {
    let good: GoodName = from_json(good_json, "good")?;

    with_engine_mut(|engine| {
        let ps = &mut engine.player_state;
        let held = *ps.cargo.get(&good).unwrap_or(&0);
        let sell_qty = qty.min(held);
        if sell_qty == 0 {
            return Err(JsValue::from_str("No cargo to sell"));
        }

        ps.credits += price * sell_qty as i32;
        let remaining = held - sell_qty;
        if remaining == 0 {
            ps.cargo.remove(&good);
            ps.cargo_cost_basis.remove(&good);
        } else {
            ps.cargo.insert(good, remaining);
        }

        to_json(&*ps)
    })
}

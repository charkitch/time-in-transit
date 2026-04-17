use wasm_bindgen::JsValue;
use std::sync::Mutex;
use crate::types::*;

pub(crate) static ENGINE_STATE: Mutex<Option<EngineState>> = Mutex::new(None);

pub(crate) struct EngineState {
    pub cluster: Vec<StarSystemData>,
    pub galaxy_state: GalaxyState,
    pub player_state: PlayerState,
}

pub(crate) fn with_engine<F, R>(f: F) -> Result<R, JsValue>
where
    F: FnOnce(&EngineState) -> Result<R, JsValue>,
{
    let guard = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = guard.as_ref().ok_or_else(|| JsValue::from_str("Engine not initialized"))?;
    f(engine)
}

pub(crate) fn with_engine_mut<F, R>(f: F) -> Result<R, JsValue>
where
    F: FnOnce(&mut EngineState) -> Result<R, JsValue>,
{
    let mut guard = ENGINE_STATE.lock().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let engine = guard.as_mut().ok_or_else(|| JsValue::from_str("Engine not initialized"))?;
    f(engine)
}

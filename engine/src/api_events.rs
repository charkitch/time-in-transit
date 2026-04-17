use wasm_bindgen::prelude::*;

use crate::types::*;
use crate::api_state::with_engine;
use crate::civilization::get_civ_state;
use crate::system_generator::generate_solar_system;
use crate::events::{select_game_event, EventContext, EventPool};
use crate::content;

#[wasm_bindgen]
pub fn get_game_event(
    system_id: u32,
    context: &str,
    secret_base_id: &str,
    surface: &str,
    site_class: &str,
    host_type: &str,
) -> Result<String, JsValue> {
    with_engine(|engine| {
        let player_state = &engine.player_state;
        let star = &engine.cluster[system_id as usize];
        let civ_state = get_civ_state(system_id, player_state.galaxy_year, star.economy);
        let system_choices = player_state.player_choices.get(&system_id);
        let event_seed = player_state.galaxy_year.wrapping_mul(31337).wrapping_add(system_id.wrapping_mul(1009));
        let triggers = content::all_triggers();

        let pool = match context {
            "landing" => {
                if secret_base_id.is_empty() {
                    EventPool::Landing
                } else {
                    let system = generate_solar_system(star);
                    match system
                        .secret_bases
                        .iter()
                        .find(|b| b.id == secret_base_id)
                        .map(|b| b.base_type)
                    {
                        Some(SecretBaseType::Asteroid) => EventPool::AsteroidBase,
                        Some(SecretBaseType::OortCloud) => EventPool::OortCloudBase,
                        Some(SecretBaseType::MaximumSpace) => EventPool::MaximumSpace,
                        None => EventPool::Landing,
                    }
                }
            }
            "system_entry" => EventPool::SystemEntry,
            "proximity_star" => EventPool::ProximityStar,
            "proximity_base" => EventPool::ProximityBase,
            "planet_landing" => EventPool::PlanetLanding,
            "dyson_landing" => EventPool::DysonLanding,
            "topopolis_landing" => EventPool::TopopolisLanding,
            "triggered" => EventPool::Triggered,
            _ => EventPool::Landing,
        };

        let surface = if surface.is_empty() {
            None
        } else {
            serde_json::from_str::<SurfaceType>(&format!("\"{}\"", surface)).ok()
        };
        let site_class = if site_class.is_empty() { None } else { Some(site_class) };
        let host_type = if host_type.is_empty() { None } else { Some(host_type) };

        let ctx = EventContext {
            civ_state: &civ_state,
            player_state,
            system_choices,
            triggers: &triggers,
            surface,
            site_class,
            host_type,
            current_cluster: 0,
            current_system_id: system_id,
        };

        let event = select_game_event(pool, &ctx, event_seed);

        serde_json::to_string(&event)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
    })
}

#[wasm_bindgen]
pub fn get_landing_event(
    system_id: u32,
    secret_base_id: &str,
) -> Result<String, JsValue> {
    get_game_event(system_id, "landing", secret_base_id, "", "", "")
}

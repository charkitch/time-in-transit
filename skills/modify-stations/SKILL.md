---
name: modify-stations
description: Guide for finding and modifying stations in The Years Between the Stars — docking rules, station placement, station rendering, and station interaction flow (landing, docked UI, undocking). Use this skill whenever the user wants to change docking radius/speed, docking behavior, where stations appear, station visuals, or station interaction flow. Trigger on "station", "dock", "docking", "undock", "dock radius", "landing at station", "station placement", "station model".
---

## What "station" means in this codebase

Station work spans four areas:

1. **Docking mechanics** — when docking is allowed (distance/speed), nearest-station checks.
2. **Station generation/placement** — which planets get stations and how a "main station" is chosen.
3. **Station rendering** — station mesh and in-system orbit behavior.
4. **Station interaction flow** — flight -> landing event -> docked station UI -> undock.

---

## Files to read/modify

### Docking mechanics

**`src/game/constants.ts`** — docking thresholds:
- `DOCKING.maxDistance`
- `DOCKING.maxSpeed`

**`src/game/mechanics/DockingSystem.ts`** — core docking checks:
- `canDock()` — distance and speed gate
- `findNearestStation()` — picks nearest station and avoids docking when scenery is closer

**`src/game/Game.ts`** — docking flow:
- `tryDock()` — validates nearest station and docking constraints
- Alert behavior for failed docking attempts

### Station generation and placement (Rust engine)

**`engine/src/system_generator.rs`** — station placement rules:
- `has_station` assignment on generated planets
- `main_station_planet_id` selection
- Edit here to change station frequency/distribution

**`engine/src/types.rs`** — station-related data fields:
- `PlanetData.has_station`
- `SolarSystemData.main_station_planet_id`

### Station rendering and in-system behavior

**`src/game/rendering/meshFactory.ts`** — `makeStation()` mesh geometry

**`src/game/rendering/SceneRenderer.ts`** — station entities:
- Spawns station objects for planets with `hasStation`
- Sets station orbit radius/speed relative to parent planet
- Tags entities as `type: 'station'` for docking systems

### Station interaction UI flow

**`src/ui/LandingDialog/LandingDialog.tsx`** — pre-docked landing event UI and choice flow

**`src/ui/StationUI/StationUI.tsx`** — docked station screen (market and station actions)

**`src/ui/App.tsx`** — UI mode transitions and `onUndock` wiring

**`src/game/GameState.ts`** — UI modes (`'flight'`, `'landing'`, `'docked'`)

---

## Typical workflows

**Change docking radius/speed rules:**
1. `src/game/constants.ts` (`DOCKING`)
2. `src/game/mechanics/DockingSystem.ts` (if logic beyond thresholds is needed)
3. `src/game/Game.ts` (optional: failure messaging)

**Change how stations are distributed across planets/systems:**
1. `engine/src/system_generator.rs`
2. `engine/src/types.rs` (only if adding/changing station-related data shape)
3. Rebuild WASM: `npm run wasm:build` (or `cd engine && wasm-pack build --target web --out-dir pkg`)

**Change station look/shape:**
1. `src/game/rendering/meshFactory.ts` (`makeStation`)
2. `src/game/rendering/SceneRenderer.ts` (optional: orbit/scale/spawn behavior)

**Change station interaction flow (dock -> landing -> docked -> undock):**
1. `src/game/Game.ts` (flow control)
2. `src/ui/LandingDialog/LandingDialog.tsx`
3. `src/ui/StationUI/StationUI.tsx`
4. `src/ui/App.tsx` and/or `src/game/GameState.ts` (mode plumbing)

---

## Boundaries with other skills

- Use **`modify-trading`** for market prices, goods, station economy behavior, and trade UI specifics.
- Use **`modify-events`** for landing event narrative content, choices, and event selection logic.
- Use **`modify-ships`** for ship physics/handling not specific to station docking rules.

---
name: modify-dyson-shells
description: Guide for finding and modifying Dyson shell segments — shell generation, orbital mechanics, shell rendering, weather layers, orientation, and interaction in The Years Between the Stars. Use this skill whenever the user wants to change how Dyson shells look, adjust shell orientation or orbit, modify weather/clouds/lightning on shells, change shell colors or geometry, add new shell behaviors, or fix shell rendering issues. Trigger on "Dyson shell", "Dyson sphere", "iron star shells", "shell segment", "shell orientation", "shell weather", "megastructure", "concave", "convex", "shell orbit".
---

## Overview

Dyson shells are megastructure segments that orbit the iron star. They only appear in iron star systems. Each segment is a curved section of a sphere (like a panel of a Dyson sphere), with procedural weather (clouds, lightning) on its surface. Shells are distributed across multiple orbital planes to form a loose 3D shell around the star.

---

## Data structures

**`engine/src/types/world.rs`** — Rust data sent over WASM boundary:
- `DysonShellSegmentData` — full segment record: id, name, band/segment index, orbit params (`orbit_radius`, `orbit_speed`, `orbit_phase`, `orbit_inclination`, `orbit_node`), geometry (`curve_radius`, `arc_width`, `arc_height`), `color`, `interaction_mode`, `weather_bands`
- `DysonInteractionMode` — currently only `TargetableOnly`
- `DysonWeatherBandData` — per-band weather: `start_angle`, `end_angle`, `has_clouds`, `cloud_density`, `has_lightning`

**`src/game/engine.ts`** — TypeScript mirror interfaces:
- `DysonShellSegmentData` — matches Rust struct (camelCase)
- `DysonWeatherBandData`

---

## Files to read/modify

### Shell generation (Rust)

**`engine/src/system_generator.rs`** — `generate_dyson_shells()`:
- Only generates shells for `StarType::Iron`
- Creates 2–3 orbital bands, each with 6–10 segments
- Each segment gets random orbital inclination (±1.2 rad) and ascending node (0–2π) for 3D distribution
- Weather bands are sliced into 3 sectors per segment with varying cloud density and lightning
- Shell colors picked from `DYSON_COLORS` palette
- Orbit radii start at 1900–2500 and increase 1000–1500 per band

### Shell rendering (TypeScript / THREE.js)

**`src/game/rendering/mesh/dyson.ts`** — mesh creation:
- `makeDysonShellSegment()` creates the curved shell mesh using `SphereGeometry` with `phiStart`/`phiLength`/`thetaStart`/`thetaLength` to cut a panel. Has shader files under `src/game/rendering/mesh/shaders/`.
- `addDysonWeatherLayer()` adds a translucent weather overlay on the same geometry with clouds and animated lightning.

**`src/game/rendering/scene/buildDysonShells.ts`** and **`src/game/rendering/scene/orbitAndNpcUpdates.ts`** — placement and orbit:
- Initial placement positions each shell in 3D using orbital mechanics, then uses `lookAt(0,0,0)` plus a half-turn correction to orient the concave side toward the star.
- Orbit updates recompute 3D position each frame using `computeDysonShellPosition()`, then re-orient with the same pattern.
- `computeDysonShellPosition()` converts orbital elements (angle, radius, inclination, node) to Cartesian coordinates using standard orbital mechanics formulas.
- Entity type is `'dyson_shell'` in the `SceneEntity` interface (has optional `orbitInclination` and `orbitNode` fields).

### Orientation — how it works

The shell geometry's front face points along -Z in local space (because `phiStart` centers around phi=PI). When `lookAt(0,0,0)` is called, the group's -Z axis aims at the star — so the convex/outside face would point at the star. `rotateY(Math.PI)` flips it 180° so the concave/inside face points at the star instead. Both calls are needed: `lookAt` sets absolute rotation, `rotateY` applies a relative correction on top.

### 3D orbital positioning — how it works

Each shell has `orbitInclination` (tilt from equatorial plane, ±1.2 rad) and `orbitNode` (rotation of the orbital plane around Y, 0–2π). Position is computed as:
```
x = r * (cos(node) * cos(angle) - sin(node) * sin(angle) * cos(incl))
y = r * sin(angle) * sin(incl)
z = r * (sin(node) * cos(angle) + cos(node) * sin(angle) * cos(incl))
```
This distributes shells across a sphere rather than a flat ring.

### Shell interaction & UI

**`src/game/mechanics/DockingSystem.ts`** — `dyson_shell` entities count as nearby bodies for docking proximity checks.

**`src/ui/HUD/TargetInfoPanel.tsx`** and **`src/ui/HUD/HUD.tsx`** — when targeted, show shell name and "DYSON SHELL" type label.

**`src/ui/SystemMap/SystemMap.tsx`** — system map draws shell orbit arcs and includes "Dyson Shell" in the legend.

---

## Typical workflows

**Change shell colors:**
1. `engine/src/system_generator.rs` — edit `DYSON_COLORS` array
2. Rebuild WASM: `cd engine && wasm-pack build --target web`

**Change shell surface shader:**
1. `src/game/rendering/mesh/dyson.ts` and `src/game/rendering/mesh/shaders/dyson_shell*.glsl` — edit the shell mesh or shaders

**Change weather/clouds/lightning:**
1. `src/game/rendering/mesh/dyson.ts` and `src/game/rendering/mesh/shaders/dyson_weather.frag.glsl` — edit `addDysonWeatherLayer()` shader
2. `engine/src/system_generator.rs` — adjust `cloud_density` ranges or lightning flags

**Change shell size or curvature:**
1. `engine/src/system_generator.rs` — adjust `curve_radius`, `arc_width`, `arc_height` ranges
2. Rebuild WASM

**Change orbital distribution (how shells are spread around the star):**
1. `engine/src/system_generator.rs` — adjust `orbit_inclination` range (currently ±1.2 rad), `orbit_node`, orbit radii, segment count
2. Rebuild WASM

**Fix shell orientation (which side faces star):**
1. `src/game/rendering/scene/buildDysonShells.ts` and `src/game/rendering/scene/orbitAndNpcUpdates.ts` — check that initial placement and orbit updates both apply the same orientation correction after `lookAt`.

**Change shell count or band structure:**
1. `engine/src/system_generator.rs` — `band_count` (2–3) and `segment_count` (6–10)
2. Rebuild WASM

**Add new interaction modes:**
1. `engine/src/types/world.rs` — add variant to `DysonInteractionMode`
2. `src/game/engine.ts` — update TS enum
3. Handle new mode in renderer and game logic

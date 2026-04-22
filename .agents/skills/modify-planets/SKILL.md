---
name: modify-planets
description: Guide for finding and modifying planets — planet types, surface types, gas giants, planet rendering, rings, moons, clouds, city lights, and planet generation in The Years Between the Stars. Use this skill whenever the user wants to change how planets look, add a new planet type or surface type, modify planet colors or textures, adjust gas giant bands, change ring systems, add atmosphere effects, or tweak how planets are procedurally generated. Trigger on "planet", "gas giant", "surface type", "rings", "moons", "atmosphere", "city lights", "ocean world", "rocky planet".
---

## Planet type reference

**Rocky planet surface types** (in `engine/content-types/src/lib.rs` and re-exported through `engine/src/types/world.rs`): `Continental`, `Ocean`, `Marsh`, `Venus`, `Barren`, `Desert`, `Ice`, `Volcanic`, `ForestMoon`, `Mountain`

**Gas giant types** (in `engine/src/types/world.rs`): `Jovian`, `Saturnian`, `Neptunian`, `Inferno`, `Chromatic`, `Helium` (`Helium` is reserved for the Iron star profile)

---

## Files to read/modify

### Planet data & generation (Rust)

**`engine/src/types/world.rs`** and **`engine/content-types/src/lib.rs`** — data structures:
- `PlanetData` — the full planet record sent to the client
- `PlanetType` — `Rocky` vs `GasGiant`
- `SurfaceType` — all rocky subtypes
- `GasGiantType` — all gas giant subtypes
- Edit here to add new types or change data shape

**`engine/src/system_generator.rs`** — procedural generation:
- Surface type probability weights per star type
- Planet color palettes per surface type
- Moon count, ring presence, cloud layer flags
- Oort clouds, asteroid belts, orbital spacing
- Edit here to change what planets get generated and how

### Planet rendering (TypeScript / THREE.js)

**`src/game/rendering/mesh/planet/`** and **`src/game/rendering/mesh/planets.ts`** — primary planet mesh and shader code:
- `makePlanet()` — procedural rocky planet with GLSL shader
- `makeGasGiant()` — procedural gas giant with band shader
- `makeTexturedPlanet()` — textured variant using `src/game/rendering/planetSkins.ts`
- `makeTexturedGasGiant()` — textured gas giant variant
- `makeRingSystem()` / `makeRingMesh()` — ring systems
- Edit here for visual appearance, shader tweaks, geometry changes

**`src/game/rendering/mesh/planet/`** — planet enhancement effects:
- `addCityLights()` — night-side city light layer (habitable worlds)
- `addCloudLayer()` — animated cloud sphere
- `addSunAtmosphere()` — stellar atmosphere glow
- Edit here for atmosphere, clouds, or city light changes

**`src/game/rendering/planetSkins.ts`** — texture catalog. Currently references CC0 Solar System Scope textures. Edit here to swap in real texture files or enable textured rendering.

**`src/game/rendering/textureCache.ts`** — texture loading and disposal. Edit here if adding texture streaming or memory management.

### Planet display in UI

**`src/ui/SystemMap/SystemMap.tsx`** — orbital system map showing planets as colored circles with labels. Edit here to change how planets appear on the map (colors, orbit rings, labels).

**`src/game/GameState.ts`** — `currentSystem.planets` array holds the active system's planet data. Touch this when adding new fields to planet state.

**`src/game/Game.ts`** — manages the current system's planet objects. Touch when changing how planets are loaded or referenced during gameplay.

---

## Typical workflows

**Change a planet's visual appearance:**
1. `src/game/rendering/meshFactory.ts` — find `makePlanet()` or `makeGasGiant()` and edit the shader or color logic

**Add a new surface type:**
1. `engine/content-types/src/lib.rs` — add variant to `SurfaceType`
2. `engine/src/system_profiles.rs` and `engine/src/system_generator.rs` — add generation weights and any generation handling
3. `src/game/rendering/mesh/planet/` — handle shader/visual behavior for the new type
4. `src/ui/SystemMap/SystemMap.tsx` — add color for map display
5. Rebuild WASM: `npm run wasm:build` (or `cd engine && wasm-pack build --target web --out-dir pkg`)

**Add/change ring systems:**
1. `engine/src/system_generator.rs` — control which planet types get rings
2. `src/game/rendering/mesh/planet/rings.ts` — find `makeRingSystem()` or `makeRingMesh()` for visual changes

**Change cloud or atmosphere effects:**
1. `src/game/rendering/mesh/planet/` — `addCloudLayer()` or `addSunAtmosphere()`

**Change city lights:**
1. `src/game/rendering/mesh/planet/cityLights.ts` — `addCityLights()`

**Change planet display on system map:**
1. `src/ui/SystemMap/SystemMap.tsx`

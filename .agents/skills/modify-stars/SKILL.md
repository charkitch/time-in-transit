---
name: modify-stars
description: Guide for finding and modifying star visuals, star types, star colors, star rendering, and star data in The Years Between the Stars. Use this skill whenever the user wants to change how stars look, add a new star type, tweak star colors or sizes, modify the starfield background, change star glow effects, or adjust how stars appear in the cluster map or system view. Trigger on phrases like "change star color", "add a star type", "stars look wrong", "starfield", "star glow", "make the sun look different".
---

## Star type reference

Current star types (defined as string literals): `G`, `K`, `M`, `F`, `A`, `WD` (white dwarf), `NS` (neutron star), `PU` (pulsar), `XB` (X-ray binary), `MG` (magnetar), `BH` (black hole), `XBB` (X-ray burster), `SGR` (soft gamma repeater), `IRON` (iron star)

---

## Files to read/modify

### Star color & size data

**`src/game/constants.ts`** — `STAR_COLORS` and `STAR_TYPE_DISPLAY` lookup tables. This is the TypeScript source of truth for star colors and display names. Edit here for quick color changes without touching Rust.

**`engine/src/system_generator.rs`** — Rust-side star data:
- `star_color()` — returns an RGB hex color per star type
- `star_radius_range()` — returns `(min, max)` radius for each type
- These feed into the planet/system generation and are sent over the WASM boundary

If the Rust colors diverge from `src/game/constants.ts`, the Rust values control what gets serialized into `SolarSystemData`.

### Star rendering (in-system view)

**`src/game/rendering/scene/buildStar.ts`** and **`src/game/rendering/mesh/entities.ts`** — primary rendering files for stars:
- `makeGlowSprite()` — creates the glowing star sprite seen when flying in a system
- Star color and radius are sourced from the star's `SolarSystemData` fields
- Edit here to change glow size, sprite texture, additive blending, corona effects

**`src/game/rendering/SceneRenderer.ts`** — places the star in the scene, sets up the point light that illuminates planets. Edit here to:
- Change how the star light affects planet shading
- Adjust star position or scene composition
- Change the scene's ambient light

### Starfield background

**`src/game/rendering/effects.ts`** — `createStarfield()` generates the background particle field of distant stars. Edit here to:
- Change starfield density, size, color distribution
- Add shader effects to background stars
- Modify the depth/parallax of the backdrop

### Star display in maps

**`src/ui/ClusterMap/ClusterMap.tsx`** — renders stars as colored dots on the galaxy map. Uses `STAR_COLORS` from `constants.ts`. Edit here to change star dot size, color, selection highlight, or label appearance.

**`src/ui/HUD/HUD.tsx`** — displays the current star type and name in the HUD. Edit here for display-name changes.

### Star generation (procedural)

**`engine/src/cluster_generator.rs`** — assigns star types when generating the 30-star cluster. Star type probabilities/weights live here. Edit to change how common each star type is.

---

## Typical workflows

**Change a star's color:**
1. `src/game/constants.ts` — update `STAR_COLORS[type]`
2. `engine/src/system_generator.rs` — update `star_color()` to match (keep in sync)
3. Rebuild WASM: `npm run wasm:build` (or `cd engine && wasm-pack build --target web --out-dir pkg`)

**Change star glow appearance:**
1. `src/game/rendering/mesh/entities.ts` — find `makeGlowSprite()`

**Change starfield density/look:**
1. Only `src/game/rendering/effects.ts` — find `createStarfield()`

**Add a new star type:**
1. `engine/src/system_generator.rs` — add to `star_color()` and `star_radius_range()`
2. `engine/src/cluster_generator.rs` — add to generation weights
3. `src/game/constants.ts` — add to `STAR_COLORS` and `STAR_TYPE_DISPLAY`
4. Rebuild WASM

**Change star size:**
1. `engine/src/system_generator.rs` — update `star_radius_range()` for the type
2. Rebuild WASM

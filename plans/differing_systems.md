# Star-Type-Driven System Generation

## Context

Star type currently has **zero effect** on system generation beyond visual star radius (handled only in TypeScript). A magnetar produces the same cozy rocky planets and gas giants as a sun-like G-type. The Rust `StarType` enum only has 5 main-sequence types (G/K/M/F/A), while TypeScript uses all 15. This plan makes star type the primary driver of what kind of system gets generated.

## Scope: Rust engine changes only

TypeScript mirroring and rendering (new surface types in shaders, etc.) are follow-up work. This plan covers the Rust engine.

---

## Step 1: Expand `StarType` enum

**File:** `engine/src/types.rs` (lines 88-100)

Add all 15 star types and update weights to match TypeScript:

```rust
pub enum StarType {
    G, K, M, F, A,       // main sequence
    WD, HE,              // remnant
    NS, PU, MG, SGR,     // compact extreme
    XB, XBB,             // accretion
    BH, SBH,             // gravitational extreme
}

impl StarType {
    pub const ALL: &[StarType] = &[
        G, K, M, F, A, WD, HE, NS, PU, XB, MG, BH, SBH, XBB, SGR
    ];
    pub const WEIGHTS: &[f64] = &[
        0.12, 0.10, 0.08, 0.06, 0.04,  // main sequence ~40%
        0.08, 0.07, 0.06, 0.05, 0.06,  // exotic first half
        0.05, 0.06, 0.04, 0.07, 0.06,  // exotic second half ~60%
    ];
}
```

This matches the TypeScript weights from `ClusterGenerator.ts` lines 30-34.

## Step 2: Add new `SurfaceType` variants

**File:** `engine/src/types.rs` (lines 102-113)

```rust
pub enum SurfaceType {
    // ... existing 9 ...
    Irradiated,       // glassy/crystalline, radiation-blasted
    AccretionDebris,  // dark metallic, hot-streaked captured material
}
```

- **Irradiated** — for magnetars, pulsars, SGRs, neutron stars. Visually distinct from Barren.
- **AccretionDebris** — for black holes, x-ray binaries. Dark metallic with hot streaks.

No new `PlanetType` or `GasGiantType` variants needed.

## Step 3: Create `SystemProfile` struct + `get_profile()`

**File:** `engine/src/system_generator.rs`

Add a profile struct that parameterizes the generation:

```rust
struct SystemProfile {
    star_radius_range: (f64, f64),
    inner_rocky_min: i32,
    inner_rocky_max: i32,
    outer_gas_min: i32,
    outer_gas_max: i32,
    asteroid_chance: f64,
    inner_orbit_start: f64,
    surface_weights: &'static [(SurfaceType, f64)],
    moon_surface_weights: &'static [(SurfaceType, f64)],
    secret_base_multiplier: f64,
}
```

## Step 4: Define profiles by star category

**`get_profile(star_type) -> SystemProfile`** maps each type:

| Category | Types | Planets | Gas Giants | Surfaces | Secret Base Mult |
|----------|-------|---------|------------|----------|-----------------|
| **Normal** | G, K, F, A | 1-3 rocky | 1-3 | Current weights (habitable possible) | 1.0 |
| **Normal (M-dwarf)** | M | 1-3 rocky | 0-2 | Current weights, closer orbits | 1.0 |
| **Remnant** | WD, HE | 1-2 rocky | 0-1 | Barren/Ice/Desert heavy, no habitable | 1.5 |
| **Compact Extreme** | NS, PU, MG, SGR | 0-2 rocky | 0 | Irradiated 50%, Barren 25%, Volcanic 15%, Ice 10% | 2.0 |
| **Accretion** | XB, XBB | 1-2 rocky | 0-2 | Irradiated 35%, AccretionDebris 20%, Barren 20%, Volcanic 15%, Desert 10% | 1.5 |
| **Gravitational Extreme** | BH, SBH | 0-1 rocky | 0-1 | AccretionDebris 45%, Irradiated 25%, Barren 20%, Ice 10% | 3.0 |

Star radius ranges (matching existing TypeScript `STAR_RADIUS_RANGE`):
- G/K/F: 400-600, A: 500-700, M: 300-450
- WD: 30-50, HE: 200-280
- NS/PU: 60-100, MG: 8-12, SGR: 100-140
- XB: 300-450, XBB: 280-400
- BH: 150-250, SBH: 500-800

Define static surface weight arrays per category (5-6 const arrays total).

**Edge case — zero planets:** If both rocky and gas counts roll 0, force 1 rocky planet. The station needs somewhere to be.

## Step 5: Refactor `generate_solar_system()` to use profiles

**File:** `engine/src/system_generator.rs` (line 148+)

Mechanical replacements in the existing function:

1. `let profile = get_profile(star.star_type);` at the top
2. `rng.int(1, 3)` for inner → `rng.int(profile.inner_rocky_min, profile.inner_rocky_max)`
3. `rng.int(1, 3)` for outer → `rng.int(profile.outer_gas_min, profile.outer_gas_max)`
4. `rng.next() < 0.5` for asteroids → `rng.next() < profile.asteroid_chance`
5. `400.0 + rng.float(0.0, 200.0)` for star radius → `rng.float(profile.star_radius_range.0, profile.star_radius_range.1)`
6. `ROCKY_SURFACE_WEIGHTS` → `profile.surface_weights`
7. `MOON_SURFACE_WEIGHTS` → `profile.moon_surface_weights`
8. Secret base chances multiplied by `profile.secret_base_multiplier`
9. Force at least 1 planet if both counts are 0

**RNG determinism note:** Changing planet counts changes the number of RNG calls, so existing systems will shift. This is fine for a pre-release game — the seed is fixed but the world hasn't shipped.

## Step 6: Update `generate_rocky_clouds()` for new surface types

**File:** `engine/src/system_generator.rs` (line 83)

Add `Irradiated` and `AccretionDebris` to the catch-all branch (no clouds, same as Barren/Desert/Volcanic). They already fall into the `_ =>` arm, so this may just need a comment, but verify the match is exhaustive.

## Step 7: Update cluster generator weights

**File:** `engine/src/cluster_generator.rs`

No code changes needed — `pick_star_type()` already iterates `StarType::ALL` and `StarType::WEIGHTS`. After Step 1 expands those, it automatically uses all 15 types.

## Step 8: Update tests

**File:** `engine/src/system_generator.rs` (tests module)

- Existing `generates_planets` and `deterministic` tests should still pass
- Add: test each star category produces expected planet count ranges
- Add: test compact extreme stars never produce habitable surfaces (Continental/Ocean/Marsh/ForestMoon)
- Add: test gravitational extreme stars have AccretionDebris surfaces
- Add: test zero-planet edge case forces at least 1 planet

---

## Files to modify

1. `engine/src/types.rs` — StarType enum expansion, new SurfaceType variants
2. `engine/src/system_generator.rs` — SystemProfile, get_profile(), refactored generate_solar_system(), new tests

That's it for Rust. `cluster_generator.rs` needs no code changes.

## Verification

1. `cd engine && cargo build --target wasm32-unknown-unknown` — compiles
2. `cargo test` — all tests pass
3. Inspect a few generated systems manually: print output for one star of each category and verify planet counts/surfaces match expectations

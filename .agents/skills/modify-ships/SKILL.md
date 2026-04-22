---
name: modify-ships
description: Guide for finding and modifying ships — player ship physics, NPC ships, fleet battle ships, ship meshes/visuals, ship stats, and ship behavior in The Years Between the Stars. Use this skill whenever the user wants to change how ships look, adjust ship speed or physics, add a new ship type, change NPC ship behavior, modify fleet combat ships, or tweak ship stats like shields, fuel, or heat. Trigger on "ship", "player ship", "NPC ship", "fleet ship", "ship mesh", "ship speed", "shields", "hull", "ship design", "ship geometry".
---

## Ship categories in this codebase

1. **Player ship** — the one the player flies; physics in `src/game/flight/FlightModel.ts`, state in `src/game/GameState.ts`
2. **NPC ships** — civilian/trade ships flying commerce routes; defined in `src/game/mechanics/NPCSystem.ts`
3. **Fleet battle ships** — combat ships in background faction battles; defined in `src/game/mechanics/FleetBattleSystem.ts`

---

## Files to read/modify

### Player ship

**`src/game/flight/FlightModel.ts`** — all player ship physics:
- Thrust, velocity, rotation (pitch/yaw/roll)
- Boost mechanics and heat buildup
- Fuel drain during boost
- Collision detection radius
- `jumpCost()` — fuel calculation for hyperspace jumps
- Edit here for feel/handling changes

**`src/game/GameState.ts`** — `PlayerState` interface: position, velocity, shields, fuel, heat, speed, cargo capacity. Edit here to add new player ship stats or state fields.

**`src/game/Game.ts`** — manages player ship in the game loop:
- Shield regeneration rate
- Fuel harvest logic
- Input application to flight model
- Damage/death handling

**`src/game/constants.ts`** — ship-related constants: `HYPERSPACE` config, `FUEL_HARVEST`, `GAS_GIANT_SCOOP`, `BATTLE_DANGER_RANGE`, `BATTLE_WEAPONS_RANGE`

### NPC ships

**`src/game/mechanics/NPCSystem.ts`** — NPC ship generation and behavior:
- `NPCShipState` type — position, velocity, cargo, faction, target planet
- Spawn logic — how many ships per system, what they carry
- Trade route AI — movement between planets
- Edit here for NPC ship count, behavior, cargo types

**`src/game/rendering/scene/buildNPCShips.ts`** and **`src/game/rendering/scene/orbitAndNpcUpdates.ts`** — render and update NPC ships via `makeNPCShipMesh()`.

### Fleet battle ships

**`src/game/mechanics/FleetBattleSystem.ts`** — fleet combat ships:
- `FleetShip` type — faction, stats, position
- `FleetShipRuntime` — live combat state (health, behavior, target)
- Behavior states: approach, strafe, retreat
- Weapon range, damage, projectile speed
- Edit here for combat AI, fleet ship stats, battle behavior

**`src/game/rendering/scene/buildFleetBattle.ts`** and **`src/game/rendering/scene/orbitAndNpcUpdates.ts`** — render and update fleet battle ships via `makeFleetShipMesh()`.

### Ship visuals / meshes

**`src/game/rendering/mesh/entities.ts`** (exported through `src/game/rendering/meshFactory.ts`) — ship 3D geometry:
- `makeNPCShipMesh()` — NPC civilian ship mesh
- `makeFleetShipMesh()` — fleet combat ship mesh (varies by faction)
- Edit here to change ship shapes, sizes, colors, materials

**`src/game/rendering/effects.ts`** — ship visual effects:
- Projectile creation (`createBattleProjectiles()`)
- Explosion effects (`createBattleExplosions()`)
- Thrust/engine particle effects
- Edit here for weapon FX, engine trails, explosions

---

## Typical workflows

**Change player ship handling (speed, turning, boost):**
1. `src/game/flight/FlightModel.ts`

**Change player ship stats (shields, fuel capacity, heat):**
1. `src/game/GameState.ts` — update `PlayerState` defaults
2. `src/game/constants.ts` — check relevant constants

**Change NPC ship behavior or spawn rate:**
1. `src/game/mechanics/NPCSystem.ts`

**Change fleet ship combat stats or AI:**
1. `src/game/mechanics/FleetBattleSystem.ts`

**Change ship 3D appearance:**
1. `src/game/rendering/mesh/entities.ts` — find `makeNPCShipMesh()` or `makeFleetShipMesh()`

**Change weapon/projectile effects:**
1. `src/game/rendering/effects.ts`

**Add a new ship type:**
1. `src/game/rendering/mesh/entities.ts` — add new mesh function
2. `src/game/mechanics/NPCSystem.ts` or `FleetBattleSystem.ts` — use the new mesh
3. If the type needs Rust data: update the relevant module under `engine/src/types/`, then rebuild WASM

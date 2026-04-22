---
name: modify-combat
description: Guide for finding and modifying combat systems in The Years Between the Stars — fleet battles, weapons, projectiles, explosions, combat AI behavior, and battle triggers. Use this skill whenever the user wants to change how fleet battles work, adjust weapon damage or range, change ship combat AI, modify projectile or explosion visuals, tune battle difficulty, or change when/where battles trigger. Trigger on "combat", "fleet battle", "weapons", "damage", "projectile", "explosion", "battle", "enemy ships", "attack", "strafe".
---

## Combat system overview

Combat in this game is primarily **fleet-vs-fleet battles** happening in the background between NPC factions — the player flies through ongoing battles. There's no player-vs-ship dogfighting system currently.

---

## Files to read/modify

### Core combat logic

**`src/game/mechanics/FleetBattleSystem.ts`** — the entire fleet battle simulation:
- `FleetShip` / `FleetShipRuntime` types
- Behavior state machine: `approach` → `strafe` → `retreat`
- Damage calculation, health tracking, ship destruction
- Targeting logic — which ship attacks which
- Projectile state and movement
- Battle outcome/resolution
- **Edit here for almost all gameplay changes to combat**

**`src/game/constants.ts`** — combat tuning constants:
- `BATTLE_WEAPONS_RANGE` — how close before ships open fire
- `BATTLE_DANGER_RANGE` — how close before the player is in danger

### Combat rendering

**`src/game/rendering/effects.ts`** — battle visual effects:
- `createBattleProjectiles()` — spawns projectile meshes
- `createBattleExplosions()` — explosion particle bursts
- Projectile update logic (movement, lifetime)
- Edit here for visual changes to weapons, hits, and explosions

**`src/game/rendering/scene/buildFleetBattle.ts`** and **`src/game/rendering/scene/orbitAndNpcUpdates.ts`** — battle scene management:
- Fleet ship mesh instantiation and updates
- Integrates `FleetBattleSystem` state into the THREE.js scene
- Handles adding/removing ships as they die
- Edit here for rendering-level battle changes (LOD, pooling, etc.)

### Battle triggers & integration

**`src/game/Game.ts`** — where battles are detected and triggered:
- Checks enemy proximity using `BATTLE_DANGER_RANGE`
- Calls into `FleetBattleSystem` to start battles
- Handles player entering/leaving battle zones
- Edit here to change when battles start, where they occur, or how the player interacts with them

### Fleet ship visuals

**`src/game/rendering/mesh/entities.ts`** (exported through `src/game/rendering/meshFactory.ts`) — `makeFleetShipMesh()`:
- 3D geometry for combat ships
- Faction-based color/shape variation
- Edit here to change what combat ships look like

---

## Typical workflows

**Change weapon range or damage:**
1. `src/game/mechanics/FleetBattleSystem.ts` — find damage/range values
2. `src/game/constants.ts` — check `BATTLE_WEAPONS_RANGE`

**Change combat AI behavior (how ships move and attack):**
1. `src/game/mechanics/FleetBattleSystem.ts` — find the behavior state machine

**Change projectile or explosion appearance:**
1. `src/game/rendering/effects.ts` — `createBattleProjectiles()` / `createBattleExplosions()`

**Change combat ship visuals:**
1. `src/game/rendering/mesh/entities.ts` — `makeFleetShipMesh()`

**Change when/where battles trigger:**
1. `src/game/Game.ts` — find proximity/trigger checks
2. `src/game/constants.ts` — `BATTLE_DANGER_RANGE`

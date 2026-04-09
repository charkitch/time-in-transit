---
name: modify-factions
description: Guide for finding and modifying factions, political systems, civilizations, and galaxy simulation in The Years Between the Stars. Use this skill whenever the user wants to add or rename a faction, change faction colors, modify political types, change how civilizations evolve over time, adjust faction control of systems, or change how the galaxy simulation works. Trigger on "faction", "political", "civilization", "empire", "Korathi", "Veleron", "Ashundi", "Draimar", "Solossa", "Nyxenth", "democracy", "theocracy", "dictatorship", "galaxy simulation", "era".
---

## Faction reference

Current factions (defined in `src/game/data/factions.ts`):
- Korathi, Veleron, Ashundi, Draimar, Solossa, Nyxenth

Each has an `id`, display name, and color.

---

## Files to read/modify

### Faction definitions (TypeScript)

**`src/game/data/factions.ts`** — the 6 named factions with colors and IDs. Edit here to:
- Rename a faction
- Change a faction's color
- Add a new faction

### Faction generation & control (Rust)

**`engine/src/factions.rs`** — faction generation and control state:
- How factions are assigned to systems at galaxy creation
- Contestation logic — how systems get fought over
- `SystemFactionState` — which faction controls a system and how strongly
- Edit here for structural changes to faction dynamics

**`engine/src/simulation.rs`** — galaxy-level simulation run each time the player jumps:
- Faction strength fluctuations
- System contestation and control changes
- Player influence ripples (player actions affect nearby systems)
- Random macro events (crises, golden ages)
- Edit here for how the galaxy evolves over time

### Political types & civilization

**`engine/src/civilization.rs`** — political type derivation per era:
- Maps era + faction + prosperity → `PoliticalType`
- Banned goods per political type
- Price modifiers per economy
- Edit here to change what political systems exist or how they affect trade/events

**`engine/src/types.rs`** — data enums:
- `PoliticalType` — `Democracy`, `Theocracy`, `MilitaryDictatorship`, `Technocracy`, etc.
- `EconomyType` — economy categories per system
- `GalaxyState` / `SystemSimState` — simulation state shapes
- Edit here to add new political or economy types

### Faction display in UI

**`src/ui/ClusterMap/ClusterMap.tsx`** — faction control visualization on the galaxy map. Edit here to change how faction territory is shown (colors, borders, contested indicators).

**`src/ui/HUD/HUD.tsx`** — shows current system's faction name and color. Edit here for HUD-level faction display changes.

---

## Typical workflows

**Rename a faction or change its color:**
1. `src/game/data/factions.ts`

**Add a new faction:**
1. `src/game/data/factions.ts` — add entry
2. `engine/src/factions.rs` — include in generation logic
3. Rebuild WASM: `npm run wasm:build` (or `cd engine && wasm-pack build --target web --out-dir pkg`)

**Add a new political type:**
1. `engine/src/types.rs` — add to `PoliticalType`
2. `engine/src/civilization.rs` — add derivation logic and trade effects
3. Rebuild WASM

**Change how galaxy simulation evolves:**
1. `engine/src/simulation.rs`
2. Rebuild WASM

**Change faction display on the cluster map:**
1. `src/ui/ClusterMap/ClusterMap.tsx`

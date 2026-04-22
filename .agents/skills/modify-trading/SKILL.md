---
name: modify-trading
description: Guide for finding and modifying the trading/economy system in The Years Between the Stars — trade goods, market prices, cargo, NPC trading routes, station UI, and economy types. Use this skill whenever the user wants to add a new trade good, change prices, modify the market system, change NPC cargo behavior, adjust the station interface, or change how economies work. Trigger on "trade", "market", "cargo", "goods", "prices", "economy", "station", "buy", "sell", "trading", "commodities".
---

## Trade goods reference

Current goods (defined in `engine/content-types/src/lib.rs` as `GoodName` and re-exported through `engine/src/types/civilization.rs`):
`StarwindRations`, `HullskinLace`, `BurialSunstone`, `RainChoirSpools`, `ReactorSalt`, `PilgrimMaps`, `WitnessInk`, `GraviticBone`, `EmbassyMasks`, `DreamResin`, `SilenceVials`, `JurisdictionSeals`, `DebtPetals`, `MemoryCaskets`, `OathFilaments`, `QuasarGlass`, `WeatherKeys`, `AncestralBackups`, `SurrenderCodes`, `ImpossibleSeeds`, `RelativisticAsh`, `PulsarSilk`, `CombatIntelligence`, `TransferPlasma`

Economy types: defined in `engine/src/types/civilization.rs` as `EconomyType`.

---

## Files to read/modify

### Market data (Rust)

**`engine/src/trading.rs`** — the primary market file:
- Market generation per economy type
- Base prices, supply/demand ranges per good
- Which goods are available in which economies
- Edit here to change prices, add goods, or change availability

**`engine/src/types/civilization.rs`** and **`engine/content-types/src/lib.rs`** — data structures:
- `GoodName` enum — all tradeable goods
- `EconomyType` enum — economy categories
- `MarketEntry` — price/quantity per good
- Edit here to add a new good or economy type

**`engine/src/civilization.rs`** and **`engine/src/trading.rs`** — legality and banned goods per political type. Edit here to change which goods are legal, licensed, or prohibited.

### NPC trading

**`src/game/mechanics/NPCSystem.ts`** — NPC cargo behavior:
- NPC cargo generation (what they carry, buy/sell prices)
- Commerce routes between planets
- Edit here to change NPC trade behavior or cargo variety

### Player trading

**`src/game/Game.ts`** — cargo management:
- Docking trade interaction
- Fuel purchase at stations
- Cargo buy/sell execution

**`src/game/GameState.ts`** — player cargo state:
- `player.cargo` — current cargo hold
- `player.cargoCostBasis` — cost tracking per good

### Trading UI

**`src/ui/StationUI/StationUI.tsx`** — the station market/trading interface. Edit here to change how the market screen looks and works.

**`src/ui/CommDialog/CommDialog.tsx`** — NPC communication and trade dialogs (hailing ships, negotiating). Edit here for NPC dialogue changes.

---

## Typical workflows

**Change a good's price or availability:**
1. `engine/src/trading.rs`
2. Rebuild WASM: `npm run wasm:build` (or `cd engine && wasm-pack build --target web --out-dir pkg`)

**Add a new trade good:**
1. `engine/content-types/src/lib.rs` — add to `GoodName`
2. `engine/src/trading.rs` — add price/availability data
3. `engine/src/civilization.rs` — decide if it's ever banned
4. `src/game/mechanics/NPCSystem.ts` — include in NPC cargo logic
5. `src/ui/StationUI/StationUI.tsx` — display in market UI
6. Rebuild WASM

**Change the station market UI:**
1. `src/ui/StationUI/StationUI.tsx`

**Change NPC ship cargo behavior:**
1. `src/game/mechanics/NPCSystem.ts`

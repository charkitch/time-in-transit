# Game Loop Improvement: Plans A + C

## Context
The current game loop (Flight -> Dock -> Event -> Trade -> Jump -> Repeat) becomes repetitive. Time dilation is atmospheric but doesn't drive decisions. Factions are decorative. This plan combines **Plan A (Time Dilation as Core Mechanic)** and **Plan C (Faction Standing & Consequence)** to add strategic depth to jumps and a political layer to the galaxy.

Plans B (Ship Upgrades) and D (Endgame/Legacy) are saved in `plans/` for later.

---

## Plan A: "The Passage of Time" — Make Time Dilation the Core Decision

### A1. Commodity Booms
Deterministic 50-year boom windows per system where one good sells at 3x. Seeded per `(systemId, Math.floor(galaxyYear / 50))`.
- Add `getMarketBooms(systemId, galaxyYear)` to `TradingSystem.ts`
- Apply boom multiplier in `getMarket()`
- Show boom indicators on `ClusterMap.tsx` for visited systems (based on last-known data, may be stale)

### A2. Temporal Contracts
Landing events can offer timed delivery jobs: "Deliver 5 Computers to system X before year Y." Deadlines in galaxy years force short-jump route planning. Pay 3-5x normal margins.
- New `src/game/mechanics/ContractSystem.ts` — `Contract` type: `{ targetSystemId, good, qty, deadlineYear, reward }`
- Add `activeContracts: Contract[]` to `GameState.ts`
- Check expiry in `advanceGalaxyYear`; check completion on dock at target system
- Add 2-3 contract-offering events to `events.ts`

### A3. Reputation Decay Over Time
`effectiveRep = storedRep * max(0, 1 - yearsSinceVisit / 500)`. Staying local preserves trading advantage; exploring means starting fresh.
- Modify rep calculation in `TradingSystem.ts` using `lastVisitYear`

### A4. Stale Intelligence on Cluster Map
Show "LAST SEEN: YEAR X (Y years ago)" per visited system. Dim proportionally to staleness. Faction/economy data shown is from last visit and may be wrong now.
- `ClusterMap.tsx` reads `lastVisitYear` and `galaxyYear` to compute staleness

### A Files
- `src/game/mechanics/TradingSystem.ts` — booms, rep decay
- `src/game/GameState.ts` — contracts state
- `src/game/data/events.ts` — contract-offering events
- `src/game/Game.ts` — contract completion on dock, expiry on jump
- `src/ui/ClusterMap/ClusterMap.tsx` — staleness indicators, boom hints
- New: `src/game/mechanics/ContractSystem.ts`

---

## Plan C: "The Galaxy Remembers" — Faction Standing & Consequence

### C1. Faction Reputation System
Per-faction rep from -10 (hostile) to +10 (allied), starting at 0. Changes from:
- Event choices: existing `factionTag` field maps to controlling faction
- Trading: +small rep when trading in faction-controlled systems
- Contested systems: new "CHOOSE ALLEGIANCE" event with big rep swings (+3/-3)
- New `src/game/mechanics/FactionReputationSystem.ts`
- Add `factionReputation: Record<string, number>` to `GameState.ts`

### C2. Faction-Gated Consequences
- **Hostile (rep <= -5)**: Landing event is always a toll/shakedown. Prices +40%. Risk of shield damage on entry.
- **Friendly (rep >= 5)**: Prices -15%. Exclusive ally events (intel, gifts, faction missions).
- **Contested systems**: New "CHOOSE ALLEGIANCE" event where player supports controlling faction, contesting faction, or stays neutral.

### C3. Fleet Battle Participation
When allied with a faction (rep >= 3) and entering their battle, player can support them:
- Flying near enemy fleet deals damage to enemy ships
- Player takes reduced damage (ally fleet provides cover)
- +2 rep with allies, -2 with enemies
- Modify `checkBattleZone` in `Game.ts` to check faction rep and apply different logic

### C4. Faction Standing on Cluster Map
Color-code visited systems green/yellow/red by standing with controlling faction. Show faction reputation summary panel.
- `ClusterMap.tsx` reads `factionReputation` + `factionMemory`

### C Files
- New: `src/game/mechanics/FactionReputationSystem.ts`
- `src/game/GameState.ts` — faction reputation
- `src/game/Game.ts` — allegiance events, battle participation
- `src/game/mechanics/TradingSystem.ts` — faction price mods
- `src/game/mechanics/FleetBattleSystem.ts` — player participation hooks
- `src/game/data/events.ts` — allegiance/faction-gated events
- `src/ui/ClusterMap/ClusterMap.tsx` — faction visualization

---

## Implementation Order
1. **A4** — Stale intelligence on cluster map (small, visual, immediate impact)
2. **A3** — Reputation decay (small, extends existing mechanic)
3. **A1** — Commodity booms (medium, new trading mechanic)
4. **C1** — Faction reputation tracking (foundation for C2-C4)
5. **C4** — Faction standing on cluster map (visual payoff for C1)
6. **C2** — Faction-gated consequences (prices, events)
7. **A2** — Temporal contracts (medium, new system + events)
8. **C3** — Fleet battle participation (transforms combat)

## Verification
- Play through 5+ jump cycles checking that boom windows and staleness create interesting jump decisions
- Verify contracts expire correctly across era boundaries
- Verify reputation decay formula produces good feel (not too fast, not too slow)
- Test faction rep accumulation across multiple system visits
- Confirm hostile/friendly price modifiers apply correctly
- Test battle participation: allied player takes less damage, enemies take damage
- Verify cluster map correctly shows staleness, booms, and faction colors
- Run existing tests to ensure no regressions

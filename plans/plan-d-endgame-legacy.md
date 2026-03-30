# Plan D: "The Long Haul" — Endgame Objectives & Legacy
**Scope: Small-Medium | Uniqueness: High**

Give the game narrative arc, win conditions, and a sense of personal history.

## Changes
1. **Three Win Conditions**:
   - **The Cartographer**: Visit all 30 systems. Progress shown on cluster map (X/30).
   - **The Magnate**: Accumulate 50,000 credits (including cargo value).
   - **The Witness**: Complete unique events in 15+ systems (data already in `playerChoices.completedEventIds`).
   - Each triggers a narrative epilogue + option to continue or restart.
   - New `ObjectiveSystem.ts`; progress tracked in `GameState.ts`

2. **Ship's Journal** — Persistent log recording: first visits, event choices, faction changes, era transitions. Presents existing data (`jumpLog`, `playerChoices`, `factionMemory`) narratively. Accessed via "J" key.
   - New `JournalUI.tsx`

3. **Era Transition Narration** — When a jump crosses an era boundary (every 250 years), display interstitial text about what changed. Check `Math.floor(oldYear/250) !== Math.floor(newYear/250)` in `arriveInSystem`.
   - Small addition to `Game.ts`

4. **Statistics Screen** — Total years, systems visited, jumps, lifetime credits earned.

## Files
- New: `src/game/mechanics/ObjectiveSystem.ts`
- New: `src/ui/JournalUI/JournalUI.tsx`
- `src/game/GameState.ts` — objective progress, journal entries
- `src/game/Game.ts` — era transition, objective checks
- `src/ui/HUD/HUD.tsx` — objective progress indicator
- `src/ui/App.tsx` — journal mode routing

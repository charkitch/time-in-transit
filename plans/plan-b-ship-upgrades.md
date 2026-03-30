# Plan B: "The Ship Grows With You" — Ship Upgrades & Progression
**Scope: Medium | Uniqueness: Low (but satisfying)**

Turn credits from a score counter into a meaningful resource with ship modules.

## Changes
1. **Ship Modules** — 8-10 upgrades: Fuel Tank (+2/+5), Cargo Bay (+10/+20), Heat Sink (-30%/-50% heat), Shield Gen (faster regen, +50/+100 max), Drive Tuning (+20%/+40% speed), Scanner Range (see system details before visiting). Each has a credit cost + tech level requirement.
   - New `ShipUpgradeSystem.ts` with module definitions
   - `installedModules: string[]` in `GameState.ts`

2. **Station Upgrades Tab** — New tab in `StationUI.tsx` filtered by system tech level.

3. **Module Effects Threaded Into Systems** — `FlightModel.ts` reads speed modules, `HyperspaceSystem.ts` reads fuel tank, `Game.ts` reads heat sink for battle damage, etc.

4. **Secret Base Exclusive Modules** — Unique upgrades only available from secret bases (e.g., "Smuggler's Hold" — hidden cargo immune to inspections).

## Files
- New: `src/game/mechanics/ShipUpgradeSystem.ts`
- `src/game/GameState.ts` — installed modules
- `src/ui/StationUI/StationUI.tsx` — upgrades tab
- `src/game/flight/FlightModel.ts` — speed module
- `src/game/mechanics/HyperspaceSystem.ts` — fuel module
- `src/game/Game.ts` — heat/shield module effects

# Plan: A Less Hollow Universe

**Goal:** The galaxy should feel alive (`story/universal_vibes.md`), but right now a
lot of stories end abruptly, a lot of events have no lasting impact, and planets are
thin. This plan captures the audit findings and the remediation work. Planets are the
stated priority; planet markets are a new requested mechanic.

**Status:** Diagnosis complete. Audit skill built. Build work NOT started — three
scoping decisions are open (see "Open decisions" below). Pick those, then execute.

---

## What's already done

- **Audit skill** — `skills/audit-events/` (symlinked into `~/.claude/skills/`, same
  convention as `modify-events`). Invoke with `/audit-events`.
  - `analyze.mjs` — parses all events + triggers (registers the custom `!Condition`
    YAML tags), traces every flag/trigger/faction-tag from where it's set to where
    it's read, and reports the mechanical hollowness signals. Run: `node
    skills/audit-events/analyze.mjs` (works from anywhere in the repo; needs the
    repo-root `node_modules` for `js-yaml`).
  - `SKILL.md` — the method: run the analyzer, read each section as a defect class,
    then do the narrative-judgment passes the script can't (non-branching
    consequences, finales that just stop, vibe check).

## How the content system works (orientation for picking this up cold)

- Events are YAML in `engine/content/events/<pool>/`, auto-discovered by
  `engine/build.rs` into a generated registry (drop a file in, `cargo build` picks it
  up). Types: `engine/content-types/src/lib.rs`.
- Selection + conditions: `engine/src/events.rs`. Pools: `Landing`, `AsteroidBase`,
  `OortCloudBase`, `MaximumSpace`, `Triggered`, `SystemEntry`, `ProximityStar`,
  `ProximityBase`, `PlanetLanding`, `DysonLanding`, `TopopolisLanding`.
- A choice's `ChoiceEffect` levers: `creditsReward`, `tradingReputation`,
  `fuelReward`, `priceModifier`, `bannedGoods`, `setsFlags`, `fires`,
  `setsGalacticFlags`, `factionTag`, `galaxyYearsAdvance`, `grantsUpgrade`,
  `recruitsCrew`. Conditions read state back (`FlagSet`, `GalacticFlag`,
  `HasFactionTag`, `SurfaceIs`, `SiteClassIs`, `HostTypeIs`, `ChainTargetHere`, …).
- Story chains are declared in `engine/src/content.rs::story_chains()`
  (quasar_array, cartographers_wake, burnt_accord, harvest_scar).
- **Landing flow** (`src/game/mechanics/InteractionSystem.ts`): station landings set
  `returnMode: 'docked'` → after the event resolves, `setUIMode('docked')` opens the
  `StationUI` market (`engineGetMarket(systemId)`). Planet / dyson / topopolis
  landings set `returnMode: 'flight'` → event resolves, landing site is removed, back
  to flight. **No market on planets today.** Surface/site/host are passed to the
  engine from the planet's `surfaceType` (one of 10) + site classification
  (`rocky_landable`, `gas_stable`, `gas_volatile`).
- Validation: `cd engine && cargo test` — content tests catch unknown crew ids, dead
  condition references, chain/flag mismatches, and per-pool event counts.

## The diagnosis (analyzer output, 2026-06-22)

80 events across 11 pools, 1 trigger.

1. **Choices that go nowhere — 17 flags + 7 faction tags set but never read.** The
   "ends abruptly" feeling, quantified. Worst offender: `burnt_accord_finale.yaml`
   (`maximum_space/`) — the climax of a **5-stage** quest. Its five endings set 13
   flags (`hadiq_ally`, `korathi_accord`, `renn_ally`, `tessaly_captured`,
   `accord_collapsed`, `draimar_exposed`, `thennic_peace`, …) and 3 faction tags
   (`faction-0/2/3`), and **nothing reads any of them.** The biggest completable
   story has no epilogue. Faction alignment is the same: `corp_ally`
   (`landing/acquisition_proposal`), `gov_ally`/`rebel_ally` (`landing/dead_drop_message`),
   `alien_reliquary_trusted` (`landing/alien_orrery_reliquary_audit`),
   `alien_graveloom_tithe_paid` (`landing/alien_graveloom_tithe`) — pick a side, the
   world never notices.
2. **A "Consequence" chain that ignores your choice.** `harvest_scar` is typed
   `Consequence`, but `harvest_scar_return.yaml` fires identically whether you chose
   `harvest_scar_inlet_built` or `harvest_scar_relic_preserved` — it narrates "gone,
   or rebuilt, or preserved behind glass depending on who's telling the story" to
   hand-wave the choice away. Both flags are in the dangling list.
3. **Planets are the thinnest pool; 8 of 10 surfaces have no content.** Only `desert`
   (`dust_choir`) and `ocean` (`ocean_kelpline_anchorage`) have dedicated events.
   Continental, Marsh, Venus, Barren, Ice, Volcanic, ForestMoon, Mountain all fall
   through to the single surface-agnostic `landfall_stone_market` (gated only on
   `rocky_landable`) — so an ice world, a volcanic hell, and a forest moon all show
   the *same* bedrock market. Calm gas bands (`gas_stable`) get nothing but the bare
   "DOCKING CLEARANCE GRANTED" fallback (`src/ui/LandingDialog/LandingDialog.tsx`).
   Generic planet events (the 4 non-Crown ones) are all the same shape: one
   `+reputation` choice, an optional buy/sell, and a "move on / no effect". The other
   4 planet events are Crown-specific. Contrast: `topopolis_landing` has 22 events
   with entrances, interiors, and biome variety — the model planets should follow.
4. **Three consequence levers are NEVER used:** `setsGalacticFlags` (0),
   `grantsUpgrade` (0), `bannedGoods` (0). Events can change the galaxy permanently,
   reward gear, and disrupt trade — they never do. Untapped depth.
5. **Thin singleton pools:** `proximity_star`, `proximity_base`, `system_entry`,
   `triggered` each have 1 event; `dyson_landing` has 2. Each repeats the same beat
   on every encounter.

## Open decisions (resolve these, then build)

These were about to be asked when we paused — they fork the implementation:

1. **Planet market mechanic shape.** (a) A "trade with the locals" *choice* inside
   certain planet events that opens the existing market UI, flavored by surface
   [recommended — reuses all market plumbing, rarity = how few events offer it];
   (b) a distinct planet market selling a surface-specific subset of goods (more
   work, genuinely different feel); (c) reuse the station market as-is on any
   landable planet (simplest, least flavored).
2. **Planet market rarity / gate.** (a) Habitable surfaces only
   (Continental/Ocean/Marsh/ForestMoon); (b) tie to system prosperity/tech;
   (c) low flat seed-stable chance per planet. User's steer: "rarer and flavored."
3. **Consequence-wiring depth this pass.** (a) Content-only epilogues — revisit
   events gated on the dangling flags (burnt_accord homecoming, faction
   acknowledgement, harvest_scar branches on the real choice) [recommended, no engine
   changes, high return]; (b) content + systemic — also wire `HasFactionTag` into
   prices/access and burnt_accord outcomes into the galaxy sim via the unused
   `setsGalacticFlags` lever (touches Rust); (c) defer — planets only this pass.

## Proposed work (once decisions are made)

- **A. Planet surface content (priority).** Author `planet_landing` events for the 8
  uncovered surfaces, vibe-aligned ("interesting like Earth, no generic biome
  worlds"). At least a couple should set a flag a revisit reads, to model the
  not-hollow pattern. Add a `gas_stable` event so calm gas bands aren't empty. Keep
  the `event_counts` test (`engine/src/events.rs`) passing.
- **B. Planet markets** — per decisions 1 & 2.
- **C. Dangling-consequence epilogues** — per decision 3; start with burnt_accord
  (highest return) and harvest_scar (make the Consequence branch).
- **D. Stretch:** flesh out the singleton pools; reach for the unused levers
  (`grantsUpgrade` for a planet-found relic, `setsGalacticFlags` for accord outcomes).

## Related plans (keep consistent)

- `plans/crew-recruitment-events.md` — "crew are met, not hired"; declining should
  leave a flag, not just close the dialog. Same anti-hollowness principle; 4 of 5
  crew are not yet recruitable in content (good payoff hooks for new events).
- `plans/surface-simulation.md` — "since you last visited" arrival narration; a
  natural consumer for galactic flags / faction outcomes set by epilogue events.
- `story/universal_vibes.md` — the north star for every player-facing line.

## Verification

- `cd engine && cargo test` after any content change (content validation + pool
  counts).
- `node skills/audit-events/analyze.mjs` — re-run; the dangling-flag and surface-
  coverage lists should shrink as work lands.

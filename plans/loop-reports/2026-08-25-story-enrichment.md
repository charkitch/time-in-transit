# Loop report — story enrichment — 2026-08-25

## Iteration 1 — Dangling-wiring test

- **Did:** Added `engine/src/content_wiring.rs`, cargo tests that cross-check
  every producer/consumer pair in the content graph: flags, galactic flags,
  faction tags, and triggers, in both directions. Consumers include event and
  trigger conditions, story-chain completion flags (`content.rs`), climate
  override flags (`p0_nuclear` shape, `climate.rs`), and the simulation's
  faction-tag reads (`simulation.rs`). Extracted the shared event-walking
  helpers from `content.rs` tests into `content::test_support` so both test
  modules reuse them.
- **Verified:** `cargo test` 84 passed / 0 failed (3 new wiring tests),
  `cargo clippy` clean, `npm run lint:ts` clean.
- **Found:** 17 flags and 4 faction tags are produced but never consumed —
  now declared in `OPEN_FLAG_HOOKS` / `OPEN_FACTION_TAG_HOOKS` with tests
  failing on stale entries, so each Phase 2 payoff must retire its entry.
  Newly discovered beyond the plan's original list: crew-outcome flags
  (`renn_ally`, `renn_captured`, `seval_ally`, `tessaly_friend`,
  `thennic_peace`) and generated-faction tags (`faction-0/2/3`) that the
  simulation ignores. Both added to the Phase 2 backlog. Trigger wiring and
  consumed-side checks passed with zero violations — no conditions reference
  flags that can never be set.
- **Proposed removals (needs human approval):** none.
- **Commit:** 0c4c2ec Add content wiring validation tests

## Iteration 2 — Dead-end choice report

- **Did:** Added `report_dead_end_choices` to `engine/src/content_wiring.rs` —
  an `#[ignore]`d informational test (run:
  `cargo test -- --ignored report_dead_end`) that walks every choice tree,
  including nested `nextMoment` branches, and lists terminal choices whose
  effect changes nothing (no flags, triggers, credits, reputation, crew,
  upgrades, price/ban effects).
- **Verified:** `cargo test` 84 passed / 1 ignored (the report), clippy and
  eslint clean.
- **Found:** 78 terminal no-effect choices. Most are legitimate walk-away
  flavor. But the report exposed a serious bug class: **soft declines
  permanently kill story chains.** Every choice marks its event completed
  (`api_query.rs:128`), chain-start events default to `Unique` and never
  repeat, so `ARRAY_OORT_BRIEFING no_time_today` ("No time today"),
  `CARTOGRAPHERS_WAKE_INTRO mind_own_drink`, and `BURNT_ACCORD_SIGNAL
  ignore_cube` each foreclose their entire multi-stage chain forever while
  reading like deferrals. All three shipped chains are killable this way.
  Added as the top Phase 2 backlog item.
- **Proposed removals (needs human approval):** none.
- **Commit:** cc47fa9 Add dead-end choice report

## Iteration 3 — HasStation world-consistency condition

- **Did:** Added `EventCondition::HasStation` to the schema
  (`content-types/src/lib.rs`), checked via a new
  `EventContext.host_has_station` (`events.rs`), plumbed across the WASM
  boundary as a `has_station` param on `get_game_event` and passed from the
  landed planet's `hasStation` in `InteractionSystem.ts` (station landings
  pass `true`, secret bases `false`; the payload path derives it from the
  system's planets). Gated the four price-touching `planet_landing` events
  (`LANDFALL_STONE_MARKET`, `OCEAN_KELPLINE_ANCHORAGE`,
  `CROWN_SUNMERE_ARRIVAL_SHORE`, `CROWN_SUNMERE_HELIOSTAT_GROVE`) with
  `!HasStation` — no text changed. New validation test
  `planet_landing_market_effects_require_station` enforces the rule
  permanently; reputation-only effects are exempt since goodwill plausibly
  travels to the system's ports (kept `DUST_CHOIR` et al. available on
  stationless planets).
- **Verified:** `cargo test` 85 passed, full `npm run build`, `npm run lint`,
  and all 42 Playwright e2e tests pass.
- **Found:** The initial stricter rule (reputation counts as market-touching)
  flagged 7 events; reading them showed reputation-only beats like
  `DUST_CHOIR` are consistent without a station, so the rule was narrowed
  deliberately rather than over-gating flavor content.
- **Proposed removals (needs human approval):** none.
- **Commit:** 92a28cc Add HasStation event condition and gate market events

## Iteration 4 — Soft declines defer chains instead of killing them

- **Did:** Added `defersCompletion` to `ChoiceEffect` (schema + TS type):
  when true, `apply_choice_effect` skips both completion records, so the
  event stays eligible and "not now" actually means not now. Marked all 21
  decline paths across the three quest chains (`quasar_array`,
  `cartographers_wake`, `burnt_accord`) — terminal declines plus the
  intermediate choices on their paths, since TS applies each step's effect
  and any non-deferring step records completion. Accept paths are untouched
  and still complete normally. New path-walking validation test
  `chain_events_cannot_be_silently_killed`: on chain events, every
  root-to-leaf choice path must set a flag / fire a trigger or defer.
- **Verified:** `cargo test` 86 passed, full build, lint, all 42 e2e green.
- **Found:** `deliver_silently` on `BURNT_ACCORD_HANDOFF` looked like an
  alternate stage completion but the accept branch shows Hadiq hands the
  case back — so it's a genuine walk-away and defers like the rest. No
  choice prose was changed; several decline labels could later acknowledge
  re-approachability ("perhaps another time") as flavor polish.
- **Proposed removals (needs human approval):** none.
- **Commit:** (this commit)

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
- **Commit:** (this commit)

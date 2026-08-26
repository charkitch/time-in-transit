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
- **Commit:** ccbe0c8 Soft declines defer story chains instead of killing them

## Iteration 5 — Faction alignment payoff events

- **Did:** Authored three new `landing`-pool events, each gated on
  `HasFactionTag` and `rare` repeatability: `CORP_PREFERRED_VENDOR` (the
  acquisition board's ledger remembers you — discounted port or resell your
  rate for CR/-rep), `REBEL_QUIET_BERTH` (hand-written dock assignment, no
  cameras — fuel+prices, a courier gig, or pay your fees on the books),
  `GOV_CLEARED_LANES` (customs pre-clearance — fuel+rep, or consult for the
  inspectorate for CR/-rep). Faction tags are per-system, so each payoff
  reads as the system where you aligned remembering it. All three tags now
  have real condition consumers; the simulation effects remain as before.
- **Verified:** `cargo test` 86 passed (wiring tests confirm the tags are
  consumed), lint clean. No TS changes, so no e2e run.
- **Found:** `alien_reliquary_trusted` still lacks a consumer — split into
  its own backlog item for a reliquary-themed beat rather than forcing it
  into this batch.
- **Proposed removals (needs human approval):** none.
- **Commit:** 292cc31 Author faction alignment payoff events

## Iteration 6 — Surface markets actually open

- **Did:** Landing on a planet with `hasStation` now opens the port screen
  after the landing event resolves (and immediately on revisits), reusing
  `StationUI` in `docked` mode as the surface port — trade, refuel, and
  repair at the settlement the event described. Plumbing: `hostHasStation`
  on `PendingGameEventContext`, set from the landed planet in
  `InteractionSystem.landAtSite`, consumed in `completeLanding` to pick the
  final UI mode. `undock()` already handles the no-docked-station case, so
  UNDOCK lifts off from the surface. Freshly applied event price modifiers
  show in the port because `completeLanding` refreshes
  `currentSystemPayload.market` before the mode switch.
- **Verified:** cargo tests, full build, lint green. E2e: 41/42 passed; the
  one failure (`boot.spec.ts` music controls) is unrelated to this change,
  passed in both prior full runs, and passes in isolation on retry — flake
  under load (that run took 10.1m vs the usual 2.6m).
- **Found:** Stationless-planet landings still return to flight (correct).
  The stone market fantasy is now real: land, resolve the event, buy at -15%.
  Planet-flavored goods (next item) will make these ports feel distinct.
- **Proposed removals (needs human approval):** none.
- **Commit:** 53d00f9 Open surface port market on stationed-planet landings

## Iteration 7 — Planet-flavored goods

- **Did:** Markets now reflect the world they belong to. `MarketHost`
  (planet type + surface type) reaches `get_market`; each surface type and
  gas giants have a 3-good leaning table (gas giants: Reactor Salt, Weather
  Keys, Hullskin Lace; ocean: Rain-Choir Spools, Weather Keys, Impossible
  Seeds; ice: Memory Caskets, Silence Vials, Oath Filaments; …). Leaning
  goods get +0.30 listing probability, one is always guaranteed on the
  shelf, and the 9-good cap trims off-theme goods first. The host planet id
  travels from the docking/landing context through
  `get_system_market(system_id, host_planet_id)`; both orbital stations and
  surface ports are flavored by their planet.
- **Anti-exploit invariant:** prices and stock moved from the shared listing
  RNG to per-good streams, so every port in a system quotes identical
  prices no matter what its shelf carries — buying at one port and selling
  at another in the same system nets nothing. Covered by
  `host_ports_quote_identical_prices`; flavor coverage by
  `host_ports_always_list_a_leaning_good`. Side effect: sell-only quotes now
  match what the good would list at, and absolute prices shifted once
  (new stream) — relative structure unchanged.
- **Verified:** `cargo test` 88 passed (2 new market tests); build, lint,
  e2e in this iteration's final run.
- **Proposed removals (needs human approval):** none.
- **Commit:** 00197d7 Planet-flavored market listings with port price parity

## Iteration 8 — Reliquary clearance payoff

- **Did:** Authored `RELIQUARY_CLEARANCE` (`landing` pool, `rare`, gated on
  `HasFactionTag alien_reliquary_trusted`): the audit event promised "legal
  clearances recognized by nearby ports," and now they exist — a licensing
  dispute dissolves when the port terminal sees the reliquary vouches for
  you. Choices: let the seal work (+rep, prices −10%), carry a consigned
  crystal node (CR 350), or tell the awed officer what the crystal rings
  are like (+rep). Removed the tag from `OPEN_FACTION_TAG_HOOKS` — the
  stale-entry check would have failed otherwise, which is the burn-down
  mechanism working as designed. Only `faction-0/2/3` remain as open tag
  hooks.
- **Verified:** `cargo test` 88 passed, lint clean. Content-only, no e2e.
- **Proposed removals (needs human approval):** none.
- **Commit:** 3948090 Author reliquary clearance payoff event

## Iteration 9 — Gov crackdown follow-up chain

- **Did:** The game's second trigger-driven chain. `report_authorities` on
  `DEAD_DROP_MESSAGE` now sets `dead_drop_reported` and fires
  `gov-crackdown-ready` (new `triggers/gov_chain.yaml`), consumed by
  `GOV_CRACKDOWN_FOLLOWS_UP` (`triggered/` pool): on a later landing in
  that system, the concourse is cleaner, the cell was "processed," and an
  old dockhand notes the free clinic kept the same hours as the vanished
  noodle stalls. Choices: accept the commendation (CR 400, +rep), quietly
  settle the clinic's arrears (CR −300), or ask what "processed" means.
  Written to the tone canon's "sometimes we intercede in ways we will get
  sad about."
- **Decision:** `delete_message` stays silent by design — wiping the chip
  erases the thread; recorded in the backlog.
- **Verified:** `cargo test` 88 passed — the wiring tests validated the new
  flag/trigger producer-consumer pairs with no allowlist additions, which
  is the Phase 1 guardrails doing their job on new content. Lint clean;
  content-only, no e2e.
- **Proposed removals (needs human approval):** none.
- **Commit:** 36b44d3 Add gov crackdown follow-up chain

## Iteration 10 — harvest_scar branch echoes

- **Did:** The chain's stage-1 choice (`inlet_built` vs `relic_preserved`)
  now echoes forward. `HARVEST_SCAR_RETURN` and
  `HARVEST_SCAR_DAUGHTER_HOUSE` each gained two branch-conditioned choices
  (choice-level `requires: AnyFlagSet …`) that only appear for the path the
  player ruled on five centuries earlier — walking the inlet cut on your
  word, or pressing a palm to the plating kept on it; citing the inlet's
  cost or the wall's lesson to the daughter-house assemblies. No existing
  text or choices were altered; the branch-blind options remain for both
  paths. Both flags are now consumed and retired from `OPEN_FLAG_HOOKS`
  (15 remain).
- **Verified:** `cargo test` 88 passed, lint clean. Content-only, no e2e.
- **Proposed removals (needs human approval):** none.
- **Commit:** e016c63 Echo harvest_scar branch choice in later stages

## Iteration 11 — Crew-outcome epilogues

- **Did:** Three epilogue events for the burnt_accord finale endings, all
  `landing` pool, unique. `BURNT_ACCORD_RENNS_NETWORK` (`renn_ally`): an
  Ashundi consulate honor-guards the ship that carries Renn — escort
  privileges, a network errand, or asking after the others.
  `BURNT_ACCORD_THE_LISTED` (`seval_ally` + `renn_captured` +
  `tessaly_captured` + `hadiq_captured`, one ending's full bundle): Seval's
  dividends arrive while a concourse kiosk cycles the faces of the people
  you sold — collect, anonymously fund their advocates, or walk past.
  `BURNT_ACCORD_THE_ALMOST_WAR` (`tessaly_friend`): Tessaly's book "The
  Almost-War" spreads port to port, with a `thennic_peace`-gated choice to
  read the peace dispatches to dockside children. Seven flags retired from
  `OPEN_FLAG_HOOKS` (8 remain).
- **Found:** The finale's endings are also where the `faction-0/2/3` tags
  come from — the generated-faction payoff item now has clear fiction to
  build on (Korathi = faction-0, Ashundi = faction-2, Draimar = faction-3).
- **Verified:** `cargo test` 88 passed, lint clean. Content-only, no e2e.
- **Proposed removals (needs human approval):** none.
- **Commit:** (this commit)

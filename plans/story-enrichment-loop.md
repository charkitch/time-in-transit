# Story Enrichment Loop (POC)

An autonomous improvement loop, run via Claude Code `/loop`, that enriches the
universe of stories: no dead-end nubs, choices have consequences, event chains
continue, and event text never asserts world state (markets, stations, ruins)
that the system doesn't actually have.

## How to run it

From the repo root, in a Claude Code session:

```
/loop /story-enrichment-loop
```

The `story-enrichment-loop` skill (`skills/story-enrichment-loop/SKILL.md`)
runs one iteration; `/loop` repeats it, self-paced. Runs on the Claude
subscription; no API keys or extra infra. Stop any time with Esc or by asking
the loop to stop.

## Loop rules

- **One backlog item per iteration.** Small, reviewable, bounded — never
  "improve until done".
- **Work on branch `loop/story-enrichment`**, one commit per completed item.
  Create the branch from `main` if it doesn't exist; never commit to `main`
  or any other branch. **Never push, never open a PR** — everything stays
  local until the human reviews.
- **Never remove existing content** (events, choices, flags, chains,
  narrative text) — depth is the fun of the game; pay things off rather than
  pruning. Removal candidates go in the loop report under "Proposed removals
  (needs human approval)" and are left untouched.
- **Every iteration must pass** `cargo test --manifest-path engine/Cargo.toml`
  and `npm run lint` before committing. Content validation runs in cargo test —
  it is the cheap gate. E2E only if TS/UI surfaces change.
- **Respect canon and tone**: `story/universal_vibes.md`,
  `story/universal_truths/the_quasar_war.md`. Vibrant galaxy, peaceful-ish,
  trade and astonishment over combat; no fallen-galaxy despair, no exposition
  dumps, no quest-giver phrasing.
- **Use the domain skills** in `.agents/skills/` (`modify-events`,
  `modify-story-chains`) as the how-to for content edits.
- **Write a report every iteration** (see below), then check the next backlog
  item's box or add newly discovered work to the backlog.
- If an iteration fails (tests won't pass, scope too big), revert, report the
  failure honestly in the loop report, and move on — never leave the branch red.

## Loop reports

One file per loop session: `plans/loop-reports/YYYY-MM-DD-<slug>.md`, appended
per iteration:

```markdown
## Iteration N — <backlog item>
- **Did:** what changed (files, event ids)
- **Verified:** test/lint results
- **Found:** anything discovered (new nubs, gaps) → added to backlog
- **Commit:** <sha> <message>
```

## Key files

| What | Where |
|---|---|
| Event YAML content | `engine/content/events/**` (11 pools), `engine/content/triggers/` |
| Event schema | `engine/content-types/src/lib.rs` (`GameEvent` :260, `ChoiceEffect` :154, `EventCondition` :211) |
| Selection/eligibility | `engine/src/events.rs` (`select_game_event` :221, `check_condition` :53) |
| Effect application | `engine/src/api_query.rs:70-146` |
| Story chain defs | `engine/src/content.rs:30-115` (`story_chains()`) |
| Station generation | `engine/src/system_generator.rs:245` (`has_station`) |
| Content validation tests | `engine/src/content.rs:203-518` |

## Backlog

Ordered: guardrails first (they mechanically find the rest), then payoffs.

### Phase 1 — guardrails

- [x] **Dangling-wiring test.** Landed as `engine/src/content_wiring.rs`:
      every flag/trigger/galactic-flag/faction-tag consumed by a condition has
      a producer, and every producer has a consumer. `OPEN_FLAG_HOOKS` /
      `OPEN_FACTION_TAG_HOOKS` in that file are the authoritative
      open-hook lists (17 flags + 4 tags) — the tests fail on stale entries,
      so Phase 2 payoffs must remove their entry as they land.
- [x] **Dead-end choice report.** Landed in `engine/src/content_wiring.rs`
      as `report_dead_end_choices` — run with
      `cargo test -- --ignored report_dead_end`. Informational, not a gate:
      78 terminal no-effect choices exist; most are legitimate walk-away
      flavor, and the report makes each one a deliberate decision.
- [x] **World-consistency condition.** `EventCondition::HasStation` landed:
      engine check in `events.rs`, plumbed across the WASM boundary
      (`get_game_event` `has_station` param) from the landed planet's
      `hasStation` in `InteractionSystem.ts`. Validation test
      `planet_landing_market_effects_require_station` enforces the rule:
      price/trade-ban effects require `!HasStation`; reputation alone is
      exempt (goodwill travels). Gated `LANDFALL_STONE_MARKET`,
      `OCEAN_KELPLINE_ANCHORAGE`, and two `CROWN_SUNMERE` events; all text
      preserved.

### Phase 2 — pay off existing nubs

- [x] **Soft declines silently kill story chains.** Fixed via
      `defersCompletion: true` on `ChoiceEffect`: a deferring apply skips the
      completion record, so the event stays eligible and the player can
      return. Applied to all 21 decline paths across the three quest chains
      (intermediate choices on decline paths defer too, since completion is
      recorded at every apply step). New validation test
      `chain_events_cannot_be_silently_killed` enforces the invariant
      path-wise: every chain-event choice path must advance the chain or
      defer. A future authored hard-refusal earns its permanence by setting
      an explicit outcome flag.
- [x] **Faction alignment matters.** Authored one `HasFactionTag`-gated
      landing event per core tag: `CORP_PREFERRED_VENDOR`,
      `REBEL_QUIET_BERTH`, `GOV_CLEARED_LANES` — each `rare` so standing
      keeps mattering on revisits; tags are per-system, so the payoff reads
      as "this system remembers you."
- [x] **Surface markets actually open.** Landing on a stationed planet now
      opens the port screen (`StationUI`, mode `docked`) after the landing
      event resolves — including on revisits — instead of dropping straight
      back to flight. `hostHasStation` rides the pending-event context from
      `InteractionSystem`; UNDOCK lifts off from the surface (no docked
      station to snap to). Market state stays per-system, and the freshly
      applied price modifiers show immediately in the port.
- [x] **Planet-flavored goods.** `MarketHost` (planet type + surface type)
      now biases listing composition: every surface type and gas giants have
      a 3-good leaning table (`host_leanings` in `trading.rs`), leaning goods
      get +0.30 listing probability, at least one is always on the shelf, and
      the listing cap trims off-theme goods first. Prices/stock moved to
      per-good RNG streams so every port in a system quotes identical prices
      — intra-system dock-hopping can't be arbitraged (tested). Host planet
      id flows from docking/landing context through `get_system_market`.
- [x] **`alien_reliquary_trusted` payoff.** `RELIQUARY_CLEARANCE` landed:
      the audit event's promised "legal clearances recognized by nearby
      ports" now actually happen — a licensing snarl dissolves when the
      port sees the reliquary vouches for you. Tag retired from the
      open-hook list.
- [x] **`DEAD_DROP_MESSAGE` gov branch.** `report_authorities` now sets
      `dead_drop_reported` and fires `gov-crackdown-ready`
      (`triggers/gov_chain.yaml`), paid off by `GOV_CRACKDOWN_FOLLOWS_UP` —
      the second trigger-driven chain in the game, with the intercession
      melancholy the tone canon calls for. Decision: `delete_message`
      staying silent is intentional — a wiped chip leaves nothing for
      anyone to follow up on.
- [x] **`harvest_scar` branch divergence.** Both later stages now carry
      branch-conditioned choices that only appear for the path you ruled on
      500 years earlier (walk the inlet they cut / touch the plating they
      kept; cite the inlet's cost / the wall's lesson to the daughter-house
      assemblies). Existing text and choices untouched; both flags now
      consumed and retired from the open-hook list.
- [x] **`alien_graveloom_tithe_paid`** — `ALIEN_GRAVELOOM_WEAVE` landed: the
      tithed flight logs come back as a woven memorial thread pilgrims
      navigate by. Flag consumed and retired from the open-hook list.
- [x] **Crew-outcome flags.** Three finale epilogues landed:
      `BURNT_ACCORD_RENNS_NETWORK` (Ashundi honor-guard payoff for
      `renn_ally`), `BURNT_ACCORD_THE_LISTED` (the wanted-kiosk cost of
      selling out — consumes `seval_ally` + all three `_captured` flags),
      `BURNT_ACCORD_THE_ALMOST_WAR` (Tessaly's book for `tessaly_friend`,
      with a `thennic_peace`-gated peace-dividend choice). Seven flags
      retired from the open-hook list; 8 remain.
- [x] **`faction-0/2/3` tags.** Direct faction alignment now feeds the
      galaxy simulation: a tag equal to a faction id strengthens exactly
      that faction in that system (one generic match arm in
      `simulation.rs`, covered by an integration test). The wiring test
      recognizes faction-id tags as simulation-consumed; the faction-tag
      open-hook list is now empty.
- [x] **`burnt_accord_finale` outcomes.** All 14 outcome flags now pay off
      across six epilogue events (iterations 11 + 14):
      `BURNT_ACCORD_HADIQS_CHAIR` (Korathi bundle — the Marshal's chair,
      brass-plated "For the witness", while Ashundi harbormasters stamp
      without looking up), `BURNT_ACCORD_DRAIMAR_GRUDGE` (the watching
      frigate), `BURNT_ACCORD_EMBERS` (the war that never quite starts,
      refugees, the sealed evidence Tessaly still checks), plus the Ashundi
      political pair folded into `BURNT_ACCORD_RENNS_NETWORK`. **Both
      open-hook lists are now empty — every flag and faction tag in the
      game has a producer and a consumer, test-enforced. Phase 2 complete.**

### Phase 3 — grow chains

- [ ] **More trigger-based chains.** The `fires` → `triggeredBy` mechanism has
      exactly one use. Extend 2-3 well-liked one-shot events into two-beat
      chains via `engine/content/triggers/`.
- [ ] **Sweep for text/world mismatches.** Audit event prose for asserted
      world state (population, ruins, stations, planet type) not guaranteed by
      `requires`; tighten conditions or soften prose. Add conditions to the
      schema only when a real event needs them.

## Out of scope for the POC

New pools, new chain *mechanisms*, frontend/UI changes beyond what
`HasStation` plumbing needs, era-gating expansion, anything touching combat or
trading balance.

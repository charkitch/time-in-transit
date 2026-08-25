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

- [ ] **Dangling-wiring test.** New cargo test in `engine/src/content.rs`:
      every flag/trigger/galactic-flag *consumed* by a condition has a
      producer, and every `sets_flags` / `fires` / `factionTag` *producer* has
      a consumer. Allowlist for intentionally-open hooks so it can land green,
      with the allowlist itself being the todo list for Phase 2.
- [ ] **Dead-end choice report.** Extend the test (or a `#[ignore]`d
      reporting test) to list choices with empty terminal effects (no flags,
      no fires, no `next_moment`, no material effect) — informational, feeds
      the backlog.
- [ ] **World-consistency condition.** Add `EventCondition::HasStation`
      (schema `lib.rs:211`, check in `events.rs:53-148`, plumb `has_station`
      from system state), plus a validation test that market/port-themed
      `planet_landing` events require it. Fix `LANDFALL_STONE_MARKET`
      (`engine/content/events/planet_landing/landfall_stone_market.yaml`) —
      either require a station or rewrite it as a stationless bazaar whose
      effect doesn't mutate market prices.

### Phase 2 — pay off existing nubs

- [ ] **Faction alignment matters.** `corp_ally` / `rebel_ally` / `gov_ally` /
      `alien_reliquary_trusted` are set but nothing consumes them. Author 1-2
      events per tag gated on `HasFactionTag`.
- [ ] **`DEAD_DROP_MESSAGE` gov branch.** `report_authorities` gets a
      follow-up (second trigger-driven chain in the game); decide whether
      `delete_message` staying silent is intentional.
- [ ] **`harvest_scar` branch divergence.** `harvest_scar_inlet_built` vs
      `harvest_scar_relic_preserved` are never read — make later stages (or a
      post-chain event) acknowledge which path was taken.
- [ ] **`alien_graveloom_tithe_paid`** — author the consequence.
- [ ] **`burnt_accord_finale` outcomes.** 14 outcome flags, zero readers.
      Author consequence events for all of them, starting with the strongest
      (e.g. `tessaly_captured`, `accord_collapsed`) — every flag eventually
      gets a payoff; multiple flags may share one consequence event where
      that reads naturally.

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

---
name: audit-events
description: Audit the game's authored stories and events for "hollowness" — one-shot events that end abruptly with no lasting consequence, choices that set state nothing ever reads, thin/uncovered content pools, and planet surfaces with no dedicated content. Use when asked to review narrative content, find dead-end events, check where stories go nowhere, find events with no impact, decide where to add depth, or make the universe feel less hollow. Complements `modify-events` (which authors content); this skill diagnoses what to author.
---

# Audit Events for Hollowness

The galaxy should feel **alive**, not fallen — see `story/universal_vibes.md`. The
enemy of that is *hollowness*: content that looks consequential in the moment but
leaves nothing behind. This skill finds it.

Events live as YAML in `engine/content/events/<pool>/`, typed by
`engine/content-types/src/lib.rs` (`GameEvent` / `EventChoice` / `ChoiceEffect` /
`EventCondition`), selected by `engine/src/events.rs`, and surfaced through the
landing/dialog UI. A choice "has impact" only if its `ChoiceEffect` pulls a lever
(`creditsReward`, `tradingReputation`, `setsFlags`, `fires`, `setsGalacticFlags`,
`factionTag`, `grantsUpgrade`, `recruitsCrew`, …) **and** something downstream
reads that state back.

## Step 1 — Run the analyzer

```
node skills/audit-events/analyze.mjs
```

It parses every event + trigger (registering the custom `!Condition` YAML tags)
and reports the mechanical signals. Run it from anywhere in the repo.

## Step 2 — Read each section as a specific defect class

| Section | What it means | The fix |
|---|---|---|
| **POOL COVERAGE** | Pools flagged `<-- thin` (≤2 events) repeat the same beat on every visit. | Author more events for that pool, or merge near-singleton pools. |
| **PLANET SURFACE COVERAGE** | Surfaces marked `NO dedicated event` fall through to the single surface-agnostic `rocky_landable` event (or the bare "DOCKING CLEARANCE GRANTED" fallback). | Author a `planet_landing` event gated on `SurfaceIs [that_surface]`. Per the vibe: *no planet is just one biome* — give it a reason to exist. |
| **EVENTS WITH NO MECHANICAL IMPACT** | Every choice is empty and there's no follow-up — pure flavor that changes nothing. | Add a lever, a `setsFlags` that a later event reads, or a `nextMoment`. |
| **DANGLING flags / galactic flags** | A choice writes state that **no condition ever reads**. This is the single biggest "ends abruptly" signal: the moment felt like a decision, but the world never acknowledges it again. | Author an epilogue/revisit event gated on the flag, or a sim/UI consumer. A flag set and never read is a promise the game breaks. |
| **DANGLING faction tags** | Aligning with a faction sets a tag nothing gates on — allegiance with no payoff. | Gate later content on `HasFactionTag`, or wire reputation into prices/access. |
| **DANGLING triggers fired** | A `fires` with no `triggeredBy`/`TriggerFired` consumer. | Author the follow-up event, or remove the fire. |
| **BROKEN: reads unset** | A condition gates on state nothing ever produces — the branch is dead and can never fire. | Produce the state, or delete the dead gate. |
| **EFFECT-LEVER USAGE** | Levers marked `NEVER used` are simulation depth the content ignores. `setsGalacticFlags`, `grantsUpgrade`, `bannedGoods` being zero means events never change the galaxy permanently, never reward gear, never disrupt trade. | When designing new content, reach for the unused levers — that's where untapped consequence lives. |

## Step 3 — The judgment passes the script can't do

The analyzer finds *mechanical* hollowness. Read for *narrative* hollowness too:

1. **Non-branching consequences.** A story chain whose later stage ignores the
   earlier choice (e.g. a follow-up that fires regardless of which flag was set,
   narrating "depending on who you ask" to paper over it). The choice didn't
   matter. Grep the chain's flags; confirm a downstream `requires` actually
   branches on them.
2. **Quest finales that just stop.** Trace each chain in `story_chains()`
   (`engine/src/content.rs`) to its finale. If the finale sets a flurry of
   outcome flags (ally/captured/accord) that the DANGLING report lists, the
   biggest stories in the game have no epilogue — the highest-value fix.
3. **One-shots that could echo.** A good event leaves a hook: a decline flag a
   later revisit acknowledges, a name that recurs. Saying *no* should stay
   interesting (see `plans/crew-recruitment-events.md`).
4. **Vibe check.** Every player-facing line against `story/universal_vibes.md`:
   alive not fallen, change not doom, wonders that work, no generic biome worlds.

## Step 4 — Report

Lead with the diagnosis (what's hollow and why it feels that way), grouped by
defect class, with the worst offenders named. Then propose fixes ranked by
emotional-return-per-effort — dangling quest finales and uncovered planet
surfaces usually top the list. Hand authoring off to `modify-events`.

---
name: modify-events
description: Guide for finding and modifying landing events, narrative events, or system entry text in The Years Between the Stars. Use this skill whenever the user wants to add, change, or fix any kind of game event — landing encounters, event choices, event outcomes, faction-specific events, era-gated events, or the system entry narration text. Also covers lore integration — reading tone and canon files from story/ to keep events consistent with the game's world. Always invoke this when the user says things like "add a new event", "change what happens when you land", "add a choice to an event", "the event text is wrong", or any mention of events/encounters/narrative/lore/story/tone.
---

## What "events" means in this codebase

There are two types of narrative events:

1. **Landing events** — encounters that appear when the player docks at a station. These have text, choices, and mechanical effects (money, reputation, cargo).
2. **System entry text** — the narration lines that appear when jumping into a system (including era-transition lines).

---

## Landing Events

### Where events are defined

**`engine/content/events/**/*.yaml`** — the primary source of truth. Event narrative, choices, effects, and conditions are authored in YAML files grouped by pool:
- `landing/`
- `asteroid_base/`
- `oort_cloud/`
- `maximum_space/`
- `triggered/`
- `system_entry/`
- `proximity_star/`
- `proximity_base/`
- `planet_landing/`
- `dyson_landing/`
- `topopolis_landing/`

**`engine/src/content.rs`** — registers YAML files with `include_str!` for each pool. Edit this when:
- Adding a new event file to an existing pool
- Creating a new event pool loader

**`engine/src/events.rs`** — selection/filtering only. Edit this when:
- Changing availability logic (`EventCondition` behavior, trigger rules)
- Changing cross-pool behavior (for example how triggered events are included)

**`engine/src/api_events.rs`** — maps runtime context to an `EventPool` in `get_game_event()`. Edit this when:
- Adding a new event context string
- Changing how landing context maps to secret base pools

### Where events are displayed

**`src/ui/LandingDialog/LandingDialog.tsx`** — renders the event narrative and choice buttons. Edit here to:
- Change the visual layout of events
- Add new UI elements (icons, portraits, extra info)
- Handle new choice effect types

**`src/game/GameState.ts`** — holds `pendingGameEvent` and processes player choices. Touch this when:
- Adding new effect types that need new state fields
- Changing how choices are stored or cleared

**`src/game/Game.ts`** — calls into the engine to fetch landing events when docking. Touch this when:
- Changing when events trigger (docking conditions)
- Passing new context to the event selector

### Event schema

**`engine/content-types/src/lib.rs`** defines the event YAML schema, with runtime player/chain types in `engine/src/types/player.rs`:
- `GameEvent`
- `EventChoice`
- `EventMoment`
- `ChoiceEffect`
- `EventCondition`
- `Trigger` / `TriggerFile`

Touch this file (plus TS bridge/state handling) only when adding new fields or effect/condition types.

---

## System Entry Text

**`src/ui/HUD/SystemEntryText.tsx`** — renders the staggered lines that appear on system entry. This is also where era-transition narration is displayed ("Centuries have passed...").

**`engine/src/system_payload.rs`** — `build_system_payload()` assembles system entry lines. Edit here to:
- Add new entry text categories
- Change era-crossing narration
- Include new info in the entry summary

**`engine/content/events/system_entry/*.yaml`** — optional event-driven system-entry encounters selected via `EventPool::SystemEntry`.

---

## Lore Integration

The `story/` directory contains the game's tone and canonical lore. Use it whenever writing or editing event text.

### Always: Read the tone document

Before writing any event text, read `story/universal_vibes.md`. This is a mandatory first step — it defines the emotional register, vocabulary, and worldview that all narrative text must match.

### When relevant: Search for specific lore

When the event references a specific topic (e.g., "quasar war", a faction's history, a technology):

1. List files in `story/universal_truths/` and scan filenames for keyword matches.
2. If a relevant file exists, read it and use it as source material — these are canon.
3. If no relevant file exists, keep specific details vague and tell the user that no lore file was found for that topic, in case they want to provide details or create one.

### How lore influences event writing

- **Tone consistency** — `universal_vibes.md` is the authority. The galaxy is alive and evolving, not a fallen world. Match the tone.
- **Factual accuracy** — Treat `universal_truths/` files as canon. Use specific names, dates, and details from them rather than inventing alternatives.
- **Weave naturally** — No info-dumps. A trader mentioning the Quasar War in passing beats a paragraph of exposition. Events should feel like lived experience, not a lore entry.
- **Respect WIP nature** — Lore files may contain placeholders like `{come up with X}` or rough notes. Extract the intent behind them. Skip placeholders in event text, or ask the user what to fill in.

---

## Typical workflows

**Add a new landing event:**
0. Read `story/universal_vibes.md` for tone; check `story/universal_truths/` for relevant lore
1. Add a new YAML file under `engine/content/events/landing/`
2. Register it in the matching loader function in `engine/src/content.rs`
3. Rebuild WASM: `npm run wasm:build` (or `cd engine && wasm-pack build --target web --out-dir pkg`)
4. Validate selection logic with `cd engine && cargo test events`

**Add a new non-landing event (proximity/system entry/planet/triggered):**
1. Add YAML under the matching `engine/content/events/<pool>/` directory
2. Register it in the corresponding loader in `engine/src/content.rs`
3. Ensure caller uses the right context (`landing`, `system_entry`, `proximity_star`, `proximity_base`, `planet_landing`, `triggered`) via `get_game_event()`
4. Rebuild WASM and run `cargo test events`

**Change event display layout:**
1. Only need `src/ui/LandingDialog/LandingDialog.tsx`

**Change era-transition narration:**
1. Only need `engine/src/system_payload.rs` — find `build_system_payload()`

**Add a new choice effect type:**
1. `engine/content-types/src/lib.rs` — add field(s) on `ChoiceEffect` and serde defaults
2. Event YAMLs — use the new field in `effect`
3. `src/game/engine.ts` — update TS type definitions if needed
4. `src/game/Game.ts` and/or `src/game/GameState.ts` — apply the new effect in client state
5. Rebuild WASM and test event flow

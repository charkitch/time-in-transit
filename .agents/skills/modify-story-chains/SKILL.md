---
name: modify-story-chains
description: Guide for creating and modifying multi-event story chains in The Years Between the Stars — linked sequences of narrative events that span multiple star systems, with map indicators guiding the player to the next step. Use this skill whenever the user wants to create a new story chain, add stages to an existing chain, change chain distance or base type requirements, modify how chain targets are assigned, or debug chain progression. Trigger on "story chain", "event chain", "multi-part event", "linked events", "chain of events", "quest line", "quest chain", "chain target", "map marker for event", "series of events across systems". Also trigger when the user says things like "I want a set of events that lead into each other", "events that the player follows from system to system", or "breadcrumb events".
---

## What story chains are

A story chain is a sequence of narrative events that the player encounters across multiple star systems. After completing each stage, the engine picks a distant system with the right base type and marks it on the cluster map with an amber diamond. The player travels there to find the next event in the chain.

This is different from single events (covered by the `modify-events` skill). Use this skill when the work involves:
- Creating a new multi-event sequence
- Modifying chain definitions (distance, base type, stages)
- Debugging why a chain event isn't appearing at the right system

For writing individual event YAML files (narrative text, choices, effects), also consult the `modify-events` skill — it covers lore integration, tone, and the event schema in detail.

---

## How chains work

### The chain definition

**`engine/src/content.rs`** contains `story_chains()` which returns a `Vec<StoryChainDef>`. Each chain has:

```rust
StoryChainDef {
    chain_id: "my_chain",           // unique identifier
    stages: &[
        // Each stage defines which flag marks it complete, and what the next stage is called
        ChainStageDef { completion_flag: "my_chain_stage1_done", stage_label: "stage2" },
        ChainStageDef { completion_flag: "my_chain_stage2_done", stage_label: "stage3" },
        // ... more stages
    ],
    min_distance: 12.0,             // minimum distance between current system and target
    required_base_type: Some(SecretBaseType::OortCloud),  // what kind of base to pick
                                    // Options: Asteroid, OortCloud, MaximumSpace, or None for any
}
```

The engine watches flag state across all systems. When a stage's `completion_flag` is set, it picks a target system for the next event: far enough away, with the right base type, deterministically seeded so it's stable.

### The event YAML files

Chain events live in `engine/content/events/<pool>/` like any other event. What makes them chain events is their `requires` conditions:

- **First event** (intro): Uses `!AnyFlagNotSet` to check the chain hasn't started. No `ChainTargetHere` — it fires at any matching base.
- **Subsequent events**: Use `!ChainTargetHere <chain_id>` to only fire at the engine-assigned target system.

Example conditions for a 4-event chain:

```yaml
# Event 1 (intro) — fires at any oort cloud base if chain hasn't started
requires:
  - !AnyFlagNotSet my_chain_stage1_done

# Event 2 — fires only at the assigned target system
requires:
  - !AnyFlagSet my_chain_stage1_done
  - !AnyFlagNotSet my_chain_stage2_done
  - !ChainTargetHere my_chain

# Event 3
requires:
  - !AnyFlagSet my_chain_stage2_done
  - !AnyFlagNotSet my_chain_stage3_done
  - !ChainTargetHere my_chain

# Event 4 (final)
requires:
  - !AnyFlagSet my_chain_stage3_done
  - !AnyFlagNotSet my_chain_completed
  - !ChainTargetHere my_chain
```

Each event's final choice must set the appropriate flag via `setsFlags`:

```yaml
effect:
  creditsReward: 500
  setsFlags: [my_chain_stage1_done]
```

### The map indicator

When a chain target is active, the cluster map draws a small amber diamond on the target system. This is automatic — no per-chain configuration needed. The frontend reads `chainTargets` from `GameState` (populated by `InitResult` and `JumpResult` from the engine).

### Registration

Event YAML files under `engine/content/events/<pool>/` are auto-discovered by `engine/build.rs` and compiled into `generated_content_registry`. Do not manually register individual event files in `engine/src/content.rs`.

Edit `engine/src/content.rs` only for the chain definition in `story_chains()` or for content-loading architecture changes.

---

## Key files

| File | Role | When to edit |
|------|------|-------------|
| `engine/src/content.rs` | Chain definitions | Adding/modifying a chain definition |
| `engine/content/events/<pool>/*.yaml` | Event narrative, choices, effects | Writing chain event content |
| `engine/build.rs` | Auto-discovers event YAML into generated registry | Only if changing content discovery |
| `engine/src/types/player.rs` and `engine/content-types/src/lib.rs` | `ChainTarget`, `EventCondition::ChainTargetHere` | Only if adding new chain mechanics |
| `engine/src/system_payload.rs` | `compute_chain_targets()` — target assignment logic | Only if changing how targets are picked |
| `engine/src/events.rs` | `ChainTargetHere` condition check | Only if changing condition behavior |
| `src/game/GameState.ts` | Stores `chainTargets` in frontend state | Only if changing how targets are displayed |
| `src/ui/ClusterMap/ClusterMap.tsx` | Renders amber diamond on target systems | Only if changing the map indicator visual |

---

## Naming conventions

- **Chain ID**: snake_case, descriptive (e.g., `quasar_array`)
- **Flags**: `{chain_id}_stage{N}_done` for intermediate stages, `{chain_id}_completed` for the final flag
- **Stage labels**: `stage2`, `stage3`, etc. (the label for the stage the flag unlocks, not the stage it completes)
- **Event IDs**: SCREAMING_SNAKE_CASE (e.g., `ARRAY_OORT_BRIEFING`)
- **Event files**: snake_case matching the chain.

---

## Available base types for chains

Chains can target specific secret base types. Not every system has every type — the engine filters candidates:

| Base Type | Pool | Frequency | Where |
|-----------|------|-----------|-------|
| `SecretBaseType::OortCloud` | `oort_cloud/` | ~15% of systems | Extreme outer system |
| `SecretBaseType::Asteroid` | `asteroid_base/` | ~25% of systems with belts | Mid asteroid belt |
| `SecretBaseType::MaximumSpace` | `maximum_space/` | ~8% of systems | Beyond system edge |
| `None` | Any pool | All systems | Use for chains at main stations |

If `required_base_type` is `None`, the chain can target any system (events would go in `landing/` pool). If a specific type is set, the chain target must be a system that has that base type.

---

## Typical workflow: Create a new story chain

### 0. Read lore and tone

Before writing any narrative text, read `story/universal_vibes.md`. If the chain references specific lore topics, check `story/universal_truths/` for canon files — these are the authority on facts, names, and dates. See the `modify-events` skill for detailed lore integration guidance.

### 1. Design the chain structure

Decide:
- How many stages (events)?
- Which pool / base type?
- What's the narrative arc? What does the player learn at each stage?
- What's the minimum distance between stages? (12.0 is a good default — forces real travel)

### 2. Write the event YAML files

Create one YAML file per chain event in `engine/content/events/<pool>/`. Follow the condition pattern above — first event has no `ChainTargetHere`, subsequent events do.

Each event needs:
- `id`: Unique SCREAMING_SNAKE_CASE
- `title`: Display title
- `requires`: Conditions (flag gates + ChainTargetHere for events 2+)
- `narrativeLines`: The story text
- `choices`: Player options, with `setsFlags` on the progression choice

Always include a "skip/defer" choice with `effect: {}` so the player can leave without advancing.

### 3. Rely on generated event discovery

No manual event registration is needed. `engine/build.rs` discovers YAML files under `engine/content/events/<pool>/` and generates the registry used by `engine/src/content.rs`.

### 4. Add chain definition to content.rs

Add a new `StoryChainDef` entry to `story_chains()`:

```rust
StoryChainDef {
    chain_id: "my_chain",
    stages: &[
        ChainStageDef { completion_flag: "my_chain_stage1_done", stage_label: "stage2" },
        ChainStageDef { completion_flag: "my_chain_stage2_done", stage_label: "stage3" },
        // One entry per transition. The final event's flag (e.g., my_chain_completed)
        // does NOT need a stage entry — there's nothing after it.
    ],
    min_distance: 12.0,
    required_base_type: Some(SecretBaseType::OortCloud),
},
```

### 5. Build and test

```bash
cd engine && cargo test events    # validates YAML parsing and event counts
npm run wasm:build                # rebuild WASM
```

If build or tests fail after adding a YAML file, check the generated registry tests in `engine/src/content.rs` and the event-selection tests in `engine/src/events.rs`.

---

## Existing chains

### Quasar Array (`quasar_array`)

A 4-event chain at oort cloud bases. The player helps build a distributed telescope array and gradually learns about the Quasar War — an 18,000-year-old event where 45+ quasars were extinguished across the observable universe in 19 days.

| Stage | Event ID | File | Flag set |
|-------|----------|------|----------|
| 1 (intro) | `ARRAY_OORT_BRIEFING` | `oort_cloud/array_oort_briefing.yaml` | `quasar_array_stage1_done` |
| 2 | `ARRAY_ICE_NODE` | `oort_cloud/array_ice_node.yaml` | `quasar_array_stage2_done` |
| 3 | `ARRAY_OORT_SPINE_REPAIRS` | `oort_cloud/array_oort_spine_repairs.yaml` | `quasar_array_stage3_done` |
| 4 (final) | `ARRAY_OORT_FINAL_MANIFEST` | `oort_cloud/array_oort_final_manifest.yaml` | `quasar_array_completed` |

### Cartographers' Wake (`cartographers_wake`)

A 4-event chain at asteroid bases.

| Stage | Event file | Flag set |
|-------|------------|----------|
| 1 (intro) | `asteroid_base/cartographers_wake_intro.yaml` | `cartographers_wake_stage1_done` |
| 2 | `asteroid_base/cartographers_wake_workshop.yaml` | `cartographers_wake_stage2_done` |
| 3 | `asteroid_base/cartographers_wake_collector.yaml` | `cartographers_wake_stage3_done` |
| 4 (final) | `asteroid_base/cartographers_wake_finale.yaml` | `cartographers_wake_completed` |

### Burnt Accord (`burnt_accord`)

A 5-event chain at maximum-space bases.

| Stage | Event file | Flag set |
|-------|------------|----------|
| 1 (intro) | `maximum_space/burnt_accord_signal.yaml` | `burnt_accord_stage1_done` |
| 2 | `maximum_space/burnt_accord_contact.yaml` | `burnt_accord_stage2_done` |
| 3 | `maximum_space/burnt_accord_rescue.yaml` | `burnt_accord_stage3_done` |
| 4 | `maximum_space/burnt_accord_handoff.yaml` | `burnt_accord_stage4_done` |
| 5 (final) | `maximum_space/burnt_accord_finale.yaml` | `burnt_accord_completed` |

---

## Debugging chains

**Chain event not appearing?**
1. Check that the previous stage's flag is set (look in `playerChoices` in the save data)
2. Check that the target system has the right base type (generate the system and inspect `secret_bases`)
3. Check that `ChainTargetHere` matches — the player must be at the exact system the engine picked
4. Check that the event isn't already in `completedEventIds` for that system

**Target system not showing on map?**
1. Check that `chain_targets` is populated in `GameState` (inspect via browser devtools)
2. Verify the chain definition in `story_chains()` has the right flags
3. The target is only computed after a stage flag is set — it won't appear before the chain starts

**Target always the same system?**
- The target is deterministically seeded by `chain_id + stage_index`. To change it, modify the seed in `compute_chain_targets()` in `engine/src/system_payload.rs`. This is by design — the target stays stable once assigned.

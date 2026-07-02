# First-Hour Experience Brief

An audit of what a new player actually experiences in their first hour, measured
against the game's promise, with a ranked list of improvements. Fable packet 1 of
the fable focus plan; the ranked items below are the backlog packets 2–4 draw from.

## The Promise

From `README.md` and `story/universal_vibes.md`, the first hour must make five
things legible without a tutorial:

1. **Time is the mechanic.** Every jump is one-way travel into the future; the
   galaxy ages decades while your ship ages years.
2. **The galaxy is alive.** Thriving civilizations, active factions, changing
   markets — not ruins, not a graveyard.
3. **You interact through trade,** not combat. Buy, sell, refuel, talk.
4. **Return has consequences.** Places change while you're gone, and the game
   remembers you were there.
5. **Wonder is the reward.** You astonish and are astonished.

## What the First Hour Delivers Today

**Minute 0:** `newGame()` (`src/game/Game.ts:442`) spawns the ship near the main
station with no framing whatsoever — no who-you-are, no why-you're-here. The only
narration is the arrival stack from `engine/src/system_payload.rs`
(`ENTERING <SYSTEM>`, `CONTROLLED BY <FACTION>`), which fades after 10 seconds
(`src/ui/HUD/SystemEntryText.tsx`) and can never be re-read. Starting state:
1,000 CR, 7 fuel (`engine/src/types/constants.rs`).

**Docking and trade:** The contextual DOCK/LAND/SCAN/HAIL buttons
(`src/ui/HUD/HUD.tsx`) are good onboarding — the verbs appear when they apply.
`src/ui/StationUI/StationUI.tsx` shows economy/politics/tech/population and has an
economy tooltip, but nothing signals the core loop: *this* good is cheap *here*
because of *this* economy — carry it somewhere it's dear.

**The first jump:** `src/ui/ClusterMap/ClusterMap.tsx` previews `+NNY` on hover —
the right foundation — but nothing marks the first jump as the irreversible,
identity-defining act it is. The relativistic split (62 galaxy years, 23 ship
years) only appears *after* the jump, in a line that fades in 10 seconds.

**The mute middle:** the event pool that fires during system arrival
(`engine/content/events/system_entry/`) contains **one** event. The good writing —
`refugee_fleet.yaml`, `the_archivist.yaml`, the alien-audit events — lives in the
landing pools (18 in `landing/`, 22 in `topopolis_landing/`), gated behind
finding and landing on specific sites. A player's first hour is mostly flight and
docking, and that phase is nearly silent.

**Return consequences:** `system_payload.rs` narrates a return visit only when
the controlling faction flipped (`LAST VISIT: YEAR X...`). Population growth, tech
change, price drift, climate shifts — all simulated, none narrated.

**Wonder:** the Iron Star and Crown arrival dialogs exist and are excellent, but
they're special systems a first-hour player likely never reaches.

## Understanding Milestones

**By minute 5 — "I can fly, and flying leads somewhere."**
Controls, thrust, target cycling; docking gives trade. Delivered today by the HUD
action buttons and the CONTROLS screen. Gap: zero fiction. The player should also
know *who they are* — a trader out of time — and today there is no surface that
says so. (Items 1, 10.)

**By minute 15 — "Trade pays, and jumping costs years."**
Buy low here, sell high there; fuel is money; the cluster map is the door to
everything, and walking through it costs decades. Delivered today by the economy
tooltip and the `+NNY` hover preview — both present but unframed; a new player
reads `+62Y` as flavor, not as *you will never see this year again*. (Items 3, 4, 8.)

**By minute 45 — "The galaxy moved while I was in transit, and it remembers me."**
After two or three jumps the player should have returned somewhere changed, felt
one era shift, faced one moral choice with no correct answer, and formed the
suspicion that planning *around time itself* is the real game. Delivered today
only by the faction-flip line and the era banner. (Items 2, 5, 6, 7, 9.)

## Ranked Improvements

Ranked by first-hour player impact per unit of effort. Sizes: S = hours,
M = a day-ish, L = multi-day.

1. **Cold-open framing dialog** (S–M). One `SystemEntryDialog` shown once on new
   game, reusing the existing Iron Star/Crown machinery (`content::iron_star_arrival_dialog()`
   pattern in `system_payload.rs`, `seen_system_dialog_ids`, the
   `SystemEntryDialog` React component). Four to six lines establishing: your ship,
   your era, and that leaving means leaving *now* behind. No mechanics, no
   controls — identity only. Reaches 100% of new players at minute zero.

2. **Fill the system-entry event pool** (M, pure YAML). The single biggest
   content-per-effort lever: selection logic exists, the pool has one event
   (`age_worn_transponder.yaml` — which is exactly the right register). Add 8–12
   events voicing the living galaxy during the flight phase: trade hooks, era
   texture, first-contact astonishment, small moral choices. This is the core of
   packet 2.

3. **First-jump ritual** (S–M). Once per save, when the player commits their
   first jump in `ClusterMap.tsx`, interpose one beat of fiction: "You will
   arrive 62 years from now. There is no way back to today." Confirm/cancel.
   Every jump after, just the badge. This spends the game's one guaranteed
   dramatic moment exactly where the premise lands.

4. **Show the relativistic split in the jump preview** (S). The hover preview
   shows galaxy years only; `ship_years_elapsed()` already exists in
   `system_payload.rs` (mirrored in `src/game/mechanics/RelativisticTime.ts`).
   Show both: `+62Y GALAXY / 23Y SHIP`. Two numbers, no explanation — the gap
   *is* the game's signature, and curiosity about it is the correct onboarding.

5. **"Since you last visited" return narration** (M, Rust). `faction_memory`
   already stores year + faction per system. Extend the return-visit lines in
   `build_system_payload()` beyond faction flips: population growth, tech-level
   change, market drift, climate change — one or two lines chosen from what
   actually changed. Packet 3's narration examples feed this directly.

6. **Post-jump arrival beat** (S–M, Rust + content). After the transit line, add
   one narrative line drawn from the arrival system's state (era, contest status,
   economy), so every arrival reads as a place in time rather than a status
   readout. Shares line-sets with item 5.

7. **Captain's log** (M–L, new React surface). Arrival text and event outcomes
   vanish in 10 seconds with no re-read. Persist them as log entries stamped with
   galaxy year and ship time. A diary whose dates run in decades is itself a
   deep-time artifact. Justifies the only new UI surface on this list.

8. **Price-delta cues in the market table** (S–M). Mark each good in
   `StationUI.tsx` relative to its galactic baseline (▲ dear / ▼ cheap). Teaches
   buy-low-sell-high in one glance, no tutorial text. Needs the baseline exposed
   through the market payload if it isn't already.

9. **Guarantee an early moral choice** (M). Curate one landing event of
   `refugee_fleet.yaml` quality to fire on the player's first landing (a
   `triggered_only` event or seed-weighting in the selection in
   `engine/src/events.rs`), so the no-right-answer texture is met in hour one by
   design rather than by luck.

10. **First-flight control hints** (S). A transient hint strip on the first new
    game only (thrust, target, dock keys), then never again. The CONTROLS screen
    already exists behind ESC; this just bridges the first sixty seconds.

11. **Years-since-departure on the HUD** (S). `SystemInfoPanel.tsx` shows
    `YEAR 3,2XX`; an absolute number carries no weight. Add the player-relative
    counter (`+147 SINCE DEPARTURE`) so accumulated time is felt every session.

12. **Naming pass: retire "hyperspace" in player-facing copy** (S). `ideas.md`
    flags the rename; `App.tsx` already gestures at the answer ("Nearlight
    passage charge glow"). Standardize player-facing copy on *nearlight passage*
    before packet 2 writes more text that would need re-writing. Code
    identifiers can keep `hyperspace`.

## What NOT to Explain

- **The relativity math.** Show the two numbers; never the Lorentz factor. The
  gap should itch.
- **Faction mechanics.** `CONTESTED —` lines, map colors, and consequences teach
  it. No faction primer screen.
- **Secret bases.** `FAINT SIGNAL DETECTED...` is complete. Never explain what
  signals mean or that bases exist.
- **Reputation and event bookkeeping.** The choice descriptions (`+Reputation`,
  `CR 800`) are the full disclosure. No reputation bar in hour one.
- **The simulation.** Never say the galaxy is simulated, that events are pooled,
  or that anything is procedural. The fiction is that it's all simply *true*.
- **Where the wonders are.** No markers, hints, or codex entries for Iron Star or
  The Crown. Arrival must land unspoiled, possibly dozens of hours in.
- **Goals.** No quest log, no objective markers, no "quest giver" phrasing
  (per `plans/fable-focus-plan.md`). Story-chain targets stay diegetic — a rumor,
  a signal, a line in an event.

## Tone Guardrails for Everything Above

Per `story/universal_vibes.md`: the galaxy is alive and well; things are neither
perfect nor the worst they've ever been; no fallen-galaxy despair, no empty
vaults; powerful civilizations exist in the living present; the register is
Doctor Who / *House of Suns* shatterlings / Qeng Ho — travelers who trade,
astonish, are astonished, and occasionally intercede in ways they'll be sad
about. Wry wonder, not melancholy ruin.

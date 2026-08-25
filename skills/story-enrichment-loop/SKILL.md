---
name: story-enrichment-loop
description: Run one iteration of the story-enrichment loop — pick the next backlog item from plans/story-enrichment-loop.md, implement it on the loop branch, verify, commit locally, and write a loop report. Designed to be driven by /loop.
---

# Story Enrichment Loop — one iteration

Execute exactly one iteration of the loop described in
`plans/story-enrichment-loop.md`. That file is the source of truth for the
backlog, key file paths, and scope; read it first every iteration.

## Hard rules

1. **Branch guard.** Run `git branch --show-current`. If not on
   `loop/story-enrichment`, check it out (create from `main` if it doesn't
   exist). Never commit to `main` or any other branch. **Never push** and
   never open a PR — all work stays local until the human reviews.
2. **Never remove existing content.** Do not delete or trim events, choices,
   flags, chains, or narrative text — depth is the point of the game; pay
   things off, don't prune them. If something genuinely seems worth removing,
   list it under "Proposed removals (needs human approval)" in the loop report
   and leave it untouched.
3. **One backlog item per iteration.** Never batch, never "keep going".
4. **Green before commit.** `cargo test --manifest-path engine/Cargo.toml`
   and `npm run lint` must pass. Run e2e only if TS/UI surfaces changed. If
   the item can't land green, revert it, report the failure honestly, and
   stop the iteration.

## Procedure

1. Branch guard (rule 1).
2. Read `plans/story-enrichment-loop.md`; take the first unchecked backlog
   item.
3. Implement it. Use the domain guides in `.agents/skills/` (`modify-events`,
   `modify-story-chains`, etc.) and respect the tone canon in
   `story/universal_vibes.md` and `story/universal_truths/`.
4. Verify (rule 4).
5. Commit only the files the item touched, single short message, no
   Co-Authored-By. Do not push.
6. Report: append an iteration entry to
   `plans/loop-reports/YYYY-MM-DD-<slug>.md` (create from the format in the
   plan doc). Check off the backlog item; append any newly discovered nubs or
   gaps as new backlog items. Commit the report and backlog update together
   with the item, or as a small follow-up commit.

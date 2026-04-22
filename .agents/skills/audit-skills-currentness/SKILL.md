---
name: audit-skills-currentness
description: Audit and update repo-local Codex skills for stale paths, symbols, commands, enum lists, and workflow guidance. Use when the user asks to verify skills are current, audit skills, update skill docs, check skill references, investigate stale skills, or maintain `.agents/skills`.
---

# Skill Currentness Audit

Use this skill to verify that `.agents/skills/*/SKILL.md` matches the current repository before editing skill docs.

## Workflow

1. Inventory skills with `find .agents/skills -maxdepth 2 -name SKILL.md | sort`.
2. Run `npm run skills:audit` if available. If not, run `python3 scripts/audit_skills_currentness.py`.
3. Treat checker output as leads, not final truth. Inspect the current source for every flagged path, symbol, command, enum list, or workflow.
4. Update skills only after confirming the current repo shape.
5. Re-run the checker and make sure no `error` findings remain.

## What To Verify

- File and directory references point to existing repo paths.
- Function, type, enum, and constant names exist or are intentionally descriptive rather than exact symbols.
- Workflow steps name the current source of truth, not a historical location.
- Commands still exist in `package.json`, `Makefile`, Cargo manifests, or repo scripts.
- Domain lists in skills match source definitions when they claim to be current.

## Project-Specific Drift To Watch

- Rust types are split under `engine/src/types/`; do not point to the old monolithic engine types file.
- Rendering is split between orchestration in `src/game/rendering/SceneRenderer.ts`, scene builders in `src/game/rendering/scene/`, and mesh constructors in `src/game/rendering/mesh/`.
- Events live under `engine/content/events/`; keep pool names in skills aligned with actual directories.
- Story and lore guidance should continue to use `story/universal_vibes.md` and `story/universal_truths/`.

## Editing Rules

- Preserve each skill's YAML frontmatter name and trigger description unless the trigger itself is stale.
- Keep skill bodies compact and workflow-oriented.
- Prefer current file groups over long exhaustive path inventories.
- Do not rewrite unrelated skill wording just for style.
- Do not edit generated or packaged build output while auditing skills.

## Reporting

Summarize results by skill:

- `errors`: stale references that would mislead an agent.
- `warnings`: likely stale symbols, commands, or workflow claims requiring judgment.
- `updates`: skill docs changed.
- `remaining`: intentional warnings or follow-up work.

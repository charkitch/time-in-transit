---
name: log-conversation
description: Append a summary of the current conversation to the conversation log. Runs proactively after a large change (commit, major refactor, new feature, significant bug fix) or when the user asks ("log this", "record this", "/log-conversation"). Only logs once per conversation — if an entry with this conversation's ID already exists, skip it.
---

## When to run

- **Proactively** after a large change lands — a commit, a major refactor, a new feature, a significant bug fix.
- **On request** when the user says "log this", "record this conversation", "add to the log", or `/log-conversation`.

## Before logging: check for duplicates

Each entry includes a `Conversation:` field with the conversation ID. Before appending, read `plans/presentations/conversation_log.md` and search for the current conversation ID. If it already exists, **do not add another entry** — tell the user it's already logged and offer to update the existing one instead.

## What to do

Append a new entry to `plans/presentations/conversation_log.md`. The entry goes right after the `---` line that follows the header, so newest entries are first.

Use this format:

```markdown
## YYYY-MM-DD — Short Title

**Conversation:** `<conversation-id>`

**Summary:** What was discussed and worked on. Can be multiple sentences or a paragraph.

**Outcome:** What was produced — commits, files created/changed, decisions made, plans formed.

**Issues:** Any problems, blockers, bugs discovered, or things left unfinished. Write "None." if clean.
```

## How to fill it in

- **Date:** Use today's date.
- **Short Title:** 2-5 words capturing the main theme.
- **Conversation ID:** The current conversation/session ID. This makes entries searchable and prevents duplicates.
- **Summary:** Describe the conversation naturally. Include the back-and-forth — what was asked, what approaches were tried, any course corrections. This is meant to be useful for a presentation about working with AI agents, so capture the collaborative process, not just the end result.
- **Outcome:** Be specific — name files, commits, features. Link to plans if relevant.
- **Issues:** Be honest. If something was attempted and abandoned, note it. If a workaround was used, note it.

## After appending

Read back the entry to the user so they can confirm or adjust it before the conversation ends.

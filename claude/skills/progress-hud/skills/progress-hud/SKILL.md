---
name: progress-hud
description: Reference for the progress HUD (mcp__progress-hud__progress ops, /hud commands). The working rules are already in the system prompt; load only when the user asks about the HUD or a call was refused.
---

# progress-hud

A bar above the prompt follows multi-step work. Two ways to feed it:

- **Built-in tasks.** TaskCreate, TaskUpdate and TodoWrite are mirrored on the bar `tasks` by themselves, no extra call. Keep their statuses current (`in_progress` for the one you work on, `completed` when done). The bar `tasks` is read-only for you: a call to it through `progress` is refused.
- **The `progress` tool** (`mcp__progress-hud__progress`) for staged work.

Create once with the whole plan, then move it with short ops.

Create: `{id, title, stages:[{name, steps:[{title}]}]}`; `kind:"todo"` for one flat list. 2-7 stages, titles of at most 4 words, in the user's language, one `id` per task. At most 12 stages and 80 steps. A step's `status` defaults to `pending`; the first open step becomes active.

Ops:
- `{id, next:true}`: active step done, next one active (past the last step, the first one left open)
- `{id, done:["A"], active:"B"}`: mark done, pick current; steps active before B count as done
- `{id, skip:["C"]}`: dropped without doing it; counts as finished, and an active step skipped moves on
- `{id, failed:"B", note}`: error
- `{id, state:"needs_input", note}`: before asking the user
- `{id, state:"done"}`: finish

The plan changed: resend `stages` under the same `id`. Steps sent without a status keep their done by title; send `status:"active"` to redo one. Short ops sent along apply on top.

Titles are matched ignoring case, spacing and full-width letters. A title the bar does not have is refused with the bar's step list; a title used twice means the one still open. An unknown `id` without `stages` is refused: create it first.

Reserved ids: `tasks` (the mirror) and `agents:auto` (the agents the HUD shows by itself) are the HUD's alone. A plan approved in plan mode lands on the bar `plan`; move that one.

The result says `done/total, state, active step`; no need to check the bar. Do not describe the bar to the user.

User commands: `/hud` toggles (`show`, `hide`, `compact`, `full`), `/hud-clear [id]`, `/hud-demo`, `/hud-sounds`. The **HUD** button in the footer is always shown while the mod is loaded.

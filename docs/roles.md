# Project Agent Configuration — Implementation Spec

**Audience:** an implementing agent (Sonnet). This document is a handoff spec, not
a prompt to role-play. Your task is to create the Claude Code project agent files
described below, verify them, and open a PR.

## What to build

Create three project subagents under `.claude/agents/` (one Markdown file per
agent, exact contents given in the "Agent files" section):

| File | Agent | Model | Write access |
|---|---|---|---|
| `.claude/agents/backend.md` | Backend implementation | sonnet | yes |
| `.claude/agents/frontend.md` | Frontend implementation | sonnet | yes |
| `.claude/agents/qa.md` | QA / verification | haiku | no (read + run only) |

There is deliberately **no code-review agent**: the repo already uses the
built-in `/code-review` (and `/code-review ultra`) plus branch protection with
required CI checks on `main`. Do not add one.

## Ground rules (read before writing any agent prompt)

1. **CLAUDE.md is the single source of truth for architecture.** Subagents
   automatically inherit CLAUDE.md, so agent prompts must NOT restate project
   facts (stack, routes, commands, gotchas) — restated facts drift. Agent
   prompts define only *scope, role, and role-specific emphasis*. Where an
   agent needs an architectural fact, the prompts below reference CLAUDE.md
   sections rather than duplicating them.
2. **The trust model, stated once, correctly** (this spec exists partly because
   an earlier draft got it backwards):
   - The frontend talks to Supabase **directly** (publishable key, gated by
     RLS) for reads, realtime, score entry, joins, and highlight uploads. Do
     not "enforce" that all frontend↔data traffic goes through the FastAPI
     backend — that is the opposite of the design.
   - The backend uses the **service-role key and bypasses RLS**. Backend
     routes are therefore the validation boundary and must validate all input
     themselves. Never instruct the backend agent to "rely on RLS."
3. **No new test frameworks.** The repo has no pytest/Vitest/Playwright and
   adding them is out of scope. The QA agent runs the verification that
   exists: `npm run check`, `npm run build`, backend import check, and the
   local Docker smoke test (see CLAUDE.md Commands). If test tooling is added
   later, the QA agent's prompt gets extended then — not now.
4. **Don't over-engineer.** This is a small solo project (~5 backend routes).
   No repository patterns, no service layers, no abstractions ahead of need.

## Agent files

Create each file with exactly this content.

### `.claude/agents/backend.md`

```markdown
---
name: backend
description: Implements changes to the FastAPI backend (backend/) and the Supabase schema (supabase/schema.sql) — routes, Pydantic models, RLS policies, migrations.
model: sonnet
---

You implement backend changes for this repo: everything under `backend/` and
`supabase/` (schema, RLS policies, seed data).

Role-specific emphasis (architecture and commands are in CLAUDE.md — follow it):

- The service-role Supabase client bypasses RLS, so **your routes are the
  validation boundary**: every request body gets a Pydantic model, and any
  route touching user-writable data validates input itself.
- `supabase/schema.sql` is the source of truth for the DB shape. When you
  change it, update the RLS policies and `frontend/src/lib/types.ts` to match
  (types are hand-maintained there — never generated, never redeclared
  elsewhere).
- Keep routers thin and endpoints async, but do not introduce repository
  patterns or service layers — the app is deliberately small.
- New env vars must be added to `backend/.env.example` and documented in the
  README deploy section.

Verify before finishing: `python -c "from app.main import app"` succeeds from
`backend/` with the venv active, and the Docker image still builds if you
touched `backend/Dockerfile` or `requirements.txt`.
```

### `.claude/agents/frontend.md`

```markdown
---
name: frontend
description: Implements changes to the SvelteKit frontend (frontend/) — pages, components, the eventStore, Supabase client usage, Tailwind styling.
model: sonnet
---

You implement frontend changes for this repo: everything under `frontend/`.

Role-specific emphasis (architecture and commands are in CLAUDE.md — follow it):

- Svelte 5 runes only (`$state`, `$derived`, `$effect`); no legacy store API.
  This is an SPA (`ssr = false`) — no server load functions.
- The frontend talks to Supabase **directly** for reads, realtime, scores,
  joins, and uploads; only the trusted operations (event create, admin pin,
  clone, ICS) go through the FastAPI backend via `PUBLIC_API_URL`. Do not
  route Supabase reads/writes through the backend.
- Shared data flows through `eventStore.svelte.ts` — one fetch, one realtime
  subscription. After any write the current page must reflect immediately,
  call `eventStore.refresh()`; do not rely on realtime alone (see the
  CLAUDE.md gotcha about backgrounded tabs).
- Types come from `frontend/src/lib/types.ts` — import, never redeclare.
- Handle loading/error/empty states for every remote read; keep components
  small and single-purpose.

Verify before finishing: `npm run check` and `npm run build` pass from
`frontend/`.
```

### `.claude/agents/qa.md`

```markdown
---
name: qa
description: Read-only verifier — runs the project's existing checks (svelte-check, builds, backend import check, Docker smoke test) against the current working tree and reports pass/fail with details. Does not modify code.
model: haiku
tools: Read, Bash, Grep, Glob
---

You verify the current working tree. You never modify files — you run checks
and report results.

Run whichever of these apply to the changed files (all commands and setup are
in CLAUDE.md → Commands):

- Frontend changes: `npm run check` and `npm run build` from `frontend/`.
- Backend changes: `python -c "from app.main import app"` from `backend/`
  (venv active), and `docker build -t hmb-api-ci backend/` if `Dockerfile`
  or `requirements.txt` changed.
- Schema changes: read `supabase/schema.sql` and confirm every new table has
  RLS enabled and policies defined, and that `frontend/src/lib/types.ts`
  matches the new shape.

Report format: one line per check with pass/fail, then full output for any
failure. Never echo the contents of `.env` files or any Supabase key.

There is no pytest/Vitest/Playwright in this repo — do not suggest adding
them or scaffold test files.
```

## Workflow (guidance for the orchestrator, not agent-to-agent routing)

Subagents cannot invoke each other; the main Claude Code session orchestrates.
The intended loop for a feature request:

1. Split the work by lane and dispatch to `backend` and/or `frontend`
   (parallel when independent, backend-first when the frontend consumes a new
   endpoint or schema change).
2. Run `qa` against the combined result.
3. Run `/code-review` on the diff before opening a PR.
4. Open a PR to `main` — never push directly (branch protection +
   required CI checks: `Frontend build`, `Backend build`).

Do not encode this loop into the agent prompts; it lives here and in the
orchestrator's judgment.

## Implementation steps & acceptance criteria

1. Create the three files above under `.claude/agents/` verbatim.
2. Sanity-check each file: valid YAML frontmatter; `qa` has the restricted
   `tools:` list, `backend`/`frontend` omit `tools:` (inherit all).
3. Confirm the agents appear as available agent types in a fresh session
   (or ask the user to verify, since agent discovery may require a restart).
4. Commit on a branch and open a PR titled
   `Add project subagents (backend, frontend, qa)` — do not push to `main`.

Acceptance criteria:

- No agent prompt restates CLAUDE.md content beyond the role-specific
  emphasis given above; no agent prompt mentions Supabase Edge Functions,
  generated TypeScript types, repository patterns, or "all traffic through
  the backend" — those were errors in the previous version of this document.
- The `qa` agent cannot edit files (tool restriction, not just prompt).
- Nothing in this change adds test frameworks or CI steps.

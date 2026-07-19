# CLAUDE.md — grisgolf (Hold My Beer Golf Scramble)

Dead-simple 2v2 golf scramble tracking for weekend crews. One shareable link,
a live leaderboard, one-thumb scoring, instant highlight share cards.

**First read for setup/deploy details:** [README.md](README.md) — env vars, local
dev, Vercel + Railway/Render/Cloud Run deployment steps.

## Stack & Architecture

- **Frontend:** Svelte 5 (runes) + SvelteKit 2 (SPA mode, `ssr = false`) + Tailwind CSS 4 + TypeScript, deployed to Vercel
- **Backend:** FastAPI (Python), deployed to Cloud Run (or Railway/Render) — see `backend/Dockerfile`
- **Database/Auth/Realtime/Storage:** Supabase (Postgres + RLS, `postgres_changes` realtime, Storage bucket for highlight photos)
- **No user accounts.** Players are remembered per-event in `localStorage`; organizers get a 4-digit admin pin.

### Two-lane split (mirrors the trust boundary, not just the folder layout)

| Lane | Talks to | Handles |
|---|---|---|
| **Frontend → Supabase directly** | Publishable (anon) key, gated by RLS | Reads, realtime leaderboard, score entry, joins, highlight uploads |
| **Frontend → FastAPI backend** | `PUBLIC_API_URL` | Only the trusted bits: event creation (share code + admin pin), admin pin verification, "Clone for Next Weekend", ICS export |

The backend uses the Supabase **Secret** (service-role) key and bypasses RLS —
that's the only reason admin pins can live in a table the public can't read
directly. Any new backend route that touches user-writable data must validate
input itself, since RLS isn't protecting it there.

### Key files

- `backend/app/main.py` — FastAPI app, CORS setup, health check
- `backend/app/config.py` — env loading (`backend/.env` in dev), fails loudly if Supabase config is missing
- `backend/app/db.py` — cached Supabase client (service role)
- `backend/app/routers/events.py` — event lifecycle: create, verify-admin, update, clone, ICS export
- `backend/app/routers/courses.py` — GolfCourseAPI search proxy + `courses` table cache (`GOLF_COURSE_API_KEY`, optional — search degrades to cached courses/free text without it)
- `frontend/src/lib/supabase.ts` — lazy Supabase client, `fetchEventBundle` (one round-trip fetch of event + golfers + teams + scores + highlights), `subscribeToEvent` (realtime + 20s poll fallback), `uploadHighlightPhoto`
- `frontend/src/lib/eventStore.svelte.ts` — rune-based store shared by every `/event/[code]` page; one fetch + one realtime subscription, everyone re-renders on change. Has an explicit `refresh()` for callers that just wrote data and shouldn't wait on realtime/polling (see the highlight-composer gotcha below)
- `frontend/src/lib/types.ts` — shared row types mirroring `supabase/schema.sql`; import from here, never redeclare
- `frontend/src/lib/scoring.ts` — match-point scoring logic
- `frontend/src/lib/courses.ts` — real-course helpers (display name, directions URL, tee options, per-hole pars); `components/CoursePicker.svelte` is the course search UI shared by the landing form and admin page
- `supabase/schema.sql` — tables, RLS policies, realtime publication, storage bucket policy (source of truth for the DB shape)
- `supabase/seed.sql` — demo event at `/event/demo1234` (admin pin `1919`)

### Routes

| Route | What it is |
|---|---|
| `/` | Landing page + "Start a Scramble" |
| `/event/{code}` | Public page: live leaderboard, full scorecard, highlight teaser |
| `/event/{code}/join` | Enter name + handicap, create/join a 2-person team |
| `/event/{code}/score` | On-course scoring |
| `/event/{code}/highlights` | Every Epic Shot, shareable as a canvas-rendered card |
| `/event/{code}/admin` | Status, roster, Clone for Next Weekend, ICS export |

## Commands

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000        # dev server
curl localhost:8000                               # health check

# Frontend
cd frontend
npm install
npm run dev                                       # Vite dev server, :5173
npm run check                                      # svelte-kit sync + svelte-check
npm run build                                       # production build (uses adapter-vercel)

# Local Docker test of the Cloud Run image (via Colima)
colima start
docker build -t hmb-api backend/
docker run -d --name hmb-api-test -p 8080:8080 --env-file backend/.env hmb-api
curl localhost:8080
```

Both `backend/.env` and `frontend/.env` are required locally (copy from
`.env.example`) — see README for the Supabase key-naming table (dashboard
"Publishable key"/"Secret key" vs. env var names). The frontend build does
**not** need `.env` present — `$env/dynamic/public` reads at request time, not
bake time — which is why CI can build it with no secrets configured.

## Gotchas

- **`eventStore.refresh()` after any write that the current page cares about seeing immediately.** Realtime + 20s polling is the default sync mechanism, but a backgrounded tab (e.g. camera capture via `<input capture="environment">` in `HighlightComposer.svelte`) can stall both for a long time. Don't rely solely on realtime for UI that just performed the write.
- **`adapter-vercel` is pinned explicitly** in `frontend/svelte.config.js` (`runtime: 'nodejs20.x'`) with matching `"engines": {"node": "20.x"}` in `package.json`. Don't switch back to `adapter-auto` — its bundled adapter-vercel version lags Vercel's build container Node version and fails the build.
- **`CORS_ORIGINS` on the backend must exactly match the frontend origin** (scheme + host, no trailing slash) — a mismatch fails silently as a browser CORS error, not a server error.
- **Secrets discipline:** never print/echo Supabase service-role or publishable keys to the terminal. Read from `.env` with `grep | cut` and pipe directly into commands (e.g. `gcloud secrets create --data-file=-`).
- **Branch protection is on `main`:** PRs required (0 approvals needed, solo-contributor repo), `enforce_admins: true`, and the `Frontend build` / `Backend build` CI checks (`.github/workflows/ci.yml`) are required status checks. Don't push directly to `main`.

## Code Exploration

This repo is indexed by `cymbal` — prefer it over grep/glob/manual read for
structural navigation (symbol lookup, call graphs, references):

- `cymbal search <name>` — locate a symbol or file by name
- `cymbal show <symbol>` — read source by symbol name or file path
- `cymbal investigate <symbol>` — kind-adaptive quick summary (source, callers, impact)
- `cymbal outline <file>` — list symbols defined in a file
- `cymbal refs <symbol>` — find references / call sites (`--file` to scope)
- `cymbal impact <symbol>` — transitive callers — what breaks if this changes
- `cymbal trace <symbol>` — downward call graph — what this calls
- `cymbal context <symbol>` — bundled source + types + callers + imports

Use `cymbal search --text <pattern>` (or Grep) only for literal text in
non-code files (markdown, JSON, config) — cymbal's symbol index is for code.

Re-run `cymbal index .` after large structural changes if lookups seem stale.

## Conventions

- Svelte 5 runes only (`$state`, `$derived`, `$effect`) — this app predates
  and doesn't use the older store (`writable`/`readable`) API.
- SSR is disabled (`ssr = false`) — this is an SPA, not a server-rendered app.
  Don't add server load functions expecting SSR semantics.
- Pydantic models for all FastAPI request bodies; the service-role Supabase
  client (`db.py`) bypasses RLS, so backend routes are the validation boundary.
- Tailwind v4 `@theme`/`@utility` syntax — there is no `tailwind.config.js`.

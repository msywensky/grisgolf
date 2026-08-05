# Import Course from a Scorecard Photo

## Context

`CoursePicker.svelte` gives organizers two ways to set a course: search GolfCourseAPI
(via the backend proxy), or type a free-text name via the **"Can't find it? Just type the
name"** escape hatch. The free-text path is lossy — it sets `events.course` as a display
string and nothing else, so `events.course_id` stays null and `holePars()` returns null.
The crew loses per-hole pars on the scorecard and score-entry pages, plus the directions
link and ICS location.

GolfCourseAPI misses plenty of small municipal and semi-private courses, which is exactly
where this crew plays. The fix: let an organizer photograph the paper scorecard, have a
Claude vision model read the per-hole pars and stroke indexes off it, let them **correct
the results before saving**, and persist it as a real `courses` row — so the imported
course behaves identically to a searched one everywhere downstream (pars on the scorecard,
directions, ICS, and discoverable in future searches).

Course name and address are **typed by the user**, not extracted — most scorecards don't
print an address, and the club name is inconsistently placed. The model attempts a
best-effort club-name guess to prefill the field, and never blocks saving on it.

**Decisions made:** extract pars + stroke index (one synthetic tee, no yardage columns);
gate the public endpoint with an in-process per-IP rate limit; default model
`claude-sonnet-5`, overridable via `.env`.

---

## Rules - Must be followed from start to finish

### NO DESTRUCTIVE BEHAVIOR

- No file deletions
- No git commands

## Design

### Storage: reuse the `courses` table, no schema change

Imported courses are ordinary `courses` rows with a **synthetic `external_id`** of
`custom:<uuid4>`. Nothing in `supabase/schema.sql` changes — `external_id` is already
`text not null unique`, and RLS already allows public read / service-role-only write,
which is exactly what we need (the import must go through the backend).

Because the row is a normal `courses` row, the entire existing pipeline works unchanged:

- `ensure_cached(external_id)` in `backend/app/routers/courses.py:178` finds it and returns it.
- `create_event` / `update_event` (`backend/app/routers/events.py:89`, `:146`) set
  `course_id`, `tee_name`, `tee_gender` and overwrite `events.course` with `display_name()`.
- `fetchEventBundle` (`frontend/src/lib/supabase.ts:33`) reads it with the anon key.
- `holePars()` (`frontend/src/lib/courses.ts:41`) and `directionsUrl()` just work.
- `search_courses` already queries the `courses` table filtered on `state` — so imported
  courses become discoverable in later searches. **This is why State is a required field
  on the review form.**

One guard is needed: `ensure_cached` refreshes rows older than `CACHE_MAX_AGE` (90 days),
which for a `custom:` id means a pointless GolfCourseAPI 404 round-trip. Short-circuit at
the top of the function:

```python
CUSTOM_ID_PREFIX = "custom:"   # scorecard imports; never refetched externally

# inside ensure_cached(), right after the row lookup:
if row and external_id.startswith(CUSTOM_ID_PREFIX):
    return row
```

### Tee shape

`holePars()` only returns pars when the event has both `tee_name` and `tee_gender` set and
the matching `TeeBox` has a `holes[]` array of sufficient length with every par > 0. So the
import writes exactly one synthetic tee under `male` (the schema's `tee_gender` check
constrains it to `male`/`female`; `male` is the arbitrary slot, never shown to the user):

```json
{"male": [{
  "tee_name": "Scorecard",
  "course_rating": 0, "slope_rating": 0, "total_yards": 0,
  "par_total": 72, "number_of_holes": 18,
  "holes": [{"par": 4, "yardage": 0, "handicap": 7}, ...]
}]}
```

`ScorecardImport` hands `tee_name: "Scorecard"` / `tee_gender: "male"` straight back to the
parent on save, so pars light up with no extra tap. Stroke index rides along in
`holes[].handicap` — nothing consumes it today, but it matches the GolfCourseAPI shape and
is there for future net scoring.

**CoursePicker must not render the tee-box list for imported courses** — the existing row
renders `{total_yards} yds · Par {par_total} · {course_rating}/{slope_rating}`, which would
read "0 yds · Par 72 · 0/0". Gate that block on `!isImportedCourse(selected)`.

### AI call

The backend is the only place the API key can live (`config.py` pattern), and the vision
call is the only new external dependency. Use the **official `anthropic` Python SDK** with
`client.messages.parse()` and a Pydantic output model, so the response is schema-validated
before it reaches our own validation:

```python
class ScorecardHole(BaseModel):
    number: int
    par: int
    handicap: Optional[int] = None

class ScorecardExtract(BaseModel):
    club_name: str          # "" when not legible on the card
    holes: list[ScorecardHole]
```

The image goes in as a base64 `image` content block ahead of the text block. Prompt should
state plainly: read the row labeled Par and the row labeled Handicap/HDCP/Stroke Index;
return one entry per hole in play order; return `""` for `club_name` if it isn't printed;
do not invent values for illegible cells (return the par as `0` so our validation catches
it rather than guessing).

Model comes from `SCORECARD_MODEL` (default `claude-sonnet-5`). Both the key and the model
are **optional** settings — `backend/app/config.py` must not raise when they're absent, or
CI's `Backend build` import check (`python -c "from app.main import app"`, which sets only
dummy Supabase vars) fails. Mirror the `golf_api_key` pattern: empty-string default,
truthiness check at the call site, and the client built behind a lazy `@lru_cache` getter
exactly like `get_db()` in `backend/app/db.py`.

### Image transport: client-side downscale → base64 JSON

The browser downscales the photo on a canvas (max 2000px long edge, JPEG q0.85) and POSTs
it as base64 JSON. Rationale:

- Phone photos are 3–12MB; a raw upload wastes bandwidth and vision tokens.
- Keeps `request<T>()` in `frontend/src/lib/api.ts:9` usable as-is (it hardcodes
  `Content-Type: application/json`; multipart would need a second helper).
- Avoids adding `python-multipart` to the backend.
- Avoids parking scorecard photos in the public `highlights` Storage bucket, which has an
  open insert policy and no cleanup.

Backend caps the decoded payload (reject > ~8MB base64) before touching the AI client.

### Two endpoints, one paid

- `POST /api/courses/scan` — `{image_base64, media_type}` → `{club_name, holes[]}`. **No DB
  write.** This is the rate-limited, paid call.
- `POST /api/courses/import` — the user-corrected payload → a `CourseSummary`. Plain
  validated DB write; same rate-limit bucket applied, since it's also public.

Splitting them means a user can re-scan or hand-edit freely without re-writing rows, and
keeps the expensive call clearly isolated.

> **Accepted risk:** `/import` is an unauthenticated write to a publicly-readable table, so
> a determined actor could seed junk courses into search results for a given state. The IP
> rate limit plus strict Pydantic validation is the agreed mitigation. If that proves
> insufficient, the next step is a scan-token handshake (`/scan` issues an opaque id that
> `/import` must redeem) — deliberately deferred because it breaks across Cloud Run
> instances without shared state.

---

## Files to change

### Backend

**`backend/requirements.txt`** — add `anthropic>=0.70`. (`httpx` is already present;
`python-multipart` is deliberately _not_ needed.)

**`backend/app/config.py`** — two optional settings following the `golf_api_key` comment style:

```python
# Optional — scorecard import is disabled without it.
self.anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
self.scorecard_model = os.environ.get("SCORECARD_MODEL", "claude-sonnet-5")
```

**`backend/app/ai.py`** (new) — mirrors `db.py`: `@lru_cache def get_ai() -> Anthropic`,
plus `extract_scorecard(image_b64, media_type) -> ScorecardExtract`. Raises
`HTTPException(503, ...)` when no key is configured and `HTTPException(502, ...)` on
provider failure, with the same jokey copy style as the 502 in `courses.py:195`.

**`backend/app/ratelimit.py`** (new) — in-process sliding window keyed by client IP,
mirroring the `_recent` `OrderedDict` pattern already in `courses.py:31`. Needs a
`client_ip(request)` helper that reads the first entry of `X-Forwarded-For` before falling
back to `request.client.host` — behind Cloud Run, `request.client.host` is the load
balancer, so keying on it would rate-limit every user as one. Budget: ~5 scans/hour/IP.

**`backend/app/routers/courses.py`** — the bulk of the work:

- `CUSTOM_ID_PREFIX = "custom:"` constant.
- The `ensure_cached` short-circuit shown above.
- `POST /scan`: rate-limit → size cap → `extract_scorecard` → validate (hole count is 9 or
  18; par in 3..6; handicap in 1..count or null) → return. A hole count that isn't 9 or 18
  is a 422 with copy telling them to crop to just the holes row.
- `POST /import`: Pydantic-validated body (`club_name`, optional `course_name`/`address`,
  `city`, `state` as a 2-char code, `holes[]`), builds the synthetic tee, generates
  `custom:{uuid4()}`, inserts via `get_db()`, returns `_summary(...)` so the frontend can
  drop it straight into the picker's selected state.

**`backend/app/routers/leagues.py:275`** — one-line bug fix: `external_course_id` is typed
`Optional[int]`, but it's a `str` everywhere else (`events.py:69`, `CourseSummary.external_id`,
the frontend). Scheduling a league night with _any_ linked course currently 422s; imported
`custom:<uuid>` ids make this unavoidable. Change to `Optional[str]`.

**`backend/.env.example`** — document both new vars with the "optional, here's what breaks
without it" comment style already used for `GOLF_COURSE_API_KEY`. Note that
`SCORECARD_MODEL` must be a vision-capable model that supports structured outputs.

### Frontend

**`frontend/src/lib/images.ts`** (new) — `downscaleToDataUrl(file, maxEdge)`. Reuse the
`loadImage()` + cover-scaling + `canvas.toBlob()` primitives already proven in
`frontend/src/lib/sharecard.ts`; returns `{ base64, mediaType }`.

**`frontend/src/lib/api.ts`** — `scanScorecard()` and `importCourse()` plus their input /
output interfaces, alongside the existing `searchCourses()` at line 224. `importCourse()`
returns a `CourseResult` so the picker can reuse `pickCourse()` verbatim.

**`frontend/src/lib/courses.ts`** — export `CUSTOM_ID_PREFIX` and
`isImportedCourse(c: {external_id: string})`, used to suppress the tee-box list and any
"0 yds · 0/0" rendering.

**`frontend/src/lib/components/ScorecardImport.svelte`** (new) — the whole import flow, kept
out of `CoursePicker` to stop that file ballooning. Three visual steps in one component:

1. **Capture** — reuse the exact `<input type="file" accept="image/*" capture="environment"
class="hidden">` inside a styled `<label>` pattern from `HighlightComposer.svelte:117`,
   with `busy` / `errorMsg` `$state` and try/catch/finally, same as that component.
2. **Review** — 9 or 18 rows of par + stroke-index steppers/inputs, above Course name,
   Address, City, State fields. Name prefilled from the model's guess; State defaults from
   `getPrefState()` (already imported by CoursePicker). Show a running par total so a
   misread is obvious at a glance. Save disabled until name + state are filled.
3. **Save** — `importCourse()`, then hand the resulting `CourseResult` back to the parent.

Styling follows the existing picker conventions: `tap` / `press-pop` utilities, `rounded-xl
border border-white/15 bg-black/20` inputs, `border-fairway-500 bg-fairway-600` for the
selected/primary state, `tap text-xs font-semibold text-stone-500 underline` for secondary
links, emoji-forward copy.

**`frontend/src/lib/components/CoursePicker.svelte`** — small, contained changes:

- `let mode = $state<'search' | 'text' | 'import'>('search')` (line 22).
- A sibling link next to the existing "Can't find it? Just type the name" button (lines
  197–199), e.g. `📸 Import a scorecard photo`, setting `mode = 'import'`.
- An `{:else if mode === 'import'}` branch rendering `<ScorecardImport>` with an
  `onimported` callback that runs `pickCourse(result)`, sets `teeName = 'Scorecard'` /
  `teeGender = 'male'`, and returns `mode = 'search'` so the picked-course summary renders.
- Gate the tee-box list (lines 123–154) on `!isImportedCourse(selected)`.

Because all three call sites bind the same four props to this one component — the landing
page (`frontend/src/routes/+page.svelte:104`), event admin
(`frontend/src/routes/event/[code]/admin/+page.svelte:218`), and league admin
(`frontend/src/routes/league/[code]/admin/+page.svelte:362`) — **no call site needs to
change.** Import becomes available in all three for free.

### Docs

**`README.md`** — add `ANTHROPIC_API_KEY` and `SCORECARD_MODEL` to the backend env table,
and note the Cloud Run deploy needs the key in Secret Manager (`--set-secrets`) with the
model name as a plain `--set-env-vars` value, per the existing secrets-discipline rule in
`CLAUDE.md`.

---

## Verification

**Backend, isolated:**

1. `cd backend && source .venv/bin/activate && pip install -r requirements.txt`
2. Confirm CI's import check still passes with no AI key set:
   `SUPABASE_URL=x SUPABASE_SERVICE_ROLE_KEY=y python -c "from app.main import app"`
   — this is a required status check on `main`, and it will fail if the Anthropic client is
   constructed at module scope instead of behind the lazy getter.
3. `uvicorn app.main:app --reload --port 8000`, then a `test-scorecard-import.ps1` smoke
   script in the repo root (mirroring the existing `test-course-search.ps1` habit): reads
   `ANTHROPIC_API_KEY` out of `backend/.env`, base64s a sample scorecard JPEG, POSTs to
   `/api/courses/scan`, prints the extracted pars. Distinguishes "our bug" from "provider
   is down".
4. POST the corrected payload to `/api/courses/import`, then confirm
   `GET /api/courses/search?q=<name>&state=<ST>` returns the new course.

**End to end in the browser** (`npm run dev`, backend on :8000):

1. Landing page → "Import a scorecard photo" → upload a real scorecard photo.
2. Deliberately edit one par in the review step and confirm the edit is what persists —
   this is the whole point of the review step.
3. Save → the picker shows the green picked-course summary with **no** tee-box list.
4. Create the event → open `/event/{code}` and `/event/{code}/score` and confirm per-hole
   pars render and match the corrected values.
5. `/event/{code}/admin` → confirm the `⛳ linked` badge, and that the ICS export carries
   the typed address as `LOCATION`.
6. Repeat the import entry point from `/event/{code}/admin` and from league admin (the
   latter also exercises the `leagues.py` `Optional[str]` fix — schedule a league night with
   the imported course and confirm no 422).

**Failure paths worth exercising by hand:**

- Unset `ANTHROPIC_API_KEY` → the import link should degrade with a clear message, not a
  stack trace, matching how course search degrades without `GOLF_COURSE_API_KEY`.
- Photograph something that isn't a scorecard → expect the 422 with the friendly copy, not
  a garbage 14-hole course.
- Hit `/api/courses/scan` 6+ times in an hour from one IP → expect a 429.

**Static checks:** `cd frontend && npm run check && npm run build`.

**Branch/PR:** already on `feature/import-course`; `main` is protected, so this lands via PR
with the `Frontend build` / `Backend build` checks green.

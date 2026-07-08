# 🍺⛳ Hold My Beer Golf Scramble

Dead-simple 2v2 golf scramble tracking for weekend crews. One shareable link, a live
leaderboard, one-thumb scoring, instant highlight share cards, and a one-tap
"Clone for Next Weekend" button.

**Stack:** Svelte 5 + SvelteKit + Tailwind CSS 4 (frontend) · FastAPI (backend) ·
Supabase (database, realtime, storage).

```
grisgolf/
├── frontend/   SvelteKit app (Vercel)
├── backend/    FastAPI app (Railway / Render / Fly)
└── supabase/   schema.sql + seed.sql (run in Supabase SQL editor)
```

## How it works

- The app talks **directly to Supabase** (anon key + RLS) for reads, realtime
  leaderboard updates, score entry, joins, and highlight uploads.
- **FastAPI** handles the trusted bits: creating events (share codes + admin pins),
  verifying admins, "Clone for Next Weekend", and ICS calendar export. It uses the
  service-role key, which is why admin pins can live in a table the public can't read.
- No user accounts. Players are remembered per-event in localStorage; the organizer
  gets a 4-digit pin.

## Setup (≈10 minutes)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is plenty).
2. Open **SQL Editor** and run `supabase/schema.sql` (tables, RLS, realtime, storage bucket).
3. Then run `supabase/seed.sql` — this creates the demo event at `/event/demo1234`
   (admin pin `1919`) so the app looks alive on first load.
4. Grab your keys from **Settings → API**. Supabase renamed its API keys — you'll
   see **Publishable key** and **Secret key** instead of the older `anon` /
   `service_role` names, but they're the same two keys with the same jobs:

   | Supabase dashboard label | Goes in | Env var |
   |---|---|---|
   | Project URL | both `.env` files | `SUPABASE_URL` / `PUBLIC_SUPABASE_URL` |
   | **Publishable key** (`sb_publishable_...`) | `frontend/.env` only — safe for the browser, gated by RLS | `PUBLIC_SUPABASE_ANON_KEY` |
   | **Secret key** (`sb_secret_...`) | `backend/.env` only — never ship this to the frontend | `SUPABASE_SERVICE_ROLE_KEY` |

   Ignore **JWKS URL** — that's only needed for custom JWT verification, which
   this app doesn't do.

### 2. Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
uvicorn app.main:app --reload --port 8000
```

Sanity check: `curl localhost:8000` → `{"status":"ok","vibe":"🍺⛳ hold my beer"}`

### 3. Frontend (SvelteKit)

```bash
cd frontend
npm install
cp .env.example .env   # fill in PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_API_URL
npm run dev
```

Open http://localhost:5173 — hit **"Peek at a live demo event"** and you should see
The Saturday Slice Open, mid-round, with Draft Punks heating up.

## The tour

| Route | What it is |
|---|---|
| `/` | Landing page + "Start a Scramble" |
| `/event/{code}` | Public page: live leaderboard, full scorecard, highlight teaser |
| `/event/{code}/join` | Enter name + handicap, then create or join a 2-person team |
| `/event/{code}/score` | On-course scoring: tap a number, it saves and advances |
| `/event/{code}/highlights` | The Glory Reel — every Epic Shot, shareable as a card |
| `/event/{code}/admin` | Commissioner's Office: status, roster, **Clone for Next Weekend**, ICS export |

Things worth showing off:

- **Epic Shot** (on the scoring screen): caption + optional photo → renders a
  1080×1080 share card on a canvas → native share sheet straight into the group chat.
- **Clone for Next Weekend** (admin page): copies event, golfers, and teams, dated
  +7 days, same admin pin. The `.ics` download adds the whole weekly series to
  your calendar.
- **Match points**: every hole is a mini-match against the field — win the hole
  outright for 1 point, split ties for ½. Net scoring uses 35% of combined team
  handicap, prorated by holes played.

## Deploying

**Frontend → Vercel:** import the repo, set the root directory to `frontend/`,
add the three `PUBLIC_*` env vars (point `PUBLIC_API_URL` at your deployed backend).
`adapter-auto` handles the rest. To use a subdomain like `scramble.hmbgolf.com`,
add it under Project Settings → Domains and create the CNAME record it gives you
(`scramble` → `cname.vercel-dns.com`) at your DNS host.

Backend can go to either Railway/Render or Google Cloud Run — pick one:

### Option A: Railway/Render

Root directory `backend/`, start command
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`, env vars from `.env.example`
(set `CORS_ORIGINS` to your frontend URL). Both platforms build straight from
`requirements.txt`, no Dockerfile needed.

### Option B: Google Cloud Run

The repo includes `backend/Dockerfile`. One-time setup:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com

# Store the Supabase secret key in Secret Manager rather than a plain env var
printf 'your-secret-key-value' | gcloud secrets create supabase-service-role-key --data-file=-
```

Build and deploy from the repo root:

```bash
gcloud run deploy hmb-scramble-api \
  --source backend \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars SUPABASE_URL=https://YOUR-PROJECT.supabase.co,CORS_ORIGINS=https://scramble.hmbgolf.com \
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest
```

This gives you a `https://hmb-scramble-api-xxxxxxxxxx-uc.a.run.app` URL — test it
with `curl <url>/` (expect `{"status":"ok","vibe":"🍺⛳ hold my beer"}`), then set
that as `PUBLIC_API_URL` in Vercel and redeploy the frontend.

To redeploy after code changes, re-run the same `gcloud run deploy` command — env
vars and secrets persist. Cloud Run scales to zero by default (a cold start adds
a second or two to the first request after idle time); add `--min-instances=1`
if that's not acceptable for your group chat's patience.

Optional custom domain (e.g. `api.hmbgolf.com`), after verifying ownership in
[Search Console](https://search.google.com/search-console):

```bash
gcloud beta run domain-mappings create \
  --service hmb-scramble-api --domain api.hmbgolf.com --region us-central1
```

### Either way

Make sure `CORS_ORIGINS` on the backend exactly matches the frontend's origin
(scheme + host, no trailing slash) — a mismatch fails silently as a CORS error
in the browser console, not a helpful server error.

## MVP trust model (a.k.a. things we punted on purpose)

Anyone with the event link can read everything and enter scores — that's the
product: zero friction for a group of friends. Admin actions (status, clone)
require the pin. There are no accounts, no email, no payments, and deletes only
happen through the backend. If your beer league has a scorecard-tampering
scandal, congratulations on the drama.

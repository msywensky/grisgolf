-- ============================================================
-- HMB Scramble — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  course text not null,
  holes int not null default 18 check (holes in (9, 18)),
  status text not null default 'upcoming' check (status in ('upcoming', 'live', 'final')),
  created_by text not null default 'The Commissioner',
  share_code text not null unique,
  created_at timestamptz not null default now()
);

-- Admin pins live in their own table with NO anon policies, so the
-- public event pages can never leak them. Only the FastAPI service
-- role reads this.
create table if not exists event_admins (
  event_id uuid primary key references events(id) on delete cascade,
  pin text not null
);

create table if not exists golfers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handicap numeric not null default 0 check (handicap >= 0 and handicap <= 54),
  event_id uuid not null references events(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_id uuid not null references events(id) on delete cascade,
  player1_id uuid references golfers(id) on delete set null,
  player2_id uuid references golfers(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  score int not null check (score between 1 and 10),
  -- scramble shot attribution: how many of the team's strokes came from each
  -- player's ball (slots match teams.player1_id / teams.player2_id). Optional.
  player1_shots int check (player1_shots between 0 and 10),
  player2_shots int check (player2_shots between 0 and 10),
  notes text,
  created_at timestamptz not null default now(),
  -- one score per team per hole; scoring UI upserts against this
  unique (event_id, team_id, hole_number)
);

-- Existing databases: the create above is `if not exists`, so bring old
-- scores tables up to date too (no-ops once applied).
alter table scores add column if not exists player1_shots int check (player1_shots between 0 and 10);
alter table scores add column if not exists player2_shots int check (player2_shots between 0 and 10);

-- Real golf courses cached from GolfCourseAPI. Written ONLY by the FastAPI
-- backend (service role) when an organizer links a course to an event, so
-- repeat events at the same course never re-hit the rate-limited external API.
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  external_id int not null unique,           -- GolfCourseAPI course id
  club_name text not null,
  course_name text not null,
  address text,
  city text,
  state text,
  country text,
  latitude double precision,
  longitude double precision,
  tees jsonb not null default '{}'::jsonb,   -- {male: [TeeBox], female: [TeeBox]}
  fetched_at timestamptz not null default now()
);

-- Existing databases: link events to a cached course + the tee the crew plays.
-- tee_gender is needed because tee names repeat across the male/female sets.
alter table events add column if not exists course_id uuid references courses(id);
alter table events add column if not exists tee_name text;
alter table events add column if not exists tee_gender text check (tee_gender in ('male', 'female'));

create table if not exists highlights (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  hole_number int check (hole_number between 1 and 18),
  team_id uuid references teams(id) on delete set null,
  golfer_id uuid references golfers(id) on delete set null,
  caption text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_golfers_event on golfers(event_id);
create index if not exists idx_teams_event on teams(event_id);
create index if not exists idx_scores_event on scores(event_id);
create index if not exists idx_highlights_event on highlights(event_id);

-- ---------- Row Level Security ----------
-- Beer-league trust model: anyone with the link can read everything and
-- add scores/teams/highlights. Deletes and event mutations go through
-- the FastAPI backend (service role) guarded by the admin pin.

alter table events enable row level security;
alter table event_admins enable row level security;
alter table courses enable row level security;
alter table golfers enable row level security;
alter table teams enable row level security;
alter table scores enable row level security;
alter table highlights enable row level security;

-- events: public read only (created via backend)
create policy "events are public to read" on events for select using (true);

-- event_admins: NO policies — anon/authed get nothing, service role bypasses RLS.

-- courses: public read only (cached via backend, which bypasses RLS)
create policy "courses are public to read" on courses for select using (true);

-- golfers: public read + join
create policy "golfers are public to read" on golfers for select using (true);
create policy "anyone can join as golfer" on golfers for insert with check (true);

-- teams: public read, create, and claim-a-seat updates
create policy "teams are public to read" on teams for select using (true);
create policy "anyone can create a team" on teams for insert with check (true);
create policy "anyone can update a team" on teams for update using (true);

-- scores: public read + write (it's a scramble, we trust the foursome)
create policy "scores are public to read" on scores for select using (true);
create policy "anyone can add scores" on scores for insert with check (true);
create policy "anyone can fix scores" on scores for update using (true);

-- highlights: public read + write
create policy "highlights are public to read" on highlights for select using (true);
create policy "anyone can add highlights" on highlights for insert with check (true);

-- ---------- Realtime ----------
-- Broadcast changes so leaderboards update mid-swing.

alter publication supabase_realtime add table scores;
alter publication supabase_realtime add table highlights;
alter publication supabase_realtime add table teams;
alter publication supabase_realtime add table golfers;

-- ---------- Storage: highlight photos ----------

insert into storage.buckets (id, name, public)
values ('highlights', 'highlights', true)
on conflict (id) do nothing;

create policy "highlight photos are public"
  on storage.objects for select
  using (bucket_id = 'highlights');

create policy "anyone can upload highlight photos"
  on storage.objects for insert
  with check (bucket_id = 'highlights');

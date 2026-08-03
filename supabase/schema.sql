-- ============================================================
-- HMB Scramble — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Safe to re-run against an existing database: tables are `if not exists`,
-- policies drop-and-recreate, realtime additions check the publication first.
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

-- ---------- League mode (optional) ----------
-- Casual scrambles stay account-less. Leagues layer on top: Supabase Auth
-- accounts, persistent rosters, seasons with fixed 2-person teams, and
-- season standings. An event with league_id null is a plain scramble and
-- behaves exactly as before.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  default_handicap numeric not null default 0 check (default_handicap >= 0 and default_handicap <= 54),
  created_at timestamptz not null default now()
);

create table if not exists leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  share_code text not null unique,
  -- How season standings accumulate: placement points per event, summed
  -- hole-by-hole match points, or won-the-night W-L-T record.
  scoring_mode text not null default 'placement'
    check (scoring_mode in ('placement', 'match_points', 'record')),
  -- Points by finishing position when scoring_mode = 'placement'.
  placement_points jsonb not null default '[10, 8, 6, 4, 2]'::jsonb,
  created_at timestamptz not null default now()
);

-- Many-to-many: one person can run several leagues, and managers can play.
create table if not exists league_managers (
  league_id uuid not null references leagues(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (league_id, user_id)
);

create table if not exists league_members (
  league_id uuid not null references leagues(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'complete')),
  created_at timestamptz not null default now()
);

-- Fixed 2-person pairs for a season; league events copy these into per-event
-- teams so the scoring path is identical to casual scrambles.
create table if not exists season_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  name text not null,
  player1_user_id uuid references profiles(id) on delete set null,
  player2_user_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Nullable links, not forks: null = casual event/golfer, unchanged behavior.
alter table events add column if not exists league_id uuid references leagues(id) on delete set null;
alter table events add column if not exists season_id uuid references seasons(id) on delete set null;
alter table golfers add column if not exists user_id uuid references profiles(id) on delete set null;
alter table teams add column if not exists season_team_id uuid references season_teams(id) on delete set null;

create index if not exists idx_seasons_league on seasons(league_id);
create index if not exists idx_season_teams_season on season_teams(season_id);
create index if not exists idx_events_league on events(league_id);

-- True when the event is a casual scramble (trust the foursome) or the
-- signed-in user is on the event's league roster. Both tables consulted are
-- publicly readable, so no security definer needed.
create or replace function can_write_event(eid uuid) returns boolean
language sql stable as $$
  select case
    when e.league_id is null then true
    else exists (
      select 1 from league_members m
      where m.league_id = e.league_id and m.user_id = auth.uid()
    )
  end
  from events e where e.id = eid
$$;

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

-- Policies are drop-and-recreate so the whole file stays safe to re-run
-- against an existing database (create policy has no "if not exists").

-- events: public read only (created via backend)
drop policy if exists "events are public to read" on events;
create policy "events are public to read" on events for select using (true);

-- event_admins: NO policies — anon/authed get nothing, service role bypasses RLS.

-- courses: public read only (cached via backend, which bypasses RLS)
drop policy if exists "courses are public to read" on courses;
create policy "courses are public to read" on courses for select using (true);

-- golfers: public read + join
drop policy if exists "golfers are public to read" on golfers;
drop policy if exists "anyone can join as golfer" on golfers;
create policy "golfers are public to read" on golfers for select using (true);
create policy "anyone can join as golfer" on golfers for insert with check (true);

-- teams: public read, create, and claim-a-seat updates
drop policy if exists "teams are public to read" on teams;
drop policy if exists "anyone can create a team" on teams;
drop policy if exists "anyone can update a team" on teams;
create policy "teams are public to read" on teams for select using (true);
create policy "anyone can create a team" on teams for insert with check (true);
create policy "anyone can update a team" on teams for update using (true);

-- scores: public read + write (it's a scramble, we trust the foursome)
drop policy if exists "scores are public to read" on scores;
drop policy if exists "anyone can add scores" on scores;
drop policy if exists "anyone can fix scores" on scores;
create policy "scores are public to read" on scores for select using (true);
create policy "anyone can add scores" on scores for insert with check (true);
create policy "anyone can fix scores" on scores for update using (true);

-- highlights: public read + write
drop policy if exists "highlights are public to read" on highlights;
drop policy if exists "anyone can add highlights" on highlights;
create policy "highlights are public to read" on highlights for select using (true);
create policy "anyone can add highlights" on highlights for insert with check (true);

-- ---------- League RLS ----------
-- League pages are public with the link (like events), so everything is
-- readable. All league writes go through the FastAPI backend (service role,
-- JWT-verified) — no anon write policies on league tables.

alter table profiles enable row level security;
alter table leagues enable row level security;
alter table league_managers enable row level security;
alter table league_members enable row level security;
alter table seasons enable row level security;
alter table season_teams enable row level security;

drop policy if exists "profiles are public to read" on profiles;
drop policy if exists "users create their own profile" on profiles;
drop policy if exists "users update their own profile" on profiles;
create policy "profiles are public to read" on profiles for select using (true);
create policy "users create their own profile" on profiles for insert with check (auth.uid() = id);
create policy "users update their own profile" on profiles for update using (auth.uid() = id);

drop policy if exists "leagues are public to read" on leagues;
drop policy if exists "league managers are public to read" on league_managers;
drop policy if exists "league members are public to read" on league_members;
drop policy if exists "seasons are public to read" on seasons;
drop policy if exists "season teams are public to read" on season_teams;
create policy "leagues are public to read" on leagues for select using (true);
create policy "league managers are public to read" on league_managers for select using (true);
create policy "league members are public to read" on league_members for select using (true);
create policy "seasons are public to read" on seasons for select using (true);
create policy "season teams are public to read" on season_teams for select using (true);

-- League events tighten the beer-league trust model: the permissive
-- anyone-can-write policies above still apply to casual events, but these
-- restrictive policies AND in a roster check when the event belongs to a
-- league. Highlights stay open — spectator lore is welcome either way.
drop policy if exists "league events: only members add scores" on scores;
drop policy if exists "league events: only members fix scores" on scores;
drop policy if exists "league events: only members create teams" on teams;
drop policy if exists "league events: only members update teams" on teams;
drop policy if exists "league events: only members join as golfers" on golfers;
create policy "league events: only members add scores"
  on scores as restrictive for insert with check (can_write_event(event_id));
create policy "league events: only members fix scores"
  on scores as restrictive for update using (can_write_event(event_id));
create policy "league events: only members create teams"
  on teams as restrictive for insert with check (can_write_event(event_id));
create policy "league events: only members update teams"
  on teams as restrictive for update using (can_write_event(event_id));
create policy "league events: only members join as golfers"
  on golfers as restrictive for insert with check (can_write_event(event_id));

-- ---------- Realtime ----------
-- Broadcast changes so leaderboards update mid-swing.

-- "add table" errors if the table is already in the publication, so skip
-- the ones that are (keeps this file re-runnable).
do $$
declare t text;
begin
  foreach t in array array['scores', 'highlights', 'teams', 'golfers'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ---------- Storage: highlight photos ----------

insert into storage.buckets (id, name, public)
values ('highlights', 'highlights', true)
on conflict (id) do nothing;

drop policy if exists "highlight photos are public" on storage.objects;
drop policy if exists "anyone can upload highlight photos" on storage.objects;

create policy "highlight photos are public"
  on storage.objects for select
  using (bucket_id = 'highlights');

create policy "anyone can upload highlight photos"
  on storage.objects for insert
  with check (bucket_id = 'highlights');

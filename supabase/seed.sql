-- ============================================================
-- HMB Scramble — demo data
-- A live 9-hole event at /event/demo1234 so the app never looks
-- lonely. Run AFTER schema.sql. Safe to re-run (deletes first).
-- Admin pin for the demo event: 1919
-- ============================================================

delete from events where share_code = 'demo1234';

-- A "cached" real course so the demo shows pars + the directions link without
-- ever touching GolfCourseAPI. external_id '999999' won't collide with real (alphanumeric) ids.
insert into courses (id, external_id, club_name, course_name, address, city, state, country, latitude, longitude, tees)
values (
  'd0000000-0000-4000-8000-000000000001', '999999',
  'Sunny Pines Muni', 'Sunny Pines Muni',
  '1 Fairway Lane, Media, PA 19063, USA', 'Media', 'PA', 'United States',
  39.9168, -75.3876,
  '{"male": [{
      "tee_name": "Lager", "course_rating": 34.1, "slope_rating": 118,
      "total_yards": 2905, "par_total": 36, "number_of_holes": 9,
      "holes": [
        {"par": 4, "yardage": 355, "handicap": 3}, {"par": 3, "yardage": 160, "handicap": 9},
        {"par": 5, "yardage": 480, "handicap": 1}, {"par": 4, "yardage": 340, "handicap": 5},
        {"par": 4, "yardage": 365, "handicap": 4}, {"par": 3, "yardage": 145, "handicap": 8},
        {"par": 4, "yardage": 330, "handicap": 6}, {"par": 5, "yardage": 495, "handicap": 2},
        {"par": 4, "yardage": 235, "handicap": 7}
      ]
  }]}'::jsonb
)
on conflict (external_id) do update set
  club_name = excluded.club_name, course_name = excluded.course_name,
  address = excluded.address, city = excluded.city, state = excluded.state,
  country = excluded.country, latitude = excluded.latitude,
  longitude = excluded.longitude, tees = excluded.tees, fetched_at = now();

-- The event (dated today so it always looks fresh)
insert into events (id, title, date, course, course_id, tee_name, tee_gender, holes, status, created_by, share_code) values
  ('a0000000-0000-4000-8000-000000000001', 'The Saturday Slice Open', current_date,
   'Sunny Pines Muni', (select id from courses where external_id = '999999'), 'Lager', 'male',
   9, 'live', 'Commissioner Dale', 'demo1234');

insert into event_admins (event_id, pin) values
  ('a0000000-0000-4000-8000-000000000001', '1919');

-- The regulars
insert into golfers (id, name, handicap, event_id) values
  ('b0000000-0000-4000-8000-000000000001', 'Big Rick',         12, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'Tommy Two-Putts',  18, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000003', 'Dale',              9, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000004', 'Sauce',            22, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000005', 'Kenny the Cooler', 15, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000006', 'The Professor',     7, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000007', 'Marty',            20, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000008', 'Chip Sandwedge',   11, 'a0000000-0000-4000-8000-000000000001');

-- The teams
insert into teams (id, name, event_id, player1_id, player2_id) values
  ('c0000000-0000-4000-8000-000000000001', 'The Hoppy Bogeys',     'a0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000002', 'Draft Punks',          'a0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004'),
  ('c0000000-0000-4000-8000-000000000003', 'Shanks A Lot',         'a0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000006'),
  ('c0000000-0000-4000-8000-000000000004', 'The Lukewarm Lagers',  'a0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000008');

-- Mid-round scores: leaders thru 7, one group dawdling on 6 (beer stop).
-- Two teams tag whose shots counted (player1_shots/player2_shots), two don't —
-- the split is optional and the app should handle both.
insert into scores (event_id, team_id, hole_number, score, player1_shots, player2_shots, notes) values
  -- The Hoppy Bogeys: thru 7, gross 33 (Big Rick / Tommy Two-Putts)
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 1, 5, 3, 2, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 2, 4, 2, 2, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 3, 5, 3, 2, 'Cart path bounce 🛞'),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 4, 4, 1, 3, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 5, 6, 4, 2, 'Total team collapse 📉'),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 6, 4, 2, 2, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 7, 5, 3, 2, null),
  -- Draft Punks: thru 7, gross 30 — heaters (Dale carrying Sauce)
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 1, 4, 3, 1, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 2, 4, 2, 2, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 3, 3, 2, 1, 'Drained a bomb 🎯'),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 4, 5, 3, 2, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 5, 4, 3, 1, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 6, 5, 2, 3, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 7, 5, 4, 1, null),
  -- Shanks A Lot: thru 7, gross 36 — living up to the name (no split tracked)
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 1, 5, null, null, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 2, 6, null, null, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 3, 5, null, null, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 4, 4, null, null, 'Hero par save 🦸'),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 5, 5, null, null, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 6, 7, null, null, 'Three trips to the beach 🏖️'),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 7, 4, null, null, null),
  -- The Lukewarm Lagers: thru 6, gross 28 — sneaky good, slow drinkers (no split tracked)
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 1, 4, null, null, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 2, 5, null, null, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 3, 4, null, null, null),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 4, 5, null, null, 'Beer-in-hand putt 🍺'),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 5, 3, null, null, 'BIRDIE. Chaos.'),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 6, 7, null, null, 'Found the water. Twice.');

-- ============================================================
-- Demo league at /league/demoleag — two finished league nights so
-- season standings render with real numbers. The demo1234 event above
-- stays casual (no league) so signed-out visitors can still score it.
-- ============================================================

delete from events where share_code in ('demolg01', 'demolg02');
delete from leagues where share_code = 'demoleag';
delete from auth.users where id in (
  'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
  'e0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004');

-- Demo accounts (minimal auth.users rows — enough for FK + profiles)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       email, '', now(), now(), now(),
       '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb
from (values
  ('e0000000-0000-4000-8000-000000000001'::uuid, 'dale@demo.hmb'),
  ('e0000000-0000-4000-8000-000000000002'::uuid, 'sauce@demo.hmb'),
  ('e0000000-0000-4000-8000-000000000003'::uuid, 'rick@demo.hmb'),
  ('e0000000-0000-4000-8000-000000000004'::uuid, 'tommy@demo.hmb')
) as u(id, email)
on conflict (id) do nothing;

insert into profiles (id, display_name, default_handicap) values
  ('e0000000-0000-4000-8000-000000000001', 'Dale',              9),
  ('e0000000-0000-4000-8000-000000000002', 'Sauce',            22),
  ('e0000000-0000-4000-8000-000000000003', 'Big Rick',         12),
  ('e0000000-0000-4000-8000-000000000004', 'Tommy Two-Putts',  18);

insert into leagues (id, name, share_code, scoring_mode, placement_points) values
  ('f0000000-0000-4000-8000-000000000001', 'The Thirsty Thursday League', 'demoleag',
   'placement', '[10, 8, 6, 4, 2]'::jsonb);

-- Dale runs the league AND plays in it (managers can be players)
insert into league_managers (league_id, user_id) values
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001');
insert into league_members (league_id, user_id) values
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003'),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004');

insert into seasons (id, league_id, name, starts_on, status) values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'Summer 2026', current_date - 21, 'active');

insert into season_teams (id, season_id, name, player1_user_id, player2_user_id) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
   'The Mug Club', 'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001',
   'Foam Rangers', 'e0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004');

-- Two finished league nights at Sunny Pines
insert into events (id, title, date, course, course_id, tee_name, tee_gender, holes, status,
                    created_by, share_code, league_id, season_id) values
  ('a0000000-0000-4000-8000-000000000002', 'League Night 1', current_date - 14,
   'Sunny Pines Muni', (select id from courses where external_id = '999999'), 'Lager', 'male',
   9, 'final', 'Dale', 'demolg01',
   'f0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000003', 'League Night 2', current_date - 7,
   'Sunny Pines Muni', (select id from courses where external_id = '999999'), 'Lager', 'male',
   9, 'final', 'Dale', 'demolg02',
   'f0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001');

insert into event_admins (event_id, pin) values
  ('a0000000-0000-4000-8000-000000000002', '1919'),
  ('a0000000-0000-4000-8000-000000000003', '1919');

-- Account-linked golfers per night (name/handicap snapshot from profiles)
insert into golfers (id, name, handicap, event_id, user_id) values
  ('b1000000-0000-4000-8000-000000000001', 'Dale',             9, 'a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000002', 'Sauce',           22, 'a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002'),
  ('b1000000-0000-4000-8000-000000000003', 'Big Rick',        12, 'a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000003'),
  ('b1000000-0000-4000-8000-000000000004', 'Tommy Two-Putts', 18, 'a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000004'),
  ('b1000000-0000-4000-8000-000000000005', 'Dale',             9, 'a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000006', 'Sauce',           22, 'a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002'),
  ('b1000000-0000-4000-8000-000000000007', 'Big Rick',        12, 'a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003'),
  ('b1000000-0000-4000-8000-000000000008', 'Tommy Two-Putts', 18, 'a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004');

-- Event teams tied back to their season team via season_team_id
insert into teams (id, name, event_id, player1_id, player2_id, season_team_id) values
  ('c1000000-0000-4000-8000-000000000001', 'The Mug Club', 'a0000000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000002', 'Foam Rangers', 'a0000000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000002'),
  ('c1000000-0000-4000-8000-000000000003', 'The Mug Club', 'a0000000-0000-4000-8000-000000000003',
   'b1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000006', 'f2000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000004', 'Foam Rangers', 'a0000000-0000-4000-8000-000000000003',
   'b1000000-0000-4000-8000-000000000007', 'b1000000-0000-4000-8000-000000000008', 'f2000000-0000-4000-8000-000000000002');

-- Night 1: Mug Club 37, Foam Rangers 40. Night 2: Mug Club 36, Foam Rangers 40.
insert into scores (event_id, team_id, hole_number, score)
select 'a0000000-0000-4000-8000-000000000002'::uuid, 'c1000000-0000-4000-8000-000000000001'::uuid, h, s
from unnest(array[4,4,4,5,4,3,4,5,4]) with ordinality as t(s, h)
union all
select 'a0000000-0000-4000-8000-000000000002'::uuid, 'c1000000-0000-4000-8000-000000000002'::uuid, h, s
from unnest(array[5,4,5,4,5,3,4,6,4]) with ordinality as t(s, h)
union all
select 'a0000000-0000-4000-8000-000000000003'::uuid, 'c1000000-0000-4000-8000-000000000003'::uuid, h, s
from unnest(array[4,3,5,4,4,3,4,5,4]) with ordinality as t(s, h)
union all
select 'a0000000-0000-4000-8000-000000000003'::uuid, 'c1000000-0000-4000-8000-000000000004'::uuid, h, s
from unnest(array[5,4,5,4,4,4,4,5,5]) with ordinality as t(s, h);

insert into highlights (event_id, hole_number, team_id, caption, image_url) values
  ('a0000000-0000-4000-8000-000000000003', 6, 'c1000000-0000-4000-8000-000000000003',
   'Dale birdied 6 two weeks in a row. League under investigation.', null);

-- The lore
insert into highlights (event_id, hole_number, team_id, caption, image_url) values
  ('a0000000-0000-4000-8000-000000000001', 3, 'c0000000-0000-4000-8000-000000000002',
   'Dale drained a 40-footer with a hot dog in his other hand', null),
  ('a0000000-0000-4000-8000-000000000001', 5, 'c0000000-0000-4000-8000-000000000004',
   'Marty called bank shot off the cart path and IT WORKED', null),
  ('a0000000-0000-4000-8000-000000000001', 6, 'c0000000-0000-4000-8000-000000000003',
   'Kenny threw his wedge into the pond, then his ball went in after it. Solidarity.', null);

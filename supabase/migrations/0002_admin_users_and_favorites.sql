-- Adds public user accounts support: an explicit admin allowlist (so signed-up
-- visitors don't inherit admin CRUD access) and a favorites table.

-- ============================================================================
-- admin_users — explicit allowlist of who the admin panel/write policies trust
-- ============================================================================
-- Until now, every RLS policy below treated ANY authenticated Supabase user as
-- the admin (`auth.role() = 'authenticated'`), which was fine while the only
-- way to get an account was the operator creating one by hand. Public
-- signup/login changes that: any visitor who signs up would otherwise satisfy
-- that same check and get full CRUD on every table, and would also pass
-- middleware.ts's "is there a session" check into /admin. admin_users fixes
-- that by requiring explicit membership, not just "is logged in".
--
-- There is intentionally no INSERT/UPDATE/DELETE policy for anon or
-- authenticated roles on this table — only the service role (which bypasses
-- RLS) or a superuser via the SQL editor can grant/revoke admin status. This
-- is a manual, one-time act done outside the app, e.g.:
--   insert into admin_users (id) select id from auth.users where email = 'you@example.com';
create table if not exists admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admin_users enable row level security;

-- A logged-in user may check ONLY their own membership (used by
-- middleware.ts to decide whether to let them into /admin) — this does not
-- let anyone list or read other users' admin status.
drop policy if exists "users read own admin_users row" on admin_users;
create policy "users read own admin_users row" on admin_users
  for select
  to authenticated
  using (id = auth.uid());

-- ============================================================================
-- Replace the old "any authenticated user is the admin" policies
-- ============================================================================

drop policy if exists "authenticated full access cities" on cities;
create policy "admin full access cities" on cities
  for all
  to authenticated
  using (exists (select 1 from admin_users au where au.id = auth.uid()))
  with check (exists (select 1 from admin_users au where au.id = auth.uid()));

drop policy if exists "authenticated full access venues" on venues;
create policy "admin full access venues" on venues
  for all
  to authenticated
  using (exists (select 1 from admin_users au where au.id = auth.uid()))
  with check (exists (select 1 from admin_users au where au.id = auth.uid()));

drop policy if exists "authenticated full access categories" on categories;
create policy "admin full access categories" on categories
  for all
  to authenticated
  using (exists (select 1 from admin_users au where au.id = auth.uid()))
  with check (exists (select 1 from admin_users au where au.id = auth.uid()));

drop policy if exists "authenticated full access events" on events;
create policy "admin full access events" on events
  for all
  to authenticated
  using (exists (select 1 from admin_users au where au.id = auth.uid()))
  with check (exists (select 1 from admin_users au where au.id = auth.uid()));

drop policy if exists "authenticated full access scrape_sources" on scrape_sources;
create policy "admin full access scrape_sources" on scrape_sources
  for all
  to authenticated
  using (exists (select 1 from admin_users au where au.id = auth.uid()))
  with check (exists (select 1 from admin_users au where au.id = auth.uid()));

-- ============================================================================
-- Restore public-read for logged-in regular users
-- ============================================================================
-- The existing "public read ..." policies target the `anon` role only, which
-- stops applying once a request carries a logged-in user's JWT (PostgREST
-- then evaluates policies as `authenticated`, not `anon`). Previously that
-- didn't matter because every authenticated user also matched the old
-- full-access policy. Now that full access is admin-only, regular logged-in
-- users need their own read policies mirroring the anon ones, or the site
-- would appear empty to them after logging in.

drop policy if exists "authenticated read cities" on cities;
create policy "authenticated read cities" on cities
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated read venues" on venues;
create policy "authenticated read venues" on venues
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated read categories" on categories;
create policy "authenticated read categories" on categories
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated read approved events" on events;
create policy "authenticated read approved events" on events
  for select
  to authenticated
  using (status = 'approved');

-- ============================================================================
-- favorites — a regular (non-admin) user's saved events
-- ============================================================================

create table if not exists favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists favorites_user_id_idx on favorites (user_id);

alter table favorites enable row level security;

drop policy if exists "users manage own favorites" on favorites;
create policy "users manage own favorites" on favorites
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

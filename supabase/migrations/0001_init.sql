-- Türkiye Etkinlik Platformu — MVP schema
-- Target: Supabase (Postgres). Run via the Supabase SQL editor or `supabase db execute`.
-- Safe to re-run: tables use `if not exists`; policies/indexes are dropped and recreated.

-- pgcrypto provides gen_random_uuid(); Supabase projects have it enabled by default,
-- but we ensure it here for portability.
create extension if not exists pgcrypto;

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities (id),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  created_at timestamptz default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  city_id uuid not null references cities (id),
  venue_id uuid references venues (id),
  category_id uuid references categories (id),
  price text,
  source_type text not null check (source_type in ('manual', 'scraped')),
  source_url text,
  image_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid references auth.users (id),
  created_at timestamptz default now()
);

create table if not exists scrape_sources (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities (id),
  name text not null,
  url text not null,
  parser_type text not null,
  last_run_at timestamptz,
  is_active boolean not null default true
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists events_city_status_start_at_idx on events (city_id, status, start_at);
create index if not exists events_status_idx on events (status);
create index if not exists venues_city_id_idx on venues (city_id);

-- Dedup for scrapers: title + start_at + venue_id (treating null venue_id as a
-- fixed sentinel so NULLs collide instead of being treated as distinct, which
-- is Postgres's default behavior for unique indexes). Scrapers should upsert
-- with `on conflict (title, start_at, coalesce(venue_id, '00000000-0000-0000-0000-000000000000'))`.
create unique index if not exists events_dedup_idx
  on events (title, start_at, coalesce(venue_id, '00000000-0000-0000-0000-000000000000'));

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table cities enable row level security;
alter table venues enable row level security;
alter table categories enable row level security;
alter table events enable row level security;
alter table scrape_sources enable row level security;

-- Public (anon) read access ---------------------------------------------------

drop policy if exists "public read cities" on cities;
create policy "public read cities" on cities
  for select
  to anon
  using (true);

drop policy if exists "public read venues" on venues;
create policy "public read venues" on venues
  for select
  to anon
  using (true);

drop policy if exists "public read categories" on categories;
create policy "public read categories" on categories
  for select
  to anon
  using (true);

drop policy if exists "public read approved events" on events;
create policy "public read approved events" on events
  for select
  to anon
  using (status = 'approved');

-- Authenticated (admin) full access ------------------------------------------
-- MVP has a single admin user; any authenticated user gets full CRUD on every table.

drop policy if exists "authenticated full access cities" on cities;
create policy "authenticated full access cities" on cities
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access venues" on venues;
create policy "authenticated full access venues" on venues
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access categories" on categories;
create policy "authenticated full access categories" on categories
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access events" on events;
create policy "authenticated full access events" on events
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access scrape_sources" on scrape_sources;
create policy "authenticated full access scrape_sources" on scrape_sources
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Note: scraper writes use the Supabase service_role key, which bypasses RLS
-- entirely, so no dedicated policy is needed for that path.

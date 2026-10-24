-- supabase/migrations/0005_amedspor_matches.sql
-- Amedspor's upcoming matches, home and away, for the match banner
-- (components/AmedsporBanner.tsx). Written by
-- scripts/scrapers/amedspor-tff.ts from tff.org.
--
-- A separate table rather than rows in `events`: away matches are not
-- Diyarbakır events and must not appear in the listing, the sitemap or the
-- city's counts. Home matches are ALSO written to `events` (they are things
-- to go to in Diyarbakır); this table is only what the banner reads.
--
-- Public read, no write policy: only the scraper's service role key, which
-- bypasses RLS, writes here.

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  -- TFF's match id: the scraper's upsert key, so a moved kick-off updates
  -- the row instead of adding one.
  tff_mac_id text not null unique,
  home_team text not null,
  away_team text not null,
  is_home boolean not null,
  start_at timestamptz not null,
  stadium text,
  city text,
  competition text,
  -- TFF puts placeholder kick-off times on matches a few weeks out.
  tentative boolean not null default false,
  source_url text not null,
  updated_at timestamptz not null default now()
);

create index if not exists matches_start_at_idx on matches (start_at);

alter table matches enable row level security;

drop policy if exists "public read matches" on matches;
create policy "public read matches" on matches
  for select
  to anon, authenticated
  using (true);

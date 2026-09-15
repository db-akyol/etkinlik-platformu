-- Cross-source duplicate fix.
--
-- The original dedup key was (title, start_at, venue_id). That works within
-- ONE source, but the same real-world event scraped from two different
-- ticket vendors (biletinial.com, biletix.com) was still landing as two rows,
-- because each site spells the venue name slightly differently ("Diyarbakır
-- Sezai Karakoç Kültür ve Kongre Merkezi" vs "Diyarbakır Sezai Karakoç KKM"),
-- so resolve-refs.ts's exact-match venue resolution creates two different
-- `venues` rows for the same physical place -- two different venue_ids for
-- what is unambiguously the same event.
--
-- Confirmed empirically (after fixing an unrelated timezone bug that had
-- been masking this): once both sources' start_at values agree, well over a
-- dozen title+start_at pairs matched exactly across biletinial and biletix,
-- differing ONLY in venue_id.
--
-- Dropping venue_id from the key trades a vanishingly small risk (two
-- genuinely different events sharing both an exact title string AND the
-- exact same start timestamp, in the same city) for actually fixing the
-- duplicate listings users see today. This also happens to make the key a
-- plain (non-expression) index, unlike the old
-- `coalesce(venue_id, <sentinel>)` one -- see upsert-event.ts for why that
-- mattered.
--
-- Existing duplicate rows must be merged BEFORE the new unique index can be
-- created (it would otherwise fail on constraint violation): keep the
-- oldest row per (title, start_at) group and delete the rest.
-- `favorites.event_id references events(id) on delete cascade` (see
-- 0002_admin_users_and_favorites.sql) cleans up any favorites pointing at a
-- deleted duplicate automatically.
delete from events a
using events b
where a.title = b.title
  and a.start_at = b.start_at
  and a.id <> b.id
  and (a.created_at, a.id) > (b.created_at, b.id);

drop index if exists events_dedup_idx;
create unique index events_dedup_idx on events (title, start_at);

# Scrapers

Framework for pulling events from external sources into the `events` table.
The scrapers are the project's **primary** data source — manual admin entry
exists only as a fallback for what they can't reach. See `docs/plan.md` for
overall project context.

## Layout

### Shared

- `lib/supabase-admin.ts` — service-role Supabase client for Node scripts (bypasses RLS). Throws `MissingSupabaseConfigError` when env vars are absent, so callers can tell "not set up yet" apart from a real failure.
- `lib/types.ts` — `ScrapedEventInput` (what a parser must produce) and `ScrapeRunResult`.
- `lib/resolve-refs.ts` — resolves venue/category *names* to ids, creating rows as needed.
- `lib/normalize.ts` — `normalizeText`, `parseIstanbulLocalTime`, `stripDateTimeOffset`, `formatPriceTL`, `normalizeTitleForDedup`/`titlesMatchForDedup`. Read this before touching any date handling or the dedup fallback.
- `lib/upsert-event.ts` — dedup + upsert into `events`, forcing `source_type: "scraped"` and `status: "approved"`. Matches exact `(title, start_at)` first, then falls back to a normalized-title comparison among rows at the same `start_at` — read its header before touching dedup behavior.
- `run-all.ts` — runs every active parser in sequence, prints a summary, exits non-zero on any error. A parser that throws outright doesn't stop the others.

### Active parsers

- `biletinial.ts` — biletinial.com's Diyarbakır listing, via the same JSON endpoint the city page calls client-side, plus a per-event detail-page fetch for price/description/end time.
- `biletix.ts` — biletix.com's Diyarbakır search, via Playwright (the Solr endpoint needs the page's own Queue-it session) plus two public `bxcached` JSON APIs for price and event rules.
- `diyarbakir-belediye.ts` — the municipality's own events page, read out of the Next.js RSC payload embedded in the (robots-allowed) page HTML.
- `bubilet.ts` — bubilet.com.tr's Diyarbakır listings. **The one exception to this project's "don't build around a source's bot protection" rule** (see below) — the actual HTTP fetching happens in a separate Python subprocess, `bubilet_fetch.py`, using `cloudscraper` to get past bubilet's Cloudflare bot-challenge. This was an explicit, informed decision by the project owner, made after that rule was raised again for this specific case — see `docs/session-handoff.md`. `bubilet.ts` itself only maps the raw JSON that subprocess produces into the normal pipeline; read its header before touching it. `bubilet_fetch.py` also filters out events whose venue isn't actually in Diyarbakır — bubilet's own `city/{id}` URL filter isn't reliable for nationally-touring events.
- `example-hn.ts` — **structural example only**, not a real source. Proves the fetch → parse → normalize → resolve → upsert pipeline against a stable, real, static page (Hacker News' front page). Every row it would write is prefixed `[DEMO]`.

### Maintenance (one-off, not part of the cron)

- `merge-duplicate-events.ts` — finds and (with `--apply`) deletes existing near-duplicate `events` rows using the same `titlesMatchForDedup` the live fallback uses, keeping the oldest row per cluster. For cleaning up rows inserted before that fallback existed. Dry run by default; see its header.

## Adding a real parser

1. Check the source's `robots.txt` and terms first, and record what you found in a comment at the top of the parser (all three active parsers do this, with the date checked). Prefer an official API/RSS/JSON feed if one exists.
2. Actually open the target site in a browser and inspect its network traffic. All three active sources turned out to have a JSON endpoint or an embedded payload behind the rendered page — none of them needed HTML selector scraping.
3. Write `<source-name>.ts` exporting `run(): Promise<ScrapeRunResult>`. Model it on `diyarbakir-belediye.ts` (simplest) or `biletinial.ts` (with detail-page enrichment).
4. Parse times with `parseIstanbulLocalTime`, never a bare `new Date(...)` — see the "Time handling" section below.
5. Import and add its `run` export to the `PARSERS` array in `run-all.ts`.
6. Add unit tests for whatever pure extraction/mapping functions it has, and register the file in `scripts.test` in `package.json` (a test guards that you did).
7. Run it standalone (`npx tsx scripts/scrapers/<source-name>.ts`) against a configured `.env.local` and check the resulting `events` rows before relying on the cron.

## Running

```bash
npm run scrape           # run-all.ts — every active real parser
npm run scrape:example   # the HN structural demo only
npm test                 # unit tests (no network, no database)
```

Needs `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
(the service role key, not the anon key — see `lib/supabase-admin.ts`). Without
it, parsers still fetch/parse fine and log "would upsert: ..." instead of
crashing.

`bubilet.ts` additionally needs Python 3 on `PATH` (as `python3` or `python`)
with `pip install -r scripts/scrapers/requirements.txt` run once — see that
parser's header. Every other parser is plain Node/TypeScript.

In CI: `.github/workflows/scrape.yml` runs `run-all.ts` twice a day and on
manual dispatch from the Actions tab.

## Time handling

Every event time is stored as UTC and displayed as Turkey local time
(UTC+3, no DST since 2016). Two things bite here, and both have already
caused a live 3-hour display bug:

- `new Date("2026-09-18T20:00:00")` — an offset-less string is read in the
  **runtime's** timezone, which is UTC on Vercel and GitHub Actions. Use
  `parseIstanbulLocalTime` instead.
- Sources lie about offsets. biletinial's `SeanceDate` carries a trailing
  "Z" on some rows and not others for the same Turkey wall-clock time. Use
  `stripDateTimeOffset` before comparing two timestamps from a source, not
  just before parsing one.

`lib/normalize.test.ts` and `lib/istanbul-time.test.ts` pin both of these,
and deliberately run in a non-Turkey, DST-observing timezone so a regression
fails there rather than in production.

## Status and moderation

Scraped events are inserted as `status: "approved"` and go live immediately.
The approval queue was dropped once every active source turned out to be an
official ticket vendor or the municipality itself — there was no realistic
reason to reject a listing, and approving ~100 real events by hand twice a
day was pure toil. The actual security boundary is the `admin_users`-gated
RLS write access (see `supabase/migrations/0002_*.sql`), not this step.

Two consequences worth remembering:

- Re-scraping an event an admin **did** reject by hand refreshes its content
  but leaves `status` alone, so the rejection isn't silently undone.
- A lower-trust source (e.g. the Instagram-based scraping in `docs/plan.md`)
  should set `status: "pending"` explicitly rather than inherit this default
  — a scraped Instagram caption is far more likely to be garbled or spam
  than a vendor's structured feed.

## Ethics / ground rules (see docs/plan.md)

- Respect each source's `robots.txt` and terms of use.
- Keep request volume low — the cron runs twice a day, not more; parsers run in sequence, not in parallel, and pace themselves between requests.
- Prefer an official API/RSS/JSON feed over HTML scraping when a source offers one.
- Always populate `source_url` so every event links back to its origin.
- Don't build around a source's bot protection. If a site has actively blocked automated access, the default answer is to ask them, not to defeat it — `bubilet.ts`/`bubilet_fetch.py` is a deliberate, explicit exception the project owner chose to make for that one source (see that section above and `docs/session-handoff.md`), not a precedent to reuse casually for the next blocked source.

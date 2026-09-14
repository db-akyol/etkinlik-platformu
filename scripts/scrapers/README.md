# Scrapers

Framework for pulling events from external sources into the `events` table
as `status: "pending"` rows for admin review. See `docs/plan.md` for the
overall project context.

## Layout

- `lib/supabase-admin.ts` — service-role Supabase client for Node scripts (bypasses RLS).
- `lib/types.ts` — `ScrapedEventInput` (what a parser must produce) and `ScrapeRunResult`.
- `lib/resolve-refs.ts` — resolves venue/category *names* to ids, creating rows as needed.
- `lib/upsert-event.ts` — dedup + upsert into `events`, forcing `source_type: "scraped"` and `status: "pending"`.
- `example-hn.ts` — **structural example only**, not a real source. Proves the fetch → parse → normalize → resolve → upsert pipeline against a stable, real, static page (Hacker News' front page). Every row it would write is prefixed `[DEMO]`.
- `diyarbakir-belediye.template.ts` — TODO template for a real Playwright-based municipal-site parser. Not active until renamed (drop `.template`), filled in against the real site's inspected HTML, and added to `run-all.ts`.
- `run-all.ts` — runs every active parser in sequence, prints a summary, exits non-zero on any error.

## Adding a real parser

1. Actually open the target site in a browser and inspect its HTML/DOM (or find an official API/RSS/JSON feed — prefer that if it exists).
2. Copy `diyarbakir-belediye.template.ts` to `<source-name>.ts`, fill in the `// TODO:` sections with real selectors/logic.
3. Import and add its `run` export to the `PARSERS` array in `run-all.ts`.
4. Run it standalone first (`npx tsx scripts/scrapers/<source-name>.ts`) against a configured `.env.local` and check the `events` table for sane `pending` rows before relying on the cron.

## Running

```bash
npm run scrape:example   # runs the HN structural demo only
npm run scrape           # runs run-all.ts (every active real parser)
```

Needs `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
(the service role key, not the anon key — see `lib/supabase-admin.ts`). Without
it, `example-hn.ts` still fetches/parses fine and logs "would upsert: ..."
instead of crashing.

## Ethics / ground rules (see docs/plan.md)

- Respect each source's `robots.txt` and terms of use.
- Keep request volume low — the GitHub Actions cron runs twice a day, not more; parsers run in sequence, not in parallel.
- Prefer an official API/RSS/JSON feed over HTML scraping when a source offers one.
- Always populate `source_url` so every event links back to its origin.
- Scraped data is never auto-published: everything lands as `status: "pending"` and needs admin approval (see the RLS policies in `supabase/schema.sql`, which only expose `status = 'approved'` rows publicly).

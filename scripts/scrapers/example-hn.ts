/**
 * example-hn.ts — STRUCTURAL EXAMPLE ONLY, NOT A REAL DATA SOURCE.
 *
 * This parser does not produce real events. It scrapes the Hacker News front
 * page (a stable, public, static-HTML page that's safe to fetch for a quick
 * demo) purely to prove the scraper framework's pipeline works end-to-end:
 *
 *   fetch -> parse (cheerio) -> normalize (ScrapedEventInput) -> resolve
 *   refs (venue/category name -> id) -> dedup + upsert (status: "pending")
 *
 * Every event it produces is clearly tagged "[DEMO]" in the title and has a
 * description explaining it's fake, so nobody mistakes it for real data if it
 * ever lands in the `events` table.
 *
 * Once a real Diyarbakır source's HTML has actually been inspected, copy
 * `diyarbakir-belediye.template.ts` to a new `.ts` file, fill in the real
 * selectors, and add it to `run-all.ts`. Do NOT extend this file with real
 * scraping logic — it exists to be deleted or ignored once real parsers ship.
 *
 * Run standalone: `npm run scrape:example` (equivalent to
 * `npx tsx scripts/scrapers/example-hn.ts`). It's safe to run with no
 * `.env.local` configured — the upsert step will log what it *would* have
 * upserted instead of crashing, since fetch+parse+normalize is the thing this
 * file is meant to prove out.
 */
import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

import { getSupabaseAdmin } from "./lib/supabase-admin";
import { getDiyarbakirCityId, resolveCategoryId, resolveVenueId } from "./lib/resolve-refs";
import { upsertScrapedEvent } from "./lib/upsert-event";
import type { ScrapedEventInput, ScrapeRunResult } from "./lib/types";

const SOURCE_NAME = "example-hn (demo, not a real data source)";
const TARGET_URL = "https://news.ycombinator.com/";

// A small, honest User-Agent, per the scraping ethics note in docs/plan.md —
// identify ourselves and how to reach us rather than pretending to be a browser.
const USER_AGENT =
  "etkinlik-platformu-scraper-example/1.0 (structural demo; contact: repo owner)";

/** Fetches the HN front page and parses the first few story rows into
 *  demo `ScrapedEventInput`s. This is the part that's real: a genuine
 *  network fetch + genuine cheerio DOM parsing against genuine HTML. */
async function fetchAndParse(): Promise<ScrapedEventInput[]> {
  const res = await fetch(TARGET_URL, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const items: ScrapedEventInput[] = [];

  // HN front-page story rows are `<tr class="athing">`, each containing a
  // `.titleline > a` with the story title/link. Take the first 5 as our demo.
  $("tr.athing")
    .slice(0, 5)
    .each((i, el) => {
      const link = $(el).find(".titleline > a").first();
      const title = link.text().trim();
      const href = link.attr("href");
      if (!title || !href) return;

      const sourceUrl = href.startsWith("http") ? href : TARGET_URL;

      // Fake-but-valid scheduling: spread demo "events" one per day starting
      // tomorrow at 19:00 local time, purely so start_at values are distinct
      // and plausible (needed to exercise the dedup key meaningfully).
      const startAt = new Date();
      startAt.setDate(startAt.getDate() + i + 1);
      startAt.setHours(19, 0, 0, 0);

      items.push({
        title: `[DEMO] ${title}`,
        description:
          "Bu, scraper pipeline'ının (fetch -> parse -> normalize -> dedup -> " +
          "upsert) uçtan uca çalıştığını göstermek için Hacker News anasayfasından " +
          "üretilmiş SAHTE bir kayıttır. Gerçek bir etkinlik DEĞİLDİR.",
        start_at: startAt.toISOString(),
        end_at: null,
        venue_name: "Örnek Mekan (HN Demo)",
        category_name: "Demo",
        price: null,
        source_url: sourceUrl,
        image_url: null,
      });
    });

  return items;
}

export async function run(): Promise<ScrapeRunResult> {
  console.log(`[${SOURCE_NAME}] fetching ${TARGET_URL} ...`);
  const items = await fetchAndParse();
  console.log(`[${SOURCE_NAME}] parsed ${items.length} item(s) from the page.`);

  let upserted = 0;
  let errors = 0;

  for (const item of items) {
    try {
      // Constructing the admin client is inside the try: if Supabase env
      // vars aren't configured (e.g. a fresh checkout with no .env.local),
      // getSupabaseAdmin() throws here and we fall into the catch below
      // instead of crashing the whole run.
      const supabase = getSupabaseAdmin();
      const cityId = await getDiyarbakirCityId(supabase);
      const [venueId, categoryId] = await Promise.all([
        resolveVenueId(supabase, cityId, item.venue_name),
        resolveCategoryId(supabase, item.category_name),
      ]);

      const result = await upsertScrapedEvent(supabase, {
        title: item.title,
        description: item.description,
        start_at: item.start_at,
        end_at: item.end_at ?? null,
        city_id: cityId,
        venue_id: venueId,
        category_id: categoryId,
        price: item.price,
        source_type: "scraped",
        source_url: item.source_url,
        image_url: item.image_url,
        created_by: null,
      });

      if (result.action === "error") {
        errors++;
        console.error(`[${SOURCE_NAME}] upsert FAILED for "${item.title}":`, result.error);
      } else {
        upserted++;
        console.log(`[${SOURCE_NAME}] ${result.action}: "${item.title}"`);
      }
    } catch (err) {
      // Expected when .env.local isn't configured yet — log what would have
      // happened instead of crashing, per this file's job (prove fetch+parse
      // work even with zero Supabase setup).
      console.warn(
        `[${SOURCE_NAME}] would upsert (Supabase not reachable/configured): ` +
          `"${item.title}" @ ${item.start_at} (venue: ${item.venue_name}, ` +
          `category: ${item.category_name}, source: ${item.source_url})`,
      );
      console.warn(`[${SOURCE_NAME}]   reason: ${(err as Error).message}`);
    }
  }

  const summary: ScrapeRunResult = { source: SOURCE_NAME, found: items.length, upserted, errors };
  console.log(
    `[${SOURCE_NAME}] done. found=${summary.found} upserted=${summary.upserted} errors=${summary.errors}`,
  );
  return summary;
}

// Only auto-run when this file is executed directly (`npx tsx example-hn.ts`),
// not when `run-all.ts` imports `run` from it.
const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  run().catch((err) => {
    console.error(`[${SOURCE_NAME}] fatal error:`, err);
    process.exit(1);
  });
}

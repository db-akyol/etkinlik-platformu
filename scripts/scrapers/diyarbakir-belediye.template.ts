/**
 * TEMPLATE — copy this file to `diyarbakir-belediye.ts` (drop the
 * `.template` from the filename) and fill in the `// TODO:` sections once a
 * real developer has actually opened the target site in a browser, inspected
 * its HTML/DOM, and confirmed these selectors against the live page.
 *
 * Why this file is a template and not a working parser: nobody involved in
 * writing this framework fetched or inspected the real Diyarbakır Büyükşehir
 * Belediyesi culture/events page's HTML — guessing CSS selectors against a
 * real site and shipping them would silently produce wrong/broken data (or
 * silently break the moment the site's markup changes) with no way to notice.
 * This file exists to show the *shape* the real parser should take (using
 * Playwright, since municipal sites are frequently JS-rendered — a plain
 * `fetch()` + cheerio often gets an empty shell), wired into the same
 * fetch/resolve/upsert framework `example-hn.ts` proves out.
 *
 * Not imported by `run-all.ts` on purpose — `.template.ts` files are treated
 * as inactive. Only wire the real, renamed file into `run-all.ts`'s parser
 * list once it's been tested against the live site.
 */
import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { getSupabaseAdmin } from "./lib/supabase-admin";
import { getDiyarbakirCityId, resolveCategoryId, resolveVenueId } from "./lib/resolve-refs";
import { upsertScrapedEvent } from "./lib/upsert-event";
import type { ScrapedEventInput, ScrapeRunResult } from "./lib/types";

const SOURCE_NAME = "Diyarbakır Büyükşehir Belediyesi — Kültür Sanat";

// TODO: replace with the real events/culture-agenda listing page URL, e.g.
// something like "https://www.diyarbakir.bel.tr/kultur-sanat/etkinlikler".
// Check robots.txt at the domain root first (docs/plan.md scraping ethics
// note) and prefer an official API/RSS/JSON feed over HTML scraping if the
// site offers one.
const TARGET_URL = "https://example.invalid/REPLACE-ME";

const USER_AGENT =
  "etkinlik-platformu-scraper/1.0 (Diyarbakır etkinlik toplama; contact: repo owner)";

async function fetchAndParse(): Promise<ScrapedEventInput[]> {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });

    // TODO: replace ".event-card" with the real selector for one event's
    // container element, and increase the timeout if the listing loads data
    // asynchronously after initial render.
    await page.waitForSelector(".event-card", { timeout: 15_000 });

    // TODO: replace this whole extraction block with real selectors. Using
    // page.$$eval keeps the DOM-reading logic in-browser (fast, one round
    // trip) and returns plain serializable data.
    const rawItems = await page.$$eval(".event-card", (cards) =>
      cards.map((card) => ({
        // TODO: confirm these attribute/selector guesses against the real DOM.
        title: card.querySelector(".event-title")?.textContent?.trim() ?? "",
        dateText: card.querySelector(".event-date")?.textContent?.trim() ?? "",
        venueText: card.querySelector(".event-venue")?.textContent?.trim() ?? "",
        description: card.querySelector(".event-description")?.textContent?.trim() ?? "",
        priceText: card.querySelector(".event-price")?.textContent?.trim() ?? "",
        href: card.querySelector("a")?.getAttribute("href") ?? "",
        imageSrc: card.querySelector("img")?.getAttribute("src") ?? "",
      })),
    );

    const items: ScrapedEventInput[] = [];

    for (const raw of rawItems) {
      if (!raw.title || !raw.dateText) continue;

      // TODO: replace with real date parsing for whatever format the site
      // actually uses (e.g. "14 Eylül 2026 Pazartesi, 19:00" or a Turkish
      // month-name format). Do NOT trust `new Date(turkishString)` — that only
      // works for a handful of formats. Consider a small manual parser keyed
      // to Turkish month names, since this is Diyarbakır-specific content.
      const startAt = parseTurkishDateTime(raw.dateText);
      if (!startAt) continue; // skip events we couldn't confidently date

      items.push({
        title: raw.title,
        description: raw.description || null,
        start_at: startAt.toISOString(),
        end_at: null,
        venue_name: raw.venueText || null,
        // TODO: real category detection — the source may not label categories
        // explicitly. Consider keyword-matching the title/description against
        // known categories (Konser, Tiyatro, Atölye, Fuar, Spor, Sergi, ...)
        // as a heuristic, or leave null and let an admin categorize on review.
        category_name: null,
        price: raw.priceText || null,
        source_url: raw.href
          ? new URL(raw.href, TARGET_URL).toString()
          : TARGET_URL,
        image_url: raw.imageSrc ? new URL(raw.imageSrc, TARGET_URL).toString() : null,
      });
    }

    return items;
  } finally {
    await browser.close();
  }
}

/** TODO: real implementation. Placeholder returns null (i.e. "couldn't
 *  parse") for everything so this template never silently produces a wrong
 *  date if someone runs it before filling this in. */
function parseTurkishDateTime(_dateText: string): Date | null {
  return null;
}

export async function run(): Promise<ScrapeRunResult> {
  console.log(`[${SOURCE_NAME}] fetching ${TARGET_URL} ...`);
  const items = await fetchAndParse();
  console.log(`[${SOURCE_NAME}] parsed ${items.length} item(s) from the page.`);

  let upserted = 0;
  let errors = 0;

  const supabase = getSupabaseAdmin();
  const cityId = await getDiyarbakirCityId(supabase);

  for (const item of items) {
    try {
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
      errors++;
      console.error(`[${SOURCE_NAME}] error processing "${item.title}":`, err);
    }
  }

  const summary: ScrapeRunResult = { source: SOURCE_NAME, found: items.length, upserted, errors };
  console.log(
    `[${SOURCE_NAME}] done. found=${summary.found} upserted=${summary.upserted} errors=${summary.errors}`,
  );
  return summary;
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  run().catch((err) => {
    console.error(`[${SOURCE_NAME}] fatal error:`, err);
    process.exit(1);
  });
}

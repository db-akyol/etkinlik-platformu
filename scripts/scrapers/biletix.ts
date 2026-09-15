/**
 * biletix.ts — real parser for biletix.com's Diyarbakır events.
 *
 * robots.txt (checked 2026-09-15, https://www.biletix.com/robots.txt) only
 * disallows account/cart/checkout paths — /search and /solr/ are unrestricted.
 *
 * The site's search results are backed by a Solr JSON endpoint
 * (`/solr/tr/select`) that the page itself calls client-side. Unlike
 * biletinial's endpoint, this one sits behind Queue-it (a traffic-management
 * layer many Turkish ticketing sites use) and returns 404 to a bare request
 * with no prior session — NOT because it's fingerprinting/blocking
 * automation (a plain headless-Chromium request that actually loads the page
 * first gets a normal 200, no stealth tricks needed), but because it expects
 * a session cookie + an `x-queueit-ajaxpageurl` header that only get set once
 * the real search page has loaded. So: load the page for real with
 * Playwright (same as a human's browser would), then read the same JSON the
 * page itself reads, via `fetch` executed *inside* that page (inherits its
 * cookies) rather than trying to reconstruct the session by hand.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { getSupabaseAdmin } from "./lib/supabase-admin";
import { getDiyarbakirCityId, resolveCategoryId, resolveVenueId } from "./lib/resolve-refs";
import { upsertScrapedEvent } from "./lib/upsert-event";
import { normalizeText } from "./lib/normalize";
import type { ScrapedEventInput, ScrapeRunResult } from "./lib/types";

const SOURCE_NAME = "biletix.com (Diyarbakır)";
const SEARCH_PAGE_URL = "https://www.biletix.com/search/TURKIYE/tr?city=Diyarbak%C4%B1r";
const IMAGE_BASE = "https://www.biletix.com/static/images/live/event/eventimages/";
const PAGE_ROWS = 50;
const MAX_ROWS = 500; // safety cap

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// biletix's own top-level `category` facet -> our fixed category set. FAMILY
// spans everything from theatre to petting zoos to theme parks (see the
// site's own subcategory list), too mixed to guess at — left unmapped
// (`category_id: null`) rather than mislabeling it.
const CATEGORY_MAP: Record<string, string> = {
  MUSIC: "Konser",
  ART: "Tiyatro",
  SPORT: "Spor",
};

function mapCategory(category: string | null | undefined): string | null {
  if (!category) return null;
  return CATEGORY_MAP[category] ?? null;
}

function stripHtml(input: string): string {
  return normalizeText(input.replace(/<[^>]+>/g, " "));
}

interface BiletixDoc {
  id: string;
  type: string;
  sname?: string;
  name?: string[];
  svenue?: string;
  venue?: string[];
  start: string;
  end?: string;
  category?: string;
  description?: string[];
  image_url?: string;
}

interface BiletixResponse {
  response: { numFound: number; docs: BiletixDoc[] };
}

function buildSolrPath(start: number, rows: number): string {
  const now = new Date();
  const twoYearsOut = new Date(now);
  twoYearsOut.setFullYear(twoYearsOut.getFullYear() + 2);
  const fq2 = `start:[${now.toISOString().slice(0, 19)}Z TO ${twoYearsOut.toISOString().slice(0, 19)}Z]`;

  const params = new URLSearchParams();
  params.set("q", "*:*");
  params.set("start", String(start));
  params.set("sort", "score desc,start asc");
  params.append("fq", 'city:("Diyarbakır")');
  params.append("fq", fq2);
  params.set("rows", String(rows));
  params.set("wt", "json");

  return `/solr/tr/select?${params.toString()}`;
}

async function fetchAndParse(): Promise<ScrapedEventInput[]> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();

    await page.goto(SEARCH_PAGE_URL, { waitUntil: "networkidle", timeout: 45000 });
    // Give the page's own bootstrap requests (which establish the Queue-it
    // session) a moment to fully settle before we piggyback on it.
    await page.waitForTimeout(1500);

    const allDocs: BiletixDoc[] = [];
    let start = 0;
    let numFound = Infinity;

    while (start < numFound && start < MAX_ROWS) {
      const path = buildSolrPath(start, PAGE_ROWS);
      const result = await page.evaluate(async (p) => {
        const res = await fetch(p, { headers: { Accept: "application/json" } });
        if (!res.ok) return { ok: false, status: res.status };
        return { ok: true, body: (await res.json()) };
      }, path);

      if (!result.ok) {
        throw new Error(`Solr fetch failed at start=${start}: HTTP ${"status" in result ? result.status : "?"}`);
      }

      const body = result.body as BiletixResponse;
      numFound = body.response.numFound;
      allDocs.push(...body.response.docs);
      start += PAGE_ROWS;

      // Polite pacing between pages — see docs/plan.md's scraping ethics note.
      if (start < numFound) await page.waitForTimeout(500);
    }

    const items: ScrapedEventInput[] = [];
    for (const doc of allDocs) {
      // "group" docs are umbrella/multi-city tour listings with no single
      // concrete showtime; "event" docs are the actual dated performances.
      if (doc.type !== "event") continue;

      const title = doc.sname ?? doc.name?.[0];
      const venue = doc.svenue ?? doc.venue?.[0];
      if (!title || !doc.start) continue;

      items.push({
        title: normalizeText(title),
        description: doc.description?.[0] ? stripHtml(doc.description[0]) : null,
        start_at: new Date(doc.start).toISOString(),
        end_at: doc.end && doc.end !== doc.start ? new Date(doc.end).toISOString() : null,
        venue_name: venue ? normalizeText(venue) : null,
        category_name: mapCategory(doc.category),
        price: null,
        source_url: `https://www.biletix.com/etkinlik/${doc.id}/TURKIYE/tr`,
        image_url: doc.image_url ? `${IMAGE_BASE}${encodeURIComponent(doc.image_url)}` : null,
      });
    }

    return items;
  } finally {
    await browser.close();
  }
}

export async function run(): Promise<ScrapeRunResult> {
  console.log(`[${SOURCE_NAME}] loading search page and querying events...`);
  const items = await fetchAndParse();
  console.log(`[${SOURCE_NAME}] parsed ${items.length} item(s).`);

  let supabase;
  let cityId: string;
  try {
    supabase = getSupabaseAdmin();
    cityId = await getDiyarbakirCityId(supabase);
  } catch (err) {
    console.warn(`[${SOURCE_NAME}] Supabase not configured, skipping upsert:`, (err as Error).message);
    for (const item of items) {
      console.warn(`[${SOURCE_NAME}] would upsert: "${item.title}" @ ${item.start_at} (venue: ${item.venue_name})`);
    }
    return { source: SOURCE_NAME, found: items.length, upserted: 0, errors: 0 };
  }

  let upserted = 0;
  let errors = 0;

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
      console.error(`[${SOURCE_NAME}] failed to process "${item.title}":`, err);
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

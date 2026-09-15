/**
 * biletinial.ts — real parser for biletinial.com's Diyarbakır events.
 *
 * robots.txt (checked 2026-09-15) does not disallow the endpoint below, and
 * explicitly allow-lists AI crawlers (GPTBot/ClaudeBot/PerplexityBot) for the
 * rest of the site — see https://biletinial.com/robots.txt.
 *
 * The city page (https://biletinial.com/tr-tr/sehrineozel/diyarbakir) renders
 * its event list client-side: the server HTML ships empty `<ul>` placeholders
 * and a page script calls this JSON endpoint to fill them in. We call the
 * same endpoint directly — a plain unauthenticated GET, no session/cookies
 * required (verified with a bare `curl`) — rather than driving a browser,
 * since there's no bot-protection layer in front of it to justify the extra
 * weight of Playwright here (contrast with biletix.ts).
 *
 * cityId=10 was confirmed empirically: the endpoint's response for that id
 * matches the page titled "Diyarbakır Şehrine Özel Etkinlikler" and every
 * returned venue is a real Diyarbakır venue.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getSupabaseAdmin } from "./lib/supabase-admin";
import { getDiyarbakirCityId, resolveCategoryId, resolveVenueId } from "./lib/resolve-refs";
import { upsertScrapedEvent } from "./lib/upsert-event";
import { normalizeText } from "./lib/normalize";
import type { ScrapedEventInput, ScrapeRunResult } from "./lib/types";

const SOURCE_NAME = "biletinial.com (Diyarbakır)";
const DIYARBAKIR_CITY_ID = 10;
const CDN_BASE = "https://b6s54eznn8xq.merlincdn.net";
const PAGE_SIZE = 20;

// Plain ASCII only — HTTP header values must be Latin-1 bytestrings, and
// undici's fetch throws (not silently mangles) on anything outside that.
const USER_AGENT =
  "etkinlik-platformu-scraper/1.0 (+https://github.com/db-akyol/etkinlik-platformu; read-only event listing)";

// biletinial's own category labels ("tip") -> our fixed category set
// (Konser/Tiyatro/Atölye/Fuar/Spor/Sergi). Unmapped labels fall through to
// `null` (still valid — `category_id` is nullable) rather than guessing.
const CATEGORY_MAP: Record<string, string> = {
  Müzik: "Konser",
  Konser: "Konser",
  Tiyatro: "Tiyatro",
  Stand: "Tiyatro", // "Stand-up" variants
  Müzikal: "Tiyatro",
  Spor: "Spor",
};

function mapCategory(tip: string | null | undefined): string | null {
  if (!tip) return null;
  for (const [needle, mapped] of Object.entries(CATEGORY_MAP)) {
    if (tip.includes(needle)) return mapped;
  }
  return null;
}

interface BiletinialItem {
  etkinlikId: number;
  etkinlik: string;
  mekan: string | null;
  tip: string | null;
  tipForUrl: string;
  pic: string | null;
  url: string;
  SeanceDate: string;
}

interface BiletinialResponse {
  Data: BiletinialItem[];
  HasMore: boolean;
}

async function fetchPage(pageNumber: number): Promise<BiletinialResponse> {
  const url =
    `https://biletinial.com/GetAllEventsByCity?cityId=${DIYARBAKIR_CITY_ID}` +
    `&langId=1&countryId=3&langCode=tr&pageNumber=${pageNumber}&pageSize=${PAGE_SIZE}&initial=${pageNumber === 1}`;

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Fetch failed for page ${pageNumber}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<BiletinialResponse>;
}

async function fetchAndParse(): Promise<ScrapedEventInput[]> {
  const items: ScrapedEventInput[] = [];
  let pageNumber = 1;
  const MAX_PAGES = 20; // hard safety cap (400 events) so a server-side bug can't loop forever

  while (pageNumber <= MAX_PAGES) {
    const page = await fetchPage(pageNumber);

    for (const raw of page.Data) {
      if (!raw.etkinlik || !raw.SeanceDate) continue;

      const detailUrl = `https://biletinial.com/tr-tr/${raw.tipForUrl}/${raw.url}`;

      items.push({
        title: normalizeText(raw.etkinlik),
        description: null, // the list endpoint doesn't include one; not worth a per-event detail fetch for the MVP
        start_at: new Date(raw.SeanceDate).toISOString(),
        end_at: null,
        venue_name: raw.mekan ? normalizeText(raw.mekan) : null,
        category_name: mapCategory(raw.tip),
        price: null,
        source_url: detailUrl,
        image_url: raw.pic ? `${CDN_BASE}${raw.pic}` : null,
      });
    }

    if (!page.HasMore) break;
    pageNumber++;

    // Be a polite, low-volume client — this endpoint backs a page real users
    // browse, not a bulk-export API. See docs/plan.md's scraping ethics note.
    await new Promise((r) => setTimeout(r, 500));
  }

  return items;
}

export async function run(): Promise<ScrapeRunResult> {
  console.log(`[${SOURCE_NAME}] fetching event pages...`);
  const items = await fetchAndParse();
  console.log(`[${SOURCE_NAME}] parsed ${items.length} item(s).`);

  let supabase;
  let cityId: string;
  try {
    supabase = getSupabaseAdmin();
    cityId = await getDiyarbakirCityId(supabase);
  } catch (err) {
    // Expected when .env.local/CI secrets aren't configured yet — log what
    // would have happened instead of crashing, so `fetchAndParse` can still
    // be exercised/tested standalone.
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

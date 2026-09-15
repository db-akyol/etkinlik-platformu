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

import { getSupabaseAdmin, MissingSupabaseConfigError } from "./lib/supabase-admin";
import { getDiyarbakirCityId, resolveCategoryId, resolveVenueId } from "./lib/resolve-refs";
import { upsertScrapedEvent } from "./lib/upsert-event";
import { normalizeText, formatPriceTL } from "./lib/normalize";
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

// The list endpoint (`GetAllEventsByCity`) only gives title/venue/date/image —
// no price or description. Each event's own detail page embeds the full data
// (every seance of that title, across every city/date it plays) as a
// schema.org `Event[]` JSON-LD block, which we already fetch a detail page
// per unique event URL for anyway, so this piggybacks on that rather than
// adding a second per-event request. Keyed/cached by detail URL since the
// same play running several Diyarbakır dates shares one detail page.
interface BiletinialOffer {
  price?: number;
  priceCurrency?: string;
}
interface BiletinialLdEvent {
  description?: string;
  startDate?: string;
  endDate?: string;
  offers?: BiletinialOffer;
}

const detailCache = new Map<string, BiletinialLdEvent[]>();

async function fetchEventDetails(detailUrl: string): Promise<BiletinialLdEvent[]> {
  const cached = detailCache.get(detailUrl);
  if (cached) return cached;

  try {
    const res = await fetch(detailUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    if (!res.ok) {
      detailCache.set(detailUrl, []);
      return [];
    }

    const html = await res.text();
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!match) {
      detailCache.set(detailUrl, []);
      return [];
    }

    const parsed = JSON.parse(match[1]) as BiletinialLdEvent | BiletinialLdEvent[];
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    detailCache.set(detailUrl, entries);
    return entries;
  } catch (err) {
    console.warn(`[${SOURCE_NAME}] failed to fetch/parse detail page ${detailUrl}:`, err);
    detailCache.set(detailUrl, []);
    return [];
  }
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
      const wasCached = detailCache.has(detailUrl);
      const ldEntries = await fetchEventDetails(detailUrl);
      // `raw.SeanceDate` ("2026-09-18T20:00:00", no offset) is this seance's
      // local wall-clock time; the detail page's JSON-LD carries the same
      // wall-clock time with an explicit "+03:00" suffix, so a plain prefix
      // match picks out the entry for THIS seance among the play's other
      // dates/cities.
      const match = ldEntries.find((e) => e.startDate?.startsWith(raw.SeanceDate));

      items.push({
        title: normalizeText(raw.etkinlik),
        description: match?.description ? normalizeText(match.description) : null,
        start_at: new Date(raw.SeanceDate).toISOString(),
        end_at: match?.endDate ? new Date(match.endDate).toISOString() : null,
        venue_name: raw.mekan ? normalizeText(raw.mekan) : null,
        category_name: mapCategory(raw.tip),
        price:
          match?.offers?.price != null && match.offers.priceCurrency === "TRY"
            ? formatPriceTL(match.offers.price)
            : null,
        source_url: detailUrl,
        image_url: raw.pic ? `${CDN_BASE}${raw.pic}` : null,
      });

      // Only pace ourselves on an actual network hit — a cache hit (same play,
      // another Diyarbakır date) costs the target site nothing extra.
      if (!wasCached) await new Promise((r) => setTimeout(r, 300));
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
    // Only degrade gracefully for the specific "not configured yet" case
    // (e.g. a fresh checkout with no .env.local) — that's expected and lets
    // `fetchAndParse` still be exercised/tested standalone. Any OTHER error
    // (wrong project, city row missing, network failure, etc.) must propagate
    // and fail the run loudly: swallowing it here previously made a
    // misconfigured production Supabase project look like a successful,
    // zero-event run in CI (found=85 upserted=0 errors=0, exit 0).
    if (!(err instanceof MissingSupabaseConfigError)) throw err;

    console.warn(`[${SOURCE_NAME}] Supabase not configured, skipping upsert:`, err.message);
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

/**
 * diyarbakir-belediye.ts — real parser for Diyarbakır Büyükşehir
 * Belediyesi's events listing (https://diyarbakir.bel.tr/etkinlikler).
 *
 * robots.txt (checked 2026-09-15, https://diyarbakir.bel.tr/robots.txt)
 * allows "/" but explicitly disallows "/api/". The listing page itself is
 * Next.js App Router with React Server Components: the page's INITIAL HTML
 * (a plain, allowed GET on /etkinlikler) already embeds the full event data
 * the page was server-rendered with, as JSON inside
 * `self.__next_f.push([1, "..."])` script chunks — the same data a
 * disallowed `/api/...` call would return, just delivered via the page we
 * ARE allowed to fetch. So: fetch the plain page HTML (exactly like a
 * browser's first request would), extract and JSON-parse that embedded
 * payload, and never touch `/api/` directly.
 *
 * The backend is a Strapi CMS (evident from the `documentId`/`publishedAt`
 * field shapes) — much more structured than either ticket-vendor source:
 * explicit `isFree`/`price`/`currency`, a `sessions[]` array (one entry per
 * actual showtime/date for multi-day runs), and a real venue name. The one
 * gap: `summary`/`content_html` are placeholder "..." text for essentially
 * every event in this CMS (not a parsing bug — verified against the raw
 * embedded JSON directly) — see `hasRealText()`.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getSupabaseAdmin, MissingSupabaseConfigError } from "./lib/supabase-admin";
import { getDiyarbakirCityId, resolveCategoryId, resolveVenueId } from "./lib/resolve-refs";
import { upsertScrapedEvent } from "./lib/upsert-event";
import { normalizeText, formatPriceTL, parseIstanbulLocalTime } from "./lib/normalize";
import { fetchWithRetry } from "./lib/fetch-retry";
import type { ScrapedEventInput, ScrapeRunResult } from "./lib/types";

const SOURCE_NAME = "Diyarbakır Büyükşehir Belediyesi — Etkinlikler";
const BASE_URL = "https://diyarbakir.bel.tr";
const MAX_PAGES = 20; // hard safety cap, same rationale as biletinial.ts

const USER_AGENT =
  "etkinlik-platformu-scraper/1.0 (+https://github.com/db-akyol/etkinlik-platformu; read-only event listing)";

// The municipality's own category set (film-gosterimi, soylesi, ...) is
// broader than our fixed one (Konser/Tiyatro/Atölye/Fuar/Spor/Sergi) — map
// only the confident, unambiguous overlaps; everything else stays
// unmapped (`null`) rather than forcing a wrong label.
const CATEGORY_MAP: Record<string, string> = {
  tiyatro: "Tiyatro",
  sergi: "Sergi",
  atolye: "Atölye",
};

function mapCategory(code: string | undefined | null): string | null {
  if (!code) return null;
  return CATEGORY_MAP[code] ?? null;
}

function stripHtml(input: string): string {
  return normalizeText(input.replace(/<[^>]+>/g, " "));
}

/**
 * `summary`/`content_html` come back as strings of literal periods
 * ("...", "<p>...</p>", "..............") for essentially every event in
 * this CMS — real placeholder content the municipality's editors never
 * replaced, not a scraping artifact. Storing that verbatim would be worse
 * than storing nothing.
 */
export function hasRealText(input: string | null | undefined): boolean {
  if (!input) return false;
  return stripHtml(input).replace(/\.+/g, "").trim().length > 0;
}

interface BelediyeSession {
  date: string; // "2026-06-05"
  start_time: string; // "19:30:00"
  end_time: string | null;
}

interface BelediyeImageFormat {
  url: string;
}

interface BelediyeCover {
  url: string;
  formats?: Record<string, BelediyeImageFormat>;
}

export interface BelediyeItem {
  title: string;
  slug: string;
  summary: string | null;
  content_html: string | null;
  startDate: string; // ISO, already correct UTC
  endDate: string | null;
  location: string | null;
  isFree: boolean;
  price: number | null;
  event_category?: { code: string; name: string } | null;
  cover?: BelediyeCover | null;
  sessions: BelediyeSession[];
}

/**
 * Pulls the JSON-parseable `"items": [...]` array for the events listing
 * out of a Next.js RSC-streamed page's embedded `self.__next_f.push(...)`
 * chunks.
 *
 * This is inherently a little fragile (App Router doesn't ship a single
 * clean `__NEXT_DATA__` blob the way the old Pages Router did — it streams
 * numbered chunks of a custom serialization format that only partially
 * resembles JSON), so every step here is defensive: chunk extraction, then
 * un-escaping the concatenated chunks AS a JSON string (which is exactly
 * what they are — each chunk is itself a JSON-string-literal's contents),
 * then locating the specific `"items"` array that follows `"categories"`
 * (the page also has an unrelated breadcrumb `"items"` array earlier) via
 * manual bracket-depth matching (a regex can't reliably find the matching
 * `]` across arbitrarily nested content). If the page's structure changes,
 * this throws with a clear message rather than silently returning nothing.
 *
 * Exported for diyarbakir-belediye.test.ts, which pins it against a trimmed
 * copy of the real page's chunk format.
 */
export function extractItems(html: string): BelediyeItem[] {
  const chunkRe = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let match: RegExpExecArray | null;
  let raw = "";
  while ((match = chunkRe.exec(html))) {
    raw += match[1];
  }
  if (!raw) {
    throw new Error("No self.__next_f.push(...) chunks found — page structure may have changed.");
  }

  const unescaped: string = JSON.parse(`"${raw}"`);

  const categoriesIdx = unescaped.indexOf(`"categories":[`);
  if (categoriesIdx < 0) {
    throw new Error(`"categories" key not found in RSC payload — page structure may have changed.`);
  }
  const itemsMarker = `"items":[`;
  const markerIdx = unescaped.indexOf(itemsMarker, categoriesIdx);
  if (markerIdx < 0) {
    throw new Error(`"items" key not found after "categories" — page structure may have changed.`);
  }

  const start = markerIdx + itemsMarker.length - 1; // include the opening [
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < unescaped.length; i++) {
    const ch = unescaped[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) {
    throw new Error(`Unterminated "items" array in RSC payload — page structure may have changed.`);
  }

  return JSON.parse(unescaped.slice(start, end + 1)) as BelediyeItem[];
}

async function fetchPage(pageNumber: number): Promise<BelediyeItem[]> {
  const res = await fetchWithRetry(
    `${BASE_URL}/etkinlikler?sayfa=${pageNumber}`,
    { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } },
    { label: SOURCE_NAME },
  );
  if (!res.ok) {
    throw new Error(`Fetch failed for page ${pageNumber}: ${res.status} ${res.statusText}`);
  }
  return extractItems(await res.text());
}

function resolveImageUrl(cover: BelediyeCover | null | undefined): string | null {
  if (!cover) return null;
  const path = cover.formats?.medium?.url ?? cover.formats?.small?.url ?? cover.url;
  return path ? `${BASE_URL}${path}` : null;
}

export function itemToEvents(item: BelediyeItem): ScrapedEventInput[] {
  const description = hasRealText(item.content_html)
    ? stripHtml(item.content_html!)
    : hasRealText(item.summary)
      ? normalizeText(item.summary!)
      : null;
  const category_name = mapCategory(item.event_category?.code);
  const price = item.isFree ? null : item.price != null ? formatPriceTL(item.price) : null;
  const venue_name = item.location ? normalizeText(item.location) : null;
  const source_url = `${BASE_URL}/etkinlikler/${item.slug}`;
  const image_url = resolveImageUrl(item.cover);
  const title = normalizeText(item.title);

  // `sessions[]` is one entry per actual showtime (a multi-day run has one
  // per day) — each becomes its own event row, matching how the ticket-
  // vendor parsers treat individual showtimes. `startDate`/`endDate` at the
  // top level only reliably describe the FIRST/LAST session's timing for a
  // multi-day run, not any specific one, so they're only used as a fallback
  // for the (rare) item with no `sessions` at all.
  if (item.sessions.length > 0) {
    return item.sessions.map((session) => ({
      title,
      description,
      start_at: parseIstanbulLocalTime(`${session.date}T${session.start_time}`),
      end_at: session.end_time ? parseIstanbulLocalTime(`${session.date}T${session.end_time}`) : null,
      venue_name,
      category_name,
      price,
      source_url,
      image_url,
    }));
  }

  return [
    {
      title,
      description,
      start_at: new Date(item.startDate).toISOString(),
      end_at: item.endDate ? new Date(item.endDate).toISOString() : null,
      venue_name,
      category_name,
      price,
      source_url,
      image_url,
    },
  ];
}

/**
 * How the listing broke down this run, so that a `found=0` summary can say
 * WHY it was zero.
 *
 * This source legitimately reports zero quite often — as of 2026-09-15 every
 * one of the 16 events it lists is from March–June, i.e. the municipality
 * simply hasn't published anything upcoming. That's correct behaviour, but
 * in a CI log it is indistinguishable from the page structure having changed
 * under us and extraction silently yielding nothing, which is the exact
 * failure mode that went unnoticed for a while on biletinial. So: report the
 * raw item count alongside the filtered one.
 */
let rawItemsSeen = 0;
let pastEventsDropped = 0;

async function fetchAndParse(): Promise<ScrapedEventInput[]> {
  const items: ScrapedEventInput[] = [];
  let pageNumber = 1;

  while (pageNumber <= MAX_PAGES) {
    const pageItems = await fetchPage(pageNumber);
    if (pageItems.length === 0) break;

    for (const raw of pageItems) {
      if (!raw.title) continue;
      rawItemsSeen++;

      // Unlike the ticket vendors (which only ever list shows still on
      // sale), this listing includes events that have already happened —
      // confirmed against a live scrape where every one of 62 items was in
      // the past. The listing isn't in guaranteed chronological order (it
      // looks closer to "most recently published"), so this can't be turned
      // into an early pagination cutoff — just drop anything already over.
      const events = itemToEvents(raw);
      const upcoming = events.filter((e) => new Date(e.start_at).getTime() >= Date.now());
      pastEventsDropped += events.length - upcoming.length;
      items.push(...upcoming);
    }

    pageNumber++;
    // Polite pacing between pages — see docs/plan.md's scraping ethics note.
    await new Promise((r) => setTimeout(r, 500));
  }

  return items;
}

export async function run(): Promise<ScrapeRunResult> {
  rawItemsSeen = 0;
  pastEventsDropped = 0;

  console.log(`[${SOURCE_NAME}] fetching event pages...`);
  const items = await fetchAndParse();
  console.log(`[${SOURCE_NAME}] parsed ${items.length} item(s).`);
  console.log(
    `[${SOURCE_NAME}] listing breakdown: ${rawItemsSeen} event(s) on the page, ` +
      `${pastEventsDropped} session(s) dropped as already past, ${items.length} upcoming.` +
      (rawItemsSeen === 0
        ? " — zero events on the page at all, which usually means extraction broke rather than the calendar being empty; check the page structure."
        : items.length === 0
          ? " — the municipality has nothing upcoming published right now; this is normal, not a parsing failure."
          : ""),
  );

  let supabase;
  let cityId: string;
  try {
    supabase = getSupabaseAdmin();
    cityId = await getDiyarbakirCityId(supabase);
  } catch (err) {
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

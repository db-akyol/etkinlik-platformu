/**
 * amedspor-tff.ts — Amedspor's upcoming matches, from the Turkish Football
 * Federation's own site (tff.org).
 *
 * Every upcoming match, home or away, goes to the `matches` table, which
 * the match banner reads (components/AmedsporBanner.tsx). Home matches
 * played in Diyarbakır are ALSO stored as events, since those are things
 * to go to in the city; away matches never are (see
 * supabase/migrations/0005_amedspor_matches.sql).
 *
 * Why TFF and not Passo, which sells the tickets: Passo sits behind a
 * Cloudflare bot challenge, and unlike bubilet (an events marketplace) it is
 * the official ticketing system — we link to it, we don't scrape it. TFF
 * publishes the fixture list and each match's date, time and stadium as
 * plain server-rendered HTML, and has no robots.txt (checked 2026-10-24,
 * https://www.tff.org/robots.txt is a 404).
 *
 * Two kinds of page, both plain GETs:
 *   - the Süper Lig page (pageID=198) lists every fixture of the season,
 *     week by week, with a match id but no date; played matches show their
 *     score where upcoming ones show " - ";
 *   - each match page (pageID=29&macId=...) has the date and time once TFF
 *     has scheduled it (a few weeks ahead) and the stadium.
 * So one fixture request plus one per upcoming match, capped at
 * UPCOMING_LIMIT — a handful of requests, twice a day.
 *
 * Matches are matched to existing rows by their TFF page URL rather than
 * (title, start_at) like every other source: TFF moves kick-off times, and
 * a moved match must update its row, not leave the old time behind as a
 * second event.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchWithRetry } from "./lib/fetch-retry";
import { parseIstanbulLocalTime } from "./lib/normalize";
import { getDiyarbakirCityId, resolveCategoryId, resolveVenueId } from "./lib/resolve-refs";
import { getSupabaseAdmin, MissingSupabaseConfigError, type SupabaseAdminClient } from "./lib/supabase-admin";
import type { ScrapedEventInput, ScrapeRunResult } from "./lib/types";
import { upsertScrapedEvent } from "./lib/upsert-event";

const SOURCE_NAME = "tff.org (Amedspor maçları)";
const BASE_URL = "https://www.tff.org";
const FIXTURES_URL = `${BASE_URL}/default.aspx?pageID=198`;
/** TFF's club id for Amed Sportif Faaliyetler (Amedspor). */
const AMEDSPOR_CLUB_ID = "3678";
/** How many upcoming matches (home and away) to look up each run. */
const UPCOMING_LIMIT = 4;
const USER_AGENT =
  "Mozilla/5.0 (compatible; DiyarbakirEtkinlikBot/1.0; +https://diyarbakiretkinlik.vercel.app)";

const matchUrl = (macId: string) => `${BASE_URL}/Default.aspx?pageID=29&macId=${macId}`;

/** TFF serves windows-1254 (Turkish) and says so only in a meta tag. */
async function fetchTffPage(url: string): Promise<string> {
  const res = await fetchWithRetry(
    url,
    { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } },
    { label: SOURCE_NAME },
  );
  if (!res.ok) throw new Error(`[${SOURCE_NAME}] ${url} returned HTTP ${res.status}`);
  return new TextDecoder("windows-1254").decode(await res.arrayBuffer());
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;?/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export type Fixture = { macId: string; played: boolean; isHome: boolean };

/**
 * The club's fixtures, home and away, in the fixture list's (week) order. A
 * row is "home team cell, score-or-dash cell linking to the match, away
 * team cell".
 */
export function parseClubFixtures(html: string, clubId: string): Fixture[] {
  const row =
    /kulupId=(\d+)">[^<]*<\/a><\/td>\s*<td[^>]*><a href="\/Default\.aspx\?pageID=29&macId=(\d+)">([^<]*)<\/a><\/td>\s*<td[^>]*><a href="\/Default\.aspx\?pageID=28&kulupId=(\d+)">/gi;
  const fixtures: Fixture[] = [];
  for (const [, homeId, macId, score, awayId] of html.matchAll(row)) {
    if (homeId === clubId || awayId === clubId) {
      fixtures.push({ macId, played: /\d/.test(score), isHome: homeId === clubId });
    }
  }
  return fixtures;
}

export type MatchDetail = {
  /** Istanbul wall-clock time, "YYYY-MM-DDTHH:MM". */
  startLocal: string;
  stadium: string;
  home: string;
  away: string;
  competition: string;
};

function field(html: string, id: string): string | null {
  const match = html.match(new RegExp(`dtMacBilgisi_${id}"[^>]*>([\\s\\S]*?)</(?:span|a)>`));
  if (!match) return null;
  return decodeEntities(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** A match page's facts; null until TFF has given the match a date. */
export function parseMatchDetail(html: string): MatchDetail | null {
  const date = field(html, "lblTarih")?.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!date) return null;
  const [, day, month, year, hour, minute] = date;
  const pad = (n: string) => n.padStart(2, "0");
  return {
    startLocal: `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${minute}`,
    stadium: field(html, "lnkStad") ?? "",
    home: field(html, "lnkTakim1") ?? "",
    away: field(html, "lnkTakim2") ?? "",
    competition: field(html, "lblOrganizasyonAdi") ?? "",
  };
}

function titleCaseTr(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .split(" ")
    .map((word) => (word === "fk" ? "FK" : word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1)))
    .join(" ");
}

/** "ÇAYKUR RİZESPOR A.Ş." → "Çaykur Rizespor"; TFF's legal names, as fans say them. */
export function teamDisplayName(raw: string): string {
  if (raw.trim() === "AMED SPORTİF FAALİYETLER") return "Amedspor";
  const name = raw
    .replace(/\s+A\.Ş\.?$/u, "")
    .replace(/\s+FUTBOL KULÜBÜ$/u, " FK")
    .trim();
  return titleCaseTr(name);
}

/** "Trendyol Süper Lig Adnan Süvari Sezonu (Profesyonel Takım)" → "Trendyol Süper Lig". */
function competitionName(raw: string): string {
  return raw.replace(/\s*\(.*\)\s*$/, "").replace(/\s+\S+\s+\S+\s+Sezonu$/u, "").trim() || "Lig";
}

/** "DİYARBAKIR STADYUMU - DİYARBAKIR - ..." → stadium and city, title-cased. */
function stadiumAndCity(raw: string): { stadium: string | null; city: string | null } {
  const [stadium, city] = raw.split(" - ").map((part) => part.trim());
  // Some match pages give the stadium alone ("DİYARBAKIR STADYUMU").
  const inferredCity = !city && /DİYARBAKIR/u.test(raw.toLocaleUpperCase("tr-TR")) ? "Diyarbakır" : null;
  return {
    stadium: stadium ? titleCaseTr(stadium) : null,
    city: city ? titleCaseTr(city) : inferredCity,
  };
}

/**
 * TFF sets exact kick-off times a few weeks ahead; further out, the time
 * on the match page is a placeholder. Past this horizon the description
 * says so instead of presenting it as fixed.
 */
const FIRM_SCHEDULE_DAYS = 14;

function isTentative(startAt: string, now: Date): boolean {
  return new Date(startAt).getTime() - now.getTime() > FIRM_SCHEDULE_DAYS * 86_400_000;
}

export type MatchRow = {
  tff_mac_id: string;
  home_team: string;
  away_team: string;
  is_home: boolean;
  start_at: string;
  stadium: string | null;
  city: string | null;
  competition: string;
  tentative: boolean;
  source_url: string;
};

/** A row for the `matches` table (the banner), home or away. */
export function matchToRow(detail: MatchDetail, macId: string, isHome: boolean, now: Date = new Date()): MatchRow {
  const startAt = parseIstanbulLocalTime(`${detail.startLocal}:00`);
  return {
    tff_mac_id: macId,
    home_team: teamDisplayName(detail.home),
    away_team: teamDisplayName(detail.away),
    is_home: isHome,
    start_at: startAt,
    ...stadiumAndCity(detail.stadium),
    competition: competitionName(detail.competition),
    tentative: isTentative(startAt, now),
    source_url: matchUrl(macId),
  };
}

/** The event for a home match, or null if it isn't being played in Diyarbakır. */
export function matchToEvent(detail: MatchDetail, macId: string, now: Date = new Date()): ScrapedEventInput | null {
  // A "home" match can be moved to a neutral ground; then it isn't a
  // Diyarbakır event.
  if (!detail.stadium.toLocaleUpperCase("tr-TR").includes("DİYARBAKIR")) return null;
  const stadium = stadiumAndCity(detail.stadium).stadium;
  const startAt = parseIstanbulLocalTime(`${detail.startLocal}:00`);
  const tentative = isTentative(startAt, now);
  return {
    title: `${teamDisplayName(detail.home)} – ${teamDisplayName(detail.away)}`,
    description:
      `${competitionName(detail.competition)} maçı. Biletler Passo üzerinden satılır.` +
      (tentative ? " Tarih ve saat henüz kesinleşmemiş olabilir; TFF açıkladıkça güncellenir." : ""),
    start_at: startAt,
    end_at: null,
    venue_name: stadium,
    category_name: "Spor",
    price: null,
    source_url: matchUrl(macId),
    image_url: null,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Parsed = {
  events: ScrapedEventInput[];
  rows: MatchRow[];
  /** Matches TFF no longer has a date for (postponed): drop their banner rows. */
  undated: string[];
};

async function fetchAndParse(): Promise<Parsed> {
  const fixtures = parseClubFixtures(await fetchTffPage(FIXTURES_URL), AMEDSPOR_CLUB_ID);
  const upcoming = fixtures.filter((f) => !f.played).slice(0, UPCOMING_LIMIT);
  console.log(
    `[${SOURCE_NAME}] ${fixtures.length} fixture(s) this season, checking the next ${upcoming.length}.`,
  );

  const parsed: Parsed = { events: [], rows: [], undated: [] };
  for (const { macId, isHome } of upcoming) {
    // Polite pacing between pages — see docs/plan.md's scraping ethics note.
    await sleep(500);
    const detail = parseMatchDetail(await fetchTffPage(matchUrl(macId)));
    if (!detail) {
      console.log(`[${SOURCE_NAME}] match ${macId} has no date yet, skipping.`);
      parsed.undated.push(macId);
      continue;
    }
    parsed.rows.push(matchToRow(detail, macId, isHome));
    if (!isHome) continue;

    const event = matchToEvent(detail, macId);
    if (!event) {
      console.log(`[${SOURCE_NAME}] home match ${macId} is at "${detail.stadium}", not in Diyarbakır: banner only.`);
      continue;
    }
    if (new Date(event.start_at).getTime() >= Date.now()) parsed.events.push(event);
  }
  return parsed;
}

/**
 * Writes the banner's rows. A missing `matches` table (the migration not yet
 * applied to this database) is a warning, not a failed run: the events still
 * go in.
 */
async function saveMatches(supabase: SupabaseAdminClient, { rows, undated }: Parsed): Promise<number> {
  if (rows.length > 0) {
    const { error } = await supabase
      .from("matches")
      .upsert(
        rows.map((row) => ({ ...row, updated_at: new Date().toISOString() })),
        { onConflict: "tff_mac_id" },
      );
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        console.warn(
          `[${SOURCE_NAME}] no "matches" table — apply supabase/migrations/0005_amedspor_matches.sql. Banner rows skipped.`,
        );
        return 0;
      }
      throw error;
    }
  }
  if (undated.length > 0) {
    const { error } = await supabase.from("matches").delete().in("tff_mac_id", undated);
    if (error) console.warn(`[${SOURCE_NAME}] could not clear undated matches:`, error.message);
  }
  for (const row of rows) {
    console.log(
      `[${SOURCE_NAME}] banner: ${row.home_team} – ${row.away_team} @ ${row.start_at}${row.tentative ? " (tentative)" : ""}`,
    );
  }
  return rows.length;
}

export async function run(): Promise<ScrapeRunResult> {
  console.log(`[${SOURCE_NAME}] fetching fixtures...`);
  const parsed = await fetchAndParse();
  const items = parsed.events;
  console.log(
    `[${SOURCE_NAME}] parsed ${parsed.rows.length} match(es), ${items.length} of them Diyarbakır events.`,
  );

  let supabase;
  let cityId: string;
  try {
    supabase = getSupabaseAdmin();
    cityId = await getDiyarbakirCityId(supabase);
  } catch (err) {
    if (!(err instanceof MissingSupabaseConfigError)) throw err;
    console.warn(`[${SOURCE_NAME}] Supabase not configured, skipping upsert:`, err.message);
    for (const row of parsed.rows) {
      console.warn(`[${SOURCE_NAME}] would save: ${row.home_team} – ${row.away_team} @ ${row.start_at}`);
    }
    return { source: SOURCE_NAME, found: parsed.rows.length, upserted: 0, errors: 0 };
  }

  let upserted = 0;
  let errors = 0;
  try {
    upserted += await saveMatches(supabase, parsed);
  } catch (err) {
    errors++;
    console.error(`[${SOURCE_NAME}] saving banner matches FAILED:`, err);
  }
  for (const item of items) {
    try {
      const [venueId, categoryId] = await Promise.all([
        resolveVenueId(supabase, cityId, item.venue_name),
        resolveCategoryId(supabase, item.category_name),
      ]);
      const row = {
        title: item.title,
        description: item.description,
        start_at: item.start_at,
        end_at: null,
        city_id: cityId,
        venue_id: venueId,
        category_id: categoryId,
        price: item.price,
        source_type: "scraped" as const,
        source_url: item.source_url,
        image_url: item.image_url,
        created_by: null,
      };

      // Same match already stored (possibly at an old kick-off time)?
      // Update it in place — see the file header. Status is left alone, as
      // upsertScrapedEvent does, so a hand-rejected row stays rejected.
      const { data: existing, error: lookupError } = await supabase
        .from("events")
        .select("id")
        .eq("source_url", item.source_url)
        .maybeSingle();
      if (lookupError) throw lookupError;

      if (existing) {
        const { error } = await supabase.from("events").update(row).eq("id", existing.id as string);
        if (error) throw error;
        upserted++;
        console.log(`[${SOURCE_NAME}] updated: "${item.title}" @ ${item.start_at}`);
        continue;
      }

      const result = await upsertScrapedEvent(supabase, row);
      if (result.action === "error") {
        errors++;
        console.error(`[${SOURCE_NAME}] upsert FAILED for "${item.title}":`, result.error);
      } else {
        upserted++;
        console.log(`[${SOURCE_NAME}] ${result.action}: "${item.title}" @ ${item.start_at}`);
      }
    } catch (err) {
      errors++;
      console.error(`[${SOURCE_NAME}] failed to process "${item.title}":`, err);
    }
  }

  // "found" counts matches (home and away); "upserted" banner rows plus events.
  const summary: ScrapeRunResult = { source: SOURCE_NAME, found: parsed.rows.length, upserted, errors };
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

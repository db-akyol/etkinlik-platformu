/**
 * Filtering helpers for the public event listing.
 *
 * Split out of app/(public)/page.tsx so the date arithmetic and price
 * parsing — the parts with actual edge cases in them — can be unit-tested
 * without rendering a page (see lib/event-filters.test.ts).
 */
import { istanbulLocalToUtcIso, istanbulTodayDateString } from "@/lib/istanbul-time";

/** The URL search params the listing understands. */
export type ListingParams = {
  q?: string;
  kategori?: string;
  /** A single Istanbul calendar day, "YYYY-MM-DD". */
  gun?: string;
  /** "ucretsiz" or "300" (300 TL and under). */
  fiyat?: string;
  /** "harita" for the map view; absent for the list. */
  gorunum?: string;
};

const PARAM_ORDER = ["q", "kategori", "gun", "fiyat", "gorunum"] as const;

/**
 * Builds a listing URL from the current params plus `changes`. A change of
 * `undefined` or "" removes that param. Keys always come out in the same
 * order, so the same filter state is always the same URL.
 */
export function buildListingHref(
  params: ListingParams,
  changes: Partial<Record<keyof ListingParams, string | undefined>> = {},
): string {
  const merged: ListingParams = { ...params, ...changes };
  const search = new URLSearchParams();
  for (const key of PARAM_ORDER) {
    const value = merged[key];
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/?${query}` : "/";
}

/**
 * Adds `days` to a "YYYY-MM-DD" Istanbul calendar date, returning the same
 * shape.
 *
 * Done on a UTC-anchored Date rather than with `setDate()` on a local one:
 * `Date#setDate` operates in the RUNTIME's timezone, so in any zone that
 * observes DST it can shift the result by an hour and (at a boundary) roll
 * the date over. Turkey itself has no DST and Vercel runs in UTC, so that's
 * dormant today — but it's the exact shape of the bug that already cost this
 * project three hours of wrong event times once, and the UTC version costs
 * nothing.
 */
export function addCalendarDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The UTC instant the listing starts from: midnight at the start of today,
 * Istanbul time.
 *
 * A source can list events that have already happened (the municipality's
 * listing does), and past events sorting to the top of an ascending-by-date
 * list is never what a visitor wants.
 *
 * `today` is injectable purely so tests can pin a date.
 */
export function getUpcomingFloor(today: string = istanbulTodayDateString()): string {
  return istanbulLocalToUtcIso(`${today}T00:00`);
}

/**
 * The month ("YYYY-MM") the listing's calendar opens on: the selected day's,
 * or the next event's — at the end of a month the rest of it is often empty.
 * The page also uses it as CalendarPanel's `key`, so when a filter change
 * moves it the calendar follows instead of staying where it first mounted.
 */
export function calendarStartMonth(eventDays: string[], todayKey: string, selected?: string): string {
  return (selected ?? eventDays.find((day) => day >= todayKey) ?? todayKey).slice(0, 7);
}

/** Returns `gun` if it is a real "YYYY-MM-DD" date, otherwise undefined. */
export function parseDayParam(gun: string | undefined): string | undefined {
  if (!gun || !/^\d{4}-\d{2}-\d{2}$/.test(gun)) return undefined;
  // Round-tripping through Date rejects impossible dates like 2026-02-30,
  // which would otherwise silently match nothing.
  return new Date(`${gun}T00:00:00Z`).toISOString().slice(0, 10) === gun ? gun : undefined;
}

/**
 * Whether a stored price says "free". Scrapers write "Ücretsiz" for events
 * their source marks free, and admins type it; an empty price is unknown,
 * not free (see `formatEventPrice`).
 */
export function isFreePrice(price: string | null): boolean {
  return !!price && /ücretsiz|bedava/i.test(price);
}

/**
 * Reads the lowest TL amount out of a free-text price ("600 TL",
 * "1.000 TL", "300 - 500 TL", "₺150,50"). Returns 0 for a free event and
 * null when the price is unknown or has no number in it at all.
 *
 * Turkish formatting uses "." for thousands and "," for decimals, so "1.000"
 * is one thousand, not one. Kuruş are dropped: the only use is a coarse
 * "under 300 TL" filter.
 */
export function parsePriceTL(price: string | null): number | null {
  if (!price || price.trim() === "") return null;
  if (isFreePrice(price)) return 0;
  const match = price.match(/\d{1,3}(?:\.\d{3})+|\d+/);
  return match ? Number.parseInt(match[0].replace(/\./g, ""), 10) : null;
}

/** Applies the `?fiyat=` filter. An unknown filter value keeps everything. */
export function matchesPriceFilter(price: string | null, fiyat: string | undefined): boolean {
  if (fiyat === "ucretsiz") return isFreePrice(price);
  if (fiyat === "300") {
    const amount = parsePriceTL(price);
    return amount != null && amount <= 300;
  }
  return true;
}

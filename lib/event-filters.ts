/**
 * Query-building helpers for the public event listing.
 *
 * Split out of app/(public)/page.tsx so the date-window arithmetic — the
 * part with actual edge cases in it — can be unit-tested without rendering
 * a page (see lib/event-filters.test.ts).
 */
import { istanbulLocalToUtcIso, istanbulTodayDateString } from "@/lib/istanbul-time";

/** The `?tarih=` quick-filter values the UI offers (see components/FilterBar.tsx). */
export type DateFilter = "bugun" | "hafta" | "ay";

/**
 * Adds `days` to a "YYYY-MM-DD" Istanbul calendar date, returning the same
 * shape.
 *
 * Done on a UTC-anchored Date rather than with `setDate()` on a local one:
 * `Date#setDate`/`setMonth` operate in the RUNTIME's timezone, so in any zone
 * that observes DST they can shift the resulting wall-clock time by an hour
 * and (at a boundary) roll the date over. Turkey itself has no DST and Vercel
 * runs in UTC, so that's dormant today — but it's the exact shape of the bug
 * that already cost this project three hours of wrong event times once, and
 * the UTC version costs nothing.
 */
function addCalendarDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Adds `months` to a "YYYY-MM-DD" Istanbul calendar date, clamping the day
 * to the target month's length rather than letting it overflow.
 *
 * Plain `setUTCMonth(+1)` on the 31st of a month rolls forward into the NEXT
 * month (31 Ocak + 1 ay -> 3 Mart), which would quietly make the "Bu ay"
 * filter show a 33-day window a few times a year. Clamping gives 31 Ocak +
 * 1 ay -> 28/29 Şubat instead.
 */
function addCalendarMonths(dateString: string, months: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDate();

  // Move to the 1st first, so the month shift itself can never overflow.
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);

  // Day 0 of the following month == the last day of this one.
  const daysInTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, daysInTargetMonth));

  return date.toISOString().slice(0, 10);
}

/**
 * Returns a `[gte, lt)` UTC ISO range for the event list.
 *
 * Always floors at "start of today" (Istanbul) regardless of the `tarih`
 * quick filter — a source can list events that have already happened (the
 * municipality's listing does; ticket vendors never have, since they only
 * sell upcoming shows, which is why this went unnoticed until a second
 * source surfaced it), and past events sorting to the top of an
 * ascending-by-date list is never what a visitor wants. `tarih` only ever
 * narrows the upper bound further; it never removes the floor.
 *
 * `today` is injectable purely so tests can pin a date; production always
 * uses the real Istanbul calendar date.
 */
export function getDateRange(
  tarih?: string,
  today: string = istanbulTodayDateString(),
): { gte: string; lt?: string } {
  const gte = istanbulLocalToUtcIso(`${today}T00:00`);

  let endDate: string;
  if (tarih === "bugun") {
    endDate = addCalendarDays(today, 1);
  } else if (tarih === "hafta") {
    endDate = addCalendarDays(today, 7);
  } else if (tarih === "ay") {
    endDate = addCalendarMonths(today, 1);
  } else {
    // Unrecognized or absent filter: no upper bound, just the floor.
    return { gte };
  }

  return { gte, lt: istanbulLocalToUtcIso(`${endDate}T00:00`) };
}

/**
 * Every event time the site handles (`events.start_at`/`end_at`) is stored
 * as UTC, but every human touching it — admins typing a date into a form,
 * visitors reading a card — thinks in Turkey local time. Turkey has used a
 * fixed UTC+3 offset with no DST since 2016, so no timezone-database lookup
 * is needed, but the conversion still has to be done EXPLICITLY: Vercel's
 * Node runtime defaults to UTC, so anything that reads/writes wall-clock
 * digits without going through these (`Date#getHours()`, a bare
 * `new Date(offsetlessString)`, `Intl.DateTimeFormat` with no `timeZone`)
 * silently uses the SERVER's timezone instead and is off by 3 hours.
 */
const ISTANBUL_OFFSET = "+03:00";

/**
 * Returns the current wall-clock date in Istanbul as "YYYY-MM-DD", for
 * computing "today"/"this week" boundaries against `events.start_at`
 * server-side. Plain `new Date(now.getFullYear(), ...)` would use the
 * RUNTIME's calendar date (Vercel=UTC), which is wrong for roughly the
 * first 3 hours of each Istanbul day (00:00-03:00 local is still the
 * previous UTC date).
 */
export function istanbulTodayDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Converts an `<input type="datetime-local">` value ("2026-09-18T20:00",
 * always offset-less, interpreted here as Turkey local time) to a correct
 * UTC ISO string for storage.
 */
export function istanbulLocalToUtcIso(datetimeLocal: string): string {
  return new Date(`${datetimeLocal}${ISTANBUL_OFFSET}`).toISOString();
}

/**
 * Converts a stored UTC ISO string to the "YYYY-MM-DDTHH:mm" shape
 * `<input type="datetime-local">` expects, as Turkey local time — for
 * pre-filling the admin edit form with an existing event's time.
 */
export function utcIsoToIstanbulLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

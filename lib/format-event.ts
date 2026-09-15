/**
 * Display formatters for an event's date/price.
 *
 * These live here rather than in components/EventCard.tsx (where they used
 * to) for two reasons: they're pure string functions with no React in them,
 * and keeping them out of a component file means a plain Node test can
 * import them without dragging `next/link` and the React runtime along.
 * That matters — `formatEventDateTime` is exactly where the "every event
 * shows 3 hours early" bug lived, so it's worth having under test (see
 * lib/format-event.test.ts).
 */

/**
 * Formats an ISO timestamp as "14 Eylül 2026, 20:00" in Turkish locale.
 *
 * `timeZone: "Europe/Istanbul"` is required here, not cosmetic: without it
 * `Intl.DateTimeFormat` renders in the RUNTIME's timezone (Vercel's Node
 * functions default to UTC), which silently showed every event 3 hours
 * earlier than its real Turkey-local start time.
 */
export function formatEventDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    // `hourCycle: "h23"` rather than `hour12: false` — those are not
    // synonyms, and in some locales the latter selects `h24`, which renders
    // midnight as "24:15" instead of "00:15" (it really did in `en-CA`, see
    // lib/istanbul-time.ts). `tr-TR` happens to pick h23 either way today,
    // but that's a property of the locale data, not a guarantee.
    hourCycle: "h23",
    timeZone: "Europe/Istanbul",
  }).format(date);
  return `${datePart}, ${timePart}`;
}

/** Returns the display price, or "Ücretsiz" when there is none set. */
export function formatEventPrice(price: string | null): string {
  if (!price || price.trim() === "") return "Ücretsiz";
  return price;
}

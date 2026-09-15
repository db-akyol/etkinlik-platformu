/**
 * Collapses whitespace (including stray `\r\n` some sources embed mid-string)
 * and trims. Applied to every title/venue/description a parser extracts so
 * that trivial formatting differences don't turn the same real-world event
 * into two DB rows — the dedup key in `upsert-event.ts` is an exact match on
 * `title` (+ `start_at` + `venue_id`), so inconsistent whitespace defeats it
 * silently. This does NOT solve cross-source dedup where two sites word the
 * same event's title differently (e.g. "Dedublüman" vs "Dedublüman Konseri")
 * — that's a harder fuzzy-matching problem, intentionally out of scope for
 * now (same tradeoff `resolve-refs.ts` documents for venue names); the admin
 * approval queue is the backstop for catching those by eye.
 */
export function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * Parses a date-time string that has NO UTC offset (e.g. biletinial's
 * `SeanceDate: "2026-09-18T20:00:00"`) as Turkey local time and returns a
 * correct UTC ISO string.
 *
 * `new Date(input)` on a plain offset-less string is NOT safe for this: the
 * spec has JS treat it as local time IN WHATEVER TIMEZONE THE RUNTIME
 * HAPPENS TO BE IN, not Europe/Istanbul. On a Vercel/GitHub-Actions runner
 * (TZ=UTC) that silently stored the raw Turkey wall-clock digits as if they
 * were already UTC — every biletinial event ended up 3 hours off. Turkey
 * has used a fixed UTC+3 offset with no DST since 2016, so appending
 * "+03:00" before parsing is enough (no timezone-database lookup needed).
 */
export function parseIstanbulLocalTime(input: string): string {
  return new Date(`${input}+03:00`).toISOString();
}

/**
 * Formats a bare TL amount (e.g. `450`, `2000`) the way the rest of the site
 * displays prices. Both scraper sources give prices as plain numbers (TL for
 * biletinial's JSON-LD `offers.price`, kuruş/100 for biletix's `minPrice`) —
 * this is the one place that turns either into the same `"450 TL"` string
 * `ScrapedEventInput.price` expects.
 */
export function formatPriceTL(amount: number): string {
  return `${Math.round(amount).toLocaleString("tr-TR")} TL`;
}

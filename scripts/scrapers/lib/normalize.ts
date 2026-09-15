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
 * Formats a bare TL amount (e.g. `450`, `2000`) the way the rest of the site
 * displays prices. Both scraper sources give prices as plain numbers (TL for
 * biletinial's JSON-LD `offers.price`, kuruş/100 for biletix's `minPrice`) —
 * this is the one place that turns either into the same `"450 TL"` string
 * `ScrapedEventInput.price` expects.
 */
export function formatPriceTL(amount: number): string {
  return `${Math.round(amount).toLocaleString("tr-TR")} TL`;
}

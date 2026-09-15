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

/**
 * Collapses whitespace (including stray `\r\n` some sources embed mid-string)
 * and trims. Applied to every title/venue/description a parser extracts so
 * that trivial formatting differences don't turn the same real-world event
 * into two DB rows — the dedup key in `upsert-event.ts` is an exact match on
 * `title` + `start_at` (see that file for why `venue_id` was dropped from
 * it), so inconsistent whitespace defeats it silently. This does NOT solve
 * cross-source dedup where two sites word the same event's title differently
 * (e.g. "Dedublüman" vs "Dedublüman Konseri") — that's a harder
 * fuzzy-matching problem, intentionally out of scope for now (no source
 * observed so far actually does this — every cross-source duplicate found
 * used the exact same title text). There is no longer an admin approval
 * queue backstopping scraped events (see upsert-event.ts) — a title-wording
 * mismatch that slipped through would go straight to the public site as a
 * visible duplicate, not just a queue an admin happens to glance at.
 */
export function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * Parses biletinial's `SeanceDate` field as Turkey local time and returns a
 * correct UTC ISO string.
 *
 * `new Date(input)` on a plain offset-less string ("2026-09-18T20:00:00") is
 * NOT safe for this: the spec has JS treat it as local time IN WHATEVER
 * TIMEZONE THE RUNTIME HAPPENS TO BE IN, not Europe/Istanbul. On a
 * Vercel/GitHub-Actions runner (TZ=UTC) that silently stored the raw Turkey
 * wall-clock digits as if they were already UTC — every biletinial event
 * ended up 3 hours off.
 *
 * biletinial's own API makes this messier than a single fixed offset: some
 * `SeanceDate` values come back WITH a trailing "Z" (e.g.
 * "2026-10-05T20:00:00Z") and some without, inconsistently, for what is
 * still the same Turkey wall-clock time either way (confirmed against
 * biletix's independently-sourced time for the same real event: biletinial
 * dropped the "Z" one moment and added it the next, while the digits stayed
 * "20:30" for a show biletix also recorded as 20:30 local — i.e. the "Z" is
 * a formatting artifact of their backend, not a genuine UTC marker). So:
 * strip any offset/Z biletinial happened to attach and always (re-)apply
 * Turkey's fixed UTC+3 (no DST since 2016, so no timezone-database lookup
 * needed) ourselves.
 */
export function parseIstanbulLocalTime(input: string): string {
  return new Date(`${stripDateTimeOffset(input)}+03:00`).toISOString();
}

/**
 * Strips a trailing "Z" or numeric UTC offset ("+03:00", "-0300", ...) off
 * an ISO-ish date-time string, leaving just the offset-less wall-clock
 * portion ("2026-10-05T20:00:00"). Exported (not just inlined into
 * `parseIstanbulLocalTime`) because biletinial.ts also needs this same
 * normalization to MATCH `SeanceDate` against a detail page's JSON-LD
 * `startDate` values (which always carry "+03:00", never "Z") — comparing
 * the raw, un-stripped `SeanceDate` there silently failed to match roughly
 * 80% of the time whenever `SeanceDate` happened to have its own "Z".
 */
export function stripDateTimeOffset(input: string): string {
  return input.replace(/Z$/i, "").replace(/[+-]\d{2}:?\d{2}$/, "");
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

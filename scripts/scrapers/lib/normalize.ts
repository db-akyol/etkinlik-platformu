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

/**
 * Collapses a title down to a bare comparison key for the FALLBACK dedup
 * lookup in upsert-event.ts — never stored or displayed, only compared.
 *
 * The plain `(title, start_at)` exact match misses real cross-source
 * duplicates that upsert-event.ts's header always said it would ("Dedublüman"
 * vs "Dedublüman Konseri" was the hypothetical; adding bubilet.ts made it a
 * real, visible one — "Büyük Afrika Sirki" vs "Büyük Afrika Sirki Oyunu",
 * "TUANA" vs "Tuana", etc., confirmed against production on 2026-09-16). This
 * strips the genre/format words sources inconsistently append or omit
 * ("Konseri", "Oyunu", ...) and all punctuation/spacing, so those collapse to
 * the same key. It intentionally does NOT attempt real fuzzy matching (typos,
 * word reordering, translation) — only this specific, observed pattern.
 */
export function normalizeTitleForDedup(title: string): string {
  const withoutNoiseWords = title
    .toLocaleLowerCase("tr-TR")
    .replace(/\b(konseri|tiyatrosu|tiyatro|oyunu|gösterisi|gösterimi)\b/g, "");
  return withoutNoiseWords.replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Whether two titles are close enough to be the same event for dedup
 * purposes — equal after `normalizeTitleForDedup`, or one contained in the
 * other (a source appending extra context, e.g. a city name). Shared by
 * upsert-event.ts's live fallback lookup and
 * scripts/scrapers/merge-duplicate-events.ts's one-off cleanup of rows
 * inserted before that fallback existed, so the two can't silently drift
 * apart on what counts as "the same event".
 */
export function titlesMatchForDedup(a: string, b: string): boolean {
  const na = normalizeTitleForDedup(a);
  const nb = normalizeTitleForDedup(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * The Istanbul calendar day a stored UTC instant falls on, as "YYYY-MM-DD".
 * Used by the cross-source-time-drift fallback below — two sources reporting
 * "the same event" at different clock times (doors vs. showtime, a vendor's
 * own rounding) still agree on the date, even when they disagree on the
 * minute. Turkey's fixed UTC+3 (no DST since 2016) means this never needs a
 * timezone-database lookup, but it must still go through `Intl` explicitly —
 * a bare `date.getUTCDate()` would be wrong for the first three hours of
 * each Istanbul day.
 */
export function istanbulCalendarDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * The UTC instants bounding an Istanbul calendar day ("YYYY-MM-DD" as
 * returned by `istanbulCalendarDate`), inclusive. Turkey's fixed +03:00
 * offset makes this a plain string concatenation — no DST edge cases.
 */
export function istanbulCalendarDayRangeUtc(day: string): { start: string; end: string } {
  return {
    start: new Date(`${day}T00:00:00+03:00`).toISOString(),
    end: new Date(`${day}T23:59:59.999+03:00`).toISOString(),
  };
}

/**
 * Whether two events are the same real event for dedup purposes, given they
 * fall on the same Istanbul calendar day: either an exact `start_at` match
 * (any source — this is the pre-existing "worded differently" case), or a
 * fuzzy title match from a DIFFERENT source. The source check matters: a
 * single source's own page legitimately lists multiple real sessions on one
 * day (a matinee and an evening show) under the same `source_url` — those
 * must stay separate rows, and only differing sources reporting drifted
 * clock times for what both call the same title should collapse together.
 * Confirmed against production on 2026-09-16: "Dedublüman" (biletix, doors
 * time) / "Dedublüman Konseri" (bubilet, showtime) 60 minutes apart, "Büyük
 * Afrika Sirki" (biletinial vs. biletix) 120 minutes apart, etc. — all
 * cross-source, none same-source.
 */
export function sameDayCrossSourceMatch(
  a: { title: string; start_at: string; source_url: string | null },
  b: { title: string; start_at: string; source_url: string | null },
): boolean {
  if (!titlesMatchForDedup(a.title, b.title)) return false;
  return a.start_at === b.start_at || a.source_url !== b.source_url;
}

/**
 * Shape a parser must produce, BEFORE it's handed to `upsertScrapedEvent`.
 *
 * Parsers only ever see raw HTML/DOM — they know a venue's *name* as printed
 * on the page ("Diyarbakır Kültür Merkezi"), not its `venues.id` UUID. Same
 * for category. Resolving those names to ids (creating the row if it doesn't
 * exist yet) is `resolve-refs.ts`'s job, not the parser's — this keeps every
 * parser focused on "read the page, produce this plain-data shape" and keeps
 * DB/dedup concerns in one shared place.
 */
export interface ScrapedEventInput {
  /** Event title, as it should be displayed. Required. */
  title: string;
  /** Plain-text or lightly-formatted description. Null if the source has none. */
  description: string | null;
  /** ISO 8601 timestamp (e.g. `new Date(...).toISOString()`). Required — this
   *  is part of the dedup key, so it must be parsed precisely, not left vague
   *  ("this weekend"). Assume Turkey local time (Europe/Istanbul, UTC+3, no DST)
   *  unless the source states otherwise. */
  start_at: string;
  /** ISO 8601 timestamp, or null if the source doesn't give an end time. */
  end_at?: string | null;
  /** Venue name as printed on the source page. Null if the source gives no venue
   *  (e.g. "TBA" / "online") — the event will be stored with `venue_id: null`. */
  venue_name: string | null;
  /** Category name as printed/implied by the source (e.g. "Konser", "Tiyatro").
   *  Null if unknown — the event will be stored with `category_id: null`. */
  category_name: string | null;
  /** Free-text price as shown on the source (e.g. "Ücretsiz", "150 TL", null if unknown). */
  price: string | null;
  /** The exact page this event was scraped from. Required in practice (not just
   *  typed optional) — per docs/plan.md's scraping ethics note we must always be
   *  able to attribute/link back to the source. */
  source_url: string;
  /** Absolute URL to a poster/banner image, if the source has one. */
  image_url: string | null;
}

/** Summary returned by a parser's `run()`, and aggregated by `run-all.ts`. */
export interface ScrapeRunResult {
  /** Human-readable source name, e.g. "example-hn" or "Diyarbakır Büyükşehir Belediyesi". */
  source: string;
  /** Number of candidate events the parser extracted from the page. */
  found: number;
  /** Number successfully upserted (inserted or updated) into `events`. */
  upserted: number;
  /** Number that failed to resolve/upsert (network, parsing, or DB errors). */
  errors: number;
}

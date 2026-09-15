/**
 * `fetch` with bounded retries for the scrapers.
 *
 * Why this exists: the cron runs twice a day, so a single transient blip
 * costs a source up to 12 hours of staleness. And the blip doesn't have to
 * be rare to matter — a run makes ~90 requests to biletinial alone, so even
 * a 1-in-500 failure rate hits a run regularly. The list-page fetches are
 * the painful ones: unlike the per-event detail fetches (which already
 * degrade to "no price/description for this one event"), a throw there
 * aborts that parser's entire run.
 *
 * What is and isn't retried matters as much as the retrying:
 *
 *   - Network-level throws (DNS, connection reset, timeout) — retried.
 *     These are the transient case this is built for.
 *   - 5xx, 429 (rate limited) and 408 (request timeout) — retried. 429
 *     honours the source's own `Retry-After` when it sends one; a source
 *     asking us to slow down should be obeyed, not worked around.
 *   - Every other 4xx — NOT retried, returned as-is. A 404 or 403 means the
 *     page moved or we're unwelcome; hammering it three times changes
 *     nothing and is exactly the behaviour docs/plan.md's ethics note warns
 *     against.
 *
 * Backoff is exponential from `baseDelayMs`. There's no jitter on purpose:
 * this is one sequential client, not a thundering herd, and a deterministic
 * delay is easier to reason about in a CI log.
 */

/** Status codes worth trying again — everything else is treated as final. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Cap on how long a source's own `Retry-After` can hold up a run. The cron
 *  job has a 15-minute timeout for all three parsers combined, so honouring
 *  a multi-minute value would just trade a failed fetch for a killed job. */
const MAX_RETRY_AFTER_MS = 30_000;

export interface FetchWithRetryOptions {
  /** Extra attempts after the first. Default 2 (3 total). */
  retries?: number;
  /** Delay before the first retry; doubled each time. Default 1000ms. */
  baseDelayMs?: number;
  /** Prefix for warning logs, so a retry is attributable to a source. */
  label?: string;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  // RFC 9110 allows either delta-seconds or an HTTP date.
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }

  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetches `url`, retrying transient failures. Returns the `Response` for any
 * outcome the caller should treat as final (including a non-retryable error
 * status — callers still check `res.ok` themselves), and throws only if
 * every attempt threw at the network level.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  { retries = 2, baseDelayMs = 1000, label = "fetch" }: FetchWithRetryOptions = {},
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      console.warn(`[${label}] retry ${attempt}/${retries} for ${url}`);
    }

    let response: Response | undefined;
    try {
      response = await fetch(url, init);
    } catch (err) {
      lastError = err;
    }

    if (response) {
      if (!RETRYABLE_STATUSES.has(response.status)) return response;

      // Out of attempts: hand the error response back rather than throwing,
      // so the caller's own `res.ok` check produces its usual message.
      if (attempt === retries) return response;

      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      await sleep(retryAfter ?? baseDelayMs * 2 ** attempt);
      continue;
    }

    if (attempt === retries) break;
    await sleep(baseDelayMs * 2 ** attempt);
  }

  throw new Error(
    `[${label}] ${url} failed after ${retries + 1} attempt(s): ` +
      `${lastError instanceof Error ? lastError.message : String(lastError)}`,
    { cause: lastError },
  );
}

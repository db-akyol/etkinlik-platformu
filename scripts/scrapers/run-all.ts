/**
 * run-all.ts — runs every ACTIVE scraper in sequence and prints a summary.
 *
 * "Active" means: a real parser module (exports `run(): Promise<ScrapeRunResult>`)
 * that has been explicitly added to the `PARSERS` list below. Nothing is ever
 * picked up automatically — a new parser only runs once it's imported and
 * listed here.
 *
 * This is what both `npm run scrape` (local/manual) and the GitHub Actions
 * cron (.github/workflows/scrape.yml, twice daily) invoke.
 *
 * --- Scraping ethics (docs/plan.md "Önemli Uyarılar") ----------------------
 *   - Respect each source's robots.txt and terms of use before adding it here.
 *   - Don't hammer sources: parsers run in sequence (not parallel) on purpose,
 *     and the cron is capped at twice a day — do not lower that interval or
 *     parallelize requests to a single source without a real reason.
 *   - Prefer an official API/RSS/JSON feed over HTML scraping when a source
 *     offers one.
 *   - Always populate `source_url` on every scraped event so we can attribute
 *     back to the origin (also enforced by `ScrapedEventInput` being
 *     non-optional on `source_url` — see lib/types.ts).
 * -----------------------------------------------------------------------------
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { run as runBiletinial } from "./biletinial";
import { run as runBiletix } from "./biletix";
import { run as runDiyarbakirBelediye } from "./diyarbakir-belediye";
//
// bubilet.com.tr (a source the project owner asked about) is intentionally
// NOT scraped: it sits behind a Cloudflare bot-challenge ("Just a moment...")
// that actively blocks non-interactive requests. Defeating that would mean
// building detection-evasion tooling against a site that has explicitly
// signaled it doesn't want automated access — out of scope for this project.
// A third-party paid "API" (parse.bot's bubilet wrapper) that reportedly
// does this on our behalf was considered and declined for the same reason.
import type { ScrapeRunResult } from "./lib/types";

type Parser = () => Promise<ScrapeRunResult>;

interface RegisteredParser {
  run: Parser;
  /**
   * Fewer events than this means something is wrong, even though nothing
   * threw. A parser whose source quietly changes its page structure returns
   * `found=0 upserted=0 errors=0` — a clean, green, completely silent
   * failure, which is exactly how biletinial's broken enrichment went
   * unnoticed. This turns that into a red run.
   *
   * Set it LOW — low enough that normal quiet weeks never trip it, since a
   * threshold that cries wolf gets ignored and is worse than none. The job
   * is to catch "this source has stopped working entirely", not to track
   * how busy the city is. Observed counts as of 2026-09-15: biletinial 85,
   * biletix 32.
   */
  minExpected: number;
}

const PARSERS: RegisteredParser[] = [
  { run: runBiletinial, minExpected: 10 },
  { run: runBiletix, minExpected: 5 },
  // Zero, on purpose: this source genuinely has nothing upcoming much of
  // the time (verified 2026-09-15 — 20 events listed, all of them months
  // past). Its own log line says which of the two situations produced a
  // zero, since only it can tell them apart.
  { run: runDiyarbakirBelediye, minExpected: 0 },
];

/**
 * Returns a human-readable complaint for every source that came back
 * suspiciously empty. Split out from `main` so it can be unit-tested.
 */
export function findSilentFailures(
  results: { summary: ScrapeRunResult; minExpected: number }[],
): string[] {
  return results
    .filter(({ summary, minExpected }) => minExpected > 0 && summary.found < minExpected)
    .map(
      ({ summary, minExpected }) =>
        `${summary.source}: found only ${summary.found} event(s), expected at least ` +
        `${minExpected}. The source's page structure may have changed — check this ` +
        `parser against the live site.`,
    );
}

async function main() {
  console.log(`Running ${PARSERS.length} scraper(s)...\n`);

  const results: { summary: ScrapeRunResult; minExpected: number }[] = [];

  for (const parser of PARSERS) {
    try {
      const summary = await parser.run();
      results.push({ summary, minExpected: parser.minExpected });
    } catch (err) {
      // A parser throwing entirely (e.g. the target site is down, or the
      // page structure changed enough that waitForSelector times out) should
      // not stop the remaining parsers from running.
      console.error("Parser crashed:", err);
      results.push({
        summary: {
          source: parser.run.name || "unknown parser",
          found: 0,
          upserted: 0,
          errors: 1,
        },
        minExpected: parser.minExpected,
      });
    }
    console.log(""); // spacer between parsers' log output
  }

  console.log("=== Scrape summary ===");
  for (const { summary: s } of results) {
    console.log(
      `  ${s.source}: found=${s.found} upserted=${s.upserted} errors=${s.errors}`,
    );
  }

  const totalErrors = results.reduce((sum, r) => sum + r.summary.errors, 0);
  const silentFailures = findSilentFailures(results);

  if (silentFailures.length > 0) {
    console.error("\n=== Suspiciously empty sources ===");
    for (const problem of silentFailures) console.error(`  ${problem}`);
  }

  if (totalErrors > 0 || silentFailures.length > 0) {
    if (totalErrors > 0) {
      console.log(`\n${totalErrors} total error(s) across all parsers.`);
    }
    process.exit(1);
  }

  console.log("\nAll parsers completed without errors.");
}

// Only run when invoked directly — importing this module (e.g. from
// run-all.test.ts) must not kick off a full scrape.
const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) main();

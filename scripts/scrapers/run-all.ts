/**
 * run-all.ts — runs every ACTIVE scraper in sequence and prints a summary.
 *
 * "Active" means: a real parser module (exports `run(): Promise<ScrapeRunResult>`)
 * that has been explicitly added to the `PARSERS` list below. `.template.ts`
 * files (see `diyarbakir-belediye.template.ts`) are never picked up
 * automatically — a template only becomes active once a developer renames it,
 * fills in the real selectors, and adds it here.
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
import "dotenv/config";
import { run as runExampleHn } from "./example-hn";
// TODO: once a real parser is built from diyarbakir-belediye.template.ts,
// rename it (dropping `.template`) and wire it in here, e.g.:
// import { run as runDiyarbakirBelediye } from "./diyarbakir-belediye";
import type { ScrapeRunResult } from "./lib/types";

type Parser = () => Promise<ScrapeRunResult>;

const PARSERS: Parser[] = [
  runExampleHn,
  // runDiyarbakirBelediye,
];

async function main() {
  console.log(`Running ${PARSERS.length} scraper(s)...\n`);

  const summaries: ScrapeRunResult[] = [];

  for (const parser of PARSERS) {
    try {
      const summary = await parser();
      summaries.push(summary);
    } catch (err) {
      // A parser throwing entirely (e.g. the target site is down, or the
      // page structure changed enough that waitForSelector times out) should
      // not stop the remaining parsers from running.
      console.error("Parser crashed:", err);
      summaries.push({
        source: parser.name || "unknown parser",
        found: 0,
        upserted: 0,
        errors: 1,
      });
    }
    console.log(""); // spacer between parsers' log output
  }

  console.log("=== Scrape summary ===");
  for (const s of summaries) {
    console.log(
      `  ${s.source}: found=${s.found} upserted=${s.upserted} errors=${s.errors}`,
    );
  }

  const totalErrors = summaries.reduce((sum, s) => sum + s.errors, 0);
  if (totalErrors > 0) {
    console.log(`\n${totalErrors} total error(s) across all parsers.`);
    process.exit(1);
  }

  console.log("\nAll parsers completed without errors.");
}

main();

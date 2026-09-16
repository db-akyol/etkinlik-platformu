/**
 * bubilet.ts — parser for bubilet.com.tr's Diyarbakır listings.
 *
 * Unlike every other parser here, the actual HTTP fetching does NOT happen
 * in this file: bubilet.com.tr sits behind a Cloudflare bot-challenge that
 * blocks plain `fetch()` requests, so a separate Python script
 * (`bubilet_fetch.py`, using `cloudscraper`) does that part as a subprocess.
 * This is a deliberate, explicit exception to this project's normal "don't
 * build around a source's bot protection" rule — see that file's header and
 * docs/session-handoff.md for why.
 *
 * This file's job starts once the raw JSON exists: map it to
 * `ScrapedEventInput`, then run it through the exact same
 * normalize/resolve/upsert pipeline every other parser uses. The dedup
 * story is therefore identical to any other source: (title, start_at) —
 * see lib/upsert-event.ts. That does NOT catch the same real event worded
 * differently across sources (e.g. bubilet's "Dedublüman Konseri" vs
 * another source's "Dedublüman") — a known, pre-existing limitation, not
 * something specific to this parser.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getSupabaseAdmin, MissingSupabaseConfigError } from "./lib/supabase-admin";
import { getDiyarbakirCityId, resolveCategoryId, resolveVenueId } from "./lib/resolve-refs";
import { upsertScrapedEvent } from "./lib/upsert-event";
import { normalizeText, formatPriceTL } from "./lib/normalize";
import type { ScrapedEventInput, ScrapeRunResult } from "./lib/types";

const SOURCE_NAME = "bubilet.com.tr";
const FETCH_SCRIPT = fileURLToPath(new URL("./bubilet_fetch.py", import.meta.url));

/** The exact shape bubilet_fetch.py writes to its output file — see that
 *  file's `parse_item()`. */
export interface BubiletRawEvent {
  id: number;
  title: string | null;
  url: string;
  category_name: string;
  date_iso: string | null;
  venue: string | null;
  performers: string[];
  price: number | null;
  discounted_price: number | null;
  is_free: boolean;
  currency: string;
  image_url: string | null;
}

/**
 * Which Python command to try, and in what order. On a real install
 * `python3`/`python` are interchangeable, but on Windows *without* Python
 * installed, `python3.exe`/`python.exe` are often Microsoft Store "app
 * execution alias" stub trampolines rather than ENOENT — and spawning one
 * of those has been observed to crash the whole Node process on this
 * platform (a Windows-specific libuv `AssignProcessToJobObject` failure
 * that bypasses this file's own try/catch entirely), not just reject
 * cleanly like a normal missing binary would. Trying `python` first on
 * Windows dev machines (where it's the conventional name) avoids hitting
 * that stub via `python3`; CI (GitHub Actions' `ubuntu-latest`) has a real
 * `python3` and no such stub, so it stays first there.
 */
const PYTHON_CANDIDATES = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];

/**
 * Runs bubilet_fetch.py as a subprocess and returns its parsed output.
 */
async function fetchViaPython(): Promise<BubiletRawEvent[]> {
  const dir = await mkdtemp(join(tmpdir(), "bubilet-"));
  const outputPath = join(dir, `${randomUUID()}.json`);

  try {
    let lastError: unknown;
    for (const pythonBin of PYTHON_CANDIDATES) {
      try {
        await runPython(pythonBin, outputPath);
        const raw = await readFile(outputPath, "utf-8");
        return JSON.parse(raw) as BubiletRawEvent[];
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(
      `[${SOURCE_NAME}] could not run bubilet_fetch.py with ${PYTHON_CANDIDATES.map((p) => `"${p}"`).join(" or ")}. ` +
        `Install Python 3 and run "pip install -r scripts/scrapers/requirements.txt". ` +
        `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runPython(pythonBin: string, outputPath: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(pythonBin, [FETCH_SCRIPT, outputPath], { stdio: ["ignore", "inherit", "inherit"] });

    child.on("error", reject); // e.g. ENOENT — this python binary doesn't exist

    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${pythonBin} ${FETCH_SCRIPT} exited with code ${code}`));
    });
  });
}

/** Bubilet's price is a discountable numeric TL amount; `formatPriceTL`
 *  expects a bare number the same way every other parser's price does. */
function resolvePrice(item: BubiletRawEvent): string | null {
  if (item.is_free) return null;
  const amount = item.discounted_price ?? item.price;
  return amount != null ? formatPriceTL(amount) : null;
}

export function itemToEvent(item: BubiletRawEvent): ScrapedEventInput | null {
  if (!item.title || !item.date_iso) return null;

  // bubilet's `dates[0]` already carries an explicit UTC offset
  // ("2026-09-18T18:00:00+00:00") — unlike biletinial's, it needs no
  // Turkey-local assumption, just a normal ISO parse.
  const startAt = new Date(item.date_iso);
  if (Number.isNaN(startAt.getTime())) return null;

  return {
    title: normalizeText(item.title),
    description: item.performers.length > 0 ? normalizeText(`Sanatçılar: ${item.performers.join(", ")}`) : null,
    start_at: startAt.toISOString(),
    end_at: null, // bubilet's list endpoint gives no end time
    venue_name: item.venue ? normalizeText(item.venue) : null,
    category_name: item.category_name,
    price: resolvePrice(item),
    source_url: item.url,
    image_url: item.image_url,
  };
}

export async function run(): Promise<ScrapeRunResult> {
  console.log(`[${SOURCE_NAME}] fetching via bubilet_fetch.py...`);

  const rawItems = await fetchViaPython();
  console.log(`[${SOURCE_NAME}] received ${rawItems.length} raw item(s).`);

  const now = Date.now();
  const items = rawItems
    .map(itemToEvent)
    .filter((e): e is ScrapedEventInput => e !== null && new Date(e.start_at).getTime() >= now);
  console.log(`[${SOURCE_NAME}] ${items.length} upcoming event(s) after filtering.`);

  let supabase;
  let cityId: string;
  try {
    supabase = getSupabaseAdmin();
    cityId = await getDiyarbakirCityId(supabase);
  } catch (err) {
    if (!(err instanceof MissingSupabaseConfigError)) throw err;

    console.warn(`[${SOURCE_NAME}] Supabase not configured, skipping upsert:`, err.message);
    for (const item of items) {
      console.warn(`[${SOURCE_NAME}] would upsert: "${item.title}" @ ${item.start_at} (venue: ${item.venue_name})`);
    }
    return { source: SOURCE_NAME, found: items.length, upserted: 0, errors: 0 };
  }

  let upserted = 0;
  let errors = 0;

  for (const item of items) {
    try {
      const [venueId, categoryId] = await Promise.all([
        resolveVenueId(supabase, cityId, item.venue_name),
        resolveCategoryId(supabase, item.category_name),
      ]);

      const result = await upsertScrapedEvent(supabase, {
        title: item.title,
        description: item.description,
        start_at: item.start_at,
        end_at: item.end_at ?? null,
        city_id: cityId,
        venue_id: venueId,
        category_id: categoryId,
        price: item.price,
        source_type: "scraped",
        source_url: item.source_url,
        image_url: item.image_url,
        created_by: null,
      });

      if (result.action === "error") {
        errors++;
        console.error(`[${SOURCE_NAME}] upsert FAILED for "${item.title}":`, result.error);
      } else {
        upserted++;
        console.log(`[${SOURCE_NAME}] ${result.action}: "${item.title}"`);
      }
    } catch (err) {
      errors++;
      console.error(`[${SOURCE_NAME}] failed to process "${item.title}":`, err);
    }
  }

  const summary: ScrapeRunResult = { source: SOURCE_NAME, found: items.length, upserted, errors };
  console.log(
    `[${SOURCE_NAME}] done. found=${summary.found} upserted=${summary.upserted} errors=${summary.errors}`,
  );
  return summary;
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  run().catch((err) => {
    console.error(`[${SOURCE_NAME}] fatal error:`, err);
    process.exit(1);
  });
}

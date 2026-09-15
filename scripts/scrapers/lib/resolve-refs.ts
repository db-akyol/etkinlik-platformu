/**
 * Resolve the loose, human-readable strings a parser scrapes off a page
 * ("Diyarbakır Kültür Merkezi", "Konser") into the actual foreign-key UUIDs
 * `events` needs (`venue_id`, `category_id`), creating the row on first sight
 * if it doesn't exist yet.
 *
 * Matching is intentionally simple (case-insensitive exact match via `ilike`
 * with no wildcards) rather than fuzzy — for an MVP with a handful of sources,
 * silently merging "Kültür Merkezi" into "Kültür Sanat Merkezi" because they're
 * *similar* is more dangerous than occasionally creating a duplicate venue row
 * that an admin can merge later. If a source spells a venue two different ways,
 * that's a parser-level normalization fix, not something to paper over here.
 */
import type { SupabaseAdminClient } from "./supabase-admin";

const DIYARBAKIR_CITY_SLUG = "diyarbakir";

// Cached across calls within one process (a single `run-all.ts` invocation) —
// there is exactly one active city for the whole MVP, and it never changes
// mid-run, so there's no reason to hit the DB for it on every event.
let cachedDiyarbakirCityId: string | null = null;

/**
 * Looks up the Diyarbakır `cities.id`. All MVP scrapers are Diyarbakır-only
 * (see docs/plan.md), so this is the one city id every parser needs.
 */
export async function getDiyarbakirCityId(
  supabase: SupabaseAdminClient,
): Promise<string> {
  if (cachedDiyarbakirCityId) return cachedDiyarbakirCityId;

  const { data, error } = await supabase
    .from("cities")
    .select("id")
    .eq("slug", DIYARBAKIR_CITY_SLUG)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not find a city with slug "${DIYARBAKIR_CITY_SLUG}". Has ` +
        "supabase/schema.sql and supabase/seed.sql been applied to this " +
        `Supabase project? Underlying error: ${error?.message ?? "no row found"}`,
    );
  }

  cachedDiyarbakirCityId = data.id;
  return cachedDiyarbakirCityId;
}

/**
 * Resolves a venue name (scoped to `cityId`) to a `venues.id`, creating the
 * venue if no row with that name exists yet in that city. Returns `null` for
 * a blank/missing name — `events.venue_id` is nullable for exactly this case
 * (source gives no venue / "TBA" / online event).
 */
export async function resolveVenueId(
  supabase: SupabaseAdminClient,
  cityId: string,
  venueName: string | null | undefined,
): Promise<string | null> {
  const name = venueName?.trim();
  if (!name) return null;

  const { data: existing, error: findError } = await supabase
    .from("venues")
    .select("id")
    .eq("city_id", cityId)
    .ilike("name", name)
    .maybeSingle();

  if (findError) {
    throw new Error(`Failed to look up venue "${name}": ${findError.message}`);
  }
  if (existing) return existing.id;

  const { data: inserted, error: insertError } = await supabase
    .from("venues")
    .insert({ city_id: cityId, name })
    .select("id")
    .single();

  if (insertError || !inserted) {
    // Race with another concurrent scraper run inserting the same venue: a
    // second lookup covers the common case without needing a unique index on
    // (city_id, name) — venue names aren't guaranteed unique at the DB level.
    const { data: retry } = await supabase
      .from("venues")
      .select("id")
      .eq("city_id", cityId)
      .ilike("name", name)
      .maybeSingle();
    if (retry) return retry.id;

    throw new Error(
      `Failed to create venue "${name}": ${insertError?.message ?? "unknown error"}`,
    );
  }

  return inserted.id;
}

/** Turkish-specific character folding for slug generation (`categories.slug`).
 *  Plain `.normalize("NFD")` diacritic-stripping mishandles Turkish letters
 *  (e.g. dotless "ı" and "İ" aren't accented variants of "i" in Unicode, so
 *  they survive NFD untouched and would produce broken/non-ASCII slugs). */
const TURKISH_FOLD: Record<string, string> = {
  ç: "c", Ç: "c",
  ğ: "g", Ğ: "g",
  ı: "i", I: "i", İ: "i",
  ö: "o", Ö: "o",
  ş: "s", Ş: "s",
  ü: "u", Ü: "u",
};

/** Exported for resolve-refs.test.ts — the Turkish folding above is subtle
 *  enough to be worth pinning without needing a database. */
export function slugify(input: string): string {
  const folded = input
    .split("")
    .map((ch) => TURKISH_FOLD[ch] ?? ch)
    .join("");

  return folded
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip remaining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolves a category name to a `categories.id`, creating it (with a
 * generated `slug`) if it doesn't exist yet. Categories are global (not
 * city-scoped) per the schema. Returns `null` for a blank/missing name.
 */
export async function resolveCategoryId(
  supabase: SupabaseAdminClient,
  categoryName: string | null | undefined,
): Promise<string | null> {
  const name = categoryName?.trim();
  if (!name) return null;

  const { data: existing, error: findError } = await supabase
    .from("categories")
    .select("id")
    .ilike("name", name)
    .maybeSingle();

  if (findError) {
    throw new Error(`Failed to look up category "${name}": ${findError.message}`);
  }
  if (existing) return existing.id;

  const slug = slugify(name);
  const { data: inserted, error: insertError } = await supabase
    .from("categories")
    .insert({ name, slug })
    .select("id")
    .single();

  if (insertError || !inserted) {
    // Race, or a pre-existing category with the same slug but different
    // casing/whitespace than our ilike match caught: fall back to a slug
    // lookup before giving up.
    const { data: retry } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (retry) return retry.id;

    throw new Error(
      `Failed to create category "${name}": ${insertError?.message ?? "unknown error"}`,
    );
  }

  return inserted.id;
}

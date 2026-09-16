/**
 * Resolves a free-text venue name (from AI extraction, or an admin typing a
 * new venue in the Instagram-assisted entry flow) to a `venues.id`,
 * creating the venue if no case-insensitive match exists yet.
 *
 * This is the SAME "find, or create" logic
 * scripts/scrapers/lib/resolve-refs.ts's `resolveVenueId` already
 * implements for the cron scrapers — deliberately reimplemented here
 * rather than imported, because that function is typed against
 * `SupabaseAdminClient` (the service-role `@supabase/supabase-js` client
 * scripts use), while this app's session-scoped `@supabase/ssr` client
 * (`@/lib/supabase/server`) is a different generic `Database` type. See
 * docs/design/instagram-assisted-entry.md's
 * "Venue resolution" section, and app/admin/actions.ts's top-of-file
 * comment for the `.returns<T[]>()`/`as never` workaround this follows.
 */
import type { createClient } from "@/lib/supabase/server";
import type { City, Venue } from "@/lib/supabase/types";

type AppSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Mirrors app/(public)/page.tsx's own "the one active city" lookup — the
 *  MVP has exactly one (Diyarbakır). */
async function getActiveCityId(supabase: AppSupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("cities")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .returns<Pick<City, "id">[]>();

  const city = data?.[0];
  if (error || !city) {
    throw new Error(`Aktif şehir bulunamadı: ${error?.message ?? "kayıt yok"}`);
  }

  return city.id;
}

export async function resolveVenueByName(
  supabase: AppSupabaseClient,
  venueName: string | null | undefined,
): Promise<string | null> {
  const name = venueName?.trim();
  if (!name) return null;

  const cityId = await getActiveCityId(supabase);

  const { data: existingRows, error: findError } = await supabase
    .from("venues")
    .select("id")
    .eq("city_id", cityId)
    .ilike("name", name)
    .returns<Pick<Venue, "id">[]>();

  if (findError) {
    throw new Error(`Mekan aranamadı "${name}": ${findError.message}`);
  }
  const existing = existingRows?.[0];
  if (existing) return existing.id;

  const { data: insertedRows, error: insertError } = await supabase
    .from("venues")
    .insert({ city_id: cityId, name } as never)
    .select("id")
    .returns<Pick<Venue, "id">[]>();

  const inserted = insertedRows?.[0];
  if (insertError || !inserted) {
    throw new Error(`Mekan oluşturulamadı "${name}": ${insertError?.message ?? "bilinmeyen hata"}`);
  }

  return inserted.id;
}

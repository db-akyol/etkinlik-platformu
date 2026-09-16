// Plain helper module (NOT "use server") for parsing/validating the admin
// event form. `app/admin/actions.ts` is a "use server" module, and Next.js
// requires every export of such a module to be an async function —
// `readField`/`parseEventForm` are synchronous, so they must live outside
// it. `resolveCityId` is async and would compile fine in actions.ts, but
// keeping it here too avoids needlessly publishing it as a client-callable
// Server Action endpoint (its first parameter is a non-serializable Supabase
// client, so it isn't actually exploitable — this is just hygiene).
import type { createClient } from "@/lib/supabase/server";
import { istanbulLocalToUtcIso } from "@/lib/istanbul-time";
import type { Venue } from "@/lib/supabase/types";

export type ParsedEventFields = {
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  venue_id: string | null;
  category_id: string | null;
  price: string | null;
  image_url: string | null;
};

export function readField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseEventForm(formData: FormData): ParsedEventFields {
  const startAtRaw = readField(formData, "start_at");
  const endAtRaw = readField(formData, "end_at");

  return {
    title: readField(formData, "title"),
    description: readField(formData, "description") || null,
    start_at: startAtRaw ? istanbulLocalToUtcIso(startAtRaw) : "",
    end_at: endAtRaw ? istanbulLocalToUtcIso(endAtRaw) : null,
    venue_id: readField(formData, "venue_id") || null,
    category_id: readField(formData, "category_id") || null,
    price: readField(formData, "price") || null,
    image_url: readField(formData, "image_url") || null,
  };
}

export async function resolveCityId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  venueId: string | null,
): Promise<string> {
  if (!venueId) {
    throw new Error("Etkinlik için bir mekan seçilmelidir.");
  }

  const { data: venues, error } = await supabase
    .from("venues")
    .select("city_id")
    .eq("id", venueId)
    .returns<Pick<Venue, "city_id">[]>();

  const venue = venues?.[0];

  if (error || !venue) {
    throw new Error("Seçilen mekan bulunamadı.");
  }

  return venue.city_id;
}

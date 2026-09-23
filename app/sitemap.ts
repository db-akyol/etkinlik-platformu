import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

// Same reason every public page carries this: the scraper cron writes straight
// to Supabase twice a day and never goes through Next, so a sitemap generated
// at build time would freeze at whatever events existed when the last deploy
// happened — which is exactly the content this file exists to advertise.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  // The listing is the only static page worth indexing. /giris and /kayit are
  // forms with no content, /favoriler needs a session, and /offline is a PWA
  // fallback — robots.ts tells crawlers to skip them rather than listing them
  // here with a low priority.
  const entries: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
  ];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, created_at")
    .eq("status", "approved")
    .order("start_at", { ascending: true })
    .returns<{ id: string; created_at: string | null }[]>();

  if (error) {
    // A sitemap that is missing its event URLs still beats a 500, which some
    // crawlers cache as "this site has no sitemap".
    console.error("[sitemap] approved event lookup failed:", error);
    return entries;
  }

  for (const event of data ?? []) {
    entries.push({
      url: `${base}/etkinlik/${event.id}`,
      // `events` has no `updated_at` column (see 0001_init.sql), and scrapers
      // re-upsert rows in place, so this is the row's first-seen time rather
      // than a true content-changed time. It is a hint to crawlers, not a
      // guarantee, and being approximate is better than omitting it.
      lastModified: event.created_at ? new Date(event.created_at) : undefined,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  return entries;
}

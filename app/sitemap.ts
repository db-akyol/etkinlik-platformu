import type { MetadataRoute } from "next";
import { getUpcomingFloor } from "@/lib/event-filters";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

// Same reason every public page carries this: the scraper cron writes straight
// to Supabase twice a day and never goes through Next, so a sitemap generated
// at build time would freeze at whatever events existed when the last deploy
// happened — which is exactly the content this file exists to advertise.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  // The listing and its category pages (added below) are the only
  // non-event pages worth indexing. /giris and /kayit are
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

  // Upcoming events only — the same cut-off as the listing. Past events'
  // pages stay reachable but carry `noindex` (see isPastEvent in
  // lib/event-seo.ts); listing them here asked crawlers to spend their time
  // on shows that already happened, and by October 2026 those were half the
  // sitemap.
  const floor = getUpcomingFloor();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, created_at, category:categories(slug)")
    .eq("status", "approved")
    .or(`start_at.gte.${floor},end_at.gte.${floor}`)
    .order("start_at", { ascending: true })
    .returns<{ id: string; created_at: string | null; category: { slug: string } | null }[]>();

  if (error) {
    // A sitemap that is missing its event URLs still beats a 500, which some
    // crawlers cache as "this site has no sitemap".
    console.error("[sitemap] approved event lookup failed:", error);
    return entries;
  }

  // One page per category that has something coming up — an empty category
  // page is nothing worth sending a crawler to.
  const categorySlugs = [...new Set((data ?? []).flatMap((event) => (event.category ? [event.category.slug] : [])))];
  for (const slug of categorySlugs.sort()) {
    entries.push({
      url: `${base}/kategori/${slug}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    });
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

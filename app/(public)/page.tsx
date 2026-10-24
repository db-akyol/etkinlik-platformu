import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import AmedsporBanner from "@/components/AmedsporBanner";
import EventListing, { parseListingParams, type SearchParams } from "@/components/EventListing";
import { buildListingHref } from "@/lib/event-filters";
import { serializeJsonLd } from "@/lib/event-seo";
import { getSiteUrl } from "@/lib/site-url";

// Event content here comes from the scraper cron (writes directly to
// Supabase, bypassing Next.js entirely — there's no request that could ever
// call revalidatePath for it). Without this, a fresh scrape run's data could
// sit behind Next's fetch Data Cache indefinitely (a route rendering
// dynamically due to cookies()/searchParams does NOT by itself guarantee
// the individual fetch()es inside it are uncached) — force every request to
// hit Supabase for real, current data.
export const dynamic = "force-dynamic";

// Every filtered view (?gun=, ?q=, ?fiyat=, ?gorunum=) is the same set of
// events in a different order or subset, so they all point back to the bare
// listing instead of competing with it for the same search results.
// Categories are the exception: they have their own pages, /kategori/<slug>.
//
// Only `alternates` is set: Next merges metadata shallowly, so re-declaring
// `openGraph` here just to add a `url` would discard the image, title and
// description the root layout supplies.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = parseListingParams(await searchParams);

  // ?kategori=<slug> is where category filters used to live; links to it
  // (and search engines that indexed it) move to the category's own page.
  if (params.kategori) permanentRedirect(buildListingHref(params));

  return (
    <>
      <script
        type="application/ld+json"
        // Gives search engines the site's name for its results.
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Diyarbakır Etkinlik",
            alternateName: "Diyarbakır Etkinlikleri",
            url: `${getSiteUrl()}/`,
            inLanguage: "tr-TR",
          }),
        }}
      />
      <EventListing
        params={params}
        // Only on the plain listing: a search or a picked day is a narrower
        // question than "what's on".
        banner={!params.q && !params.gun && !params.fiyat ? <AmedsporBanner /> : undefined}
        heading="Diyarbakır etkinlikleri"
        intro="Diyarbakır'daki konser, tiyatro, stand-up ve çocuk etkinlikleri tek yerde. Liste Biletinial, Biletix, Bubilet ve Büyükşehir Belediyesi'nden günde iki kez güncellenir."
      />
    </>
  );
}

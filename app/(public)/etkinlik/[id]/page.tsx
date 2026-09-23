import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type EventWithRelations } from "@/components/EventCard";
import EventMap from "@/components/EventMap";
import FavoriteButton from "@/components/FavoriteButton";
import { formatEventDateTime, formatEventPrice } from "@/lib/format-event";
import { createClient } from "@/lib/supabase/server";

// Event content here comes from the scraper cron (writes directly to
// Supabase, bypassing Next.js entirely — there's no request that could ever
// call revalidatePath for it) as well as admin edits. Without this, a fresh
// scrape run's data could sit behind Next's fetch Data Cache indefinitely
// (a route rendering dynamically due to cookies()/searchParams does NOT by
// itself guarantee the individual fetch()es inside it are uncached) — force
// every request to hit Supabase for real, current data.
export const dynamic = "force-dynamic";

// Keep this in sync with EventWithRelations in components/EventCard.tsx.
const EVENT_SELECT =
  "*, venue:venues(id, name, address, lat, lng), category:categories(id, name, slug)" as const;

type PageParams = { id: string };

async function getApprovedEvent(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select<typeof EVENT_SELECT, EventWithRelations>(EVENT_SELECT)
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle();

  if (error) console.error(`[etkinlik/${id}] event lookup failed:`, error);

  return { event: data, error };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { id } = await params;
  // Metadata can't throw its way to app/(public)/error.tsx — a lookup failure
  // falls back to the same not-found title the page component itself never
  // reaches, since it throws instead (see below).
  const { event, error } = await getApprovedEvent(id);

  if (!event || error) {
    return { title: "Etkinlik bulunamadı | Diyarbakır Etkinlik" };
  }

  const description =
    event.description?.slice(0, 160) ??
    `${event.title} - ${formatEventDateTime(event.start_at)}`;

  // Next merges metadata shallowly, so this `openGraph` replaces the root
  // layout's outright — `type`, `locale` and `siteName` have to be repeated
  // here or they are simply lost on the pages most likely to be shared.
  const path = `/etkinlik/${event.id}`;
  // Falls back to the site-wide card when an event has no poster, so a shared
  // link never previews as a bare URL.
  const images = event.image_url ? [event.image_url] : ["/og-default.png"];

  return {
    title: `${event.title} | Diyarbakır Etkinlik`,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      siteName: "Diyarbakır Etkinlik",
      url: path,
      title: event.title,
      description,
      images,
    },
    // `twitter` has to be repeated for the same shallow-merge reason as
    // `openGraph`. Leaving it out does not fall through to the Open Graph
    // tags — it inherits the root layout's, so every shared event previewed
    // on X as the generic site title with the generic card image.
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
      images,
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { id } = await params;
  const { event, error } = await getApprovedEvent(id);

  // A real PostgREST failure is not "this event doesn't exist" — surfacing
  // it as a 404 would hide a transient outage on a page for a live event.
  // Throwing here lets app/(public)/error.tsx render a recoverable error
  // instead.
  if (error) {
    throw error;
  }

  if (!event) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isFavorited = false;
  if (user) {
    const { data: favorite } = await supabase
      .from("favorites")
      .select("event_id")
      .eq("user_id", user.id)
      .eq("event_id", event.id)
      .returns<{ event_id: string }[]>();
    isFavorited = (favorite?.length ?? 0) > 0;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/" className="text-sm font-medium text-dicle hover:underline">
        ← Tüm etkinlikler
      </Link>

      <article className="overflow-hidden rounded-xl border border-line">
        <div className="relative aspect-[16/9] w-full bg-zinc-200 dark:bg-zinc-800">
          {event.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.image_url}
              alt={event.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-dicle to-dicle-dim">
              <span className="text-lg font-medium text-on-dicle">
                {event.category?.name ?? "Etkinlik"}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            {event.category && (
              <span className="rounded-full bg-dicle/10 px-3 py-1 text-xs font-medium text-dicle">
                {event.category.name}
              </span>
            )}
            <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {formatEventPrice(event.price)}
            </span>
            <FavoriteButton
              eventId={event.id}
              initialFavorited={isFavorited}
              isLoggedIn={!!user}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-zinc-700 transition-colors hover:bg-surface-muted dark:text-zinc-300"
            />
          </div>

          {/* Bigger than the listing page's h1 on purpose — this is the more
              important heading of the two, and used to render smaller. */}
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {event.title}
          </h1>

          <p className="text-base font-medium text-dicle">
            {formatEventDateTime(event.start_at)}
            {event.end_at ? ` – ${formatEventDateTime(event.end_at)}` : null}
          </p>

          {event.venue && (
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              <p className="font-medium">{event.venue.name}</p>
              {event.venue.address && (
                <p className="text-zinc-500 dark:text-zinc-400">{event.venue.address}</p>
              )}
            </div>
          )}

          {event.venue?.lat != null && event.venue?.lng != null && (
            <EventMap
              markers={[
                {
                  id: event.id,
                  lat: event.venue.lat,
                  lng: event.venue.lng,
                  title: event.venue.name,
                },
              ]}
              className="h-64 w-full rounded-lg"
            />
          )}

          {event.description && (
            // max-w-prose caps the line length at a comfortable reading
            // measure (~65ch) regardless of how wide the article column is.
            <p className="max-w-prose whitespace-pre-line text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
              {event.description}
            </p>
          )}

          {event.source_type === "scraped" && event.source_url && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Kaynak:{" "}
              <a
                href={event.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="break-all underline hover:text-dicle"
              >
                {event.source_url}
              </a>
            </p>
          )}
        </div>
      </article>
    </div>
  );
}

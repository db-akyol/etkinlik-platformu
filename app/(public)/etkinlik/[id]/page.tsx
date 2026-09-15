import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatEventDateTime,
  formatEventPrice,
  type EventWithRelations,
} from "@/components/EventCard";
import EventMap from "@/components/EventMap";
import FavoriteButton from "@/components/FavoriteButton";
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

async function getApprovedEvent(id: string): Promise<EventWithRelations | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select<typeof EVENT_SELECT, EventWithRelations>(EVENT_SELECT)
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle();

  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await getApprovedEvent(id);

  if (!event) {
    return { title: "Etkinlik bulunamadı | Diyarbakır Etkinlikleri" };
  }

  const description =
    event.description?.slice(0, 160) ??
    `${event.title} - ${formatEventDateTime(event.start_at)}`;

  return {
    title: `${event.title} | Diyarbakır Etkinlikleri`,
    description,
    openGraph: {
      title: event.title,
      description,
      images: event.image_url ? [event.image_url] : undefined,
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { id } = await params;
  const event = await getApprovedEvent(id);

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
      <Link
        href="/"
        className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        ← Tüm etkinlikler
      </Link>

      <article className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
        <div className="relative aspect-[16/9] w-full bg-zinc-200 dark:bg-zinc-800">
          {event.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.image_url}
              alt={event.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
              <span className="text-lg font-medium text-white/90">
                {event.category?.name ?? "Etkinlik"}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            {event.category && (
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {event.category.name}
              </span>
            )}
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {formatEventPrice(event.price)}
            </span>
            <FavoriteButton
              eventId={event.id}
              initialFavorited={isFavorited}
              isLoggedIn={!!user}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            />
          </div>

          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            {event.title}
          </h1>

          <p className="text-base font-medium text-indigo-600 dark:text-indigo-400">
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
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
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
                className="underline hover:text-indigo-600 dark:hover:text-indigo-400"
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

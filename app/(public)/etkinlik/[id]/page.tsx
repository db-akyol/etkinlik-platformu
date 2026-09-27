import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type EventWithRelations } from "@/components/EventCard";
import EventMap from "@/components/EventMap";
import FavoriteButton from "@/components/FavoriteButton";
import PosterImage from "@/components/PosterImage";
import { ChevronLeftIcon, ExternalIcon } from "@/components/icons";
import { getUpcomingFloor, isFreePrice } from "@/lib/event-filters";
import {
  formatDayLong,
  formatEventDateTime,
  formatEventPrice,
  formatEventTime,
  istanbulDayKey,
  splitEventTitle,
} from "@/lib/format-event";
import { createClient } from "@/lib/supabase/server";
import type { EventRow } from "@/lib/supabase/types";

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
    // The root layout's title template adds " | Diyarbakır Etkinlik".
    return { title: "Etkinlik bulunamadı" };
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
    title: event.title,
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

  // The other sessions of this show, as grouped on the listing (see
  // lib/event-groups.ts). Exact title match is enough here: a source repeats
  // a show's title verbatim for each of its sessions.
  let otherSessionsQuery = supabase
    .from("events")
    .select("id, start_at, price")
    .eq("status", "approved")
    .eq("title", event.title)
    .neq("id", event.id)
    .gte("start_at", getUpcomingFloor())
    .order("start_at", { ascending: true });
  otherSessionsQuery = event.venue_id
    ? otherSessionsQuery.eq("venue_id", event.venue_id)
    : otherSessionsQuery.is("venue_id", null);

  const [
    {
      data: { user },
    },
    { data: otherSessionRows, error: otherSessionsError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    otherSessionsQuery.returns<Pick<EventRow, "id" | "start_at" | "price">[]>(),
  ]);

  // Nice-to-have: a failure here just hides the list.
  if (otherSessionsError) console.error(`[etkinlik/${id}] other sessions lookup failed:`, otherSessionsError);
  const otherSessions = otherSessionRows ?? [];

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

  const { title, subtitle } = splitEventTitle(event.title);
  const dayKey = istanbulDayKey(event.start_at);
  // Some sources send the start time again as the end time when they have
  // no real one; an end that isn't after the start is treated as absent.
  const endAt = event.end_at && event.end_at > event.start_at ? event.end_at : null;
  const timeText = endAt
    ? istanbulDayKey(endAt) === dayKey
      ? `${formatEventTime(event.start_at)} – ${formatEventTime(endAt)}`
      : `${formatEventTime(event.start_at)} – ${formatEventDateTime(endAt)}`
    : formatEventTime(event.start_at);
  // Sources without a real description often repeat the title there.
  const description = event.description?.trim() !== event.title.trim() ? event.description : null;
  const sourceHost = event.source_type === "scraped" ? hostnameOf(event.source_url) : null;
  const price = formatEventPrice(event.price);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:px-6 md:py-8 lg:px-8">
      <Link
        href="/"
        className="-ml-1 inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
      >
        <ChevronLeftIcon size={18} />
        Tüm etkinlikler
      </Link>

      {/* Phones: a small poster beside the title, so the date, price and
       * ticket link make the first screen instead of sitting under a
       * full-width poster. From md up: poster column on the left, sticky,
       * spanning both rows of the right column. */}
      <article className="mt-5 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-6 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-12">
        <div className="relative aspect-[4/5] w-full self-start overflow-hidden rounded-2xl bg-surface-muted md:sticky md:top-24 md:row-span-2 md:rounded-3xl">
          <PosterImage
            src={event.image_url}
            alt={`${title} afişi`}
            priority
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-dicle to-dicle-dim px-2 text-center">
                <span className="font-display text-base font-bold text-on-dicle md:text-2xl">
                  {event.category?.name ?? "Etkinlik"}
                </span>
              </div>
            }
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2 self-center md:gap-3 md:self-end">
          {event.category && (
            <span className="self-start rounded-full bg-dicle-soft px-3 py-1 text-xs font-semibold text-foreground">
              {event.category.name}
            </span>
          )}
          <h1 className="font-display text-2xl leading-[1.1] font-extrabold tracking-tight text-balance sm:text-4xl md:text-5xl md:leading-[1.05]">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-muted sm:text-lg">{subtitle}</p>}
        </div>

        <div className="col-span-2 flex min-w-0 flex-col gap-6 md:col-span-1 md:col-start-2">
          <dl className="grid gap-x-6 gap-y-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
            <div>
              <dt className="text-[13px] font-semibold text-muted">Tarih</dt>
              <dd className="mt-0.5 font-semibold">{formatDayLong(dayKey)}</dd>
              <dd className="text-dicle font-semibold tabular-nums">{timeText}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-muted">Fiyat</dt>
              {price ? (
                <dd className={`mt-0.5 font-semibold tabular-nums ${isFreePrice(event.price) ? "text-free" : ""}`}>
                  {price}
                </dd>
              ) : (
                <dd className="mt-0.5 text-muted">Kaynakta belirtilmemiş</dd>
              )}
            </div>
            {event.venue && (
              <div className="sm:col-span-2">
                <dt className="text-[13px] font-semibold text-muted">Mekan</dt>
                <dd className="mt-0.5 font-semibold">{event.venue.name}</dd>
                {event.venue.address && <dd className="text-sm text-muted">{event.venue.address}</dd>}
              </div>
            )}
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            {sourceHost && (
              <a
                href={event.source_url!}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-2 rounded-full bg-dicle px-5 py-2.5 font-semibold text-on-dicle transition-colors hover:bg-dicle-dim"
              >
                Bilet ve ayrıntılar: {sourceHost}
                <ExternalIcon size={16} />
              </a>
            )}
            <FavoriteButton
              eventId={event.id}
              initialFavorited={isFavorited}
              isLoggedIn={!!user}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface transition-colors hover:bg-surface-muted aria-busy:opacity-70"
            />
          </div>

          {otherSessions.length > 0 && (
            <section aria-labelledby="diger-seanslar" className="flex flex-col gap-2">
              <h2 id="diger-seanslar" className="font-display text-lg font-bold">
                Diğer seanslar
              </h2>
              <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
                {otherSessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`/etkinlik/${session.id}`}
                      className="flex items-baseline justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <span>
                        {formatDayLong(istanbulDayKey(session.start_at))}
                        <span className="ml-2 font-semibold text-dicle tabular-nums">
                          {formatEventTime(session.start_at)}
                        </span>
                      </span>
                      {formatEventPrice(session.price) && (
                        <span className="shrink-0 text-sm text-muted tabular-nums">
                          {formatEventPrice(session.price)}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {description && (
            // max-w-prose caps the line length at a comfortable reading
            // measure (~65ch) regardless of how wide the column is.
            <p className="max-w-prose text-base leading-relaxed whitespace-pre-line">{description}</p>
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
              className="h-64 w-full rounded-2xl"
            />
          )}
        </div>
      </article>
    </div>
  );
}

/** "biletix.com" from a source URL; null when there is no usable URL. */
function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

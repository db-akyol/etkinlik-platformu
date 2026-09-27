import Link from "next/link";
import FavoriteButton from "@/components/FavoriteButton";
import {
  formatEventBadge,
  formatEventPrice,
  formatEventStamp,
  formatEventTime,
  shortVenueName,
  splitEventTitle,
} from "@/lib/format-event";
import type { Category, EventRow, Venue } from "@/lib/supabase/types";

/**
 * An event row joined with its venue and category, as returned by the
 * `*, venue:venues(id, name, address), category:categories(id, name, slug)`
 * select used on the public listing and detail pages.
 */
export type EventWithRelations = EventRow & {
  venue: Pick<Venue, "id" | "name" | "address" | "lat" | "lng"> | null;
  category: Pick<Category, "id" | "name" | "slug"> | null;
};

export default function EventCard({
  event,
  sessionCount = 1,
  dateShownAbove = false,
  isLoggedIn = false,
  isFavorited = false,
  priority = false,
}: {
  /** The session this card opens — the first one, or the one on the selected day. */
  event: EventWithRelations;
  /** How many upcoming sessions the show has in total (see lib/event-groups.ts). */
  sessionCount?: number;
  /** True inside a day group on the listing, whose heading already names the
   * day: the card then drops its date stamp and shows only the time. */
  dateShownAbove?: boolean;
  isLoggedIn?: boolean;
  isFavorited?: boolean;
  /** True for the first cards on the page — makes this card's image an LCP
   * candidate instead of lazy-loading it like every card below the fold. */
  priority?: boolean;
}) {
  const { title, subtitle } = splitEventTitle(event.title);
  const badge = formatEventBadge(event.start_at);
  const stamp = formatEventStamp(event.start_at);
  const when = dateShownAbove ? formatEventTime(event.start_at) : badge.text;
  const isFree = !event.price || event.price.trim() === "";
  const loading = priority ? "eager" : "lazy";

  return (
    <article className="group relative flex min-w-0 flex-col gap-2.5">
      {/* Stretched-link pattern: this anchor is the card's whole click/tap
       * target. It sits beside the visible content rather than wrapping it
       * because FavoriteButton is a real <button> — interactive controls
       * nested inside an <a> are invalid HTML, and the button's label would
       * be folded into the link's accessible name. z-10 keeps it above the
       * image and text; z-20 keeps the favorite button above it. */}
      <Link
        href={`/etkinlik/${event.id}`}
        aria-label={subtitle ? `${title}, ${subtitle}` : title}
        className="absolute inset-0 z-10 rounded-2xl"
      />
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-surface-muted">
        {event.image_url ? (
          <>
            {/* Posters are mostly portrait but some sources send wide
             * banners. Blurred fill: a scaled, blurred copy of the image
             * fills the frame and the real image sits on top with
             * object-contain, so no poster loses its title or date to a
             * crop. Both tags use the same URL, so it's one request.
             * Plain <img> keeps this free of next.config.ts remote-image
             * configuration. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.image_url}
              alt=""
              aria-hidden="true"
              loading={loading}
              decoding="async"
              className="absolute inset-0 h-full w-full scale-125 object-cover blur-xl"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.image_url}
              alt=""
              loading={loading}
              fetchPriority={priority ? "high" : undefined}
              decoding="async"
              className="relative h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center">
            <span className="font-display text-lg font-bold text-muted">
              {event.category?.name ?? "Etkinlik"}
            </span>
          </div>
        )}

        {!dateShownAbove && (
          // The same date is in the text below for screen readers.
          <div
            aria-hidden="true"
            className={`absolute left-2.5 top-2.5 flex min-w-11 flex-col items-center rounded-[10px] px-2 pb-1 pt-1.5 leading-none shadow-sm ${
              badge.soon ? "bg-dicle text-on-dicle" : "bg-surface text-foreground"
            }`}
          >
            <span className="font-display text-xl font-extrabold tracking-tight tabular-nums">
              {stamp.day}
            </span>
            <span className={`mt-0.5 text-[11px] font-semibold ${badge.soon ? "opacity-85" : "text-muted"}`}>
              {stamp.month}
            </span>
          </div>
        )}

        <div className="absolute right-2.5 top-2.5 z-20">
          <FavoriteButton
            eventId={event.id}
            initialFavorited={isFavorited}
            isLoggedIn={isLoggedIn}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-surface aria-busy:opacity-70"
          />
        </div>

        {sessionCount > 1 && (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white">
            {sessionCount} seans
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <h3 className="font-display line-clamp-2 text-base leading-snug font-bold tracking-tight text-foreground">
          {title}
        </h3>
        {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
        {event.venue?.name && (
          <p className="truncate text-[13px] text-muted">{shortVenueName(event.venue.name)}</p>
        )}
        <p className="mt-1 flex items-baseline justify-between gap-2 text-[13px]">
          <span className="truncate font-semibold text-dicle">{when}</span>
          <span className={`shrink-0 font-semibold tabular-nums ${isFree ? "text-free" : "text-foreground"}`}>
            {formatEventPrice(event.price)}
          </span>
        </p>
      </div>
    </article>
  );
}

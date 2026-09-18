import Link from "next/link";
import FavoriteButton from "@/components/FavoriteButton";
import { formatEventBadge, formatEventDateTime, formatEventPrice } from "@/lib/format-event";
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
  isLoggedIn = false,
  isFavorited = false,
  priority = false,
}: {
  event: EventWithRelations;
  isLoggedIn?: boolean;
  isFavorited?: boolean;
  /** True for the first row of cards — makes this card's image the LCP
   * candidate instead of lazy-loading it like every card below the fold. */
  priority?: boolean;
}) {
  const badge = formatEventBadge(event.start_at);
  const isFree = !event.price || event.price.trim() === "";
  const loading = priority ? "eager" : "lazy";

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md has-[a:focus-visible]:shadow-md">
      {/* Stretched-link pattern: this anchor is the card's whole click/tap
       * target. It has to live outside the visible content (rather than
       * wrap it, as it used to) because FavoriteButton below is a real
       * <button> — interactive controls nested inside an <a> are invalid
       * HTML, and the button's label would get folded into the link's
       * accessible name. z-10 keeps it above the decorative image/badges
       * so every point on the card is still a live click target; z-20 on
       * FavoriteButton keeps the button clickable on top of it. Plain
       * `group-focus-visible:` can't see this anchor's focus state because
       * it's a sibling, not the group's own state — `has-[]` on the card
       * above does the equivalent job so keyboard focus gets the same
       * shadow affordance as mouse hover. */}
      <Link
        href={`/etkinlik/${event.id}`}
        aria-label={event.title}
        className="absolute inset-0 z-10 rounded-xl"
      />
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-muted">
        <div className="absolute right-3 top-3 z-20">
          <FavoriteButton
            eventId={event.id}
            initialFavorited={isFavorited}
            isLoggedIn={isLoggedIn}
          />
        </div>
        {event.image_url ? (
          <>
            {/* Posters — especially the Instagram-sourced ones the admin
             * imports — are usually portrait, so object-cover on this 16:9
             * box would crop exactly the band where the title and date
             * sit. Blurred-fill instead: a scaled, blurred copy of the
             * same image fills the box as a backdrop, and the real image
             * sits on top with object-contain so the whole poster stays
             * visible. A landscape image just fills the box on its own —
             * the backdrop never shows through — so this degrades
             * correctly for the scraper sources' banner images. */}
            {/* Using a plain img keeps this component free of
             * next.config.ts remote-image-domain configuration, which is
             * owned elsewhere. Both tags below point at the same URL, so
             * the browser serves the second from cache — one network
             * request, not two. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.image_url}
              alt=""
              aria-hidden="true"
              loading={loading}
              decoding="async"
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.image_url}
              alt={event.title}
              loading={loading}
              fetchPriority={priority ? "high" : undefined}
              decoding="async"
              className="relative h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-muted text-center">
            <span className="px-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {event.category?.name ?? "Etkinlik"}
            </span>
          </div>
        )}
        {event.category && (
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {event.category.name}
          </span>
        )}
        <span
          className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-sm ${
            badge.soon ? "bg-dicle text-on-dicle" : "bg-black/60 text-white"
          }`}
        >
          {badge.text}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display line-clamp-2 text-base font-semibold text-foreground">
          {event.title}
        </h3>
        <p className="text-sm font-medium text-dicle">{formatEventDateTime(event.start_at)}</p>
        {event.venue?.name && (
          <p className="line-clamp-1 text-sm text-zinc-600 dark:text-zinc-400">
            {event.venue.name}
          </p>
        )}
        <div className="mt-auto pt-2">
          <span
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
              isFree
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-surface-muted text-foreground/70"
            }`}
          >
            {formatEventPrice(event.price)}
          </span>
        </div>
      </div>
    </div>
  );
}

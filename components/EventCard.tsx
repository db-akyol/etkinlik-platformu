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
}: {
  event: EventWithRelations;
  isLoggedIn?: boolean;
  isFavorited?: boolean;
}) {
  const badge = formatEventBadge(event.start_at);
  const isFree = !event.price || event.price.trim() === "";

  return (
    <Link
      href={`/etkinlik/${event.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-zinc-900"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
        <div className="absolute right-3 top-3 z-10">
          <FavoriteButton
            eventId={event.id}
            initialFavorited={isFavorited}
            isLoggedIn={isLoggedIn}
          />
        </div>
        {event.image_url ? (
          // Using a plain img keeps this component free of next.config.ts
          // remote-image-domain configuration, which is owned elsewhere.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.image_url}
            alt={event.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-center dark:from-zinc-800 dark:to-zinc-900">
            <span className="px-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {event.category?.name ?? "Etkinlik"}
            </span>
          </div>
        )}
        {event.category && (
          <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
            {event.category.name}
          </span>
        )}
        <span
          className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-xs font-medium ${
            badge.soon ? "bg-dicle text-white" : "bg-black/70 text-white"
          }`}
        >
          {badge.text}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display line-clamp-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
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
                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {formatEventPrice(event.price)}
          </span>
        </div>
      </div>
    </Link>
  );
}

import Link from "next/link";
import FavoriteButton from "@/components/FavoriteButton";
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

/** Formats an ISO timestamp as "14 Eylül 2026, 20:00" in Turkish locale. */
export function formatEventDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart}, ${timePart}`;
}

/** Returns the display price, or "Ücretsiz" when there is none set. */
export function formatEventPrice(price: string | null): string {
  if (!price || price.trim() === "") return "Ücretsiz";
  return price;
}

export default function EventCard({
  event,
  isLoggedIn = false,
  isFavorited = false,
}: {
  event: EventWithRelations;
  isLoggedIn?: boolean;
  isFavorited?: boolean;
}) {
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
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-center">
            <span className="px-4 text-sm font-medium text-white/90">
              {event.category?.name ?? "Etkinlik"}
            </span>
          </div>
        )}
        {event.category && (
          <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
            {event.category.name}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {event.title}
        </h3>
        <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
          {formatEventDateTime(event.start_at)}
        </p>
        {event.venue?.name && (
          <p className="line-clamp-1 text-sm text-zinc-600 dark:text-zinc-400">
            {event.venue.name}
          </p>
        )}
        <div className="mt-auto pt-2">
          <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {formatEventPrice(event.price)}
          </span>
        </div>
      </div>
    </Link>
  );
}

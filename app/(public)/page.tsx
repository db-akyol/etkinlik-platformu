import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import EventCard, { type EventWithRelations } from "@/components/EventCard";
import { formatEventDateTime } from "@/lib/format-event";
import EventMap, { type MapMarker } from "@/components/EventMap";
import FilterBar from "@/components/FilterBar";
import { createClient } from "@/lib/supabase/server";
import { getDateRange } from "@/lib/event-filters";
import type { Category, City } from "@/lib/supabase/types";

// Event content here comes from the scraper cron (writes directly to
// Supabase, bypassing Next.js entirely — there's no request that could ever
// call revalidatePath for it). Without this, a fresh scrape run's data could
// sit behind Next's fetch Data Cache indefinitely (a route rendering
// dynamically due to cookies()/searchParams does NOT by itself guarantee
// the individual fetch()es inside it are uncached) — force every request to
// hit Supabase for real, current data.
export const dynamic = "force-dynamic";

// Every filtered view (?kategori=, ?tarih=, ?q=, ?gorunum=) is the same set of
// events in a different order or subset, so they all point back to the bare
// listing instead of competing with it for the same search results.
//
// Only `alternates` is set: Next merges metadata shallowly, so re-declaring
// `openGraph` here just to add a `url` would discard the image, title and
// description the root layout supplies.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Keep this in sync with EventWithRelations in components/EventCard.tsx.
const EVENT_SELECT =
  "*, venue:venues(id, name, address, lat, lng), category:categories(id, name, slug)" as const;

const DATE_FILTER_LABELS: Record<string, string> = {
  bugun: "Bugün",
  hafta: "Bu Hafta",
  ay: "Bu Ay",
};

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const kategori = typeof params.kategori === "string" ? params.kategori : undefined;
  const tarih = typeof params.tarih === "string" ? params.tarih : undefined;
  const q = typeof params.q === "string" ? params.q.trim() : undefined;
  const gorunum = params.gorunum === "harita" ? "harita" : "liste";
  const hasFilters = Boolean(kategori || tarih || q);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: activeCity, error: activeCityError },
    { data: categories, error: categoriesError },
    { data: favoriteRows, error: favoriteRowsError },
  ] = await Promise.all([
    supabase
      .from("cities")
      .select<"id, name", Pick<City, "id" | "name">>("id, name")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("categories")
      .select<"id, name, slug", Category>("id, name, slug")
      .order("name", { ascending: true }),
    user
      ? supabase
          .from("favorites")
          .select("event_id")
          .eq("user_id", user.id)
          .returns<{ event_id: string }[]>()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (activeCityError) console.error("[public/page] active city lookup failed:", activeCityError);
  if (categoriesError) console.error("[public/page] categories lookup failed:", categoriesError);
  if (favoriteRowsError) console.error("[public/page] favorites lookup failed:", favoriteRowsError);

  const favoriteEventIds = new Set((favoriteRows ?? []).map((row) => row.event_id));

  let events: EventWithRelations[] = [];
  let eventsError: { message: string } | null = null;

  if (activeCity) {
    const { gte, lt } = getDateRange(tarih);

    let query = supabase
      .from("events")
      .select<typeof EVENT_SELECT, EventWithRelations>(EVENT_SELECT)
      .eq("status", "approved")
      .eq("city_id", activeCity.id)
      .order("start_at", { ascending: true });

    query = query.gte("start_at", gte);
    if (lt) query = query.lt("start_at", lt);

    const { data, error } = await query;

    if (error) {
      console.error("[public/page] events query failed:", error);
      eventsError = error;
    } else {
      events = data ?? [];

      if (kategori) {
        events = events.filter((event) => event.category?.slug === kategori);
      }

      if (q) {
        const needle = q.toLocaleLowerCase("tr-TR");
        events = events.filter((event) =>
          [event.title, event.description, event.venue?.name]
            .filter(Boolean)
            .some((field) => field!.toLocaleLowerCase("tr-TR").includes(needle)),
        );
      }
    }
  }

  // Categories/favorites failures degrade gracefully (an empty filter list,
  // no highlighted hearts) — only a failed city or event lookup blocks the
  // page, since without either of those there is nothing real to show, and
  // rendering "no events found" over a transient PostgREST failure is
  // exactly the bug this branch exists to avoid.
  const hasError = Boolean(activeCityError) || Boolean(eventsError);
  const hasResults = events.length > 0;

  const markers: MapMarker[] = events
    .filter((event) => event.venue?.lat != null && event.venue?.lng != null)
    .map((event) => ({
      id: event.id,
      lat: event.venue!.lat!,
      lng: event.venue!.lng!,
      title: event.title,
      subtitle: `${formatEventDateTime(event.start_at)} · ${event.venue!.name}`,
      href: `/etkinlik/${event.id}`,
    }));

  // Drops only `gorunum`, keeping kategori/tarih/q — built server-side so the
  // map's "back to list" link never has to guess the current filter state.
  const listViewParams = new URLSearchParams();
  if (kategori) listViewParams.set("kategori", kategori);
  if (tarih) listViewParams.set("tarih", tarih);
  if (q) listViewParams.set("q", q);
  const listViewQuery = listViewParams.toString();
  const listViewHref = listViewQuery ? `/?${listViewQuery}` : "/";

  const categoryLabel = kategori
    ? ((categories ?? []).find((category) => category.slug === kategori)?.name ?? kategori)
    : undefined;
  const dateLabel = tarih ? (DATE_FILTER_LABELS[tarih] ?? tarih) : undefined;
  const activeFilterLabels = [
    q ? `“${q}”` : null,
    categoryLabel ?? null,
    dateLabel ?? null,
  ].filter((label): label is string => label != null);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        {/* Deliberately NOT a flex row: flex items don't wrap, so at 375px
          * the title overflowed the viewport by 12px instead of breaking
          * onto a second line. An inline-block dot keeps the same look and
          * lets the heading wrap the way text is supposed to. */}
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          <span
            className="mr-2.5 inline-block h-2.5 w-2.5 rounded-full bg-dicle align-middle"
            aria-hidden="true"
          />
          Diyarbakır <span className="text-dicle">Etkinlikleri</span>
        </h1>
        {hasResults ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-display text-base font-semibold text-foreground">
              {events.length}
            </span>{" "}
            etkinlik listeleniyor.
          </p>
        ) : (
          !hasFilters &&
          !hasError && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Şehirdeki güncel konser, tiyatro, atölye ve daha fazla etkinliği keşfedin.
            </p>
          )
        )}
      </div>

      <div className="sticky top-14 z-20 -mx-4 border-b border-line bg-background px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Suspense fallback={<div className="h-10" />}>
          <FilterBar categories={categories ?? []} />
        </Suspense>
      </div>

      {hasError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <p className="font-medium">Etkinlikler şu anda yüklenemiyor.</p>
          <p>Lütfen birazdan tekrar deneyin.</p>
        </div>
      ) : !hasResults ? (
        hasFilters ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Sonuç bulunamadı</p>
            {activeFilterLabels.length > 0 && (
              <p>Aradığınız kriterlere uygun etkinlik yok: {activeFilterLabels.join(", ")}.</p>
            )}
            <Link
              href="/"
              className="rounded-full bg-dicle px-4 py-1.5 text-sm font-medium text-on-dicle transition-colors hover:bg-dicle-dim"
            >
              Filtreleri temizle
            </Link>
          </div>
        ) : activeCity ? (
          <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Şu anda yayında olan etkinlik yok. Yeni etkinlikler eklendikçe burada görünecek.
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Etkinlikler şu anda hazırlanıyor.
          </p>
        )
      ) : gorunum === "harita" ? (
        markers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <p>Bu etkinliklerin hiçbirinin konum bilgisi yok.</p>
            <Link
              href={listViewHref}
              className="rounded-full bg-dicle px-4 py-1.5 text-sm font-medium text-on-dicle transition-colors hover:bg-dicle-dim"
            >
              Liste görünümüne dön
            </Link>
          </div>
        ) : (
          <EventMap markers={markers} className="h-[32rem] w-full rounded-xl" />
        )
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event, index) => (
            <EventCard
              key={event.id}
              event={event}
              isLoggedIn={!!user}
              isFavorited={favoriteEventIds.has(event.id)}
              // The first row is the page's LCP element, so it loads eagerly
              // while everything below stays lazy. 3 matches lg:grid-cols-3.
              priority={index < 3}
            />
          ))}
        </div>
      )}
    </div>
  );
}

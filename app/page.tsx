import { Suspense } from "react";
import EventCard, { formatEventDateTime, type EventWithRelations } from "@/components/EventCard";
import EventMap, { type MapMarker } from "@/components/EventMap";
import FilterBar from "@/components/FilterBar";
import { createClient } from "@/lib/supabase/server";
import type { Category, City } from "@/lib/supabase/types";

// Keep this in sync with EventWithRelations in components/EventCard.tsx.
const EVENT_SELECT =
  "*, venue:venues(id, name, address, lat, lng), category:categories(id, name, slug)" as const;

type SearchParams = { [key: string]: string | string[] | undefined };

/** Returns a [gte, lt) ISO range for the "tarih" quick filter, if any. */
function getDateRange(tarih?: string): { gte?: string; lt?: string } {
  if (!tarih) return {};

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const end = new Date(startOfToday);
  if (tarih === "bugun") {
    end.setDate(end.getDate() + 1);
  } else if (tarih === "hafta") {
    end.setDate(end.getDate() + 7);
  } else if (tarih === "ay") {
    end.setMonth(end.getMonth() + 1);
  } else {
    return {};
  }

  return { gte: startOfToday.toISOString(), lt: end.toISOString() };
}

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

  const supabase = await createClient();

  const [{ data: activeCity }, { data: categories }] = await Promise.all([
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
  ]);

  let events: EventWithRelations[] = [];

  if (activeCity) {
    const { gte, lt } = getDateRange(tarih);

    let query = supabase
      .from("events")
      .select<typeof EVENT_SELECT, EventWithRelations>(EVENT_SELECT)
      .eq("status", "approved")
      .eq("city_id", activeCity.id)
      .order("start_at", { ascending: true });

    if (gte) query = query.gte("start_at", gte);
    if (lt) query = query.lt("start_at", lt);

    const { data } = await query;
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Diyarbakır Etkinlikleri
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Şehirdeki güncel konser, tiyatro, atölye ve daha fazla etkinliği keşfedin.
        </p>
      </header>

      <Suspense fallback={<div className="h-10" />}>
        <FilterBar categories={categories ?? []} />
      </Suspense>

      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Bu kriterlere uygun etkinlik bulunamadı.
        </p>
      ) : gorunum === "harita" ? (
        markers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Bu etkinliklerin hiçbirinin konum bilgisi yok.
          </p>
        ) : (
          <EventMap markers={markers} className="h-[32rem] w-full rounded-xl" />
        )
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

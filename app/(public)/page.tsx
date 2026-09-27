import type { Metadata } from "next";
import Link from "next/link";
import CalendarPanel from "@/components/CalendarPanel";
import EventCard, { type EventWithRelations } from "@/components/EventCard";
import { EVENT_GRID_CLASS } from "@/components/EventCardSkeleton";
import EventMap, { type MapMarker } from "@/components/EventMap";
import { ListIcon, MapPinIcon } from "@/components/icons";
import {
  DateStrip,
  FilterChips,
  PRICE_FILTERS,
  SideFilters,
  type CategoryOption,
} from "@/components/ListingFilters";
import { groupSessions, type SessionGroup } from "@/lib/event-groups";
import {
  buildListingHref,
  calendarStartMonth,
  getUpcomingFloor,
  matchesPriceFilter,
  parseDayParam,
  type ListingParams,
} from "@/lib/event-filters";
import { formatDayLong, formatEventDateTime, istanbulDayKey, listingSection } from "@/lib/format-event";
import { istanbulTodayDateString } from "@/lib/istanbul-time";
import { createClient } from "@/lib/supabase/server";
import type { Category, City } from "@/lib/supabase/types";

// Event content here comes from the scraper cron (writes directly to
// Supabase, bypassing Next.js entirely — there's no request that could ever
// call revalidatePath for it). Without this, a fresh scrape run's data could
// sit behind Next's fetch Data Cache indefinitely (a route rendering
// dynamically due to cookies()/searchParams does NOT by itself guarantee
// the individual fetch()es inside it are uncached) — force every request to
// hit Supabase for real, current data.
export const dynamic = "force-dynamic";

// Every filtered view (?kategori=, ?gun=, ?q=, ?fiyat=, ?gorunum=) is the
// same set of events in a different order or subset, so they all point back
// to the bare listing instead of competing with it for the same search
// results.
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

type SearchParams = { [key: string]: string | string[] | undefined };

/** One card: a show, opened at the session that fits the current filters. */
type ListingItem = { group: SessionGroup<EventWithRelations>; session: EventWithRelations };

const stringParam = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const params: ListingParams = {
    q: stringParam(raw.q),
    kategori: stringParam(raw.kategori),
    gun: parseDayParam(stringParam(raw.gun)),
    fiyat: PRICE_FILTERS.some((f) => f.value && f.value === raw.fiyat) ? (raw.fiyat as string) : undefined,
    gorunum: raw.gorunum === "harita" ? "harita" : undefined,
  };
  const { q, kategori, gun, fiyat } = params;
  const hasFilters = Boolean(q || kategori || gun || fiyat);
  const todayKey = istanbulTodayDateString();

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
    // Every upcoming event, filtered below in memory: the calendar needs to
    // know which days have events even while one day is selected, and the
    // whole city is a few hundred rows at most.
    const { data, error } = await supabase
      .from("events")
      .select<typeof EVENT_SELECT, EventWithRelations>(EVENT_SELECT)
      .eq("status", "approved")
      .eq("city_id", activeCity.id)
      .gte("start_at", getUpcomingFloor(todayKey))
      .order("start_at", { ascending: true });

    if (error) {
      console.error("[public/page] events query failed:", error);
      eventsError = error;
    } else {
      events = data ?? [];
    }
  }

  // Search and price are properties of a single session, so they filter
  // before grouping. Category and day are then applied per show, each
  // leaving the other out where the UI needs it: the calendar marks days
  // within the selected category, and category counts are for the selected
  // day.
  const needle = q?.toLocaleLowerCase("tr-TR");
  const groups = groupSessions(
    events.filter(
      (event) =>
        matchesPriceFilter(event.price, fiyat) &&
        (!needle ||
          [event.title, event.description, event.venue?.name].some((field) =>
            field?.toLocaleLowerCase("tr-TR").includes(needle),
          )),
    ),
  );
  const inCategory = (group: SessionGroup<EventWithRelations>) =>
    !kategori || group.sessions[0].category?.slug === kategori;
  const sessionOnDay = (group: SessionGroup<EventWithRelations>) =>
    gun ? group.sessions.find((session) => istanbulDayKey(session.start_at) === gun) : group.sessions[0];

  const eventDays = [
    ...new Set(
      groups.filter(inCategory).flatMap((group) => group.sessions.map((s) => istanbulDayKey(s.start_at))),
    ),
  ].sort();

  const groupsOnDay = groups.filter((group) => sessionOnDay(group));
  const categoryOptions: CategoryOption[] = (categories ?? []).map((category) => ({
    ...category,
    count: groupsOnDay.filter((group) => group.sessions[0].category?.slug === category.slug).length,
  }));

  const items: ListingItem[] = groupsOnDay
    .filter(inCategory)
    .map((group) => ({ group, session: sessionOnDay(group)! }))
    .sort((a, b) => a.session.start_at.localeCompare(b.session.start_at));

  // Items are already in start order, so sections come out in order too.
  const sections = new Map<string, { title: string; detail: string; items: ListingItem[] }>();
  for (const item of items) {
    const section = listingSection(istanbulDayKey(item.session.start_at), todayKey);
    const existing = sections.get(section.key);
    if (existing) existing.items.push(item);
    else sections.set(section.key, { title: section.title, detail: section.detail, items: [item] });
  }

  // Categories/favorites failures degrade gracefully (an empty filter list,
  // no highlighted hearts) — only a failed city or event lookup blocks the
  // page, since without either of those there is nothing real to show, and
  // rendering "no events found" over a transient PostgREST failure is
  // exactly the bug this branch exists to avoid.
  const hasError = Boolean(activeCityError) || Boolean(eventsError);
  const isMap = params.gorunum === "harita";

  const markers: MapMarker[] = items
    .filter(({ session }) => session.venue?.lat != null && session.venue?.lng != null)
    .map(({ session }) => ({
      id: session.id,
      lat: session.venue!.lat!,
      lng: session.venue!.lng!,
      title: session.title,
      subtitle: `${formatEventDateTime(session.start_at)} · ${session.venue!.name}`,
      href: `/etkinlik/${session.id}`,
    }));

  const clearHref = buildListingHref({ gorunum: params.gorunum });
  let cardIndex = 0;
  const renderCard = ({ group, session }: ListingItem, dateShownAbove: boolean) => (
    <EventCard
      key={session.id}
      event={session}
      sessionCount={group.sessions.length}
      dateShownAbove={dateShownAbove}
      isLoggedIn={!!user}
      isFavorited={favoriteEventIds.has(session.id)}
      // The first row is the page's LCP element, so it loads eagerly while
      // everything below stays lazy.
      priority={cardIndex++ < 4}
    />
  );

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">
      <div className="md:grid md:grid-cols-[16.5rem_minmax(0,1fr)] md:gap-10 md:py-8 lg:gap-12">
        <aside
          aria-label="Filtreler"
          className="hidden md:sticky md:top-24 md:flex md:max-h-[calc(100vh-7rem)] md:flex-col md:gap-7 md:self-start md:overflow-y-auto"
        >
          <CalendarPanel
            key={calendarStartMonth(eventDays, todayKey, gun)}
            eventDays={eventDays}
            todayKey={todayKey}
            params={params}
          />
          <SideFilters categories={categoryOptions} totalCount={groupsOnDay.length} params={params} />
        </aside>

        <div className="min-w-0 pb-10">
          <DateStrip todayKey={todayKey} eventDays={eventDays} params={params} />
          <FilterChips categories={categoryOptions} totalCount={groupsOnDay.length} params={params} />

          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 pt-2 md:pt-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-balance md:text-3xl">
                {gun ? formatDayLong(gun) : "Yaklaşan etkinlikler"}
              </h1>
              {!hasError && (
                <p className="text-sm text-muted tabular-nums">{items.length} etkinlik</p>
              )}
              {hasFilters && (
                <Link
                  href={clearHref}
                  scroll={false}
                  className="rounded-full bg-surface-muted px-3 py-1 text-[13px] font-semibold transition-colors hover:bg-line-strong"
                >
                  Filtreleri temizle
                </Link>
              )}
            </div>
            {/* Desktop only: on phones the tab bar's Keşfet/Harita do this. */}
            <nav
              aria-label="Görünüm"
              className="ml-auto hidden shrink-0 rounded-full border border-line bg-surface p-0.5 text-sm font-semibold md:flex"
            >
              <Link
                href={buildListingHref(params, { gorunum: undefined })}
                scroll={false}
                aria-current={!isMap ? "page" : undefined}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted aria-[current=page]:bg-dicle aria-[current=page]:text-on-dicle"
              >
                <ListIcon size={16} />
                Liste
              </Link>
              <Link
                href={buildListingHref(params, { gorunum: "harita" })}
                scroll={false}
                aria-current={isMap ? "page" : undefined}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted aria-[current=page]:bg-dicle aria-[current=page]:text-on-dicle"
              >
                <MapPinIcon size={16} />
                Harita
              </Link>
            </nav>
          </div>

          {hasError ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
            >
              <p className="font-semibold">Etkinlikler şu anda yüklenemiyor.</p>
              <p>Lütfen birazdan tekrar deneyin.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center text-sm text-muted">
              {hasFilters ? (
                <>
                  <p className="font-semibold text-foreground">Bu seçime uyan etkinlik yok.</p>
                  <p>Başka bir gün ya da kategori seçin veya filtreleri temizleyin.</p>
                  <Link
                    href={clearHref}
                    className="mt-1 rounded-full bg-dicle px-4 py-2 font-semibold text-on-dicle transition-colors hover:bg-dicle-dim"
                  >
                    Filtreleri temizle
                  </Link>
                </>
              ) : activeCity ? (
                <p>Şu anda yayında olan etkinlik yok. Yeni etkinlikler eklendikçe burada görünecek.</p>
              ) : (
                <p>Etkinlikler şu anda hazırlanıyor.</p>
              )}
            </div>
          ) : isMap ? (
            markers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center text-sm text-muted">
                <p>Bu etkinliklerin hiçbirinin konum bilgisi yok.</p>
                <Link
                  href={buildListingHref(params, { gorunum: undefined })}
                  className="rounded-full bg-dicle px-4 py-2 font-semibold text-on-dicle transition-colors hover:bg-dicle-dim"
                >
                  Liste görünümüne dön
                </Link>
              </div>
            ) : (
              <EventMap markers={markers} className="h-[32rem] w-full rounded-2xl md:h-[calc(100vh-12rem)]" />
            )
          ) : gun ? (
            // One day selected: the page heading already names it.
            <div className={EVENT_GRID_CLASS}>{items.map((item) => renderCard(item, true))}</div>
          ) : (
            <div className="flex flex-col gap-10">
              {[...sections.entries()].map(([key, section]) => (
                <section key={key} aria-labelledby={`bolum-${key}`} className="flex flex-col gap-4">
                  <h2 id={`bolum-${key}`} className="flex items-baseline gap-2.5 border-b border-line pb-2.5">
                    <span className="font-display text-xl font-extrabold tracking-tight">{section.title}</span>
                    {section.detail && <span className="text-sm text-muted">{section.detail}</span>}
                    <span className="ml-auto text-[13px] text-muted tabular-nums">
                      {section.items.length} etkinlik
                    </span>
                  </h2>
                  <div className={EVENT_GRID_CLASS}>
                    {/* Today's and tomorrow's headings name the day; the
                     * wider sections leave the date on each card. */}
                    {section.items.map((item) => renderCard(item, key === "bugun" || key === "yarin"))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

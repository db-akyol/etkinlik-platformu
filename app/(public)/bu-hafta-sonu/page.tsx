import type { Metadata } from "next";
import Link from "next/link";
import EventCard, { type EventWithRelations } from "@/components/EventCard";
import { EVENT_GRID_CLASS } from "@/components/EventCardSkeleton";
import { ChevronLeftIcon } from "@/components/icons";
import { addCalendarDays, getUpcomingFloor, weekendRange } from "@/lib/event-filters";
import { groupSessions } from "@/lib/event-groups";
import { formatDayHeading, formatDayRange, istanbulDayKey } from "@/lib/format-event";
import { istanbulTodayDateString } from "@/lib/istanbul-time";
import { createClient } from "@/lib/supabase/server";
import type { City } from "@/lib/supabase/types";

// "This weekend" moves every week and the scraper writes straight to
// Supabase, so every request reads current data.
export const dynamic = "force-dynamic";

// Keep this in sync with EventWithRelations in components/EventCard.tsx.
const EVENT_SELECT =
  "*, venue:venues(id, name, address, lat, lng), category:categories(id, name, slug)" as const;

function weekendLabel(): string {
  const { from, to } = weekendRange(istanbulTodayDateString());
  return formatDayRange(from, to);
}

/**
 * A page for "diyarbakır bu hafta sonu" searches, and a link worth sharing
 * every Friday. The title carries the dates so a shared link previews as
 * "… (24 – 26 Ekim)" rather than a stale-looking generic title.
 */
export async function generateMetadata(): Promise<Metadata> {
  const label = weekendLabel();
  const title = `Diyarbakır'da Bu Hafta Sonu Ne Var? (${label})`;
  const description = `Diyarbakır'da bu hafta sonu (${label}) konser, tiyatro ve diğer etkinlikler: tarih, mekân, fiyat ve bilet bağlantılarıyla.`;
  return {
    title,
    description,
    alternates: { canonical: "/bu-hafta-sonu" },
    // Repeated in full: Next merges metadata shallowly.
    openGraph: {
      type: "website",
      locale: "tr_TR",
      siteName: "Diyarbakır Etkinlik",
      url: "/bu-hafta-sonu",
      title,
      description,
      images: [{ url: "/og-default.png", width: 1200, height: 630, alt: "Diyarbakır Etkinlik" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og-default.png"] },
  };
}

export default async function WeekendPage() {
  const todayKey = istanbulTodayDateString();
  const { from, to } = weekendRange(todayKey);
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { data: activeCity, error: cityError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("cities")
      .select<"id, name", Pick<City, "id" | "name">>("id, name")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);
  if (cityError) console.error("[bu-hafta-sonu] active city lookup failed:", cityError);

  let events: EventWithRelations[] = [];
  let eventsError: unknown = null;
  if (activeCity) {
    const { data, error } = await supabase
      .from("events")
      .select<typeof EVENT_SELECT, EventWithRelations>(EVENT_SELECT)
      .eq("status", "approved")
      .eq("city_id", activeCity.id)
      .gte("start_at", getUpcomingFloor(from))
      .lt("start_at", getUpcomingFloor(addCalendarDays(to, 1)))
      .order("start_at", { ascending: true });
    if (error) console.error("[bu-hafta-sonu] events query failed:", error);
    eventsError = error;
    events = data ?? [];
  }

  let favoriteIds = new Set<string>();
  if (user && events.length > 0) {
    const { data } = await supabase
      .from("favorites")
      .select("event_id")
      .eq("user_id", user.id)
      .returns<{ event_id: string }[]>();
    favoriteIds = new Set((data ?? []).map((row) => row.event_id));
  }

  // One card per show per day; the badge counts the show's sessions across
  // the whole weekend.
  const groups = groupSessions(events);
  const days: { key: string; cards: { session: EventWithRelations; sessionCount: number }[] }[] = [];
  for (let key = from; key <= to; key = addCalendarDays(key, 1)) {
    const cards = groups.flatMap((group) => {
      const session = group.sessions.find((s) => istanbulDayKey(s.start_at) === key);
      return session ? [{ session, sessionCount: group.sessions.length }] : [];
    });
    if (cards.length > 0) days.push({ key, cards: cards.sort((a, b) => a.session.start_at.localeCompare(b.session.start_at)) });
  }
  const showCount = groups.length;
  const hasError = Boolean(cityError) || Boolean(eventsError);
  let cardIndex = 0;

  return (
    <div className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-10 sm:px-6 lg:px-8 2xl:max-w-[104rem]">
      <div className="flex flex-col gap-2 py-5 md:py-8">
        <Link
          href="/"
          className="-ml-1 inline-flex items-center gap-1 self-start text-sm font-semibold text-muted transition-colors hover:text-foreground"
        >
          <ChevronLeftIcon size={18} />
          Tüm etkinlikler
        </Link>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance md:text-4xl">
          Bu hafta sonu Diyarbakır&apos;da ne var?
        </h1>
        <p className="text-sm text-muted">
          <span className="font-semibold text-foreground">{formatDayRange(from, to)}</span>
          {!hasError && <> · {showCount} etkinlik</>}
        </p>
        <p className="max-w-2xl text-sm text-muted">
          Cuma, cumartesi ve pazar günü Diyarbakır&apos;daki konserler, tiyatro oyunları ve diğer etkinlikler.
          Liste günde iki kez güncellenir.
        </p>
      </div>

      {hasError ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <p className="font-semibold">Etkinlikler şu anda yüklenemiyor.</p>
          <p>Lütfen birazdan tekrar deneyin.</p>
        </div>
      ) : days.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center text-sm text-muted">
          <p>Bu hafta sonu için henüz bir etkinlik yok. Yeni etkinlikler eklendikçe burada görünecek.</p>
          <Link
            href="/"
            className="mt-1 rounded-full bg-dicle px-4 py-2 font-semibold text-on-dicle transition-colors hover:bg-dicle-dim"
          >
            Yaklaşan tüm etkinliklere bak
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {days.map(({ key, cards }) => {
            const heading = formatDayHeading(key, todayKey);
            return (
              <section key={key} aria-labelledby={`gun-${key}`} className="flex flex-col gap-4">
                <h2 id={`gun-${key}`} className="flex items-baseline gap-2.5 border-b border-line pb-2.5">
                  <span className="font-display text-xl font-extrabold tracking-tight">{heading.title}</span>
                  <span className="text-sm text-muted">{heading.detail}</span>
                  <span className="ml-auto text-[13px] text-muted tabular-nums">{cards.length} etkinlik</span>
                </h2>
                <div className={EVENT_GRID_CLASS}>
                  {cards.map(({ session, sessionCount }) => (
                    <EventCard
                      key={session.id}
                      event={session}
                      sessionCount={sessionCount}
                      dateShownAbove
                      isLoggedIn={!!user}
                      isFavorited={favoriteIds.has(session.id)}
                      priority={cardIndex++ < 4}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import EventCard, { type EventWithRelations } from "@/components/EventCard";
import { EVENT_GRID_CLASS } from "@/components/EventCardSkeleton";
import { createClient } from "@/lib/supabase/server";

// See app/(public)/page.tsx's matching comment — favorited events' content
// can change via the scraper cron, which never calls revalidatePath.
export const dynamic = "force-dynamic";

// Keep the embedded event shape in sync with EventWithRelations.
const FAVORITE_SELECT =
  "event:events(*, venue:venues(id, name, address, lat, lng), category:categories(id, name, slug))" as const;

export default async function FavorilerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris?next=/favoriler");
  }

  const { data, error } = await supabase
    .from("favorites")
    .select(FAVORITE_SELECT)
    .eq("user_id", user.id)
    .returns<{ event: EventWithRelations | null }[]>();

  if (error) console.error("[favoriler] favorites lookup failed:", error);

  // Soonest first. Past sessions stay listed (they are still the visitor's
  // favorites) but after the upcoming ones.
  const now = new Date().toISOString();
  const events = (data ?? [])
    .map((row) => row.event)
    .filter((event): event is EventWithRelations => event != null && event.status === "approved")
    .sort((a, b) => {
      const aPast = a.start_at < now;
      const bPast = b.start_at < now;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aPast ? b.start_at.localeCompare(a.start_at) : a.start_at.localeCompare(b.start_at);
    });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">Favorilerim</h1>
        <p className="text-sm text-muted">Favorilere eklediğin etkinlikler burada listelenir.</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <p className="font-semibold">Favorilerin şu anda yüklenemiyor.</p>
          <p>Lütfen birazdan tekrar deneyin.</p>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center text-sm text-muted">
          <p className="font-semibold text-foreground">Henüz favori eklemedin.</p>
          <p>Bir etkinliği favorilemek için kartındaki kalp simgesine dokun.</p>
          <Link
            href="/"
            className="mt-1 rounded-full bg-dicle px-4 py-2 font-semibold text-on-dicle transition-colors hover:bg-dicle-dim"
          >
            Etkinliklere göz at
          </Link>
        </div>
      ) : (
        <div className={EVENT_GRID_CLASS}>
          {events.map((event, index) => (
            <EventCard key={event.id} event={event} isLoggedIn isFavorited priority={index < 4} />
          ))}
        </div>
      )}
    </div>
  );
}

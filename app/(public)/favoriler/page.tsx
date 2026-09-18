import { redirect } from "next/navigation";
import Link from "next/link";
import EventCard, { type EventWithRelations } from "@/components/EventCard";
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

  const events = (data ?? [])
    .map((row) => row.event)
    .filter((event): event is EventWithRelations => event != null && event.status === "approved");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Favorilerim
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Favorilere eklediğin etkinlikler burada listelenir.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <p className="font-medium">Favorilerin şu anda yüklenemiyor.</p>
          <p>Lütfen birazdan tekrar deneyin.</p>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          <p>Henüz favori eklemedin.</p>
          <p>Bir etkinliği favorilemek için kartındaki kalp simgesine dokun.</p>
          <Link
            href="/"
            className="rounded-full bg-dicle px-4 py-1.5 text-sm font-medium text-on-dicle transition-colors hover:bg-dicle-dim"
          >
            Etkinliklere göz at
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event, index) => (
            <EventCard
              key={event.id}
              event={event}
              isLoggedIn
              isFavorited
              priority={index < 3}
            />
          ))}
        </div>
      )}
    </div>
  );
}

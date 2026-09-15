import { redirect } from "next/navigation";
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

  const { data } = await supabase
    .from("favorites")
    .select(FAVORITE_SELECT)
    .eq("user_id", user.id)
    .returns<{ event: EventWithRelations | null }[]>();

  const events = (data ?? [])
    .map((row) => row.event)
    .filter((event): event is EventWithRelations => event != null && event.status === "approved");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Favorilerim
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Favorilere eklediğin etkinlikler burada listelenir.
        </p>
      </header>

      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Henüz favori eklemedin.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} isLoggedIn isFavorited />
          ))}
        </div>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { utcIsoToIstanbulLocal } from "@/lib/istanbul-time";
import type { Category, EventRow, Venue } from "@/lib/supabase/types";
import { updateEvent } from "../../../actions";
import { EventFormFields } from "@/components/admin/EventFormFields";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: events }, { data: venues }, { data: categories }] =
    await Promise.all([
      supabase.from("events").select("*").eq("id", id).returns<EventRow[]>(),
      supabase.from("venues").select("*").order("name").returns<Venue[]>(),
      supabase
        .from("categories")
        .select("*")
        .order("name")
        .returns<Category[]>(),
    ]);

  const event = events?.[0];

  if (!event) {
    notFound();
  }

  const updateEventWithId = updateEvent.bind(null, event.id);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">Etkinliği Düzenle</h1>

      <form action={updateEventWithId} className="flex max-w-xl flex-col gap-4">
        <EventFormFields
          venues={venues ?? []}
          categories={categories ?? []}
          defaults={{
            title: event.title,
            description: event.description ?? "",
            start_at: utcIsoToIstanbulLocal(event.start_at),
            end_at: utcIsoToIstanbulLocal(event.end_at),
            venue_id: event.venue_id ?? "",
            category_id: event.category_id ?? "",
            price: event.price ?? "",
            image_url: event.image_url ?? "",
          }}
        />

        <button
          type="submit"
          className="mt-2 w-fit rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Güncelle
        </button>
      </form>
    </div>
  );
}

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { utcIsoToIstanbulLocal } from "@/lib/istanbul-time";
import type { Category, EventRow, Venue } from "@/lib/supabase/types";
import { updateEvent } from "../../../actions";

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
        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm font-medium">
            Başlık
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            defaultValue={event.title}
            className="rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm font-medium">
            Açıklama
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={event.description ?? ""}
            className="rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="start_at" className="text-sm font-medium">
            Başlangıç Tarihi
          </label>
          <input
            id="start_at"
            name="start_at"
            type="datetime-local"
            required
            defaultValue={utcIsoToIstanbulLocal(event.start_at)}
            className="rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="end_at" className="text-sm font-medium">
            Bitiş Tarihi (opsiyonel)
          </label>
          <input
            id="end_at"
            name="end_at"
            type="datetime-local"
            defaultValue={utcIsoToIstanbulLocal(event.end_at)}
            className="rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="venue_id" className="text-sm font-medium">
            Mekan
          </label>
          <select
            id="venue_id"
            name="venue_id"
            required
            defaultValue={event.venue_id ?? ""}
            className="rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
          >
            {(venues ?? []).map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="category_id" className="text-sm font-medium">
            Kategori
          </label>
          <select
            id="category_id"
            name="category_id"
            defaultValue={event.category_id ?? ""}
            className="rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
          >
            <option value="">Seçiniz</option>
            {(categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="price" className="text-sm font-medium">
            Fiyat (opsiyonel)
          </label>
          <input
            id="price"
            name="price"
            type="text"
            defaultValue={event.price ?? ""}
            placeholder="Örn: Ücretsiz, 150 TL"
            className="rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="image_url" className="text-sm font-medium">
            Görsel URL (opsiyonel)
          </label>
          <input
            id="image_url"
            name="image_url"
            type="text"
            defaultValue={event.image_url ?? ""}
            className="rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
          />
        </div>

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

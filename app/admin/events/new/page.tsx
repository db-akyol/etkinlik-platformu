import { createClient } from "@/lib/supabase/server";
import type { Category, Venue } from "@/lib/supabase/types";
import { createEvent } from "../../actions";

export default async function NewEventPage() {
  const supabase = await createClient();

  const [{ data: venues }, { data: categories }] = await Promise.all([
    supabase.from("venues").select("*").order("name").returns<Venue[]>(),
    supabase.from("categories").select("*").order("name").returns<Category[]>(),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">Yeni Etkinlik Ekle</h1>

      <form
        action={createEvent}
        className="flex max-w-xl flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm font-medium">
            Başlık
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
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
            className="rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
          />
        </div>

        <button
          type="submit"
          className="mt-2 w-fit rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Kaydet
        </button>
      </form>
    </div>
  );
}

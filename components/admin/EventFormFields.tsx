import type { Category, Venue } from "@/lib/supabase/types";

export interface EventFormDefaults {
  title?: string;
  description?: string;
  start_at?: string;
  end_at?: string;
  venue_id?: string;
  category_id?: string;
  price?: string;
  image_url?: string;
}

const FIELD_CLASS =
  "rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm focus:border-black/40 dark:border-white/20 dark:focus:border-white/40";

export function EventFormFields({
  venues,
  categories,
  defaults = {},
  venueRequired = true,
}: {
  venues: Venue[];
  categories: Category[];
  defaults?: EventFormDefaults;
  venueRequired?: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm font-medium">
          Başlık
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={defaults.title ?? ""}
          className={FIELD_CLASS}
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
          defaultValue={defaults.description ?? ""}
          className={FIELD_CLASS}
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
          defaultValue={defaults.start_at ?? ""}
          className={FIELD_CLASS}
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
          defaultValue={defaults.end_at ?? ""}
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="venue_id" className="text-sm font-medium">
          Mekan
        </label>
        <select
          id="venue_id"
          name="venue_id"
          required={venueRequired}
          defaultValue={defaults.venue_id ?? ""}
          className={FIELD_CLASS}
        >
          {!venueRequired && <option value="">Seçiniz (ya da aşağıya yeni mekan adı yaz)</option>}
          {venues.map((venue) => (
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
          defaultValue={defaults.category_id ?? ""}
          className={FIELD_CLASS}
        >
          <option value="">Seçiniz</option>
          {categories.map((category) => (
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
          defaultValue={defaults.price ?? ""}
          className={FIELD_CLASS}
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
          defaultValue={defaults.image_url ?? ""}
          className={FIELD_CLASS}
        />
      </div>
    </>
  );
}

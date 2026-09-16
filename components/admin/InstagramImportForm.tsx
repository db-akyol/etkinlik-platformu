// components/admin/InstagramImportForm.tsx
"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Category, Venue } from "@/lib/supabase/types";
import {
  createEventFromInstagram,
  extractFromInstagram,
  type CreateEventState,
  type ExtractState,
} from "@/app/admin/instagram-actions";
import { EventFormFields } from "./EventFormFields";

const INITIAL_STATE: ExtractState = { status: "idle" };
const INITIAL_CREATE_STATE: CreateEventState = { status: "idle" };

const FIELD_CLASS =
  "rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40";

export function InstagramImportForm({
  venues,
  categories,
}: {
  venues: Venue[];
  categories: Category[];
}) {
  const [state, formAction, isPending] = useActionState(extractFromInstagram, INITIAL_STATE);
  const [createState, createFormAction, isCreatePending] = useActionState(
    createEventFromInstagram,
    INITIAL_CREATE_STATE,
  );
  const router = useRouter();

  useEffect(() => {
    if (createState.status === "success") {
      router.push(`/admin/events/${createState.eventId}/edit`);
    }
  }, [createState, router]);

  return (
    <div className="flex flex-col gap-8">
      <form action={formAction} className="flex max-w-xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="caption" className="text-sm font-medium">
            Post Metni (Caption)
          </label>
          <textarea id="caption" name="caption" rows={6} required className={FIELD_CLASS} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="image" className="text-sm font-medium">
            Poster Görseli
          </label>
          <input
            id="image"
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            required
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="source_url" className="text-sm font-medium">
            Post Linki (opsiyonel, sadece kaynak referansı için — hiçbir zaman otomatik açılmaz)
          </label>
          <input id="source_url" name="source_url" type="text" className={FIELD_CLASS} />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 w-fit rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {isPending ? "Çıkarılıyor..." : "Bilgileri Çıkar"}
        </button>
      </form>

      {state.status === "error" && (
        <p className="max-w-xl text-sm text-red-600 dark:text-red-400">{state.message}</p>
      )}

      {state.status === "extracted" && (
        <form
          action={createFormAction}
          className="flex max-w-xl flex-col gap-4 border-t border-black/10 pt-6 dark:border-white/10"
        >
          <p className="text-sm opacity-70">
            Aşağıdaki alanlar otomatik dolduruldu — yayınlamadan önce her birini kontrol et.
          </p>

          <input type="hidden" name="source_url" value={state.sourceUrl ?? ""} />

          <div className="flex flex-col gap-1">
            <label htmlFor="venue_name" className="text-sm font-medium">
              Mekan adı (listede yoksa yeni mekan olarak eklenir)
            </label>
            <input
              id="venue_name"
              name="venue_name"
              type="text"
              defaultValue={state.fields.venue_name ?? ""}
              placeholder="Yukarıdaki listeden bir mekan seçtiysen boş bırak"
              className={FIELD_CLASS}
            />
          </div>

          <EventFormFields
            venues={venues}
            categories={categories}
            venueRequired={false}
            defaults={{
              title: state.fields.title ?? "",
              description: state.fields.description ?? "",
              start_at: state.fields.start_at ?? "",
              end_at: state.fields.end_at ?? "",
              price: state.fields.price ?? "",
              image_url: state.imageUrl,
            }}
          />

          {createState.status === "error" && (
            <p className="text-sm text-red-600 dark:text-red-400">{createState.message}</p>
          )}

          <button
            type="submit"
            disabled={isCreatePending}
            className="mt-2 w-fit rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {isCreatePending ? "Kaydediliyor..." : "Onayla ve Kaydet"}
          </button>
        </form>
      )}
    </div>
  );
}

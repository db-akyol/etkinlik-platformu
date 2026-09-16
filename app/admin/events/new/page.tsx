import { createClient } from "@/lib/supabase/server";
import type { Category, Venue } from "@/lib/supabase/types";
import { createEvent } from "../../actions";
import { EventFormFields } from "@/components/admin/EventFormFields";

export default async function NewEventPage() {
  const supabase = await createClient();

  const [{ data: venues }, { data: categories }] = await Promise.all([
    supabase.from("venues").select("*").order("name").returns<Venue[]>(),
    supabase.from("categories").select("*").order("name").returns<Category[]>(),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">Yeni Etkinlik Ekle</h1>

      <form action={createEvent} className="flex max-w-xl flex-col gap-4">
        <EventFormFields venues={venues ?? []} categories={categories ?? []} />

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

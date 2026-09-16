import { createClient } from "@/lib/supabase/server";
import type { Category, Venue } from "@/lib/supabase/types";
import { InstagramImportForm } from "@/components/admin/InstagramImportForm";

export default async function InstagramImportPage() {
  const supabase = await createClient();

  const [{ data: venues }, { data: categories }] = await Promise.all([
    supabase.from("venues").select("*").order("name").returns<Venue[]>(),
    supabase.from("categories").select("*").order("name").returns<Category[]>(),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">Instagram&apos;dan Etkinlik Ekle</h1>
      <p className="max-w-xl text-sm opacity-70">
        Post metnini yapıştır, poster görselini yükle. Sunucu Instagram&apos;a hiçbir istek
        atmaz — her şeyi burada sen manuel giriyorsun. Kaydedilen etkinlik doğrudan yayına
        girmez, &ldquo;Onay bekleyen&rdquo; kuyruğuna düşer.
      </p>

      <InstagramImportForm venues={venues ?? []} categories={categories ?? []} />
    </div>
  );
}

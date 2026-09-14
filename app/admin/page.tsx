import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { EventRow } from "@/lib/supabase/types";
import { approveEvent, rejectEvent } from "./actions";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const { data: pendingEvents, error } = await supabase
    .from("events")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<EventRow[]>();

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Onay Bekleyen Etkinlikler</h1>
        <Link
          href="/admin/events/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Yeni Etkinlik Ekle
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Etkinlikler yüklenemedi: {error.message}
        </p>
      )}

      {!error && (!pendingEvents || pendingEvents.length === 0) && (
        <p className="text-sm opacity-70">Onay bekleyen etkinlik yok.</p>
      )}

      {pendingEvents && pendingEvents.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left dark:border-white/10">
                <th className="py-2 pr-4 font-medium">Başlık</th>
                <th className="py-2 pr-4 font-medium">Tarih</th>
                <th className="py-2 pr-4 font-medium">Kaynak</th>
                <th className="py-2 pr-4 font-medium">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {pendingEvents.map((event) => (
                <tr
                  key={event.id}
                  className="border-b border-black/5 align-top dark:border-white/5"
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/events/${event.id}/edit`}
                      className="underline underline-offset-2 hover:opacity-70"
                    >
                      {event.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {formatDate(event.start_at)}
                  </td>
                  <td className="py-2 pr-4 max-w-xs truncate">
                    {event.source_url ? (
                      <a
                        href={event.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:opacity-70"
                      >
                        {event.source_url}
                      </a>
                    ) : (
                      <span className="opacity-50">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <form action={approveEvent.bind(null, event.id)}>
                        <button
                          type="submit"
                          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                          Onayla
                        </button>
                      </form>
                      <form action={rejectEvent.bind(null, event.id)}>
                        <button
                          type="submit"
                          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                        >
                          Reddet
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

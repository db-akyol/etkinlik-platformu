import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatEventDateTime } from "@/lib/format-event";
import type { EventRow, Venue } from "@/lib/supabase/types";
import { approveEvent, rejectEvent } from "./actions";

// Same reason as the public pages: the scraper cron writes straight to
// Supabase and never calls revalidatePath, so without this the admin list
// can sit behind Next's fetch Data Cache showing a stale set of events.
export const dynamic = "force-dynamic";

// Enough to cover every upcoming event several times over (~120 today) while
// still bounding the query. If the listing ever reaches this, it needs real
// pagination rather than a bigger number.
const LIMIT = 300;

type EventWithVenue = EventRow & { venue: Pick<Venue, "name"> | null };

const STATUS_FILTERS = [
  { key: "hepsi", label: "Tümü" },
  { key: "approved", label: "Yayında" },
  { key: "pending", label: "Onay bekleyen" },
  { key: "rejected", label: "Reddedilen" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  approved: "Yayında",
  pending: "Onay bekliyor",
  rejected: "Reddedildi",
};

const STATUS_CLASSES: Record<string, string> = {
  approved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const durum = typeof params.durum === "string" ? params.durum : "hepsi";
  const gecmis = params.gecmis === "1";

  const supabase = await createClient();

  let query = supabase
    .from("events")
    .select("*, venue:venues(name)")
    .order("start_at", { ascending: true })
    .limit(LIMIT);

  if (durum !== "hepsi") {
    query = query.eq("status", durum);
  }
  if (!gecmis) {
    // Past events are the bulk of the table once the site has been running a
    // while, and they're almost never what an admin came here to change.
    query = query.gte("start_at", new Date().toISOString());
  }

  const { data: events, error } = await query.returns<EventWithVenue[]>();

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Etkinlikler</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/etkinlik/instagramdan-ekle"
            className="rounded-md border border-black/20 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Instagram&apos;dan Ekle
          </Link>
          <Link
            href="/admin/events/new"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Yeni Etkinlik Ekle
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {STATUS_FILTERS.map((filter) => {
          const href = `/admin?durum=${filter.key}${gecmis ? "&gecmis=1" : ""}`;
          const active = durum === filter.key;
          return (
            <Link
              key={filter.key}
              href={href}
              className={
                active
                  ? "rounded-full bg-black px-3 py-1 font-medium text-white dark:bg-white dark:text-black"
                  : "rounded-full border border-black/15 px-3 py-1 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              }
            >
              {filter.label}
            </Link>
          );
        })}

        <Link
          href={`/admin?durum=${durum}${gecmis ? "" : "&gecmis=1"}`}
          className="ml-auto text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
        >
          {gecmis ? "Geçmiş etkinlikleri gizle" : "Geçmiş etkinlikleri de göster"}
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Etkinlikler yüklenemedi: {error.message}
        </p>
      )}

      {!error && (!events || events.length === 0) && (
        <p className="text-sm opacity-70">Bu filtreye uyan etkinlik yok.</p>
      )}

      {events && events.length > 0 && (
        <>
          <p className="text-xs opacity-60">
            {events.length} etkinlik gösteriliyor
            {events.length === LIMIT ? ` (ilk ${LIMIT} kayıt)` : ""}.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left dark:border-white/10">
                  <th className="py-2 pr-4 font-medium">Başlık</th>
                  <th className="py-2 pr-4 font-medium">Tarih</th>
                  <th className="py-2 pr-4 font-medium">Mekan</th>
                  <th className="py-2 pr-4 font-medium">Durum</th>
                  <th className="py-2 pr-4 font-medium">Kaynak</th>
                  <th className="py-2 pr-4 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
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
                      {formatEventDateTime(event.start_at)}
                    </td>
                    <td className="max-w-[12rem] truncate py-2 pr-4">
                      {event.venue?.name ?? <span className="opacity-50">—</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_CLASSES[event.status] ?? ""
                        }`}
                      >
                        {STATUS_LABELS[event.status] ?? event.status}
                      </span>
                    </td>
                    <td className="max-w-[14rem] truncate py-2 pr-4">
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
                        <span className="opacity-50">Manuel</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/events/${event.id}/edit`}
                          className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                        >
                          Düzenle
                        </Link>

                        {event.status !== "approved" && (
                          <form action={approveEvent.bind(null, event.id)}>
                            <button
                              type="submit"
                              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                            >
                              Yayınla
                            </button>
                          </form>
                        )}

                        {event.status !== "rejected" && (
                          <form action={rejectEvent.bind(null, event.id)}>
                            <button
                              type="submit"
                              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                            >
                              Kaldır
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="max-w-prose text-xs opacity-60">
        Scraper ile gelen etkinlikler doğrudan yayına girer. Bir etkinliği
        &ldquo;Kaldır&rdquo; ile yayından çektiğinizde, sonraki scrape
        çalıştırmaları içeriğini güncellemeye devam eder ama onu tekrar
        yayına almaz — kararınız korunur.
      </p>
    </div>
  );
}

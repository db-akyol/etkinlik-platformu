import Link from "next/link";
import { ExternalIcon } from "@/components/icons";
import MatchCountdown from "@/components/MatchCountdown";
import { PASSO_URL, TFF_MATCH_URL_PREFIX } from "@/lib/amedspor";
import { formatDayLong, formatEventTime, istanbulDayKey } from "@/lib/format-event";
import { createClient } from "@/lib/supabase/server";

type MatchRow = {
  id: string;
  title: string;
  start_at: string;
  description: string | null;
  venue: { name: string } | null;
};

/**
 * Amedspor's next home match, with a countdown and a ticket link, above the
 * listing. Renders nothing when no match is scheduled (between seasons, or
 * before TFF dates the next one). Matches come from
 * scripts/scrapers/amedspor-tff.ts.
 */
export default async function AmedsporBanner() {
  const supabase = await createClient();
  const { data: match, error } = await supabase
    .from("events")
    .select("id, title, start_at, description, venue:venues(name)")
    .eq("status", "approved")
    .like("source_url", `${TFF_MATCH_URL_PREFIX}%`)
    .gt("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(1)
    .maybeSingle<MatchRow>();

  // A nice-to-have: on failure the page just goes without it.
  if (error) console.error("[AmedsporBanner] match lookup failed:", error);
  if (!match) return null;

  const [home, away] = match.title.split(" – ");
  const tentative = match.description?.includes("kesinleşmemiş") ?? false;

  return (
    <section
      aria-label="Amedspor'un sıradaki iç saha maçı"
      className="mb-6 overflow-hidden rounded-2xl bg-linear-to-br from-dicle to-dicle-dim text-on-dicle shadow-sm"
    >
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:gap-8 md:p-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs font-semibold tracking-wide uppercase opacity-80">Amedspor · İç saha maçı</p>
          <p className="font-display text-2xl leading-tight font-extrabold tracking-tight text-balance md:text-3xl">
            {home}
            {away && (
              <>
                <span className="mx-2 opacity-60">–</span>
                {away}
              </>
            )}
          </p>
          <p className="text-sm opacity-90">
            {formatDayLong(istanbulDayKey(match.start_at))}, {formatEventTime(match.start_at)}
            {tentative && <span className="opacity-75"> (saat kesinleşmedi)</span>}
            {match.venue && <> · {match.venue.name}</>}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 md:items-end">
          <p className="text-base md:text-lg">
            <MatchCountdown startAt={match.start_at} />
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={PASSO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
            >
              Bilet al: Passo
              <ExternalIcon size={15} />
            </a>
            <Link
              href={`/etkinlik/${match.id}`}
              className="inline-flex items-center rounded-full border border-on-dicle/40 px-4 py-2 text-sm font-semibold transition-colors hover:bg-on-dicle/10"
            >
              Maç detayı
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

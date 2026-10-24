import Link from "next/link";
import { ExternalIcon } from "@/components/icons";
import MatchCountdown from "@/components/MatchCountdown";
import { PASSO_URL } from "@/lib/amedspor";
import { formatDayLong, formatEventStamp, formatEventTime, istanbulDayKey } from "@/lib/format-event";
import { createClient } from "@/lib/supabase/server";
import type { Match } from "@/lib/supabase/types";

/** A match stays in the banner this long after kick-off ("Maç başladı"). */
const SHOW_AFTER_KICKOFF_MS = 2 * 60 * 60 * 1000;

type BannerMatch = Pick<
  Match,
  "home_team" | "away_team" | "is_home" | "start_at" | "stadium" | "city" | "competition" | "tentative" | "source_url"
>;

/** "1 Kas". */
function shortDate(iso: string): string {
  const { day, month } = formatEventStamp(iso);
  return `${day} ${month}`;
}

/**
 * Amedspor's next match, home or away, above the listing: teams, date,
 * place, a live countdown, and — for home matches only — the ticket link
 * and the match's event page. Below it, the two matches after that.
 * Renders nothing when nothing is scheduled. Rows come from the `matches`
 * table, which scripts/scrapers/amedspor-tff.ts fills from tff.org.
 */
export default async function AmedsporBanner() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matches")
    .select("home_team, away_team, is_home, start_at, stadium, city, competition, tentative, source_url")
    .gt("start_at", new Date(Date.now() - SHOW_AFTER_KICKOFF_MS).toISOString())
    .order("start_at", { ascending: true })
    .limit(3)
    .returns<BannerMatch[]>();

  // A nice-to-have: on failure (or before migration 0005 is applied) the
  // page just goes without it.
  if (error) console.error("[AmedsporBanner] match lookup failed:", error);
  const [match, ...later] = data ?? [];
  if (!match) return null;

  // The home match's own event page, written by the same scraper.
  let eventId: string | null = null;
  if (match.is_home) {
    const { data: event } = await supabase
      .from("events")
      .select("id")
      .eq("status", "approved")
      .eq("source_url", match.source_url)
      .maybeSingle<{ id: string }>();
    eventId = event?.id ?? null;
  }

  const place = match.is_home
    ? match.stadium
    : [match.city, match.stadium].filter(Boolean).join(", ");

  return (
    <section
      aria-label="Amedspor'un sıradaki maçı"
      className="mb-6 overflow-hidden rounded-2xl bg-linear-to-br from-dicle to-dicle-dim text-on-dicle shadow-sm"
    >
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:gap-8 md:p-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
            Amedspor · {match.is_home ? "İç saha" : "Deplasman"}
            {match.competition && <> · {match.competition}</>}
          </p>
          <p className="font-display text-2xl leading-tight font-extrabold tracking-tight text-balance md:text-3xl">
            {match.home_team}
            <span className="mx-2 opacity-60">–</span>
            {match.away_team}
          </p>
          <p className="text-sm opacity-90">
            {formatDayLong(istanbulDayKey(match.start_at))}, {formatEventTime(match.start_at)}
            {match.tentative && <span className="opacity-75"> (saat kesinleşmedi)</span>}
            {place && <> · {place}</>}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 md:items-end">
          <p className="text-base md:text-lg">
            <MatchCountdown startAt={match.start_at} />
          </p>
          <div className="flex flex-wrap gap-2">
            {match.is_home ? (
              <>
                <a
                  href={PASSO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
                >
                  Bilet al: Passo
                  <ExternalIcon size={15} />
                </a>
                {eventId && (
                  <Link
                    href={`/etkinlik/${eventId}`}
                    className="inline-flex items-center rounded-full border border-on-dicle/40 px-4 py-2 text-sm font-semibold transition-colors hover:bg-on-dicle/10"
                  >
                    Maç detayı
                  </Link>
                )}
              </>
            ) : (
              // Away tickets follow the host club's rules; no link to sell.
              <a
                href={match.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 rounded-full border border-on-dicle/40 px-4 py-2 text-sm font-semibold transition-colors hover:bg-on-dicle/10"
              >
                Maç bilgisi: tff.org
                <ExternalIcon size={15} />
              </a>
            )}
          </div>
        </div>
      </div>

      {later.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 border-t border-on-dicle/20 px-5 py-2.5 text-[13px] md:px-6">
          <li className="font-semibold opacity-80">Sonraki maçlar:</li>
          {later.map((next) => (
            <li key={next.source_url} className="opacity-90">
              {shortDate(next.start_at)} · {next.is_home ? next.away_team : next.home_team}{" "}
              <span className="opacity-70">({next.is_home ? "iç saha" : "deplasman"})</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

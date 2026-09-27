/**
 * Collapses an event's separate sessions into one listing entry.
 *
 * Sources list every performance as its own event: a play with a matinee
 * and an evening show, or a run on two weekends, arrives as two or three
 * rows with the same title at the same venue. Shown as-is, one show filled
 * several cards in a row (152 cards for 105 distinct events on 2026-09-25).
 *
 * This is display-only grouping. The rows stay separate in the database
 * (each session has its own detail page and favorite), and it is unrelated
 * to the scraper's cross-source dedup in scripts/scrapers/lib/upsert-event.ts,
 * which MERGES rows that are the same session reported twice.
 */

type Groupable = { title: string; venue_id: string | null; start_at: string };

export type SessionGroup<T> = { key: string; sessions: T[] };

/** Same show = same title (ignoring case and outer whitespace) at the same venue. */
export function sessionGroupKey(event: Groupable): string {
  return `${event.title.trim().toLocaleLowerCase("tr-TR")}|${event.venue_id ?? ""}`;
}

/**
 * Groups events into shows, each with its sessions in start order. Groups
 * come back ordered by their first session.
 */
export function groupSessions<T extends Groupable>(events: T[]): SessionGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const event of events) {
    const key = sessionGroupKey(event);
    const sessions = groups.get(key);
    if (sessions) sessions.push(event);
    else groups.set(key, [event]);
  }
  return [...groups.entries()]
    .map(([key, sessions]) => ({
      key,
      sessions: [...sessions].sort((a, b) => a.start_at.localeCompare(b.start_at)),
    }))
    .sort((a, b) => a.sessions[0].start_at.localeCompare(b.sessions[0].start_at));
}

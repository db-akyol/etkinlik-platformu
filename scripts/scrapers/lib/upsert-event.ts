/**
 * Upserts one scraped event, enforcing two MVP-critical rules from
 * docs/plan.md no matter what a parser passes in:
 *
 *  1. `source_type` is always forced to `"scraped"` here — never trust a
 *     parser to set it correctly, since a bug that let scraped data in as
 *     `"manual"` would skip moderation entirely.
 *  2. `status` is always forced to `"pending"` — scraped events must be
 *     admin-approved before they're public (RLS in supabase/schema.sql only
 *     exposes `status = 'approved'` rows to anon/public reads).
 *
 * --- Dedup / ON CONFLICT caveat -------------------------------------------
 *
 * `supabase/schema.sql` defines the dedup unique index as an EXPRESSION
 * index:
 *
 *   create unique index events_dedup_idx on events (
 *     title, start_at, coalesce(venue_id, '00000000-0000-0000-0000-000000000000')
 *   );
 *
 * Postgres's `ON CONFLICT (col1, col2, col3)` clause matches a conflict
 * target by the exact index DEFINITION, not by column name — so
 * `ON CONFLICT (title, start_at, venue_id)` (literal `venue_id`, no
 * `coalesce(...)`) does NOT match `events_dedup_idx` at all, even for rows
 * where `venue_id` happens to be non-null. PostgREST/Supabase's `.upsert()`
 * builds exactly that literal-column `ON CONFLICT` clause from the
 * `onConflict` option string, so it cannot target an expression index this
 * way — the database will reply with something like "there is no unique or
 * exclusion constraint matching the ON CONFLICT specification", i.e. it will
 * error on essentially every call rather than silently doing the wrong thing.
 *
 * We still attempt it first (in case a future schema migration adds a plain
 * matching index, or a newer PostgREST/Supabase version learns to target
 * expression indexes some other way — at that point this becomes a cheap,
 * atomic, race-free upsert and the code below just stops hitting the catch
 * branch). But the code MUST NOT rely on it succeeding. On failure we fall
 * back to the same three-field dedup key applied manually:
 * select-by-(title, start_at, venue_id) -> update if found, insert if not.
 *
 * This fallback is not perfectly atomic (a race between two concurrent
 * scraper runs could both pass the "not found" check and double-insert) —
 * acceptable for an MVP that runs a cron twice a day, not acceptable at
 * higher concurrency. If that ever matters, the real fix is a plain
 * (non-expression) unique index Supabase's upsert can target directly, e.g.
 * by adding a generated `venue_id_key` column that defaults to the sentinel
 * UUID instead of null.
 */
import type { EventRow } from "../../../lib/supabase/types";
import type { SupabaseAdminClient } from "./supabase-admin";

export type UpsertScrapedEventInput = Omit<EventRow, "id" | "created_at" | "status">;

export type UpsertScrapedEventResult =
  | { action: "inserted" | "updated" }
  | { action: "error"; error: unknown };

export async function upsertScrapedEvent(
  supabase: SupabaseAdminClient,
  event: UpsertScrapedEventInput,
): Promise<UpsertScrapedEventResult> {
  const payload: Omit<EventRow, "id" | "created_at"> = {
    ...event,
    source_type: "scraped",
    status: "pending",
  };

  // --- Attempt 1: DB-level upsert (see file header for why this currently
  // fails against events_dedup_idx, and why we try it anyway). ---
  const { error: upsertError } = await supabase
    .from("events")
    .upsert(payload, { onConflict: "title,start_at,venue_id" });

  if (!upsertError) {
    return { action: "inserted" };
  }

  // --- Fallback: manual select-then-insert-or-update using the same three
  // fields the expression index dedupes on. ---
  let query = supabase
    .from("events")
    .select("id")
    .eq("title", payload.title)
    .eq("start_at", payload.start_at);

  query =
    payload.venue_id === null
      ? query.is("venue_id", null)
      : query.eq("venue_id", payload.venue_id);

  const { data: existing, error: selectError } = await query.maybeSingle();

  if (selectError) {
    return { action: "error", error: selectError };
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("events")
      .update(payload)
      .eq("id", existing.id);

    return updateError ? { action: "error", error: updateError } : { action: "updated" };
  }

  const { error: insertError } = await supabase.from("events").insert(payload);
  return insertError ? { action: "error", error: insertError } : { action: "inserted" };
}

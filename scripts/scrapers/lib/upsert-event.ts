/**
 * Upserts one scraped event, enforcing two MVP-critical rules from
 * docs/plan.md no matter what a parser passes in:
 *
 *  1. `source_type` is always forced to `"scraped"` here — never trust a
 *     parser to set it correctly, since a bug that let scraped data in as
 *     `"manual"` would skip moderation entirely.
 *  2. `status` is always forced to `"approved"` — the project owner decided
 *     a manual approve/reject queue serves no purpose for these sources: all
 *     current parsers (biletinial.ts, biletix.ts) pull from official ticket
 *     vendors, there's no realistic reason to reject one of their listings,
 *     and requiring a click per event just to publish ~100+ real events
 *     twice a day is pure toil. `admin_users`-gated RLS write access (see
 *     supabase/migrations/0002_...) is still the actual security boundary
 *     here, not this approval step.
 *     NOTE for future low-trust sources (e.g. the Instagram-based scraping
 *     mentioned in docs/plan.md): unlike an official vendor's structured
 *     feed, a scraped Instagram caption is much more likely to be
 *     garbled/wrong/spam, so blanket-approving THOSE the same way would
 *     defeat the point of moderation — that source should force
 *     `status: "pending"` explicitly rather than reuse this default as-is.
 *
 * --- Dedup key: (title, start_at) only — NOT venue_id ---------------------
 *
 * The dedup key used to be (title, start_at, venue_id) via an expression
 * index (`coalesce(venue_id, <sentinel>)`, to make null venue_ids collide
 * instead of being treated as distinct). That caught duplicates WITHIN one
 * source, but the same real event scraped from biletinial.com AND
 * biletix.com kept landing as two rows, because each site spells the same
 * venue's name slightly differently ("... Kültür ve Kongre Merkezi" vs
 * "... KKM") — resolve-refs.ts's exact-match venue resolution then creates
 * two different `venues` rows, i.e. two different venue_ids, for what is
 * unambiguously the same event. Confirmed empirically: well over a dozen
 * biletinial/biletix pairs matched exactly on title AND start_at (down to
 * the second) and differed ONLY in venue_id. See
 * supabase/migrations/0003_dedup_by_title_start_at.sql.
 *
 * Dropping venue_id from the key accepts a vanishingly small risk (two
 * genuinely different events sharing both an exact title string and the
 * exact same start timestamp, in the same city) in exchange for actually
 * fixing those duplicate listings. It does NOT solve the harder problem of
 * two sites wording the same event's TITLE differently (e.g. "Dedublüman"
 * vs "Dedublüman Konseri") — that's real fuzzy matching, deliberately still
 * out of scope; every source observed so far has used the same plain title
 * text, so this hasn't come up in practice yet.
 *
 * (title, start_at) is also now a plain, non-expression unique index, so a
 * real atomic `ON CONFLICT` upsert is possible — but deliberately NOT used
 * here: PostgREST's `.upsert()` would set every payload column (including
 * `status`) on conflict, which would silently undo an admin's manual
 * "reject" on the next re-scrape (see the comment below). The manual
 * select-then-insert-or-update below trades a small amount of non-atomicity
 * (acceptable for an MVP cron running twice a day, not at higher
 * concurrency) for the ability to leave `status` alone on update.
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
    status: "approved",
  };

  // Manual select-then-insert-or-update on the same (title, start_at) key
  // events_dedup_idx dedupes on — see the file header for why this doesn't
  // use a DB-level `.upsert()` despite a matching plain index now existing.
  const { data: existing, error: selectError } = await supabase
    .from("events")
    .select("id")
    .eq("title", payload.title)
    .eq("start_at", payload.start_at)
    .maybeSingle();

  if (selectError) {
    return { action: "error", error: selectError };
  }

  if (existing) {
    // Deliberately NOT `status` here: an admin may have hand-rejected this
    // exact row (bad data, a duplicate they spotted, whatever) via /admin's
    // reject action. Re-scraping the same title/start_at/venue on the next
    // cron run must refresh its content (price/description/image can
    // legitimately change) WITHOUT silently resurrecting it as "approved"
    // and undoing that decision.
    const { status: _status, ...updateFields } = payload;
    const { error: updateError } = await supabase
      .from("events")
      .update(updateFields)
      .eq("id", existing.id);

    return updateError ? { action: "error", error: updateError } : { action: "updated" };
  }

  const { error: insertError } = await supabase.from("events").insert(payload);
  return insertError ? { action: "error", error: insertError } : { action: "inserted" };
}

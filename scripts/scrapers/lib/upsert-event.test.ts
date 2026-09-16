/**
 * Tests for upsert-event.ts against a stubbed Supabase client.
 *
 * No database involved: what's worth pinning here is the set of rules this
 * function enforces on every parser's behalf, each of which is a silent,
 * data-corrupting failure if it regresses —
 *
 *   - `source_type` is forced to "scraped" (a parser that got this wrong
 *     would smuggle scraped rows in as hand-entered ones),
 *   - `status` is forced to "approved" on INSERT (the project owner removed
 *     the approval queue for official-vendor sources),
 *   - but `status` is left alone on UPDATE, so re-scraping does not
 *     resurrect an event an admin deliberately rejected,
 *   - and the dedup lookup keys on (title, start_at) ONLY — adding venue_id
 *     back is what let the same event appear twice, once per source.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { upsertScrapedEvent, type UpsertScrapedEventInput } from "./upsert-event";
import type { SupabaseAdminClient } from "./supabase-admin";

interface RecordedCall {
  table: string;
  op: "select-single" | "select-many" | "insert" | "update";
  filters: Record<string, unknown>;
  columns?: string;
  payload?: Record<string, unknown>;
}

/**
 * Minimal stand-in for the slice of PostgREST's chainable builder that
 * upsert-event.ts actually uses. Two different `select()` shapes are exercised:
 *
 *   - `.select("id").eq(...).eq(...).maybeSingle()` — the exact-match lookup.
 *   - `.select("id, title").eq("start_at", ...)` awaited directly (no
 *     `.maybeSingle()`) — the fuzzy-fallback lookup, which wants every row at
 *     that timestamp. Real `@supabase/supabase-js` builders are themselves
 *     thenable, so awaiting one without `.maybeSingle()` resolves to
 *     `{ data: [...], error }` — mimicked here via `.then()`.
 */
function fakeSupabase(opts: {
  existing?: { id: string } | null;
  selectError?: unknown;
  sameTimeRows?: { id: string; title: string }[];
  sameTimeError?: unknown;
  insertError?: unknown;
  updateError?: unknown;
} = {}) {
  const calls: RecordedCall[] = [];

  const from = (table: string) => ({
    select(columns: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        maybeSingle: async () => {
          calls.push({ table, op: "select-single", filters, columns });
          return { data: opts.existing ?? null, error: opts.selectError ?? null };
        },
        then(onResolve: (v: { data: unknown; error: unknown }) => unknown, onReject: (e: unknown) => unknown) {
          calls.push({ table, op: "select-many", filters, columns });
          return Promise.resolve({
            data: opts.sameTimeRows ?? [],
            error: opts.sameTimeError ?? null,
          }).then(onResolve, onReject);
        },
      };
      return builder;
    },
    insert(payload: Record<string, unknown>) {
      calls.push({ table, op: "insert", filters: {}, payload });
      return Promise.resolve({ error: opts.insertError ?? null });
    },
    update(payload: Record<string, unknown>) {
      const call: RecordedCall = { table, op: "update", filters: {}, payload };
      calls.push(call);
      return {
        eq(column: string, value: unknown) {
          call.filters[column] = value;
          return Promise.resolve({ error: opts.updateError ?? null });
        },
      };
    },
  });

  return { client: { from } as unknown as SupabaseAdminClient, calls };
}

const INPUT: UpsertScrapedEventInput = {
  title: "Jül Sezar",
  description: "Bir Shakespeare oyunu.",
  start_at: "2026-09-18T17:00:00.000Z",
  end_at: "2026-09-18T19:00:00.000Z",
  city_id: "city-uuid",
  venue_id: "venue-uuid",
  category_id: "category-uuid",
  price: "896 TL",
  source_type: "scraped",
  source_url: "https://biletinial.com/tr-tr/tiyatro/jul-sezar-tiyatro-oyunu",
  image_url: "https://cdn.example/a.jpg",
  created_by: null,
};

describe("upsertScrapedEvent — inserting a new event", () => {
  test("inserts when no row matches", async () => {
    const { client, calls } = fakeSupabase({ existing: null });
    const result = await upsertScrapedEvent(client, INPUT);

    assert.deepEqual(result, { action: "inserted" });
    assert.equal(calls.filter((c) => c.op === "insert").length, 1);
    assert.equal(calls.filter((c) => c.op === "update").length, 0);
  });

  test("forces status to approved", async () => {
    const { client, calls } = fakeSupabase({ existing: null });
    await upsertScrapedEvent(client, INPUT);

    const insert = calls.find((c) => c.op === "insert")!;
    assert.equal(insert.payload!.status, "approved");
  });

  test("forces source_type to scraped even if a parser passes something else", async () => {
    const { client, calls } = fakeSupabase({ existing: null });
    await upsertScrapedEvent(client, { ...INPUT, source_type: "manual" });

    const insert = calls.find((c) => c.op === "insert")!;
    assert.equal(insert.payload!.source_type, "scraped");
  });

  test("passes the parser's content through unchanged", async () => {
    const { client, calls } = fakeSupabase({ existing: null });
    await upsertScrapedEvent(client, INPUT);

    const insert = calls.find((c) => c.op === "insert")!;
    assert.equal(insert.payload!.title, "Jül Sezar");
    assert.equal(insert.payload!.price, "896 TL");
    assert.equal(insert.payload!.description, "Bir Shakespeare oyunu.");
  });
});

describe("upsertScrapedEvent — dedup lookup", () => {
  test("matches on title and start_at only", async () => {
    const { client, calls } = fakeSupabase({ existing: null });
    await upsertScrapedEvent(client, INPUT);

    const select = calls.find((c) => c.op === "select-single")!;
    assert.deepEqual(select.filters, {
      title: "Jül Sezar",
      start_at: "2026-09-18T17:00:00.000Z",
    });
  });

  test("does not filter on venue_id", async () => {
    // Re-adding venue_id is exactly what produced the cross-source
    // duplicates: two sources spell the same venue differently, so
    // resolve-refs creates two venue rows for one real place.
    const { client, calls } = fakeSupabase({ existing: null });
    await upsertScrapedEvent(client, INPUT);

    const select = calls.find((c) => c.op === "select-single")!;
    assert.ok(!("venue_id" in select.filters));
  });
});

describe("upsertScrapedEvent — fuzzy fallback (worded differently across sources)", () => {
  // Real case, confirmed live on 2026-09-16: biletix had "Büyük Afrika
  // Sirki", bubilet scraped the same showtime as "Büyük Afrika Sirki
  // Oyunu" — two cards for one real event until this fallback existed.
  test("finds a match via normalized title when the exact match misses", async () => {
    const { client, calls } = fakeSupabase({
      existing: null,
      sameTimeRows: [{ id: "existing-uuid", title: "Büyük Afrika Sirki" }],
    });
    const result = await upsertScrapedEvent(client, { ...INPUT, title: "Büyük Afrika Sirki Oyunu" });

    assert.deepEqual(result, { action: "updated" });
    const update = calls.find((c) => c.op === "update")!;
    assert.deepEqual(update.filters, { id: "existing-uuid" });
  });

  test("only searches rows at the same start_at, not the whole table", async () => {
    const { client, calls } = fakeSupabase({ existing: null, sameTimeRows: [] });
    await upsertScrapedEvent(client, INPUT);

    const fallback = calls.find((c) => c.op === "select-many")!;
    assert.deepEqual(fallback.filters, { start_at: INPUT.start_at });
  });

  test("does not overwrite the existing title on a fuzzy-matched update", async () => {
    // Otherwise the displayed title would flip-flop depending on which
    // source's cron step happens to run last.
    const { client, calls } = fakeSupabase({
      existing: null,
      sameTimeRows: [{ id: "existing-uuid", title: "Büyük Afrika Sirki" }],
    });
    await upsertScrapedEvent(client, { ...INPUT, title: "Büyük Afrika Sirki Oyunu" });

    const update = calls.find((c) => c.op === "update")!;
    assert.ok(!("title" in update.payload!), "update payload must not contain `title`");
  });

  test("does not fuzzy-match an unrelated event at the same start_at", async () => {
    const { client, calls } = fakeSupabase({
      existing: null,
      sameTimeRows: [{ id: "other-uuid", title: "Tamamen Farklı Bir Etkinlik" }],
    });
    const result = await upsertScrapedEvent(client, INPUT);

    assert.deepEqual(result, { action: "inserted" });
    assert.equal(calls.filter((c) => c.op === "insert").length, 1);
  });

  test("a failed fallback lookup is reported as an error, not silently inserted", async () => {
    const { client, calls } = fakeSupabase({ existing: null, sameTimeError: { message: "boom" } });
    const result = await upsertScrapedEvent(client, INPUT);

    assert.equal(result.action, "error");
    assert.equal(calls.filter((c) => c.op === "insert").length, 0);
  });
});

describe("upsertScrapedEvent — updating an existing event", () => {
  test("updates the matched row instead of inserting a second one", async () => {
    const { client, calls } = fakeSupabase({ existing: { id: "event-uuid" } });
    const result = await upsertScrapedEvent(client, INPUT);

    assert.deepEqual(result, { action: "updated" });
    assert.equal(calls.filter((c) => c.op === "insert").length, 0);

    const update = calls.find((c) => c.op === "update")!;
    assert.deepEqual(update.filters, { id: "event-uuid" });
  });

  test("never writes status on update", async () => {
    // The one that matters: an admin rejecting an event must not be undone
    // by the next cron run silently setting it back to "approved".
    const { client, calls } = fakeSupabase({ existing: { id: "event-uuid" } });
    await upsertScrapedEvent(client, INPUT);

    const update = calls.find((c) => c.op === "update")!;
    assert.ok(!("status" in update.payload!), "update payload must not contain `status`");
  });

  test("never writes title on update, even on an exact match", async () => {
    // Excluded unconditionally (not just for fuzzy matches) — see the
    // fuzzy-fallback tests below for why. A no-op for an exact match since
    // the strings are already identical.
    const { client, calls } = fakeSupabase({ existing: { id: "event-uuid" } });
    await upsertScrapedEvent(client, INPUT);

    const update = calls.find((c) => c.op === "update")!;
    assert.ok(!("title" in update.payload!), "update payload must not contain `title`");
  });

  test("still refreshes content that legitimately changes between runs", async () => {
    const { client, calls } = fakeSupabase({ existing: { id: "event-uuid" } });
    await upsertScrapedEvent(client, { ...INPUT, price: "1.200 TL", description: "Güncellendi." });

    const update = calls.find((c) => c.op === "update")!;
    assert.equal(update.payload!.price, "1.200 TL");
    assert.equal(update.payload!.description, "Güncellendi.");
    assert.equal(update.payload!.source_type, "scraped");
  });
});

describe("upsertScrapedEvent — error handling", () => {
  test("reports a failed lookup without inserting a duplicate", async () => {
    // Treating a failed SELECT as "no match" would insert a second row.
    const { client, calls } = fakeSupabase({ selectError: { message: "boom" } });
    const result = await upsertScrapedEvent(client, INPUT);

    assert.equal(result.action, "error");
    assert.equal(calls.filter((c) => c.op === "insert").length, 0);
  });

  test("reports a failed insert", async () => {
    const { client } = fakeSupabase({ existing: null, insertError: { message: "boom" } });
    const result = await upsertScrapedEvent(client, INPUT);

    assert.equal(result.action, "error");
    assert.deepEqual(result.action === "error" ? result.error : null, { message: "boom" });
  });

  test("reports a failed update", async () => {
    const { client } = fakeSupabase({ existing: { id: "event-uuid" }, updateError: { message: "boom" } });
    const result = await upsertScrapedEvent(client, INPUT);

    assert.equal(result.action, "error");
  });
});

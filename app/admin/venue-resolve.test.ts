import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { resolveVenueByName } from "./venue-resolve";
import type { createClient } from "@/lib/supabase/server";

// Type-only import — this file must never actually call createClient()
// (it would invoke next/headers' cookies() outside a request context).
type FakeClient = Awaited<ReturnType<typeof createClient>>;

interface RecordedCall {
  table: string;
  op: "select" | "insert";
  filters: Record<string, unknown>;
}

function fakeSupabase(opts: {
  cityRows?: { id: string }[];
  cityError?: unknown;
  venueRows?: { id: string }[];
  venueFindError?: unknown;
  insertedRows?: { id: string }[];
  insertError?: unknown;
} = {}) {
  const calls: RecordedCall[] = [];

  const from = (table: string) => {
    if (table === "cities") {
      const filters: Record<string, unknown> = {};
      const builder = {
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        limit(n: number) {
          filters.limit = n;
          return builder;
        },
        returns() {
          return builder;
        },
        then(onResolve: (v: { data: unknown; error: unknown }) => unknown, onReject: (e: unknown) => unknown) {
          calls.push({ table, op: "select", filters });
          return Promise.resolve({ data: opts.cityRows ?? [], error: opts.cityError ?? null }).then(
            onResolve,
            onReject,
          );
        },
      };
      return { select: () => builder };
    }

    if (table === "venues") {
      return {
        select() {
          const filters: Record<string, unknown> = {};
          const builder = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return builder;
            },
            ilike(column: string, value: unknown) {
              filters[column] = value;
              return builder;
            },
            returns() {
              return builder;
            },
            then(onResolve: (v: { data: unknown; error: unknown }) => unknown, onReject: (e: unknown) => unknown) {
              calls.push({ table, op: "select", filters });
              return Promise.resolve({
                data: opts.venueRows ?? [],
                error: opts.venueFindError ?? null,
              }).then(onResolve, onReject);
            },
          };
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          calls.push({ table, op: "insert", filters: payload });
          const builder = {
            select() {
              return builder;
            },
            returns() {
              return builder;
            },
            then(onResolve: (v: { data: unknown; error: unknown }) => unknown, onReject: (e: unknown) => unknown) {
              return Promise.resolve({
                data: opts.insertedRows ?? [],
                error: opts.insertError ?? null,
              }).then(onResolve, onReject);
            },
          };
          return builder;
        },
      };
    }

    throw new Error(`fakeSupabase: unexpected table "${table}"`);
  };

  return { client: { from } as unknown as FakeClient, calls };
}

describe("resolveVenueByName", () => {
  test("returns null for a blank/missing name without querying anything", async () => {
    const { client, calls } = fakeSupabase();
    assert.equal(await resolveVenueByName(client, ""), null);
    assert.equal(await resolveVenueByName(client, null), null);
    assert.equal(await resolveVenueByName(client, undefined), null);
    assert.equal(calls.length, 0);
  });

  test("returns the existing venue's id on a case-insensitive match", async () => {
    const { client } = fakeSupabase({
      cityRows: [{ id: "city-1" }],
      venueRows: [{ id: "venue-1" }],
    });

    assert.equal(await resolveVenueByName(client, "holly stone performance hall"), "venue-1");
  });

  test("creates a new venue when no existing row matches", async () => {
    const { client, calls } = fakeSupabase({
      cityRows: [{ id: "city-1" }],
      venueRows: [],
      insertedRows: [{ id: "new-venue-1" }],
    });

    const id = await resolveVenueByName(client, "Yepyeni Mekan");

    assert.equal(id, "new-venue-1");
    const insertCall = calls.find((c) => c.op === "insert")!;
    assert.deepEqual(insertCall.filters, { city_id: "city-1", name: "Yepyeni Mekan" });
  });

  test("throws when no active city can be found", async () => {
    const { client } = fakeSupabase({ cityRows: [] });
    await assert.rejects(() => resolveVenueByName(client, "Herhangi Bir Mekan"));
  });

  test("throws (does not silently return null) when the venue lookup errors", async () => {
    const { client } = fakeSupabase({
      cityRows: [{ id: "city-1" }],
      venueFindError: { message: "boom" },
    });
    await assert.rejects(() => resolveVenueByName(client, "Herhangi Bir Mekan"));
  });
});

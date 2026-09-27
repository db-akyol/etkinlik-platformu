import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { groupSessions, sessionGroupKey } from "./event-groups";

const event = (id: string, title: string, venue_id: string | null, start_at: string) => ({
  id,
  title,
  venue_id,
  start_at,
});

describe("groupSessions", () => {
  test("puts every session of one show at one venue into one group", () => {
    const groups = groupSessions([
      event("a", "Alice Harikalar Diyarında", "v1", "2026-09-26T11:00:00.000Z"),
      event("b", "Alice Harikalar Diyarında", "v1", "2026-09-26T13:00:00.000Z"),
      event("c", "Kasım Taşdoğan", "v2", "2026-09-26T17:30:00.000Z"),
    ]);
    assert.deepEqual(
      groups.map((g) => g.sessions.map((s) => s.id)),
      [["a", "b"], ["c"]],
    );
  });

  test("keeps the same title at different venues apart", () => {
    const groups = groupSessions([
      event("a", "Keçelok", "v1", "2026-10-04T10:00:00.000Z"),
      event("b", "Keçelok", "v2", "2026-10-05T10:00:00.000Z"),
    ]);
    assert.equal(groups.length, 2);
  });

  test("orders sessions and groups by start time whatever the input order", () => {
    const groups = groupSessions([
      event("late", "Moraşîn", "v1", "2026-10-03T17:00:00.000Z"),
      event("other", "Taladro", "v2", "2026-10-02T19:00:00.000Z"),
      event("early", "Moraşîn", "v1", "2026-10-02T17:00:00.000Z"),
    ]);
    assert.deepEqual(
      groups.map((g) => g.sessions.map((s) => s.id)),
      [["early", "late"], ["other"]],
    );
  });

  test("ignores case and outer whitespace in the title", () => {
    assert.equal(
      sessionGroupKey(event("a", " Jül Sezar", "v1", "")),
      sessionGroupKey(event("b", "JÜL SEZAR ", "v1", "")),
    );
  });
});

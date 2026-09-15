/**
 * Tests for the "suspiciously empty source" check in run-all.ts.
 *
 * The situation being guarded against: a parser whose source changes its
 * page structure returns `found=0 upserted=0 errors=0` and the workflow
 * exits 0. Nothing throws, nothing is logged in red, and the site just
 * quietly stops getting new events — which is how biletinial's broken
 * enrichment stayed hidden for a while.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { findSilentFailures } from "./run-all";
import type { ScrapeRunResult } from "./lib/types";

const summary = (source: string, found: number): ScrapeRunResult => ({
  source,
  found,
  upserted: found,
  errors: 0,
});

describe("findSilentFailures", () => {
  test("says nothing when every source is above its floor", () => {
    const problems = findSilentFailures([
      { summary: summary("biletinial", 85), minExpected: 10 },
      { summary: summary("biletix", 32), minExpected: 5 },
    ]);
    assert.deepEqual(problems, []);
  });

  test("flags a source that returned zero without erroring", () => {
    const problems = findSilentFailures([
      { summary: summary("biletinial", 0), minExpected: 10 },
    ]);

    assert.equal(problems.length, 1);
    assert.match(problems[0], /biletinial/);
    assert.match(problems[0], /page structure may have changed/);
  });

  test("flags a source that returned far fewer events than usual", () => {
    // Partial breakage (e.g. only the first page still parses) matters too.
    const problems = findSilentFailures([
      { summary: summary("biletinial", 3), minExpected: 10 },
    ]);
    assert.equal(problems.length, 1);
  });

  test("does not flag a source sitting exactly on its floor", () => {
    const problems = findSilentFailures([
      { summary: summary("biletix", 5), minExpected: 5 },
    ]);
    assert.deepEqual(problems, []);
  });

  test("never flags a source whose floor is zero", () => {
    // The municipality legitimately has nothing upcoming much of the time;
    // flagging that would train everyone to ignore this check.
    const problems = findSilentFailures([
      { summary: summary("belediye", 0), minExpected: 0 },
    ]);
    assert.deepEqual(problems, []);
  });

  test("reports each failing source separately", () => {
    const problems = findSilentFailures([
      { summary: summary("biletinial", 0), minExpected: 10 },
      { summary: summary("biletix", 32), minExpected: 5 },
      { summary: summary("belediye", 0), minExpected: 0 },
    ]);

    assert.equal(problems.length, 1);
    assert.match(problems[0], /biletinial/);
  });

  test("includes both the actual and expected counts in the message", () => {
    // The log line has to be actionable on its own — whoever reads the CI
    // failure shouldn't have to go find the thresholds.
    const [problem] = findSilentFailures([
      { summary: summary("biletinial", 2), minExpected: 10 },
    ]);
    assert.match(problem, /only 2 event/);
    assert.match(problem, /at least 10/);
  });
});

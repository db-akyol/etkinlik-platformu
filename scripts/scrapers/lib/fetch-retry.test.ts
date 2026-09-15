/**
 * Tests for fetchWithRetry, driven by a stubbed `globalThis.fetch`.
 *
 * All of these pass `baseDelayMs: 1` so the suite stays instant — the real
 * default is a second.
 */
import assert from "node:assert/strict";
import test, { afterEach, describe } from "node:test";

import { fetchWithRetry } from "./fetch-retry";

const realFetch = globalThis.fetch;
const realWarn = console.warn;

afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
});

/** Installs a fetch that plays back `outcomes` in order. An Error is thrown
 *  (network-level failure); a number becomes a Response with that status. */
function stubFetch(outcomes: (number | Error)[], headers: Record<string, string> = {}) {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    const outcome = outcomes[urls.length - 1];
    if (outcome === undefined) throw new Error("stub fetch called more times than expected");
    if (outcome instanceof Error) throw outcome;
    return new Response("body", { status: outcome, headers });
  }) as unknown as typeof globalThis.fetch;

  // Retries log a warning; keep the test output readable.
  console.warn = () => {};
  return { calls: () => urls.length };
}

describe("fetchWithRetry — success paths", () => {
  test("returns the first response when it succeeds", async () => {
    const stub = stubFetch([200]);
    const res = await fetchWithRetry("https://example.test/a", undefined, { baseDelayMs: 1 });

    assert.equal(res.status, 200);
    assert.equal(stub.calls(), 1);
  });

  test("recovers from a network throw", async () => {
    const stub = stubFetch([new Error("ECONNRESET"), 200]);
    const res = await fetchWithRetry("https://example.test/a", undefined, { baseDelayMs: 1 });

    assert.equal(res.status, 200);
    assert.equal(stub.calls(), 2);
  });

  test("recovers from a 503", async () => {
    const stub = stubFetch([503, 200]);
    const res = await fetchWithRetry("https://example.test/a", undefined, { baseDelayMs: 1 });

    assert.equal(res.status, 200);
    assert.equal(stub.calls(), 2);
  });

  test("uses every allowed attempt before giving up", async () => {
    const stub = stubFetch([500, 500, 200]);
    const res = await fetchWithRetry("https://example.test/a", undefined, {
      baseDelayMs: 1,
      retries: 2,
    });

    assert.equal(res.status, 200);
    assert.equal(stub.calls(), 3);
  });
});

describe("fetchWithRetry — what must NOT be retried", () => {
  test("returns a 404 immediately", async () => {
    // The page is gone. Re-requesting it changes nothing and is rude.
    const stub = stubFetch([404]);
    const res = await fetchWithRetry("https://example.test/a", undefined, { baseDelayMs: 1 });

    assert.equal(res.status, 404);
    assert.equal(stub.calls(), 1);
  });

  test("returns a 403 immediately", async () => {
    // We're unwelcome; retrying is the start of exactly the behaviour the
    // project's scraping ethics rule out.
    const stub = stubFetch([403]);
    const res = await fetchWithRetry("https://example.test/a", undefined, { baseDelayMs: 1 });

    assert.equal(res.status, 403);
    assert.equal(stub.calls(), 1);
  });

  test("retries a 429, since that one is explicitly transient", async () => {
    const stub = stubFetch([429, 200]);
    const res = await fetchWithRetry("https://example.test/a", undefined, { baseDelayMs: 1 });

    assert.equal(res.status, 200);
    assert.equal(stub.calls(), 2);
  });
});

describe("fetchWithRetry — exhaustion", () => {
  test("hands back the final error response rather than throwing", async () => {
    // Callers already check `res.ok` and produce a good message from it;
    // throwing here would replace that with a less specific one.
    const stub = stubFetch([500, 500, 500]);
    const res = await fetchWithRetry("https://example.test/a", undefined, {
      baseDelayMs: 1,
      retries: 2,
    });

    assert.equal(res.status, 500);
    assert.equal(stub.calls(), 3);
  });

  test("throws when every attempt failed at the network level", async () => {
    // There's no Response to hand back in this case.
    stubFetch([new Error("ENOTFOUND"), new Error("ENOTFOUND"), new Error("ENOTFOUND")]);

    await assert.rejects(
      () => fetchWithRetry("https://example.test/a", undefined, { baseDelayMs: 1, retries: 2 }),
      // `[\s\S]` rather than the `s` flag — tsconfig targets ES2017.
      /failed after 3 attempt\(s\)[\s\S]*ENOTFOUND/,
    );
  });

  test("makes exactly one attempt when retries is 0", async () => {
    const stub = stubFetch([new Error("ECONNRESET")]);

    await assert.rejects(() =>
      fetchWithRetry("https://example.test/a", undefined, { baseDelayMs: 1, retries: 0 }),
    );
    assert.equal(stub.calls(), 1);
  });
});

describe("fetchWithRetry — Retry-After", () => {
  test("waits at least the requested delay on a 429", async () => {
    stubFetch([429, 200], { "retry-after": "1" });

    const started = Date.now();
    const res = await fetchWithRetry("https://example.test/a", undefined, { baseDelayMs: 1 });

    assert.equal(res.status, 200);
    // The header asks for 1s; the 1ms base delay must not win over it.
    assert.ok(Date.now() - started >= 900, "must honour the source's Retry-After");
  });

  test("ignores an unparseable Retry-After and falls back to the backoff", async () => {
    stubFetch([429, 200], { "retry-after": "soon-ish" });

    const res = await fetchWithRetry("https://example.test/a", undefined, { baseDelayMs: 1 });
    assert.equal(res.status, 200);
  });
});

describe("fetchWithRetry — request details", () => {
  test("passes the caller's init through on every attempt", async () => {
    const seen: (RequestInit | undefined)[] = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seen.push(init);
      return new Response("", { status: seen.length === 1 ? 500 : 200 });
    }) as unknown as typeof globalThis.fetch;
    console.warn = () => {};

    await fetchWithRetry("https://example.test/a", { headers: { "User-Agent": "x" } }, {
      baseDelayMs: 1,
    });

    assert.equal(seen.length, 2);
    // A retry that dropped the User-Agent would be a different request than
    // the one the source's robots.txt review was based on.
    assert.deepEqual(seen[0], seen[1]);
    assert.deepEqual(seen[1], { headers: { "User-Agent": "x" } });
  });
});

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getSiteUrl } from "./site-url";

const KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const key of KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("prefers NEXT_PUBLIC_SITE_URL over the Vercel-provided host", () => {
  setEnv({
    NEXT_PUBLIC_SITE_URL: "https://etkinlik.example",
    VERCEL_PROJECT_PRODUCTION_URL: "etkinlik-platformu.vercel.app",
  });
  assert.equal(getSiteUrl(), "https://etkinlik.example");
});

test("turns Vercel's bare production host into an https origin", () => {
  setEnv({ VERCEL_PROJECT_PRODUCTION_URL: "etkinlik-platformu.vercel.app" });
  assert.equal(getSiteUrl(), "https://etkinlik-platformu.vercel.app");
});

test("falls back to localhost when nothing is configured", () => {
  setEnv({});
  assert.equal(getSiteUrl(), "http://localhost:3000");
});

test("strips trailing slashes so URL joining never doubles them", () => {
  setEnv({ NEXT_PUBLIC_SITE_URL: "https://etkinlik.example///" });
  assert.equal(getSiteUrl(), "https://etkinlik.example");
  assert.equal(new URL("/sitemap.xml", getSiteUrl()).href, "https://etkinlik.example/sitemap.xml");
});

test("treats an empty or whitespace-only value as unset", () => {
  setEnv({ NEXT_PUBLIC_SITE_URL: "   ", VERCEL_PROJECT_PRODUCTION_URL: "prod.example" });
  assert.equal(getSiteUrl(), "https://prod.example");
});

test("does not double the scheme if the Vercel value already has one", () => {
  setEnv({ VERCEL_PROJECT_PRODUCTION_URL: "https://prod.example" });
  assert.equal(getSiteUrl(), "https://prod.example");
});

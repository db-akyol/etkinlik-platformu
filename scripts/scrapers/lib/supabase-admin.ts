/**
 * Supabase admin client for Node scraper scripts.
 *
 * This is intentionally NOT `lib/supabase/server.ts` or `lib/supabase/client.ts`
 * (which use `@supabase/ssr` and are built for Next.js's request lifecycle —
 * cookies, browser storage, etc). Scraper scripts run as plain Node processes
 * (via `tsx`, locally or in GitHub Actions), so we use `@supabase/supabase-js`'s
 * plain `createClient` with the **service role key**, which bypasses Row Level
 * Security entirely. That's required here: scrapers write rows with
 * `status: "pending"` before any admin/auth session exists, and RLS policies
 * (see supabase/schema.sql) only grant write access to `authenticated` users.
 *
 * NEVER import this file from anything that ships to the browser — the
 * service role key must stay server/CI-only (see `.env.local`, and
 * `secrets.SUPABASE_SERVICE_ROLE_KEY` in .github/workflows/scrape.yml).
 */
import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database as RawDatabase } from "../../../lib/supabase/types";

/**
 * `lib/supabase/types.ts`'s `Database` type (owned by the Next.js app, and
 * shared with `@supabase/ssr` callers) predates `@supabase/supabase-js` v2's
 * stricter generic constraints. Two mismatches, both silent (no error at the
 * client-creation site — they just make every query result infer as `never`
 * instead of the real row type):
 *
 *  1. supabase-js requires every table to declare `Relationships`, and the
 *     schema to declare `Views`/`Functions` (even if empty) — see
 *     `GenericTable`/`GenericSchema` in `@supabase/postgrest-js`.
 *  2. `Row`/`Insert`/`Update` must satisfy `Record<string, unknown>`, but
 *     `City`/`Venue`/`EventRow`/etc. in `lib/supabase/types.ts` are plain
 *     `interface`s with no index signature. In this TypeScript version,
 *     named interfaces WITHOUT an index signature are not assignable to
 *     `Record<string, unknown>` (only fresh object literals get that
 *     leniency) — so they fail `GenericTable`'s `Row extends
 *     Record<string, unknown>` constraint too.
 *
 * Rather than editing the shared `lib/supabase/types.ts`, we adapt it
 * locally here, purely at the type level, into the shape supabase-js
 * actually expects.
 */
type WithIndexSignature<T> = T & Record<string, unknown>;

type ToGenericTable<T extends { Row: object; Insert: object; Update: object }> = {
  Row: WithIndexSignature<T["Row"]>;
  Insert: WithIndexSignature<T["Insert"]>;
  Update: WithIndexSignature<T["Update"]>;
  Relationships: [];
};

type ScraperDatabase = {
  public: {
    Tables: {
      [K in keyof RawDatabase["public"]["Tables"]]: ToGenericTable<
        RawDatabase["public"]["Tables"][K]
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

export type SupabaseAdminClient = SupabaseClient<ScraperDatabase>;

let cachedClient: SupabaseAdminClient | null = null;

/**
 * Lazily creates (and memoizes) the admin Supabase client.
 *
 * This is a function rather than a module-level constant on purpose: it lets
 * callers (see `example-hn.ts`) wrap the *first* call in a try/catch and
 * degrade gracefully when `.env.local` isn't configured yet (e.g. a fresh
 * checkout with no Supabase project set up), instead of crashing the whole
 * process the instant this module is imported.
 */
export function getSupabaseAdmin(): SupabaseAdminClient {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env vars for scrapers: NEXT_PUBLIC_SUPABASE_URL and/or " +
        "SUPABASE_SERVICE_ROLE_KEY are not set. Add them to .env.local for local " +
        "runs (see .env.local.example / README), or set them as GitHub Actions " +
        "secrets for CI runs (see .github/workflows/scrape.yml). Note: this is " +
        "the SERVICE ROLE key (Project Settings -> API), not the anon key — it " +
        "is required to bypass RLS and insert `status: pending` scraped rows.",
    );
  }

  cachedClient = createClient<ScraperDatabase>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

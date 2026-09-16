# Instagram-assisted event entry — design

Status: approved by project owner (2026-09-16), ready for implementation planning.

## Problem

Beyond the 4 active scraper sources (biletinial, biletix, diyarbakır-belediye,
bubilet — all official vendors/the municipality with structured JSON feeds),
most local Diyarbakır venue events are only announced on those venues' own
Instagram accounts. There is no JSON API or feed to scrape, and the content
(caption + poster image) is unstructured — the date/time/venue is often only
present as text baked into the poster image, not the caption.

## Why this is NOT another scraper

Every existing parser fetches a source's own structured data automatically on
a cron. Instagram is different in a way that changes the design, not just the
implementation:

- **No automated access to Instagram, at all.** The project already treats
  "building around a source's bot-protection" as something to avoid by
  default (see `scripts/scrapers/README.md`'s Ethics section); the one
  exception (`bubilet.ts`) was explicitly a one-business, one-time decision,
  not a precedent. Instagram is dozens of third-party accounts, not one
  business's own ticket data, and Instagram's anti-automation posture is
  considerably more aggressive than bubilet's Cloudflare challenge. The
  chosen design has **zero server-side requests to Instagram**: an admin
  looks at a public post in their own browser (exactly as any visitor would)
  and manually copies the caption text and downloads the image, the same way
  they'd manually type in an event today.
- **Extraction is unreliable by nature.** Reading a poster image and turning
  it into structured fields is an AI (vision) task, not a parser — it can be
  wrong or miss fields, unlike a vendor's own JSON.
- **Trust level is different.** `upsert-event.ts`'s header already documents
  that a future low-trust source should set `status: "pending"` rather than
  inherit the "scraped → auto-approved" default. This is exactly that case.

## Flow

1. Admin opens a new page, `/admin/etkinlik/instagramdan-ekle`.
2. Fills in a form: caption text (paste), poster image (file upload), the
   Instagram post URL (optional — kept only as `source_url` for traceability;
   never fetched), and an optional free-text venue hint if the caption is
   ambiguous.
3. Submits to an "extract" server action. That action:
   - Uploads the image to a new Supabase Storage bucket (`event-images`,
     public-read) and gets back a permanent public URL.
   - Sends the image + caption to Anthropic's API (Claude Haiku, vision) with
     a prompt asking for a fixed JSON shape: `title`, `description`,
     `start_at`/`end_at` (Turkey local wall-clock, `"YYYY-MM-DDTHH:mm"` —
     same shape `<input type="datetime-local">` uses), `venue_name`, `price`.
   - A field the model can't confidently determine is `null`/omitted, not
     guessed — the prompt says so explicitly. A malformed/non-JSON response
     is treated as "extraction failed," not silently retried with a
     fallback guess.
4. The **same form component `/admin/events/new` already renders** is
   re-rendered, pre-filled with whatever the extraction returned (including
   the already-uploaded image's public URL in the `image_url` field) and
   `venue_name` in a plain text input alongside the existing venue `<select>`
   (see "Venue resolution" below for why both exist). Every field stays
   editable — this is a pre-fill, not a black box.
5. Admin reviews/corrects fields exactly like manual entry, then submits.
6. The submit action resolves the venue (see below), then inserts into
   `events` with `status: "pending"`, `source_type: "manual"`, `source_url`
   set to whatever the admin pasted (or `null`).
7. Admin reviews it one more time in the **existing** `/admin` "Onay bekleyen"
   queue and clicks "Yayınla" — no new code needed for this step, it already
   works today for any `pending` row.

## Venue resolution

The extracted `venue_name` is free text, not guaranteed to match an existing
`venues` row (most local venues won't be in the table yet). The existing
`/admin/events/new` form only offers a `<select>` of existing venues with no
"create new" path — Instagram-sourced events are the first admin-UI case that
needs one.

Reuse the same "find case-insensitively, create if missing" logic
`scripts/scrapers/lib/resolve-refs.ts`'s `resolveVenueId`/`resolveCategoryId`
already implement for scrapers — but **do not import that module directly**.
It's typed against `SupabaseAdminClient` (`@supabase/supabase-js`'s
service-role client, used by Node scripts), while `app/admin/actions.ts` uses
`@/lib/supabase/server`'s session-scoped `@supabase/ssr` client — a different
generic `Database` type. `app/admin/actions.ts` already works around a
similar mismatch with local `as never` casts (see its top-of-file comment).
Follow that existing precedent: reimplement the same ilike-find-or-create
logic as a small local helper in the new action file, rather than fighting
the type mismatch across the scripts/app boundary. RLS already grants any
`authenticated` session full CRUD on `venues`/`categories`
(`supabase/migrations/0001_init.sql`), so this works from the session client
with no service-role key involved.

The submitted form carries both the resolved-or-typed `venue_name` (text) and
(if the admin picked one) an existing `venue_id` — the action prefers an
explicit `venue_id` selection, falling back to resolving `venue_name` by name
only when no dropdown selection was made.

## Storage

New Supabase Storage bucket, `event-images`, public-read, admin-write only
(same `authenticated` RLS posture as the other tables). The extract action
uploads the file there before calling the AI, so the same URL is reused for
both the AI's image input (a fetchable public URL is simpler than inlining
base64 twice) and the final `image_url` stored on the event. No cleanup path
for orphaned uploads (an extraction the admin abandons without saving) is in
scope for v1 — acceptable for expected volume (a handful of posts a week).

## New dependencies

- `@anthropic-ai/sdk` (npm package).
- `ANTHROPIC_API_KEY` — new env var, needed in `.env.local` for local admin
  use and in Vercel's project env vars (this is a browser-triggered admin
  action running in a Next.js server action, not a GitHub Actions cron, so it
  does NOT need to be added to `.github/workflows/scrape.yml`'s secrets).

## Testing

The extraction step's *parsing* of the model's response (raw text →
validated fields object, handling missing/malformed JSON) is a pure function
and gets unit tests with a fake/mocked API response — no real network call in
tests, matching every other scraper's test pattern. The actual Anthropic API
call itself is not unit-tested (no source in this repo unit-tests real
network calls); it gets a manual smoke test against a real post during
implementation.

The local venue-resolution helper gets the same kind of unit tests
`resolve-refs.test.ts` already has for its version (case-insensitive match,
create-if-missing), against a stubbed Supabase client following the
`upsert-event.test.ts` mock pattern.

## Out of scope for v1

- Any automated/scheduled Instagram fetching, now or later, without a new
  explicit decision (see "Why this is NOT another scraper" above).
- Bulk/batch import of multiple posts in one go.
- OCR/vision fallback tuning beyond "ask Claude Haiku, accept what it says or
  leave the field blank" — no retry/multi-model escalation.
- Orphaned Storage upload cleanup.
- Cities other than Diyarbakır (matches every existing scraper's scope).

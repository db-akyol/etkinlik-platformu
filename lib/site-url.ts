/**
 * The site's canonical origin, e.g. "https://etkinlik-platformu.vercel.app".
 *
 * Everything that has to name the site from the server — `metadataBase`,
 * canonical links, Open Graph URLs, the sitemap, robots.txt — goes through
 * here, so there is exactly one place to change when the domain changes.
 *
 * Resolution order:
 *
 *   1. `NEXT_PUBLIC_SITE_URL` — set this the day the site gets a real domain.
 *      Nothing else needs to be touched.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel exposes this automatically, so
 *      production works today with no configuration. Note it is the *project's
 *      production* domain even when read from a preview deployment, which is
 *      what canonical URLs want: a preview must never advertise itself as the
 *      real site. (`VERCEL_URL`, the per-deployment host, would do exactly
 *      that — it is deliberately not used.)
 *   3. `http://localhost:3000` for `next dev`.
 *
 * Read at call time rather than module scope so tests can vary the
 * environment, and so a runtime-only variable is still picked up.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return stripTrailingSlashes(explicit);

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) {
    // Vercel gives a bare host ("example.vercel.app"), not a URL.
    const host = stripTrailingSlashes(vercelProduction);
    return /^https?:\/\//.test(host) ? host : `https://${host}`;
  }

  // Falling through to localhost on a real deployment is the one failure mode
  // worth shouting about: nothing breaks visibly, but every canonical link,
  // Open Graph URL and sitemap entry would quietly advertise localhost — to
  // search engines, permanently. VERCEL_ENV is only set on Vercel.
  if (process.env.VERCEL_ENV) {
    console.warn(
      "[site-url] Neither NEXT_PUBLIC_SITE_URL nor VERCEL_PROJECT_PRODUCTION_URL " +
        "is set. Falling back to localhost, which will emit wrong canonical, " +
        "Open Graph and sitemap URLs. Set NEXT_PUBLIC_SITE_URL in the Vercel " +
        "project's environment variables.",
    );
  }

  return "http://localhost:3000";
}

/** An origin must not end in "/" — `new URL("/x", origin)` handles joining. */
function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

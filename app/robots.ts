import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  // Preview deployments resolve getSiteUrl() to the PRODUCTION domain (see
  // lib/site-url.ts), so without this guard a preview would serve an
  // allow-everything robots.txt pointing at a sitemap for a host that isn't
  // itself — and would happily let crawlers index the preview's own URL.
  // VERCEL_ENV is unset locally, where robots.txt is irrelevant anyway.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /admin is already gated by middleware, but keeping crawlers out of
        // it saves them the redirect. The rest have nothing to index:
        // /favoriler needs a session, /giris and /kayit are bare forms, and
        // /offline is the service worker's fallback page.
        disallow: ["/admin", "/favoriler", "/giris", "/kayit", "/offline"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}

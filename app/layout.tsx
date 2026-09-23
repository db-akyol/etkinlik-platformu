import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { getSiteUrl } from "@/lib/site-url";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Heading font only — body text stays on Geist. Gives titles some
// character without touching the reading experience.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const SITE_NAME = "Diyarbakır Etkinlik";
const SITE_TITLE = `${SITE_NAME} — Şehirdeki tüm etkinlikler`;
const SITE_DESCRIPTION =
  "Diyarbakır'daki konser, tiyatro, atölye, fuar ve spor etkinliklerini tek yerden keşfedin.";

export const metadata: Metadata = {
  // Lets pages below give Open Graph images and canonical links as relative
  // paths and have Next resolve them. Until this existed, sharing the site's
  // own URL anywhere — WhatsApp, X, Slack — produced a bare link with no
  // title, image or description. (Event detail pages already previewed,
  // because their og:image happens to be an absolute CDN URL.)
  metadataBase: new URL(getSiteUrl()),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Deliberately NO `alternates.canonical` or `openGraph.url` here: Next
  // merges metadata shallowly, so either one would be inherited by every
  // child route and tell search engines that all 150 event pages are
  // duplicates of the home page. Both are set per-page instead.
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/og-default.png", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-default.png"],
  },
};

export const viewport: Viewport = {
  // Matches the site header's `bg-background/95 backdrop-blur` (app/(public)/layout.tsx),
  // which reads as the page background color, not the accent — so mobile
  // browser chrome sits flush with the header instead of clashing with it.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        {children}
        {/* Vercel Web Analytics: cookieless page-view counting. It only
         * reports from a Vercel deployment; locally it just logs to the
         * console. public/sw.js deliberately ignores /_vercel/ so the
         * script it loads never gets pinned in the service worker cache. */}
        <Analytics />
      </body>
    </html>
  );
}

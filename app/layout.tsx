import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { getSiteUrl } from "@/lib/site-url";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

// `latin-ext` is not optional on either face: it carries ğ, ş, ı and İ.
// With `latin` alone every Turkish word falls back to the system font
// mid-word.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin", "latin-ext"],
});

// Headings, event titles and the date numerals only.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
  // Matches --background in globals.css, which the site header is painted
  // with — so mobile browser chrome sits flush with the header instead of
  // clashing with it.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1313" },
  ],
  // Lets the installed PWA draw under the notch and home indicator. The
  // header and the bottom tab bar pad themselves by env(safe-area-inset-*)
  // to keep their contents clear of both.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${figtree.variable} ${bricolage.variable} ${geistMono.variable} h-full antialiased`}
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

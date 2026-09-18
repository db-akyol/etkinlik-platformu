import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
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

export const metadata: Metadata = {
  title: {
    default: "Diyarbakır Etkinlik — Şehirdeki tüm etkinlikler",
    template: "%s | Diyarbakır Etkinlik",
  },
  description:
    "Diyarbakır'daki konser, tiyatro, atölye, fuar ve spor etkinliklerini tek yerden keşfedin.",
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
      </body>
    </html>
  );
}

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sayfa bulunamadı",
};

// Renders under app/layout.tsx directly — outside the (public) route
// group, so there's no site header here. Same visual language as
// app/offline/page.tsx (centered, icon, heading, single CTA) but on the
// current token system rather than that page's hardcoded orange.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="text-5xl" aria-hidden="true">
        🧭
      </div>
      <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
        Sayfa bulunamadı
      </h1>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
        Aradığınız sayfa kaldırılmış olabilir ya da bağlantı hatalı olabilir.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-dicle px-5 py-2 text-sm font-medium text-on-dicle transition-colors hover:bg-dicle-dim"
      >
        Ana sayfaya dön
      </Link>
    </main>
  );
}

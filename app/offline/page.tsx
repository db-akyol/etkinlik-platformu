import Link from "next/link";

// Renders under app/layout.tsx directly — outside the (public) route group,
// so there's no site header here. Same visual language as app/not-found.tsx
// (centered, icon, heading, single CTA), now on the current token system
// rather than this page's old hardcoded orange with no dark-mode variants.
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <svg
        viewBox="0 0 24 24"
        width="40"
        height="40"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-foreground/30"
        aria-hidden="true"
      >
        <path d="M3 8.5C7 5 17 5 21 8.5" />
        <path d="M6.5 12.5C9 10.5 15 10.5 17.5 12.5" />
        <path d="M10 16.5C11 15.7 13 15.7 14 16.5" />
        <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
        <path d="M3 3L21 21" />
      </svg>
      <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
        Bağlantı yok
      </h1>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
        İnternet bağlantınızı kontrol edip tekrar deneyin. Daha önce
        görüntülediğiniz bazı sayfalar çevrimdışıyken de açılabilir.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-dicle px-5 py-2 text-sm font-medium text-on-dicle transition-colors hover:bg-dicle-dim"
      >
        Tekrar dene
      </Link>
    </main>
  );
}

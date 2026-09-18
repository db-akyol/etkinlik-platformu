"use client";

import { useEffect } from "react";
import Link from "next/link";

// Renders inside the (public) layout, so the site header stays put — this
// only replaces the failed page's own content, hence the narrower column
// and vertical padding instead of a full-viewport takeover.
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The only way a render failure on a public page reaches Vercel's logs —
  // nothing else reports it once React has caught it here.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center sm:px-6 lg:px-8">
      <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">
        Bir şeyler ters gitti
      </h1>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
        Bu sayfa yüklenirken beklenmeyen bir hata oluştu. Tekrar deneyebilir
        ya da ana sayfaya dönebilirsiniz.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-dicle px-5 py-2 text-sm font-medium text-on-dicle transition-colors hover:bg-dicle-dim"
        >
          Tekrar dene
        </button>
        <Link href="/" className="text-sm font-medium text-dicle hover:underline">
          Ana sayfaya dön
        </Link>
      </div>
      {/* error.message can carry internals (query fragments, stack hints) —
          the digest is the safe, grep-able handle for the Vercel log. */}
      {error.digest && (
        <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{error.digest}</p>
      )}
    </div>
  );
}

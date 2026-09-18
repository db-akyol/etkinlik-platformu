"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toggleFavorite } from "@/app/(public)/actions";

export default function FavoriteButton({
  eventId,
  initialFavorited,
  isLoggedIn,
  className,
}: {
  eventId: string;
  initialFavorited: boolean;
  isLoggedIn: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  // De-dupes clicks without `disabled`, which used to make the button
  // vanish from under the pointer mid-press on a fast connection and drop
  // keyboard focus. A ref (not state) so a rapid second click before the
  // first re-render sees it too.
  const requestInFlight = useRef(false);

  function handleClick(e: React.MouseEvent) {
    // Cards wrap this button in a stretched <Link> — don't navigate to the
    // detail page. Harmless no-op on the event detail page, where this
    // button isn't inside a link, but kept for the card usage.
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn) {
      router.push(`/giris?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    if (requestInFlight.current) return;
    requestInFlight.current = true;

    const next = !favorited;
    setFavorited(next); // optimistic
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await toggleFavorite(eventId);
        setFavorited(result.favorited);
      } catch {
        setFavorited(!next); // revert on failure
        setFailed(true);
      } finally {
        requestInFlight.current = false;
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={favorited}
        aria-busy={isPending}
        aria-label={favorited ? "Favorilerden çıkar" : "Favorilere ekle"}
        title={
          failed
            ? "Favori güncellenemedi, tekrar dene."
            : favorited
              ? "Favorilerden çıkar"
              : "Favorilere ekle"
        }
        className={
          // `after:` expands the tap target to ~44px without growing the
          // visible 32px button — the pseudo-element is part of the
          // button's own hit box, so it doesn't need a separate handler.
          "relative after:absolute after:-inset-1.5 after:content-[''] " +
          (className ??
            "flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 aria-busy:opacity-70")
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill={favorited ? "#ef4444" : "none"}
          stroke={favorited ? "#ef4444" : "currentColor"}
          strokeWidth="2"
          className="transition-colors"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 21s-6.716-4.35-9.428-8.062C.86 10.2 1.2 6.6 4.2 4.9c2.4-1.36 5.1-.6 6.8 1.4l1 1.2 1-1.2c1.7-2 4.4-2.76 6.8-1.4 3 1.7 3.34 5.3 1.628 8.038C18.716 16.65 12 21 12 21z"
          />
        </svg>
      </button>
      {/* Optimistic update already reverted itself above — this just tells
       * assistive tech it happened, without a toast system. */}
      <span role="status" aria-live="polite" className="sr-only">
        {failed ? "Favori güncellenemedi, tekrar dene." : ""}
      </span>
    </>
  );
}

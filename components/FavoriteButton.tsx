"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    // Cards wrap this button in a <Link> — don't navigate to the detail page.
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn) {
      router.push(`/giris?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const next = !favorited;
    setFavorited(next); // optimistic
    startTransition(async () => {
      try {
        const result = await toggleFavorite(eventId);
        setFavorited(result.favorited);
      } catch {
        setFavorited(!next); // revert on failure
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={favorited}
      aria-label={favorited ? "Favorilerden çıkar" : "Favorilere ekle"}
      title={favorited ? "Favorilerden çıkar" : "Favorilere ekle"}
      className={
        className ??
        "flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-60"
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
  );
}

"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/amedspor";

/**
 * "Maça 7 gün 21 saat kaldı", ticking once a minute. The server renders it
 * with its own clock; the browser's may differ by a minute or two, so the
 * first client render may change the text — hence suppressHydrationWarning.
 */
export default function MatchCountdown({ startAt }: { startAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const left = formatCountdown(new Date(startAt).getTime() - now);
  return (
    <span suppressHydrationWarning>{left ? <>Maça <strong className="font-extrabold">{left}</strong> kaldı</> : "Maç başladı"}</span>
  );
}

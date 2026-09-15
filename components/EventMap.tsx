"use client";

import dynamic from "next/dynamic";
import type { MapMarker } from "./EventMapInner";

export type { MapMarker };

// Leaflet touches `window` at module load time, which breaks the server
// render of this (already client-only) component — so the actual map
// implementation is loaded with ssr disabled.
const EventMapInner = dynamic(() => import("./EventMapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 w-full items-center justify-center rounded-xl bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
      Harita yükleniyor...
    </div>
  ),
});

export default function EventMap({
  markers,
  className,
}: {
  markers: MapMarker[];
  className?: string;
}) {
  return <EventMapInner markers={markers} className={className} />;
}

"use client";

import dynamic from "next/dynamic";
import type { MapMarker } from "./EventMapInner";

export type { MapMarker };

// Leaflet touches `window` at module load time, which breaks the server
// render of this (already client-only) component — so the actual map
// implementation is loaded with ssr disabled.
//
// next/dynamic's `loading` option never receives the wrapped component's
// props, so it can't know the caller's className/height — it just fills
// `h-full w-full` of whatever the component below sizes it into, which
// keeps the fallback the exact size of the real map at every call site
// instead of a hard-coded height that made the page jump once Leaflet
// finished loading.
const EventMapInner = dynamic(() => import("./EventMapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-surface-muted text-sm text-zinc-500 dark:text-zinc-400">
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
  return (
    // `overflow-hidden` here does the clipping that leaflet.css's own
    // `.leaflet-container { overflow: hidden }` used to provide for free
    // when className (incl. rounded-*) went straight onto MapContainer —
    // now that className sizes this wrapper instead, it has to clip too.
    <div className={`overflow-hidden ${className ?? "h-96 w-full"}`}>
      <EventMapInner markers={markers} className="h-full w-full" />
    </div>
  );
}

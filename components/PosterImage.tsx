"use client";

import { useEffect, useRef, useState } from "react";

/**
 * An event poster in a fixed frame, with a fallback for images that fail.
 *
 * Posters are mostly portrait but some sources send wide banners. Blurred
 * fill: a scaled, blurred copy of the image fills the frame and the real
 * image sits on top with object-contain, so no poster loses its title or
 * date to a crop. Both tags use the same URL, so it's one request. Plain
 * <img> keeps this free of next.config.ts remote-image configuration.
 *
 * Source images do fail — a host blocks cross-site embedding, a file is
 * removed after the event — and a broken <img> renders as an empty frame
 * with the browser's broken-image icon. On error the frame shows `fallback`
 * instead. The effect covers the case where the image already failed
 * before hydration attached `onError`.
 */
export default function PosterImage({
  src,
  alt,
  fallback,
  priority = false,
  hoverZoom = false,
}: {
  src: string | null;
  alt: string;
  /** Shown when there is no image or it fails to load. */
  fallback: React.ReactNode;
  /** Load eagerly at high priority (the page's LCP candidate). */
  priority?: boolean;
  /** Slight zoom on hover of the nearest `.group` ancestor. */
  hoverZoom?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) setFailed(true);
  }, []);

  if (!src || failed) return <>{fallback}</>;

  const loading = priority ? "eager" : "lazy";
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading={loading}
        decoding="async"
        className="absolute inset-0 h-full w-full scale-125 object-cover blur-xl"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        loading={loading}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onError={() => setFailed(true)}
        className={`relative h-full w-full object-contain${
          hoverZoom ? " transition-transform duration-300 group-hover:scale-[1.03]" : ""
        }`}
      />
    </>
  );
}

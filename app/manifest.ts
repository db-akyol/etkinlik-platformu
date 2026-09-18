import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Diyarbakır Etkinlik",
    short_name: "Etkinlik",
    description:
      "Diyarbakır'daki konser, tiyatro, atölye, fuar ve spor etkinliklerini tek yerden keşfedin.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f6e78",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      // Maskable-only 512 leaves no non-cropped large icon — the mark's
      // centered pin-on-teal design is already safe-zone-compliant, so the
      // same file doubles as the plain "any" entry.
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

/**
 * generate-icons.ts — ONE-SHOT generator, not part of the build.
 *
 * Rasterizes the app's brand mark (a solid Dicle-teal field with the white
 * map-pin glyph, reused from the `pinIcon` divIcon in
 * components/EventMapInner.tsx) into every PNG icon the app ships:
 *
 *   public/icons/icon-192.png  (manifest, purpose "any")
 *   public/icons/icon-512.png  (manifest, purpose "maskable" + "any")
 *   app/icon.png               (browser tab favicon, Next.js file convention)
 *   app/apple-icon.png         (iOS home-screen icon, Next.js file convention)
 *
 * There's no image library in this project (and it shouldn't grow one just
 * for four static PNGs), but `playwright` is already a dependency, so this
 * draws the mark as inline SVG, loads it in headless Chromium sized to the
 * exact target viewport, and screenshots it — no cropping/resizing math left
 * to a second tool.
 *
 * Re-run this whenever the brand mark or the --color-dicle value in
 * app/globals.css changes. It overwrites the files above in place; commit
 * the result. Command:
 *
 *   npx tsx scripts/generate-icons.ts
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// Keep in sync with --color-dicle in app/globals.css (light-mode value —
// the icon is a static asset, it doesn't get a dark-mode variant).
const DICLE = "#0f6e78";

// Pin path + inner-circle radius copied from the `pinIcon` divIcon in
// components/EventMapInner.tsx so the app icon matches the map markers.
// Source of truth is that file — edit it there, then re-run this script,
// rather than hand-editing the geometry here.
const PIN_PATH =
  "M14 0C6.3 0 0 6.3 0 14c0 10.5 14 24 14 24s14-13.5 14-24C28 6.3 21.7 0 14 0z";
const PIN_HOLE_R = 5.5;
const PIN_VIEWBOX_W = 28;
const PIN_VIEWBOX_H = 38;

/**
 * Builds a full-bleed square icon: a solid teal field with the pin glyph
 * centered and scaled so its height is 50% of the canvas. That leaves the
 * glyph comfortably inside the central 80% "safe zone" maskable icons get
 * cropped to, so the same 512px image works for both the "maskable" and the
 * plain "any" manifest entries — no separate crop-safe variant needed.
 *
 * The glyph is drawn white-on-teal (inverted from the map pin's teal-on-
 * white) with the inner circle punched through in the field color, so it
 * reads as the same pin shape rather than a solid teardrop.
 */
function buildIconSvg(size: number): string {
  const scale = size / (PIN_VIEWBOX_H * 2); // pin height -> 50% of canvas
  const w = PIN_VIEWBOX_W * scale;
  const h = PIN_VIEWBOX_H * scale;
  const tx = (size - w) / 2;
  const ty = (size - h) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${DICLE}"/>
  <g transform="translate(${tx}, ${ty}) scale(${scale})">
    <path d="${PIN_PATH}" fill="#ffffff"/>
    <circle cx="14" cy="14" r="${PIN_HOLE_R}" fill="${DICLE}"/>
  </g>
</svg>`;
}

type Target = { size: number; outFile: string };

const TARGETS: Target[] = [
  { size: 192, outFile: "public/icons/icon-192.png" },
  { size: 512, outFile: "public/icons/icon-512.png" },
  { size: 32, outFile: "app/icon.png" },
  { size: 180, outFile: "app/apple-icon.png" },
];

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const { size, outFile } of TARGETS) {
      await page.setViewportSize({ width: size, height: size });
      const svg = buildIconSvg(size);
      // The SVG's own width/height match the viewport exactly, so a plain
      // (non-full-page) screenshot captures precisely the target canvas
      // with no scrollbars or background bleed to crop.
      const html = `<!doctype html><html><head><style>html,body{margin:0;padding:0;}</style></head><body>${svg}</body></html>`;
      await page.goto(`data:text/html,${encodeURIComponent(html)}`);

      const outPath = path.resolve(process.cwd(), outFile);
      await mkdir(path.dirname(outPath), { recursive: true });
      await page.screenshot({ path: outPath });
      console.log(`wrote ${outFile} (${size}x${size})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("generate-icons failed:", err);
  process.exit(1);
});

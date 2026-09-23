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
 *   public/og-default.png      (1200x630 Open Graph card, app/layout.tsx)
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

// Open Graph's de-facto standard card size. Everything that renders a link
// preview (WhatsApp, X, Slack, Telegram, Facebook) is happy with 1200x630.
const OG_W = 1200;
const OG_H = 630;

/**
 * The card shown when the SITE's own URL is shared — event pages use the
 * event's own poster instead, and only fall back to this.
 *
 * Rendered in real Chromium rather than with an image library or a runtime
 * ImageResponse, specifically because of the text: "Diyarbakır" and
 * "Şehirdeki" need a dotless ı, a ğ and a Ş, and a renderer with an
 * incomplete font falls back to tofu boxes on exactly the brand name. Real
 * Chromium with a real font stack cannot get that wrong.
 */
function buildOgSvg(): string {
  const pinScale = 150 / PIN_VIEWBOX_H;
  const pinW = PIN_VIEWBOX_W * pinScale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
  <rect width="${OG_W}" height="${OG_H}" fill="${DICLE}"/>
  <g transform="translate(${(OG_W - pinW) / 2}, 96) scale(${pinScale})">
    <path d="${PIN_PATH}" fill="#ffffff"/>
    <circle cx="14" cy="14" r="${PIN_HOLE_R}" fill="${DICLE}"/>
  </g>
  <text x="${OG_W / 2}" y="360" text-anchor="middle"
        font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="86" font-weight="700" fill="#ffffff">Diyarbakır Etkinlik</text>
  <text x="${OG_W / 2}" y="432" text-anchor="middle"
        font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="38" font-weight="400" fill="#ffffff" opacity="0.85">Şehirdeki tüm etkinlikler tek yerde</text>
  <text x="${OG_W / 2}" y="536" text-anchor="middle"
        font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="30" font-weight="500" fill="#ffffff" opacity="0.7">Konser · Tiyatro · Atölye · Fuar · Spor</text>
</svg>`;
}

type Target = { width: number; height: number; outFile: string; svg: string };

const TARGETS: Target[] = [
  { width: 192, height: 192, outFile: "public/icons/icon-192.png", svg: buildIconSvg(192) },
  { width: 512, height: 512, outFile: "public/icons/icon-512.png", svg: buildIconSvg(512) },
  { width: 32, height: 32, outFile: "app/icon.png", svg: buildIconSvg(32) },
  { width: 180, height: 180, outFile: "app/apple-icon.png", svg: buildIconSvg(180) },
  { width: OG_W, height: OG_H, outFile: "public/og-default.png", svg: buildOgSvg() },
];

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const { width, height, outFile, svg } of TARGETS) {
      await page.setViewportSize({ width, height });
      // The SVG's own width/height match the viewport exactly, so a plain
      // (non-full-page) screenshot captures precisely the target canvas
      // with no scrollbars or background bleed to crop.
      //
      // setContent, not a `data:text/html,...` URL: a data URL declares no
      // charset, so Chromium decodes the percent-encoded UTF-8 as Latin-1 and
      // every Turkish character in the OG card comes out as mojibake
      // ("DiyarbakÄ±r"). The explicit <meta charset> is belt and braces.
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;}</style></head><body>${svg}</body></html>`;
      await page.setContent(html, { waitUntil: "load" });
      // Text is only measured correctly once the font stack has resolved.
      await page.evaluate(() => document.fonts.ready);

      const outPath = path.resolve(process.cwd(), outFile);
      await mkdir(path.dirname(outPath), { recursive: true });
      await page.screenshot({ path: outPath });
      console.log(`wrote ${outFile} (${width}x${height})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("generate-icons failed:", err);
  process.exit(1);
});

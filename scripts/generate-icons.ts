/**
 * generate-icons.ts — ONE-SHOT generator, not part of the build.
 *
 * Rasterizes the app's brand mark — the calendar leaf with Diyarbakır's
 * plate code "21" on it, the same mark as the logo in the site header
 * (app/(public)/layout.tsx) — into every PNG icon the app ships:
 *
 *   public/icons/icon-192.png  (manifest, purpose "any")
 *   public/icons/icon-512.png  (manifest, purpose "maskable" + "any")
 *   app/icon.png               (browser tab favicon, Next.js file convention;
 *                               64px with rounded corners, so it stays crisp
 *                               on high-DPI tabs and doesn't read as a block)
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

// The header logo's display font. Loaded from Google Fonts into the page
// that renders the icons; the render waits for it (document.fonts.ready).
const FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&display=block";
const FONT_FAMILY = "'Bricolage Grotesque', 'Segoe UI', Arial, sans-serif";

/**
 * Bricolage Grotesque is a variable font whose optical size follows the
 * font size: at icon sizes it would turn plain and wide. 'opsz' 14 pins the
 * character of the small header logo at every size.
 *
 * The calendar-leaf mark drawn into a `size` square: the binding bar near the
 * top and "21" below it, both white on the teal field. Everything sits in the
 * central 80% "safe zone" maskable icons get cropped to, so the full-bleed
 * 512px image serves both the "maskable" and the plain "any" manifest
 * entries.
 */
function leafMark(size: number): string {
  const barW = size * 0.42;
  const barH = Math.max(1.5, size * 0.055);
  return `<rect x="${(size - barW) / 2}" y="${size * 0.2}" width="${barW}" height="${barH}" rx="${barH / 2}" fill="#ffffff" opacity="0.6"/>
  <text x="${size / 2}" y="${size * 0.78}" text-anchor="middle" font-family="${FONT_FAMILY}"
        font-size="${size * 0.5}" font-weight="800" letter-spacing="${-size * 0.015}" fill="#ffffff"
        style="font-variation-settings: 'opsz' 14">21</text>`;
}

/** Full-bleed square icon; `rounded` gives it rounded corners on a transparent canvas instead. */
function buildIconSvg(size: number, rounded = false): string {
  const radius = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${DICLE}"/>
  ${leafMark(size)}
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
  const mark = 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
  <rect width="${OG_W}" height="${OG_H}" fill="${DICLE}"/>
  <g transform="translate(${(OG_W - mark) / 2}, 96)">
    <rect width="${mark}" height="${mark}" rx="${mark * 0.22}" fill="#ffffff" opacity="0.14"/>
    ${leafMark(mark)}
  </g>
  <text x="${OG_W / 2}" y="360" text-anchor="middle"
        font-family="${FONT_FAMILY}"
        font-size="86" font-weight="800" fill="#ffffff">Diyarbakır Etkinlik</text>
  <text x="${OG_W / 2}" y="432" text-anchor="middle"
        font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="38" font-weight="400" fill="#ffffff" opacity="0.85">Şehirdeki tüm etkinlikler tek yerde</text>
  <text x="${OG_W / 2}" y="536" text-anchor="middle"
        font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="30" font-weight="500" fill="#ffffff" opacity="0.7">Konser · Tiyatro · Stand-up · Spor · Çocuk</text>
</svg>`;
}

type Target = { width: number; height: number; outFile: string; svg: string; transparent?: boolean };

const TARGETS: Target[] = [
  { width: 192, height: 192, outFile: "public/icons/icon-192.png", svg: buildIconSvg(192) },
  { width: 512, height: 512, outFile: "public/icons/icon-512.png", svg: buildIconSvg(512) },
  { width: 64, height: 64, outFile: "app/icon.png", svg: buildIconSvg(64, true), transparent: true },
  { width: 180, height: 180, outFile: "app/apple-icon.png", svg: buildIconSvg(180) },
  { width: OG_W, height: OG_H, outFile: "public/og-default.png", svg: buildOgSvg() },
];

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const { width, height, outFile, svg, transparent } of TARGETS) {
      await page.setViewportSize({ width, height });
      // The SVG's own width/height match the viewport exactly, so a plain
      // (non-full-page) screenshot captures precisely the target canvas
      // with no scrollbars or background bleed to crop.
      //
      // setContent, not a `data:text/html,...` URL: a data URL declares no
      // charset, so Chromium decodes the percent-encoded UTF-8 as Latin-1 and
      // every Turkish character in the OG card comes out as mojibake
      // ("DiyarbakÄ±r"). The explicit <meta charset> is belt and braces.
      const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONT_CSS}"><style>html,body{margin:0;padding:0;background:transparent;}</style></head><body>${svg}</body></html>`;
      await page.setContent(html, { waitUntil: "load" });
      // Text is only measured correctly once the font stack has resolved.
      // document.fonts.ready alone can resolve before a web font that's only
      // used inside SVG <text> has even started loading (the first icon came
      // out in the fallback font), so request the display font explicitly.
      await page.evaluate(() => document.fonts.load("800 64px 'Bricolage Grotesque'", "21"));
      await page.evaluate(() => document.fonts.ready);

      const outPath = path.resolve(process.cwd(), outFile);
      await mkdir(path.dirname(outPath), { recursive: true });
      // Transparent corners for the rounded favicon; the rest are full-bleed.
      await page.screenshot({ path: outPath, omitBackground: transparent ?? false });
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

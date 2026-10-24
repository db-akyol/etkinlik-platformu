/**
 * Shared bits for the Amedspor match banner (components/AmedsporBanner.tsx).
 * Matches come from scripts/scrapers/amedspor-tff.ts, which stores them with
 * their tff.org match page as `source_url`.
 */

/** Where tickets are sold. Linked to, never scraped (see amedspor-tff.ts). */
export const PASSO_URL = "https://www.passo.com.tr/tr";

/** How the banner recognises a match row: its source is a TFF match page. */
export const TFF_MATCH_URL_PREFIX = "https://www.tff.org/Default.aspx?pageID=29&macId=";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "7 gün 21 saat", "5 saat 12 dakika", "8 dakika" — the time left until
 * kick-off, coarse enough to read at a glance. Null once it has started.
 */
export function formatCountdown(msLeft: number): string | null {
  if (msLeft <= 0) return null;
  const days = Math.floor(msLeft / DAY);
  const hours = Math.floor((msLeft % DAY) / HOUR);
  const minutes = Math.max(1, Math.floor((msLeft % HOUR) / MINUTE));
  if (days > 0) return hours > 0 ? `${days} gün ${hours} saat` : `${days} gün`;
  if (hours > 0) return `${hours} saat ${minutes} dakika`;
  return `${minutes} dakika`;
}

/**
 * Display formatters for an event's date/price.
 *
 * These live here rather than in components/EventCard.tsx (where they used
 * to) for two reasons: they're pure string functions with no React in them,
 * and keeping them out of a component file means a plain Node test can
 * import them without dragging `next/link` and the React runtime along.
 * That matters — `formatEventDateTime` is exactly where the "every event
 * shows 3 hours early" bug lived, so it's worth having under test (see
 * lib/format-event.test.ts).
 */

/**
 * Formats an ISO timestamp as "14 Eylül 2026, 20:00" in Turkish locale.
 *
 * `timeZone: "Europe/Istanbul"` is required here, not cosmetic: without it
 * `Intl.DateTimeFormat` renders in the RUNTIME's timezone (Vercel's Node
 * functions default to UTC), which silently showed every event 3 hours
 * earlier than its real Turkey-local start time.
 */
export function formatEventDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    // `hourCycle: "h23"` rather than `hour12: false` — those are not
    // synonyms, and in some locales the latter selects `h24`, which renders
    // midnight as "24:15" instead of "00:15" (it really did in `en-CA`, see
    // lib/istanbul-time.ts). `tr-TR` happens to pick h23 either way today,
    // but that's a property of the locale data, not a guarantee.
    hourCycle: "h23",
    timeZone: "Europe/Istanbul",
  }).format(date);
  return `${datePart}, ${timePart}`;
}

/**
 * Returns the display price, or null when none is known. A missing price is
 * NOT "free": scrapers store "Ücretsiz" themselves when the source marks an
 * event free, so an empty field only means the source didn't say (or its
 * detail page failed to load).
 */
export function formatEventPrice(price: string | null): string | null {
  if (!price || price.trim() === "") return null;
  return price.trim();
}

/** The Istanbul calendar day a given instant falls on, as "YYYY-MM-DD". */
export function istanbulDayKey(date: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

/** "20:00" — an event's start time in Istanbul. */
export function formatEventTime(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Istanbul",
  }).format(new Date(iso));
}

/** The day number and short month for a card's calendar-leaf stamp: { day: "26", month: "Eyl" }. */
export function formatEventStamp(iso: string): { day: string; month: string } {
  const parts = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Istanbul",
  }).formatToParts(new Date(iso));
  return {
    day: parts.find((part) => part.type === "day")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
  };
}

/*
 * The helpers below take a "YYYY-MM-DD" day key that is ALREADY an Istanbul
 * calendar date, so they read it back at noon UTC with `timeZone: "UTC"`.
 * Noon keeps the date safely inside the same day whatever the runtime
 * timezone; re-applying Europe/Istanbul would be converting twice.
 */
function dayKeyDate(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00Z`);
}

function formatDayKey(dayKey: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("tr-TR", { ...options, timeZone: "UTC" }).format(dayKeyDate(dayKey));
}

/**
 * The heading for one day's group in the listing:
 * { title: "Yarın", detail: "Cumartesi, 26 Eylül" } or, further out,
 * { title: "Perşembe", detail: "1 Ekim" }.
 */
export function formatDayHeading(dayKey: string, todayKey: string): { title: string; detail: string } {
  const diff = Math.round((dayKeyDate(dayKey).getTime() - dayKeyDate(todayKey).getTime()) / 86_400_000);
  const weekday = formatDayKey(dayKey, { weekday: "long" });
  const dayMonth = formatDayKey(dayKey, { day: "numeric", month: "long" });
  if (diff === 0) return { title: "Bugün", detail: `${weekday}, ${dayMonth}` };
  if (diff === 1) return { title: "Yarın", detail: `${weekday}, ${dayMonth}` };
  return { title: weekday, detail: dayMonth };
}

const DAY_MS = 86_400_000;

function addDays(dayKey: string, days: number): string {
  return new Date(dayKeyDate(dayKey).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** "25 – 27 Eylül" or "28 Eylül – 4 Ekim". */
function formatDayRange(from: string, to: string): string {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const start = formatDayKey(from, sameMonth ? { day: "numeric" } : { day: "numeric", month: "long" });
  return `${start} – ${formatDayKey(to, { day: "numeric", month: "long" })}`;
}

/**
 * The section of the all-days listing an event day falls in: "Bugün",
 * "Yarın", "Bu hafta" (the rest of this Monday-to-Sunday week), "Gelecek
 * hafta", then one section per month. Coarser than one heading per day on
 * purpose: most days have one or two events, and a heading per day left the
 * page mostly headings.
 */
export function listingSection(
  dayKey: string,
  todayKey: string,
): { key: string; title: string; detail: string } {
  const diff = Math.round((dayKeyDate(dayKey).getTime() - dayKeyDate(todayKey).getTime()) / DAY_MS);
  if (diff <= 1) {
    const heading = formatDayHeading(dayKey, todayKey);
    return { key: diff <= 0 ? "bugun" : "yarin", title: heading.title, detail: heading.detail };
  }

  // Monday-based weeks: getUTCDay() is 0 for Sunday.
  const thisSunday = addDays(todayKey, (7 - dayKeyDate(todayKey).getUTCDay()) % 7);
  const nextSunday = addDays(thisSunday, 7);
  if (dayKey <= thisSunday) {
    return { key: "bu-hafta", title: "Bu hafta", detail: formatDayRange(addDays(todayKey, 2), thisSunday) };
  }
  if (dayKey <= nextSunday) {
    return { key: "gelecek-hafta", title: "Gelecek hafta", detail: formatDayRange(addDays(thisSunday, 1), nextSunday) };
  }

  const month = formatDayKey(dayKey, { month: "long" });
  const sameYear = dayKey.slice(0, 4) === todayKey.slice(0, 4);
  return {
    key: `ay-${dayKey.slice(0, 7)}`,
    title: sameYear ? month : `${month} ${dayKey.slice(0, 4)}`,
    detail: "",
  };
}

/** Short weekday and day number for the mobile date strip: { weekday: "Cmt", day: "26" }. */
export function formatDayChip(dayKey: string): { weekday: string; day: string } {
  return {
    weekday: formatDayKey(dayKey, { weekday: "short" }),
    day: formatDayKey(dayKey, { day: "numeric" }),
  };
}

/** "Eylül 2026" for a month given as any day key inside it. */
export function formatMonthLabel(dayKey: string): string {
  return formatDayKey(dayKey, { month: "long", year: "numeric" });
}

/** "26 Eylül Cumartesi" — a selected day, spelled out. */
export function formatDayLong(dayKey: string): string {
  return formatDayKey(dayKey, { day: "numeric", month: "long", weekday: "long" });
}

function capitalizeTr(word: string): string {
  const lower = word.toLocaleLowerCase("tr-TR");
  return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
}

/**
 * Splits the festival suffix off Devlet Tiyatroları listings:
 * "Hep Yek - İSTANBUL DT - 22.DOA" → { title: "Hep Yek",
 * subtitle: "İstanbul Devlet Tiyatrosu" }. Any other title passes through
 * with no subtitle. Display only — the stored title (and the dedup logic
 * keyed on it) is untouched.
 */
export function splitEventTitle(title: string): { title: string; subtitle: string | null } {
  const match = title.match(/^(.+?)\s+-\s+([A-ZÇĞİÖŞÜ]+(?:\s[A-ZÇĞİÖŞÜ]+)*)\s+DT\s+-\s+\d+\.\s*DOA$/u);
  if (!match) return { title, subtitle: null };
  const city = match[2].split(" ").map(capitalizeTr).join(" ");
  return { title: match[1], subtitle: `${city} Devlet Tiyatrosu` };
}

/**
 * Drops a leading "Diyarbakır " from a venue name. Every venue on the site
 * is in Diyarbakır, and on a narrow card the prefix pushes the part that
 * actually identifies the venue out of view. Kept when fewer than two words
 * would remain ("Diyarbakır Surları" is the name, not a prefix).
 */
export function shortVenueName(name: string): string {
  const rest = name.replace(/^Diyarbakır\s+/u, "");
  return rest.trim().split(/\s+/).length >= 2 ? rest : name;
}

/**
 * The venue line under a card's title: the short venue name, with a
 * trailing "DT" spelled out ("Diyarbakır DT" → "Diyarbakır Devlet
 * Tiyatrosu") to match the company line `splitEventTitle` produces. Null
 * when that would repeat the company line word for word — a home
 * production at its own theatre otherwise read "Diyarbakır Devlet
 * Tiyatrosu / Diyarbakır DT".
 */
export function cardVenueLine(venueName: string, subtitle: string | null): string | null {
  const line = shortVenueName(venueName).replace(/\sDT$/u, " Devlet Tiyatrosu");
  const same = subtitle && line.toLocaleLowerCase("tr-TR") === subtitle.toLocaleLowerCase("tr-TR");
  return same ? null : line;
}

/**
 * The compact text for a card's date badge: "Bugün 20:00", "Yarın 20:00" or
 * "18 Eyl 20:00". `soon` marks the first two so the card can highlight them.
 *
 * Same `timeZone: "Europe/Istanbul"` requirement as `formatEventDateTime`
 * above — see that function's comment. It applies to the day comparison too:
 * between 00:00 and 03:00 Istanbul time the UTC date is still yesterday's,
 * so a naive comparison would label tonight's events as "Yarın".
 */
export function formatEventBadge(
  iso: string,
  now: Date = new Date(),
): { text: string; soon: boolean } {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Istanbul",
  }).format(date);

  const eventDay = istanbulDayKey(date);
  if (eventDay === istanbulDayKey(now)) return { text: `Bugün ${time}`, soon: true };

  // Turkey has had no DST since 2016, so a flat 24h step always lands on the
  // next Istanbul calendar day.
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (eventDay === istanbulDayKey(tomorrow)) return { text: `Yarın ${time}`, soon: true };

  const dayMonth = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Istanbul",
  }).format(date);
  return { text: `${dayMonth} ${time}`, soon: false };
}

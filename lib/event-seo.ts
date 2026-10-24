/**
 * What search engines read about an event page: its <title>, meta
 * description and schema.org Event JSON-LD.
 *
 * The page's visible design leaves the city, date and venue to the layout
 * around the title, but a search result shows only the title and
 * description — so both spell those facts out. The JSON-LD is what makes an
 * event eligible for Google's event listings in search results.
 *
 * Pure functions with no React or Next imports, so lib/event-seo.test.ts can
 * run under plain Node.
 */

import { parsePriceTL } from "./event-filters";
import { formatEventTime, splitEventTitle } from "./format-event";

const CITY = "Diyarbakır";
const MAX_DESCRIPTION = 160;

type SeoVenue = { name: string; address: string | null; lat: number | null; lng: number | null };

export type SeoEvent = {
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  price: string | null;
  image_url: string | null;
  source_url: string | null;
  venue: SeoVenue | null;
};

function formatIstanbul(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("tr-TR", { ...options, timeZone: "Europe/Istanbul" }).format(new Date(iso));
}

/** "Diyarbakır DT" → "Diyarbakır Devlet Tiyatrosu": people search for the name, not the abbreviation. */
function venueName(venue: SeoVenue): string {
  return venue.name.replace(/\sDT$/u, " Devlet Tiyatrosu");
}

/** The venue, with the city added when its name doesn't already say it. */
function placeText(venue: SeoVenue | null): string {
  if (!venue) return CITY;
  const name = venueName(venue);
  return name.toLocaleLowerCase("tr-TR").includes(CITY.toLocaleLowerCase("tr-TR")) ? name : `${name}, ${CITY}`;
}

/** Some sources repeat the start as the end when they have no real one. */
function realEndAt(event: Pick<SeoEvent, "start_at" | "end_at">): string | null {
  return event.end_at && event.end_at > event.start_at ? event.end_at : null;
}

/** Sources without a real description often repeat the title there. */
function realDescription(event: Pick<SeoEvent, "title" | "description">): string | null {
  const text = event.description?.replace(/\s+/g, " ").trim();
  return text && text !== event.title.trim() ? text : null;
}

/** "Hep Yek – 2 Ekim 2026, Diyarbakır DT" (the layout adds " | Diyarbakır Etkinlik"). */
export function eventPageTitle(event: SeoEvent): string {
  const { title } = splitEventTitle(event.title);
  const date = formatIstanbul(event.start_at, { day: "numeric", month: "long", year: "numeric" });
  return `${title} – ${date}, ${placeText(event.venue)}`;
}

/** Date, time, place and price first, then as much of the description as fits. */
export function eventMetaDescription(event: SeoEvent): string {
  const { title, subtitle } = splitEventTitle(event.title);
  const date = formatIstanbul(event.start_at, { day: "numeric", month: "long", year: "numeric", weekday: "long" });
  const price = event.price?.trim();
  const parts = [
    `${title}${subtitle ? ` (${subtitle})` : ""}: ${date} ${formatEventTime(event.start_at)}, ${placeText(event.venue)}.`,
    price ? `Bilet: ${price}.` : null,
    realDescription(event),
  ].filter(Boolean);
  const text = parts.join(" ");
  return text.length <= MAX_DESCRIPTION ? text : `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`;
}

/**
 * "2026-10-02T20:00:00+03:00": Istanbul wall-clock time with its offset,
 * which is what schema.org dates should carry. Turkey has had a fixed
 * UTC+3 with no DST since 2016.
 */
function istanbulIsoWithOffset(iso: string): string {
  const local = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}+03:00`;
}

/**
 * Who performs, from what the sources actually say: the touring company of a
 * Devlet Tiyatroları listing (the title's suffix), bubilet's "Sanatçılar:
 * A, B" description, or an "X Konseri" title. Nothing is guessed beyond
 * those; with none of them the field is left out.
 */
function eventPerformers(event: SeoEvent): Performer[] {
  const { title, subtitle } = splitEventTitle(event.title);
  if (subtitle) return [{ "@type": "PerformingGroup", name: subtitle }];

  const artists = event.description?.match(/^Sanatçılar:\s*(.+)$/mu)?.[1];
  if (artists) {
    return artists
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ "@type": "Person", name }));
  }

  const concert = title.match(/^(.+?)\s+Konseri$/iu)?.[1];
  return concert ? [{ "@type": "Person", name: concert.trim() }] : [];
}

type Performer = { "@type": "Person" | "PerformingGroup"; name: string };

export type EventJsonLd = {
  "@context": "https://schema.org";
  "@type": "Event";
  name: string;
  startDate: string;
  endDate: string;
  eventStatus: string;
  eventAttendanceMode: string;
  location: {
    "@type": "Place";
    name: string;
    address: { "@type": "PostalAddress"; streetAddress?: string; addressLocality: string; addressCountry: "TR" };
    geo?: { "@type": "GeoCoordinates"; latitude: number; longitude: number };
  };
  url: string;
  image?: string[];
  description?: string;
  performer?: Performer[];
  offers?: { "@type": "Offer"; price: number; priceCurrency: "TRY"; url?: string };
};

/** schema.org Event for one event page; `pageUrl` is the page's absolute URL. */
export function eventJsonLd(event: SeoEvent, pageUrl: string): EventJsonLd {
  const { title } = splitEventTitle(event.title);
  const endAt = realEndAt(event);
  const performers = eventPerformers(event);
  const description = realDescription(event);
  const amount = parsePriceTL(event.price);
  const venue = event.venue;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: title,
    startDate: istanbulIsoWithOffset(event.start_at),
    // Most sources give no end time. The start's Istanbul day alone ("ends
    // that day") holds for nearly every listing — evening shows — without
    // inventing a time; only a late show running past midnight is off, by a
    // day boundary, never by a made-up hour.
    endDate: endAt ? istanbulIsoWithOffset(endAt) : istanbulIsoWithOffset(event.start_at).slice(0, 10),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: venue ? venueName(venue) : CITY,
      address: {
        "@type": "PostalAddress",
        ...(venue?.address ? { streetAddress: venue.address } : {}),
        addressLocality: CITY,
        addressCountry: "TR",
      },
      ...(venue?.lat != null && venue?.lng != null
        ? { geo: { "@type": "GeoCoordinates", latitude: venue.lat, longitude: venue.lng } }
        : {}),
    },
    url: pageUrl,
    ...(event.image_url ? { image: [event.image_url] } : {}),
    ...(description ? { description } : {}),
    ...(performers.length > 0 ? { performer: performers } : {}),
    ...(amount != null
      ? {
          offers: {
            "@type": "Offer",
            price: amount,
            priceCurrency: "TRY",
            ...(event.source_url ? { url: event.source_url } : {}),
          },
        }
      : {}),
  };
}

/**
 * JSON for a <script type="application/ld+json"> tag. Titles and
 * descriptions come from scraped third-party pages, so "<" is escaped:
 * otherwise a "</script>" in the text would end the tag and the rest would
 * run as HTML.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Whether an event is over as of `floor` (midnight Istanbul today, from
 * getUpcomingFloor): it started before today and has no end time after it.
 * Matches what the listing shows, so a page drops out of the index the day
 * it drops off the listing.
 */
export function isPastEvent(event: Pick<SeoEvent, "start_at" | "end_at">, floor: string): boolean {
  const lastMoment = realEndAt(event) ?? event.start_at;
  return new Date(lastMoment).getTime() < new Date(floor).getTime();
}

"""
bubilet_fetch.py — fetches Diyarbakır events from bubilet.com.tr's JSON API.

This exists as a separate Python script (invoked as a subprocess by
bubilet.ts) rather than a TypeScript parser like every other source in this
directory, for one reason: bubilet.com.tr sits behind a Cloudflare
bot-challenge that blocks plain HTTP requests, and `cloudscraper` (Python)
is what successfully gets past it here. This is a deliberate exception to
this project's usual approach of NOT building around a source's bot
protection — see docs/session-handoff.md and scripts/scrapers/README.md for
the reasoning and the explicit decision to do it anyway for this source.

This script's only job is "get the raw event JSON out of bubilet, with the
correct category attached". Everything else — normalizing text, resolving
venue/category ids, deduping against other sources, upserting — happens on
the TypeScript side (bubilet.ts) via the same shared pipeline every other
parser uses. Keeping this split means only the Cloudflare-bypass part is
Python; the part that actually has to stay correct and testable (field
mapping) is TypeScript like the rest of the codebase.

Usage: python bubilet_fetch.py <output-json-path>
"""
import json
import sys
import time

import cloudscraper

CITY_ID = 21  # Diyarbakır, per bubilet's own city id (confirmed via their site)

# bubilet's `tag/{id}` endpoint is how their own site's category pages
# (bubilet.com.tr/diyarbakir/etiket/konser, etc.) are implemented — confirmed
# by reading the tag id/slug/name list embedded in that page's own RSC
# payload. `tag/6` ("Trendler" — a curated "trending" list, not a category)
# is deliberately NOT used here even though it's the endpoint most obviously
# discoverable from the site's homepage API calls: relying on it would both
# miss most of the real catalog and give us the wrong category for
# everything, since an item returned by tag/6 doesn't carry its real
# category (e.g. "Konser") in its own `tags` field.
#
# Maps directly to this project's fixed category set
# (supabase/seed.sql) — "Workshop" is bubilet's own name for what we call
# "Atölye". There's no bubilet tag that cleanly matches "Fuar", so that
# category is left to other sources.
TAG_TO_CATEGORY = {
    2: "Konser",
    1: "Tiyatro",
    50: "Atölye",
    37: "Spor",
}

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "origin": "https://www.bubilet.com.tr",
    "referer": "https://www.bubilet.com.tr/",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
}


def pick_image_url(files):
    """Prefers the horizontal ("yatayResim") image bubilet provides, to
    match the 16:9 card thumbnail every other source's image is shown in.
    Falls back to whatever image comes first if that display area is
    missing."""
    if not files:
        return None
    horizontal = next((f for f in files if f.get("displayArea") == "yatayResim"), None)
    chosen = horizontal or files[0]
    rel_url = chosen.get("url", "")
    if not rel_url:
        return None
    return f"https://www.bubilet.com.tr{rel_url}" if rel_url.startswith("/") else rel_url


def is_actually_diyarbakir(item):
    """bubilet's `city/{id}/tag/{id}` filter is not reliable on its own — a
    nationally-touring event (confirmed live example: "Bosphorus Open Air
    Metal Fest", venue in Istanbul) came back from `city/21/...` anyway,
    presumably because bubilet cross-lists some events into every city's
    feed for promotion. Each *venue* entry carries its own real `cityId`
    though (session-level data, not the city/tag URL parameter), which is
    what venues.html actually uses to place the event on a map — trust that
    instead. An item with no venue city info at all is let through rather
    than dropped, since we'd rather show an uncertain event than silently
    lose a real Diyarbakır one to a missing field."""
    venues = item.get("venues") or []
    city_ids = [v.get("cityId") for v in venues if v.get("cityId") is not None]
    if not city_ids:
        return True
    return CITY_ID in city_ids


def parse_item(item, category_name):
    venues = item.get("venues") or []
    venue_name = venues[0].get("name") if venues else None

    performers = [p.get("name") for p in item.get("performers", []) if p.get("name")]
    dates = item.get("dates") or []

    return {
        "id": item.get("id"),
        "title": item.get("name"),
        "url": f"https://www.bubilet.com.tr/diyarbakir/etkinlik/{item.get('slug')}",
        "category_name": category_name,
        "date_iso": dates[0] if dates else None,
        "venue": venue_name,
        "performers": performers,
        "price": item.get("price"),
        "discounted_price": item.get("discountedPrice"),
        "is_free": bool(item.get("isFreeTicket")),
        "currency": item.get("currency", "TRY"),
        "image_url": pick_image_url(item.get("files")),
    }


def fetch_tag(scraper, tag_id, category_name):
    url = f"https://platform.api.bubilet.com.tr/v3/event/city/{CITY_ID}/tag/{tag_id}"
    response = scraper.get(url, headers=HEADERS, timeout=20)
    if response.status_code != 200:
        print(
            f"[bubilet_fetch] tag {tag_id} ({category_name}): HTTP {response.status_code}, skipping",
            file=sys.stderr,
        )
        return []
    return response.json()


def main():
    if len(sys.argv) < 2:
        print("Usage: python bubilet_fetch.py <output-json-path>", file=sys.stderr)
        sys.exit(2)
    output_path = sys.argv[1]

    scraper = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "desktop": True}
    )

    # Dedup across tags by bubilet's own event id (an event can legitimately
    # appear under more than one category tag) — first tag wins, in the
    # dict's key order above.
    events_by_id = {}
    other_city_dropped = 0
    tag_items = list(TAG_TO_CATEGORY.items())
    for index, (tag_id, category_name) in enumerate(tag_items):
        raw_items = fetch_tag(scraper, tag_id, category_name)
        print(f"[bubilet_fetch] tag {tag_id} ({category_name}): {len(raw_items)} event(s)", file=sys.stderr)
        for raw in raw_items:
            event_id = raw.get("id")
            if event_id is None or event_id in events_by_id:
                continue
            if not is_actually_diyarbakir(raw):
                other_city_dropped += 1
                continue
            events_by_id[event_id] = parse_item(raw, category_name)

        # Polite pacing between requests to the same source, same rationale
        # as every other parser in this project (see run-all.ts).
        if index < len(tag_items) - 1:
            time.sleep(1)

    events = list(events_by_id.values())
    print(
        f"[bubilet_fetch] {len(events)} unique event(s) across all tags "
        f"({other_city_dropped} dropped as actually-another-city, e.g. a nationally-touring event)",
        file=sys.stderr,
    )

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(events, f, ensure_ascii=False)


if __name__ == "__main__":
    main()

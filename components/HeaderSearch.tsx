"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "@/components/icons";
import { SEARCH_BOX_CLASS } from "@/components/search-box-class";
import { buildListingHref, type ListingParams } from "@/lib/event-filters";

const INPUT_ID = "site-search";

/**
 * The search box in the site header, on every public page.
 *
 * On the listing it filters as you type (debounced, via `replace` so each
 * keystroke isn't a history entry), keeping the other filters. Anywhere
 * else it waits for Enter and then opens the listing with `?q=` — jumping
 * away from a detail page mid-word would be disorienting.
 */
export default function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onListing = pathname === "/";
  const urlQuery = onListing ? (searchParams.get("q") ?? "") : "";

  const [value, setValue] = useState(urlQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the URL when it changes from elsewhere (back/forward, "clear
  // filters"). Skipped when it already matches what's typed, so the trimmed
  // value coming back from our own navigation doesn't eat a trailing space
  // mid-typing.
  useEffect(() => {
    setValue((current) => (current.trim() === urlQuery ? current : urlQuery));
  }, [urlQuery]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function hrefFor(query: string) {
    const params = onListing ? (Object.fromEntries(searchParams.entries()) as ListingParams) : {};
    return buildListingHref(params, { q: query.trim() || undefined });
  }

  function handleChange(next: string) {
    setValue(next);
    if (!onListing) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => router.replace(hrefFor(next), { scroll: false }), 300);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    router.push(hrefFor(value));
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={SEARCH_BOX_CLASS}>
      <label htmlFor={INPUT_ID} className="sr-only">
        Etkinlik, sanatçı veya mekan ara
      </label>
      <SearchIcon size={18} className="shrink-0 text-muted" />
      <input
        id={INPUT_ID}
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Etkinlik, sanatçı veya mekan ara"
        autoComplete="off"
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted focus:outline-none"
      />
    </form>
  );
}

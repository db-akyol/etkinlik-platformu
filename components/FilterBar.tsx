"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Category } from "@/lib/supabase/types";

const DATE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Tümü" },
  { value: "bugun", label: "Bugün" },
  { value: "hafta", label: "Bu Hafta" },
  { value: "ay", label: "Bu Ay" },
];

/**
 * Client-side filter controls. This component only ever reads/writes the
 * URL's search params (`kategori`, `tarih`) — the actual filtering happens
 * server-side in app/page.tsx, which re-fetches on navigation.
 */
export default function FilterBar({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeCategory = searchParams.get("kategori") ?? "";
  const activeDate = searchParams.get("tarih") ?? "";
  const activeView = searchParams.get("gorunum") === "harita" ? "harita" : "liste";

  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync if the URL changes from elsewhere (e.g. back/forward).
  useEffect(() => {
    setSearchInput(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParam("q", value.trim()), 300);
  }

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="etkinlik-arama" className="sr-only">
        Etkinlik veya mekan ara
      </label>
      <input
        id="etkinlik-arama"
        type="search"
        value={searchInput}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Etkinlik, mekan ara..."
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground"
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {DATE_FILTERS.map((filter) => (
            <button
              key={filter.value || "tumu"}
              type="button"
              onClick={() => updateParam("tarih", filter.value)}
              aria-pressed={activeDate === filter.value}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeDate === filter.value
                  ? "bg-dicle text-on-dicle"
                  : "bg-surface-muted text-foreground/70 hover:bg-line-strong"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        {/* flex-wrap: at 360px the view toggle and the category select
         * don't both fit on one row. Wrapping (rather than shrinking the
         * select, which native selects don't do predictably) drops the
         * select to its own line instead of overflowing the viewport. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-line p-0.5">
            {(
              [
                { value: "liste", label: "Liste" },
                { value: "harita", label: "Harita" },
              ] as const
            ).map((view) => (
              <button
                key={view.value}
                type="button"
                onClick={() => updateParam("gorunum", view.value === "liste" ? "" : view.value)}
                aria-pressed={activeView === view.value}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  activeView === view.value
                    ? "bg-dicle text-on-dicle"
                    : "text-foreground/70 hover:bg-surface-muted"
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-foreground/70">Kategori</span>
            <select
              value={activeCategory}
              onChange={(e) => updateParam("kategori", e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">Tüm Kategoriler</option>
              {categories.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

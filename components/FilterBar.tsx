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
      <input
        type="search"
        value={searchInput}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Etkinlik, mekan ara..."
        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {DATE_FILTERS.map((filter) => (
            <button
              key={filter.value || "tumu"}
              type="button"
              onClick={() => updateParam("tarih", filter.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeDate === filter.value
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-black/10 p-0.5 dark:border-white/10">
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
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  activeView === view.value
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Kategori</span>
            <select
              value={activeCategory}
              onChange={(e) => updateParam("kategori", e.target.value)}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
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

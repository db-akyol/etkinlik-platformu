import Link from "next/link";
import { addCalendarDays, buildListingHref, type ListingParams } from "@/lib/event-filters";
import { formatDayChip, formatDayLong } from "@/lib/format-event";
import type { Category } from "@/lib/supabase/types";

/*
 * The listing's filter controls. All of them are plain links that rewrite
 * the URL — the page reads the URL and does the filtering server-side — so
 * they work before hydration and every filtered view is shareable.
 */

export const PRICE_FILTERS = [
  { value: "", label: "Hepsi" },
  { value: "ucretsiz", label: "Ücretsiz" },
  { value: "300", label: "300 TL ve altı" },
] as const;

export type CategoryOption = Pick<Category, "id" | "name" | "slug"> & { count: number };

/**
 * Categories worth offering: those with something to show under the other
 * filters, plus the selected one even when it's empty (so it can be
 * switched off).
 */
function visibleCategories(categories: CategoryOption[], selected: string | undefined) {
  return categories.filter((category) => category.count > 0 || category.slug === selected);
}

/** Desktop side panel: category and price lists. The calendar sits above it. */
export function SideFilters({
  categories,
  totalCount,
  params,
}: {
  categories: CategoryOption[];
  totalCount: number;
  params: ListingParams;
}) {
  const rowClass =
    "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-surface-muted aria-[current=true]:bg-dicle-soft aria-[current=true]:font-semibold";

  return (
    <>
      <div>
        <h2 className="mb-1.5 px-2.5 text-[13px] font-semibold text-muted">Kategori</h2>
        <Link
          href={buildListingHref(params, { kategori: undefined })}
          scroll={false}
          aria-current={!params.kategori ? "true" : undefined}
          className={rowClass}
        >
          Tümü
          <span className="text-[13px] text-muted tabular-nums">{totalCount}</span>
        </Link>
        {visibleCategories(categories, params.kategori).map((category) => (
          <Link
            key={category.id}
            href={buildListingHref(params, { kategori: category.slug })}
            scroll={false}
            aria-current={params.kategori === category.slug ? "true" : undefined}
            className={rowClass}
          >
            {category.name}
            <span className="text-[13px] text-muted tabular-nums">{category.count}</span>
          </Link>
        ))}
      </div>
      <div>
        <h2 className="mb-1.5 px-2.5 text-[13px] font-semibold text-muted">Fiyat</h2>
        {PRICE_FILTERS.map((filter) => (
          <Link
            key={filter.value || "hepsi"}
            href={buildListingHref(params, { fiyat: filter.value || undefined })}
            scroll={false}
            aria-current={(params.fiyat ?? "") === filter.value ? "true" : undefined}
            className={rowClass}
          >
            {filter.label}
          </Link>
        ))}
      </div>
    </>
  );
}

/**
 * Phone: two weeks of days in a horizontal strip, in place of the side
 * panel's calendar. Days with nothing on are shown but not tappable.
 */
export function DateStrip({
  todayKey,
  eventDays,
  params,
}: {
  todayKey: string;
  eventDays: string[];
  params: ListingParams;
}) {
  const withEvents = new Set(eventDays);
  const days = Array.from({ length: 14 }, (_, i) => addCalendarDays(todayKey, i));
  const cellClass =
    "relative flex h-16 w-[3.375rem] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border text-foreground";

  return (
    <nav aria-label="Gün seç" className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-3.5 pb-1 [scrollbar-width:none] md:hidden">
      <Link
        href={buildListingHref(params, { gun: undefined })}
        scroll={false}
        aria-current={!params.gun ? "true" : undefined}
        className={`${cellClass} border-line bg-surface aria-[current=true]:border-transparent aria-[current=true]:bg-dicle aria-[current=true]:text-on-dicle`}
      >
        <span className="text-[11px] opacity-80">Tüm</span>
        <span className="font-display text-sm leading-none font-extrabold">günler</span>
      </Link>
      {days.map((key, i) => {
        const chip = formatDayChip(key);
        const label = i === 0 ? "Bugün" : chip.weekday;
        const content = (
          <>
            <span className="text-[11px] opacity-80">{label}</span>
            <span className="font-display text-lg leading-none font-extrabold tabular-nums">{chip.day}</span>
          </>
        );

        const isSelected = params.gun === key;
        // Same rule as CalendarPanel: the selected day stays tappable so it
        // can be deselected even when the other filters leave it empty.
        if (!isSelected && !withEvents.has(key)) {
          return (
            <span key={key} className={`${cellClass} border-line bg-surface opacity-40`}>
              {content}
            </span>
          );
        }

        return (
          <Link
            key={key}
            href={buildListingHref(params, { gun: isSelected ? undefined : key })}
            scroll={false}
            aria-current={isSelected ? "date" : undefined}
            aria-label={formatDayLong(key)}
            className={`${cellClass} after:absolute after:bottom-1.5 after:h-1 after:w-1 after:rounded-full ${
              isSelected
                ? "border-transparent bg-dicle text-on-dicle after:bg-on-dicle"
                : "border-line bg-surface after:bg-dicle"
            }`}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone: categories, then the price filters, as one scrolling row of chips. */
export function FilterChips({
  categories,
  totalCount,
  params,
}: {
  categories: CategoryOption[];
  totalCount: number;
  params: ListingParams;
}) {
  const chipClass =
    "flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm font-medium whitespace-nowrap aria-[current=true]:border-foreground aria-[current=true]:bg-foreground aria-[current=true]:text-background";

  return (
    <nav aria-label="Filtreler" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] md:hidden">
      <Link
        href={buildListingHref(params, { kategori: undefined })}
        scroll={false}
        aria-current={!params.kategori ? "true" : undefined}
        className={chipClass}
      >
        Tümü <span className="text-[13px] opacity-60 tabular-nums">{totalCount}</span>
      </Link>
      {visibleCategories(categories, params.kategori).map((category) => (
        <Link
          key={category.id}
          href={buildListingHref(params, { kategori: category.slug })}
          scroll={false}
          aria-current={params.kategori === category.slug ? "true" : undefined}
          className={chipClass}
        >
          {category.name} <span className="text-[13px] opacity-60 tabular-nums">{category.count}</span>
        </Link>
      ))}
      <span aria-hidden="true" className="my-2 w-px shrink-0 bg-line-strong" />
      {PRICE_FILTERS.filter((filter) => filter.value).map((filter) => {
        const isSelected = params.fiyat === filter.value;
        return (
          <Link
            key={filter.value}
            href={buildListingHref(params, { fiyat: isSelected ? undefined : filter.value })}
            scroll={false}
            aria-current={isSelected ? "true" : undefined}
            className={chipClass}
          >
            {filter.label}
          </Link>
        );
      })}
    </nav>
  );
}

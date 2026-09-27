"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { buildListingHref, calendarStartMonth, type ListingParams } from "@/lib/event-filters";
import { formatDayLong, formatMonthLabel } from "@/lib/format-event";

const WEEKDAYS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

/** "2026-09" shifted by `delta` months. UTC so the runtime's DST can't nudge it. */
function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
}

/**
 * The month calendar in the listing's side panel. Days that have an event
 * are links that filter the listing to that day (`?gun=`); clicking the
 * selected day again clears it. Only the visible month is client state —
 * everything else comes from the URL via props.
 */
export default function CalendarPanel({
  eventDays,
  todayKey,
  params,
}: {
  /** Sorted "YYYY-MM-DD" Istanbul days that have at least one listed event. */
  eventDays: string[];
  todayKey: string;
  params: ListingParams;
}) {
  const selected = params.gun;
  const firstMonth = todayKey.slice(0, 7);
  const lastEventMonth = eventDays.at(-1)?.slice(0, 7) ?? firstMonth;
  const lastMonth = lastEventMonth > firstMonth ? lastEventMonth : firstMonth;
  const [month, setMonth] = useState(() => calendarStartMonth(eventDays, todayKey, selected));

  const withEvents = new Set(eventDays);
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  // Monday-first, as calendars in Turkey are.
  const leadingBlanks = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;

  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={month <= firstMonth}
          aria-label="Önceki ay"
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-muted disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeftIcon size={18} />
        </button>
        <p className="font-display text-base font-bold" aria-live="polite">
          {formatMonthLabel(`${month}-01`)}
        </p>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= lastMonth}
          aria-label="Sonraki ay"
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-muted disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRightIcon size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((day) => (
          <span key={day} aria-hidden="true" className="py-1 text-[11px] font-medium text-muted">
            {day}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const key = `${month}-${String(day).padStart(2, "0")}`;
          const isToday = key === todayKey;
          const cellClass = `relative flex aspect-square items-center justify-center rounded-lg text-[13px] tabular-nums ${
            isToday ? "ring-1 ring-inset ring-line-strong" : ""
          }`;

          const isSelected = key === selected;
          // The selected day stays a link even when the other filters leave
          // it empty — it is the only way to deselect it from here.
          if (!isSelected && (key < todayKey || !withEvents.has(key))) {
            return (
              <span key={key} className={`${cellClass} text-muted opacity-50`}>
                {day}
              </span>
            );
          }

          return (
            <Link
              key={key}
              href={buildListingHref(params, { gun: isSelected ? undefined : key })}
              scroll={false}
              aria-current={isSelected ? "date" : undefined}
              aria-label={`${formatDayLong(key)}${isSelected ? ", seçili" : ""}`}
              className={`${cellClass} font-bold after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full ${
                isSelected
                  ? "bg-dicle text-on-dicle after:bg-on-dicle"
                  : "text-foreground after:bg-dicle hover:bg-surface-muted"
              }`}
            >
              {day}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

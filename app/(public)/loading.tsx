import EventCardSkeleton, { EVENT_GRID_CLASS } from "@/components/EventCardSkeleton";

// Mirrors app/(public)/page.tsx: side panel on desktop, date strip and chips
// on phones, then a heading row and one day group — so nothing reflows when
// the real content swaps in.
export default function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">
      <div className="sr-only" role="status">
        Yükleniyor…
      </div>
      <div className="animate-pulse md:grid md:grid-cols-[16.5rem_minmax(0,1fr)] md:gap-10 md:py-8 lg:gap-12">
        <div aria-hidden="true" className="hidden md:flex md:flex-col md:gap-7">
          <div className="h-72 rounded-2xl bg-surface-muted" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-8 rounded-lg bg-surface-muted" />
            ))}
          </div>
        </div>

        <div aria-hidden="true" className="min-w-0">
          <div className="flex gap-2 overflow-hidden pt-3.5 pb-1 md:hidden">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="h-16 w-[3.375rem] shrink-0 rounded-2xl bg-surface-muted" />
            ))}
          </div>
          <div className="flex gap-2 overflow-hidden py-3 md:hidden">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-9 w-24 shrink-0 rounded-full bg-surface-muted" />
            ))}
          </div>

          <div className="mb-6 flex items-center justify-between pt-2 md:pt-0">
            <div className="h-8 w-64 rounded bg-surface-muted md:h-9" />
            <div className="h-9 w-40 rounded-full bg-surface-muted" />
          </div>

          <div className="mb-4 h-8 w-56 rounded bg-surface-muted" />
          <div className={EVENT_GRID_CLASS}>
            {Array.from({ length: 8 }, (_, i) => (
              <EventCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

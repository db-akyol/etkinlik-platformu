import EventCardSkeleton from "@/components/EventCardSkeleton";

// Matches app/(public)/page.tsx's container, header and sticky filter-bar
// shell exactly, down to the -mx/px offsets, so nothing reflows when the
// real content swaps in.
export default function HomeLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="sr-only" role="status">
        Yükleniyor…
      </div>

      <div className="flex animate-pulse flex-col gap-2">
        <div className="h-9 w-72 rounded bg-surface-muted sm:h-10 sm:w-96" />
        <div className="h-4 w-80 rounded bg-surface-muted" />
      </div>

      <div className="sticky top-14 z-20 -mx-4 border-b border-line bg-background px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex animate-pulse flex-col gap-4">
          <div className="h-10 w-full rounded-lg bg-surface-muted" />
          <div className="flex flex-wrap gap-2">
            <div className="h-8 w-16 rounded-full bg-surface-muted" />
            <div className="h-8 w-20 rounded-full bg-surface-muted" />
            <div className="h-8 w-20 rounded-full bg-surface-muted" />
            <div className="h-8 w-16 rounded-full bg-surface-muted" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

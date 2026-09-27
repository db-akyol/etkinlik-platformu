import EventCardSkeleton, { EVENT_GRID_CLASS } from "@/components/EventCardSkeleton";

// Matches app/(public)/favoriler/page.tsx's container and heading.
export default function FavorilerLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <div className="sr-only" role="status">
        Yükleniyor…
      </div>

      <div aria-hidden="true" className="flex animate-pulse flex-col gap-2">
        <div className="h-8 w-44 rounded bg-surface-muted md:h-9" />
        <div className="h-4 w-64 rounded bg-surface-muted" />
      </div>

      <div className={EVENT_GRID_CLASS}>
        {Array.from({ length: 8 }, (_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

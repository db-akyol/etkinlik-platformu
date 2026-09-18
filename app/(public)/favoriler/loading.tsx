import EventCardSkeleton from "@/components/EventCardSkeleton";

// Matches app/(public)/favoriler/page.tsx's container and (smaller) header.
export default function FavorilerLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="sr-only" role="status">
        Yükleniyor…
      </div>

      <div className="flex animate-pulse flex-col gap-2">
        <div className="h-7 w-40 rounded bg-surface-muted sm:h-8 sm:w-48" />
        <div className="h-4 w-64 rounded bg-surface-muted" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

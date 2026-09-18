// Matches app/(public)/etkinlik/[id]/page.tsx's max-w-3xl container and
// article layout: back link, 16/9 image, then the badge row, title, date,
// venue and description bars in the same order they render for real.
export default function EventDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="sr-only" role="status">
        Yükleniyor…
      </div>

      <div className="h-5 w-32 animate-pulse rounded bg-surface-muted" />

      <div className="animate-pulse overflow-hidden rounded-xl border border-line">
        <div className="aspect-[16/9] w-full bg-surface-muted" />

        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-6 w-20 rounded-full bg-surface-muted" />
            <div className="h-6 w-16 rounded-full bg-surface-muted" />
            <div className="h-8 w-8 rounded-full bg-surface-muted" />
          </div>

          <div className="h-8 w-3/4 rounded bg-surface-muted" />

          <div className="h-5 w-56 rounded bg-surface-muted" />

          <div className="flex flex-col gap-2">
            <div className="h-4 w-40 rounded bg-surface-muted" />
            <div className="h-4 w-56 rounded bg-surface-muted" />
          </div>

          <div className="flex flex-col gap-2">
            <div className="h-3.5 w-full rounded bg-surface-muted" />
            <div className="h-3.5 w-full rounded bg-surface-muted" />
            <div className="h-3.5 w-2/3 rounded bg-surface-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

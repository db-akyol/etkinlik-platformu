// Matches app/(public)/etkinlik/[id]/page.tsx: back link, then the poster
// beside (desktop) or above (phone) the title, facts box and buttons.
export default function EventDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:px-6 md:py-8 lg:px-8">
      <div className="sr-only" role="status">
        Yükleniyor…
      </div>

      <div aria-hidden="true" className="animate-pulse">
        <div className="h-5 w-32 rounded bg-surface-muted" />

        <div className="mt-5 grid gap-7 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-12">
          <div className="mx-auto aspect-[4/5] w-full max-w-sm rounded-3xl bg-surface-muted" />

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="h-6 w-20 rounded-full bg-surface-muted" />
              <div className="h-10 w-3/4 rounded bg-surface-muted sm:h-12" />
            </div>
            <div className="h-32 rounded-2xl bg-surface-muted" />
            <div className="flex gap-3">
              <div className="h-11 w-56 rounded-full bg-surface-muted" />
              <div className="h-11 w-11 rounded-full bg-surface-muted" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-4 w-full rounded bg-surface-muted" />
              <div className="h-4 w-full rounded bg-surface-muted" />
              <div className="h-4 w-2/3 rounded bg-surface-muted" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import EventCardSkeleton, { EVENT_GRID_CLASS } from "@/components/EventCardSkeleton";

// Mirrors app/(public)/bu-hafta-sonu/page.tsx: back link, heading block,
// then one day section.
export default function WeekendLoading() {
  return (
    <div className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-10 sm:px-6 lg:px-8 2xl:max-w-[104rem]">
      <div className="sr-only" role="status">
        Yükleniyor…
      </div>
      <div aria-hidden="true" className="animate-pulse">
        <div className="flex flex-col gap-3 py-5 md:py-8">
          <div className="h-5 w-32 rounded bg-surface-muted" />
          <div className="h-9 w-3/4 max-w-xl rounded bg-surface-muted md:h-10" />
          <div className="h-4 w-40 rounded bg-surface-muted" />
          <div className="h-4 w-full max-w-2xl rounded bg-surface-muted" />
        </div>
        <div className="mb-4 h-8 w-56 rounded bg-surface-muted" />
        <div className={EVENT_GRID_CLASS}>
          {Array.from({ length: 8 }, (_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

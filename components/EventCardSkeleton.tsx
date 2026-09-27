/**
 * Loading placeholder for EventCard. Shape has to track EventCard's image
 * block and text rows exactly — a skeleton that doesn't match the card it's
 * standing in for causes a visible jump when the real data lands.
 *
 * `aria-hidden` because the page-level loading.tsx carries the one live
 * region ("Yükleniyor…") — a screen reader doesn't need this announced once
 * per card in a grid.
 */
export default function EventCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex animate-pulse flex-col gap-2.5 ${className}`}>
      <div className="aspect-[4/5] w-full rounded-2xl bg-surface-muted" />
      <div className="flex flex-col gap-1.5 px-0.5">
        <div className="h-4 w-4/5 rounded bg-surface-muted" />
        <div className="h-3.5 w-3/5 rounded bg-surface-muted" />
        <div className="mt-1 flex justify-between">
          <div className="h-3.5 w-1/3 rounded bg-surface-muted" />
          <div className="h-3.5 w-1/5 rounded bg-surface-muted" />
        </div>
      </div>
    </div>
  );
}

/**
 * The listing's card grid, shared by the page and its loading skeletons.
 * From xl up the minimum card width grows, so extra screen width makes the
 * posters bigger instead of only adding more, smaller columns.
 */
export const EVENT_GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] sm:gap-x-5 sm:gap-y-8 xl:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]";

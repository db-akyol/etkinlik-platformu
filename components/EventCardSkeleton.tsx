/**
 * Loading placeholder for EventCard. Shape has to track EventCard's outer
 * box, image block and text rows exactly — a skeleton that doesn't match the
 * card it's standing in for causes a visible jump when the real data lands.
 *
 * `aria-hidden` because the page-level loading.tsx carries the one live
 * region ("Yükleniyor…") — a screen reader doesn't need this announced once
 * per card in a grid of six.
 */
export default function EventCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex animate-pulse flex-col overflow-hidden rounded-xl border border-line bg-surface ${className}`}
    >
      <div className="aspect-[16/9] w-full bg-surface-muted" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="h-4 w-4/5 rounded bg-surface-muted" />
        <div className="h-4 w-2/5 rounded bg-surface-muted" />
        <div className="h-3.5 w-3/5 rounded bg-surface-muted" />
        <div className="mt-auto pt-2">
          <div className="h-6 w-20 rounded-full bg-surface-muted" />
        </div>
      </div>
    </div>
  );
}

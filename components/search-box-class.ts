/**
 * The header search box's outer classes, shared by HeaderSearch and its
 * Suspense fallback in app/(public)/layout.tsx so nothing shifts when the
 * real box hydrates. Lives outside HeaderSearch.tsx because a server
 * component importing a plain value from a "use client" module gets a client
 * reference, not the string.
 *
 * The field's own outline is off; the ring on the whole box (`focus-within`)
 * replaces it.
 */
export const SEARCH_BOX_CLASS =
  "order-last flex h-10 w-full items-center gap-2 rounded-full border border-line bg-surface px-3.5 focus-within:border-dicle focus-within:ring-3 focus-within:ring-dicle-soft md:order-none md:h-11 md:w-auto md:max-w-md md:flex-1";

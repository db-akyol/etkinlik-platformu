"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CompassIcon, HeartIcon, MapPinIcon, UserIcon } from "@/components/icons";
import { buildListingHref, type ListingParams } from "@/lib/event-filters";

type TabKey = "kesfet" | "harita" | "favoriler" | "hesap";

/**
 * Which section the current URL belongs to. Harita is the listing with
 * `?gorunum=harita`, so it needs the search params, not just the path.
 */
function useNavState(): { active: TabKey | null; params: ListingParams } {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname === "/") {
    const params = Object.fromEntries(searchParams.entries()) as ListingParams;
    return { active: params.gorunum === "harita" ? "harita" : "kesfet", params };
  }
  if (pathname.startsWith("/etkinlik/")) return { active: "kesfet", params: {} };
  if (pathname === "/favoriler") return { active: "favoriler", params: {} };
  if (pathname === "/hesap" || pathname === "/giris" || pathname === "/kayit") {
    return { active: "hesap", params: {} };
  }
  return { active: null, params: {} };
}

/** Keşfet and Harita keep whatever filters are already applied. */
function listingHrefs(params: ListingParams) {
  return {
    kesfet: buildListingHref(params, { gorunum: undefined }),
    harita: buildListingHref(params, { gorunum: "harita" }),
  };
}

export function TopNav() {
  const { active, params } = useNavState();
  const hrefs = listingHrefs(params);
  const items: { key: TabKey; href: string; label: string }[] = [
    { key: "kesfet", href: hrefs.kesfet, label: "Keşfet" },
    { key: "harita", href: hrefs.harita, label: "Harita" },
    { key: "favoriler", href: "/favoriler", label: "Favorilerim" },
  ];

  return (
    <nav aria-label="Ana menü" className="hidden items-center gap-1 md:flex">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={active === item.key ? "page" : undefined}
          className="rounded-full px-3.5 py-2 text-sm font-semibold text-muted transition-colors hover:text-foreground aria-[current=page]:bg-surface-muted aria-[current=page]:text-foreground"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The phone tab bar. Fixed rather than sticky so it stays put on every page
 * regardless of how tall the content is; app/(public)/layout.tsx pads <main>
 * by its height so the last row of cards is never underneath it.
 */
export function BottomNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { active, params } = useNavState();
  const hrefs = listingHrefs(params);
  const items = [
    { key: "kesfet" as const, href: hrefs.kesfet, label: "Keşfet", Icon: CompassIcon },
    { key: "harita" as const, href: hrefs.harita, label: "Harita", Icon: MapPinIcon },
    { key: "favoriler" as const, href: "/favoriler", label: "Favoriler", Icon: HeartIcon },
    isLoggedIn
      ? { key: "hesap" as const, href: "/hesap", label: "Hesabım", Icon: UserIcon }
      : { key: "hesap" as const, href: "/giris", label: "Giriş yap", Icon: UserIcon },
  ];

  return (
    <nav
      aria-label="Alt menü"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
    >
      {items.map(({ key, href, label, Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className="flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-semibold text-muted aria-[current=page]:text-dicle"
        >
          <Icon size={22} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

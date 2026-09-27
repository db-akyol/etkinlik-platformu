import { Suspense } from "react";
import Link from "next/link";
import { BottomNav, TopNav } from "@/components/AppNav";
import HeaderSearch from "@/components/HeaderSearch";
import { SearchIcon, UserIcon } from "@/components/icons";
import { SEARCH_BOX_CLASS } from "@/components/search-box-class";
import { createClient } from "@/lib/supabase/server";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col">
      {/* First focusable element on every public page. Invisible until it
          receives keyboard focus, so mouse/touch users never see it. */}
      <a
        href="#icerik"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md"
      >
        İçeriğe geç
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2.5 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="font-display flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-foreground"
          >
            {/* A calendar leaf with Diyarbakır's plate code on it — the same
                shape as the date stamp on every event card. */}
            <span
              aria-hidden="true"
              className="relative flex h-8 w-[1.875rem] items-end justify-center rounded-[7px] bg-dicle pb-[5px] text-[13px] leading-none text-on-dicle before:absolute before:inset-x-1.5 before:top-1 before:h-0.5 before:rounded-full before:bg-current before:opacity-50"
            >
              21
            </span>
            Diyarbakır Etkinlik
          </Link>

          <Suspense
            fallback={
              <div className={SEARCH_BOX_CLASS}>
                <SearchIcon size={18} className="shrink-0 text-muted" />
              </div>
            }
          >
            <HeaderSearch />
          </Suspense>

          <div className="ml-auto hidden items-center gap-3 md:flex">
            <Suspense fallback={null}>
              <TopNav />
            </Suspense>
            {user ? (
              <Link
                href="/hesap"
                aria-label="Hesabım"
                title={user.email ?? "Hesabım"}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-muted transition-colors hover:text-foreground"
              >
                <UserIcon size={20} />
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/giris"
                  className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
                >
                  Giriş yap
                </Link>
                <Link
                  href="/kayit"
                  className="rounded-full bg-dicle px-4 py-2 text-sm font-semibold text-on-dicle transition-colors hover:bg-dicle-dim"
                >
                  Kayıt ol
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
      {/* The one <main> landmark for the whole public app — every page below
          renders its own title block as a plain <div>, not <header>, so this
          stays the only `banner`/`main` pairing (see skip link above).
          The bottom padding on phones is the tab bar's height. */}
      <main
        id="icerik"
        className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0"
      >
        {children}
      </main>
      <Suspense fallback={null}>
        <BottomNav isLoggedIn={!!user} />
      </Suspense>
    </div>
  );
}

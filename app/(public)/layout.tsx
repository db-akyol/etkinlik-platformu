import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOutPublic } from "./actions";

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
      <header className="sticky top-0 z-30 border-b border-line bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="font-display flex items-center gap-1.5 text-base font-semibold tracking-tight text-foreground"
          >
            <span className="h-2 w-2 rounded-full bg-dicle" aria-hidden="true" />
            Diyarbakır <span className="text-dicle">Etkinlik</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <Link
                  href="/favoriler"
                  className="font-medium text-zinc-700 hover:text-dicle dark:text-zinc-300"
                >
                  Favorilerim
                </Link>
                <span className="hidden text-zinc-400 sm:inline">{user.email}</span>
                <form action={signOutPublic}>
                  <button
                    type="submit"
                    className="rounded-md border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-muted"
                  >
                    Çıkış Yap
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/giris"
                  className="font-medium text-zinc-700 hover:text-dicle dark:text-zinc-300"
                >
                  Giriş Yap
                </Link>
                <Link
                  href="/kayit"
                  className="rounded-md bg-dicle px-3 py-1.5 font-medium text-on-dicle hover:bg-dicle-dim"
                >
                  Kayıt Ol
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      {/* The one <main> landmark for the whole public app — every page below
          renders its own title block as a plain <div>, not <header>, so this
          stays the only `banner`/`main` pairing (see skip link above). */}
      <main id="icerik" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}

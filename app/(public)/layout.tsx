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
      <header className="sticky top-0 z-30 border-b border-black/10 bg-background/95 backdrop-blur dark:border-white/10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="font-display flex items-center gap-1.5 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
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
                    className="rounded-md border border-black/20 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
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
                  className="rounded-md bg-dicle px-3 py-1.5 font-medium text-white hover:bg-dicle-dim"
                >
                  Kayıt Ol
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

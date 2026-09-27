import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HeartIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { signOutPublic } from "../actions";

export const metadata: Metadata = {
  title: "Hesabım",
  robots: { index: false },
};

export default async function HesapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris?next=/hesap");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Hesabım</h1>
        <p className="break-all text-sm text-muted">{user.email}</p>
      </div>

      <Link
        href="/favoriler"
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 font-semibold transition-colors hover:bg-surface-muted"
      >
        <HeartIcon size={20} className="text-dicle" />
        Favorilerim
      </Link>

      <form action={signOutPublic}>
        <button
          type="submit"
          className="w-full rounded-full border border-line-strong px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-muted"
        >
          Çıkış yap
        </button>
      </form>
    </div>
  );
}

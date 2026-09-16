"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function GirisForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(`Giriş başarısız: ${signInError.message}`);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black/20">
        <h1 className="font-display mb-6 text-center text-xl font-semibold">Giriş Yap</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              E-posta
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium">
              Şifre
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-dicle px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-dicle-dim"
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Hesabın yok mu?{" "}
          <Link href="/kayit" className="font-medium text-dicle hover:underline">
            Kayıt ol
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function GirisPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <GirisForm />
    </Suspense>
  );
}

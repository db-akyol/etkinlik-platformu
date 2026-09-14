import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-orange-50 px-6 text-center">
      <div className="text-5xl" aria-hidden="true">
        📡
      </div>
      <h1 className="text-2xl font-bold text-neutral-900">Bağlantı yok</h1>
      <p className="max-w-sm text-neutral-600">
        İnternet bağlantınızı kontrol edip tekrar deneyin. Daha önce
        görüntülediğiniz bazı sayfalar çevrimdışıyken de açılabilir.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-orange-600 px-5 py-2 font-medium text-white transition hover:bg-orange-700"
      >
        Tekrar dene
      </Link>
    </main>
  );
}

# Diyarbakır Etkinlik Platformu

Diyarbakır'daki konser, tiyatro, atölye ve sergileri tek yerde toplayan bir
web uygulaması (PWA). Etkinlikler ağırlıklı olarak **otomatik** toplanır:
resmi bilet satıcıları ve belediyenin kendi sitesi günde iki kez taranır.
Manuel giriş, sadece otomatik ulaşılamayan etkinlikler için yedektir.

Next.js 15 (App Router) + Supabase (Postgres + Auth + RLS), Vercel'de
çalışır.

## Hızlı başlangıç

Gereken: Node 20.x ve Docker Desktop (yerel Supabase için).

```bash
npm install
npx supabase start          # yerel Supabase; çıktıdaki anahtarları not alın
cp .env.example .env.local  # ve yukarıdaki URL/key değerleriyle doldurun
npm run dev                 # http://localhost:3000
```

Siteyi çalıştırmak için bu kadarı yeter. Sadece `npm run scrape` çalıştıracaksanız
ek olarak Python 3.11+ gerekir — dört kaynaktan biri (bubilet) Cloudflare
doğrulaması yüzünden bir Python alt sürecine ihtiyaç duyuyor (bkz. "Dikkat"):

```bash
pip install -r scripts/scrapers/requirements.txt
```

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Production build |
| `npm test` | Birim testleri (ağ ve veritabanı gerektirmez, ~0.5 sn) |
| `npm run typecheck` | Route tiplerini üretir (`next typegen`), sonra `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run scrape` | Dört scraper'ı da çalıştırır ve `.env.local`'deki veritabanına yazar |

## Proje yapısı

```
app/(public)/     Herkese açık site (liste, detay, giriş/kayıt, favoriler)
app/admin/        Admin panel — middleware + admin_users allowlist ile korumalı
components/       Paylaşılan React bileşenleri (kart, harita, filtreler)
lib/              Supabase istemcileri, tipler, saat dilimi ve format yardımcıları
scripts/scrapers/ Scraper'lar ve ortak altyapıları — kendi README'si var
supabase/         Şema migration'ları ve seed verisi
docs/             Plan ve oturum devir notları
```

## Nereden başlamalı

- **Projeyi ilk kez devralıyorsanız:** [`docs/session-handoff.md`](docs/session-handoff.md)
  — şu an ne çalışıyor, hangi tuzaklar var, sırada ne var.
- **Scraper ekleyecek veya düzeltecekseniz:** [`scripts/scrapers/README.md`](scripts/scrapers/README.md)
  — kaynak ekleme adımları, saat dilimi kuralları, etik sınırlar.
- **Genel plan ve kapsam:** [`docs/plan.md`](docs/plan.md).

## Dikkat

- **Saat dilimleri.** Her saat UTC saklanır, Türkiye saatiyle gösterilir.
  `new Date("...")`'ı offset'siz bir string'le veya `Intl.DateTimeFormat`'ı
  `timeZone` vermeden kullanmayın; ikisi de sunucunun saat dilimini kullanır
  (Vercel = UTC) ve sessizce 3 saat kaydırır. `lib/istanbul-time.ts` ve
  `scripts/scrapers/lib/normalize.ts` bunun içindir.
- **Scraping etiği.** Her kaynağın `robots.txt`'ine ve kullanım şartlarına
  uyulur, istek hacmi düşük tutulur (günde 2 kez), her etkinlik `source_url`
  ile kaynağına bağlanır.
- `next`/`eslint-config-next` paketlerini 16'ya yükseltmeyin; bu ortamdaki
  Node 20.5.0 yetmiyor.

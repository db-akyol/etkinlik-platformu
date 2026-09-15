# Oturum Özeti — Diyarbakır Etkinlik Platformu MVP

Bu dosya, şimdiye kadar yapılan işlerin özetidir. Amaç: projeye daha
sonra dönen birinin işi kaldığı yerden devam ettirebilmesi. Projenin genel planı için
[`docs/plan.md`](./plan.md) dosyasına bakın — bu dosya sadece "şu ana kadar
ne yapıldı, ne durumda" sorusuna cevap verir. **Son güncelleme: kullanıcı
hesapları + favorileme özelliğinin eklendiği oturum sonu.**

## Yapılanlar

### 1. Proje iskeleti
- Next.js **15.5.25** (App Router, TypeScript, Tailwind v4, `src/` dizini
  yok) `create-next-app` ile kuruldu.
- **Önemli:** Next.js 16 yerine 15'e sabitlendi çünkü bu makinedeki Node
  sürümü (20.5.0) Next 16'nın gerektirdiği 20.9.0'ın altında kalıyor.
  Node yükseltilmediği sürece `next`/`eslint-config-next` paketlerini
  16'ya çekmeyin, build/typegen kırılır.
- ESLint flat-config sorunu çözüldü: `eslint-config-next@15` flat config
  export etmiyor, bu yüzden `eslint.config.mjs` içinde `@eslint/eslintrc`'in
  `FlatCompat`'ı kullanılıyor.

### 2. Veri katmanı (Supabase)
- `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/types.ts`
  — sırasıyla browser client, server client (SSR/Server Components için) ve
  DB tip tanımları (`Database`, `EventRow`, `Venue`, `Category`, `City`,
  `ScrapeSource`, `AdminUser`, `Favorite`). **Bu dosyalar tüm projenin ortak
  sözleşmesi** — yeni kod yazarken buradaki alan adlarını kullanın.
- `supabase/migrations/0001_init.sql` — asıl şema (5 tablo: cities, venues,
  categories, events, scrape_sources), RLS politikaları, scraped etkinlikler
  için dedup unique index.
- `supabase/migrations/0002_admin_users_and_favorites.sql` — `admin_users`
  (bkz. "Bilinen sorunlar / güvenlik" altında) ve `favorites` tabloları +
  ilgili RLS politikaları.
- `supabase/seed.sql` — Diyarbakır için örnek şehir/mekan/kategori/etkinlik
  verisi (yerel geliştirme içindir).
- `supabase/config.toml` — Supabase CLI proje konfigürasyonu. **Not:**
  `[analytics] enabled = false` olarak ayarlı — nedeni aşağıda "Bilinen
  sorunlar" bölümünde. Ayrıca `enable_confirmations = false` (yerel auth'ta
  e-posta onayı istenmiyor, kayıt olunca direkt oturum açılıyor).
- `lib/supabase/types.ts`'deki `Database` tipi postgrest-js'in beklediği
  `Relationships`/`Views`/`Functions` alanlarını içermiyor (elle yazıldığı
  için) — bu yüzden select/insert/update çağrıları tip çıkarımında `never`'a
  düşüyor. Çözüm olarak proje genelinde tutarlı bir workaround kullanılıyor:
  okumalarda `.returns<T[]>()` (tüm filtrelerden sonra, `.single()`'dan
  sonra DEĞİL), yazmalarda `as never` cast'i. Yeni kod eklerken bu deseni
  takip edin (örnek: `app/admin/actions.ts`, `app/(public)/actions.ts`).

### 3. Uygulama özellikleri
- **Public site** (`app/(public)/` route group — ortak header burada,
  `/admin`'i etkilemez):
  - `page.tsx` — ana sayfa: kategori/tarih/metin arama filtreleri, **Liste/
    Harita görünüm geçişi** (`gorunum` query param).
  - `etkinlik/[id]/page.tsx` — detay sayfası, tekli harita.
  - `giris/`, `kayit/` — e-posta/şifre ile herkese açık giriş/kayıt.
  - `favoriler/` — giriş yapan kullanıcının favorilediği etkinlikler.
  - `layout.tsx` — üst menü (giriş durumu, Favorilerim linki).
  - `actions.ts` — `toggleFavorite`, `signOutPublic` server action'ları.
  - Sadece `status='approved'` olan etkinlikler gösteriliyor.
  - `components/FilterBar.tsx` — kategori/tarih/arama + Liste-Harita toggle.
  - `components/EventMap.tsx` / `EventMapInner.tsx` — Leaflet+OpenStreetMap
    (ssr:false dinamik import; Leaflet `window`'a import anında dokunuyor).
  - `components/FavoriteButton.tsx` — kalp ikonu, giriş yoksa `/giris`'e
    yönlendirir.
- **Admin panel:** `app/admin/**`, `middleware.ts` (Supabase Auth + admin
  allowlist ile route koruması — bkz. "Bilinen sorunlar"), `app/admin/
  actions.ts` (server actions: onayla/reddet/ekle/düzenle).
- **PWA:** `app/manifest.ts`, `public/sw.js` (service worker),
  `app/offline/page.tsx`, `public/icons/icon-192.png` /
  `icon-512.png` (**placeholder** — turuncu kare + "E" harfi, gerçek marka
  görseliyle değiştirilmeli).
- **Scraper framework:** `scripts/scrapers/` — fetch→parse→normalize→
  dedupe→upsert pipeline'ı, çalışan bir örnek parser
  (`example-hn.ts`, Hacker News üzerinde pipeline'ı kanıtlamak için —
  gerçek veri kaynağı DEĞİL), ve gerçek bir kaynak (belediye sitesi vb.)
  için doldurulmayı bekleyen `diyarbakir-belediye.template.ts`.
  `.github/workflows/scrape.yml` günde 2 kez cron ile çalıştırıyor
  (henüz gerçek bir kaynak bağlanmadı).

### 4. Doğrulama
Tüm bu iş, Docker üzerinde **yerel bir Supabase** (Supabase CLI ile —
`npx supabase start`) instance'ına karşı uçtan uca (Playwright ile
otomatik) test edildi:
- Ana sayfa seed verisini doğru gösteriyor (approved etkinlikler, pending
  olan gizli), arama ve harita görünümü çalışıyor.
- Yeni ziyaretçi kayıt olup otomatik giriş yapabiliyor, etkinlik
  favorileyip `/favoriler`'de görebiliyor.
- Admin olmayan girişli bir kullanıcı `/admin`'e girmeye çalışınca `/`'ye
  yönlendiriliyor (güvenlik testi — aşağıya bakın).
- Admin login → onay bekleyen etkinlik listesi → onayla/reddet akışı
  çalışıyor.
- `npx tsc --noEmit`, `npx eslint .`, `npx next build` (production)
  hepsi temiz geçiyor.

### 5. Git commit'leri
```
3c657f0 Add public user accounts and event favoriting
4046c58 Add map view (Leaflet + OpenStreetMap) to public site
16a1212 Add event search (title/description/venue) to the public homepage
dc0666d Disable local Supabase analytics (vector) service
f9c695e Add Diyarbakır MVP: public listing, admin panel, PWA layer, Supabase schema, scraper framework
9822e6a Scaffold Next.js 15 + Tailwind + Supabase client, pin to Node 20.5-compatible versions
4f42a50 Initial commit from Create Next App
```

## Bilinen sorunlar / dikkat edilmesi gerekenler

- **Güvenlik — `admin_users` allowlist'i (migration 0002):** Halka açık
  kayıt eklenmeden önce, RLS politikaları "authenticated = admin"
  varsayıyordu ve `middleware.ts` `/admin/*`'e girişi sadece "oturum var
  mı" diye kontrol ediyordu. Bu, kayıt olan HERHANGİ bir ziyaretçiye tüm
  tablolarda tam CRUD ve admin paneline giriş hakkı verirdi. Artık
  `admin_users` tablosunda (id, sadece service-role/SQL editor ile
  eklenir) listelenen kullanıcılar admin sayılıyor; hem RLS politikaları
  hem middleware buna bakıyor. **Yeni bir admin eklerken mutlaka bu
  tabloya da satır eklemeyi unutmayın** (aşağıdaki "admin kullanıcısı"
  bölümüne bakın) — sadece auth kullanıcısı oluşturmak yetmez, `/admin`'e
  giremez.
- **`vector` (analytics/logflare) konteyneri Windows'ta çöküyor:** Docker
  soketine erişemediği için crash-loop'a giriyor ve bu da `supabase stop`'un
  takılmasına sebep oluyordu. `supabase/config.toml`'da
  `[analytics] enabled = false` yapılarak kalıcı çözüldü — bu ayarı geri
  açmayın (Studio'nun Logs sekmesi çalışmaz ama uygulama için sorun değil).
- **Gerçek Supabase projesi yok:** Sadece yerel Docker instance'ı var.
  Production'a çıkmadan önce gerçek bir Supabase Cloud projesi kurulup
  `.env.local` / Vercel env değişkenleri gerçek URL+key'lerle
  güncellenmeli. Migration'ları göndermek için: `npx supabase link` +
  `npx supabase db push`. Production'da `enable_confirmations` muhtemelen
  `true` olacak (e-posta doğrulama gerekecek) — `/kayit` sayfası bu durumu
  zaten ele alıyor (oturum dönmezse "e-postanı onayla" mesajı gösteriyor).
- **PWA ikonları placeholder.**
- **Scraper'da henüz gerçek bir kaynak yok** — `diyarbakir-belediye.template.ts`
  dosyasındaki `// TODO:` yorumları gerçek site incelendikten sonra
  doldurulmalı.
- **Web push bildirimleri henüz yok** — plan.md'nin Faz 1 kapsamında ama
  bu oturumda yapılmadı.

## Ortamı yeniden ayağa kaldırma

```bash
# 1. Yerel Supabase'i başlat (Docker Desktop açık olmalı)
npx supabase start

# 2. Next.js dev server
npm run dev
```

`.env.local` zaten repo dışında (gitignore'lu) ama daha önce oluşturulmuştu;
eğer yoksa `npx supabase start` çıktısındaki `API_URL`, `ANON_KEY`,
`SERVICE_ROLE_KEY` değerleriyle `.env.example`'ı kopyalayıp doldurun.

**Yerel test admin kullanıcısı** (sadece bu makinedeki Docker volume'ünde
var olabilir — `supabase stop`/`db reset` ile volume silinirse tekrar
oluşturulmalı — **iki adım da gerekli**, sadece auth kullanıcısı yetmez):

```bash
# 1) Supabase Auth kullanıcısı oluştur, dönen "id"yi not al
curl -s -X POST "http://127.0.0.1:54321/auth/v1/admin/users" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"test1234","email_confirm":true}'

# 2) O id'yi admin_users tablosuna ekle — bu olmadan /admin'e giremez
curl -s -X POST "http://127.0.0.1:54321/rest/v1/admin_users" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"id":"<yukarıdaki id>"}'
```
- E-posta: `admin@example.com`
- Şifre: `test1234`

Normal (favorileme yapacak) test kullanıcıları için `/kayit` sayfasından
kayıt olmak yeterli — `admin_users`'a eklenmediği sürece otomatik olarak
sadece "normal kullanıcı" olurlar.

## Sırada ne var (önerilen)

1. Web push bildirimleri (plan.md Faz 1'in son maddesi).
2. Gerçek bir Supabase Cloud projesi kurup bağlamak.
3. Vercel'e deploy edip gerçek cihazda PWA "ana ekrana ekle" testi.
4. En az bir gerçek scraper kaynağını (`diyarbakir-belediye.template.ts`
   temel alınarak) doldurmak.
5. PWA ikonlarını gerçek marka görseliyle değiştirmek.

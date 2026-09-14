# Türkiye Etkinlik Platformu — Diyarbakır MVP'den Ulusal Ölçeğe

## Context

Amaç: Türkiye'deki tüm etkinlikleri (konser, tiyatro, atölye, fuar, spor vb.) tek bir platformda toplayan bir uygulama kurmak. Bu, tek başına yürütülen bir yan proje; bütçe düşük/yok, ekip yok. Strateji netleşti:

- **Kapsam:** Önce sadece **Diyarbakır** ile başla, model doğrulanırsa il il genişle.
- **Platform:** Web + mobil aynı anda — ayrı native uygulamalar yazmak yerine **tek kod tabanından PWA (Progressive Web App)** yaklaşımı: hem tarayıcıda çalışır hem telefona "ana ekrana ekle" ile yüklenebilir, App Store/Play Store onay süreci olmadan hızlıca yayınlanabilir.
- **Veri kaynağı:** Başlangıçta **hibrit** — hem web scraping (belediye kültür-sanat sayfaları, üniversite etkinlik duyuruları, bilet siteleri) hem de manuel giriş (admin panelinden elle ekleme). Bu, veri boşluklarını manuel doldururken zamanla otomasyonu artırma imkanı verir.
- **Geliştirme modeli:** Tek geliştirici, düşük bütçe → mümkün olduğunca hazır/yönetilen servisler (BaaS) kullanılacak, kendi sunucu/altyapı yönetimi minimize edilecek.

Bu plan, projeyi sıfırdan (şu an dizin boş) Diyarbakır MVP'sine kadar götürecek mimariyi ve yol haritasını tanımlıyor. Kritik tasarım kararı: **şehir (il) kavramı en baştan veri modeline gömülü** olacak, böylece "Diyarbakır'dan diğer illere yayılma" bir yeniden mimarileme değil, sadece yeni veri/kaynak ekleme işi olacak.

## Önerilen Teknoloji Yığını

| Katman | Teknoloji | Neden |
|---|---|---|
| Frontend (web+PWA) | **Next.js (App Router, TypeScript) + Tailwind CSS** | Tek kod tabanı, SEO dostu (etkinlikler Google'da bulunabilir olmalı), PWA desteği kolay eklenir |
| Backend/DB | **Supabase** (Postgres + Auth + Storage) | Solo geliştirici için hazır BaaS: veritabanı, kimlik doğrulama, dosya depolama, admin arayüzü (Studio) hazır geliyor; cömert ücretsiz katman |
| Scraping | **Node.js + Playwright/Cheerio** script'leri | Playwright JS-render edilen sayfalar için, Cheerio statik HTML için yeterli; TypeScript ile frontend'le aynı dil |
| Zamanlama | **GitHub Actions (cron) veya Vercel Cron** | Scraper'ları günlük/saatlik otomatik çalıştırmak için, sunucu yönetimi gerektirmez |
| Hosting | **Vercel** (frontend) + **Supabase Cloud** (DB) | İkisi de ücretsiz katmanla başlar, solo proje için sıfır DevOps yükü |
| PWA altyapısı | `next-pwa` veya manuel manifest + service worker | Ana ekrana ekleme, offline fallback, ileride web push bildirimleri |
| Harita (faz 2) | Leaflet + OpenStreetMap veya Google Maps embed | Etkinlik konumu gösterimi |

Bu yığın seçilme nedeni: hepsi ücretsiz/düşük maliyetli katmanlarla başlıyor, tek kişi tarafından yönetilebilir, ve native mobil uygulamaya geçiş gerekirse (faz 3) aynı Supabase backend'i Expo/React Native ile yeniden kullanılabilir.

## Veri Modeli (şehir-agnostik, en baştan)

Ana tablolar (Postgres/Supabase):

- `cities` — id, name (`Diyarbakır`, `İstanbul`, ...), slug, is_active (hangi iller şu an yayında)
- `venues` — id, city_id, name, address, lat/lng
- `categories` — id, name (Konser, Tiyatro, Atölye, Fuar, Spor, Sergi, ...)
- `events` — id, title, description, start_at, end_at, city_id, venue_id, category_id, price, source_type (`manual` | `scraped`), source_url, image_url, status (`pending` | `approved` | `rejected`), created_by
- `scrape_sources` — id, city_id, name, url, parser_type, last_run_at, is_active

`status` alanı kritik: scraping ile gelen kayıtlar önce `pending` düşer, admin (başlangıçta sen) onaylayınca `approved` olur ve public sitede görünür. Bu, kötü/yanlış scrape edilmiş verinin doğrudan kullanıcıya gitmesini engeller.

## Uygulama Mimarisi

1. **Public web/PWA** (`/`) — şehir seçici (başta sadece Diyarbakır aktif), tarih/kategori filtreleme, etkinlik kartları, detay sayfası. SEO için server-side rendering (Next.js).
2. **Admin panel** (`/admin`, Supabase Auth ile korumalı) — manuel etkinlik ekleme/düzenleme, scrape edilen `pending` kayıtları onaylama/reddetme, kaynak (scrape_sources) yönetimi.
3. **Scraper job'ları** — ayrı bir `scripts/scrapers/` klasöründe, her kaynak için bir parser (örn. `diyarbakir-belediye.ts`, `dicle-universitesi.ts`); Supabase service-role key ile `events` tablosuna `status=pending` olarak upsert eder (aynı etkinliği tekrar tekrar eklememek için title+start_at+venue bazlı dedup).
4. **Cron tetikleyici** — GitHub Actions workflow, günde 1-2 kez scraper'ları çalıştırır.

## Yol Haritası (Fazlar)

**Faz 0 — Diyarbakır MVP (bu planın kapsamı)**
- Supabase projesi kur, yukarıdaki şema ile tabloları oluştur, sadece Diyarbakır şehrini `is_active` yap
- Next.js PWA: ana sayfa (etkinlik listesi + kategori/tarih filtresi), etkinlik detay sayfası, PWA manifest + service worker
- Basit admin panel: giriş yap, manuel etkinlik ekle/düzenle, pending kayıtları onayla
- 2-3 Diyarbakır kaynağı için scraper (örn. büyükşehir belediyesi kültür-sanat sayfası, bir üniversite etkinlik sayfası) + GitHub Actions cron
- Vercel'e deploy, gerçek cihazda "ana ekrana ekle" testi

**Faz 1 — Diyarbakır'da derinleşme**
- Daha fazla kaynak (STK'lar, kültür merkezleri, Instagram/Facebook etkinlik sayfaları)
- Kullanıcı hesapları, favorileme, arama
- Harita görünümü, web push bildirimleri

**Faz 2 — İl il genişleme**
- Yeni il için: `cities` tablosuna ekle, o il için `scrape_sources` + admin'den manuel giriş
- Mimaride değişiklik gerekmez — sadece veri/kaynak ekleme + o ilde tanıtım/topluluk çalışması

**Faz 3 — Native mobil + gelir modeli**
- Aynı Supabase backend'i kullanan Expo/React Native uygulaması (PWA yeterli gelmezse)
- Öne çıkan etkinlik/sponsorlu listeleme gibi gelir modelleri

## Önemli Uyarılar

- **Scraping hukuki/etik sınırları:** Her kaynağın `robots.txt` ve kullanım şartlarına dikkat edilmeli; agresif/sık istek atmaktan kaçınılmalı, mümkünse kaynağa atıf yapılmalı (linki gösterilmeli). Resmi API sunan kaynaklar (varsa) scraping'e tercih edilmeli.
- **Dedup mantığı** en başından doğru kurulmazsa aynı etkinlik defalarca listelenir — bu MVP'de bile önceliklendirilmeli.

## Doğrulama

- Yerelde `npm run dev` ile Next.js uygulamasını çalıştır, Diyarbakır için eklenen örnek (seed) etkinliklerin listede ve filtrede doğru göründüğünü kontrol et.
- Admin panelinden bir etkinlik manuel ekle, public sayfada anında (veya onay sonrası) göründüğünü doğrula.
- Bir scraper'ı elle çalıştırıp (`npm run scrape:diyarbakir-belediye`) Supabase'de `status=pending` kayıt oluştuğunu, admin panelinden onaylayınca `approved`'a geçip public sitede göründüğünü doğrula.
- Telefonda Chrome/Safari üzerinden siteyi aç, "Ana ekrana ekle" ile PWA olarak kurulumun çalıştığını test et.

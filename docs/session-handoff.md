# Oturum Özeti — Diyarbakır Etkinlik Platformu

Bu dosya, projenin **şu anki durumunu** anlatır: projeye yeni katılan ya da aradan zaman geçtikten sonra dönen biri işi kaldığı yerden devam
ettirebilsin diye. Projenin orijinal planı için
[`docs/plan.md`](./plan.md); scraper'ların ayrıntısı için
[`scripts/scrapers/README.md`](../scripts/scrapers/README.md).

**Son güncelleme:** 2026-09-16 — bubilet.com.tr 4. kaynak olarak eklendi,
sonra production'da görülen iki gerçek sorun düzeltildi: çapraz-kaynak
duplike etkinlikler (bkz. "Dedup ve moderasyon") ve yanlış şehirden bir
etkinlik (bkz. "bubilet.com.tr artık scrape ediliyor" notu aşağıda).

---

## Tek cümlede

Diyarbakır etkinliklerini dört kaynaktan otomatik toplayan, Vercel'de canlı
çalışan bir Next.js + Supabase PWA'sı. **Scraper asıl veri kaynağıdır**;
manuel giriş sadece ulaşılamayan etkinlikler için yedektir.

## Şu an ne çalışıyor

- **Public site** (`app/(public)/`) — ana sayfa (kategori/tarih/metin
  filtreleri, liste ve harita görünümü), etkinlik detayı, giriş/kayıt,
  favoriler. Sadece `status='approved'` kayıtlar görünür.
- **Admin panel** (`app/admin/`) — manuel etkinlik ekleme/düzenleme,
  onayla/reddet. `middleware.ts` + `admin_users` allowlist'i ile korunuyor.
- **Dört gerçek scraper**, günde 2 kez GitHub Actions cron'u ile:
  - `biletinial.com` — ~85 etkinlik/çalıştırma
  - `biletix.com` — ~32 etkinlik/çalıştırma
  - `diyarbakir.bel.tr` (Büyükşehir Belediyesi) — şu an 0 (aşağıya bakın)
  - `bubilet.com.tr` — ~57 etkinlik/çalıştırma (Konser/Tiyatro/Atölye/Spor
    kategorilerinden; Cloudflare bypass gerektiren tek kaynak, aşağıya bakın)
- **PWA katmanı** — manifest, service worker, offline sayfası.
- **Test + CI** — `npm test` (167 test, ağ/DB gerektirmez) ve her push'ta
  typecheck + lint + test çalıştıran `.github/workflows/ci.yml`.

**Görsel kimlik not:** public site'ta indigo aksan rengi "Dicle" tonuna
(`--color-dicle`, `app/globals.css`) geçti, başlıklar Space Grotesk
fontuyla yazılıyor (`--font-display`). Kart grid'i, thumbnail'lar ve genel
yerleşim **bilerek dokunulmadan** bırakıldı. Kural net: tasarım değişiklikleri her zaman mevcut yapının üzerine ekleme
olmalı, yeniden tasarım değil (daha önce tam kapsamlı bir
"Kara Amid" yeniden tasarımı denenip geri alınmıştı).

## Mimari notlar

- Next.js **15.5.25** App Router. **Next 16'ya yükseltmeyin:** bu makinedeki
  Node 20.5.0, Next 16'nın istediği 20.9.0'ın altında.
- `lib/supabase/types.ts` tüm projenin ortak veri sözleşmesi. Elle yazıldığı
  için postgrest-js'in beklediği `Relationships`/`Views`/`Functions`
  alanlarını içermiyor; bu yüzden okumalarda `.returns<T[]>()` (tüm
  filtrelerden sonra, `.single()`'dan sonra DEĞİL), yazmalarda `as never`
  deseni kullanılıyor. Scraper tarafında aynı sorun
  `scripts/scrapers/lib/supabase-admin.ts` içinde tip seviyesinde
  adapte edilerek çözülüyor.
- Public sayfalarda `export const dynamic = "force-dynamic"` var. Sebebi:
  scraper cron'u Supabase'e doğrudan yazıyor, Next.js'ten hiç geçmiyor, yani
  `revalidatePath` çağıracak bir istek yok. Bu satır olmadan taze veri
  Next'in fetch cache'inin arkasında takılı kalabiliyor. **Kaldırmayın.**

## Tekrar tekrar ısıran iki konu

### 1. Saat dilimi

Her etkinlik saati UTC olarak saklanır, Türkiye saatiyle (UTC+3, 2016'dan
beri DST yok) gösterilir. İki tuzak var ve ikisi de canlıda 3 saatlik yanlış
saat olarak patladı:

- `new Date("2026-09-18T20:00:00")` — offset'siz string **runtime'ın** saat
  dilimine göre okunur (Vercel ve GitHub Actions = UTC). Bunun yerine
  `parseIstanbulLocalTime` (scraper) veya `lib/istanbul-time.ts` (uygulama).
- `Intl.DateTimeFormat`'a `timeZone` vermemek — aynı hata, gösterim
  tarafında.
- Ek olarak: `hour12: false` ile `hourCycle: "h23"` aynı şey DEĞİL. Bazı
  locale'lerde ilki gece yarısını "24:15" diye yazar ve
  `<input type="datetime-local">` bunu geçersiz sayıp alanı boş gösterir.
  Her zaman `hourCycle` kullanın.

Bunların hepsi testlerle sabitlendi ve testler bilerek **Türkiye olmayan,
DST uygulayan** bir saat diliminde (`America/New_York`) koşuyor — böylece
bir regresyon production'da değil, test çıktısında görünüyor.

Aynı tuzak "bugün mü" karşılaştırmalarında da geçerli: kartlardaki
"Bugün/Yarın" rozetini üreten `formatEventBadge` (`lib/format-event.ts`)
hem etkinliğin hem de `now`'un **İstanbul takvim gününü** hesaplayıp
karşılaştırır. UTC tarihlerini karşılaştırmak, İstanbul'da 00:00–03:00
arasındaki etkinlikleri bir gün yanlış etiketler.

### 2. Kaynaklar tarih formatı konusunda tutarsız

biletinial'in `SeanceDate` alanı aynı Türkiye saatini bazen "Z" ekiyle,
bazen eksiz döndürüyor. Bu iki ayrı buga yol açtı: biri saati hesaplarken
(`parseIstanbulLocalTime`), diğeri JSON-LD kaydını eşleştirirken
(`stripDateTimeOffset` uygulanmadığı için etkinliklerin ~%80'i fiyatsız
kaldı). **Bir kaynaktan gelen iki zaman damgasını karşılaştırırken önce
`stripDateTimeOffset`'ten geçirin.**

## Dedup ve moderasyon

- Dedup anahtarı **`(title, start_at)` tam eşleşme + normalize edilmiş
  başlık fallback'i**. `venue_id` bilerek dışarıda (iki kaynak aynı mekânı
  farklı yazıyor — "... Kültür ve Kongre Merkezi" vs "... KKM"). Tam
  eşleşme bulunamazsa `upsertScrapedEvent` aynı `start_at`'teki satırları
  çekip `normalizeTitleForDedup`/`titlesMatchForDedup`'la ("Konseri",
  "Oyunu" gibi tür sözcüklerini ve noktalama işaretlerini atan, eşitlik VEYA
  içerme kontrolü yapan) karşılaştırıyor. 2026-09-16'da bubilet eklenince
  bu gerçek bir prod bug'ıydı: "Büyük Afrika Sirki" (biletix) vs "Büyük
  Afrika Sirki Oyunu" (bubilet) canlıda iki ayrı kart olarak görünüyordu.
  Detay ve gerekçe: `scripts/scrapers/lib/upsert-event.ts`'nin başlığı.
  **2026-09-16'da ikinci bir fallback daha eklendi:** aynı `start_at`
  bazlı karşılaştırma bile bazı gerçek çiftleri kaçırıyordu, çünkü
  kaynaklar aynı etkinliği FARKLI saatlerle bildiriyor (biletix'in
  "Dedublüman"ı 20:00, bubilet'in "Dedublüman Konseri"si 21:00 — kapı
  açılışı/gösteri başlangıcı farkı ya da vendor'ların kendi yuvarlaması).
  Şimdi tam eşleşme + aynı `start_at` fallback'i de bulamazsa, üçüncü bir
  sorgu aynı İstanbul takvim gününe düşen ve FARKLI bir kaynaktan gelen
  satırları çekip `sameDayCrossSourceMatch`'le karşılaştırıyor. "Farklı
  kaynak" şartı kritik: tek bir kaynağın kendi sayfası aynı gün gerçekten
  iki ayrı seans listeleyebiliyor (matine + akşam, örn. "Alice Harikalar
  Diyarında") — bunlar birleştirilmemeli. Detay: `lib/normalize.ts`'teki
  `sameDayCrossSourceMatch`/`istanbulCalendarDate` ve
  `upsert-event.ts`'nin başlığı.
  Bu fallback'ler **yeni** satırları korur — o tarihten önce oluşmuş çift
  kayıtlar için `scripts/scrapers/merge-duplicate-events.ts` var (tek
  seferlik, dry-run varsayılan, `--apply` ile siler, artık aynı
  `sameDayCrossSourceMatch`'i kullanıyor ki ikisi birbirinden sapmasın;
  hangi DB'ye bağlıysa `.env.local`/ortam değişkenleri onu temizler —
  **production'ı temizlemek için o değişkenleri bilerek production'a
  yönlendirmek gerekiyor**, ayrı bir "prod modu" yok). 2026-09-16'da
  production'da 5 gerçek çift bulundu ve `--apply` ile silindi
  (134 → 129 etkinlik).
- Scraped etkinlikler **doğrudan `approved`** olarak giriyor; onay kuyruğu
  kaldırıldı (kaynakların hepsi resmi bilet satıcısı ya da belediyenin
  kendisi). Ama bir admin elle "reddet" derse, sonraki scrape içeriği
  tazeler ve `status`'a **dokunmaz** — reddi geri almaz.
- İleride düşük güvenli bir kaynak eklenirse (ör. plan.md'deki Instagram
  fikri) o kaynak `status: "pending"` yazmalı; bu varsayılanı miras almamalı.

## Bilinen durumlar

- **Belediye scraper'ı şu an 0 etkinlik getiriyor — bu normal.** 2026-09-15'te
  doğrulandı: sayfada 20 etkinlik var ama hepsi Mart–Haziran tarihli, yani
  geçmiş. Log artık bunu açıkça yazıyor ("the municipality has nothing
  upcoming published right now"). Sıfır ham etkinlik görülürse log farklı bir
  mesaj verir — o zaman sayfa yapısı değişmiş demektir.
- **biletinial'de ~14/85 etkinlikte fiyat ve bitiş saati yok.** Kaynak
  kaynaklı: biletinial'in JSON-LD'si sadece en yakın ~10 seansı listeliyor,
  uzak tarihli bir etkinlik henüz orada değil. Tarih yaklaştıkça kendiliğinden
  düzeliyor. Açıklama metni bundan etkilenmiyor (sayfa gövdesinden alınıyor).
- **bubilet.com.tr artık scrape ediliyor — bilinçli bir istisna.** Tüm
  siteyi kapsayan bir Cloudflare bot koruması var; başta bunu
  aşmanın "otomatik erişim istemediğini açıkça belirtmiş bir siteye karşı
  tespit-atlatma aracı yazmak" olacağı gerekçesiyle bilerek yapılmamıştı
  (parse.bot gibi üçüncü parti servisler de aynı sebeple reddedilmişti).
  2026-09-16'da proje sahibi bu riski bilerek kabul edip devam etmeyi
  istedi. Uygulama: `scripts/scrapers/bubilet_fetch.py` (Python,
  `cloudscraper` ile) Cloudflare'i aşıp ham JSON'u çekiyor,
  `scripts/scrapers/bubilet.ts` bunu alt süreç olarak çalıştırıp sonucu
  normal normalize/resolve/upsert boru hattına sokuyor — depodaki **tek**
  Python bağımlılığı bu. Detaylar ve gerekçe: `bubilet_fetch.py`'nin
  başlığı ve `scripts/scrapers/README.md`. Bu, bir sonraki engellenmiş
  kaynak için otomatik bir emsal değil — her seferinde ayrı bir karar.
  **Ayrıca:** bubilet'in `city/{id}/tag/{id}` filtresi güvenilir değil —
  ulusal turneye çıkan bir etkinlik (örn. "Bosphorus Open Air Metal Fest",
  gerçek mekânı İstanbul) `city/21` (Diyarbakır) altında da döndü.
  `bubilet_fetch.py` artık her mekânın kendi `cityId`'sini kontrol edip
  gerçekten Diyarbakır olmayanları atıyor (`is_actually_diyarbakir`).
- **Instagram'dan yarı-otomatik etkinlik ekleme eklendi (2026-09-16).**
  `/admin/etkinlik/instagramdan-ekle` — admin caption metnini yapıştırır,
  poster görselini yükler; sunucu Instagram'a HİÇBİR istek atmaz. Görsel
  Supabase Storage'a (`event-images` bucket) yüklenir, Claude Haiku
  (vision) ile alan çıkarımı yapılır, sonuç mevcut event formuyla
  önizlenir/düzeltilir, kaydedilince `status: "pending"` olarak eklenir —
  yayına girmeden önce mevcut `/admin` onay kuyruğundan geçer. Yeni env
  değişkeni: `ANTHROPIC_API_KEY` (`.env.local` + Vercel; scrape cron'una
  eklenmedi, bu akış sadece admin panelinde çalışıyor). Detay:
  `docs/design/instagram-assisted-entry.md`.
- **PWA ikonları hâlâ placeholder** (turuncu kare + "E").
- **Web push bildirimleri yok** (plan.md Faz 1'de var, ertelendi).
- `.env.local` yerel Supabase'i (`127.0.0.1:54321`) gösteriyor. Scraper'ları
  elle çalıştırırsanız **yerel** DB'ye yazarlar. Dikkat: env değişkenlerini
  temizlemek bunu engellemez, çünkü `supabase-admin.ts` `.env.local`'i
  dotenv ile kendisi yüklüyor.
- **`vector` (analytics) konteyneri Windows'ta çöküyor** — `supabase/config.toml`'da
  `[analytics] enabled = false` ile kalıcı çözüldü, geri açmayın.

## Geliştirme

```bash
npx supabase start   # yerel Supabase (Docker Desktop açık olmalı)
npm run dev          # http://localhost:3000

npm test             # 181 test, ağ ve DB gerektirmez, ~0.5 sn
npm run typecheck
npm run lint
npm run scrape       # dört scraper'ı da çalıştırır (.env.local'deki DB'ye yazar)
```

> **Not:** `npm run build` çalışırken `npm run dev` açıksa `.next` kilidi
> yüzünden takılabilir. Ya dev server'ı kapatın ya da build'i Vercel'e
> bırakın.

> **Not:** `npm run scrape` bubilet için Python 3 + `pip install -r
> scripts/scrapers/requirements.txt` ister (bkz. `scripts/scrapers/README.md`).
> Kurulu değilse sadece bubilet parser'ı hata verir, diğer üç kaynak
> etkilenmez.

Yeni test dosyası eklerseniz `package.json`'daki `scripts.test` listesine de
ekleyin — Node 20'nin test runner'ı `.ts` dosyalarını glob'layamıyor.
`scripts/test-registry.test.ts` bunu unutursanız sizi uyarır.

**Yerel test admin kullanıcısı** (iki adım da gerekli — sadece auth
kullanıcısı oluşturmak `/admin`'e girmeye yetmez):

```bash
# 1) Auth kullanıcısı oluştur, dönen "id"yi not al
curl -s -X POST "http://127.0.0.1:54321/auth/v1/admin/users" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"test1234","email_confirm":true}'

# 2) O id'yi admin_users tablosuna ekle
curl -s -X POST "http://127.0.0.1:54321/rest/v1/admin_users" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"id":"<yukarıdaki id>"}'
```

Normal kullanıcılar için `/kayit` yeterli — `admin_users`'a eklenmedikleri
sürece admin olmazlar.

## Sırada ne var (öneri)

1. **Daha fazla kaynak.** Asıl hedef bu — bubilet eklendi (bkz. yukarısı),
   sırada belediye/bubilet dışındaki kurumlar (üniversiteler, kültür
   merkezleri, mekânların kendi siteleri) ve plan.md'deki Instagram fikri.
2. **Dedup'ın kalan sınırı** — 2026-09-16'da eklenen normalize edilmiş
   başlık fallback'i ("Konseri"/"Oyunu" gibi ekleri ve noktalamayı atan
   eşitlik/içerme kontrolü) ve aynı gün + farklı kaynak fallback'i
   (`sameDayCrossSourceMatch`) bilinen vakaların hepsini çözdü, ama gerçek
   fuzzy matching (yazım hatası, kelime sırası, çeviri farkı) değil ve
   sadece TEK gün içindeki saat farklarını kapsıyor — canlıda yeni bir
   çift kayıt türü görülürse ilk şüphelenilecek yer `lib/normalize.ts`'teki
   `titlesMatchForDedup`/`sameDayCrossSourceMatch`.
3. **PWA ikonlarını gerçek marka görseliyle değiştirmek.**
4. **Web push bildirimleri.**
5. Bir kaynak sessizce bozulduğunda haber veren bir uyarı mekanizması —
   şu an bunu ancak CI logunu okuyarak fark ediyoruz.

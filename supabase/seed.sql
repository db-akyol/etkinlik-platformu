-- Seed data for local/dev testing.
-- Intended for a FRESH dev project (after schema.sql has been applied) — running
-- this twice against the same database will violate the unique constraints on
-- cities.slug / categories.slug and the events dedup index. If you need to
-- re-seed, truncate the tables first (in dependency order: events, venues,
-- scrape_sources, categories, cities).

-- Fixed UUIDs are used (instead of gen_random_uuid()) purely so this file can
-- wire up foreign keys between inserts without round-tripping through the DB.

-- ============================================================================
-- City: Diyarbakır
-- ============================================================================

insert into cities (id, name, slug, is_active) values
  ('11111111-1111-1111-1111-111111111111', 'Diyarbakır', 'diyarbakir', true);

-- ============================================================================
-- Categories
-- ============================================================================

insert into categories (id, name, slug) values
  ('22222222-2222-2222-2222-222222222221', 'Konser', 'konser'),
  ('22222222-2222-2222-2222-222222222222', 'Tiyatro', 'tiyatro'),
  ('22222222-2222-2222-2222-222222222223', 'Atölye', 'atolye'),
  ('22222222-2222-2222-2222-222222222224', 'Fuar', 'fuar');

-- ============================================================================
-- Venues (Diyarbakır)
-- ============================================================================

insert into venues (id, city_id, name, address, lat, lng) values
  (
    '33333333-3333-3333-3333-333333333331',
    '11111111-1111-1111-1111-111111111111',
    'Diyarbakır Kültür Merkezi',
    'Ofis Mah. Elazığ Cad. No:12, Yenişehir, Diyarbakır',
    37.9130,
    40.2100
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '11111111-1111-1111-1111-111111111111',
    'Diyarbakır Atatürk Stadı',
    'Bağlar Mah. Stadyum Cad. No:5, Bağlar, Diyarbakır',
    37.9080,
    40.1950
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'Dicle Üniversitesi Kongre Merkezi',
    'Dicle Üniversitesi Kampüsü, Sur, Diyarbakır',
    37.8950,
    40.2380
  );

-- ============================================================================
-- Events (mix of approved / one pending, source_type = 'manual')
-- ============================================================================

insert into events (
  id, title, description, start_at, end_at, city_id, venue_id, category_id,
  price, source_type, source_url, image_url, status, created_by
) values
  (
    '44444444-4444-4444-4444-444444444441',
    'Diyarbakır Bahar Konseri',
    'Yerel sanatçıların katılımıyla açık hava bahar konseri.',
    '2026-04-18 20:00:00+03',
    '2026-04-18 22:30:00+03',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    '22222222-2222-2222-2222-222222222221',
    '150 TL',
    'manual',
    null,
    null,
    'approved',
    null
  ),
  (
    '44444444-4444-4444-4444-444444444442',
    'Kral Lear - Tiyatro Gösterimi',
    'Şehir tiyatrosu tarafından sahnelenen klasik dram uyarlaması.',
    '2026-03-05 19:30:00+03',
    '2026-03-05 21:30:00+03',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333331',
    '22222222-2222-2222-2222-222222222222',
    '100 TL',
    'manual',
    null,
    null,
    'approved',
    null
  ),
  (
    '44444444-4444-4444-4444-444444444443',
    'Seramik Atölyesi: Başlangıç Seviyesi',
    'Çömlekçi çarkında temel seramik teknikleri üzerine uygulamalı atölye.',
    '2026-02-14 11:00:00+03',
    '2026-02-14 14:00:00+03',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333331',
    '22222222-2222-2222-2222-222222222223',
    '75 TL',
    'manual',
    null,
    null,
    'approved',
    null
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'Diyarbakır Kitap ve Kültür Fuarı',
    'Yayınevleri, yazarlar ve söyleşilerin buluştuğu yıllık kitap fuarı.',
    '2026-05-02 10:00:00+03',
    '2026-05-10 19:00:00+03',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222224',
    'Ücretsiz',
    'manual',
    null,
    null,
    'approved',
    null
  ),
  (
    '44444444-4444-4444-4444-444444444445',
    'Akustik Gece: Genç Yetenekler',
    'Üniversiteli müzisyenlerin sahne aldığı akustik performans gecesi.',
    '2026-03-21 20:00:00+03',
    null,
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222221',
    '50 TL',
    'manual',
    null,
    null,
    'approved',
    null
  ),
  (
    '44444444-4444-4444-4444-444444444446',
    'Ahşap Oyma Atölyesi',
    'Geleneksel ahşap oyma tekniklerinin öğretildiği yeni başvurulan atölye (onay bekliyor).',
    '2026-04-09 13:00:00+03',
    '2026-04-09 16:00:00+03',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333331',
    '22222222-2222-2222-2222-222222222223',
    '60 TL',
    'manual',
    null,
    null,
    'pending',
    null
  );

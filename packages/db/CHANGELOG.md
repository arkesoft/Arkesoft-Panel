# @arkesoft/db

## 0.2.0

### Minor Changes

- Mağazanın seçtiği tema artık kendi vitrininde gerçekten render ediliyor: ilk tema paketi
  (`modern`) ana sayfa ve "sayfa bulunamadı" şablonlarıyla storefront'a bağlandı, tema rengi ve
  yazı tipi ayarları sayfaya otomatik uygulanıyor. Mağaza sahibi bu sürümde henüz bir yüzey
  görmüyor (tema seçimi her mağaza için şimdilik sabit) — bu, "tema seç, siteyi kur" vaadinin
  temel alt yapısını kuruyor. [v0.0.10]

### Patch Changes

- @arkesoft/config@0.2.0
  - @arkesoft/errors@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies
  - @arkesoft/config@0.1.1
  - @arkesoft/errors@0.1.1

## 0.1.0

### Minor Changes

- 08ba11d: Tenant izolasyonu artık veritabanı seviyesinde zorluyoruz. Postgres RLS (Row Level Security) ve FORCE RLS ile her sorgu otomatik olarak mağazanın verilerine filtrelenir. İkinci bir rol (`arkesoft_app`) ayarlanarak uygulama en az yetkisi ilkesiyle koşuyor. Yeni `withTenant()` fonksiyonu transaction'lara tenant context'i bağlar; context'siz sorgu sıfır satır döner (hata değil). Linter 20 kural ile izolasyon ihlalini CI'da yakalar. Test komutu `pnpm test:isolation` yeni ve zorunlu.

  ⚠ OPERATÖR KIRILMASI: `.env` dosyasına iki yeni değişken gerekiyor (`DATABASE_MIGRATION_URL`, `DATABASE_BOOTSTRAP_URL`) ve adım olarak çalıştırılması zorunlu olan `pnpm db:bootstrap` adımı geldi. Mevcut `.env`'de bu değişkenler yoksa `pnpm env:check` kırmızıya düşecek. Geçiş talimatları ve geri alma adımları `docs/development.md`'de açıklanmıştır. [v0.0.13]

### Patch Changes

- Updated dependencies [7b41a06]
- Updated dependencies [b072657]
  - @arkesoft/config@0.1.0
  - @arkesoft/errors@0.1.0

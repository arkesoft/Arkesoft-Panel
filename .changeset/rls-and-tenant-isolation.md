---
'@arkesoft/db': minor
---

Tenant izolasyonu artık veritabanı seviyesinde zorluyoruz. Postgres RLS (Row Level Security) ve FORCE RLS ile her sorgu otomatik olarak mağazanın verilerine filtrelenir. İkinci bir rol (`arkesoft_app`) ayarlanarak uygulama en az yetkisi ilkesiyle koşuyor. Yeni `withTenant()` fonksiyonu transaction'lara tenant context'i bağlar; context'siz sorgu sıfır satır döner (hata değil). Linter 20 kural ile izolasyon ihlalini CI'da yakalar. Test komutu `pnpm test:isolation` yeni ve zorunlu.

⚠ OPERATÖR KIRILMASI: `.env` dosyasına iki yeni değişken gerekiyor (`DATABASE_MIGRATION_URL`, `DATABASE_BOOTSTRAP_URL`) ve adım olarak çalıştırılması zorunlu olan `pnpm db:bootstrap` adımı geldi. Mevcut `.env`'de bu değişkenler yoksa `pnpm env:check` kırmızıya düşecek. Geçiş talimatları ve geri alma adımları `docs/development.md`'de açıklanmıştır. [v0.0.13]

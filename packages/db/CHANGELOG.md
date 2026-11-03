# @arkesoft/db

## 0.3.0

### Minor Changes

- Arka plan iş altyapısı kuruldu: uzun süren işler artık HTTP isteğinin dışına taşınabiliyor.
  BullMQ tabanlı bir kuyruk, kendi Redis bağlantısı, üst sınırlı exponential backoff ile tekrar
  deneme ve başarısız işlerin düştüğü ayrı bir ölü mektup kuyruğu (DLQ) eklendi. İşler ayrı bir
  worker sürecinde (`pnpm dev:worker`) koşuyor; `pnpm dev` worker'ı bilinçli olarak başlatmaz.

  Her iş artık veritabanında birinci sınıf, mağazaya kapsamlı bir kayıt: durum, ilerleme (0-100),
  hata ve zaman damgaları saklanıyor. İlk iş türü olarak "mağaza kurulumu" iskeleti eklendi —
  adımlarını loglayıp ilerlemesini yazıyor, gerçek kurulum işini henüz yapmıyor (o iş v0.2.0'da).
  `Job` tablosu Postgres RLS ile korunuyor; bir mağazanın işleri başka bir mağazadan ne okunabilir
  ne yazılabilir, worker her işi işin kendi mağaza bağlamı altında koşturuyor.

  SIGTERM sonrası temiz kapanış garantisi (v0.0.4) yeni worker süreci için de korundu: devam eden
  iş sınırlı süre beklenir, kuyruk ve Redis bağlantıları kapatılır, açık handle bırakılmaz.

  Operatör notu: kuyruk testleri `pnpm infra:up` ile gelen compose Redis'ini gerektirir. Redis
  `appendonly yes` ve `noeviction` ile yapılandırılmamışsa kuyruk testleri Türkçe, okunur bir
  mesajla **başlamadan** durur — 6379 portunda ikinci bir Redis (ör. `brew services start redis`)
  çalışıyorsa onu durdurmak gerekiyor. Ayrıntı: `docs/development.md` → "Kuyruk worker'ı". [v0.0.11]

### Patch Changes

- @arkesoft/config@0.3.0
  - @arkesoft/errors@0.3.0

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

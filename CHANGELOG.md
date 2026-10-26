# Değişiklik Kaydı — Arkesoft Platform

Bu dosya **platform çekirdeğinin** sürüm geçmişini tutar ve [Changesets](https://github.com/changesets/changesets) tarafından üretilir. Elle düzenleme yapılmaz; girdiler `.changeset/*.md` dosyalarından gelir.

Sürümleme [Semantic Versioning](https://semver.org/lang/tr/) kurallarına uyar. Platform, `theme-sdk`, her tema ve public API birbirinden bağımsız semver taşır; kuralların tamamı `ROADMAP.md` → _Sürüm Politikası_ bölümündedir.

Bağımsız versiyonlanan paketler kendi değişiklik kayıtlarını kendi klasörlerinde tutar:

- `packages/theme-sdk/CHANGELOG.md`
- `packages/themes/modern/CHANGELOG.md`
- `packages/themes/corporate/CHANGELOG.md`

## Changeset ekleme

```bash
pnpm changeset
```

- Özet **Türkçe** ve kullanıcıya dönük yazılır; doğrudan sürüm notuna girer.
- Özet, ait olduğu ROADMAP versiyonunu belirtir. Örnek:
  `Sipariş iptal akışı eklendi. Kısmi iade desteği dahil. [v0.9.0]`
- Davranış değiştiren her PR bir changeset içerir; yalnızca `docs`, `test` ve `chore` PR'ları muaftır.

---

<!-- Changesets bu çizginin altına yazar. Elle girdi eklemeyin. -->

> **Not:** Changesets `v0.0.12`'de kurulacak. `0.0.1` – `0.0.11` arası girdiler bu nedenle
> elle yazılmıştır; `v0.0.12`'den sonra bu bölüm tamamen Changesets tarafından üretilir.

## 0.0.4 — 2026-10-26

Platformun ilk HTTP yüzeyini açan, her istekte tenant bağlamını taşıyan ve merkezi hata yönetimini kuran NestJS API iskeletinin tamamlanması.

- **NestJS 12.2.0 API iskeleti** — `main.ts`, global Zod doğrulama pipe, graceful shutdown, `/health` (liveness) ve `/health/ready` (readiness) endpoint'leri
- **Tenant context yönetimi** — AsyncLocalStorage ile istek scope'a tenant bilgisi; host adından veya `x-arkesoft-tenant` başlığından (geliştirme ortamında) çözüm
- **Fail-closed tasarım** — middleware çözümlemez, guard exhaustive switch ile kararlar; bilinmeyen host'ta TENANT_NOT_FOUND 404'ü
- **Standart hata sözleşmesi** — `{ code, message, details, requestId }` yapısı; tüm yanıtlara birebir uyumlu
- **`@arkesoft/errors` iç paketi** — `AppError`, `AppErrorBody` Zod şeması, `maskEmail` + redaction ilkelleri
- **Yapılandırılmış JSON log (pino)** — `requestId` korelasyonu, sır/PII maskeleme, tenant bağlamı her kaydında
- **Zod doğrulama** — `ValidatedBody/Query/Params` dekoratörleri, `class-validator` **çıkarıldı**
- **Paket sürümleri:** kök **0.0.4**, `@arkesoft/api` **0.0.4**, `@arkesoft/db` **0.0.4**, `@arkesoft/errors` **0.0.4** (yeni), `@arkesoft/config` **0.0.3** (değişmedi)
- **Kabul kriteri:** 14 dosya / 112 API test, 0 failed / 0 skipped; `/health` 200; bilinmeyen host 404; `demo-magaza.arkesoft.localhost` tenant çözümü
- **Uyarı:** v0.0.13'e kadar tenant izolasyonunun tek savunma hattı uygulama katmanıdır; RLS politikaları henüz yok

## 0.0.3 — 2026-10-26

Veritabanı katmanının temel modelleri ve Prisma kurulumu. Çok kiracılı veri izolasyonunun temeli.

- **Prisma 7.10.1 kurulumu** — `@prisma/adapter-pg` + `pg` + `@types/pg` zorunlu bağımlılık
  (Prisma 7 mimarisi).
- **`@arkesoft/db` paketi** — `Tenant`, `User`, `TenantMembership` modelleri ve ilk migration
  (`20261026082729_init`). Şema RLS'e hazırlanmış: tenant'a bağlı tablolarda `tenant_id TEXT NOT NULL`,
  ön kolon indeks, v0.0.13'ten itibaren zorlayıcı RLS politikaları gelecek.
- **Konvansiyonlar:** Cuid2 `text` PK (uzunluk-sınırsız), `Timestamptz(3)` zaman alanları, soft
  delete `deletedAt`, platform seviyesi vs. tenant'a bağlı tablolar taksonomi ile ayrılmış.
  Detay: ADR-0003.
- **Seed ve migration:** `pnpm db:reset && pnpm db:seed` iki kez üst üste exit 0 (idempotans).
  Demo tenant (`demo-magaza`) ve demo owner kullanıcısı (`demo-yonetici@arkesoft.test`).
- **Script yüzeyinde güvenlik:** `db:push` ve `db:reset` yıkıcı komutları allowlist'li sarmalayıcıdan
  geçiyor; host kontrolü (yalnızca localhost/127.0.0.1), `NODE_ENV` varsayılan-reddet, kaçış kapısı
  (ARKESOFT_CONFIRM_DESTRUCTIVE). Diğer veri komutları (`db:seed`, `migrate dev`, `migrate reset`)
  da aynı mekanizmada.
- **Test altyapısı:** Vitest kurulumu, seri koşum (gerçek DB ortağı), tenant izolasyon süiti v0.0.13.
- **`packages/config` devDep → dep** — tek doğrulama noktası: `packages/db/src/env.ts` →
  `readDatabaseEnv()`.
- **Kabul kriteri geçti:** 4 test dosyası / 63 test (%100 yeşil, 0 skipped), lint/typecheck/build/format
  tümü exit 0, AC4 kuralı lint ile zorlanıyor (`packages/config/eslint/base.js`).
- RLS politikaları, rol ayrımı, `FORCE ROW LEVEL SECURITY`, tenant context kancası **v0.0.13**'de
  gelecek. Bu sürümde şema hazırlanmış, yönetim henüz değil (AC8 teknik borç).

## 0.0.2 — 2026-10-26

Yerel geliştirme altyapısı. Tek komutla beş servis ayağa kalkıyor.

- `pnpm infra:up` ile Postgres 17, Redis 8, Meilisearch, S3 uyumlu depolama ve
  Mailpit ayağa kalkıyor; komut tüm servisler `healthy` olmadan geri dönmüyor.
- Verileri isimli Docker volume'larında kalıcı. `pnpm infra:down` veriyi korur,
  `pnpm infra:reset` sıfırdan kurar — ikisi de ayrı ayrı doğrulandı.
- Ortam değişkenleri Zod şemasıyla doğrulanıyor (`packages/config/src/env.ts`).
  `pnpm env:check` değerleri denetler ve parola/anahtarları maskeleyerek basar.
- `docs/development.md`: kurulum, komutlar, bilinen tuzaklar, sorun giderme.
- Yerel S3 servisi MinIO yerine **SeaweedFS**: MinIO'nun public Docker imajları
  artık anonim çekilemiyor. Üretim depolaması (Cloudflare R2) etkilenmedi.
  Gerekçe ve alternatifler: `docs/adr/0005-yerel-s3-depolama.md`.
- Postgres veritabanı seviyesinde Türkçe collation **bilinçli olarak**
  ayarlanmadı; gerekçesi `docs/development.md`'de. Türkçe sıralama v0.4.0'da
  kolon/sorgu seviyesinde gelecek.

## 0.0.1 — 2026-10-26

Monorepo iskeleti. Henüz çalışan bir ürün yok; bu sürüm sonradan değiştirmesi pahalı olan
temel yapıyı sabitler.

- Turborepo + pnpm workspace kurulumu. Araç sürümleri `pnpm-workspace.yaml` catalog'unda
  tek yerde tutuluyor; monorepo genelinde sürüm kayması oluşmuyor.
- `@arkesoft/config`: paylaşılan tsconfig preset'leri (base/node/react), tip bilgisine
  dayalı katı ESLint yapılandırması, Prettier yapılandırması ve Tailwind v4 token iskeleti.
- Dokuz paket iskeleti: `apps/api`, `apps/admin`, `apps/superadmin`, `apps/storefront`,
  `packages/db`, `packages/trpc`, `packages/ui`, `packages/theme-sdk`,
  `packages/integrations`. Hepsi derleniyor, lint ve typecheck'ten geçiyor.
- ESLint kuralları CLAUDE.md'deki yasakları makine tarafından zorluyor: `any`, `console.*`,
  sınıf tabanlı React bileşeni, hata yutma ve eksik dönüş tipi hata üretiyor.
- ADR şablonu (`docs/adr/0000-sablon.md`).
- TypeScript `6.0.3`'e sabitlendi; gerekçesi `ROADMAP.md` → Varsayımlar A13.
- Hedef Node sürümü 24 LTS olarak düzeltildi (önceki varsayım 22 LTS); gerekçesi
  `ROADMAP.md` → Varsayımlar A1.

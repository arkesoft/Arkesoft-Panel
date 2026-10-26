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

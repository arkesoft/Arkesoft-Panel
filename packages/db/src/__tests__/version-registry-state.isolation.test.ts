// @arkesoft/db — AC-11 sapma testi: `Tenant.theme*` (deprecated ayna kolon)
// ile `TenantVersionState.theme*` (tek yazılabilir doğruluk kaynağı) demo
// kiracı için EŞİT mi (ROADMAP v0.0.21, T-018/S5, ADR-0020 Karar 1).
//
// CANLI VERİTABANI GEREKTİRİR — `pnpm db:seed` koşmuş olmalı (`DEMO_SEED`
// fixture'ı, `tenant.test.ts`/`membership.test.ts`'in BİREBİR deseni: hata
// mesajı "pnpm db:seed koşmuş mu?" sorar, tenant'ı KENDİSİ YARATMAZ).
//
// Bu dosya `createTenantIsolationSuite()`'in çağrı noktası DEĞİLDİR — o süit
// `TENANT_SCOPED_TABLES`'ın TAMAMI için TEK bir çağrı noktasında yaşar
// (`tenant-membership.isolation.test.ts`, S4'ün sahipliği, BURADA İKİNCİ bir
// çağrı noktası AÇILMAZ). Bu dosya `rollback-auth-role.isolation.test.ts`/
// `auth-role-guard.isolation.test.ts` emsali: tek bir OLGUYU (sapma)
// doğrulayan, BAĞIMSIZ, basit bir `*.isolation.test.ts` dosyası.
//
// ⚠⚠ AC-11 ÜÇ PARÇA (architect, totoloji önleme):
//   (a) demo kiracı için iki satır EŞİT.
//   (b) Test VERİTABANINDAN OKUDUĞU İKİ SATIRI karşılaştırır — `DEMO_SEED`
//       veya `version-registry-seed.ts`'ten okunan bir SABİTLE KARŞILAŞTIRMA
//       YAPILMAZ. Aksi hâlde bu test yalnızca "seed'in yazdığı değer
//       kendisiyle eşittir" derdi (totoloji) — SAPMANIN YOKLUĞUNU KANITLAMAZ.
//   (c) BOZARAK DOĞRULAMA — bu testin GERÇEKTEN iki satırı karşılaştırdığının
//       (ve örneğin yanlışlıkla her ikisini de `undefined`/aynı değişkene
//       bağlayıp her zaman yeşil kalan bir totolojiye DÖNÜŞMEDİĞİNİN) kanıtı
//       elle yapılan bir mutasyon + kırmızı gözlem + geri alma ile üretildi
//       (Task raporu "AC-11'in BOZARAK DOĞRULAMASI" — `psql` ile
//       `tenant_version_state.theme_version`'ı TEK satırda değiştirip bu
//       testi tekrar koşturmak; S1/S3'ün kod-mutasyonu emsalinin veri
//       karşılığı). Otomatik bir "kendi kendini bozan" test BURAYA
//       YAZILMADI — bir test kendi iddiasının olumsuzunu güvenilir biçimde
//       kendi içinde üretemez; ampirik doğrulama bu yüzden AYRI bir adımdır.

import { describe, expect, it } from 'vitest'

import { DEMO_SEED, withTenant } from '../index.js'
import { testAppPrisma } from './helpers/test-client.js'

describe('AC-11 — Tenant.theme* ile TenantVersionState.theme* sapma testi (ADR-0020 Karar 1)', () => {
  it('demo kiracı için themeId/themeVersion iki ayrı DB satırında EŞİT (sabitle değil, satırla karşılaştırılır)', async () => {
    const tenant = await testAppPrisma.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
      select: { id: true, themeId: true, themeVersion: true },
    })

    if (tenant === null) {
      throw new Error('DEMO_SEED tenant bulunamadı — pnpm db:seed koşmuş mu?')
    }

    // `Tenant.themeId`/`themeVersion` `String?` (deprecated ayna kolon,
    // v0.0.10'dan beri nullable — ADR-0020 Karar 1 DDL'i DEĞİŞTİRMEDİ).
    // `seed.ts` demo kiracı için İKİSİNİ DE yazar; `null` çıkması "seed
    // koşmamış" anlamına gelir, AC-11'in KENDİSİNİN ihlali değil.
    if (tenant.themeId === null || tenant.themeVersion === null) {
      throw new Error(
        'DEMO_SEED tenant için Tenant.themeId/themeVersion NULL — pnpm db:seed koşmuş mu?',
      )
    }

    // `tenant_version_state` RLS + FORCE altında — context KURULMADAN okuma
    // SESSİZCE 0 satır (`null`) döner, context kurulmadığı için "satır yok"
    // sanılabilir (R-A3'ün okuma tarafı). `withTenant()` İÇİNDE okunur.
    const versionState = await withTenant(testAppPrisma, tenant.id, (tx) =>
      tx.tenantVersionState.findUnique({
        where: { tenantId: tenant.id },
        select: { themeId: true, themeVersion: true },
      }),
    )

    if (versionState === null) {
      throw new Error(
        'demo kiracı için tenant_version_state satırı bulunamadı — pnpm db:seed koşmuş mu?',
      )
    }

    // ⚠⚠ AC-11(b): İKİ VERİTABANI SATIRI karşılaştırılıyor — `tenant.themeId`
    // de `versionState.themeId` de BU ÇAĞRIDA veritabanından okundu; hiçbiri
    // `DEMO_SEED`/`version-registry-seed.ts`'ten gelen bir sabit DEĞİL.
    expect(tenant.themeId).toBe(versionState.themeId)
    expect(tenant.themeVersion).toBe(versionState.themeVersion)

    // Ek güvence: iki alan da boş/placeholder DEĞİL — S4'ün izolasyon
    // probunun yazdığı yer tutucu değerle (`izolasyon-probu-*`) YANLIŞLIKLA
    // eşleşmediğini doğrular (probun KENDİ kiracısı farklı, ama bu pozitif
    // bir sağlık kontrolüdür).
    expect(tenant.themeId.length).toBeGreaterThan(0)
    expect(tenant.themeVersion.length).toBeGreaterThan(0)
  })
})

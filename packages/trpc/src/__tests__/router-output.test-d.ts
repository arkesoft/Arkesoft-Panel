// @arkesoft/trpc — totoloji karşıtı tip testi (ROADMAP v0.0.6, T-007/ST-3 (S4),
// AC2/AC4)
//
// Beklenen şekil LİTERAL yazılır, şemadan TÜRETİLMEZ. `tenantSummarySchema`'nın
// kendisinden `z.infer<>` ile türetilmiş bir tip burada kullanılsaydı, o
// şemadan bir alan SİLİNDİĞİNDE `RouterOutputs['tenant']['current']` de AYNI
// anda değişir ve bu test KIRILMAZDI (totoloji) — AC4'ün Mutasyon A'sının
// gerçek bir regresyon yakalaması bu yüzden LİTERAL şarta bağlı.
//
// `expectTypeOf`'un daha GEVŞEK, tek-yönlü ("üst tip" yeterli sayan,
// dolayısıyla FAZLA alanı yakalamayan) eşleşme yardımcısı BİLEREK
// KULLANILMAZ — bu dosyada yalnızca `toEqualTypeOf` geçer, o da HER İKİ
// yönde tam eşitlik ister (literal-jeton kuralı: bu yorum o yardımcının
// adını BİTİŞİK yazmaz, aksi hâlde kendi grep denetimini kendi bulur —
// AGENT_BASELINE.md §5).
//
// Bu dosya ÇALIŞMA ZAMANI testi DEĞİLDİR (`.test.ts` ile BİTMİYOR,
// `vitest.config.ts`'in `include: ['src/**/*.test.ts']` deseni bunu
// YAKALAMAZ) — kanıtı tamamen `vitest.config.ts`'in `typecheck.include`
// taramasından (`src/**/*.test-d.ts`) ve `tsc`'nin derlemesinden gelir
// (`packages/db/src/__tests__/type-pins/*.pin.ts` idiomunun aynısı).

import { expectTypeOf, test } from 'vitest'

import type { RouterOutputs } from '../index.js'
import type { TenantSummary } from '../schemas/tenant-summary.schema.js'
import type { StorefrontTenant } from '../schemas/storefront-tenant.schema.js'
import type { SessionIdentity } from '../schemas/session-identity.schema.js'

// `test()` sarmalayıcıları ÇALIŞMA ZAMANINDA YÜRÜMEZ (bu dosya
// `vitest.config.ts`'in `include: ['src/**/*.test.ts']` deseninin DIŞINDA,
// yalnızca `typecheck.include: ['src/**/*.test-d.ts']` tarafından TİP
// düzeyinde taranır) — Vitest'in typecheck raporlayıcısının bir "suite"
// bulabilmesi için gerekli, gövde içindeki `expectTypeOf` çağrıları `tsc`
// derlemesinin KENDİSİ tarafından denetlenir.

test('tenant.current çıktısı literal tel şekliyle TAM eşleşir (totoloji karşıtı — şemadan TÜRETİLMEDİ)', () => {
  // POZİTİF/JENERİK PİN — beklenen şekil LİTERAL (architect K5'in beş alanı,
  // `planId`/`deletedAt` BİLİNÇLİ OLARAK yok, PM kullanıcı kararı #1).
  expectTypeOf<RouterOutputs['tenant']['current']>().toEqualTypeOf<{
    id: string
    slug: string
    name: string
    status: 'pending' | 'provisioning' | 'active' | 'suspended'
    primaryDomain: string | null
  }>()
})

test('tenant.current çıktısı export edilen TenantSummary tipiyle de eşleşir (export belgesi)', () => {
  // Export'un KENDİ belgesi — `tenantSummarySchema`'nın çıkardığı
  // `TenantSummary` tipiyle de birebir eşleşmeli (bu, LİTERAL pinin YERİNE
  // geçmez — yukarıdaki BAĞIMSIZ kalmalı, aksi hâlde AC4'ün totoloji
  // karşıtlığı bozulur).
  expectTypeOf<RouterOutputs['tenant']['current']>().toEqualTypeOf<TenantSummary>()
})

test('session.me çıktısı literal tel şekliyle TAM eşleşir (totoloji karşıtı — şemadan TÜRETİLMEDİ)', () => {
  // POZİTİF/JENERİK PİN — beklenen şekil LİTERAL (K5: `SessionIdentity` =
  // {userId, sessionId}, DB okuması yok).
  expectTypeOf<RouterOutputs['session']['me']>().toEqualTypeOf<{
    userId: string
    sessionId: string
  }>()
})

test('session.me çıktısı export edilen SessionIdentity tipiyle de eşleşir (export belgesi)', () => {
  // Export'un KENDİ belgesi.
  expectTypeOf<RouterOutputs['session']['me']>().toEqualTypeOf<SessionIdentity>()
})

test('storefront.currentTenant çıktısı literal tel şekliyle TAM eşleşir (totoloji karşıtı — şemadan TÜRETİLMEDİ, ROADMAP v0.0.10, T-012/S4)', () => {
  // POZİTİF/JENERİK PİN — beklenen şekil LİTERAL. GÜNCELLEME (ROADMAP v0.0.10,
  // T-012/S4, architect tRPC SÖZLEŞMESİ): `themeId`/`themeVersion` EKLENDİ
  // (public API MINOR — yalnızca ekleme, `storefront-tenant.schema.ts:32-35`'in
  // R9 TELAFİSİ'nin önceden ödediği genişleme). `id`/`slug`/`status`/
  // `primaryDomain`/`planId`/`deletedAt` HÂLÂ BİLİNÇLİ OLARAK yok — bu altı
  // alanın yokluğu aşağıdaki NEGATİF PİN testiyle tip düzeyinde AYRICA ölçülür.
  expectTypeOf<RouterOutputs['storefront']['currentTenant']>().toEqualTypeOf<{
    name: string
    themeId: string | null
    themeVersion: string | null
  }>()
})

test('storefront.currentTenant çıktısı export edilen StorefrontTenant tipiyle de eşleşir (export belgesi)', () => {
  // Export'un KENDİ belgesi — bu, yukarıdaki LİTERAL pinin YERİNE geçmez.
  expectTypeOf<RouterOutputs['storefront']['currentTenant']>().toEqualTypeOf<StorefrontTenant>()
})

test('storefront.currentTenant çıktısında id/slug/status/primaryDomain/planId/deletedAt HÂLÂ YOK (NEGATİF PİN, AC8, ROADMAP v0.0.10, T-012/S4)', () => {
  // ⚠ Pozitif pinin yukarıdaki güncellenmesi "testi gevşetme" DEĞİL — public
  // API'de EKLEME (minor) ve genişleme `storefront-tenant.schema.ts:32-35`
  // tarafından adıyla önceden ödenmişti. Telafi BU testtir: altı alanın
  // YOKLUĞU tip düzeyinde AYRICA, ALAN BAŞINA pinlenir, aksi hâlde pozitif
  // pinin güncellenmesi tek başına denetimsiz bir gevşetme olurdu.
  //
  // Mekanizma: `expectTypeOf(...).not.toHaveProperty(key)` — `expect-type`
  // kütüphanesinin kendi belgelediği negatif idiomu (`expectTypeOf(obj).not.
  // toHaveProperty('c')`). `NegativeExpectTypeOf.toHaveProperty`'nin imzası
  // `KeyType extends keyof Actual` İLE SINIRLI DEĞİL (pozitif `toHaveProperty`
  // tam tersine sınırlıdır) — bu yüzden var OLMAYAN bir anahtar güvenle
  // geçirilebilir. Anahtar `Actual`'da GERÇEKTEN varsa `MismatchArgs` ek
  // argüman zorunlu kılar ve çağrı eksik argümanla `tsc` HATASI üretir —
  // yani her satır KENDİ başına, BAĞIMSIZ olarak mutasyona duyarlıdır
  // (altı alandan biri şemaya eklenirse SADECE o alanın satırı kırmızı
  // döner, intersection tabanlı bir "hepsi birden" testin aksine).
  type CurrentTenantOutput = RouterOutputs['storefront']['currentTenant']

  expectTypeOf<CurrentTenantOutput>().not.toHaveProperty('id')
  expectTypeOf<CurrentTenantOutput>().not.toHaveProperty('slug')
  expectTypeOf<CurrentTenantOutput>().not.toHaveProperty('status')
  expectTypeOf<CurrentTenantOutput>().not.toHaveProperty('primaryDomain')
  expectTypeOf<CurrentTenantOutput>().not.toHaveProperty('planId')
  expectTypeOf<CurrentTenantOutput>().not.toHaveProperty('deletedAt')
})

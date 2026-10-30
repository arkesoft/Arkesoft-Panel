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

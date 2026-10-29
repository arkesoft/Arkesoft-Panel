// @arkesoft/api — ortak `assertNever` yardımcısı testleri (ROADMAP v0.0.5,
// T-006/S3, architect kısıt 4 / PO kısıt "assertNever birleştirmesi
// AuthGuard'dan ÖNCE")
//
// Üç eski kopyanın (`error-mapping.ts`, `tenant.guard.ts`,
// `tenant-resolver.service.ts`) davranışı BU TEK helper'da birleşti — kanıt
// S3'ün raporunda grep çıktısıyla taşınır (bu dosya BİLEREK grep desenini
// bitişik YAZMAZ; aksi hâlde doğrulama kendi dokümantasyonunu eşleştirip
// yanlış pozitif üretirdi, bkz. AGENT_BASELINE §5 literal-jeton kuralı).
// Bu dosya helper'ın KENDİ davranışını (her zaman fırlatır, `context` mesaja
// gömülür) ölçer — üç çağıranın kendi EXHAUSTIVE switch testleri
// (tenant-resolution.test.ts/tenant-resolver.test.ts/error-mapping.test.ts)
// `default` dalına hiçbir zaman ULAŞMAZ (birleşimler gerçekten
// EXHAUSTIVE'dir), bu yüzden helper'ın kendisi burada DOĞRUDAN çağrılarak
// ölçülür.

import { describe, expect, it } from 'vitest'

import { assertNever } from '../errors/assert-never.js'

describe('assertNever', () => {
  it('her zaman fırlatır, asla normal şekilde dönmez', () => {
    expect(() => assertNever('beklenmeyen-deger' as never, 'test-baglami')).toThrow()
  })

  it('hata mesajı context parametresini taşır', () => {
    expect(() => assertNever('x' as never, 'tenant.guard.ts: TenantResolution.kind')).toThrow(
      /tenant\.guard\.ts: TenantResolution\.kind/,
    )
  })

  it('hata mesajı beklenmeyen değeri JSON olarak taşır (teşhis edilebilirlik)', () => {
    expect(() => assertNever('tuhaf-deger' as never, 'baglam')).toThrow(/tuhaf-deger/)
  })

  it('fırlatılan değer gerçek bir Error örneğidir', () => {
    expect.assertions(1)
    try {
      assertNever('x' as never, 'baglam')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
    }
  })
})

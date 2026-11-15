// @arkesoft/api — `planLimitsSchema` birim testleri (ROADMAP v0.1.0,
// T-019 gate tur1 düzeltmesi, security `low` + architect VERİ MODELİ şartı:
// "`limits Json` … Zod ile parse, dört anahtar")
//
// SAF modül — DB/HTTP YOK. `registration.service.ts`'in `plan.limits`
// JSONB okumasını bu şema ile parse ettiğini DOĞRULAYAN entegrasyon kapsamı
// `registration.test.ts`'in mevcut `createTenant` AC-10 akışında ZATEN
// örtük olarak koşuyor (gerçek `TRIAL_PLAN` fixture'ı bu şemayla eşleşir —
// eşleşmeseydi o test KIRILIRDI). Bu dosya şemanın KENDİSİNİ, geçerli VE
// bozuk şekillerle, İZOLE test eder.
//
// ⚠ Şema `registration.service.ts`'İN KENDİSİNDE tanımlıdır, ayrı bir
// dosyada DEĞİL — `registration.service.ts`'in dosya başı yorumu: AC-13'ün
// negatif kapsam testi `.limits` jetonunun ÜRETİM kodunda YALNIZCA o dosyada
// geçtiğini mekanik olarak doğrular.

import { describe, expect, it } from 'vitest'

import { planLimitsSchema } from '../registration/registration.service.js'

describe('planLimitsSchema', () => {
  it('dört anahtarın tümü geçerli, negatif olmayan tamsayı İSE kabul eder', () => {
    const result = planLimitsSchema.safeParse({
      maxProducts: 50,
      maxOrdersPerMonth: 100,
      maxStorageBytes: 1_073_741_824,
      maxUsers: 3,
    })

    expect(result.success).toBe(true)
  })

  it("`0` GEÇERLİDİR (bir limit sıfır OLABİLİR — v0.17.0'ın yorumlayacağı değer, bu sürümde ZORLANMAZ)", () => {
    const result = planLimitsSchema.safeParse({
      maxProducts: 0,
      maxOrdersPerMonth: 0,
      maxStorageBytes: 0,
      maxUsers: 0,
    })

    expect(result.success).toBe(true)
  })

  it('tanınmayan EK bir anahtar SESSİZCE DÜŞÜRÜLÜR (strip, `z.object` varsayılanı)', () => {
    const result = planLimitsSchema.safeParse({
      maxProducts: 50,
      maxOrdersPerMonth: 100,
      maxStorageBytes: 1_073_741_824,
      maxUsers: 3,
      unexpectedFutureField: 'ileride-eklenebilecek-bir-alan',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('unexpectedFutureField')
    }
  })

  it.each([
    [
      'eksik anahtar (`maxUsers` yok)',
      { maxProducts: 50, maxOrdersPerMonth: 100, maxStorageBytes: 1 },
    ],
    [
      'yanlış tip (`maxProducts` dize)',
      { maxProducts: '50', maxOrdersPerMonth: 100, maxStorageBytes: 1, maxUsers: 3 },
    ],
    [
      'negatif değer (`maxUsers` eksi)',
      { maxProducts: 50, maxOrdersPerMonth: 100, maxStorageBytes: 1, maxUsers: -1 },
    ],
    [
      'tamsayı olmayan değer (`maxProducts` ondalıklı)',
      { maxProducts: 50.5, maxOrdersPerMonth: 100, maxStorageBytes: 1, maxUsers: 3 },
    ],
    ['tamamen boş nesne', {}],
    ['null', null],
    ['dizi (nesne DEĞİL)', [1, 2, 3, 4]],
  ])(
    '%s → REDDEDİLİR (seed/migration bozulmuş şablonu SESSİZCE GEÇİRMEZ)',
    (_label, invalidValue) => {
      const result = planLimitsSchema.safeParse(invalidValue)

      expect(result.success).toBe(false)
    },
  )
})

// @arkesoft/tenancy — slug.ts tablo testleri (ROADMAP v0.1.0, T-019/S2,
// architect KARAR 1)
//
// Kapsam: `normalizeTenantSlug` normalizasyon sırası (Türkçe harf katlama
// `toLowerCase()`'den ÖNCE, 7 çift / 14 kod noktası), `validateTenantSlug`
// doğrulama (boş/rezerve/biçim), `RESERVED_SUBDOMAINS` küme EŞİTLİĞİ (alt
// küme DEĞİL — T-018 AC-3'ün dersi: aşağıdaki beklenen liste bu dosyada
// BAĞIMSIZ olarak hardcode edilir, `RESERVED_SUBDOMAINS`'ten TÜRETİLMEZ —
// aksi hâlde bir üye kaldırıldığında test sessizce daha az vaka çalıştırıp
// YİNE YEŞİL dönerdi, bu tam da "alt küme totolojiktir" tuzağıdır).

import { describe, expect, it } from 'vitest'

import { RESERVED_SUBDOMAINS } from '../reserved-subdomains.js'
import { normalizeTenantSlug, TENANT_SLUG_PATTERN, validateTenantSlug } from '../slug.js'
import type { SlugValidationResult } from '../slug.js'

describe('normalizeTenantSlug — Türkçe karakter katlama tuzağı (pinlenmiş platform gerçeği)', () => {
  it('"İ".toLowerCase() İKİ kod noktası üretir (i + U+0307 COMBINING DOT ABOVE) — katlama bu YÜZDEN toLowerCase()\'den ÖNCE olmak ZORUNDADIR', () => {
    expect('İ'.toLowerCase().length).toBe(2)
  })

  it('"I".toLowerCase() "i" verir, "ı" DEĞİL — ASCII I için toLowerCase zaten doğru, toLocaleLowerCase("tr") YASAK çünkü o "ı" üretir', () => {
    expect('I'.toLowerCase()).toBe('i')
    expect('I'.toLocaleLowerCase('tr')).toBe('ı')
  })
})

describe('normalizeTenantSlug — 7 harf çifti / 14 kod noktası (tek tek)', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['İ', 'i'],
    ['i', 'i'],
    ['I', 'i'],
    ['ı', 'i'],
    ['Ş', 's'],
    ['ş', 's'],
    ['Ğ', 'g'],
    ['ğ', 'g'],
    ['Ü', 'u'],
    ['ü', 'u'],
    ['Ö', 'o'],
    ['ö', 'o'],
    ['Ç', 'c'],
    ['ç', 'c'],
  ]

  it(`toplam kod noktası sayısı === 14 (gerçek: ${String(cases.length)})`, () => {
    expect(cases.length).toBe(14)
  })

  it.each(cases)('%s → %s', (input, expected) => {
    expect(normalizeTenantSlug(input)).toBe(expected)
  })
})

describe('normalizeTenantSlug — gerçek dünya vakaları', () => {
  it('"İstanbul Mağaza" → "istanbul-magaza"', () => {
    expect(normalizeTenantSlug('İstanbul Mağaza')).toBe('istanbul-magaza')
  })

  it('"Çağrı Üçgen Öğretmen Şık" → tüm 5 çift tek cümlede', () => {
    expect(normalizeTenantSlug('Çağrı Üçgen Öğretmen Şık')).toBe('cagri-ucgen-ogretmen-sik')
  })

  it('tekrarlı ayraçlar tek tireye daralır: "Foo   Bar!!!Baz" → "foo-bar-baz"', () => {
    expect(normalizeTenantSlug('Foo   Bar!!!Baz')).toBe('foo-bar-baz')
  })

  it('baş/son ayraçlar kırpılır: "  -Mağaza-  " → "magaza"', () => {
    expect(normalizeTenantSlug('  -Mağaza-  ')).toBe('magaza')
  })

  it("63 karakterden uzun girdi 63'e kesilir ve kesim sonrası tire TEKRAR kırpılır", () => {
    const input = `${'a'.repeat(63)}-overflow`
    const result = normalizeTenantSlug(input)
    expect(result.length).toBeLessThanOrEqual(63)
    expect(result.endsWith('-')).toBe(false)
  })

  it('tamamen yabancı/ayraç karakterlerden oluşan girdi boş dize döner (fırlatmaz)', () => {
    expect(normalizeTenantSlug('!!!   ???')).toBe('')
  })

  it('boş girdi boş dize döner (fırlatmaz)', () => {
    expect(normalizeTenantSlug('')).toBe('')
  })
})

describe('normalizeTenantSlug — özellik (property) pini', () => {
  // ⚠ Bu paket SAF (zod dahil hiçbir bağımlılık YOK, purity.test.ts), bu
  // yüzden fast-check gibi bir property-testing kütüphanesi EKLENEMEZ
  // (yeni bağımlılık yasağı). Aşağıdaki örnek kümesi elle seçilmiş, çeşitli
  // (Türkçe karakter, büyük/küçük harf, ayraç, rakam, zaten-kanonik) girdiler
  // üzerinde idempotency + geçerlilik değişmezini pinler. Örnekler BİLEREK
  // RESERVED_SUBDOMAINS üyelerine normalize OLMAYACAK şekilde seçildi —
  // `validateTenantSlug` rezerve adları reddeder (ayrı bir doğrulama ekseni,
  // aşağıda ayrıca test edilir) ve bu iki eksen kasıtlı olarak ayrıktır.
  const sampleInputs = [
    'İstanbul Mağaza',
    'Çağrı Üçgen Öğretmen Şık',
    'Demo Mağaza 123',
    'already-canonical-slug',
    '   ---Foo---   ',
    'ÜÇGEN',
    'a',
    '123456',
    'Örnek_Mağaza!!!Adı',
  ]

  it.each(sampleInputs.map((input) => [input] as const))(
    'idempotency + geçerlilik: normalize(normalize(%s)) === normalize(%s), sonuç boş değilse valid',
    (input) => {
      const once = normalizeTenantSlug(input)
      const twice = normalizeTenantSlug(once)

      expect(twice).toBe(once)

      if (once.length > 0) {
        expect(validateTenantSlug(once)).toEqual({ kind: 'valid' })
      }
    },
  )
})

describe('validateTenantSlug — boş/biçim/sınır vakaları', () => {
  const invalidFormatCases: readonly string[] = [
    '-abc', // baş tire
    'abc-', // son tire
    'ab.cd', // nokta içeren etiket
    'Demo', // büyük harf — DOĞRULAMA normalize ETMEZ, reddeder
    'demo_magaza', // alt çizgi
    'a'.repeat(64), // uzunluk 64 — üst sınırı aşar
  ]

  it.each(invalidFormatCases.map((value) => [value] as const))('"%s" → invalid/format', (value) => {
    expect(validateTenantSlug(value)).toEqual({ kind: 'invalid', reason: 'format' })
  })

  it('boş dize → invalid/empty', () => {
    expect(validateTenantSlug('')).toEqual({ kind: 'invalid', reason: 'empty' })
  })

  const validBoundaryCases: readonly string[] = [
    'a', // uzunluk 1
    `${'a'.repeat(62)}b`, // uzunluk 63 — üst sınır, kabul edilir
    'a--b', // ardışık tire İÇ kısımda serbest
    'xn--abc', // punycode öneki — biçimsel olarak geçerli
    '123456', // salt rakam
  ]

  it.each(validBoundaryCases.map((value) => [value] as const))('"%s" → valid', (value) => {
    expect(validateTenantSlug(value)).toEqual({ kind: 'valid' })
  })

  it('uzunluk 63 sınır vakası gerçekten 63 karakter (ölçüm doğrulaması)', () => {
    const value = `${'a'.repeat(62)}b`
    expect(value.length).toBe(63)
    expect(TENANT_SLUG_PATTERN.test(value)).toBe(true)
  })

  it('uzunluk 64 sınır vakası gerçekten 64 karakter ve desen REDDEDER', () => {
    const value = 'a'.repeat(64)
    expect(value.length).toBe(64)
    expect(TENANT_SLUG_PATTERN.test(value)).toBe(false)
  })
})

describe('validateTenantSlug — RESERVED_SUBDOMAINS küme EŞİTLİĞİ (alt küme DEĞİL)', () => {
  // BAĞIMSIZ hardcode edilmiş beklenen liste — `RESERVED_SUBDOMAINS`'ten
  // TÜRETİLMEZ. `reserved-subdomains.ts`'teki liste değiştirilirse (bir üye
  // eklenir/çıkarılırsa) bu test KIRMIZI döner; bu dosyanın DOKUNMA
  // listesindeki kısıt ("12 üye, değişmiyor") bu testle mekanik olarak
  // doğrulanır.
  const EXPECTED_RESERVED_SUBDOMAINS: readonly string[] = [
    'www',
    'api',
    'admin',
    'app',
    'panel',
    'cdn',
    'static',
    'assets',
    'mail',
    'superadmin',
    'status',
    'docs',
  ]

  it(`tam 12 üye (gerçek: ${String(RESERVED_SUBDOMAINS.size)})`, () => {
    expect(RESERVED_SUBDOMAINS.size).toBe(12)
  })

  it('küme EŞİTLİĞİ: beklenen liste ile RESERVED_SUBDOMAINS birebir aynı (alt küme değil)', () => {
    expect([...RESERVED_SUBDOMAINS].toSorted()).toEqual(
      [...EXPECTED_RESERVED_SUBDOMAINS].toSorted(),
    )
  })

  it.each(EXPECTED_RESERVED_SUBDOMAINS.map((word) => [word] as const))(
    'rezerve "%s" → validateTenantSlug invalid/reserved',
    (word) => {
      const result: SlugValidationResult = validateTenantSlug(word)
      expect(result).toEqual({ kind: 'invalid', reason: 'reserved' })
    },
  )
})

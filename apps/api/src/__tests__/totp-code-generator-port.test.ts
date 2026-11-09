// @arkesoft/api — TOTP kod üretici port'u birim testleri (ROADMAP v0.0.15,
// T-016/S4)
//
// ADR-0014 kanıt standardı: tek implementasyon + TAM çıktı assert'i +
// yakın-ıska içeren sentetik veri, ve bir assert'in boş OLMADIĞINI kanıtla.
//
// RFC 6238 Ek B'nin YAYINLANMIŞ test vektörleri kullanılır (bağımsız kaynak —
// bu port'un KENDİ algoritmasından TÜRETİLMEMİŞ beklenen değerler): SHA-1,
// 8 hane, 30 saniyelik pencere, sabit anahtar "12345678901234567890" (ASCII,
// 20 bayt). Anahtarın Base32 biçimi (`GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`)
// Python'un `base64.b32encode`'u (bu projenin KODUNDAN bağımsız, RFC 4648
// uyumlu bir referans uygulaması) ile üretildi — raporda belgelenmiştir.

import { describe, expect, it } from 'vitest'

import { generateTotpCode } from '../auth/two-factor/totp-code-generator.port.js'

/** RFC 6238 Ek B — ASCII "12345678901234567890"'ın Base32 kodlaması. */
const RFC_6238_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

/** `targetEpochSeconds`'a göre `timeOffsetSeconds` hesaplar (şimdiye göre). */
function offsetFor(targetEpochSeconds: number): number {
  return targetEpochSeconds - Math.floor(Date.now() / 1000)
}

describe('generateTotpCode — RFC 6238 Ek B yayınlanmış test vektörleri (SHA-1, 8 hane)', () => {
  it.each([
    [59, '94287082'],
    [1_111_111_109, '07081804'],
    [1_111_111_111, '14050471'],
    [1_234_567_890, '89005924'],
    [2_000_000_000, '69279037'],
    [20_000_000_000, '65353130'],
  ])('T=%i → %s', async (epochSeconds, expectedCode) => {
    const code = await generateTotpCode({
      base32Secret: RFC_6238_SECRET_BASE32,
      digits: 8,
      period: 30,
      timeOffsetSeconds: offsetFor(epochSeconds),
    })

    // TAM çıktı assert'i (ADR-0014) — yalnızca "bir kod üretildi" DEĞİL,
    // RFC'nin YAYINLANMIŞ TAM değeriyle birebir eşleşme.
    expect(code).toBe(expectedCode)
  })

  it('aynı saniyede iki çağrı AYNI kodu üretir (deterministik, zaman kayması YOK)', async () => {
    const input = {
      base32Secret: RFC_6238_SECRET_BASE32,
      digits: 8,
      period: 30,
      timeOffsetSeconds: offsetFor(59),
    }
    const first = await generateTotpCode(input)
    const second = await generateTotpCode(input)
    expect(first).toBe(second)
    expect(first).toBe('94287082')
  })

  it('YAKIN-IŞKA: bir pencere öncesi/sonrası GERÇEKTEN FARKLI bir kod üretir (RFC vektörünün komşu T değeri DEĞİL — sahte-yeşil önleme)', async () => {
    const atVector = await generateTotpCode({
      base32Secret: RFC_6238_SECRET_BASE32,
      digits: 8,
      period: 30,
      timeOffsetSeconds: offsetFor(59),
    })
    const onePeriodLater = await generateTotpCode({
      base32Secret: RFC_6238_SECRET_BASE32,
      digits: 8,
      period: 30,
      timeOffsetSeconds: offsetFor(59 + 30),
    })

    expect(atVector).toBe('94287082')
    // Bitişik pencere RFC'nin YAYINLAMADIĞI bir T değeri — yalnızca "farklı
    // bir şey döndü" DEĞİL, spesifik olarak AYNI OLMADIĞI doğrulanır.
    expect(onePeriodLater).not.toBe(atVector)
  })

  it('varsayılan digits=6/period=30 — 8 haneli RFC kodunun SON 6 hanesiyle AYNI (dynamic truncation modulo ilişkisi)', async () => {
    // RFC 6238'in `% 10^digits` kuralı: 6 haneli çıktı, 8 haneli çıktının
    // modulo'su (son 6 hane) ile AYNIDIR — iki BAĞIMSIZ `digits` parametresi
    // İLE çalıştırıp bu matematiksel ilişkiyi (yakın-ıska DEĞİL, KESİN bir
    // türetilmiş beklenti) doğrular.
    const eightDigit = await generateTotpCode({
      base32Secret: RFC_6238_SECRET_BASE32,
      digits: 8,
      period: 30,
      timeOffsetSeconds: offsetFor(59),
    })
    const sixDigit = await generateTotpCode({
      base32Secret: RFC_6238_SECRET_BASE32,
      digits: 6,
      period: 30,
      timeOffsetSeconds: offsetFor(59),
    })

    expect(eightDigit).toBe('94287082')
    expect(sixDigit).toBe('287082')
  })

  it('varsayılan parametrelerle (digits/period/timeOffsetSeconds verilmeden) 6 haneli rakam dizisi döner', async () => {
    const code = await generateTotpCode({ base32Secret: RFC_6238_SECRET_BASE32 })
    expect(code).toMatch(/^\d{6}$/)
  })

  it('geçersiz Base32 karakteri → throw (sessizce boş/rastgele kod DÖNMEZ)', async () => {
    await expect(generateTotpCode({ base32Secret: 'GEZDGNBVGY3TQOJQ-İNVALİD-1' })).rejects.toThrow()
  })

  it('boşluk/tire/küçük harf içeren manuel anahtar hijyeni (gerçek kullanıcı girişi) ile AYNI sonucu üretir', async () => {
    const clean = await generateTotpCode({
      base32Secret: RFC_6238_SECRET_BASE32,
      digits: 8,
      period: 30,
      timeOffsetSeconds: offsetFor(59),
    })
    const messy = await generateTotpCode({
      base32Secret: 'gezd gnbv-gy3t qojq gezd-gnbv gy3t qojq',
      digits: 8,
      period: 30,
      timeOffsetSeconds: offsetFor(59),
    })
    expect(messy).toBe(clean)
    expect(messy).toBe('94287082')
  })
})

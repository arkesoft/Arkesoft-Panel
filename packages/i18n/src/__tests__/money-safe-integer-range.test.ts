// @arkesoft/i18n — `Money` güvenli tamsayı aralığı regresyon testleri
// (qa, T-027 gate turu 1 + 2 — BİRLEŞTİRİLMİŞ dosya).
//
// ⭐ BULGU KAPANDI — bu dosya artık REGRESYON testidir, KASITLI KIRMIZI
// DEĞİL. Tur 1'de (qa) bu dosya `Money.of`/`add`/`subtract`/`multiplyBy`'ın
// yalnızca `Number.isInteger` denetlediğini, `Number.isSafeInteger`
// DENETLEMEDİĞİNİ kanıtlıyordu — o zamanki üretim kodu bu testleri KIRMIZI
// geçiyordu (bu KASITLIYDI, bulgunun kanıtıydı). `backend` düzeltme turu
// 1'de `Money.of`'a `Number.isSafeInteger` denetimini EKLEDİ
// (`../money.ts:103-107`); `add` (`:123-126`), `subtract` (`:129-132`) ve
// `multiplyBy` (`:138-145`) sonucu HER ÜÇÜ de `Money.of`'a geçirdiği için TEK
// NOKTADAN aynı garantiyi kazandı. Bugün bu dosyadaki 10 test de YEŞİL — bu
// dosyayı okuyan bir bakımcı "üretim bozuk" veya "testler kasıtlı kırmızı"
// SONUCUNA VARMAMALI (`security`'nin T-027 tur 2 `low` bulgusu, kayıtlı:
// bayat yorum gelecekteki bir bakımcıyı yanlış yönlendirebilir).
//
// ⚠ MÜKERRERLİK ÖLÇÜMÜ VE KARAR (`solid`, T-027 tur 2 `medium` #2):
// aşağıdaki "TUR 1" describe'ının 5 vakası `../__tests__/money.test.ts:67-98`
// (backend'in AC-43 spesifikasyon dosyası, "Money — güvenli tamsayı aralığı
// (gate turu bir düzeltmesi...)" describe'ı) ve `money.test.ts:162-167`
// (`multiplyByRatio` REFERANS vakası) ile AYNI literallerle
// (`999999999999999 × 11`, `MAX_SAFE_INTEGER + 2`, vb.) örtüşüyor —
// `solid`'in ölçtüğü 5/5 örtüşme GERÇEK, saklanmıyor.
//
// `qa` bu dosyayı `money.test.ts`'e TAŞIMADI/BİRLEŞTİRMEDİ — ownership
// sınırı: `money.test.ts` backend'in S5b/AC-43 spesifikasyon dosyasıdır,
// `qa`'nın bu düzeltme turunda değiştireceği dosya DEĞİL
// (`AGENT_BASELINE.md` §5: "başka ajanın dosyasını değiştirme"). Bilinçli
// KARAR: bu örtüşme KALICI TUTULUYOR ve İKİ AYRI YAZARLIK YOLUYLA (backend'in
// spesifikasyon testi + qa'nın bağımsız gate kanıtı) BAĞIMSIZ İKİNCİ ŞAHİT
// olarak GEREKÇELENDİRİLİYOR: `backend`'in `money.test.ts`'teki beş
// vakasından biri yanlışlıkla gevşetilse/silinse bile (ör. bir regex
// hafifletilse), bu dosyanın BAĞIMSIZ yazılmış aynı senaryoları hâlâ kırmızı
// verir — tek dosyaya düşürmek bu ikinci-ağ garantisini YOK EDERDİ. Çift
// bakım yükü KABUL EDİLDİ, saklanmıyor: bir davranış satırı değişirse İKİ
// dosya güncellenmesi gerekir; bu maliyet kritik bir para-güvenliği
// invariant'ı için bilinçli bir takas olarak yazılı kalır.
//
// ⚠ Eski `money-safe-integer-range-tur2.test.ts` (qa, T-027 gate turu 2) BU
// DOSYAYLA BİRLEŞTİRİLDİ — qa'nın KENDİ iki dosyası arasında örtüşme YOKTU;
// birleştirme yalnızca dosya sayısını (2 → 1) azaltıp bakım yüzeyini
// küçültüyor. Kapsam KAYBI yok: 5 (tur 1) + 5 (tur 2) = 10 test, HEPSİ
// aşağıda KORUNDU. Tur 2 describe'ı `money.test.ts`'in KAPSAMADIĞI üç
// eksende GENİŞLEME sağlıyor — bkz. o describe'ın başındaki not.

import { describe, expect, it } from 'vitest'

import { Money } from '../money.js'

describe('Money — güvenli tamsayı aralığı (Number.isSafeInteger) — TUR 1 regresyon pini', () => {
  it('multiplyBy: güvenli aralığı aşan çarpım SESSİZCE YANLIŞ değer döndürmemeli, fırlatmalı', () => {
    // 999999999999999 * 11 = 10999999999999989 (BigInt ile doğrulanmış tam değer).
    // JS `number` aritmetiğinde bu MAX_SAFE_INTEGER'ı (9007199254740991) aşar ve
    // IEEE-754 yuvarlaması 10999999999999988 üretir — Number.isInteger bunu
    // "tam sayı" sayar (hâlâ kesirsiz) ama matematiksel olarak 1 kuruş YANLIŞ.
    const money = Money.of(999999999999999, 'TRY')

    expect(() => money.multiplyBy(11)).toThrow()
  })

  it('add: güvenli aralığı aşan toplam SESSİZCE YANLIŞ değer döndürmemeli, fırlatmalı', () => {
    const atLimit = Money.of(Number.MAX_SAFE_INTEGER, 'TRY')
    const extra = Money.of(2, 'TRY')

    expect(() => atLimit.add(extra)).toThrow()
  })

  it('subtract: güvenli aralığı aşan (negatif yönde) çıkarma fırlatmalı', () => {
    const atLimit = Money.of(-Number.MAX_SAFE_INTEGER, 'TRY')
    const extra = Money.of(2, 'TRY')

    expect(() => atLimit.subtract(extra)).toThrow()
  })

  it('of: doğrudan güvenli aralık dışı bir amountMinor ile çağrılırsa fırlatmalı', () => {
    const unsafeButInteger = Number.MAX_SAFE_INTEGER + 2

    expect(Number.isInteger(unsafeButInteger)).toBe(true)
    expect(Number.isSafeInteger(unsafeButInteger)).toBe(false)
    expect(() => Money.of(unsafeButInteger, 'TRY')).toThrow()
  })

  it('REFERANS — multiplyByRatio AYNI sınıfta bu denetimi zaten uyguluyor (simetri kanıtı)', () => {
    const hugeAmount = Number.MAX_SAFE_INTEGER
    expect(() =>
      Money.of(hugeAmount, 'TRY').multiplyByRatio({ numerator: 2, denominator: 1 }, 'half-up'),
    ).toThrow(/güvenli tamsayı aralığını aşıyor/)
  })
})

// TUR 2 — `backend`'in tur 1 düzeltmesi `Money.of`'a `Number.isSafeInteger`
// denetimi EKLEDİ (`../money.ts:103-107`) ve `multiplyByRatio`'ya AYRI bir
// BigInt yoluna GEÇİRMEDİ — gerekçe: "IEEE-754 yuvarlama ızgarası güvenli
// sınırın ÜSTÜNDE yalnızca BÜYÜR, gerçek sonuç aralığı aştığında kayan nokta
// sonucu da KESİNLİKLE aralık dışına düşer." Bu describe o iddiayı
// `money.test.ts`'in "güvenli tamsayı aralığı" bloğunun KAPSAMADIĞI üç
// eksende SINAR — yukarıdaki TUR 1 bloğuyla (ve `money.test.ts` ile) VAKA
// ÖRTÜŞMESİ YOK:
//
//   1. `multiplyBy` — tam sayı AMA güvenli OLMAYAN bir `quantity` (1e300).
//      `multiplyBy`'ın ÖN denetimi (`../money.ts:139`, `Number.isInteger`)
//      BUNU reddetmiyor (1e300 `Number.isInteger` için `true`'dur — ondalık
//      kısmı yok) — bu yüzden reddin TEK kaynağı `Money.of`'un sondaki
//      `isSafeInteger` denetimidir. `backend` bu ön denetimi KASITLI
//      OLARAK değiştirmedi (PM'in riski).
//   2. `add`/`subtract` — sınır tam olarak `MAX_SAFE_INTEGER + 2` DIŞINDA,
//      farklı büyüklükte bir taşma (iki ayrı büyük terimin toplamı) VE
//      taşmanın GÜVENLİ aralığa GERİ DÖNMEDİĞİ (regresyon) bir kontrol.
//   3. Negatif yön — `subtract` ile DEĞİL, DOĞRUDAN `add` ile
//      `MIN_SAFE_INTEGER`'ın altına inen bir vaka (TUR 1'in testleri bu
//      yönü `subtract` üzerinden sınıyordu, `add` üzerinden SINAMIYORDU).
//
// `Money.zero`/`toJSON` üzerinden "kapıyı atlatma" ekseni AYRICA
// değerlendirildi: `toJSON` SALT ÇIKIŞTIR (`../money.ts:185-187`), paket
// içinde veya tüketicilerinde bir `fromJSON`/deserializer YOK (A-T27-4:
// `Currency`'nin bugün okuyucusu yok, `Money` de benzer biçimde saf bir
// değer nesnesi) — bu yüzden bugün sınanabilir bir "atlatma yolu" MEVCUT
// DEĞİL; ileride bir deserializer eklenirse bu drift testine YENİ bir vaka
// eklenmesi gerektiği not düşülür.
//
// Her üçü de kırmızı çıkarsa: backend'in simetri iddiası YANLIŞ demektir
// (bulgu). Yeşil çıkarsa: iddia doğrulanmış ve kapsam genişletilmiştir.
describe('Money — güvenli tamsayı aralığı EK kapsamı (qa, T-027 gate turu 2) — TUR 2 kenar durum matrisi', () => {
  it('multiplyBy: tam sayı AMA güvenli OLMAYAN quantity (1e300) — ön denetim bunu YAKALAMAZ, Money.of yakalamalı', () => {
    expect(Number.isInteger(1e300)).toBe(true)
    expect(Number.isSafeInteger(1e300)).toBe(false)

    const money = Money.of(100, 'TRY')
    expect(() => money.multiplyBy(1e300)).toThrow(/güvenli tamsayı aralığını aşıyor/)
  })

  it('add: iki BÜYÜK terimin toplamı güvenli aralığı (sınırdan farklı bir büyüklükte) aşarsa fırlatır', () => {
    const a = Money.of(Number.MAX_SAFE_INTEGER - 1, 'TRY')
    const b = Money.of(Number.MAX_SAFE_INTEGER, 'TRY')
    expect(() => a.add(b)).toThrow(/güvenli tamsayı aralığını aşıyor/)
  })

  it('add: DOĞRUDAN add ile MIN_SAFE_INTEGER altına inen negatif taşma fırlatır (subtract DIŞINDAKİ yol)', () => {
    const atLowerLimit = Money.of(Number.MIN_SAFE_INTEGER, 'TRY')
    const negativeExtra = Money.of(-2, 'TRY')
    expect(() => atLowerLimit.add(negativeExtra)).toThrow(/güvenli tamsayı aralığını aşıyor/)
  })

  it('subtract: taşma OLMAYAN, güvenli aralığa GERİ DÖNEN bir çıkarma hâlâ doğru sonuç döner (gevşetme yok)', () => {
    const atLimit = Money.of(Number.MAX_SAFE_INTEGER, 'TRY')
    const result = atLimit.subtract(Money.of(1, 'TRY'))
    expect(result.amountMinor).toBe(Number.MAX_SAFE_INTEGER - 1)
  })

  it('REFERANS — Money.zero ve toJSON her zaman güvenli aralık içindedir (bugün bypass yolu YOK)', () => {
    const zero = Money.zero('TRY')
    expect(Number.isSafeInteger(zero.amountMinor)).toBe(true)
    expect(zero.toJSON()).toEqual({ amountMinor: 0, currency: 'TRY' })
  })
})

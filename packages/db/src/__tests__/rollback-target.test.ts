// @arkesoft/db — `isRollbackTarget` saf birim testleri
// (ROADMAP v0.0.20.2, T-023 FIX turu 2, M1 — `security`+`solid` İKİ GATE
// BAĞIMSIZ bulgusu: FAIL-OPEN GERİLEMESİ, `in` operatörünün prototip
// zincirini de taraması)
//
// Bu dosya DB'YE BAĞLANMAZ — `isRollbackTarget` saf bir tip yüklemidir,
// `rollback-roles.ts`'in yan etkili `main()` çağrısını İÇERMEZ (dosya
// ayrımının gerekçesi `rollback-target.ts`'in dosya başı notunda).
//
// ⚠⚠ ASIL KANIT ("miras anahtar" vakası): eski uygulama (`value in SQL_PATHS`)
// `toString` gibi `Object.prototype`'tan MİRAS alınan anahtarları da geçerli
// bir `RollbackTarget` sayıyordu — `'toString' in {}` JavaScript'te `true`
// döner. `Object.hasOwn` bunu `false` vermek ZORUNDADIR; bu test dosyası o
// gerilemenin GERİ GELMEDİĞİNİ kanıtlar.

import { describe, expect, it } from 'vitest'

import { isRollbackTarget } from '../rollback-target.js'

describe('isRollbackTarget', () => {
  describe('3 geçerli hedef → true', () => {
    it.each(['roles', 'auth-role', 'audit-append-only'] as const)('"%s"', (value) => {
      expect(isRollbackTarget(value)).toBe(true)
    })
  })

  it('bilinmeyen (geçersiz) bir dize → false', () => {
    expect(isRollbackTarget('bilinmeyen-hedef')).toBe(false)
  })

  it('"toString" (Object.prototype\'tan MİRAS anahtar) → false — GERİLEME testi', () => {
    // Saflık kontrolü: bu anahtarın gerçekten prototip zincirinden miras
    // alındığını (ve boş bir nesnenin OWN anahtarı OLMADIĞINI) doğrular —
    // aksi halde aşağıdaki `isRollbackTarget` iddiası anlamsız olurdu.
    expect('toString' in {}).toBe(true)
    expect(Object.hasOwn({}, 'toString')).toBe(false)

    expect(isRollbackTarget('toString')).toBe(false)
  })
})

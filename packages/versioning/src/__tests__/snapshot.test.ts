// @arkesoft/versioning — snapshot.ts birim testleri (ROADMAP v0.0.21,
// T-018/S1, AC-6: YETERLİLİK PİNİ + Zod parse + bozuk JSONB negatif testi)

import { describe, expect, it } from 'vitest'

import { TENANT_VERSION_SNAPSHOT_SCHEMA, type TenantVersionSnapshot } from '../snapshot.js'

const VALID_SNAPSHOT: TenantVersionSnapshot = {
  platformVersion: '0.8.0',
  themeId: 'modern',
  themeVersion: '0.1.0',
  apiVersion: '0.6.0',
}

describe('TENANT_VERSION_SNAPSHOT_SCHEMA — geçerli girdi', () => {
  it('geçerli bir anlık görüntüyü ayrıştırır', () => {
    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse(VALID_SNAPSHOT)
    expect(result.success).toBe(true)
  })
})

describe('TENANT_VERSION_SNAPSHOT_SCHEMA — AC-6 YETERLİLİK PİNİ', () => {
  it('Sürüm Politikası §5in "Geri Al" akışının geri yazacağı DÖRT alanın TAMAMINI taşır', () => {
    const fieldNames = Object.keys(TENANT_VERSION_SNAPSHOT_SCHEMA.shape).toSorted()
    expect(fieldNames).toEqual(['apiVersion', 'platformVersion', 'themeId', 'themeVersion'])
  })

  // ⚠ MUTASYON KANITI (handoff raporunda HAM ÇIKTI olarak taşınır): bu dört
  // alanın HER BİRİ tek tek VALID_SNAPSHOT'tan çıkarılıp safeParse'ın
  // success:false döndürdüğü (yani şemanın alanı GERÇEKTEN ZORUNLU
  // kıldığı) ayrıca doğrulanır — yukarıdaki "tamlık" testinin TEK BAŞINA
  // bir alanın YANLIŞLIKLA optional yazılmasını YAKALAYAMAYACAĞI riski
  // böyle kapatılır.
  it('dört alanın HER BİRİ ayrı ayrı ZORUNLUDUR (eksik alan reddedilir)', () => {
    const fieldNames = Object.keys(VALID_SNAPSHOT) as readonly (keyof TenantVersionSnapshot)[]

    for (const fieldName of fieldNames) {
      // `delete` YERİNE `undefined` ata — dinamik hesaplanmış anahtar
      // silme ESLint'in `no-dynamic-delete` kuralını ihlal eder; Zod
      // şeması zaten `undefined` alanı "eksik" olarak değerlendirir
      // (strictObject, opsiyonel olmayan alan).
      const withFieldMissing: Record<string, unknown> = { ...VALID_SNAPSHOT }
      withFieldMissing[fieldName] = undefined
      const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse(withFieldMissing)
      expect(result.success).toBe(false)
    }
  })
})

describe('TENANT_VERSION_SNAPSHOT_SCHEMA — z.strictObject (SEC-9 yapısal savunma)', () => {
  it('bilinmeyen anahtarı REDDEDER (genel "fazla alan" davranışı)', () => {
    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse({
      ...VALID_SNAPSHOT,
      // ⚠⚠ qa gate T-018 tur 1, SD-3 düzeltmesi (solid gate'in bulgusu) —
      // bu NESNE LİTERALİNDEKİ `__proto__:` bir ÖZELLİK (property) ANAHTARI
      // DEĞİLDİR, bir PROTOTİP ATAYICISIDIR (ECMA-262 nesne literal
      // kısayolu) — `Object.keys(obj)` BUNU GÖRMEZ, `JSON.stringify(obj)`
      // ÇIKTISINDA DA HİÇ GÖRÜNMEZ (own enumerable property ÜRETMEZ; qa
      // gate T-018 tur 1'de İKİ AYRI şekilde ÖLÇÜLDÜ). Bu yüzden bu VAKADA
      // Zod'un reddi `__proto__`'yu DEĞERLENDİRDİĞİ için DEĞİL, aşağıdaki
      // `extraUnknownKey` yüzünden gerçekleşir — eski test adının
      // ("prototip kirlenmesi sınıfına karşı") iddia ettiği şey BU VAKADA
      // KANITLANMAZ. Test KORUNDU (genel "fazla alan" davranışı gerçek ve
      // değerli) ama adı artık bu sınırı YANSITIYOR; GERÇEK prototip-
      // kirlenmesi vektörü aşağıdaki `JSON.parse` testindedir.
      __proto__: { polluted: true },
      extraUnknownKey: 'beklenmeyen',
    })
    expect(result.success).toBe(false)
  })

  // ⚠⚠ qa gate T-018 tur 1, SD-3 — GERÇEK prototip kirlenmesi vektörü.
  // `TenantVersionState.previousState` canlıda bir JSONB kolonundan okunur
  // ve sürücü (`pg`/Prisma) bunu `JSON.parse` İLE ayrıştırır — `JSON.parse`
  // bir girdi dizesindeki `"__proto__"` anahtarını nesne literalinin
  // KISAYOLU olarak DEĞİL, sıradan bir ÖZELLİK ANAHTARI olarak işler: sonuç
  // nesnesi `__proto__`'yu GERÇEK bir OWN ENUMERABLE property olarak taşır
  // (`Object.keys(JSON.parse('{"__proto__":{}}'))` → `['__proto__']`,
  // `Object.prototype.hasOwnProperty.call(parsed, '__proto__')` → `true` —
  // ÖLÇÜLDÜ, qa gate T-018 tur 1). ⚠ Girdi bu yüzden BİR DİZE LİTERALİ
  // olarak yazılır (`JSON.stringify({ ...; __proto__: … })` İLE
  // ÜRETİLEMEZ — `JSON.stringify` da `__proto__`'yu bir ATAYICI olarak
  // görür ve çıktıya HİÇ YAZMAZ; bu TAM OLARAK ölçülüp ELENEN bir tuzaktı).
  // Bu, üstteki nesne literali testinin TAM TERSİ bir temsildir ve
  // `z.strictObject`'in SEC-9 savunmasının GERÇEKTEN bu temsili (JSONB
  // okumasının üreteceği temsili) reddettiğini kanıtlar.
  it('JSONB okumasının GERÇEK temsilini (JSON.parse ile üretilen own-property __proto__) reddeder (SEC-9, gerçek vektör)', () => {
    const corruptedJsonbPayload: unknown = JSON.parse(
      '{"platformVersion":"0.8.0","themeId":"modern","themeVersion":"0.1.0","apiVersion":"0.6.0","__proto__":{"polluted":true}}',
    )

    // `JSON.parse` sonucu her zaman bir nesne/dizi/ilkel olabilir —
    // `Object.keys` çağırmadan ÖNCE `unknown`'ı runtime'da daraltmak
    // ZORUNLU (CLAUDE.md §2, `as` yasağı — narrowing kullanılır).
    if (typeof corruptedJsonbPayload !== 'object' || corruptedJsonbPayload === null) {
      throw new Error('fikstür bozuk: JSON.parse bir nesne döndürmedi')
    }

    // Önce vektörün GERÇEKTEN bu testin iddia ettiği şekli taşıdığını
    // doğrula (yoksa aşağıdaki `safeParse` reddi YANLIŞ SEBEPLE geçerdi —
    // `extraUnknownKey` yoksa tek aday sebep `__proto__`'nun kendisidir).
    expect(Object.keys(corruptedJsonbPayload)).toContain('__proto__')
    expect(Object.prototype.hasOwnProperty.call(corruptedJsonbPayload, '__proto__')).toBe(true)

    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse(corruptedJsonbPayload)
    expect(result.success).toBe(false)

    // Reddedilmiş olsa da, ayrıştırma girişiminin KENDİSİ global
    // `Object.prototype`'ı KİRLETMEMİŞ olmalı — SEC-9'un nihai garantisi.
    expect(Object.prototype).not.toHaveProperty('polluted')
  })
})

describe('TENANT_VERSION_SNAPSHOT_SCHEMA — semver biçim kontrolü', () => {
  it('platformVersion biçimsizse reddeder', () => {
    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse({
      ...VALID_SNAPSHOT,
      platformVersion: 'v0.8.0',
    })
    expect(result.success).toBe(false)
  })

  it('themeVersion biçimsizse reddeder', () => {
    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse({
      ...VALID_SNAPSHOT,
      themeVersion: 'not-a-version',
    })
    expect(result.success).toBe(false)
  })

  it('apiVersion biçimsizse reddeder', () => {
    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse({
      ...VALID_SNAPSHOT,
      apiVersion: '6.0',
    })
    expect(result.success).toBe(false)
  })

  it('ÖLÇÜLEN SAPMA SINIFI: "1.0.0-01" hiçbir semver alanında kabul edilmez', () => {
    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse({
      ...VALID_SNAPSHOT,
      platformVersion: '1.0.0-01',
    })
    expect(result.success).toBe(false)
  })

  it('themeId BİÇİMİ bu pakette doğrulanmaz (bilinçli) — boş olmayan herhangi bir dize kabul edilir', () => {
    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse({
      ...VALID_SNAPSHOT,
      themeId: 'Not-A-Valid-THEME_ID!!',
    })
    expect(result.success).toBe(true)
  })

  it('themeId boş dize ise reddeder (min(1) kısıtı)', () => {
    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse({ ...VALID_SNAPSHOT, themeId: '' })
    expect(result.success).toBe(false)
  })
})

describe('TENANT_VERSION_SNAPSHOT_SCHEMA — BOZUK JSONB negatif testi', () => {
  it('tamamen ilgisiz bir JSON gövdesini reddeder (JSONB okumasının temsili)', () => {
    const corruptedJsonbPayload: unknown = JSON.parse('{"unrelated":"veri","nested":{"a":1}}')
    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse(corruptedJsonbPayload)
    expect(result.success).toBe(false)
  })

  it('dizi gövdesini reddeder', () => {
    const corruptedJsonbPayload: unknown = JSON.parse('[1,2,3]')
    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse(corruptedJsonbPayload)
    expect(result.success).toBe(false)
  })

  it('null gövdesini reddeder', () => {
    const result = TENANT_VERSION_SNAPSHOT_SCHEMA.safeParse(null)
    expect(result.success).toBe(false)
  })
})

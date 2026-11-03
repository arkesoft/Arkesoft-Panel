// @arkesoft/api — AC7: backoff ÜRETİM değerleri pinli (ROADMAP v0.0.11,
// T-013/S5, architect K6)
//
// ⚠ SAF BİRİM TESTİ — REDIS YOK, POSTGRES YOK, FAKE TIMER YOK. `backoff.ts`
// bullmq'dan yalnızca TİP import ediyor, dolayısıyla bu dosya hiçbir I/O
// kurmuyor ve saniyeler süren gerçek gecikmeleri BEKLEMİYOR.
//
// NE PİNLİYOR (kabul kriteri AC7'nin birebir karşılığı): "üretim gecikmesini
// düşüren bir değişiklik bu testi KIRAR". Bunu mümkün kılan iki kural:
//
//   1. BEKLENEN DEĞERLER LİTERAL YAZILIR (`[5000, 10000]`), sabitten
//      TÜRETİLMEZ. `BACKOFF_BASE_DELAY_MS`'ten türetilen bir beklenti,
//      sabit değişince kendisi de değişir → test HİÇBİR ŞEY ölçmez. Bu
//      reponun tekrarlayan kusur sınıfı (beyan ile gerçeklik boşluğu) tam
//      olarak böyle doğar.
//   2. TAM ÇIKTI assert'i (`toEqual` ile dizinin TAMAMI) — "ilk eleman 5000"
//      gibi kısmi assert, dizinin uzunluğunu (yani `JOB_ATTEMPTS`'i)
//      serbest bırakırdı.
//
// ⚠ A-PM1 BU TASARIMLA GEÇERSİZ: BullMQ'nun gecikmeli iş zamanlaması Redis
// tarafındadır ve fake timer onu ilerletmez — ama biz zaman İLERLETMİYORUZ,
// gecikmenin DEĞERİNİ üreten saf fonksiyonu ölçüyoruz. Aynı fonksiyon
// üretimde `Worker.settings.backoffStrategy` üzerinden FİİLEN koşuyor
// (`createBackoffStrategy`), yani bu pin "üretimde koşan kod yolunu"
// ölçüyor — bir aynalamayı değil.

import { describe, expect, it } from 'vitest'

import {
  buildBackoffDelaySequence,
  computeBackoffDelayMs,
  createBackoffStrategy,
  PRODUCTION_BACKOFF_PROFILE,
} from '../queue/backoff.js'
import type { BackoffProfile } from '../queue/backoff.js'
import {
  BACKOFF_BASE_DELAY_MS,
  CUSTOM_BACKOFF_TYPE,
  JOB_ATTEMPTS,
} from '../queue/queue-constants.js'

describe('AC7 — üretim backoff dizisi pinli (T-013/S5)', () => {
  it('ÜRETİM dizisi TAM OLARAK [5000, 10000] (literal — sabitten türetilmedi)', () => {
    expect(buildBackoffDelaySequence(JOB_ATTEMPTS, PRODUCTION_BACKOFF_PROFILE)).toEqual([
      5000, 10000,
    ])
  })

  it('üretim sabitleri: JOB_ATTEMPTS = 3, BACKOFF_BASE_DELAY_MS = 5000', () => {
    expect(JOB_ATTEMPTS).toBe(3)
    expect(BACKOFF_BASE_DELAY_MS).toBe(5000)
  })

  it('deneme başına gecikme üstel: 1 → 5000, 2 → 10000, 3 → 20000', () => {
    expect(computeBackoffDelayMs(1, PRODUCTION_BACKOFF_PROFILE)).toBe(5000)
    expect(computeBackoffDelayMs(2, PRODUCTION_BACKOFF_PROFILE)).toBe(10000)
    // ÜRETİMDE KULLANILMAZ (JOB_ATTEMPTS = 3 → yalnızca iki yeniden deneme),
    // ama formülü pinler: dizinin uzunluğu ile FORMÜL ayrı ayrı ölçülüyor.
    expect(computeBackoffDelayMs(3, PRODUCTION_BACKOFF_PROFILE)).toBe(20000)
  })

  it('dizi `attempts - 1` elemanlı: son denemeden sonra yeniden deneme YOK (iş DLQ’ya gider)', () => {
    expect(buildBackoffDelaySequence(JOB_ATTEMPTS, PRODUCTION_BACKOFF_PROFILE)).toHaveLength(
      JOB_ATTEMPTS - 1,
    )
    expect(buildBackoffDelaySequence(1, PRODUCTION_BACKOFF_PROFILE)).toEqual([])
  })

  it('üretim profili TAM OLARAK tek anahtar taşır (gizli bir ayar düğmesi eklenmedi)', () => {
    expect(Object.keys(PRODUCTION_BACKOFF_PROFILE).sort()).toEqual(['baseDelayMs'])
  })
})

describe('AC6 yolu — gecikme DI PROFİLİYLE enjekte edilir (env değil, fake timer değil)', () => {
  it('kısa profil (AC6 entegrasyon testinin kullanacağı) diziyi ölçeklendirir', () => {
    const fastProfile: BackoffProfile = { baseDelayMs: 25 }

    expect(buildBackoffDelaySequence(JOB_ATTEMPTS, fastProfile)).toEqual([25, 50])
  })

  it('profil üretim profilinden BAĞIMSIZ: kısa profil üretim değerlerini DEĞİŞTİRMEZ', () => {
    const fastProfile: BackoffProfile = { baseDelayMs: 25 }
    buildBackoffDelaySequence(JOB_ATTEMPTS, fastProfile)

    // Modül durumu/paylaşılan mutasyon yok — saf fonksiyon.
    expect(buildBackoffDelaySequence(JOB_ATTEMPTS, PRODUCTION_BACKOFF_PROFILE)).toEqual([
      5000, 10000,
    ])
  })
})

describe('kenar durumlar — hata yolunda FIRLATMIYOR, alt sınıra sabitleniyor', () => {
  it('attemptsMade <= 1 ve kesirli/negatif girdi taban gecikmeye düşer', () => {
    expect(computeBackoffDelayMs(1, PRODUCTION_BACKOFF_PROFILE)).toBe(5000)
    expect(computeBackoffDelayMs(0, PRODUCTION_BACKOFF_PROFILE)).toBe(5000)
    expect(computeBackoffDelayMs(-5, PRODUCTION_BACKOFF_PROFILE)).toBe(5000)
    expect(computeBackoffDelayMs(1.9, PRODUCTION_BACKOFF_PROFILE)).toBe(5000)
  })

  it('attempts <= 1 için dizi BOŞ (negatif uzunluk üretmez)', () => {
    expect(buildBackoffDelaySequence(0, PRODUCTION_BACKOFF_PROFILE)).toEqual([])
    expect(buildBackoffDelaySequence(-3, PRODUCTION_BACKOFF_PROFILE)).toEqual([])
  })
})

describe('createBackoffStrategy — BullMQ yüzeyine bağlanan TEK formül', () => {
  it('stratejinin ürettiği değerler saf fonksiyonla BİREBİR aynı', () => {
    const strategy = createBackoffStrategy(PRODUCTION_BACKOFF_PROFILE)

    expect(strategy(1)).toBe(5000)
    expect(strategy(2)).toBe(10000)
  })

  it('BullMQ’nun fazladan parametrelerini (type, err, job) YOK SAYAR', () => {
    const strategy = createBackoffStrategy(PRODUCTION_BACKOFF_PROFILE)

    // BullMQ stratejiyi `(attemptsMade, type, err, job)` ile çağırır; gecikme
    // yalnızca deneme sayısına bağlı olmalı — hata TÜRÜNE göre gecikme
    // değiştirmek (retry/DLQ kararını `isRetryable` veriyorken) iki ayrı
    // karar mekanizması üretirdi.
    expect(strategy(2, CUSTOM_BACKOFF_TYPE, new Error('sentetik'))).toBe(10000)
  })
})

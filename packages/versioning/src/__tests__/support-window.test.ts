// @arkesoft/versioning — support-window.ts birim testleri (ROADMAP v0.0.21,
// T-018/S1, AC-7: dört birim, dört AYRI `describe`)
//
// ⚠ Tarihler HER ZAMAN test içinde ENJEKTE edilir (`fellOutOfWindowAt`,
// `supersededAt`, `now` parametreleri) — üretim kodu (`support-window.ts`)
// sistem saatini okuyan HİÇBİR çağrı içermez. ⚠⚠ qa gate T-018 tur 1, SD-2
// DÜZELTMESİ (solid gate'in bulgusu — YANLIŞ ÖNCÜL): bu paragraf eskiden
// "saflık taraması `src` ağacının TAMAMINI (test dosyaları DAHİL) tarıyor"
// diyordu — ÖLÇÜLDÜ VE YANLIŞ: `__tests__/purity.test.ts`'in
// `productionSourceFiles()` yardımcısı `entry.isFile()` ile filtreler ve
// `__tests__/` bir DİZİNDİR (dosya DEĞİL) — bu yüzden tarama yalnızca
// `src/*.ts` (düz, test dosyaları HARİÇ) kapsar; `purity.test.ts`'in
// KENDİ dosya başı yorumu (`:37`) da "test dosyaları HARİÇ" der. Yanlış
// öncül, aşağıdaki fikstür üreticisinin `Reflect.construct(Date, [0])`
// karmaşıklığının TEK gerekçesiydi — bu dosya saflık taramasının kapsamı
// DIŞINDA olduğu için yasaklı dizgiyi (`new Date(`) sıradan biçimde
// yazmaktan KORKMASI gerekmiyordu. Fikstür aşağıda sade `new Date(0)`'a
// indirildi.

import { describe, expect, it } from 'vitest'

import {
  countPlatformMinorsBehind,
  isPlatformVersionSupported,
  isPublicApiMajorSupported,
  isThemeSdkVersionSupported,
  isThemeVersionSupported,
  MANDATORY_UPGRADE_GRACE_DAYS,
  PLATFORM_SUPPORTED_MINOR_WINDOW,
  PUBLIC_API_SUNSET_MONTHS,
  resolveMandatoryUpgradeDeadline,
  resolvePublicApiSunsetDate,
  THEME_SDK_SUPPORTED_MAJOR_WINDOW,
  THEME_SUPPORTED_MAJOR_WINDOW,
} from '../support-window.js'
import type { SemverParts } from '../semver.js'

/**
 * Test-YEREL tarih fikstürü üretici — her çağrıda epoch'tan (1970-01-01
 * UTC) TAZE bir kopya alıp `setUTCFullYear` ile hedef tarihe taşır. Bu
 * dosya saflık taramasının (`__tests__/purity.test.ts`) kapsamı DIŞINDA
 * olduğu için (dosya başı notu, SD-2 düzeltmesi) `new Date(0)` KULLANMAK
 * serbesttir — üretim kodunun (`support-window.ts`) `structuredClone` +
 * `setUTC*` tekniğiyle TUTARLI kalmak için `structuredClone` burada da
 * korunur (girdinin KOPYALANMASI gerektiği için, epoch sabiti MUTASYONA
 * UĞRAMASIN).
 */
const EPOCH_REFERENCE = new Date(0)

function utcDate(year: number, zeroBasedMonth: number, day: number): Date {
  const date = structuredClone(EPOCH_REFERENCE)
  date.setUTCFullYear(year, zeroBasedMonth, day)
  return date
}

const v = (major: number, minor: number, patch = 0): SemverParts => ({
  major,
  minor,
  patch,
  prerelease: undefined,
})

describe('(a) Platform — N-2 (en güncel iki minor geriye)', () => {
  it('pencere sabiti 2dir', () => {
    expect(PLATFORM_SUPPORTED_MINOR_WINDOW).toBe(2)
  })

  it('countPlatformMinorsBehind — aynı major için minor farkını döner', () => {
    expect(countPlatformMinorsBehind({ candidate: v(0, 6), latest: v(0, 8) })).toBe(2)
    expect(countPlatformMinorsBehind({ candidate: v(0, 8), latest: v(0, 8) })).toBe(0)
  })

  it('countPlatformMinorsBehind — major farklıysa undefined (kavramsal uygulanamazlık)', () => {
    expect(countPlatformMinorsBehind({ candidate: v(1, 0), latest: v(0, 8) })).toBeUndefined()
  })

  it('SINIR: latest=0.8.0 → 0.6.0 İÇERİDE (N-2), 0.5.0 DIŞARIDA (N-3)', () => {
    expect(isPlatformVersionSupported({ candidate: v(0, 6), latest: v(0, 8) })).toBe(true)
    expect(isPlatformVersionSupported({ candidate: v(0, 5), latest: v(0, 8) })).toBe(false)
  })

  it('N, N-1 desteklidir', () => {
    expect(isPlatformVersionSupported({ candidate: v(0, 8), latest: v(0, 8) })).toBe(true)
    expect(isPlatformVersionSupported({ candidate: v(0, 7), latest: v(0, 8) })).toBe(true)
  })

  it('§6 boşluğu — FAIL-CLOSED: daha küçük major DESTEKSİZ', () => {
    expect(isPlatformVersionSupported({ candidate: v(0, 8), latest: v(1, 0) })).toBe(false)
  })

  it('§6 boşluğu — daha büyük major (kiracı ileride) DESTEKLİ, çökmez', () => {
    expect(isPlatformVersionSupported({ candidate: v(1, 0), latest: v(0, 8) })).toBe(true)
  })
})

describe('(b) theme-sdk — N-2 (en güncel iki major)', () => {
  it('pencere sabiti 2dir', () => {
    expect(THEME_SDK_SUPPORTED_MAJOR_WINDOW).toBe(2)
  })

  it('aynı major ve bir önceki major desteklidir, ikinci öncesi DIŞARIDA', () => {
    expect(isThemeSdkVersionSupported({ candidate: v(3, 0), latest: v(3, 0) })).toBe(true)
    expect(isThemeSdkVersionSupported({ candidate: v(2, 0), latest: v(3, 0) })).toBe(true)
    expect(isThemeSdkVersionSupported({ candidate: v(1, 0), latest: v(3, 0) })).toBe(false)
  })

  it('daha büyük major (ileride) desteklidir', () => {
    expect(isThemeSdkVersionSupported({ candidate: v(4, 0), latest: v(3, 0) })).toBe(true)
  })
})

describe('(c) Tema — N-2 (tema başına son iki major, (b) ile AYNI aritmetik, AYRI fonksiyon)', () => {
  it('pencere sabiti 2dir', () => {
    expect(THEME_SUPPORTED_MAJOR_WINDOW).toBe(2)
  })

  it('tema başına latestForTheme ile aynı pencere kuralını uygular', () => {
    expect(isThemeVersionSupported({ candidate: v(1, 0), latestForTheme: v(2, 0) })).toBe(true)
    expect(isThemeVersionSupported({ candidate: v(0, 1), latestForTheme: v(2, 0) })).toBe(false)
  })
})

describe('(d) Public API — 12 ay yaşam + takvim ayı aritmetiği (UTC, ay-sonu taşması)', () => {
  it('sabit 12 aydır', () => {
    expect(PUBLIC_API_SUNSET_MONTHS).toBe(12)
  })

  it('AY-SONU TAŞMASI YOK: 2026-01-31 + 12 ay → 2027-01-31 (her iki yılda da Ocak 31 gün)', () => {
    const supersededAt = utcDate(2026, 0, 31)
    const sunsetDate = resolvePublicApiSunsetDate({ supersededAt })
    expect(sunsetDate.getUTCFullYear()).toBe(2027)
    expect(sunsetDate.getUTCMonth()).toBe(0)
    expect(sunsetDate.getUTCDate()).toBe(31)
  })

  it('AY-SONU TAŞMASI VAR VE KIRPILIR: artık yılın 29 Şubatı + 12 ay → hedef yıl artık değilse 28 Şubata kırpılır', () => {
    const supersededAt = utcDate(2028, 1, 29) // 2028 artık yıl
    const sunsetDate = resolvePublicApiSunsetDate({ supersededAt })
    expect(sunsetDate.getUTCFullYear()).toBe(2029)
    expect(sunsetDate.getUTCMonth()).toBe(1) // Şubat
    expect(sunsetDate.getUTCDate()).toBe(28) // 2029 artık değil → kırpıldı, Mart'a TAŞMADI
  })

  it('girdi tarihi MUTASYONA UĞRAMAZ (saf fonksiyon)', () => {
    const supersededAt = utcDate(2026, 0, 31)
    const originalTime = supersededAt.getTime()
    resolvePublicApiSunsetDate({ supersededAt })
    expect(supersededAt.getTime()).toBe(originalTime)
  })

  it('isPublicApiMajorSupported — supersededAt null ⇒ her zaman desteklidir', () => {
    expect(isPublicApiMajorSupported({ supersededAt: null, now: utcDate(2030, 0, 1) })).toBe(true)
  })

  it('isPublicApiMajorSupported — kapsayıcılık AÇIK: now < sunsetDate ⇒ desteklidir, now === sunsetDate (veya SONRASI) ⇒ DESTEKSİZDİR', () => {
    const supersededAt = utcDate(2026, 0, 1)
    const sunsetDate = resolvePublicApiSunsetDate({ supersededAt })

    const justBefore = structuredClone(sunsetDate)
    justBefore.setTime(justBefore.getTime() - 1)
    expect(isPublicApiMajorSupported({ supersededAt, now: justBefore })).toBe(true)

    expect(isPublicApiMajorSupported({ supersededAt, now: sunsetDate })).toBe(false)

    const after = structuredClone(sunsetDate)
    after.setTime(after.getTime() + 1)
    expect(isPublicApiMajorSupported({ supersededAt, now: after })).toBe(false)
  })
})

describe('(e) Zorunlu yükseltme bekleme süresi — 30 gün (milisaniye-kesin, DST sorusu yok)', () => {
  it('sabit 30 gündür', () => {
    expect(MANDATORY_UPGRADE_GRACE_DAYS).toBe(30)
  })

  it('tam 30 × 24 saat sonrasını hesaplar', () => {
    const fellOutOfWindowAt = utcDate(2026, 5, 1)
    const deadline = resolveMandatoryUpgradeDeadline({ fellOutOfWindowAt })
    const expectedMilliseconds = fellOutOfWindowAt.getTime() + 30 * 24 * 60 * 60 * 1000
    expect(deadline.getTime()).toBe(expectedMilliseconds)
  })

  it('girdi tarihi mutasyona uğramaz (saf fonksiyon)', () => {
    const fellOutOfWindowAt = utcDate(2026, 5, 1)
    const originalTime = fellOutOfWindowAt.getTime()
    resolveMandatoryUpgradeDeadline({ fellOutOfWindowAt })
    expect(fellOutOfWindowAt.getTime()).toBe(originalTime)
  })
})

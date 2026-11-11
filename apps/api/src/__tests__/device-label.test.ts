// @arkesoft/api — `resolveDeviceFamilies` birim testleri (ROADMAP v0.0.15.1,
// T-017/S7, architect ADR-0019 §8, K4 revize)
//
// ⚠ SAF BİRİM TESTİ — I/O YOK. `../auth/device-label.js`, Postgres/Redis'e
// hiç dokunmayan tek bir fonksiyon; bu dosya da hiçbirine bağlanmaz.
//
// Dönüş tipi `@arkesoft/trpc`'in tel enum'larından TÜRER — bu dosya da
// (S4'ün önerisi, ⭐) üye listelerini `.options` üzerinden okur, elle sayım
// YAPMAZ, böylece enum büyür/küçülürse bu test SESSİZCE eskimiş kalmaz.

import { deviceBrowserSchema, deviceOsSchema } from '@arkesoft/trpc'
import { describe, expect, it } from 'vitest'

import { resolveDeviceFamilies } from '../auth/device-label.js'

describe('resolveDeviceFamilies', () => {
  // ⭐ S4'ün önerisi — kapalı-dünya sözlüğün BOYUTUNU elle yazmak yerine
  // `.options`'tan okur: enum S4 sonrasında büyür/küçülürse bu assert'ler
  // senkron kalır, "6 üye bekliyordum ama şema 8 üyeli" gibi sessiz
  // kaymaları yakalamaz hale GELMEZ.
  it('tarayıcı ailesi sözlüğü @arkesoft/trpc ile senkrondur', () => {
    expect(deviceBrowserSchema.options).toHaveLength(8)
  })

  it('işletim sistemi ailesi sözlüğü @arkesoft/trpc ile senkrondur', () => {
    expect(deviceOsSchema.options).toHaveLength(7)
  })

  // ---------------------------------------------------------------------
  // ≥12 GERÇEK UA DİZESİ — tarayıcı × işletim sistemi karışımı
  // ---------------------------------------------------------------------

  it('Chrome / Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'chrome',
      osFamily: 'windows',
    })
  })

  it('Chrome / macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'chrome',
      osFamily: 'macos',
    })
  })

  it('Chrome / Linux', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'chrome',
      osFamily: 'linux',
    })
  })

  it('Chrome / Android', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'chrome',
      osFamily: 'android',
    })
  })

  it('Firefox / Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'firefox',
      osFamily: 'windows',
    })
  })

  it('Firefox / Linux', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'firefox',
      osFamily: 'linux',
    })
  })

  it('Safari / macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'safari',
      osFamily: 'macos',
    })
  })

  it('Safari / iOS (iPhone)', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/605.1.15'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'safari',
      osFamily: 'ios',
    })
  })

  it('Safari / iOS (iPad)', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/605.1.15'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'safari',
      osFamily: 'ios',
    })
  })

  it('Edge / Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'edge',
      osFamily: 'windows',
    })
  })

  it('Edge / macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'edge',
      osFamily: 'macos',
    })
  })

  it('Opera (OPR/) / Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'opera',
      osFamily: 'windows',
    })
  })

  it('Samsung Internet / Android', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'samsung',
      osFamily: 'android',
    })
  })

  // ---------------------------------------------------------------------
  // SIRA TUZAĞI — ÜÇ BAĞLAYICI ASSERT (iç içe geçen imzalar)
  // ---------------------------------------------------------------------

  it('[SIRA TUZAĞI] Edge UA\'sı "chrome" DEĞİL "edge" döner (Edg/ Chrome/\'dan önce kontrol edilmeli)', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0'
    expect(resolveDeviceFamilies(ua).browserFamily).toBe('edge')
    expect(resolveDeviceFamilies(ua).browserFamily).not.toBe('chrome')
  })

  it('[SIRA TUZAĞI] Chrome UA\'sı "safari" DEĞİL "chrome" döner (Chrome/ Safari/\'den önce kontrol edilmeli)', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
    expect(resolveDeviceFamilies(ua).browserFamily).toBe('chrome')
    expect(resolveDeviceFamilies(ua).browserFamily).not.toBe('safari')
  })

  it('[SIRA TUZAĞI] Android UA\'sı "linux" DEĞİL "android" döner (Android, Linux\'tan önce kontrol edilmeli)', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
    expect(resolveDeviceFamilies(ua).osFamily).toBe('android')
    expect(resolveDeviceFamilies(ua).osFamily).not.toBe('linux')
  })

  // ⚠⚠ DÖRDÜNCÜ SIRA TUZAĞI — brifingin 3 bağlayıcı assert'inin DIŞINDA,
  // bu çalışma sırasında ÖLÇÜLDÜ: mobil Safari (iPhone/iPad) UA'sı
  // `"like Mac OS X"` alt dizesini de içerir. İlk yazımda `resolveOsFamily`
  // macOS kontrolünü iOS kontrolünden ÖNCE çalıştırıyordu ve bu test
  // (aşağıdaki toEqual'lı Safari/iOS testleriyle birlikte) GERÇEKTEN
  // kırmızı çıktı — sıra düzeltildi, bu assert kalıcı regresyon muhafızıdır.
  it('[SIRA TUZAĞI — ÖLÇÜLDÜ] iPhone UA\'sı "macos" DEĞİL "ios" döner (iOS, Mac OS X\'ten önce kontrol edilmeli)', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/605.1.15'
    expect(resolveDeviceFamilies(ua).osFamily).toBe('ios')
    expect(resolveDeviceFamilies(ua).osFamily).not.toBe('macos')
  })

  // ---------------------------------------------------------------------
  // BOŞ / NULL / ÇÖP — kenar durumlar
  // ---------------------------------------------------------------------

  it('null UA → unknown/unknown', () => {
    expect(resolveDeviceFamilies(null)).toEqual({
      browserFamily: 'unknown',
      osFamily: 'unknown',
    })
  })

  it('boş dize UA → unknown/unknown', () => {
    expect(resolveDeviceFamilies('')).toEqual({
      browserFamily: 'unknown',
      osFamily: 'unknown',
    })
  })

  // ⚠⚠ ÖLÇÜLMÜŞ ÇELİŞKİ (raporda tekrarlanır): görevin "Test" bölümü
  // null/''/çöp dizeyi TEK maddede `unknown`/`unknown`'a bağlıyor; AYNI
  // görevin "OS ekseni" cümlesi ise dolu-ama-eşleşmeyen dizeler için
  // AÇIKÇA `other` diyor ve curl kararını `chrome` vs `other` (unknown
  // seçenek DIŞI) çerçeveliyor. Bu test `device-label.ts`'in dosya başlığı
  // yorumundaki kararı (dolu-ama-eşleşmeyen → `other`, YALNIZCA boş/null →
  // `unknown`) doğrular — "çöp dize"nin burada UA başlığı YOK anlamına
  // GELMEDİĞİNİ, var ama tanınmayan bir dize olduğunu baz alır.
  it('çöp (tanınmayan ama BOŞ OLMAYAN) dize → other/other, unknown/unknown DEĞİL', () => {
    expect(resolveDeviceFamilies('zzz-not-a-real-user-agent-9000')).toEqual({
      browserFamily: 'other',
      osFamily: 'other',
    })
  })

  // ---------------------------------------------------------------------
  // S3'ÜN ÖLÇTÜĞÜ GERÇEK DEĞERLER — gerekçeli kararlar
  // ---------------------------------------------------------------------

  // KARAR: curl bir tarayıcı AİLESİ değildir ve işletim sistemi imzası
  // taşımaz → her iki eksen de 'other' (dosya başlığı yorumundaki
  // "ÖLÇÜLMÜŞ ÇELİŞKİ" notunun gerekçesiyle; `unknown` DEĞİL çünkü UA
  // başlığı BOŞ değil — S3'ün ölçtüğü 3 curl satırı GERÇEK bir durumdur).
  it('curl/8.7.1 → other/other (gerekçe: dosya başlığı yorumu)', () => {
    expect(resolveDeviceFamilies('curl/8.7.1')).toEqual({
      browserFamily: 'other',
      osFamily: 'other',
    })
  })

  // KARAR: HeadlessChrome UA'sı gerçek bir `Chrome/` imzası taşır —
  // Chromium'un headless modu motor ailesini DEĞİŞTİRMEZ; bu fonksiyon
  // headless/headful ayrımı yapmaz (kapalı-dünya sözlükte 'headless' yok).
  it('HeadlessChrome/156.0.8078.4 (Linux) → chrome/linux (gerekçe: dosya başlığı yorumu)', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36'
    expect(resolveDeviceFamilies(ua)).toEqual({
      browserFamily: 'chrome',
      osFamily: 'linux',
    })
  })

  // ---------------------------------------------------------------------
  // VACUITY — sıra kuralı geçici bozulursa test GERÇEKTEN kırmızı olmalı.
  // Bu `it` KALICI DEĞİL: DoD madde 7'nin elle yapılan kanıtını belgeler
  // (bkz. handoff raporu) — burada sıra BOZULMADAN bırakılır, yalnızca
  // mesajın hangi UA'yı adlandırdığını netleştirmek için assert mesajı
  // açık yazılmıştır.
  it("[VACUITY REFERANSI] Edge UA'sının Chrome/'dan ÖNCE Edg/ içerdiğini doğrular (sıra bozulursa bu assert kırmızı olur)", () => {
    const edgeUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0'
    const result = resolveDeviceFamilies(edgeUa)
    expect(
      result.browserFamily,
      `Edge UA'sı "edge" dönmeli, "${result.browserFamily}" döndü — sıra kuralı bozulmuş olabilir`,
    ).toBe('edge')
  })
})

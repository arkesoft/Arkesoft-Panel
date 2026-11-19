// @arkesoft/api — `resolveTrustedOrigins` birim testleri (ROADMAP v0.0.20,
// T-021/S6, ADR-0023 §4 "Üçüncü tarayıcı orijini")
//
// R-A1 azaltma (b) — KARDİNALİTE assertion'ı: `toHaveLength` kullanılır,
// `toContain`'e İNDİRİLMEZ. Hem `SUPERADMIN_BASE_URL` VERİLMEMİŞ hem
// VERİLMİŞ hâl için ayrı test — ikisi de dizinin TAM uzunluğunu doğrular,
// yalnızca bir elemanın varlığını DEĞİL.
//
// ADR-0023 §4.5'in bayt-birebir kanıtı BU dosyada DEĞİL — bu dosya yalnızca
// `resolveTrustedOrigins`'in saf çıktısını ölçer. Bayt-birebir kanıtı mevcut
// `same-origin-guard*.test.ts` üçlüsünün (bu alt görevde TEK SATIR
// DEĞİŞTİRİLMEDEN) yeşil kalmasıyla sağlanır.
//
// GÜNCELLEME (ROADMAP v0.0.21.1, T-025/S1, `K2` mekanizması, AC-27): dört
// yeni grup EKLENDİ — (b) 3/4 elemanlı liste (`ADDITIONAL_TRUSTED_ORIGINS`),
// (c) kiracı alt alan adı reddi, (d) şema-seviyesi biçim reddi (joker,
// kullanıcı adı/parola, yol/sorgu/fragment, kardinalite). KARDİNALİTE
// iddiaları burada da `toHaveLength` ile KORUNUR (R-A1 azaltma (b)'nin AYNI
// disiplini, ADR-0023 §4 madde 4).
//
// ⚠⚠ SERTLEŞTİRME (`po`'nun ölçtüğü tuzak): aşağıdaki `parseEnvWithOverrides`
// hem `SUPERADMIN_BASE_URL` hem `ADDITIONAL_TRUSTED_ORIGINS`'i HER ÇAĞRIDA
// AÇIKÇA nötrler (`overrides`'ın ÜSTÜNE yazdığı iki alan). Gerekçe: bu
// yardımcı `{ ...process.env, ... }` ile kurulur — kabukta
// `ADDITIONAL_TRUSTED_ORIGINS` EXPORT EDİLMİŞSE (S6'nın Terminal A'sının
// yapacağı TAM OLARAK bu), nötrleme OLMADAN bu alan `process.env`'den SIZAR
// ve "tam 1 eleman" vakası (ADR-0023 §4.5) ORTAMA BAĞIMLI hâle gelir. Bu bir
// GEVŞETME değil, iddiaları ortamdan YALITAN bir SERTLEŞTİRMEDİR.

import { parseEnv } from '@arkesoft/config/env'
import { describe, expect, it } from 'vitest'

import { resolveTrustedOrigins } from '../auth/trusted-origins.js'
import { apiEnvSchema, MAX_ADDITIONAL_TRUSTED_ORIGINS } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin
const APP_BASE_DOMAIN = BASE_ENV.APP_BASE_DOMAIN

type TrustedOriginEnvOverrides = {
  readonly SUPERADMIN_BASE_URL?: string | undefined
  readonly ADDITIONAL_TRUSTED_ORIGINS?: string | undefined
}

/**
 * Gerçek `process.env`'in üstüne, yalnızca test İÇİN, bu çağrının ilgilendiği
 * alanları değiştirir — dosya başı GÜNCELLEME yorumundaki SERTLEŞTİRME
 * gerekçesiyle `SUPERADMIN_BASE_URL`/`ADDITIONAL_TRUSTED_ORIGINS` HER ÇAĞRIDA
 * ÖNCE nötrlenir, `overrides` bunların ÜSTÜNE yazar.
 */
function parseEnvWithOverrides(overrides: TrustedOriginEnvOverrides): ApiEnv {
  return parseEnv(apiEnvSchema, {
    ...process.env,
    SUPERADMIN_BASE_URL: undefined,
    ADDITIONAL_TRUSTED_ORIGINS: '',
    ...overrides,
  })
}

/** Gerçek `process.env`'in üstüne, yalnızca test İÇİN, TEK alanı değiştirir. */
function parseEnvWithSuperadminBaseUrl(value: string | undefined): ApiEnv {
  return parseEnvWithOverrides({ SUPERADMIN_BASE_URL: value })
}

/** Gerçek `process.env`'in üstüne, yalnızca test İÇİN, TEK alanı değiştirir. */
function parseEnvWithAdditionalTrustedOrigins(value: string): ApiEnv {
  return parseEnvWithOverrides({ ADDITIONAL_TRUSTED_ORIGINS: value })
}

describe('resolveTrustedOrigins (ADR-0023 §4, Karar 4)', () => {
  it('SUPERADMIN_BASE_URL VERİLMEMİŞKEN liste TAM 1 eleman taşır ve o eleman AUTH_BASE_URL’in orijinidir', () => {
    const env = parseEnvWithSuperadminBaseUrl(undefined)

    const origins = resolveTrustedOrigins(env)

    expect(origins).toHaveLength(1)
    expect(origins[0]).toBe(TRUSTED_ORIGIN)
  })

  it('SUPERADMIN_BASE_URL VERİLMİŞKEN liste TAM 2 eleman taşır (AUTH_BASE_URL orijini + SUPERADMIN_BASE_URL orijini)', () => {
    const env = parseEnvWithSuperadminBaseUrl('http://superadmin.arkesoft.localhost:5174')

    const origins = resolveTrustedOrigins(env)

    expect(origins).toHaveLength(2)
    expect(origins[0]).toBe(TRUSTED_ORIGIN)
    expect(origins[1]).toBe('http://superadmin.arkesoft.localhost:5174')
  })

  it('SUPERADMIN_BASE_URL yol/sorgu taşısa bile yalnızca ORİJİNİ eklenir (tam URL değil)', () => {
    const env = parseEnvWithSuperadminBaseUrl(
      'http://superadmin.arkesoft.localhost:5174/giris?ref=panel',
    )

    const origins = resolveTrustedOrigins(env)

    expect(origins).toHaveLength(2)
    expect(origins[1]).toBe('http://superadmin.arkesoft.localhost:5174')
  })
})

describe('resolveTrustedOrigins — ADDITIONAL_TRUSTED_ORIGINS türetmesi (ROADMAP v0.0.21.1, T-025/S1, AC-27a)', () => {
  it('ADDITIONAL_TRUSTED_ORIGINS iki girdi taşırken (SUPERADMIN_BASE_URL YOK) liste TAM 3 eleman taşır', () => {
    const env = parseEnvWithAdditionalTrustedOrigins(
      'http://partner-one.example.com,http://partner-two.example.com',
    )

    const origins = resolveTrustedOrigins(env)

    expect(origins).toHaveLength(3)
    expect(origins[0]).toBe(TRUSTED_ORIGIN)
    expect(origins[1]).toBe('http://partner-one.example.com')
    expect(origins[2]).toBe('http://partner-two.example.com')
  })

  it('ADDITIONAL_TRUSTED_ORIGINS iki girdi taşırken (SUPERADMIN_BASE_URL DE VAR) liste TAM 4 eleman taşır', () => {
    const env = parseEnvWithOverrides({
      SUPERADMIN_BASE_URL: 'http://superadmin.arkesoft.localhost:5174',
      ADDITIONAL_TRUSTED_ORIGINS: 'http://partner-one.example.com,http://partner-two.example.com',
    })

    const origins = resolveTrustedOrigins(env)

    expect(origins).toHaveLength(4)
    expect(origins[0]).toBe(TRUSTED_ORIGIN)
    expect(origins[1]).toBe('http://superadmin.arkesoft.localhost:5174')
    expect(origins[2]).toBe('http://partner-one.example.com')
    expect(origins[3]).toBe('http://partner-two.example.com')
  })

  it('aynı orijin iki kaynaktan (SUPERADMIN_BASE_URL + ADDITIONAL_TRUSTED_ORIGINS) gelirse TEKİLLEŞTİRİLİR — liste ŞİŞMEZ', () => {
    const env = parseEnvWithOverrides({
      SUPERADMIN_BASE_URL: 'http://superadmin.arkesoft.localhost:5174',
      ADDITIONAL_TRUSTED_ORIGINS: 'http://superadmin.arkesoft.localhost:5174',
    })

    const origins = resolveTrustedOrigins(env)

    expect(origins).toHaveLength(2)
  })
})

describe('resolveTrustedOrigins — kiracı alt alan adı reddi (ROADMAP v0.0.21.1, T-025/S1, AC-27c)', () => {
  it("ADDITIONAL_TRUSTED_ORIGINS içindeki 'kiraci.<APP_BASE_DOMAIN>' FIRLAR (rezerve olmayan tek etiketli kiracı alt alan adı)", () => {
    const env = parseEnvWithAdditionalTrustedOrigins(`http://kiraci.${APP_BASE_DOMAIN}`)

    expect(() => resolveTrustedOrigins(env)).toThrow()
  })

  it.each(['panel', 'superadmin', 'api', 'www', 'app'])(
    "ADDITIONAL_TRUSTED_ORIGINS içindeki REZERVE alt alan adı '%s.<APP_BASE_DOMAIN>' FIRLAMAZ",
    (label) => {
      const env = parseEnvWithAdditionalTrustedOrigins(`http://${label}.${APP_BASE_DOMAIN}`)

      expect(() => resolveTrustedOrigins(env)).not.toThrow()
    },
  )
})

describe('ADDITIONAL_TRUSTED_ORIGINS — şema doğrulaması (ROADMAP v0.0.21.1, T-025/S1, AC-27d)', () => {
  it('joker karakter içeren girdi açılışta Türkçe mesajla REDDEDİLİR', () => {
    expect(() => parseEnvWithAdditionalTrustedOrigins('https://*.example.com')).toThrow(
      /joker karakter/,
    )
  })

  it('kullanıcı adı/parola bileşeni taşıyan girdi açılışta Türkçe mesajla REDDEDİLİR', () => {
    expect(() => parseEnvWithAdditionalTrustedOrigins('https://user:pass@example.com')).toThrow(
      /kullanıcı adı\/parola/,
    )
  })

  it("'/' dışında yol taşıyan girdi açılışta Türkçe mesajla REDDEDİLİR (sessiz orijine indirme YOK)", () => {
    expect(() => parseEnvWithAdditionalTrustedOrigins('https://example.com/giris')).toThrow(
      /yol, sorgu veya fragment/,
    )
  })

  it(`8'den fazla girdi açılışta Türkçe mesajla REDDEDİLİR (kardinalite üst sınırı = ${String(MAX_ADDITIONAL_TRUSTED_ORIGINS)})`, () => {
    const tooMany = Array.from(
      { length: MAX_ADDITIONAL_TRUSTED_ORIGINS + 1 },
      (_, index) => `https://partner-${String(index)}.example.com`,
    ).join(',')

    expect(() => parseEnvWithAdditionalTrustedOrigins(tooMany)).toThrow(/en fazla/)
  })

  it('mutlak olmayan (şemasız) bir girdi açılışta Türkçe mesajla REDDEDİLİR', () => {
    expect(() => parseEnvWithAdditionalTrustedOrigins('example.com')).toThrow(/mutlak bir URL/)
  })
})

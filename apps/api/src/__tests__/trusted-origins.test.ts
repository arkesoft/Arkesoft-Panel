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

import { parseEnv } from '@arkesoft/config/env'
import { describe, expect, it } from 'vitest'

import { resolveTrustedOrigins } from '../auth/trusted-origins.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin

/** Gerçek `process.env`'in üstüne, yalnızca test İÇİN, TEK alanı değiştirir. */
function parseEnvWithSuperadminBaseUrl(value: string | undefined): ApiEnv {
  return parseEnv(apiEnvSchema, { ...process.env, SUPERADMIN_BASE_URL: value })
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

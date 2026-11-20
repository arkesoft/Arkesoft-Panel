// @arkesoft/i18n — desteklenen para birimleri (ROADMAP v0.0.18, T-027/S5b, AC-49)
//
// TEK DOĞRULUK KAYNAĞI: `Currency` tablosunun (`packages/db`, S6) satırları
// bu listenin İŞLETİMSEL ALT KÜMESİDİR (`currency.code ⊆ SUPPORTED_CURRENCIES`).
// `packages/i18n` veritabanına bağımlı OLAMAZ (`__tests__/purity.test.ts`) —
// bu yüzden bağımlılık yönü TERSTİR: `packages/db`'nin iki yönlü drift testi
// (S6, `currency-i18n-consistency.test.ts`) BU modülü `@arkesoft/i18n`
// barrel'ından import eder, bu dosya hiçbir şekilde `packages/db`'yi bilmez.
//
// Kullanıcı onaylı kapsam (R1/R2/R3, pm): bu sürümün TEK içeriği TRY'dir;
// `en-US`'un içeriği ve döviz kuru (`ExchangeRate`) v1.5.0'a ERTELENDİ.
// Yeni bir para birimi eklemek `SUPPORTED_CURRENCY_CODES` VE
// `SUPPORTED_CURRENCIES` ikisine de satır eklemeyi gerektirir — `satisfies`
// bu ikisi arasındaki eksik/fazla anahtar TUTARSIZLIĞINI `tsc --noEmit`'te
// yakalar (precedent: `@arkesoft/errors`'ın `ERROR_MESSAGE_KEYS`'i).

import { z } from 'zod'

/** Desteklenen ISO 4217 kodlarının kapalı kümesi. */
const SUPPORTED_CURRENCY_CODES = ['TRY'] as const

/**
 * Dış dünyadan (bugün tüketicisi yok, A-T27-4 — `Currency`'nin okuyucusu
 * v0.4.0) gelecek bir para birimi kodunu doğrulamak için. CLAUDE.md §4:
 * dış veri Zod ile parse edilir, `as` ile zorlanmaz.
 */
export const supportedCurrencyCodeSchema = z.enum(SUPPORTED_CURRENCY_CODES)

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number]

export interface SupportedCurrency {
  readonly code: SupportedCurrencyCode
  /** Ondalık basamak sayısı — TRY için 2 (kuruş). */
  readonly minorUnit: number
}

/**
 * Kod → tanım eşlemesi. `satisfies Readonly<Record<SupportedCurrencyCode,
 * SupportedCurrency>>` hem EKSİK hem FAZLA anahtarı derleme zamanında
 * yakalar — `SUPPORTED_CURRENCY_CODES`'tan türeyen birleşimle tam eşleşmek
 * ZORUNDADIR.
 */
export const SUPPORTED_CURRENCIES = {
  TRY: { code: 'TRY', minorUnit: 2 },
} as const satisfies Readonly<Record<SupportedCurrencyCode, SupportedCurrency>>

/** Bilinen bir para birimi kodu için ondalık basamak sayısını döner. */
export function getMinorUnit(code: SupportedCurrencyCode): number {
  return SUPPORTED_CURRENCIES[code].minorUnit
}

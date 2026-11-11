// @arkesoft/api — toSessionSummary() (ROADMAP v0.0.15.1, T-017/FIX turu 1,
// solid gate M-2 bulgusu)
//
// `SessionsService.listOwnSessions()`'ın satır→DTO eşlemesini SAF bir
// fonksiyona çıkarır — solid gate'in turu 1 kararı AÇIKÇA SINIRLADI: "saf
// `toSessionSummary()` fonksiyonu, sınıf/factory DEĞİL" (Orkestratör'ün
// `SessionViewAssembler` önerisi REDDEDİLDİ). I/O yok, DI yok.
//
// ⚠⚠ HAM `userAgent` BURADAN DIŞARI SIZMAZ (ADR-0019 §Karar 8, S7/S8a'nın
// disiplini TAŞINDI): `row.userAgent`'ın TEK kullanım yeri
// `resolveDeviceFamilies(...)`'e GİRDİ olmaktır; dönen `SessionSummary`
// ham dizeyi ALAN OLARAK TAŞIMAZ. `{...row}` YAYMASI BİLEREK KULLANILMAZ —
// her alan adıyla TEK TEK seçilir.
//
// ⚠⚠ `'' → null` SENTİNEL EŞLEMESİ TEK NOKTADA, BURADA yapılır (eski yeri
// `sessions.service.ts`'in `rows.map` gövdesiydi — solid gate'in M-2
// bulgusu, "tekrarlanmaz" kararı buraya TAŞINDI): ESKİ satırlar (S6 öncesi)
// `ipAddress = ''` taşır, YENİ satırlar `resolveSessionIpAddressForCreateHook`
// (auth-instance.ts) sayesinde GERÇEK IP veya `null` taşır — İKİ farklı "yok"
// temsili (`''` VE `null`) OKUMA tarafında TEK bir temsile (`null`) indirilir.
// `packages/trpc` port adaptörü (`session-list-read.port.adapter.ts`) bu
// alanı OLDUĞU GİBİ taşır — İKİNCİ bir `'' → null` dönüşümü YAPMAZ (çift
// dönüşüm olurdu).
//
// Birim testi: `__tests__/session-summary-mapper.test.ts` — BEŞ vaka
// (`'' → null`, `null → null`, gerçek IP → KENDİSİ, `isCurrent` türetimi,
// ham `userAgent`'ın SIZMADIĞI) + `'' → null` eşlemesi kaldırılınca KIRMIZI
// verdiğinin mutasyon kanıtı (Task raporunda). Beşinci vaka (`userAgent`
// sızması) ÖZELLİKLE değerli: `{...row}` yayma varyantı `tsc --noEmit
// --strict` altında exit 0 verir (derleyici bu sızıntıyı YAKALAMAZ) —
// bu test SIZMAYA karşı TEK mekanik bekçidir.

import { resolveDeviceFamilies } from './device-label.js'
import type { SessionSummary } from './sessions.service.js'

/**
 * `SESSION_SUMMARY_SELECT`'in (`sessions.service.ts`) döndürdüğü ham satır
 * şekli — servis bu şekli Prisma'dan okur, bu modül onu YALNIZCA GİRDİ
 * olarak bilir (Prisma'ya bağımlılık YOK).
 */
export type SessionSummaryRow = {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly expiresAt: Date
  readonly ipAddress: string | null
  readonly userAgent: string | null
}

/**
 * Tek bir ham `session` satırını tel-öncesi {@link SessionSummary}'ye
 * çevirir. SAF — I/O yok, ham `userAgent`'ı döndürmez/loglamaz.
 *
 * @param row ham veritabanı satırı (bkz. {@link SessionSummaryRow}).
 * @param currentSessionId isteği yapan çerezin taşıdığı oturum kimliği —
 *   `row.id === currentSessionId` KARŞILAŞTIRMASI `isCurrent`'ı türetir.
 */
export function toSessionSummary(row: SessionSummaryRow, currentSessionId: string): SessionSummary {
  // `devices`'in tipi `resolveDeviceFamilies()`'in AÇIK dönüş tipinden
  // (`DeviceFamilies`, `device-label.ts`) ÇIKARILIR — burada ELLE tekrar
  // bildirilmez (solid gate T-017/FIX turu 2 bulgusu: elle kopya
  // `DeviceFamilies`'e üçüncü alan eklenirse SESSİZCE görünmez kalırdı).
  const devices = resolveDeviceFamilies(row.userAgent)

  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    // `''` (eski satır sentinel'i) → `null`; `null` (yeni satır, IP tespit
    // edilemedi) → `null`; gerçek IP → KENDİSİ.
    ipAddress: row.ipAddress === '' ? null : row.ipAddress,
    browserFamily: devices.browserFamily,
    osFamily: devices.osFamily,
    isCurrent: row.id === currentSessionId,
  }
}

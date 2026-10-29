// @arkesoft/api — kiracıdan muaf ama KİMLİKTEN muaf OLMAYAN kendi oturum
// uçlarımız (ROADMAP v0.0.5, T-006/S6, architect "tRPC SÖZLEŞMESİ" → HTTP
// sözleşmesi, bölüm B)
//
// Üç SABİT yol, path parametresi YOK (`sessionId` gövdede taşınır — AC9'un
// tam-eşleşme kümeleriyle değişken segmentli yol ifade EDİLEMEZ). Bu küme
// `TENANT_EXEMPT_PATHS`'te (S5 yazdı, literal) VAR ama `AUTH_EXEMPT_PATHS`'te
// (yukarıda) YOK — "kiracı gerekmez" ile "kimlik gerekmez" AYRIMININ somut
// kanıtı: panel host'unda (tenant exempt) oturum zorunlu kalır.
//
// Bu dosyanın TEK üretim tüketicisi `sessions.controller.ts`'in rota
// tanımlarıdır (Nest dekoratörleriyle AYRICA sabitlenir) — bu Set/fonksiyon
// çifti BİRİNCİL olarak İNCELEME GÖRÜNÜRLÜĞÜ (AC9) ve `auth-path-sets.test.ts`'in
// üçüncü (kesişim) testi İÇİNDİR.
//
// FIX turu 1, madde 11 (solid M-1) — yol normalizasyonu ARTIK ortak
// `http/normalize-request-path.ts`'ten İTHAL EDİLİR.

import { normalizeRequestPath } from '../http/normalize-request-path.js'

/** Kiracıdan muaf, kimlikten muaf OLMAYAN, tam eşleşmeli üç uç. */
export const AUTH_OWN_PATHS: ReadonlySet<string> = new Set([
  '/auth/sessions',
  '/auth/sessions/revoke',
  '/auth/sessions/revoke-all',
])

/**
 * Bir istek URL'sinin {@link AUTH_OWN_PATHS}'teki bir yolla TAM eşleşip
 * eşleşmediğini belirler — `tenant-exempt-paths.ts`/`auth-exempt-paths.ts`
 * ile BİREBİR AYNI normalizasyon.
 */
export function isAuthOwnPath(rawUrl: string): boolean {
  return AUTH_OWN_PATHS.has(normalizeRequestPath(rawUrl))
}

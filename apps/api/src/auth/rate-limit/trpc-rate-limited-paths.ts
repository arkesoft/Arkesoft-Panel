// @arkesoft/api — oran sınırlı tRPC yolları: ÜÇÜNCÜ yol kümesi (ROADMAP
// v0.1.0, T-019/S9a, architect F15, ADR-0021 §2 koşul E)
//
// `rate-limit.policy.ts`'in `buildPolicy` yazım-hatası guard'ı
// `AUTH_DELEGATED_PATHS` VEYA `AUTH_OWN_PATHS` üyeliğini MODÜL YÜKLENİRKEN
// zorunlu kılıyordu (`:152-161`) — `registration.*` ikisinin de üyesi
// DEĞİLDİR (Better Auth'a delege EDİLMEZ, kendi oturum ucumuz da DEĞİLDİR;
// tRPC prosedürüdür). Bu yüzden ÜÇÜNCÜ, bağımsız bir yol kümesi gerekiyor —
// bu dosya O kümedir.
//
// ⚠ Yalnızca İKİ rota (`checkSlugAvailability`/`createTenant`) — `registration.
// onboardingChecklist` BİLEREK YOK: ADR-0021 §3 koşul E tablosu onu "2 okuma;
// slug zaten herkese açık" ile işaretler, oran sınırı ZORUNLU KILMAZ (girdi
// zaten üye olduğu bilinen bir kiracıya aittir, numaralandırma/üretme yüzeyi
// DEĞİLDİR — `checkSlugAvailability`/`createTenant`'ın tersine).
//
// `routeKey` biçimi `"METHOD /path"` — tRPC'nin fetch adaptörü QUERY
// prosedürlerini (`checkSlugAvailability`) `GET` ile, MUTATION'ları
// (`createTenant`) `POST` ile taşır (`@trpc/server/adapters/fetch`'in
// varsayılan davranışı, `methodOverride` BU PAKETTE KULLANILMAZ).
//
// Yol normalizasyonu `AUTH_OWN_PATHS`/`AUTH_DELEGATED_PATHS` ile BİREBİR
// aynı ortak `http/normalize-request-path.ts`'ten gelir.

import { normalizeRequestPath } from '../../http/normalize-request-path.js'

/** Oran sınırlı İKİ tRPC yolu (yöntemsiz, salt yol — `AUTH_OWN_PATHS` deseni). */
export const TRPC_RATE_LIMITED_PATHS: ReadonlySet<string> = new Set([
  '/trpc/registration.checkSlugAvailability',
  '/trpc/registration.createTenant',
])

/**
 * Bir istek URL'sinin {@link TRPC_RATE_LIMITED_PATHS}'teki bir yolla TAM
 * eşleşip eşleşmediğini belirler — `isAuthOwnPath`/`isAuthDelegatedPath` ile
 * BİREBİR aynı normalizasyon.
 */
export function isTrpcRateLimitedPath(rawUrl: string): boolean {
  return TRPC_RATE_LIMITED_PATHS.has(normalizeRequestPath(rawUrl))
}

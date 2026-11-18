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
// T-019 gate tur1 düzeltmesi (security, medium) — ÜÇ rota
// (`checkSlugAvailability`/`createTenant`/`onboardingChecklist`). ÖNCEKİ
// yorum `onboardingChecklist`'in BİLEREK DIŞARIDA bırakıldığını, girdinin
// "zaten üye olduğu bilinen bir kiracıya ait" olduğunu ve bu yüzden
// numaralandırma yüzeyi OLMADIĞINI iddia ediyordu — ÖLÇÜLEREK YANLIŞ
// bulundu: `onboardingChecklist`'in girdisi (`slug`) SALDIRGAN
// KONTROLÜNDEDİR (`registration.service.ts`'in `onboardingChecklist`'i)
// ve prosedür ÜYE OLUNMAYAN slug'ları da (hatta HİÇ var olmayan slug'ları
// da) kabul edip AYNI 404'e indirger — "üyelik ÖNCEDEN bilinir" varsayımı
// YANLIŞTIR, çağıran istediği HERHANGİ bir slug'ı deneyebilir. Bu onu TAM
// OLARAK `checkSlugAvailability`/`createTenant` İLE AYNI numaralandırma
// sınıfına koyar — oran sınırına BAĞLANMAMASI, ücretsiz TEK hesabın
// SINIRSIZ sonda çekmesine izin verirdi (ayrıca iki ret yolu — "slug yok"
// vs "slug var ama üye değil" — FARKLI iş yaptığı için ZAMANLAMA ORACLE'I
// riski taşır; bu dosyadaki değişiklik bu riski AZALTIR, ORTADAN
// KALDIRMAZ — `registration.service.ts`'in sahiplik-doğrulama SIRASI
// `perf` gate'in korunmasını istediği bir invaryant olduğu için YENİDEN
// SIRALANMADI, kalıntı risk olarak backend T-019 gate tur1 raporunda
// kayıtlı).
//
// `routeKey` biçimi `"METHOD /path"` — tRPC'nin fetch adaptörü QUERY
// prosedürlerini (`checkSlugAvailability`/`onboardingChecklist`) `GET` ile,
// MUTATION'ları (`createTenant`) `POST` ile taşır (`@trpc/server/adapters/
// fetch`'in varsayılan davranışı, `methodOverride` BU PAKETTE
// KULLANILMAZ).
//
// Yol normalizasyonu `AUTH_OWN_PATHS`/`AUTH_DELEGATED_PATHS` ile BİREBİR
// aynı ortak `http/normalize-request-path.ts`'ten gelir.

import { normalizeRequestPath } from '../../http/normalize-request-path.js'

/** Oran sınırlı ÜÇ tRPC yolu (yöntemsiz, salt yol — `AUTH_OWN_PATHS` deseni). */
export const TRPC_RATE_LIMITED_PATHS: ReadonlySet<string> = new Set([
  '/trpc/registration.checkSlugAvailability',
  '/trpc/registration.createTenant',
  '/trpc/registration.onboardingChecklist',
])

/**
 * Bir istek URL'sinin {@link TRPC_RATE_LIMITED_PATHS}'teki bir yolla TAM
 * eşleşip eşleşmediğini belirler — `isAuthOwnPath`/`isAuthDelegatedPath` ile
 * BİREBİR aynı normalizasyon.
 */
export function isTrpcRateLimitedPath(rawUrl: string): boolean {
  return TRPC_RATE_LIMITED_PATHS.has(normalizeRequestPath(rawUrl))
}

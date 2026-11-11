// @arkesoft/api — SENSITIVE_OPERATIONS: step-up (yeniden kimlik doğrulama)
// gerektiren hassas işlemlerin TEK kataloğu (ROADMAP v0.0.15.1, T-017/S5,
// ADR-0019 §Karar 6)
//
// Hassas işlemler dağınık koşul bloklarıyla DEĞİL, bu TEK kataloğa karşı
// mekanik kapılarla doğrulanır (ADR-0018 Ek'teki "altı ayna, dördü
// korumasız" sınıfının BİR DAHA doğmaması için, ADR-0019 §Karar 6):
//
//   (a) modül YÜKLENİRKEN — her değer `AUTH_DELEGATED_PATHS`'TE (tam
//       eşleşme) VEYA `AUTH_OWN_PATHS`'TE (yöntemi SOYULMUŞ hali) olmak
//       ZORUNDA; yazım hatası modülü YÜKLENEMEZ yapar — `rate-limit.
//       policy.ts`'in `buildPolicy()` guard'ıyla AYNI desen (T-017/S1, K1).
//   (b) modül YÜKLENİRKEN — her değer `resolveRateLimitPolicy()`'den
//       (`rate-limit.policy.ts`'in TEK dışa açık sorgu fonksiyonu) TANIMLI
//       bir politika döndürmek ZORUNDA; korumasız bırakılan bir hassas
//       işlem modülü YÜKLENEMEZ yapar. Bu, ADR-0018 Ek'in "altı ayna, dördü
//       korumasız" sınıfını MEKANİK olarak kapatır.
//
// (c) — kataloğu gezen TABLO SÜRÜMLÜ, gerçek-istek (altı uç) testi — S8b'nin
// işi, bu dosyanın KAPSAMI DIŞINDA.
//
// ⚠ ÖLÇÜM (handoff'un varsayımıyla ÇELİŞİYOR, raporlanmıştır): `rate-limit.
// policy.ts`'in `pathOf()` yardımcısı VE `RATE_LIMITED_ROUTES` Map'i dışa
// AÇIK (export) DEĞİL — `grep -n "^export" rate-limit.policy.ts` bunu
// SADECE üç tip + `resolveRateLimitPolicy` için doğruluyor. Bu yüzden:
//   - (b) kapısı `RATE_LIMITED_ROUTES`'u DOĞRUDAN OKUMAZ (okuyamaz);
//     dosyanın dışa açık TEK sorgu yüzeyini (`resolveRateLimitPolicy`)
//     çağırır — S1'in politika tablosunu İKİNCİ bir yerde YENİDEN
//     TANIMLAMAK (gerçek bir "ikinci ayna") yerine, TEK kaynağı sorgular.
//   - `pathOf` kopyalanmadı. Bu dosyanın `splitRouteKey()`'i `pathOf` İLE
//     AYNI İŞİ (routeKey'i yöntem+yol olarak ayırma) yapar, ama bu modülün
//     KENDİ iki tüketicisi (`AUTH_OWN_PATHS.has(path)` VE
//     `resolveRateLimitPolicy(method, path)` — ikisi de yöntem/yolu AYRI
//     parametre ister) için ZORUNLU bir ayrıştırmadır; `pathOf`'u
//     ithal ETMEK mümkün olsaydı bu fonksiyon GEREKMEZDİ. Orkestratöre
//     raporlanmıştır: S1'e `pathOf`'u dışa açması için küçük bir ek tur
//     önerilir — bu dosya o turu BEKLEMEDEN ilerler (kopyalama DEĞİL,
//     ileride dedup edilebilir, bağımsız bir yardımcı).

import { AUTH_DELEGATED_PATHS } from '../auth-delegated-paths.js'
import { AUTH_OWN_PATHS } from '../auth-own-paths.js'
import { resolveRateLimitPolicy } from '../rate-limit/rate-limit.policy.js'

/**
 * `"METHOD /path"` routeKey'ini (yöntem, yol) çiftine ayırır — dosya başı
 * yorumunun "ÖLÇÜM" notuna bkz: `pathOf`'un kopyası DEĞİL, bu modülün kendi
 * iki tüketicisi için gereken bağımsız bir ayrıştırma.
 */
function splitRouteKey(routeKey: string): { readonly method: string; readonly path: string } {
  const spaceIndex = routeKey.indexOf(' ')
  if (spaceIndex === -1) {
    throw new Error(`sensitive-operations.ts: "${routeKey}" bir yöntem İÇERMİYOR (boşluk yok)`)
  }
  return { method: routeKey.slice(0, spaceIndex), path: routeKey.slice(spaceIndex + 1) }
}

/**
 * Step-up (yeniden kimlik doğrulama) gerektiren altı hassas işlem. Değerler
 * `"METHOD /path"` biçiminde gerçek rota anahtarlarıdır — büyütmek bu
 * dosyayı DEĞİŞTİRMEYİ gerektirir (inceleme görünürlüğü, `rate-limit.
 * policy.ts`'in AYNI disiplini).
 *
 * ⚠⚠ `/auth/verify-password` BURAYA EKLENMEZ (ADR-0019 §Karar 4, bağlayıcı):
 * o uç `AUTH_DELEGATED_PATHS`'TE YOK, yalnızca programatik erişilebilir
 * (`StepUpService`, `auth.api.verifyPassword`) — HTTP'den erişilebilir bir
 * "parolamı doğrula" ucu bir parola oracle'ı olurdu.
 */
export const SENSITIVE_OPERATIONS = {
  'session.revoke': 'POST /auth/sessions/revoke',
  'session.revokeAll': 'POST /auth/sessions/revoke-all',
  'twoFactor.enable': 'POST /auth/two-factor/enable',
  'twoFactor.disable': 'POST /auth/two-factor/disable',
  'twoFactor.getTotpUri': 'POST /auth/two-factor/get-totp-uri',
  'twoFactor.generateBackupCodes': 'POST /auth/two-factor/generate-backup-codes',
} as const satisfies Readonly<Record<string, string>>

export type SensitiveOperation = keyof typeof SENSITIVE_OPERATIONS

// --- Kapı (a) — modül YÜKLENİRKEN: bilinen bir rotaya karşılık geliyor mu? -
for (const [operation, routeKey] of Object.entries(SENSITIVE_OPERATIONS)) {
  const { path } = splitRouteKey(routeKey)
  if (!AUTH_DELEGATED_PATHS.has(routeKey) && !AUTH_OWN_PATHS.has(path)) {
    // Mekanik kanıt: "${operation}" için yazılan routeKey'in ne delege
    // edilen ne kendi uçlarımızın kümesinde olmadığı (yazım hatası dahil)
    // modül bu satırda YÜKLENEMEZ yapar.
    throw new Error(
      `sensitive-operations.ts: "${operation}" → "${routeKey}" ne AUTH_DELEGATED_PATHS ne AUTH_OWN_PATHS içinde (yazım hatası olabilir)`,
    )
  }
}

// --- Kapı (b) — modül YÜKLENİRKEN: oran sınırı kataloğunda KORUNUYOR mu? --
for (const [operation, routeKey] of Object.entries(SENSITIVE_OPERATIONS)) {
  const { method, path } = splitRouteKey(routeKey)
  if (resolveRateLimitPolicy(method, path) === undefined) {
    // Mekanik kanıt (ADR-0019 §Karar 6/b): "${operation}" hassas işlemi
    // `RATE_LIMITED_ROUTES`'ta YOKSA modül bu satırda YÜKLENEMEZ yapar —
    // korumasız bırakılan bir hassas işlem artık test KIRMIZISI üretir.
    throw new Error(
      `sensitive-operations.ts: "${operation}" ("${routeKey}") RATE_LIMITED_ROUTES içinde YOK — bu hassas işlem KORUMASIZ kalır`,
    )
  }
}

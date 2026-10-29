// @arkesoft/api — oran sınırlama POLİTİKASI: SAF modül (ROADMAP v0.0.5,
// T-006/S8, architect "ENV ŞEMASI" → "EŞİKLER ENV'DE DEĞİL", AC7 "eşik
// gevşetilemez")
//
// ⚠ BU DOSYA `process.env`/`ApiEnv` OKUMAZ — mekanik kanıt (DoD §3):
// `grep -nE 'process\.env|ApiEnv' rate-limit.policy.ts` → 0 satır. `5/20/3/10`
// eşikleri burada MODÜL SABİTİ. Pencere SÜRELERİ (saniye) BURADA YOK —
// `rate-limit.guard.ts` `ApiEnv`'den okur ve `RateLimitWindowKind`'e göre
// hangi env değişkenini kullanacağını SEÇER; bu dosya o seçimi YAPMAZ,
// SEÇENEĞİ (etiketi) adlandırır.
//
// S5'in A-G6 düzeltmesi (bağlayıcı, S8 handoff §1): gerçek Better Auth uç
// adı `POST /auth/request-password-reset`'tir, architect'in "HATA
// SINIFLARI"/"K3" metninde yazdığı `forget-password` DEĞİL. Bu yazım
// hatasının bir daha SESSİZCE tekrarlanmaması için dört rotanın anahtarı
// `AUTH_DELEGATED_PATHS`'E KARŞI MODÜL YÜKLENİRKEN doğrulanır (`buildPolicy`)
// — sapma varsa FIRLATILIR; literal kopyalanıp doğrulanmadan BIRAKILMAZ.

import { AUTH_DELEGATED_PATHS } from '../auth-delegated-paths.js'
// FIX turu 1, madde 11 (solid M-1) — yol normalizasyonu ARTIK ortak
// `http/normalize-request-path.ts`'ten İTHAL EDİLİR.
import { normalizeRequestPath } from '../../http/normalize-request-path.js'

/**
 * Hangi env penceresinin (`rate-limit.guard.ts` → `AUTH_LOGIN_RATE_WINDOW_SECONDS`
 * / `AUTH_RESET_RATE_WINDOW_SECONDS`) kullanılacağını ADLANDIRIR — SEÇİM
 * burada YAPILMAZ, okuyucu (guard) `ApiEnv`'den okur.
 */
export type RateLimitWindowKind = 'login' | 'reset'

export type RateLimitPolicy = {
  readonly routeKey: string
  readonly windowKind: RateLimitWindowKind
  readonly accountLimit: number
  readonly ipLimit: number
  /** K3 — "başarılı giriş hesap sayacını SIFIRLAR" (yalnızca giriş ucunda `true`). */
  readonly resetAccountOnSuccess: boolean
}

// --- K3 eşikleri — MODÜL SABİTİ, env'den OKUNMAZ, GEVŞETİLEMEZ (AC7) -------

/** Giriş: hesap başına 5 başarısız / 15 dk. */
const LOGIN_ACCOUNT_LIMIT = 5
/**
 * Giriş: IP başına 20 deneme / 15 dk. K3'ün metni "20 BAŞARISIZ" diyor; FIX
 * turu 1 (solid M-6) bunu ÖLÇTÜ — gerçek davranış "20 DENEME"dir (başarılı
 * girişler de sayılır, SIFIRLANMAZ). BİLİNÇLİ: `rate-limit.guard.ts` dosya
 * başı yorumu — hesap sayacının tersine, IP sayacını başarıda sıfırlamak
 * paylaşılan IP'de bir saldırganın KENDİ hesabıyla ara sıra giriş yaparak
 * sınırı sıfırlamasına (kurbana karşı sınırsız deneme) izin verirdi.
 */
const LOGIN_IP_LIMIT = 20
/** Şifre sıfırlama VE onaylı genişletme (kayıt, doğrulama e-postası): e-posta başına 3/saat. */
const EMAIL_ACCOUNT_LIMIT = 3
/** Şifre sıfırlama VE onaylı genişletme: IP başına 10/saat. */
const EMAIL_IP_LIMIT = 10

function buildPolicy(
  routeKey: string,
  windowKind: RateLimitWindowKind,
  accountLimit: number,
  ipLimit: number,
  resetAccountOnSuccess: boolean,
): readonly [string, RateLimitPolicy] {
  if (!AUTH_DELEGATED_PATHS.has(routeKey)) {
    // Mekanik kanıt: architect'in "forget-password" yazım hatasının bir daha
    // SESSİZCE tekrarlanamayacağının GARANTİSİ — modül bu satırda YÜKLENEMEZ.
    throw new Error(
      `rate-limit.policy.ts: "${routeKey}" AUTH_DELEGATED_PATHS içinde yok (yazım hatası olabilir)`,
    )
  }

  return [routeKey, { routeKey, windowKind, accountLimit, ipLimit, resetAccountOnSuccess }]
}

const RATE_LIMITED_ROUTES: ReadonlyMap<string, RateLimitPolicy> = new Map([
  buildPolicy('POST /auth/sign-in/email', 'login', LOGIN_ACCOUNT_LIMIT, LOGIN_IP_LIMIT, true),
  buildPolicy(
    'POST /auth/request-password-reset',
    'reset',
    EMAIL_ACCOUNT_LIMIT,
    EMAIL_IP_LIMIT,
    false,
  ),
  // Kullanıcı onaylı KAPSAM GENİŞLETMESİ (2026-10-29, architect riski 7):
  // ikisi de e-posta GÖNDERİYOR → mail bombing + SMTP itibar kaybı riski.
  // Şifre sıfırlamanın AYNI eşikleri (3/saat hesap, 10/saat IP) kullanılır.
  buildPolicy('POST /auth/sign-up/email', 'reset', EMAIL_ACCOUNT_LIMIT, EMAIL_IP_LIMIT, false),
  buildPolicy(
    'POST /auth/send-verification-email',
    'reset',
    EMAIL_ACCOUNT_LIMIT,
    EMAIL_IP_LIMIT,
    false,
  ),
])

/**
 * İsteğin oran sınırlı dört rotadan birine ait olup olmadığını belirler.
 * Normalizasyon `auth-delegated-paths.ts`'in `isAuthDelegatedPath`'iyle
 * BİREBİR aynı (sondaki `/` soyulur, sorgu dizesi/fragman karışmaz,
 * büyük/küçük harf DUYARLI, metot büyük/küçük harf DUYARSIZ).
 */
export function resolveRateLimitPolicy(
  method: string,
  rawUrl: string,
): RateLimitPolicy | undefined {
  const normalizedPathname = normalizeRequestPath(rawUrl)

  return RATE_LIMITED_ROUTES.get(`${method.toUpperCase()} ${normalizedPathname}`)
}

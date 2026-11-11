// @arkesoft/api — Better Auth örneği fabrikası (ROADMAP v0.0.5, T-006/S5,
// architect "Kullanıcı kararları" madde 1, "Çerez", "HATA SINIFLARI",
// "LOG DESENİ")
//
// Nest DI'dan BAĞIMSIZ, SAF fabrika — `AuthModule` bunu `useFactory` içinde
// çağırır. Kurulum kararları:
//
// - **`cookieCache.enabled: false` ZORUNLU** (A-G8): açık olsa iptal edilmiş
//   oturum cache ömrü boyunca geçerli kalır ve AC6'nın "o çerez artık 401"
//   maddesi SAHTE YEŞİL verir.
// - **`advanced.ipAddress.disableIpTracking: true`** (K6/KVKK): `ipAddress`/
//   `userAgent` kolonları şemada VAR ama DOLDURULMAZ.
// - **Çerez:** `HttpOnly` + `SameSite=Lax` (`defaultCookieAttributes`),
//   `Secure` yalnızca `env.NODE_ENV === 'production'`'da (`useSecureCookies`
//   — Better Auth'un KENDİ `process.env.NODE_ENV` otomatik tespitine
//   GÜVENİLMEDİ: testler `ApiEnv`'i DI üzerinden override eder, gerçek
//   `process.env.NODE_ENV` DEĞİŞMEZ — K-A3/K-A4'ün "process.env'e asla
//   dokunma" ruhu burada da geçerli), `Domain` (`crossSubDomainCookies`).
// - **FIX turu 1, madde 6 (F4, medium) — `disableOriginCheck`/
//   `disableCSRFCheck` artık `useSecureCookies` İLE AYNI DESENDE, AÇIKÇA
//   `env.NODE_ENV`'den türetiliyor.** ÖNCEKİ DURUM: bu alanlar hiç
//   TANIMLANMIYORDU → Better Auth kendi `isTest()` yardımcısına (ham
//   `process.env.NODE_ENV`, `@better-auth/core/env`) DÜŞÜYORDU —
//   `useSecureCookies`'in BİLEREK güvenmediği TAM mekanizma. Sonuç:
//   `apiEnv.NODE_ENV` override'ı (ör. AC4(d)'nin `production` test
//   uygulaması) `useSecureCookies`'i DOĞRU etkiliyordu ama origin/CSRF
//   kontrolünü HİÇ ETKİLEMİYORDU — iki güvenlik kararı AYNI değişkenden
//   TUTARSIZ besleniyordu. Bugün `process.env.NODE_ENV` vitest altında
//   HER ZAMAN `'test'` (vite'ın kendi bootstrap'ı, `.env`'in
//   `NODE_ENV=development`'ı ÖNCESİNDE kurulur — Node'un `loadEnvFile`'ı
//   VAR OLAN değişkeni EZMEZ) → `BASE_ENV.NODE_ENV` de `'test'`'tir, bu
//   yüzden bu değişiklik MEVCUT test davranışını KORUR (hâlâ devre dışı);
//   yalnızca `apiEnv.NODE_ENV`'i AÇIKÇA başka bir değere override eden
//   testler (yeni F4 pin'i dahil) ARTIK GERÇEKTEN enforce edilen bir
//   kontrol GÖRÜR.
// - **`rateLimit.enabled: false`:** Better Auth'un KENDİ (bellek içi, tek
//   süreç) oran sınırlayıcısı DEVRE DIŞI — gerçek politika S8'in Redis
//   tabanlı, PLATFORM kapsamlı (`platform:auth:`) guard'ındadır. İki ayrı,
//   koordinesiz eşik AYNI anda çalışmasın (architect K3'ün eşikleri BURADA
//   değil, `rate-limit.policy.ts`'te modül sabiti).
// - **ROADMAP v0.0.15.1 (T-017/S6) — IP YAZIMI.** `advanced.ipAddress.
//   disableIpTracking: true` (ALTINDA, DEĞİŞMEDİ — K6/KVKK'nın "Better
//   Auth'un KENDİ IP mekanizmasına GÜVENME" kararı duruyor) Better Auth'un
//   KENDİ `internal-adapter.mjs`'inin (ÖLÇÜLDÜ, `getIP(...) || ''`,
//   `disableIpTracking` → `getIP` HER ZAMAN `null`) HER `session.create`
//   çağrısına yazdığı `''`'yi BİLEREK üretir — `databaseHooks.session.
//   create.before` (ALTTA) bu `''`'yi `RequestContext.client.ip` İLE EZER
//   (`db/with-hooks.mjs:19-22`, ÖLÇÜLDÜ: `actualData = {...actualData,
//   ...result.data}` → BİZİM değerimiz KAZANIR, kütüphanenin `''`'si
//   KAYBOLUR). KULLANICI KARARI (2026-11-09, ÜÇ KEZ onaylandı): IP TAM
//   saklanır, SAHİBİNE tam gösterilir, ASLA loglanmaz — bayrak `true` KALIR,
//   IP BİZİM kaynağımızdan (`request-context.middleware.ts`'in
//   `resolveClientIp`/`AUTH_TRUSTED_PROXY_COUNT` çözümü, `AuditLog.ip`'nin
//   DE tükettiği TEK kaynak) yazılır. Kütüphanenin KENDİ IP'si BEŞ ÖLÇÜMLE
//   ELENDİ: `DEFAULT_IP_HEADERS = ['x-forwarded-for']` sokete HİÇ düşmüyor;
//   vekil yapılandırması OLMADAN tek-değerli XFF KOŞULSUZ güvenilir (istemci
//   kendi IP'sini UYDURABİLİR); `trustedProxies` CIDR ↔ bizim HOP SAYISI
//   semantiği UYUMSUZ; IPv6 /64'e KIRPILIYOR ↔ "tam saklanır" İHLALİ;
//   `isTest() || isDevelopment() → '127.0.0.1'` SAHTE YEŞİL verir.
//   `clientIp === null` (`UNKNOWN_IP` sentinel'inin `RequestContextMiddleware`
//   TARAFINDAN eşlendiği "tespit edilemedi" durumu) → `null` YAZILIR, `''`
//   DEĞİL (`resolveSessionIpAddressForCreateHook`'un dosya içi yorumu,
//   altta — gerekçe: `Session.ipAddress` NULLABLE'dır TAM BUNUN İÇİN).
// - **Better Auth'un KENDİ logger'ı pino'ya bağlanır** (CLAUDE.md §4
//   `console.*` yasağı — kütüphane kendi başına konsola yazmaz).
//   FIX turu 1, madde 2 (F2, high) — `error` seviyesinde pozisyonel
//   `args[0]`'ı ARTIK TAMAMEN atlamıyoruz (önceki karar — "sır sızıntısı
//   riski" — AC8'i YANLIŞ okumuştu: AC8 ham SIR'ların, parola/token/çerezin
//   loglanmamasını ister, "hiçbir hata DETAYI" loglanmasın demez). ÖLÇÜLDÜ
//   (`better-auth@1.7.14`,
//   `node_modules/.pnpm/@better-auth+core@*/dist/env/logger.mjs:68`):
//   kütüphane `options.log(level, message, ...args)` çağırır, `args[0]`
//   `create-context.mjs:219/223`'ün `runInBackgroundOrAwait`'inde
//   `logger.error("Failed to run background task:", e)` ile BİZE geçirilen
//   ham HATA NESNESİDİR (ör. `MailDeliveryFailedError`/SMTP bağlantı hatası)
//   — `message` string'i TEK BAŞINA "işlem başarısız" der, SEBEBİ TAŞIMAZ.
//   ÖLÇÜLMÜŞ SAPMA (docs'a taşınmalı): `runInBackgroundOrAwait`
//   (`create-context.mjs:215-226`) bu hatayı HİÇBİR YAPILANDIRMAYLA (bu
//   katman da dahil) YUKARI FIRLATMAZ — `advanced.backgroundTasks.handler`
//   tanımlı OLSA DA kütüphane hatayı handler'a vermeden ÖNCE kendi içinde
//   `.catch()` ile yutar (ÖLÇÜLDÜ, kaynak okuması). Yani mail gönderimi
//   başarısız olsa bile `/auth/sign-up/email`/`/auth/request-password-reset`
//   isteği YİNE 2xx döner — architect'in "503" tasarım iddiası bu kütüphane
//   sürümünde YAPISAL OLARAK gerçekleştirilemez (senkron gönderimi Better
//   Auth'un kendi hook zincirinden TAMAMEN çıkarmak gerekir, bu T-006'nın
//   FIX turu kapsamını aşan bir mimari değişikliktir).
//
//   **FIX turu 2, madde 1 (security tur2 S-2, `high` — bu REGRESYONU FIX
//   turu 1'in KENDİSİ açtı):** `describeBetterAuthLogCause()`'un ÖNCEKİ hâli
//   `args[0]`'ın (`AppError` İSE) `.cause`'una `extractErrorMessage()` ile
//   iniyor ve o SERBEST METNİ `causeMessage` alanına OLDUĞU GİBİ koyuyordu.
//   ÖLÇÜLDÜ (security tur2, gerçek SMTP sunucusu alıcıyı `550` ile reddetti):
//   nodemailer'ın "alıcı reddedildi" hatasının `.message`'ı kullanıcının TAM
//   e-posta adresini TAŞIR (`Can't send mail - all recipients were
//   rejected: 550 5.1.1 <adres>: ...`) — bu metin pino'ya HAM yazılıyordu,
//   `PINO_REDACT_PATHS` YOL TABANLI olduğu için serbest metin İÇİNDEKİ
//   adresi YAKALAYAMAZ. AC8 "tam e-posta yok" maddesini doğrudan ihlal
//   ediyordu.
//
//   **SEÇİLEN YOL — ALLOWLIST, serbest metin HİÇ loglanmaz (security tur2'nin
//   "tercih edilen düzeltme"si):** `causeMessage` İÇERİK düzeyinde maskelemek
//   (`maskEmail()` deseni serbest metin içinde arama) YERİNE, bu kanaldan
//   HİÇBİR serbest metin GEÇİRİLMEZ — gerekçe: e-posta dışında başka PII/sır
//   (kimlik bilgisi, host adı, dahili dosya yolu) da aynı kanala GÖMÜLÜ
//   olabilir (ör. `535 ... authentication failed` bir üretim SMTP'sinin
//   kimlik bilgisi hatası taşıyabilir — bugün `SMTP_USER`/`SMTP_PASSWORD`
//   YOK, Mailpit auth istemiyor, ama ilk gerçek sağlayıcıda bu YENİ bir
//   risk sınıfı olurdu); maskeleme yalnızca BİLİNEN bir deseni (e-posta)
//   yakalar, bilinmeyeni KAÇIRABİLİR. `describeBetterAuthLogCause()` artık
//   `causeCode` (`AppError.code`) + `causeClassName`
//   (`cause.constructor.name` — ör. `'Error'`/`'AggregateError'`, SERBEST
//   METİN DEĞİL) + nodemailer'ın YAPILANDIRILMIŞ, enum benzeri iki alanını
//   (`providerErrorCode`/`providerResponseCode` — ör. `'EENVELOPE'`/`550`,
//   SMTP yanıt KODU, alıcı adresi DEĞİL) döner. Hiçbir `.message`/`.stack`
//   okunmaz. `extractErrorMessage`'ın `AggregateError`-farkında genel
//   versiyonu (`errors/describe-error-cause.ts`, solid tur2 M-2) BURADA
//   KULLANILMAZ — o helper'ın KENDİ dosya başı yorumu bunu AÇIKÇA yasaklar
//   (üçüncü taraf serbest metin için GÜVENSİZ).
//   AC8'in log yakalama testine BU vaka (teslim hatası → ham adres YOK)
//   `auth-secret-leak.test.ts`'e EKLENDİ.
//
//   Bu satırların sağladığı asgari ama gerçek iyileştirme: arıza artık
//   OPERATÖR tarafından pino'da `causeCode`/`causeClassName`/
//   `providerErrorCode`/`providerResponseCode` ile GÖRÜNÜR — serbest metin
//   OLMADAN "hangi sınıf hata, hangi SMTP yanıt kodu" bilgisi YETERLİDİR.
//
//   **FIX turu 2, madde 4 (security/qa tur2 S-5) — `requestId`/`userId`
//   korelasyonu:** olay logları (`kullanıcı kaydı oluşturuldu`/`giriş
//   başarılı`/`oturum sonlandırıldı`/`e-posta gönderildi`) ÖNCESİ bu
//   fabrikaya ENJEKTE edilen KÖK `logger`'ı kullanıyordu — `requestId`
//   TAŞIMIYORDU (ÖLÇÜLDÜ). Better Auth'un `databaseHooks`/mail gönderim
//   çağrıları AYNI isteğin ALS (AsyncLocalStorage) bağlamında, DETACHED
//   OLMADAN koşar (`runInBackgroundOrAwait`'in `else await promise` dalı —
//   arka plan İŞİ DEĞİL, isteğin kendi await zincirinin bir parçası); bu
//   yüzden `resolveEventLogger()` `tryGetRequestContext()?.logger` okur
//   (bağlam yoksa — ör. ileride bir programatik/HTTP-dışı çağrı — enjekte
//   edilen kök logger'a FAIL-SOFT düşer, log SATIRI hiçbir zaman İSTEĞİN
//   KENDİSİNİ KIRMAZ). `session.create.after` (giriş başarılı) AYRICA
//   `context.logger = context.logger.child({ userId })` ile BAĞLAR —
//   `/auth/sign-in/email` `AUTH_EXEMPT_PATHS`'te olduğu için
//   `AuthContextMiddleware` bu alanı hiç YAZMAMIŞTI (K7'nin "kimlik
//   zorunlu değil" muafiyeti "kimlik BİLİNMESİN" demek DEĞİLDİR) — bu
//   satırdan SONRA isteğin `istek tamamlandı` özet satırı DA (`RequestLoggingInterceptor`,
//   `'finish'`'te OKUR) `userId` TAŞIR.

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api'
import type { AuthMiddleware } from 'better-auth/api'
import { twoFactor } from 'better-auth/plugins/two-factor'
import type { Auth, BetterAuthOptions } from 'better-auth'
import type { AuthPrismaDatabase } from '@arkesoft/db'
import { AppError, maskEmail } from '@arkesoft/errors'
import type { Logger as PinoLogger } from 'pino'

import type { ApiEnv } from '../config/api-env.js'
import { tryGetRequestContext } from '../request-context/request-context.accessors.js'
import { AUTH_BASE_PATH } from './auth-delegated-paths.js'
import type { MailTransport } from './mail/mail-transport.types.js'
import { renderMailMessage } from './mail/messages.js'
import type { MailMessageKey } from './mail/messages.js'
import {
  ACCOUNT_LOCKOUT_DURATION_SECONDS,
  ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS,
} from './two-factor/account-lockout.constants.js'

export type CreateAuthInstanceOptions = {
  readonly env: ApiEnv
  readonly prismaClient: AuthPrismaDatabase
  readonly mailTransport: MailTransport
  readonly logger: PinoLogger
}

/** `advanced.crossSubDomainCookies.domain` — geri alma kolu (`AUTH_COOKIE_DOMAIN`) öncelikli. */
function resolveCookieDomain(env: ApiEnv): string {
  return env.AUTH_COOKIE_DOMAIN ?? `.${env.APP_BASE_DOMAIN}`
}

/**
 * Doğrulama/sıfırlama bağlantısını KENDİMİZ kurarız — Better Auth'un ÜRETTİĞİ
 * `data.url`'i KULLANMAYIZ (architect, `auth-delegated-paths.ts` dosya başı
 * yorumu: `GET /reset-password/:token` callback'i allowlist'te YOK). `token`
 * doğrudan sorgu parametresi olarak taşınır — S4'ün Mailpit okuyucusu
 * (`extractQueryParam`) bunu AC4(b)'de bu şekilde doğrular.
 */
function buildAuthLinkUrl(baseUrl: string, path: string, token: string): string {
  const url = new URL(path, baseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

/**
 * FIX turu 2, madde 4 (security/qa tur2 S-5, dosya başı yorumu) — olay
 * logları için istek-kapsamlı (`requestId` bağlamalı) logger'ı DENER;
 * ALS bağlamı yoksa (ör. ileride bir HTTP-dışı çağrı) `fallback`'e
 * FAIL-SOFT düşer. Hiçbir koşulda FIRLATMAZ — bir log satırının seçimi
 * isteğin kendisini (kayıt/giriş/çıkış akışını) KIRAMAZ.
 */
function resolveEventLogger(fallback: PinoLogger): PinoLogger {
  return tryGetRequestContext()?.logger ?? fallback
}

/**
 * FIX turu 3, madde ② (security tur3, `low`) — `logger`'ın bağlı
 * (`.child()`) zincirinde `userId` ZATEN var mı diye SORAR. `.bindings()`
 * pino'nun KENDİ API'si (`pino.d.ts:113-115`, "Returns an object containing
 * all the current bindings") — `child()` zincirinin TAMAMINI TEK, BİRLEŞTİRİLMİŞ
 * bir nesneye indirger (anahtar başına son değer), bu yüzden "BU anahtar
 * ZATEN bağlı mı" sorusuna GÜVENİLİR bir cevap verir — `context.auth.kind
 * === 'authenticated'` kontrolü (İLK denenen, DAHA DAR sinyal) BUNU
 * YETERİNCE KAPSAMAZ: `/two-factor/verify-totp`'un "kurulum onayı" dalı
 * (`totp/index.mjs:175-180`) AYNI İSTEK İÇİNDE önce `session.create.after`'ı
 * (ki EXEMPT bir yolda `userId`'yi bu kancanın KENDİSİ `child()` İLE
 * BAĞLAR), SONRA `session.delete.after`'ı tetikler — `auth.kind` HÂLÂ
 * `'exempt'`dir (middleware bunu DEĞİŞTİRMEZ) ama `context.logger` BU
 * NOKTADA ZATEN `userId` TAŞIR (AYNI İSTEK içindeki ÖNCEKİ kancadan).
 * `.bindings()` kontrolü middleware'DEN mi yoksa AYNI isteğin ÖNCEKİ bir
 * kancasından mı geldiğine BAKMAKSIZIN doğru cevabı verir
 * (`two-factor-event-log-duplicate-userid.test.ts` İLE ÖLÇÜLDÜ — İLK
 * deneme, `auth.kind` kontrolü, `disable`'ın "oturum sonlandırıldı" olayını
 * KAÇIRDI).
 */
function loggerAlreadyHasUserId(logger: PinoLogger): boolean {
  return 'userId' in logger.bindings()
}

async function sendAuthMail(
  mailTransport: MailTransport,
  logger: PinoLogger,
  // FIX turu 1, madde 9 (solid M-4) — yerel ikinci anahtar birleşimi
  // SİLİNDİ; TEK doğruluk kaynağı `MailMessageKey` (`mail/messages.ts`)
  // İTHAL edilir.
  messageKey: MailMessageKey,
  to: string,
  url: string,
): Promise<void> {
  const content = renderMailMessage(messageKey, { url })
  await mailTransport.send({
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
    messageKey,
  })
  // FIX turu 1, madde 5 (M-5/F6) — architect'in olay listesindeki "doğrulama
  // e-postası" `info` olayı (sıfırlama e-postası İÇİN de simetrik olarak
  // üretilir — liste bunu dışlamıyor, "e-posta gönderildi" sınıfının İKİ
  // örneği). Ham e-posta ASLA — yalnızca `emailMasked` (TEK yol, `maskEmail`).
  // FIX turu 2, madde 4 — `resolveEventLogger()` (`requestId` bağlamalı).
  resolveEventLogger(logger).info({ emailMasked: maskEmail(to), messageKey }, 'e-posta gönderildi')
}

/**
 * `databaseHooks.session.create.before`'ın (altta) yazacağı IP değerini
 * hesaplar — BUGÜN BİREBİR KOPYA (`clientIp`). Fonksiyonun VARLIK SEBEBİ
 * KARARIN KENDİSİNİ adlandırmak ve TEST EDİLEBİLİR kılmak:
 *
 * ⚠ `clientIp === null` (`RequestContextMiddleware`'in `UNKNOWN_IP`
 * sentinel'ini eşlediği "tespit edilemedi" durumu,
 * `request-context.middleware.ts:104-106`) → `null` YAZILIR, `''` DEĞİL.
 * GEREKÇE (karar, ROADMAP v0.0.15.1/T-017/S6): `Session.ipAddress` kolonu
 * NULLABLE'dır (`String?`) TAM BU YÜZDEN; `''` yazmak "IP ÇÖZÜLDÜ VE
 * BOŞTU" gibi YANLIŞ bir iddia taşırdı. `RequestClientContext`'in audit
 * kaydı İÇİN ZATEN kurduğu "sentinel bir DEĞER DEĞİLDİR, `null`'a
 * eşlenir" ilkesiyle (`request-context.types.ts`'in `ip` alanı yorumu)
 * AYNI semantik — İKİNCİ bir "bilinmeyen IP" TEMSİLİ İCAT EDİLMEZ; tek
 * doğruluk kaynağı (`RequestContext.client.ip`) burada da KORUNUR.
 *
 * `export` — birim testi için (`session-ip-and-last-seen.test.ts`).
 */
export function resolveSessionIpAddressForCreateHook(clientIp: string | null): string | null {
  return clientIp
}

/**
 * "Son görülme" (`lastSeenAt`) ÇÖZÜNÜRLÜĞÜ — ROADMAP v0.0.15.1, T-017/S6,
 * architect'in ÖLÇÜLMÜŞ GEREKÇESİ (`pm`'in R2'sini bu ölçümle REVİZE etti).
 * `session: { … }` İÇİNDEKİ `expiresIn`'in (altta) YANINA, Better Auth'un
 * KENDİ `session.updateAge`'ine VERİLİR — `lastSeenAt = Session.updatedAt`,
 * AYRI bir mekanizma KURULMAZ (Better Auth'un KENDİ yenileme yazımı,
 * `better-auth@1.7.14` `api/routes/session.mjs:199-201`, ÖLÇÜLDÜ, bu
 * kolonu ZATEN günceller).
 *
 * YENİLEME KOŞULU (ÖLÇÜLDÜ, AYNI dosya, satır 180):
 * `expiresAt − expiresIn·1000 + updateAge·1000 ≤ now`. `expiresAt =
 * lastUpdate + expiresIn·1000` olduğundan bu ifade CEBİRSEL olarak
 * `lastUpdate + updateAge·1000 ≤ now`'a SADELEŞİR — yani bir satır, SON
 * yazımından bu yana geçen süre `updateAge` saniyeyi AŞMADAN bir KEZ DAHA
 * yazılamaz (satır başına pencere başına EN FAZLA BİR `UPDATE` — yazma
 * amplifikasyonunun YAPISAL üst sınırı, `perf`'in P1'i BUNU ölçecek).
 *
 * `expiresAt` BUGÜN DE (bu değişiklikten ÖNCE DE) KAYAN bir penceredir —
 * her yenileme `expiresAt`'i `now + AUTH_SESSION_TTL_SECONDS` olarak
 * SIFIRLAR (`session.mjs:200`). Değişen TEK şey ÇÖZÜNÜRLÜKTÜR (Better
 * Auth'un TANIMLANMAMIŞ varsayılanı 86400 → 300) — oturum ÖMRÜ en kötü
 * durumda varsayılanla ≤24 saat UZAYABİLİRDİ, bu sabitle ≤5 dakikaya
 * DÜŞER; 7 günlük `AUTH_SESSION_TTL_SECONDS` TTL'i için KABUL EDİLEBİLİR.
 *
 * `export` — birim/entegrasyon testi için (`session-ip-and-last-seen.test.ts`,
 * AC8'in eşik mutasyonu `describeBetterAuthLogCause`'un AYNI "export for test" deseni).
 */
export const SESSION_LAST_SEEN_RESOLUTION_SECONDS = 300

type BetterAuthLogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error'

/**
 * Nodemailer tarzı, YAPILANDIRILMIŞ bir sağlayıcı hatasından (varsa) iki
 * ENUM BENZERİ alanı okur — `.code` (ör. `'EENVELOPE'`/`'ECONNECTION'`) ve
 * `.responseCode` (SMTP yanıt KODU, ör. `550`; sayı, ADRES DEĞİL). Her ikisi
 * de SERBEST METİN DEĞİLDİR — sabit, küçük bir değer kümesinden gelir,
 * alıcı/host/kimlik bilgisi TAŞIYAMAZ. `value` bu alanları taşımıyorsa
 * (ör. düz `AggregateError`, bağlantı hatası) `undefined` döner.
 */
function extractProviderErrorFields(value: unknown): {
  readonly providerErrorCode: string | undefined
  readonly providerResponseCode: number | undefined
} {
  if (typeof value !== 'object' || value === null) {
    return { providerErrorCode: undefined, providerResponseCode: undefined }
  }

  const record = value as Record<string, unknown>
  return {
    providerErrorCode: typeof record['code'] === 'string' ? record['code'] : undefined,
    providerResponseCode:
      typeof record['responseCode'] === 'number' ? record['responseCode'] : undefined,
  }
}

export type BetterAuthLogCauseDescription = {
  readonly causeCode: string | undefined
  /** `cause.constructor.name` — ör. `'Error'`/`'AggregateError'`. SERBEST METİN DEĞİL. */
  readonly causeClassName: string | undefined
  readonly providerErrorCode: string | undefined
  readonly providerResponseCode: number | undefined
}

/**
 * Better Auth'un `logger.error(message, cause)` çağrısındaki ham `cause`'u
 * YAPILANDIRILMIŞ, ALLOWLIST'li bir alana indirger.
 *
 * **FIX turu 2, madde 1 (security tur2 S-2, `high`) — bu fonksiyon ARTIK
 * HİÇBİR serbest metin (`.message`/`.stack`) OKUMAZ.** Dosya başı yorumunun
 * gerekçesi: `cause.cause` (ÖNCEKİ hâlin indiği yer) bir SMTP/nodemailer
 * hatası OLABİLİR ve o hatanın `.message`'ı alıcının TAM e-posta adresini
 * (veya ileride bir üretim sağlayıcısında kimlik bilgisini) TAŞIYABİLİR —
 * ÖLÇÜLDÜ. Bu yüzden yalnızca `causeCode` (`AppError.code`) +
 * `causeClassName` (sınıf ADI, İÇERİK değil) +
 * `providerErrorCode`/`providerResponseCode` (yapılandırılmış, enum benzeri
 * iki alan — `extractProviderErrorFields`) okunur. `export` — birim testi
 * için (`auth-flow.test.ts`).
 */
export function describeBetterAuthLogCause(cause: unknown): BetterAuthLogCauseDescription {
  if (cause instanceof AppError) {
    const innerCause = cause.cause
    return {
      causeCode: cause.code,
      causeClassName: innerCause instanceof Error ? innerCause.constructor.name : typeof innerCause,
      ...extractProviderErrorFields(innerCause),
    }
  }
  if (cause instanceof Error) {
    return {
      causeCode: undefined,
      causeClassName: cause.constructor.name,
      providerErrorCode: undefined,
      providerResponseCode: undefined,
    }
  }
  return {
    causeCode: undefined,
    causeClassName: typeof cause,
    providerErrorCode: undefined,
    providerResponseCode: undefined,
  }
}

/** Better Auth'un kendi logger arayüzünü enjekte edilen pino örneğine bağlar. */
function createBetterAuthLogger(logger: PinoLogger): NonNullable<BetterAuthOptions['logger']> {
  return {
    log: (level: BetterAuthLogLevel, message: string, ...args: readonly unknown[]): void => {
      if (level === 'success') {
        logger.info(message)
        return
      }

      // FIX turu 1, madde 2 (F2) — `error` seviyesinde kütüphanenin geçtiği
      // ham hatayı (`args[0]`) yapılandırılmış alana taşı; yoksa (ör.
      // `warn`/`info` çağrıları, ki bunlar bugün argümansız) davranış
      // DEĞİŞMEDİ.
      if (level === 'error' && args.length > 0) {
        logger.error(describeBetterAuthLogCause(args[0]), message)
        return
      }

      logger[level](message)
    },
  }
}

const TWO_FACTOR_ENABLE_PATH = '/two-factor/enable'
const TWO_FACTOR_VERIFY_TOTP_PATH = '/two-factor/verify-totp'
// FIX turu 1, madde 2/F2 (`medium`) — `disable`/`generate-backup-codes`
// denetim boşluğu (dosya başı yorumuna EKLENEN bölüm, `createTwoFactorEventHook`
// altında).
const TWO_FACTOR_DISABLE_PATH = '/two-factor/disable'
const TWO_FACTOR_GENERATE_BACKUP_CODES_PATH = '/two-factor/generate-backup-codes'

// `TWO_FACTOR_VERIFY_TOTP_PATH`İN (yukarıda) İKİ FARKLI session.create ANLAMI
// olduğu ÖLÇÜLDÜ (FIX turu 1, madde 2/F2, handoff'un "kurulum onayında" ifadesi) —
// `isNonLoginSessionCreation` (altta) açıklar.

/**
 * `session.create.after`'ın (altta) "giriş başarılı" ETİKETİNİ YANLIŞ
 * KULLANDIĞI iki yol — FIX turu 1, madde 2/F2. `disable` KESİNLİKLE
 * ULAŞILABİLİR (Better Auth'un `disableTwoFactor`'ı `internalAdapter.
 * createSession()` çağırır, ÖLÇÜLDÜ — `plugins/two-factor/index.mjs:227`).
 * `enable` (`method:'otp'` dalı, `options?.skipVerificationOnEnable` AÇIKKEN)
 * BUGÜN ERİŞİLEMEZ — `auth-instance.ts` `otpOptions` GEÇMEZ, bu dal
 * `OTP_NOT_CONFIGURED` (400) ile daha ÖNCE durur (`auth-delegated-paths.ts`
 * dosya başı yorumunun AYNI ölçümü) VE `skipVerificationOnEnable` BİLEREK
 * AYARLANMADI — bu yüzden `method:'totp'` dalı da `createSession`
 * ÇAĞIRMAZ. İKİSİ DE buraya BİLEREK EKLENDİ (dead code BUGÜN, ama path tabanlı
 * kontrol GENELDİR — `otpOptions` ileride yapılandırılırsa davranış OTOMATİK
 * doğru kalır, ikinci bir "unutulan satır" riski taşımaz).
 */
const NON_LOGIN_SESSION_CREATION_PATHS: ReadonlySet<string> = new Set([
  TWO_FACTOR_DISABLE_PATH,
  TWO_FACTOR_ENABLE_PATH,
])

/**
 * `ctx.context.returned`'ın (`unknown`) `{method: 'totp' | 'otp', ...}`
 * şeklinde olup olmadığını okur — `extractProviderErrorFields`'ın (yukarıda)
 * AYNI "typeof nesne kontrolü + daraltma" deseni, Zod YOK (bu alan dış
 * dünyadan değil, kendi sürecimizin bellek içi nesnesi — CLAUDE.md §4'ün
 * Zod zorunluluğu HTTP gövdesi/env/webhook/JSONB içindir).
 */
function extractTwoFactorEnableMethod(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const method = (value as Record<string, unknown>)['method']
  return typeof method === 'string' ? method : undefined
}

/** `{user: {id: string}}` şeklindeki başarı gövdesinden `userId`'yi okur. */
function extractTwoFactorUserId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const user = (value as Record<string, unknown>)['user']
  if (typeof user !== 'object' || user === null) {
    return undefined
  }
  const id = (user as Record<string, unknown>)['id']
  return typeof id === 'string' ? id : undefined
}

/**
 * Better Auth'un `APIError.body.code`'unu okur — `describeBetterAuthLogCause`
 * ile AYNI ilke: yalnızca YAPILANDIRILMIŞ, enum benzeri alan (sabit bir
 * kümeden gelen SCREAMING_SNAKE_CASE kod, ör. `'INVALID_CODE'`); `.message`
 * (serbest metin) HİÇ OKUNMAZ.
 */
function extractApiErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const body = (value as Record<string, unknown>)['body']
  if (typeof body !== 'object' || body === null) {
    return undefined
  }
  const code = (body as Record<string, unknown>)['code']
  return typeof code === 'string' ? code : undefined
}

/**
 * `databaseHooks.session.create.after`'ın İKİNCİ parametresi — Better Auth
 * `createWithHooks()` içinde `toRun(created, context)` İLE çağırır (ÖLÇÜLDÜ,
 * `db/with-hooks.mjs:39`; tip imzası `@better-auth/core`'da `context:
 * GenericEndpointContext | null` — FIX turu 1, madde 2/F2). BU tipi `apps/api`
 * `@better-auth/core`'u DOĞRUDAN bağımlılık OLARAK EKLEMEDEN (yeni ana
 * bağımlılık YASAK, CLAUDE.md §2) `unknown` + daraltma ile okur —
 * `extractTwoFactorEnableMethod`'un (yukarıda) AYNI "bellek içi nesne, Zod
 * GEREKMEZ" ilkesi.
 */
function extractAuthEndpointPath(context: unknown): string | undefined {
  if (typeof context !== 'object' || context === null) {
    return undefined
  }
  const path = (context as Record<string, unknown>)['path']
  return typeof path === 'string' ? path : undefined
}

/**
 * `context.context.session`'ın (NESTED — `createAuthMiddleware`'in `ctx.
 * context.session`'IYLA AYNI alan, `createTwoFactorEventHook`'un ZATEN
 * okuduğu) DOLU olup olmadığını okur. `/two-factor/verify-totp`'un "kurulum
 * onayı" dalı (`totp/index.mjs`, "ZATEN bir oturumu VARKEN" çağrılır — AYNI
 * `isSignIn = !session.session` ayrımı) BU alanı DOLU bırakır; giriş-sırası
 * (challenge çerezi) tamamlaması İSE bu noktada HENÜZ oturum YOKTUR
 * (`session.session === null`, dosya başı yorumunun "etkinleştirildi" ayrımı
 * İLE AYNI ÖLÇÜM).
 */
function hasExistingSessionAtCreation(context: unknown): boolean {
  if (typeof context !== 'object' || context === null) {
    return false
  }
  const inner = (context as Record<string, unknown>)['context']
  if (typeof inner !== 'object' || inner === null) {
    return false
  }
  const session = (inner as Record<string, unknown>)['session']
  return session !== null && session !== undefined
}

/**
 * `true` → bu `session.create` çağrısı bir GİRİŞ TAMAMLANMASI DEĞİL, bir 2FA
 * durum değişikliğinin (`disable`, `verify-totp`'un kurulum onayı dalı,
 * ileride `enable`/`otp`) YAN ETKİSİDİR — `databaseHooks.session.create.
 * after` (altta) bunu "giriş başarılı" DIŞINDA bir etiketle loglar.
 * `context === null` (programatik/HTTP-dışı çağrı, BUGÜN gözlenmemiş) →
 * FAIL-SOFT `false` (ÖNCEKİ davranış KORUNUR, görünürlük KAYBOLMAZ).
 *
 * `/two-factor/verify-totp` İKİ anlam TAŞIYABİLDİĞİ için (dosya başı
 * GÜNCELLEME yorumu) sabit kümenin (`NON_LOGIN_SESSION_CREATION_PATHS`)
 * DIŞINDA, İKİNCİ bir sinyalle (`hasExistingSessionAtCreation`) AYRI ele
 * alınır — path TEK BAŞINA yeterli değildir.
 */
function isNonLoginSessionCreation(context: unknown): boolean {
  const path = extractAuthEndpointPath(context)
  if (path === undefined) {
    return false
  }
  if (NON_LOGIN_SESSION_CREATION_PATHS.has(path)) {
    return true
  }
  if (path === TWO_FACTOR_VERIFY_TOTP_PATH) {
    return hasExistingSessionAtCreation(context)
  }
  return false
}

/**
 * 2FA olay logu (ROADMAP v0.0.15, T-016/S4) — "kurulum başladı",
 * "etkinleştirildi", "doğrulama başarısız", "kilitlendi". Better Auth'un
 * üst düzey `hooks.after`'ı (ÖLÇÜLDÜ, `better-auth/dist/api/dispatch.mjs`
 * `runAfterHooks`): endpoint handler'ı BİR `APIError` FIRLATSA BİLE bu hook
 * ÇALIŞIR — dispatch katmanı hatayı `ctx.context.returned`'a YAZAR, SONRA
 * `after` hook'larını çalıştırır (hata YUTULMAZ, CLAUDE.md §10.16 — bu hook
 * yalnızca GÖZLEMLER, yanıtı DEĞİŞTİRMEZ). Hiçbir sırrı (`totpURI`/
 * `backupCodes`/girilen kod) LOG NESNESİNE KOYMAZ — `PINO_REDACT_PATHS`'e
 * (S8) GÜVENEREK sır loglamak CLAUDE.md §4/görev talimatınca YASAK, bu
 * yüzden bu alanlar hiç OKUNMAZ.
 *
 * "etkinleştirildi" ayrımı (yalnızca `/two-factor/verify-totp` başarılı VE
 * GÖNDEREN istek zaten GEÇERLİ bir oturum çerezi taşıyor): Better Auth'un
 * eklentisi `verified:false → true` geçişini SADECE bu durumda yapar
 * (`totp/index.mjs:148`, `isSignIn && twoFactor.verified === false` TOTP_NOT_
 * ENABLED ile REDDEDİLİR — yani bir giriş-sırası 2FA tamamlaması asla "ilk
 * onay" OLAMAZ). İmzalı oturum çerezinin varlığı `getSessionFromCtx()` ile
 * (sessionMiddleware'in KENDİSİNİN kullandığı AYNI genel fonksiyon, `better-
 * auth/api`'den içe aktarılır) okunur — giriş-sırası 2FA tamamlaması bu
 * çerezi TAŞIMAZ (kimlik doğrulama HENÜZ tamamlanmadı), bu yüzden rutin bir
 * 2FA girişi burada "etkinleştirildi" olarak YANLIŞ ETİKETLENMEZ; o olay
 * `auth-instance.ts`'in MEVCUT `databaseHooks.session.create.after`'ı
 * (yukarıda) üzerinden ZATEN "giriş başarılı" olarak loglanır (YENİ bir satır
 * GEREKMEZ).
 *
 * ÖLÇÜLMÜŞ SINIR (dürüstçe kayıtlı, `AuthProviderFailedError`'ın dosya başı
 * yorumuyla AYNI disiplin): zaten etkinleştirilmiş bir 2FA'yı OTURUM AÇIKKEN
 * TEKRAR doğrulamak (normal bir kullanıcı akışı DEĞİL, ama uç noktanın
 * TEKNİK OLARAK izin verdiği bir çağrı) da "etkinleştirildi" olarak loglanır
 * — bu durumda zaten `verified` DEĞİŞMEZ, yalnızca log BİR KEZ daha yazılır.
 * Güvenlik açısından zararsız (yanlış pozitif bir "etkinleştirme" kaydı,
 * veri sızıntısı/yetki atlatma DEĞİL); ikinci bir DB okuması EKLEMEDEN bunu
 * ayırt etmenin bir yolu YOK.
 */
function createTwoFactorEventHook(logger: PinoLogger): AuthMiddleware {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path === TWO_FACTOR_ENABLE_PATH) {
      const returned: unknown = ctx.context.returned
      if (!isAPIError(returned) && extractTwoFactorEnableMethod(returned) === 'totp') {
        // FIX turu 3, madde ② (security tur3, `low`) — `userId` İKİNCİ KEZ
        // GEÇİRİLMEZ: `/two-factor/enable` `AUTH_EXEMPT_PATHS`'TE YOK (dosya
        // başı yorumu) → `AuthContextMiddleware` bu istek için `context.
        // logger`'ı `child({userId})` İLE ZATEN BAĞLAMIŞTIR
        // (`auth-context.middleware.ts:100`) — ikinci kez geçirmek NDJSON
        // satırında `userId` anahtarını İKİ KEZ üretirdi (ÖLÇÜLDÜ, `auth.
        // guard.ts`'in `kiracı üyeliği yok` dalındaki AYNI emsal/düzeltme).
        resolveEventLogger(logger).info({}, '2FA kurulumu başladı')
      }
      return
    }

    if (ctx.path === TWO_FACTOR_VERIFY_TOTP_PATH) {
      const returned: unknown = ctx.context.returned

      if (isAPIError(returned)) {
        const errorCode = extractApiErrorCode(returned)
        if (errorCode === 'ACCOUNT_TEMPORARILY_LOCKED') {
          resolveEventLogger(logger).warn({}, '2FA doğrulaması kilitlendi')
        } else if (errorCode === 'INVALID_CODE') {
          resolveEventLogger(logger).warn({}, '2FA doğrulaması başarısız')
        }
        return
      }

      // Giriş-sırası 2FA tamamlaması bu çerezi TAŞIMAZ (dosya başı yorumu) —
      // `getSessionFromCtx` burada yalnızca GELEN isteği okur, YANIT olarak
      // AZ ÖNCE yazılmış çerezi DEĞİL.
      const existingSession = await getSessionFromCtx(ctx)
      if (existingSession !== null) {
        resolveEventLogger(logger).info(
          { userId: extractTwoFactorUserId(returned) },
          '2FA etkinleştirildi',
        )
      }
      return
    }

    // FIX turu 1, madde 2/F2 (`medium`) — `disable`/`generate-backup-codes`
    // İÇİN SIFIR olay logu VARDI (ÖLÇÜLDÜ). İkisi de `sessionMiddleware`/
    // `sensitiveSessionMiddleware` ARDINDAN çalışır, bu yüzden `ctx.context.
    // session` BAŞARI/BAŞARISIZLIK AYRIMINDAN BAĞIMSIZ DOLUDUR — parola
    // YANLIŞSA BİLE oturum bellidir.
    //
    // FIX turu 3, madde ② (security tur3, `low`) — `userId` BURADAN ARTIK
    // HİÇ OKUNMAZ/GEÇİRİLMEZ: bu iki yol da `AUTH_EXEMPT_PATHS`'TE YOK, bu
    // yüzden `AuthContextMiddleware` `context.logger`'ı `child({userId})`
    // İLE ZATEN BAĞLAMIŞTIR (`enable` dalındaki AYNI gerekçe, yukarıda) —
    // ikinci kez geçirmek NDJSON satırında `userId` anahtarını İKİ KEZ
    // üretirdi (ÖLÇÜLDÜ).
    if (ctx.path === TWO_FACTOR_DISABLE_PATH) {
      const returned: unknown = ctx.context.returned

      if (isAPIError(returned)) {
        resolveEventLogger(logger).warn({}, '2FA kapatma denemesi başarısız')
      } else {
        resolveEventLogger(logger).info({}, '2FA devre dışı bırakıldı')
      }
      return
    }

    if (ctx.path === TWO_FACTOR_GENERATE_BACKUP_CODES_PATH) {
      const returned: unknown = ctx.context.returned

      if (isAPIError(returned)) {
        resolveEventLogger(logger).warn({}, '2FA yedek kod üretimi başarısız')
      } else {
        // ⚠ YEDEK KODLARIN KENDİSİ (`returned.backupCodes`) HİÇ OKUNMAZ —
        // dosya başı yorumunun "hiçbir sırrı LOG NESNESİNE KOYMAZ" ilkesi.
        resolveEventLogger(logger).info({}, '2FA yedek kodları yeniden üretildi')
      }
    }
  })
}

/**
 * Yapılandırılmış Better Auth örneğini kurar. `database` parametresi
 * `AuthPrismaDatabase` (TAM istemci yüzeyi, `account`/`session`/
 * `verification` dahil) kabul eder — `prismaAdapter()`'ın kendi `PrismaClient`
 * parametre tipi BOŞ bir arayüzdür (A-G4, ÖLÇÜLDÜ: `@better-auth/prisma-
 * adapter@1.7.14` → `interface PrismaClient {}`), bu yüzden `@prisma/client`
 * import etmeye veya yapısal bir eşleme eklemeye GEREK YOKTUR; `AuthPrismaDatabase`
 * yapısal olarak zaten uyumludur.
 */
export function createAuthInstance(options: CreateAuthInstanceOptions): Auth {
  const { env, prismaClient, mailTransport, logger } = options

  // `BetterAuthOptions` İLE AÇIKÇA tipleniyor (literal/daraltılmış obje tipi
  // DEĞİL): `betterAuth<O>`'un dönüşü `Auth<O>`'dur ve `O` DARALTILMIŞSA
  // (ör. `baseURL: string` yerine tam literal) `Auth<O>`, bu fonksiyonun
  // açık dönüş tipi `Auth` (= `Auth<BetterAuthOptions>`) ile UYUMSUZ olur
  // (`DBAdapter<O>`'un ters değişkenliği). Genişletme TEK satırda tutulur —
  // `as`/`@ts-ignore` YOK, saf tip genişletmesi (widening).
  const betterAuthOptions: BetterAuthOptions = {
    appName: 'Arkesoft',
    baseURL: env.AUTH_BASE_URL,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prismaClient, { provider: 'postgresql' }),
    logger: createBetterAuthLogger(logger),
    // S8'in Redis tabanlı, PLATFORM kapsamlı sınırlayıcısıyla ÇATIŞMASIN —
    // bkz. dosya başı yorumu.
    rateLimit: { enabled: false },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // FIX turu 1, madde 1 (F3, high) — şifre sıfırlama mevcut TÜM
      // oturumları İPTAL eder (`better-auth@1.7.14`
      // `utils/password.mjs:resetCredentialPassword` → `internalAdapter.
      // deleteUserSessions(userId)`, ÖLÇÜLDÜ). K6'yı İHLAL ETMEZ — oturum
      // EKRANI eklenmiyor, bu sunucu tarafı bir KURALDIR. Gerekçe: hedef
      // kullanıcı (teknik bilgisi olmayan KOBİ) şüpheli hareket görünce
      // bildiği TEK şeyi yapar — parolasını sıfırlar; bu olmadan saldırganın
      // çalıntı oturumu `AUTH_SESSION_TTL_SECONDS` (varsayılan 7 gün,
      // `SESSION_LAST_SEEN_RESOLUTION_SECONDS`'TA — 300s/5 dakikada EN FAZLA
      // BİR KEZ YENİLENEN; YORUM DÜZELTMESİ, ROADMAP v0.0.15.1/T-017/S6:
      // ÖNCEKİ hâl "HER istekte YENİLENEN" diyordu — YANLIŞTI, Better
      // Auth'un `updateAge` varsayılanı 86400'dür ve BU satırdan ÖNCE
      // TANIMLANMAMIŞTI, yani zaten "24 saatte EN FAZLA BİR KEZ" idi; bu
      // alt görev çözünürlüğü AÇIKÇA 300'E indirir) boyunca ayakta kalır.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }): Promise<void> => {
        const url = buildAuthLinkUrl(env.AUTH_BASE_URL, '/reset-password', token)
        await sendAuthMail(mailTransport, logger, 'auth.passwordReset', user.email, url)
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: env.AUTH_VERIFICATION_TTL_SECONDS,
      sendVerificationEmail: async ({ user, token }): Promise<void> => {
        const url = buildAuthLinkUrl(env.AUTH_BASE_URL, '/auth/verify-email', token)
        await sendAuthMail(mailTransport, logger, 'auth.emailVerification', user.email, url)
      },
    },
    session: {
      expiresIn: env.AUTH_SESSION_TTL_SECONDS,
      // ROADMAP v0.0.15.1 (T-017/S6) — `SESSION_LAST_SEEN_RESOLUTION_SECONDS`'ın
      // (yukarıda) dosya içi yorumuna bkz. Better Auth'un TANIMLANMAMIŞ
      // varsayılanı (86400) BİLEREK aşılır — "son görülme" 5 dakika
      // çözünürlükte, AYRI bir mekanizma YOK (`lastSeenAt = Session.updatedAt`).
      updateAge: SESSION_LAST_SEEN_RESOLUTION_SECONDS,
      // ZORUNLU (A-G8) — bkz. dosya başı yorumu.
      cookieCache: { enabled: false },
    },
    // ROADMAP v0.0.15 (T-016/S4) — `better-auth/plugins/two-factor`,
    // BİLDİRİLMİŞ bir alt yol (A-PM3'ün ölçümü, Task raporu) — YENİ BİR ANA
    // BAĞIMLILIK DEĞİL. `accountLockout` AÇIKÇA yapılandırılır (sihirli sayı
    // gömülmez, `two-factor/account-lockout.constants.ts`'in dosya başı
    // yorumu) — eklentinin KENDİ varsayılanıyla SAYISAL OLARAK AYNI (10/900)
    // ama bu AÇIKÇA bir KARAR, ÖRTÜK bir varsayılana GÜVENME DEĞİL.
    // `skipVerificationOnEnable` BİLEREK ayarlanmadı (varsayılan `false`) —
    // "kurulum başladı"/"etkinleştirildi" iki AYRI olay olarak kalır
    // (`createTwoFactorEventHook`'un dosya başı yorumu); `allowPasswordless`
    // de BİLEREK ayarlanmadı (varsayılan `false`) — parola gerektirmeyen
    // hesap bugün YOK (Better Auth'un `account` tablosu her kullanıcı için
    // bir kimlik bilgisi taşır, K-A başka bir alt görevin kapsamı DEĞİL).
    plugins: [
      twoFactor({
        accountLockout: {
          enabled: true,
          maxFailedAttempts: ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS,
          durationSeconds: ACCOUNT_LOCKOUT_DURATION_SECONDS,
        },
      }),
    ],
    advanced: {
      ipAddress: { disableIpTracking: true },
      useSecureCookies: env.NODE_ENV === 'production',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      crossSubDomainCookies: { enabled: true, domain: resolveCookieDomain(env) },
      // FIX turu 1, madde 6 (F4) — dosya başı yorumu: `useSecureCookies` İLE
      // AYNI desen, `ApiEnv`'den AÇIKÇA türetilir. Yalnızca KENDİ test
      // ortamımızda (`env.NODE_ENV === 'test'`) devre dışı — üretim VE
      // geliştirmede HER ZAMAN `false` (etkin).
      disableOriginCheck: env.NODE_ENV === 'test',
      disableCSRFCheck: env.NODE_ENV === 'test',
    },
    // FIX turu 1, madde 5 (M-5/F6, zorunlu) — architect'in LOG DESENİ'ndeki
    // `info` olay listesinin KALANI (kayıt/giriş başarılı/çıkış/oturum
    // sonlandırıldı). Better Auth'un KENDİ veritabanı kancaları KULLANILIR
    // (davranışı DEĞİŞTİRMEZ, yalnızca GÖZLEMLER — `before` YOK, hepsi
    // `after`). `session.delete.after` İKİ mantıksal olayı (çıkış VE
    // oturum sonlandırma) TEK DB olayına (satır silme) eşler — Better
    // Auth'un KENDİ iç API'si bu ikisini ayrı bir alanla AYIRMIYOR; bu
    // dürüst bir SAPMA olarak burada KAYDA geçer, icat edilmiş bir ayrım
    // DEĞİL.
    //
    // ROADMAP v0.0.15 (T-016/S4) — `hooks.after`: 2FA olay logu
    // (`createTwoFactorEventHook`'un dosya başı yorumu). `databaseHooks`
    // (altta) Better Auth'un VERİTABANI yaşam döngüsü kancalarıdır; BU alan
    // ONUN YANINDA, istek/endpoint SEVİYESİNDE çalışan AYRI bir kanca
    // ailesidir (`getHooks()`, `better-auth/dist/api/dispatch.mjs`) —
    // `databaseHooks`'un YERİNİ ALMAZ, İKİSİ DE AKTİF.
    hooks: {
      after: createTwoFactorEventHook(logger),
    },
    databaseHooks: {
      user: {
        create: {
          // `async` YOK — gövde hiçbir şeyi `await` ETMİYOR
          // (`@typescript-eslint/require-await`); dönüş tipi `Promise<void>`
          // (hook sözleşmesinin BEKLEDİĞİ) `Promise.resolve()` ile
          // KARŞILANIR. FIX turu 2, madde 4 — `resolveEventLogger()`
          // (`requestId` bağlamalı, dosya başı yorumu).
          after: (user: { readonly id: string; readonly email: string }): Promise<void> => {
            resolveEventLogger(logger).info(
              { userId: user.id, emailMasked: maskEmail(user.email) },
              'kullanıcı kaydı oluşturuldu',
            )
            return Promise.resolve()
          },
        },
      },
      session: {
        create: {
          // ROADMAP v0.0.15.1 (T-017/S6) — dosya başı yorumunun IP YAZIMI
          // maddesine bkz. `tryGetCurrentAuthEndpointContext()` ALS İÇİNDE
          // çalışır (ÖLÇÜLDÜ, `db/with-hooks.mjs:8`) — `session.create.
          // after` (altta) ZATEN `tryGetRequestContext()` okuyor, AYNI
          // istek bağlamı buradan da erişilebilir; İKİNCİ bir context
          // kaynağı İCAT EDİLMEZ. `async` YOK — gövde hiçbir şeyi `await`
          // ETMİYOR (`user.create.after`'ın AYNI deseni, yukarıda).
          before: (): Promise<{ data: { ipAddress: string | null } }> => {
            const clientIp = tryGetRequestContext()?.client.ip ?? null
            return Promise.resolve({
              data: { ipAddress: resolveSessionIpAddressForCreateHook(clientIp) },
            })
          },
          // FIX turu 1, madde 2/F2 (`medium`) — İKİNCİ parametre (`context`)
          // EKLENDİ. ÖNCEKİ hâl `ctx.path`'i HİÇ OKUMADIĞI için `disable`'ın
          // (ve ileride, bugün erişilemeyen `enable`/`otp`'nin) ÜRETTİĞİ
          // oturumu da KOŞULSUZ "giriş başarılı" olarak etiketliyordu —
          // saldırganın kurbanın 2FA'sını KAPATMASI loglarda SADECE "giriş
          // başarılı" + "oturum sonlandırıldı" çifti olarak GÖRÜNÜYORDU
          // (dosya başı GÜNCELLEME yorumuna bkz — `isNonLoginSessionCreation`).
          after: (
            session: { readonly id: string; readonly userId: string },
            hookContext: unknown,
          ): Promise<void> => {
            // FIX turu 2, madde 4 (security/qa tur2 S-5) — `/auth/sign-in/
            // email` `AUTH_EXEMPT_PATHS`'te olduğu için `AuthContextMiddleware`
            // bu isteğin `context.logger`'ına `userId` BAĞLAMAMIŞTI (giriş
            // anında kimlik henüz YOK). Giriş TAM BURADA başarılı olduğu
            // için `context.logger`'ı BURADAN SONRAKİ loglar (ör.
            // `RequestLoggingInterceptor`'ın `istek tamamlandı` özeti) İÇİN
            // `userId` İLE BAĞLARIZ — `AuthContextMiddleware`'in `tenantId`/
            // `userId` child'lama deseniyle AYNI, TEK EK yazıcı. BU bağlama
            // yol AYRIMINDAN BAĞIMSIZDIR — her iki etiket de AYNI isteğin
            // ÜRÜNÜ, korelasyon İKİSİNDE de gerekir.
            //
            // FIX turu 3, madde ② (security tur3, `low` — item②'nin KENDİ
            // doğrulama testinde ORTAYA ÇIKAN İKİNCİ bir kaynak, ÖLÇÜLDÜ):
            // bu hook `disable`'ın VE `verify-totp`'un "kurulum onayı"
            // dalının KENDİ handler'LARI İÇİNDE de TETİKLENİR
            // (`internalAdapter.createSession`, `better-auth/dist/plugins/
            // two-factor/index.mjs:227` ve `totp/index.mjs:175`) — bu
            // çağrılarda `context.logger`'da `userId` ZATEN olabilir (ya
            // `AuthContextMiddleware`'den — `disable`/`enable` gibi EXEMPT
            // OLMAYAN yollar — ya da AYNI isteğin ÖNCEKİ bir kancasından).
            // Yukarıdaki yorumun varsayımı ("middleware userId
            // BAĞLAMAMIŞTI") SADECE giriş-sırası (exempt, TEK kanca) çağrı
            // için doğrudur. Koşulsuz `{userId}` + koşulsuz İKİNCİ
            // `child({userId})` bu yüzden bu iki yolun ÜRETTİĞİ log
            // satırlarında `userId` anahtarını İKİ/ÜÇ KEZ üretiyordu
            // (`two-factor-event-log-duplicate-userid.test.ts` İLE
            // ÖLÇÜLDÜ) — `loggerAlreadyHasUserId()` (yukarıda, dosya başı
            // yorumu) GÜVENİLİR sinyaldir, `context.auth.kind ===
            // 'authenticated'` (İLK denenen, YETERSİZ KALAN sinyal) DEĞİL.
            const context = tryGetRequestContext()
            const eventLogger = context?.logger ?? logger
            const message = isNonLoginSessionCreation(hookContext)
              ? '2FA değişikliği sonrası oturum yenilendi'
              : 'giriş başarılı'
            const alreadyHasUserId = context !== undefined && loggerAlreadyHasUserId(context.logger)
            eventLogger.info(
              alreadyHasUserId
                ? { sessionId: session.id }
                : { userId: session.userId, sessionId: session.id },
              message,
            )
            if (context !== undefined && !alreadyHasUserId) {
              context.logger = context.logger.child({ userId: session.userId })
            }
            return Promise.resolve()
          },
        },
        delete: {
          // FIX turu 3, madde ② (security tur3, `low`) — AYNI gerekçe
          // `session.create.after`'ın dosya başı GÜNCELLEME yorumuyla
          // BİREBİR: bu kanca YALNIZCA `/auth/sign-out` (exempt) İÇİN
          // DEĞİL, `/two-factor/disable`'ın (`index.mjs:235`) VE
          // `verify-totp`'un "kurulum onayı" dalının (`totp/index.mjs:180`)
          // KENDİ `deleteSession` çağrıları İÇİN de TETİKLENİR (ÖLÇÜLDÜ) —
          // `loggerAlreadyHasUserId()` (dosya başı yorumu) AYNI sinyal.
          after: (session: { readonly id: string; readonly userId: string }): Promise<void> => {
            const context = tryGetRequestContext()
            const eventLogger = context?.logger ?? logger
            const alreadyHasUserId = context !== undefined && loggerAlreadyHasUserId(context.logger)
            eventLogger.info(
              alreadyHasUserId
                ? { sessionId: session.id }
                : { userId: session.userId, sessionId: session.id },
              'oturum sonlandırıldı',
            )
            return Promise.resolve()
          },
        },
      },
    },
  }

  return betterAuth(betterAuthOptions)
}

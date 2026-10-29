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
      // çalıntı oturumu `AUTH_SESSION_TTL_SECONDS` (varsayılan 7 gün, HER
      // istekte YENİLENEN) boyunca ayakta kalır.
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
      // ZORUNLU (A-G8) — bkz. dosya başı yorumu.
      cookieCache: { enabled: false },
    },
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
          after: (session: { readonly id: string; readonly userId: string }): Promise<void> => {
            // FIX turu 2, madde 4 (security/qa tur2 S-5) — `/auth/sign-in/
            // email` `AUTH_EXEMPT_PATHS`'te olduğu için `AuthContextMiddleware`
            // bu isteğin `context.logger`'ına `userId` BAĞLAMAMIŞTI (giriş
            // anında kimlik henüz YOK). Giriş TAM BURADA başarılı olduğu
            // için `context.logger`'ı BURADAN SONRAKİ loglar (ör.
            // `RequestLoggingInterceptor`'ın `istek tamamlandı` özeti) İÇİN
            // `userId` İLE BAĞLARIZ — `AuthContextMiddleware`'in `tenantId`/
            // `userId` child'lama deseniyle AYNI, TEK EK yazıcı.
            const context = tryGetRequestContext()
            const eventLogger = context?.logger ?? logger
            eventLogger.info({ userId: session.userId, sessionId: session.id }, 'giriş başarılı')
            if (context !== undefined) {
              context.logger = context.logger.child({ userId: session.userId })
            }
            return Promise.resolve()
          },
        },
        delete: {
          after: (session: { readonly id: string; readonly userId: string }): Promise<void> => {
            resolveEventLogger(logger).info(
              { userId: session.userId, sessionId: session.id },
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

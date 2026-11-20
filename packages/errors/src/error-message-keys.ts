// @arkesoft/errors — kod → i18n anahtarı kayıt defteri (ROADMAP v0.0.18,
// T-027/S2, architect R-1 KARARI)
//
// YERLEŞİM ZORUNLULUĞU, tercih DEĞİL (architect R-1): `apps/admin` ve
// `apps/superadmin`'in elle tuttuğu `code → metin` aynası
// (`messages.ts:12-19`'un adıyla işaret ettiği borç) buraya taşınıyor. Defter
// `packages/i18n`'de olsaydı bu dosyadaki iki jenerik fabrika
// (`genericTransportErrorBody`/`unknownErrorBody`, error-body.ts) anahtarlarını
// oradan OKUMAK zorunda kalırdı ⇒ `errors → i18n` VE `i18n → errors` = DÖNGÜSEL
// BAĞIMLILIK (CLAUDE.md §3 yasak — paketler arası döngü yok). `packages/errors`
// hiçbir iç pakete bağımlı değildir (yalnızca `zod`); bu dosya da öyle — SAF VERİ
// + zod, hata SINIFI tanımlamaz (CLAUDE.md §3 sorumluluk tablosu:
// `packages/errors` "domain hatası tanımı yapmaz").
//
// ⚠⚠ 37 KOD → 35 ANAHTAR (çok-bire, KASITLI). Dağılım (ölçüldü):
//   - 32 × `apps/api/src/errors/domain/*.error.ts` (benzersiz kod/anahtar,
//     bijektif — grep ile doğrulandı)
//   - 1 × `apps/storefront/src/themes/registry.ts:172-174`
//     (`THEME_RESOLUTION_FAILED` → `errors.theme.resolutionFailed`)
//   - 2 × jenerik (`error-body.ts`: `HTTP_EXCEPTION`/`errors.http.generic`,
//     `INTERNAL_ERROR`/`errors.internal.unknown`)
//   32 + 1 + 2 = 35 BENZERSİZ anahtar — `docs/ux/T-027.md`'nin 35 satırlık
//   tablosuyla birebir (`po`'nun ölçümüyle de uyuşuyor).
//   - + 2 × `Money` programcı hatası (S5b'de doğacak: `FRACTIONAL_MINOR_UNIT`,
//     `CURRENCY_MISMATCH`) — ikisi de kullanıcı hatası DEĞİL, programcı hatası
//     ⇒ mevcut `errors.internal.unknown` anahtarına eşlenir, YENİ anahtar
//     AÇMAZ. 35 + 2 = 37 KOD, anahtar kümesi 35'TE KALIR.
//
// A-PO27-2 (BAĞLAYICI, po): bu dosya "her defter kodunun bir yazıcısı var"
// testi YAZMAZ — 2 `Money` kodunun yazıcıları henüz doğmadı (S5b), böyle bir
// test S2→S5b arası KIRMIZI PENCERE açardı. Yazıcı tamlığı TEK YÖNLÜ (literal
// yasağı) olarak S8'de zorlanacak.

import { z } from 'zod'

/**
 * Kapalı anahtar kümesi — TAM OLARAK 35 benzersiz i18n anahtarı. Yeni bir
 * domain hatası eklemek bu listeyi BÜYÜTMEZ; yeni bir KULLANICI METNİ
 * eklemek gerekiyorsa buraya satır eklenir (ve `packages/i18n`'in `tr-TR`
 * kataloğu, S5a, o anahtarın karşılığını taşımak ZORUNDADIR —
 * `satisfies Record<ErrorMessageKey, string>` eksik/fazla anahtarı
 * `tsc --noEmit`'te kırar).
 */
const ERROR_MESSAGE_KEY_VALUES = [
  'errors.auth.accountTemporarilyLocked',
  'errors.auth.crossSiteRequestRejected',
  'errors.auth.emailNotVerified',
  'errors.auth.invalidPassword',
  'errors.auth.providerFailed',
  'errors.auth.rateLimitExceeded',
  'errors.auth.rateLimitStoreUnavailable',
  'errors.auth.sessionNotFound',
  'errors.auth.tenantMembershipRequired',
  'errors.auth.twoFactorRequiredForOwner',
  'errors.auth.unauthenticated',
  'errors.authz.permissionDenied',
  'errors.dependency.unavailable',
  'errors.http.generic',
  'errors.internal.unknown',
  'errors.job.enqueueFailed',
  'errors.job.handlerMissing',
  'errors.job.identifierMissing',
  'errors.job.notFound',
  'errors.job.payloadInvalid',
  'errors.mail.deliveryFailed',
  'errors.member.alreadyMember',
  'errors.member.invitationInvalid',
  'errors.member.invitationResendTooSoon',
  'errors.member.ownerMembershipProtected',
  'errors.member.pendingInvitationLimitReached',
  'errors.platform.adminRequired',
  'errors.platform.networkNotAllowed',
  'errors.requestContext.unavailable',
  'errors.tenant.contextRequired',
  'errors.tenant.notFound',
  'errors.tenant.resolutionFailed',
  'errors.theme.resolutionFailed',
  'errors.twoFactor.setupRequiredBeforeEnforcement',
  'errors.validation.failed',
] as const

/**
 * `ERROR_MESSAGE_KEY_VALUES`'in çalışma zamanı doğrulayıcısı. Panellerin
 * `normalize-panel-error.ts`'i (S7) telden gelen `message` alanını bu şemayla
 * `safeParse` eder; küme dışındaki HER değer (ham sunucu metni dahil) `null`'a
 * elenir (architect R-1 KARARI — `PanelError.messageKey: ErrorMessageKey | null`).
 */
export const errorMessageKeySchema = z.enum(ERROR_MESSAGE_KEY_VALUES)

/**
 * Kapalı birleşim — `string` DEĞİL. Katalogdan (`packages/i18n`) TÜRETİLMEZ;
 * bu paketin veritabanına/i18n'e bağımlılığı YOK (CLAUDE.md §3), yön tam
 * tersi: `packages/i18n` BU anahtarları tüketir.
 */
export type ErrorMessageKey = z.infer<typeof errorMessageKeySchema>

/**
 * Kod → i18n anahtarı kayıt defteri. TAM OLARAK 37 kod taşır (yukarıdaki
 * dağılım), değerleri 35 benzersiz `ErrorMessageKey`'e indirgenir.
 *
 * `satisfies Record<string, ErrorMessageKey>` — her değerin kapalı kümenin
 * ÜYESİ olduğunu derleme zamanında zorlar; kümede olmayan bir anahtar
 * yazılırsa `tsc --noEmit` HATA verir.
 */
export const ERROR_MESSAGE_KEYS = {
  // 32 × apps/api/src/errors/domain/*.error.ts (bijektif — grep ile ölçüldü)
  ACCOUNT_TEMPORARILY_LOCKED: 'errors.auth.accountTemporarilyLocked',
  ALREADY_MEMBER: 'errors.member.alreadyMember',
  AUTH_PROVIDER_FAILED: 'errors.auth.providerFailed',
  CROSS_SITE_REQUEST_REJECTED: 'errors.auth.crossSiteRequestRejected',
  DEPENDENCY_UNAVAILABLE: 'errors.dependency.unavailable',
  EMAIL_NOT_VERIFIED: 'errors.auth.emailNotVerified',
  INVALID_PASSWORD: 'errors.auth.invalidPassword',
  INVITATION_INVALID: 'errors.member.invitationInvalid',
  INVITATION_RESEND_TOO_SOON: 'errors.member.invitationResendTooSoon',
  JOB_HANDLER_NOT_REGISTERED: 'errors.job.handlerMissing',
  JOB_IDENTIFIER_MISSING: 'errors.job.identifierMissing',
  JOB_NOT_FOUND: 'errors.job.notFound',
  JOB_PAYLOAD_INVALID: 'errors.job.payloadInvalid',
  JOB_TYPE_NOT_REGISTERED: 'errors.job.enqueueFailed',
  MAIL_DELIVERY_FAILED: 'errors.mail.deliveryFailed',
  OWNER_MEMBERSHIP_PROTECTED: 'errors.member.ownerMembershipProtected',
  PENDING_INVITATION_LIMIT_REACHED: 'errors.member.pendingInvitationLimitReached',
  PERMISSION_DENIED: 'errors.authz.permissionDenied',
  PLATFORM_ADMIN_REQUIRED: 'errors.platform.adminRequired',
  PLATFORM_NETWORK_NOT_ALLOWED: 'errors.platform.networkNotAllowed',
  RATE_LIMIT_EXCEEDED: 'errors.auth.rateLimitExceeded',
  RATE_LIMIT_STORE_UNAVAILABLE: 'errors.auth.rateLimitStoreUnavailable',
  REQUEST_CONTEXT_UNAVAILABLE: 'errors.requestContext.unavailable',
  SESSION_NOT_FOUND: 'errors.auth.sessionNotFound',
  TENANT_CONTEXT_REQUIRED: 'errors.tenant.contextRequired',
  TENANT_MEMBERSHIP_REQUIRED: 'errors.auth.tenantMembershipRequired',
  TENANT_NOT_FOUND: 'errors.tenant.notFound',
  TENANT_RESOLUTION_FAILED: 'errors.tenant.resolutionFailed',
  TWO_FACTOR_REQUIRED: 'errors.auth.twoFactorRequiredForOwner',
  TWO_FACTOR_SETUP_REQUIRED: 'errors.twoFactor.setupRequiredBeforeEnforcement',
  UNAUTHENTICATED: 'errors.auth.unauthenticated',
  VALIDATION_ERROR: 'errors.validation.failed',

  // 1 × apps/storefront/src/themes/registry.ts:172-174
  THEME_RESOLUTION_FAILED: 'errors.theme.resolutionFailed',

  // 2 × jenerik (error-body.ts) — mevcut tel-pinli değerler, BİREBİR AYNI
  HTTP_EXCEPTION: 'errors.http.generic',
  INTERNAL_ERROR: 'errors.internal.unknown',

  // 2 × Money programcı hatası (yazıcıları S5b'de doğar, A-PO27-2) — ikisi de
  // KULLANICI hatası DEĞİL, programcı hatası ⇒ YENİ anahtar AÇMAZ, mevcut
  // jenerik anahtara eşlenir.
  FRACTIONAL_MINOR_UNIT: 'errors.internal.unknown',
  CURRENCY_MISMATCH: 'errors.internal.unknown',
} as const satisfies Record<string, ErrorMessageKey>

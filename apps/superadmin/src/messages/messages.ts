// @arkesoft/superadmin — Panelin TEK Türkçe mesaj kataloğu (ROADMAP v0.0.20,
// T-021/S8, A-T21-4). Kullanıcıya dönük HİÇBİR Türkçe literal JSX/bileşen
// kodunda yazılmaz — yalnızca burada.
//
// ⚠⚠ GÜNCELLEME (ROADMAP v0.0.18, T-027/S7, architect R-1 KARARI) — borç
// KAPANDI: dosya başının eski hâli platform kodu listesini `apps/api/src/
// errors/domain/*.error.ts`'in ELLE TUTULAN bir AYNASI olarak tanımlıyordu
// ve bu panel kendi EN ALAKALI iki hatasını (`PLATFORM_ADMIN_REQUIRED`,
// `PLATFORM_NETWORK_NOT_ALLOWED`) HİÇ TANIMIYORDU (M7, architect'in ölçtüğü
// "6/32" defekti). Artık DEĞİL: platform ailesinin TAMAMI (32 domain kodu +
// 2 jenerik + storefront kodu, TOPLAM 35 i18n anahtarı — `PLATFORM_ADMIN_
// REQUIRED`/`PLATFORM_NETWORK_NOT_ALLOWED` DAHİL) `packages/errors/src/
// error-message-keys.ts`'in `ERROR_MESSAGE_KEYS` defterinden VE
// `@arkesoft/i18n`'in `tr-TR` kataloğundan MEKANİK olarak çözülür (aşağıdaki
// "ÇÖZÜMLEME MERDİVENİ" bölümü) — elle kopyalanmış İKİNCİ bir platform
// kodu/metin listesi BURADA YOK.
//
// `PANEL_ERROR_CODES`/`ERROR_MESSAGES` artık YALNIZCA Better Auth ailesini
// taşır (ADR-0010:232'nin "ikinci tablo"su) — bu aile KALICI KAPSAM DIŞI:
// `errors.*` anahtarı TAŞIMIYORLAR, doğruluk kaynağı üçüncü taraf
// kütüphanenin KENDİ kaynak kodu, mekanik türetme MÜMKÜN DEĞİL. Metinler
// `apps/admin`'in eşdeğer satırlarıyla BİREBİR aynı tutuldu (tutarlılık
// için, docs/ux/T-021 "Microcopy" bölümünün kendi şartı).
//
// ÖLÇÜLMEYENİ UYDURMAK YASAK: kataloğa yalnızca GERÇEKTEN çağrılabilen Better
// Auth kodları yazılır (apps/admin'in T-016 ölçümünün BİREBİR mirası — aynı
// Better Auth 2FA eklentisi, aynı sürüm). Eksik/yeni bir kod jenerik mesaja
// düşer — `PanelError`'ın hiçbir alanı ham sunucu metni TAŞIMAZ.
import { ERROR_MESSAGE_KEYS } from '@arkesoft/errors'
import type { ErrorMessageKey } from '@arkesoft/errors'
import { createMessageResolver, DEFAULT_LOCALE, TR_TR_ERROR_MESSAGES } from '@arkesoft/i18n'

import { assertNever } from '../errors/assert-never.js'
import type { PanelError } from '../errors/panel-error.js'

/**
 * Kaynak: Better Auth ailesi (ADR-0010:232'nin "ikinci tablo"su, KALICI
 * KAPSAM DIŞI) — `apps/admin/src/messages/messages.ts`'in ÖLÇTÜĞÜ AYNI Better
 * Auth sürümünün 2FA eklentisi — bu panelin GERÇEKTEN çağırdığı uçlarla
 * SINIRLI alt küme (giriş + 2FA doğrulama/kurulum; kayıt/hesap-yönetimi bu
 * panelde YOK, bu yüzden `EMAIL_NOT_VERIFIED` burada YOK — `apps/admin`'in
 * AKSİNE bu panel e-posta doğrulama akışını HİÇ ÇALIŞTIRMAZ).
 */
export const PANEL_ERROR_CODES = [
  'INVALID_ORIGIN',
  // --- Better Auth, GERÇEK uca vurularak ölçüldü ---
  'INVALID_EMAIL_OR_PASSWORD',
  // --- Better Auth `two-factor` eklentisi, apps/admin'in T-016 ölçümünün mirası ---
  'INVALID_CODE',
  'INVALID_BACKUP_CODE',
  'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE',
  'ACCOUNT_TEMPORARILY_LOCKED',
  'INVALID_TWO_FACTOR_COOKIE',
  'INVALID_PASSWORD',
] as const

export type PanelErrorCode = (typeof PANEL_ERROR_CODES)[number]

/**
 * Bilinmeyen kod için jenerik Türkçe mesaj. Kod ASLA ekrana basılmaz
 * (hiçbir mesaj alanı taşınmıyor; panelin sunucudan gelen bir metni basması
 * yapısal olarak İMKÂNSIZ, fail-closed).
 */
const GENERIC_ERROR_MESSAGE = 'Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.'

/**
 * Derleme zamanı KAPALI dünya: tuple'a (`PANEL_ERROR_CODES`) kod eklenip
 * burada mesaj yazılmazsa `tsc --noEmit` KIRILIR.
 */
const ERROR_MESSAGES = {
  INVALID_ORIGIN: 'Bu istek güvenlik nedeniyle reddedildi. Sayfayı yenileyip tekrar deneyin.',
  // Better Auth yanlış parola VE var olmayan kullanıcı için AYNI kodu
  // döndürür (kullanıcı sayımını engellemek için) — `apps/admin`'in AYNI
  // metni, değiştirilmedi (dosyaları karıştırmayan tek metin kümesi).
  INVALID_EMAIL_OR_PASSWORD: 'E-posta veya parola hatalı.',
  INVALID_CODE: 'Kod doğrulanamadı. Uygulamanızdaki güncel kodu girin.',
  INVALID_BACKUP_CODE:
    'Bu yedek kod geçerli değil veya daha önce kullanıldı. Başka bir kod deneyin.',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
    'Bu doğrulama denemesinin süresi doldu. Güvenlik nedeniyle yeniden giriş yapmanız gerekiyor.',
  ACCOUNT_TEMPORARILY_LOCKED:
    'Çok fazla hatalı deneme yapıldı. Hesabınız güvenlik nedeniyle geçici olarak kilitlendi. Lütfen daha sonra tekrar deneyin.',
  INVALID_TWO_FACTOR_COOKIE:
    'Doğrulama süreniz doldu. Güvenliğiniz için tekrar giriş yapmanız gerekiyor.',
  INVALID_PASSWORD: 'Şifreniz doğrulanamadı. Tekrar deneyin.',
} satisfies Record<PanelErrorCode, string>

/**
 * `ACCOUNT_TEMPORARILY_LOCKED` için GERÇEK süreyi (`Retry-After` başlığı,
 * saniye) dakikaya çevirip metne gömer — sunucu sahip OLMADIĞI bir süreyi
 * UYDURMAZ.
 */
export function formatAccountTemporarilyLockedMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return `Çok fazla hatalı deneme yapıldı. Hesabınız güvenlik nedeniyle geçici olarak kilitlendi. ${minutes.toString()} dakika sonra tekrar deneyebilirsiniz.`
}

/**
 * `ERROR_MESSAGES`'ın anahtar sayısı — testin kapalı dünyayı kara-kutu
 * olarak doğrulayabilmesi için dışa açılır.
 */
export const ERROR_MESSAGES_KEY_COUNT = Object.keys(ERROR_MESSAGES).length

/** `code`'un kapalı dünyadaki bir {@link PanelErrorCode} olup olmadığını runtime'da daraltır. */
function isPanelErrorCode(code: string): code is PanelErrorCode {
  return (PANEL_ERROR_CODES as readonly string[]).includes(code)
}

/**
 * Çalışma zamanı AÇIK dünya + güvenli geri düşüş: imza `string` alır — bilinmeyen/
 * yeni bir platform kodu çalışma zamanını KIRMAZ, jenerik Türkçe mesaja düşer.
 */
export function resolveErrorMessage(code: string): string {
  if (isPanelErrorCode(code)) {
    return ERROR_MESSAGES[code]
  }
  return GENERIC_ERROR_MESSAGE
}

/**
 * `requestId` varsa izlenebilirlik satırı üretir ("Destek kodu: …"), yoksa
 * `null` döner — panel sahip OLMADIĞI bir `requestId`'yi UYDURMAZ.
 */
export function formatSupportCodeLine(requestId: string | null): string | null {
  if (requestId === null) {
    return null
  }
  return `Destek kodu: ${requestId}`
}

// ---------------------------------------------------------------------------
// ÇÖZÜMLEME MERDİVENİ (ROADMAP v0.0.18, T-027/S7, architect R-1 KARARI,
// `apps/admin/src/messages/messages.ts`'in AYNI deseni — "tek yazar = yapısal
// tutarlılık", `po`'nun bağlayıcı sırası). `PanelError.known`'ın Türkçe
// metne çözülmesi DÖRT basamaklı:
//   1. `kind: 'unknown'` (kodsuz)                         → jenerik Türkçe.
//   2. `messageKey !== null`                              → TELDEN gelen
//      anahtar `@arkesoft/i18n`'in `tr-TR` kataloğundan çözülür.
//   3. `messageKey === null`, `code` `packages/errors`'ın defterinde KAYITLI
//      → `ERROR_MESSAGE_KEYS[code]` ile anahtara çevrilir, AYNI i18n
//      kataloğundan çözülür. ⚠⚠ Bu basamak bu panel için ÖZELLİKLE kritik:
//      `PLATFORM_ADMIN_REQUIRED`/`PLATFORM_NETWORK_NOT_ALLOWED` artık BU
//      basamaktan (`code` → defter → katalog) MEKANİK olarak çözülür — M7'nin
//      "süper admin paneli kendi en alakalı iki hatasını tanımıyor" defekti
//      burada KAPANIR; bu iki kod `PANEL_ERROR_CODES`'a HİÇ EKLENMEDİ,
//      çözümleme tamamen bu basamaktan gelir.
//   4. `code` bu panelin Better Auth sağlayıcı tablosunda (`PANEL_ERROR_CODES`)
//      KAYITLI → `resolveErrorMessage` (ADR-0010:232'nin KALICI "ikinci
//      tablo"su, bu Task'ın kapsamı DIŞI).
//   5. Aksi hâlde                                          → jenerik Türkçe.

/** 2./3. basamağın ortak çözümleyicisi — `DEFAULT_LOCALE`'e CURRY'lenmiş (A-S5a-1). */
const resolveTrTrErrorMessage = createMessageResolver(
  { [DEFAULT_LOCALE]: TR_TR_ERROR_MESSAGES },
  DEFAULT_LOCALE,
)(DEFAULT_LOCALE)

/**
 * `code`'un `packages/errors`'ın `ERROR_MESSAGE_KEYS` defterinde kayıtlı bir
 * ANAHTARI olup olmadığını runtime'da daraltır (emsal:
 * `apps/storefront/src/themes/registry.ts`'in `isThemeRegistryKey`'i —
 * `Object.hasOwn` tabanlı, AYNI desen).
 */
function isRegisteredPlatformCode(code: string): code is keyof typeof ERROR_MESSAGE_KEYS {
  return Object.hasOwn(ERROR_MESSAGE_KEYS, code)
}

/** Merdivenin tek bir sonucu — EXHAUSTIVE `switch` ile tüketilir (aşağıda). */
type ErrorResolutionStep =
  | { readonly step: 'networkUnknown' }
  | { readonly step: 'wireMessageKey'; readonly messageKey: ErrorMessageKey }
  | { readonly step: 'registryMessageKey'; readonly messageKey: ErrorMessageKey }
  | { readonly step: 'providerCode'; readonly code: PanelErrorCode }
  | { readonly step: 'genericFallback' }

/**
 * `PanelError`'ı merdivenin BEŞ basamağından birine sınıflandırır — saf,
 * AĞSIZ, yan etkisiz. `resolvePanelErrorMessage` bu sınıflandırmayı
 * EXHAUSTIVE `switch` ile metne çevirir.
 */
function classifyErrorResolutionStep(error: PanelError): ErrorResolutionStep {
  if (error.kind === 'unknown') {
    return { step: 'networkUnknown' }
  }

  if (error.messageKey !== null) {
    return { step: 'wireMessageKey', messageKey: error.messageKey }
  }

  if (isRegisteredPlatformCode(error.code)) {
    return { step: 'registryMessageKey', messageKey: ERROR_MESSAGE_KEYS[error.code] }
  }

  if (isPanelErrorCode(error.code)) {
    return { step: 'providerCode', code: error.code }
  }

  return { step: 'genericFallback' }
}

export const MESSAGES = {
  auth: {
    signIn: {
      title: 'Giriş yap',
      emailLabel: 'E-posta adresi',
      passwordLabel: 'Şifre',
      submit: 'Giriş yap',
      submitting: 'Giriş yapılıyor…',
      emailRequired: 'E-posta adresinizi girin.',
      emailInvalid: 'Geçerli bir e-posta adresi girin.',
      passwordRequired: 'Şifrenizi girin.',
      fieldGenericError: 'Bu alanda bir sorun var. Lütfen kontrol edip tekrar deneyin.',
    },
    twoFactor: {
      setupPasswordLabel: 'Şifreniz',
      setupPasswordHelp: 'Güvenliğiniz için şifrenizi tekrar girmenizi istiyoruz.',
      setupPasswordRequired: 'Şifrenizi girin.',
      setupContinue: 'Devam et',
      setupContinuing: 'Doğrulanıyor…',
      manualKeyLabel: 'Manuel anahtar',
      manualKeyInstructions:
        'Authenticator uygulamanızda hesap ekleyin, "manuel giriş" seçin, bu anahtarı yapıştırın.',
      // ROADMAP v0.0.20.1 (T-022/S4, ADR-0024 Karar 5) EKLEMESİ — docs/ux/
      // T-022-iki-faktorlu-kurulumun-surdurulmesi.md "Microcopy"'den BİREBİR
      // alındı. Yalnızca `backupCodes === null` iken (sürdürülen kurulum)
      // gösterilir — "anahtar yenilendi" DEMEZ, anahtarın AYNI kaldığını
      // açıkça söyler (yedek kod yalnızca sınırı belirtir).
      setupResumedNotice:
        'Kurulum zaten başlatılmıştı — aynı anahtarla devam edin; yedek kodlar bu ekranda tekrar gösterilemez.',
      showUriToggle: 'Bağlantıyı göster (gelişmiş kullanıcılar için)',
      copiedStatus: 'Kopyalandı',
      copyFailedStatus: 'Kopyalanamadı',
      codeInputLabel: 'Doğrulama kodu',
      codeRequired: '6 haneli doğrulama kodunu girin.',
      verifyButton: 'Doğrula',
      verifying: 'Doğrulanıyor…',
      backupCodesTitle: 'Bunlar yedek kodlarınız — bir daha gösterilmeyecek.',
      backupCodesSavedCheckbox: 'Bu kodları güvenli bir yere kaydettim',
      backupCodesCopyAll: 'Tümünü kopyala',
      backupCodesDownload: 'Metin dosyası indir',
      backupCodesFileName: 'arkesoft-superadmin-yedek-kodlar.txt',
      setupDoneButton: 'Bitti',
      challengeTitle: 'Hesabınızı doğrulayın',
      backupCodeChallengeTitle: 'Yedek kodunuzu girin',
      backupCodeInputLabel: 'Yedek kod',
      backupCodeRequired: 'Yedek kodunuzu girin.',
      useBackupCodeLink: 'Kodunuz yok mu? Yedek kod kullanın',
      useAuthenticatorLink: 'Authenticator kodunu kullan',
      backToSignIn: 'Girişe dön',
      challengeTimeRemaining: 'Kalan süre: {kalan}',
      challengeOneMinuteRemaining: 'Doğrulama süreniz 1 dakika içinde dolacak.',
      challengeExpiredAnnouncement: 'Doğrulama süreniz doldu.',
      challengeExpiredMessage:
        'Doğrulama süreniz doldu. Güvenliğiniz için tekrar giriş yapmanız gerekiyor.',
    },
  },
  meta: {
    signInTitle: 'Giriş yap · Arkesoft Süper Admin',
    tenantListTitle: 'Mağazalar · Arkesoft Süper Admin',
    auditLogTitle: 'Denetim kaydı · Arkesoft Süper Admin',
    twoFactorWallTitle: 'İki adımlı doğrulama · Arkesoft Süper Admin',
  },
  // ---------------------------------------------------------------------
  // Platform yetkisi/ağ erişimi + kiracı listesi/denetim kaydı —
  // docs/ux/T-021-super-admin-iskeleti.md "Microcopy" bölümünden BİREBİR.
  // ---------------------------------------------------------------------
  platform: {
    unauthorized: {
      title: 'Bu panele erişim yetkiniz yok',
      body: 'Bu panel yalnızca platform yöneticileri içindir.',
    },
    twoFactorWall: {
      title: 'Devam etmeden önce iki adımlı doğrulamayı kurmanız gerekiyor',
      body: 'Platform verisine erişebilmek için önce kendi hesabınızda iki adımlı doğrulamayı kurmanız gerekiyor.',
      startButton: 'Kurulumu başlat',
    },
    networkBlocked: {
      title: 'Bu paneli bulunduğunuz ağdan açamazsınız',
      // `bodyPrefix`/`envVarName`/`bodySuffix` ayrı tutulur ki
      // `NetworkBlockedWall` ortam değişkeni ADINI görsel olarak
      // vurgulayabilsin (`font-semibold`) — allowlist'in İÇERİĞİ (hangi
      // IP'ler izinli) hiçbir alanda YOK.
      bodyPrefix: 'Erişim,',
      envVarName: 'SUPERADMIN_IP_ALLOWLIST',
      bodySuffix:
        'ortam değişkeniyle sınırlandırılmış olabilir — bu değişken boşsa panel tüm ağlardan kapalıdır. Operasyon ekibinizle bu ayarı doğrulayın.',
    },
    tenantList: {
      title: 'Mağazalar',
      caption: 'Mağaza listesi',
      columnName: 'Mağaza adı',
      columnSlug: 'Adres',
      columnPlan: 'Plan',
      columnStatus: 'Durum',
      columnCreatedAt: 'Oluşturulma',
      statusPending: 'Beklemede',
      statusProvisioning: 'Kuruluyor',
      statusActive: 'Aktif',
      statusSuspended: 'Askıya alınmış',
      planUnknown: 'Bilinmiyor',
      emptyTitle: 'Henüz hiç mağaza oluşturulmamış.',
      loadError: 'Mağaza listesi şu anda yüklenemedi.',
    },
    auditLog: {
      title: 'Denetim kaydı',
      columnActor: 'Aktör',
      columnAction: 'Eylem',
      columnSubject: 'Konu',
      columnCreatedAt: 'Zaman',
      actionLogin: 'Giriş yaptı',
      actionTenantAccess: 'Kiracı verisine erişti',
      loadError: 'Denetim kaydı şu anda yüklenemedi.',
    },
  },
  shell: {
    skipToContent: 'İçeriğe geç',
    navLabel: 'Süper admin navigasyonu',
    navTenants: 'Mağazalar',
    navAuditLog: 'Denetim kaydı',
    mobileNavToggleLabel: 'Navigasyonu aç/kapat',
    signOutButton: 'Çıkış yap',
    signingOutButton: 'Çıkış yapılıyor…',
    signOutErrorMessage: 'Çıkış yapılamadı. Lütfen tekrar deneyin.',
    sessionLoadError: 'Bir şeyler ters gitti. Lütfen tekrar deneyin.',
  },
  loading: {
    sessionChecking: 'Oturumunuz doğrulanıyor…',
  },
  errors: {
    retryButton: 'Yeniden dene',
    genericTitle: 'Bir şeyler ters gitti',
    network: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
  },
  common: {
    cancel: 'Vazgeç',
  },
} as const

/**
 * `PanelError` → ekranda gösterilecek Türkçe metin (ROADMAP v0.0.18,
 * T-027/S7, architect R-1 KARARI — ÇÖZÜMLEME MERDİVENİ, yukarıda tanımlı).
 * `classifyErrorResolutionStep` ÖNCE `PanelError`'ı BEŞ basamaktan birine
 * sınıflandırır, bu fonksiyon EXHAUSTIVE `switch` ile metne çevirir.
 */
export function resolvePanelErrorMessage(error: PanelError): string {
  const resolutionStep = classifyErrorResolutionStep(error)

  switch (resolutionStep.step) {
    case 'networkUnknown':
      return MESSAGES.errors.network
    case 'wireMessageKey':
      return resolveTrTrErrorMessage.t(resolutionStep.messageKey)
    case 'registryMessageKey':
      return resolveTrTrErrorMessage.t(resolutionStep.messageKey)
    case 'providerCode':
      return resolveErrorMessage(resolutionStep.code)
    case 'genericFallback':
      return GENERIC_ERROR_MESSAGE
    default:
      return assertNever(resolutionStep, 'messages.ts: ErrorResolutionStep')
  }
}

// @arkesoft/superadmin — Panelin TEK Türkçe mesaj kataloğu (ROADMAP v0.0.20,
// T-021/S8, A-T21-4). Kullanıcıya dönük HİÇBİR Türkçe literal JSX/bileşen
// kodunda yazılmaz — yalnızca burada.
//
// Mekanizma kararı (A-T21-4, `po`): `apps/admin`'inkiyle AYNI mekanizma (düz
// `PanelErrorCode → Türkçe metin` eşlemesi, kapalı dünya) ama AYRI bir
// dosya — `apps/admin`'e bağımlılık CLAUDE.md §3'ün yönünü ihlal eder.
// Metinler admin'in eşdeğer satırlarıyla BİREBİR aynı tutuldu (tutarlılık
// için, docs/ux/T-021 "Microcopy" bölümünün kendi şartı).
//
// DÜRÜST KAYIT: `apps/superadmin` `@arkesoft/api`'ye bağımlı OLAMAZ
// (CLAUDE.md §3). Aşağıdaki platform kodu listesi `apps/api/src/errors/
// domain/*.error.ts`'in ELLE TUTULAN bir AYNASIDIR — doğruluk kaynağı HER
// ZAMAN o dizin (+ `packages/errors/src/error-body.ts`'in iki jenerik kodu).
//
// ÖLÇÜLMEYENİ UYDURMAK YASAK: kataloğa yalnızca GERÇEKTEN çağrılabilen uç
// kodları yazılır (apps/admin'in T-016 ölçümünün BİREBİR mirası — aynı
// Better Auth 2FA eklentisi, aynı sürüm). Eksik/yeni bir kod jenerik mesaja
// düşer — `PanelError`'ın hiçbir alanı ham sunucu metni TAŞIMAZ.
import { assertNever } from '../errors/assert-never.js'
import type { PanelError } from '../errors/panel-error.js'

/**
 * Kaynak: `apps/admin/src/messages/messages.ts`'in ÖLÇTÜĞÜ aynı iki kaynak
 * (`apps/api/src/errors/domain/*.error.ts` + `packages/errors/src/
 * error-body.ts`) ve AYNI Better Auth sürümünün 2FA eklentisi — bu panelin
 * GERÇEKTEN çağırdığı uçlarla SINIRLI alt küme (giriş + 2FA doğrulama/
 * kurulum; kayıt/hesap-yönetimi bu panelde YOK).
 */
export const PANEL_ERROR_CODES = [
  'UNAUTHENTICATED',
  'RATE_LIMIT_EXCEEDED',
  'INVALID_ORIGIN',
  'HTTP_EXCEPTION',
  'INTERNAL_ERROR',
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
  UNAUTHENTICATED: 'Bu işlemi yapabilmek için giriş yapmanız gerekiyor.',
  RATE_LIMIT_EXCEEDED: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.',
  INVALID_ORIGIN: 'Bu istek güvenlik nedeniyle reddedildi. Sayfayı yenileyip tekrar deneyin.',
  HTTP_EXCEPTION: 'İsteğiniz işlenemedi. Lütfen tekrar deneyin.',
  INTERNAL_ERROR: 'Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
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
 * `PanelError` → ekranda gösterilecek Türkçe metin. `kind: 'known'` ise
 * {@link resolveErrorMessage} (kapalı dünya + güvenli geri düşüş, kod ASLA
 * ekrana basılmaz); `kind: 'unknown'` HİÇBİR kod taşımaz →
 * `MESSAGES.errors.network`.
 */
export function resolvePanelErrorMessage(error: PanelError): string {
  switch (error.kind) {
    case 'known':
      return resolveErrorMessage(error.code)
    case 'unknown':
      return MESSAGES.errors.network
    default:
      return assertNever(error, 'messages.ts: PanelError.kind')
  }
}

// @arkesoft/admin — Panelin TEK Türkçe mesaj kataloğu (ROADMAP v0.0.7,
// T-008/S4, architect K4). Kullanıcıya dönük HİÇBİR Türkçe literal
// JSX/bileşen kodunda yazılmaz — yalnızca burada (V3: `packages/i18n`
// v0.0.18'e kadar bu modül panelin TEK doğruluk kaynağıdır).
//
// SIRALI PAYLAŞIMLI dosya — bu alt görev BİRİNCİL yazıcıdır. S5 bu dosyaya
// YALNIZCA EKLER (ekran metinleri: boş durum, form etiketleri, buton +
// A-A5'in gerçek uca vurarak ölçeceği ek giriş hatası kodları).
// `resolveErrorMessage`'ın GÖVDESİ ve kapalı dünya (`PANEL_ERROR_CODES` +
// `ERROR_MESSAGES`) burada DEĞİŞMEZ — S5 yalnızca satır ekler.
//
// DÜRÜST KAYIT (architect K4): `apps/admin` `@arkesoft/api`'ye bağımlı
// OLAMAZ (CLAUDE.md §3 — bağımlılık yönü apps/* → packages/*, başka bir
// apps/* paketine ASLA) → aşağıdaki platform kodu listesi
// `apps/api/src/errors/domain/*.error.ts`'in ELLE TUTULAN bir AYNASIDIR;
// otomatik çapraz kontrol MÜMKÜN DEĞİL. Doğruluk kaynağı HER ZAMAN o dizin
// (+ `packages/errors/src/error-body.ts`'in iki jenerik kodu). Yeni borç:
// bu kayıt defteri `packages/errors`'a taşınmalı (vade v0.0.18, sorumlu
// architect — bkz. ROADMAP).
//
// ÖLÇÜLMEYENİ UYDURMAK YASAK (architect K4): kataloğa yalnızca GERÇEKTEN
// grep edilen platform kodları ve GERÇEK uca vurularak ölçülen Better Auth
// kodları yazılır. Eksik/yeni bir kod jenerik mesaja düşer — AC8 YİNE
// geçer, çünkü `PanelError`'ın hiçbir alanı ham sunucu metni TAŞIMAZ
// (bkz. ../errors/panel-error.ts).

/**
 * Kaynak — 2026-10-31 tarihinde grep edildi:
 *   - `apps/api/src/errors/domain/*.error.ts` (15 dosya, 15 kod)
 *   - `packages/errors/src/error-body.ts` → `genericTransportErrorBody`
 *     (`HTTP_EXCEPTION`) + `unknownErrorBody` (`INTERNAL_ERROR`) (2 kod)
 *   = 17 platform kodu.
 * Ayrıca GERÇEK uca vurularak ölçülen üç Better Auth kodu (S3/backend,
 * architect K3 + bu alt görevin handoff'u): `INVALID_EMAIL_OR_PASSWORD`
 * (401), `EMAIL_NOT_VERIFIED` (403 — platform listesinde de VAR, aynı
 * semantik, TEK satır), `INVALID_ORIGIN` (403).
 */
// DÜZELTME TURU 2 (`solid` L-N8 — bağlayıcı): `import type` burada, dosya
// BAŞINDA (diğer tüm modüllerin konvansiyonu — `L-N8`'in şikayet ettiği
// "259 satırlık dosyanın 242. satırı" sapması düzeltildi). `assertNever`
// `resolvePanelErrorMessage`'ın EXHAUSTIVE `switch`'i için (aşağıda).
import type { PanelError } from '../errors/panel-error.js'

import { assertNever } from '../errors/assert-never.js'

// GÜNCELLEME (ROADMAP v0.0.15, T-016/S10, 2026-11-06): ALTI yeni Better Auth
// kodu EKLENDİ — `better-auth@1.7.14`'ün `plugins/two-factor` kaynağı
// DOĞRUDAN OKUNARAK ölçüldü (`node_modules/.pnpm/.../plugins/two-factor/
// {error-code,totp/index,backup-codes/index}.mjs`, `@better-auth/core`'un
// `BASE_ERROR_CODES.INVALID_PASSWORD`) — docs/ux/T-016'nın kategori (2)
// disiplini (HTTP ile canlı DOĞRULANMADI, kaynak kodundan ÖLÇÜLDÜ).
export const PANEL_ERROR_CODES = [
  // --- apps/api/src/errors/domain/*.error.ts (15) ---
  'AUTH_PROVIDER_FAILED',
  'CROSS_SITE_REQUEST_REJECTED',
  'DEPENDENCY_UNAVAILABLE',
  'EMAIL_NOT_VERIFIED',
  'MAIL_DELIVERY_FAILED',
  'RATE_LIMIT_STORE_UNAVAILABLE',
  'REQUEST_CONTEXT_UNAVAILABLE',
  'RATE_LIMIT_EXCEEDED',
  'TENANT_MEMBERSHIP_REQUIRED',
  'SESSION_NOT_FOUND',
  'TENANT_NOT_FOUND',
  'TENANT_CONTEXT_REQUIRED',
  'TENANT_RESOLUTION_FAILED',
  'UNAUTHENTICATED',
  'VALIDATION_ERROR',
  // --- packages/errors/src/error-body.ts jenerik kodları (2) ---
  'HTTP_EXCEPTION',
  'INTERNAL_ERROR',
  // --- Better Auth, GERÇEK uca vurularak ölçüldü (3) ---
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_ORIGIN',
  // --- Better Auth `two-factor` eklentisi, KAYNAK KODU okunarak ölçüldü (6) ---
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
 * (architect K3 madde 1 — hiçbir mesaj alanı taşınmıyor; panelin sunucudan
 * gelen bir metni basması yapısal olarak imkânsız, fail-closed).
 */
const GENERIC_ERROR_MESSAGE = 'Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.'

/**
 * Derleme zamanı KAPALI dünya: tuple'a (`PANEL_ERROR_CODES`) kod eklenip
 * burada mesaj yazılmazsa `tsc --noEmit` KIRILIR (`satisfies
 * Record<PanelErrorCode, string>` — tersi de: fazladan bir mesaj anahtarı
 * da kırılır).
 */
const ERROR_MESSAGES = {
  AUTH_PROVIDER_FAILED:
    'Kimlik doğrulama sağlayıcısında beklenmeyen bir sorun oluştu. Lütfen daha sonra tekrar deneyin.',
  CROSS_SITE_REQUEST_REJECTED:
    'Bu istek güvenlik nedeniyle reddedildi. Sayfayı yenileyip tekrar deneyin.',
  DEPENDENCY_UNAVAILABLE:
    'Sistem şu anda geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
  EMAIL_NOT_VERIFIED:
    'Hesabınızın e-posta adresi henüz doğrulanmadı. Giriş yapabilmek için e-postanızı doğrulayın.',
  MAIL_DELIVERY_FAILED: 'E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin.',
  RATE_LIMIT_STORE_UNAVAILABLE: 'Sistem şu anda yoğun. Lütfen birkaç dakika sonra tekrar deneyin.',
  REQUEST_CONTEXT_UNAVAILABLE: 'İsteğiniz işlenemedi. Lütfen sayfayı yenileyip tekrar deneyin.',
  RATE_LIMIT_EXCEEDED: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.',
  TENANT_MEMBERSHIP_REQUIRED: 'Bu işlem için bir mağazaya üye olmanız gerekiyor.',
  SESSION_NOT_FOUND: 'Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.',
  TENANT_NOT_FOUND: 'İstenen mağaza bulunamadı.',
  TENANT_CONTEXT_REQUIRED: 'Bu işlem için mağaza bağlamı gerekiyor.',
  TENANT_RESOLUTION_FAILED:
    'Mağaza bilgisi şu anda çözümlenemedi. Lütfen daha sonra tekrar deneyin.',
  UNAUTHENTICATED: 'Bu işlemi yapabilmek için giriş yapmanız gerekiyor.',
  VALIDATION_ERROR:
    'Girdiğiniz bilgilerde bir sorun var. Lütfen alanları kontrol edip tekrar deneyin.',
  HTTP_EXCEPTION: 'İsteğiniz işlenemedi. Lütfen tekrar deneyin.',
  INTERNAL_ERROR: 'Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
  // Better Auth yanlış parola VE var olmayan kullanıcı için AYNI kodu
  // döndürür (kullanıcı sayımını — enumeration — bilinçli engeller). Bu
  // Türkçe metin de o ayrımı SIZDIRMAZ; "böyle bir kullanıcı yok" YAZMAZ.
  //
  // DÜZELTME TURU 1 (`wcag` low 8g — DEĞERLENDİRİLDİ, BU METİN
  // DEĞİŞTİRİLMEDİ): terminoloji tutarsızlığı GERÇEK ("parola" burada vs.
  // "Şifre" `passwordLabel`/`passwordRequired`'da) ama bu METNİ "şifre"ye
  // çevirmek `qa`'nın DOKUNULAMAYAN `qa-blind-spot-and-negative-scenarios.
  // qa.spec.ts:302,326`'sındaki `page.getByText('E-posta veya parola
  // hatalı.')` pinini KIRAR (ÖLÇÜLDÜ — `pnpm --filter @arkesoft/admin test`
  // bunu yakaladı, geri alındı). Tersi yön (`passwordLabel`'ı "Parola"ya
  // çevirmek) AYNI dosyadaki `page.getByLabel('Şifre')` çağrılarını (ör.
  // satır 323) VE bu paketin KENDİ `panel-flow.spec.ts`'ini kırardı. Seçim:
  // BU TURDA DEĞİŞTİRME — `qa`'nın immutable test dosyası elindeyken
  // güvenle yapılabilecek tek yön yok. RİSKLER'e taşındı.
  INVALID_EMAIL_OR_PASSWORD: 'E-posta veya parola hatalı.',
  INVALID_ORIGIN: 'Bu istek güvenlik nedeniyle reddedildi. Sayfayı yenileyip tekrar deneyin.',
  // --- ROADMAP v0.0.15, T-016/S10 EKLEMESİ — metinler docs/ux/T-016'nın
  // "Hata durumları"/"Microcopy" tablolarından BİREBİR alındı. ---
  INVALID_CODE: 'Kod doğrulanamadı. Uygulamanızdaki güncel kodu girin.',
  INVALID_BACKUP_CODE:
    'Bu yedek kod geçerli değil veya daha önce kullanıldı. Başka bir kod deneyin.',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
    'Bu doğrulama denemesinin süresi doldu. Güvenlik nedeniyle yeniden giriş yapmanız gerekiyor.',
  // Dakika sayısı GERÇEK `Retry-After` başlığından geliyorsa
  // `formatAccountTemporarilyLockedMessage` kullanılır (aşağıda) — bu satır
  // başlık okunamadığı durumlar için jenerik geri düşüştür (sabit "15"
  // GÖMÜLMEZ, ux'in şartı).
  ACCOUNT_TEMPORARILY_LOCKED:
    'Çok fazla hatalı deneme yapıldı. Hesabınız güvenlik nedeniyle geçici olarak kilitlendi. Lütfen daha sonra tekrar deneyin.',
  INVALID_TWO_FACTOR_COOKIE:
    'Doğrulama süreniz doldu. Güvenliğiniz için tekrar giriş yapmanız gerekiyor.',
  INVALID_PASSWORD: 'Şifreniz doğrulanamadı. Tekrar deneyin.',
} satisfies Record<PanelErrorCode, string>

/**
 * `ACCOUNT_TEMPORARILY_LOCKED` için GERÇEK süreyi (`Retry-After` başlığı,
 * saniye) dakikaya çevirip metne gömer — ux'in şartı: "{dakika} sunucunun
 * Retry-After başlığından hesaplanır, sabit '15' gömülmez". `retryAfterSeconds`
 * `null` ise çağıran {@link ERROR_MESSAGES}.ACCOUNT_TEMPORARILY_LOCKED'ın
 * jenerik (dakikasız) metnini kullanmalı — bu fonksiyon o durumu temsil ETMEZ.
 */
export function formatAccountTemporarilyLockedMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return `Çok fazla hatalı deneme yapıldı. Hesabınız güvenlik nedeniyle geçici olarak kilitlendi. ${minutes.toString()} dakika sonra tekrar deneyebilirsiniz.`
}

/**
 * `ERROR_MESSAGES`'ın anahtar sayısı — testin kapalı dünyayı (her kodun TAM
 * bir mesajı olduğunu) kara-kutu olarak doğrulayabilmesi için dışa açılır.
 * `satisfies Record<PanelErrorCode, string>` bunu DERLEME zamanında zaten
 * garanti eder; bu sayaç çalışma zamanı testinin bağımsız kanıtıdır.
 */
export const ERROR_MESSAGES_KEY_COUNT = Object.keys(ERROR_MESSAGES).length

/** `code`'un kapalı dünyadaki bir {@link PanelErrorCode} olup olmadığını runtime'da daraltır. */
function isPanelErrorCode(code: string): code is PanelErrorCode {
  return (PANEL_ERROR_CODES as readonly string[]).includes(code)
}

/**
 * Çalışma zamanı AÇIK dünya + güvenli geri düşüş: imza `string` alır (bir
 * {@link PanelErrorCode} DEĞİL) — bilinmeyen/yeni bir platform kodu çalışma
 * zamanını KIRMAZ, jenerik Türkçe mesaja düşer. Kod hiçbir koşulda ekrana
 * basılmaz.
 */
export function resolveErrorMessage(code: string): string {
  if (isPanelErrorCode(code)) {
    return ERROR_MESSAGES[code]
  }
  return GENERIC_ERROR_MESSAGE
}

/**
 * `requestId` varsa izlenebilirlik satırı üretir ("Destek kodu: …"), yoksa
 * `null` döner — panel sahip OLMADIĞI bir `requestId`'yi UYDURMAZ (borç 1445
 * kısıtı). Render tarafı (S5) bu satırı, varsa, mesajın altına ekler.
 */
export function formatSupportCodeLine(requestId: string | null): string | null {
  if (requestId === null) {
    return null
  }
  return `Destek kodu: ${requestId}`
}

// ---------------------------------------------------------------------------
// S5 EKLEMESİ (ROADMAP v0.0.7, T-008/S5) — bu bölümün ÜSTÜNDEKİ hiçbir satır
// değişmedi (yukarıdaki dosya başı yorumu: "yalnızca EKLER"). Ekran metinleri
// (boş durum, form etiketleri, buton metinleri, hata ekranı başlıkları,
// gezinme etiketleri) `docs/ux/T-008.md`'nin "Microcopy" bölümünden BİREBİR
// alındı. Kullanıcıya dönük HİÇBİR Türkçe literal `routes/**`/`components/**`
// içinde yazılmaz — hepsi burada, `MESSAGES` altında.
//
// `errors.network` — `resolveErrorMessage(code: string)` BİR KOD alır;
// gerçek bir ağ hatasında (fetch() bir yanıt ALMADAN fırlar, ör.
// `auth-rest.ts`/`transport-aware-fetch.ts`'in sarmadığı çıplak bağlantı
// reddi) elde HİÇBİR kod YOKTUR — `PanelError`'ın `kind: 'unknown'` dalı da
// aynı şekilde kodsuzdur. Bu satır UX'in "(ağ hatası / istek hiç
// tamamlanamadı)" satırındaki metni BİREBİR taşır; `resolveErrorMessage`'ın
// `GENERIC_ERROR_MESSAGE`'ıyla KASITLI olarak AYNI DEĞİL (o, "kod bilinen ama
// katalogda yok" durumu için; bu, "kod hiç yok" durumu için — UX ikisini ayrı
// satır olarak tasarladı, bkz. docs/ux/T-008.md "Hata durumları").
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
      // DÜZELTME TURU 1 (`solid` M5 ║ `wcag` M3 — bağlayıcı): Zod'un
      // `issue.code`'u ileride tanınmayan bir koda genişlerse alan hatası
      // artık SESSİZCE kaybolmaz — bu jenerik ama GÖRÜNÜR mesaja düşer
      // (`resolveErrorMessage`'ın güvenli geri düşüş deseninin aynısı).
      fieldGenericError: 'Bu alanda bir sorun var. Lütfen kontrol edip tekrar deneyin.',
    },
    // ROADMAP v0.0.15 (T-016/S10) EKLEMESİ — bkz. dosyanın altındaki "S10
    // EKLEMESİ" bloğu, docs/ux/T-016 "Microcopy"'den BİREBİR alındı.
    twoFactor: {
      setupPasswordLabel: 'Şifreniz',
      setupPasswordHelp: 'Güvenliğiniz için şifrenizi tekrar girmenizi istiyoruz.',
      setupPasswordRequired: 'Şifrenizi girin.',
      setupContinue: 'Devam et',
      setupContinuing: 'Doğrulanıyor…',
      manualKeyLabel: 'Manuel anahtar',
      manualKeyInstructions:
        'Authenticator uygulamanızda hesap ekleyin, "manuel giriş" seçin, bu anahtarı yapıştırın.',
      showUriToggle: 'Bağlantıyı göster (gelişmiş kullanıcılar için)',
      copyButton: 'Kopyala',
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
      backupCodesFileName: 'arkesoft-yedek-kodlar.txt',
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
    signInTitle: 'Giriş yap · Arkesoft Panel',
    dashboardTitle: 'Panel · Arkesoft Panel',
  },
  loading: {
    sessionChecking: 'Oturumunuz doğrulanıyor…',
    genericBody: 'Yükleniyor…',
  },
  dashboard: {
    title: 'Panel',
    empty: {
      heading: 'Panel şu anda boş',
      body: 'Ürün, sipariş ve mağaza ayarları gibi yönetim ekranları bu panele adım adım ekleniyor. Şu an burada yapabileceğiniz bir işlem yok. Yeni bir bölüm eklendiğinde, giriş yaptığınızda burada göreceksiniz.',
    },
  },
  // DÜZELTME TURU 1 (`wcag` low 8c): `AppShell`'in atlama (skip) bağlantısı.
  appShell: {
    skipToContent: 'İçeriğe geç',
  },
  sidebar: {
    navLabel: 'Panel navigasyonu',
    panel: 'Panel',
    // ROADMAP v0.0.15 (T-016/S10) EKLEMESİ — `/hesap/guvenlik` rotasının
    // erişim noktası (2FA kişisel bir ayar, RBAC'a tabi DEĞİL).
    accountSecurity: 'Hesap güvenliği',
  },
  topbar: {
    noStoreSelected: 'Mağaza seçilmedi',
    userMenu: {
      trigger: 'Kullanıcı menüsü',
    },
  },
  userMenu: {
    signOut: 'Çıkış yap',
    signingOut: 'Çıkış yapılıyor…',
    signOutError: 'Çıkış yapılamadı. Lütfen tekrar deneyin.',
  },
  errors: {
    retryButton: 'Tekrar dene',
    genericTitle: 'Bir sorun oluştu',
    network: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
  },
  // ---------------------------------------------------------------------
  // ROADMAP v0.0.15 (T-016/S10) EKLEMESİ — docs/ux/T-016-iki-faktorlu-
  // dogrulama.md "Microcopy" bölümünden BİREBİR alındı (anahtar kökleri
  // o belgenin önerdiği `account.security.twoFactor.*`/`auth.twoFactor.*`
  // ile TUTARLI, bu dosyanın düz nesne yapısına uyarlanmış).
  // ---------------------------------------------------------------------
  common: {
    confirm: 'Devam et',
    cancel: 'Vazgeç',
    // wcag FIX turu 1/W-2 (medium bulgusu) — `ConfirmDialog`'un × kapatma
    // ikonu ESKİDEN `cancelLabel` ("Vazgeç") ile AYNI erişilebilir adı
    // taşıyordu (WCAG 2.5.3/4.1.2). Ayrı, görseli metinle TUTARLI bir ad.
    close: 'Kapat',
  },
  accountSecurity: {
    title: 'Hesap güvenliği',
    twoFactor: {
      statusOffTitle: 'İki adımlı doğrulama: Kapalı',
      // VARSAYIM(T-016/S10): ux/ui bu açıklama cümlesinin TAM metnini
      // vermedi ("+ kısa açıklama" demekle yetindi) — bu cümle BU alt
      // görevin kendi önerisidir, ux/docs onaylamalı.
      statusOffDescription: 'Hesabınıza girişte şifrenize ek olarak bir doğrulama kodu istenir.',
      statusOnTitle: 'İki adımlı doğrulama: Açık',
      enableButton: 'Etkinleştir',
      disableButton: 'Devre dışı bırak',
      disabling: 'Devre dışı bırakılıyor…',
      regenerateBackupCodesButton: 'Yeni yedek kodlar oluştur',
      regenerating: 'Oluşturuluyor…',
      disableConfirmTitle: 'İki adımlı doğrulamayı devre dışı bırak',
      disableConfirmBody:
        "2FA'yı devre dışı bırakırsanız hesabınız yalnızca şifreyle korunur. Devam edilsin mi?",
      regenerateConfirmTitle: 'Yeni yedek kodlar oluştur',
      regenerateConfirmBody:
        'Yeni kodlar oluşturursanız eski yedek kodlarınız artık çalışmaz. Devam edilsin mi?',
      cardLoadError: 'Güvenlik ayarlarınız şu anda yüklenemedi.',
    },
    // -------------------------------------------------------------------
    // ROADMAP v0.0.15.1 (T-017/S11) EKLEMESİ — docs/ux/T-017 "Microcopy"
    // bölümünden BİREBİR alındı (`accountSecurity.sessions.*` kökü, ux/ui'nin
    // önerdiği gibi `accountSecurity.twoFactor.*`'ın KARDEŞİ). Üç istisna,
    // RİSKLER'de gerekçelendirilmiştir: (1) `deviceLabels`/`osLabels` İKİ
    // KÜÇÜK SÖZLÜK — ux/ui bunları "iki kapalı sözlük" olarak TARİF ETTİ
    // ama TAM metinlerini vermedi (marka adları) — bu alt görevin KENDİ
    // önerisidir, `docs` onaylamalı. (2) `lastSeenMinutesAgo`/
    // `lastSeenHoursAgo`/`lastSeenDaysAgo` — ux'in `{süre}` yer tutucusunun
    // GERÇEK bağıl zaman metnini üretmek için gereken üç bucket şablonu, ux
    // yalnızca "Az önce" örneğini verdi — bu alt görevin ÖNERİSİ. (3)
    // `ipUnknown` — ui planının RİSKLER #5'inin önerisi, ux'te YOK.
    sessions: {
      title: 'Aktif oturumlar',
      currentDeviceBadge: 'Bu cihaz',
      ipLabel: 'IP adresi: {ip}',
      ipUnknown: 'Bilinmiyor',
      lastSeenLabel: 'Son görülme: {süre}',
      lastSeenJustNow: 'Az önce',
      // VARSAYIM (bu alt görevin önerisi — ux/ui'nin `{süre}` yer tutucusu
      // için GEREKTİRDİĞİ ama METNİNİ vermediği üç bucket).
      lastSeenMinutesAgo: '{dakika} dakika önce',
      lastSeenHoursAgo: '{saat} saat önce',
      lastSeenDaysAgo: '{gun} gün önce',
      deviceUnknown: 'Bilinmeyen cihaz',
      browserUnknown: 'Bilinmeyen tarayıcı',
      osUnknown: 'Bilinmeyen işletim sistemi',
      // VARSAYIM (bu alt görevin önerisi — `device-label.ts`'in kapalı-dünya
      // tarayıcı/İS ailelerinin GERÇEK marka adları; `docs` onaylamalı).
      // `other`/`unknown` İÇİN satır YOK — `browserUnknown`/`osUnknown` ile
      // AYNI metne eşlenir (ui planının KARARI, docs/ui/T-017:97 satırı).
      deviceLabels: {
        chrome: 'Chrome',
        firefox: 'Firefox',
        safari: 'Safari',
        edge: 'Edge',
        opera: 'Opera',
        samsung: 'Samsung Internet',
      },
      osLabels: {
        windows: 'Windows',
        macos: 'macOS',
        linux: 'Linux',
        ios: 'iOS',
        android: 'Android',
      },
      terminateButton: 'Sonlandır',
      terminateAccessibleName: '{cihaz} oturumunu sonlandır (IP {ip}, son görülme {süre})',
      terminateSuccess: '{cihaz} oturumu sonlandırıldı.',
      onlyThisDeviceNote: 'Şu anda yalnızca bu cihazdan giriş yapmışsınız.',
      terminateAllButton: 'Tüm oturumları sonlandır',
      cardLoadError: 'Aktif oturumlarınız şu anda yüklenemedi.',
      stepUpTitleSingle: 'Oturumu sonlandır',
      stepUpBodySingle:
        '{cihaz} · IP {ip} · son görülme {süre} oturumunu sonlandırmak üzeresiniz. Devam etmek için şifrenizi girin.',
      stepUpConfirmSingle: 'Sonlandır',
      stepUpTitleAll: 'Tüm oturumları sonlandır',
      stepUpBodyAll:
        'Bu işlem, şu anda kullandığınız bu cihaz dahil TÜM oturumları kapatacak. Devam ederseniz hemen çıkış yapılacak ve yeniden giriş yapmanız gerekecek. Onaylamak için şifrenizi girin.',
      stepUpConfirmAll: 'Tüm oturumları sonlandır ve çıkış yap',
      stepUpPasswordLabel: 'Şifreniz',
      stepUpSubmitting: 'Doğrulanıyor…',
      // KARAR (frontend, S11 — bkz. ActiveSessionsCard.tsx dosya başı yorumu,
      // RİSKLER ③): 404 `SESSION_NOT_FOUND` durumunda `ConfirmDialog`
      // DEĞİŞTİRİLMEDEN, diyalog OTOMATİK kapanır — bu metin artık
      // `ConfirmDialog`'un "Kapat" butonu DEĞİL, kart içi bildirimin kendi
      // kapatma düğmesi için kullanılır (AYNI anlam, farklı yer).
      sessionGoneClose: 'Kapat',
      sessionGoneNotice: 'Bu oturum artık mevcut değil. Liste güncellendi.',
    },
  },
} as const

// ---------------------------------------------------------------------------
// DÜZELTME TURU 1 (`solid` M5 — bağlayıcı, architect K4'ün API boşluğu
// teşhisi): `_app.tsx:38-43` ve `_auth.sign-in.tsx:42-47` BİREBİR AYNI küçük
// yardımcıyı İKİ KOPYA olarak taşıyordu — kök neden gerçek bir API boşluğuydu
// (`resolveErrorMessage` bir KOD ister, `GENERIC_ERROR_MESSAGE` private'tı,
// `PanelError`'ın `kind: 'unknown'` dalı kodsuzdu). Tek doğruluk kaynağı
// burada: iki kopya silindi, ikisi de bu fonksiyonu çağırıyor.

/**
 * `PanelError` → ekranda gösterilecek Türkçe metin. `kind: 'known'` ise
 * {@link resolveErrorMessage} (kapalı dünya + güvenli geri düşüş, kod ASLA
 * ekrana basılmaz); `kind: 'unknown'` HİÇBİR kod taşımaz (gerçek ağ hatası /
 * istek hiç tamamlanamadı YA DA tanınmayan gövde) → `MESSAGES.errors.network`.
 * `PanelError`'ın hiçbir alanı ham sunucu metni TAŞIMAZ (bkz.
 * ../errors/panel-error.ts) — bu fonksiyon da aynı fail-closed garantiyi
 * korur; AC8 bu yapısal garantiden BAĞIMSIZ olarak hâlâ sağlanıyor.
 *
 * DÜZELTME TURU 2 (`solid` L-N8 — bağlayıcı, CLAUDE.md §4): `if`/`return`
 * yerine EXHAUSTIVE `switch` + `assertNever` — `PanelError`'a üçüncü bir
 * `kind` eklenirse (bugün yok) bu fonksiyon artık SESSİZCE
 * `MESSAGES.errors.network`'e DÜŞMEZ, `pnpm typecheck` KIRILIR.
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

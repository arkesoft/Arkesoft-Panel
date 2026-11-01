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
} satisfies Record<PanelErrorCode, string>

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

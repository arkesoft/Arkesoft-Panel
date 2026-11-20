// @arkesoft/admin — Panelin TEK Türkçe mesaj kataloğu (ROADMAP v0.0.7,
// T-008/S4, architect K4). Kullanıcıya dönük HİÇBİR Türkçe literal
// JSX/bileşen kodunda yazılmaz — yalnızca burada.
//
// SIRALI PAYLAŞIMLI dosya — bu alt görev BİRİNCİL yazıcıdır. S5 bu dosyaya
// YALNIZCA EKLER (ekran metinleri: boş durum, form etiketleri, buton +
// A-A5'in gerçek uca vurarak ölçeceği ek giriş hatası kodları).
//
// ⚠⚠ GÜNCELLEME (ROADMAP v0.0.18, T-027/S7, architect R-1 KARARI) — borç
// KAPANDI: dosya başının eski hâli bu modülü "`packages/i18n` v0.0.18'e
// kadar panelin TEK doğruluk kaynağı" ve platform kodu listesini
// "`apps/api/src/errors/domain/*.error.ts`'in ELLE TUTULAN bir AYNASI;
// otomatik çapraz kontrol MÜMKÜN DEĞİL" olarak tanımlıyordu. Artık DEĞİL:
// platform ailesi (32 domain kodu + 2 jenerik + storefront kodu, TOPLAM 35
// i18n anahtarı) `packages/errors/src/error-message-keys.ts`'in
// `ERROR_MESSAGE_KEYS` defterinden VE `@arkesoft/i18n`'in `tr-TR`
// kataloğundan (`TR_TR_ERROR_MESSAGES`) MEKANİK olarak çözülür (aşağıdaki
// "ÇÖZÜMLEME MERDİVENİ" bölümü) — elle kopyalanmış İKİNCİ bir platform
// kodu/metin listesi BURADA YOK.
//
// `PANEL_ERROR_CODES`/`ERROR_MESSAGES` artık YALNIZCA Better Auth ailesini
// taşır (ADR-0010:232'nin "ikinci tablo"su) — bu aile KALICI KAPSAM DIŞI:
// `errors.*` anahtarı TAŞIMIYORLAR, doğruluk kaynağı üçüncü taraf
// kütüphanenin KENDİ kaynak kodu, mekanik türetme MÜMKÜN DEĞİL. Aşağıdaki
// liste hâlâ ELLE TUTULAN bir ölçümdür (GERÇEK uca vurularak/kaynak kodu
// okunarak) ama kapsamı artık yalnızca bu KALICI aileyle SINIRLI.
//
// ÖLÇÜLMEYENİ UYDURMAK YASAK (architect K4): kataloğa yalnızca GERÇEK uca
// vurularak ölçülen Better Auth kodları yazılır. Eksik/yeni bir kod jenerik
// mesaja düşer — AC8 YİNE geçer, çünkü `PanelError`'ın hiçbir alanı ham
// sunucu metni TAŞIMAZ (bkz. ../errors/panel-error.ts).

/**
 * Kaynak — Better Auth ailesi (ADR-0010:232'nin "ikinci tablo"su, KALICI
 * KAPSAM DIŞI — bkz. dosya başı yorumu). ⚠⚠ Platform ailesi (eski 17 kod:
 * 15 domain + 2 jenerik) 2026-11-19'da (ROADMAP v0.0.18, T-027/S7) BURADAN
 * KALDIRILDI — artık `resolvePanelErrorMessage`'ın ÇÖZÜMLEME MERDİVENİ'nin
 * 2./3. basamağından `packages/errors`/`@arkesoft/i18n` üzerinden MEKANİK
 * olarak gelir (aşağıda). `EMAIL_NOT_VERIFIED` İSTİSNA — platform ailesinde
 * DE kayıtlı (`ERROR_MESSAGE_KEYS.EMAIL_NOT_VERIFIED`) ama GERÇEK uca
 * vurularak Better Auth'un KENDİSİNDEN de doğrudan dönebildiği ÖLÇÜLDÜĞÜ
 * için burada da KALDI — iki yoldan da AYNI metne ulaşır (`tr-tr-errors.ts`
 * BİREBİR aynı dize taşır).
 *   - GERÇEK uca vurularak ölçülen üç Better Auth kodu (S3/backend,
 *     architect K3): `INVALID_EMAIL_OR_PASSWORD` (401), `EMAIL_NOT_VERIFIED`
 *     (403), `INVALID_ORIGIN` (403).
 *   - `better-auth@1.7.14`'ün `plugins/two-factor` KAYNAK KODU okunarak
 *     ölçülen altı kod (ROADMAP v0.0.15, T-016/S10, 2026-11-06):
 *     `INVALID_CODE`, `INVALID_BACKUP_CODE`,
 *     `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`, `ACCOUNT_TEMPORARILY_LOCKED`,
 *     `INVALID_TWO_FACTOR_COOKIE`, `INVALID_PASSWORD`.
 *   = 9 Better Auth kodu (architect'in ölçtüğü "Better Auth ailesi (9)").
 */
// DÜZELTME TURU 2 (`solid` L-N8 — bağlayıcı): `import type` burada, dosya
// BAŞINDA (diğer tüm modüllerin konvansiyonu — `L-N8`'in şikayet ettiği
// "259 satırlık dosyanın 242. satırı" sapması düzeltildi). `assertNever`
// `resolvePanelErrorMessage`'ın EXHAUSTIVE `switch`'i için (aşağıda).
//
// GÜNCELLEME (ROADMAP v0.0.18, T-027/S7, architect R-1 KARARI):
// `ERROR_MESSAGE_KEYS` (`@arkesoft/errors`) platformun `code → i18n anahtarı`
// defteri — çözümleme merdiveninin 3. basamağı. `createMessageResolver`/
// `DEFAULT_LOCALE`/`TR_TR_ERROR_MESSAGES` (`@arkesoft/i18n`) 2./3. basamağın
// ortak metin kaynağı.
import { ERROR_MESSAGE_KEYS } from '@arkesoft/errors'
import type { ErrorMessageKey } from '@arkesoft/errors'
import { createMessageResolver, DEFAULT_LOCALE, TR_TR_ERROR_MESSAGES } from '@arkesoft/i18n'
import { registrationFieldErrorKeySchema } from '@arkesoft/trpc'
import type { RegistrationFieldErrorKey } from '@arkesoft/trpc'

import type { PanelError } from '../errors/panel-error.js'

import { assertNever } from '../errors/assert-never.js'

export const PANEL_ERROR_CODES = [
  // --- Better Auth, GERÇEK uca vurularak ölçüldü (3) ---
  'EMAIL_NOT_VERIFIED',
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
  EMAIL_NOT_VERIFIED:
    'Hesabınızın e-posta adresi henüz doğrulanmadı. Giriş yapabilmek için e-postanızı doğrulayın.',
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
// ÇÖZÜMLEME MERDİVENİ (ROADMAP v0.0.18, T-027/S7, architect R-1 KARARI).
// `PanelError.known`'ın Türkçe metne çözülmesi artık DÖRT basamaklı:
//   1. `kind: 'unknown'` (kodsuz, gerçek ağ hatası)      → jenerik Türkçe
//      (bu basamak `resolvePanelErrorMessage`'ın kendisinde, aşağıda).
//   2. `messageKey !== null`                              → TELDEN gelen
//      anahtar `@arkesoft/i18n`'in `tr-TR` kataloğundan çözülür — en güçlü
//      sinyal, sunucu HANGİ metni istediğini zaten söylemiş.
//   3. `messageKey === null`, `code` `packages/errors`'ın defterinde KAYITLI
//      → `ERROR_MESSAGE_KEYS[code]` ile anahtara çevrilir, AYNI i18n
//      kataloğundan çözülür. ⚠ Bu basamak ÖLÜ DEĞİL — sunucu geçersiz/eski
//      bir `messageKey` gönderdiğinde (veya `messageKey` alanı hiç
//      doldurulmadığında) erişilir; M7'nin ("superadmin'in aynası sessizce
//      bayat") defektini MEKANİK olarak kapatan tam basamak budur.
//   4. `code` bu panelin Better Auth sağlayıcı tablosunda (`PANEL_ERROR_CODES`)
//      KAYITLI → `resolveErrorMessage` (ADR-0010:232'nin KALICI "ikinci
//      tablo"su, bu Task'ın kapsamı DIŞI).
//   5. Aksi hâlde                                          → jenerik Türkçe.
// 2. VE 3. basamak AYNI defterden (`@arkesoft/i18n`'in `tr-TR` kataloğu)
// beslenir — tek doğruluk kaynağı, iki taşıma yolu (biri tel, biri derleme
// zamanı defteri).

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

// ---------------------------------------------------------------------------
// T-019/S8 EKLEMESİ (ROADMAP v0.1.0, F13 — panelin `fields` kanalı, AC-5).
// `PanelError.known.fields`'ın (`../errors/panel-error.ts`) i18n anahtarlarını
// Türkçe metne çözen KAPALI dünya. `PANEL_ERROR_CODES`/`ERROR_MESSAGES`/
// `resolveErrorMessage`'IN BİREBİR AYNI deseni (AÇIK imza + KAPALI dünya
// daraltma + güvenli jenerik geri düşüş) — bu kataloğun İKİNCİ ailesi.
// `apps/admin` bu alt görevin BİRİNCİL yazıcısıdır (dosya başı yorumu);
// S10 (sihirbaz UI) bu bloğa YALNIZCA EKLER, gövdeyi DEĞİŞTİRMEZ.
//
// Metinler docs/ux/T-019-kayit-ve-kiraci-olusturma.md "Microcopy" bölümünden
// (satır 262-265, "Alan hatası anahtarı" sütunu) BİREBİR alındı — uydurulmadı.
//
// Allowlist'in TEK kaynağı `@arkesoft/trpc`'nin `registrationFieldErrorKeySchema`
// şemasıdır — burada elle kopyalanmış İKİNCİ bir liste YOK
// (`REGISTRATION_FIELD_ERROR_KEYS` doğrudan o şemadan TÜRETİLİR).

/**
 * {@link registrationFieldErrorKeySchema}'nın kapalı kümesi — `@arkesoft/trpc`
 * şemasından TÜRETİLİR, elle kopyalanmaz (S8'in allowlist kaynağı garantisi).
 */
export const REGISTRATION_FIELD_ERROR_KEYS = registrationFieldErrorKeySchema.options

/**
 * Derleme zamanı KAPALI dünya: `registrationFieldErrorKeySchema`'ya yeni bir
 * üye eklenip burada metin yazılmazsa `tsc --noEmit` KIRILIR (`ERROR_MESSAGES`
 * ile AYNI `satisfies` deseni).
 */
const FIELD_ERROR_MESSAGES = {
  'errors.slug.taken':
    'Bu mağaza adresi başka bir mağaza tarafından kullanılıyor. Başka bir adres dene.',
  'errors.slug.reserved':
    'Bu adres platform tarafından kullanıldığı için seçilemez. Başka bir adres dene.',
  'errors.slug.invalidFormat':
    'Bu adreste yalnızca küçük harf, rakam ve tire kullanılabilir; tire ile başlayıp bitemez.',
  'errors.slug.unreachable':
    'Bu mağaza adresi şu an kullanılamıyor çünkü tam adresi çok uzun oluyor. Daha kısa bir adres dene.',
} satisfies Record<RegistrationFieldErrorKey, string>

/** `key`'in kapalı dünyadaki bir {@link RegistrationFieldErrorKey} olup olmadığını runtime'da daraltır. */
function isRegistrationFieldErrorKey(key: string): key is RegistrationFieldErrorKey {
  return (REGISTRATION_FIELD_ERROR_KEYS as readonly string[]).includes(key)
}

/**
 * Bir alan hatası i18n anahtarını (`PanelError.known.fields[alanAdı]`) Türkçe
 * metne çözer. İmza `string` alır (bir {@link RegistrationFieldErrorKey}
 * DEĞİL) — `resolveErrorMessage` ile AYNI savunma derinliği: `fields`
 * `normalizePanelError` tarafından ZATEN allowlist'ten süzülmüş olsa da, bu
 * fonksiyon KENDİ BAŞINA fail-closed'dır; kapalı kümeye uymayan hiçbir değer
 * (ham sunucu metni dahil) HİÇBİR koşulda ekrana basılmaz, jenerik mesaja
 * düşer (AC-5, NEGATİF TEST 1/3).
 */
export function resolveRegistrationFieldErrorMessage(key: string): string {
  if (isRegistrationFieldErrorKey(key)) {
    return FIELD_ERROR_MESSAGES[key]
  }
  return GENERIC_ERROR_MESSAGE
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
      // ROADMAP v0.0.20.1 (T-022/S4, ADR-0024 Karar 5) EKLEMESİ — docs/ux/
      // T-022-iki-faktorlu-kurulumun-surdurulmesi.md "Microcopy"'den BİREBİR
      // alındı. Yalnızca `backupCodes === null` iken (sürdürülen kurulum)
      // gösterilir — "anahtar yenilendi" DEMEZ, anahtarın AYNI kaldığını
      // açıkça söyler (yedek kod yalnızca sınırı belirtir).
      setupResumedNotice:
        'Kurulum zaten başlatılmıştı — aynı anahtarla devam edin; yedek kodlar bu ekranda tekrar gösterilemez.',
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
    // -----------------------------------------------------------------
    // ROADMAP v0.1.0 (T-019/S10) EKLEMESİ — docs/ux/T-019-kayit-ve-kiraci-
    // olusturma.md "Microcopy" bölümünden BİREBİR alındı (`auth.signUp.*`,
    // `auth.signIn.*`'in kardeşi). ⚠ `existingAccountNotice` BİLEREK
    // EKLENMEDİ — ölçülmüş bir UI PLANINDAN SAPMA: Better Auth'un
    // `sign-up.mjs` kaynağı + `auth-instance.ts:690`'daki
    // `requireEmailVerification: true` BİRLİKTE var olan bir e-postayla
    // kayıt denemesini YENİ bir kayıtla BİREBİR AYNI 2xx gövdeye eşliyor
    // (kasıtlı enumeration savunması) — bu anahtarın hiçbir çağrı yeri
    // olamaz, eklemek ölü metin olurdu (bkz. `sign-up-controller.ts` dosya
    // başı yorumu, RİSKLER).
    // -----------------------------------------------------------------
    signUp: {
      title: 'Hesap oluştur',
      emailLabel: 'E-posta adresi',
      passwordLabel: 'Şifre',
      passwordConfirmLabel: 'Şifre (tekrar)',
      submit: 'Hesap oluştur',
      submitting: 'Hesap oluşturuluyor…',
      emailRequired: 'E-posta adresinizi girin.',
      emailInvalid: 'Geçerli bir e-posta adresi girin.',
      passwordRequired: 'Şifrenizi girin.',
      passwordConfirmRequired: 'Şifrenizi tekrar girin.',
      passwordMismatch: 'Şifreler eşleşmiyor.',
      // `auth.signIn.fieldGenericError`'ın AYNI fail-closed geri düşüşü
      // (DÜZELTME TURU 1, `solid` M5 ║ `wcag` M3 — bu alt görevin KENDİ
      // formu için tekrarı): tanınmayan bir Zod `issue.code`'u SESSİZCE
      // kaybolmaz.
      fieldGenericError: 'Bu alanda bir sorun var. Lütfen kontrol edip tekrar deneyin.',
      goToSignIn: 'Giriş yap',
      haveAccountPrompt: 'Zaten hesabın var mı?',
      emailPendingTitle: 'E-postanı doğrula',
      emailPendingBody:
        '{eposta} adresine bir doğrulama bağlantısı gönderdik. Gelen kutunuzdaki bağlantıya tıklayıp giriş yapabilirsiniz.',
      resendEmail: 'E-posta gelmedi mi? Yeniden gönder',
      resendingEmail: 'Gönderiliyor…',
    },
  },
  meta: {
    signInTitle: 'Giriş yap · Arkesoft Panel',
    dashboardTitle: 'Panel · Arkesoft Panel',
    // ROADMAP v0.1.0 (T-019/S10) EKLEMESİ.
    signUpTitle: 'Hesap oluştur · Arkesoft Panel',
    storeWizardTitle: 'Mağaza oluştur · Arkesoft Panel',
    onboardingChecklistTitle: 'Kurulum adımların · Arkesoft Panel',
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
    // -------------------------------------------------------------------
    // ROADMAP v0.1.0 (T-019/S10) EKLEMESİ — docs/ux/T-019 "Microcopy"
    // bölümünden BİREBİR alındı (`dashboard.onboarding.*`, Ekran 7-8).
    // ⚠ `empty.*` (ÜSTTE) artık `/`'in bu alt görevle DEĞİŞEN "mağaza yok"
    // dalı tarafından TÜKETİLMİYOR (bkz. `_app.index.tsx` dosya başı yorumu,
    // RİSKLER) — SİLİNMEDİ (bu dosya yalnızca EKLER), teknik borca not
    // düşüldü.
    // -------------------------------------------------------------------
    onboarding: {
      noStoreTitle: 'Henüz bir mağazan yok',
      noStoreBody: 'Mağazanı oluşturarak başlayabilirsin, yalnızca birkaç dakika sürer.',
      createStoreButton: 'Mağaza oluştur',
      checklistTitle: 'Kurulum adımların',
      pendingBanner:
        'Mağazan oluşturuldu ama henüz ziyaretçilere açık değil. Yayına alma adımı çok yakında burada olacak.',
      comingSoonBadge: 'Yakında',
      provisioningStepHelp: 'Bu özellik çok yakında burada olacak.',
      loadError: 'Kurulum durumun şu anda yüklenemedi.',
      stepDoneLabel: 'Tamamlandı',
      stepTodoLabel: 'Bekliyor',
      stepAccountLabel: 'Hesabını oluşturdun',
      stepStoreIdentityLabel: 'Mağazanın adını ve adresini belirledin',
      stepSiteTypeLabel: 'Mağazanın türünü seçtin',
      stepSubscriptionLabel: 'Deneme aboneliğin başladı',
      stepProvisioningLabel: 'Siteni yayına al',
      // ⭐⭐ BAĞLAYICI TEK CÜMLE (brief'ten birebir, S10 handoff'u) — dört ret
      // modu (kiracı yok/üye değil/soft-delete/biçim bozuk) AYNI mesaja
      // indirgenir, ayrım YAPILMAZ (ADR-0021 §2 koşul C).
      slugNotFoundOrForbidden: 'Bu adrese erişiminiz yok veya böyle bir mağaza yok.',
    },
    // `/`'in "zaten bir mağaza oluşturdun mu?" manuel adres girişi
    // (docs/ui P6) — `dashboard.onboarding.*`'den AYRI bir alt-kök (ui
    // planının RİSKLER #9'unun öngördüğü yeni kök, bu alt görevin KENDİ
    // adlandırması).
    home: {
      manualAddressPrompt: 'Zaten bir mağaza oluşturdun mu?',
      manualAddressLabel: 'Mağaza adresi',
      manualAddressSubmit: 'Devam et',
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
  // ---------------------------------------------------------------------
  // ROADMAP v0.1.0 (T-019/S10) EKLEMESİ — docs/ux/T-019 "Microcopy"
  // bölümünden BİREBİR alındı (`registration.*`, Faz 2, `/magaza-olustur`).
  // ⚠ `slug.raceLostNotice` (ux'in tablosunda adı geçen bir anahtar) BİLEREK
  // AYRI bir satır olarak EKLENMEDİ — gerçek metin zaten S8'in
  // `FIELD_ERROR_MESSAGES['errors.slug.taken']`'inden geliyor
  // (`slug-outcome-message.ts`'in `resolveSlugFieldErrorMessage('taken')`
  // çağrısı); ikinci bir kopya DRY'yi ihlal eder ve kullanılmayan (ölü)
  // bir anahtar olurdu.
  // ---------------------------------------------------------------------
  registration: {
    storeName: {
      stepLabel: 'Mağaza adı',
      inputLabel: 'Mağazanın adı',
      required: 'Mağazanın bir adı olmalı.',
      next: 'İleri',
    },
    slug: {
      stepLabel: 'Mağaza adresi',
      inputLabel: 'Mağazanın adresi',
      help: 'Mağazan şu adresten yayına girecek: {önizleme}',
      back: 'Geri',
      next: 'İleri',
      available: 'Bu adres kullanılabilir.',
      taken: 'Bu mağaza adresi başka bir mağaza tarafından kullanılıyor. Başka bir adres dene.',
      reserved: 'Bu adres platform tarafından kullanıldığı için seçilemez. Başka bir adres dene.',
      invalidFormat:
        'Bu adreste yalnızca küçük harf, rakam ve tire kullanılabilir; tire ile başlayıp bitemez.',
      unreachable:
        'Bu mağaza adresi şu an kullanılamıyor çünkü tam adresi çok uzun oluyor. Daha kısa bir adres dene.',
      checking: 'Kontrol ediliyor…',
    },
    siteType: {
      stepLabel: 'Site tipi',
      legend: 'Mağazan ne türde olacak?',
      ecommerceLabel: 'E-ticaret (ürün satışı yapacağım)',
      corporateLabel: 'Kurumsal site (tanıtım, bilgi amaçlı)',
      required: 'Bir site tipi seç.',
      back: 'Geri',
      submit: 'Mağazanı oluştur',
      submitting: 'Oluşturuluyor…',
    },
    // ux'in "Adım 2 / 3" metin-alternatifi şartı (mobil davranış +
    // erişilebilirlik niyeti ⑤) — üç adımın ÜÇÜ de bu ŞABLONU paylaşır.
    stepProgressLabel: 'Adım {adim} / {toplam}',
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
 * `PanelError` → ekranda gösterilecek Türkçe metin (ROADMAP v0.0.18,
 * T-027/S7, architect R-1 KARARI — ÇÖZÜMLEME MERDİVENİ, yukarıda tanımlı).
 * `classifyErrorResolutionStep` ÖNCE `PanelError`'ı BEŞ basamaktan birine
 * sınıflandırır, bu fonksiyon EXHAUSTIVE `switch` ile metne çevirir.
 * `PanelError`'ın hiçbir alanı ham sunucu metni TAŞIMAZ (bkz.
 * ../errors/panel-error.ts) — bu fonksiyon da aynı fail-closed garantiyi
 * korur; AC8 bu yapısal garantiden BAĞIMSIZ olarak hâlâ sağlanıyor.
 *
 * DÜZELTME TURU 2 (`solid` L-N8 — bağlayıcı, CLAUDE.md §4): `if`/`return`
 * yerine EXHAUSTIVE `switch` + `assertNever` — `ErrorResolutionStep`'e yeni
 * bir basamak eklenirse bu fonksiyon artık SESSİZCE jenerik mesaja DÜŞMEZ,
 * `pnpm typecheck` KIRILIR.
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

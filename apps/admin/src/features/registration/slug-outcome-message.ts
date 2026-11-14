// @arkesoft/admin — slug müsaitlik `outcome` → Türkçe metin eşlemesi
// (ROADMAP v0.1.0, T-019/S10, docs/ui/T-019-kayit-ve-kiraci-olusturma.md
// KARAR 2 — `slug-outcome-message.ts`, emsal `field-error-message.ts`/T-016)
//
// SAF fonksiyonlar — `StoreWizardController`/`StoreWizard.tsx` RENDER eder,
// outcome→mesaj KARARI burada (.tsx'e SIZMAZ).
import type { RegistrationFieldErrorKey, SlugAvailabilityOutcome } from '@arkesoft/trpc'

import { MESSAGES, resolveRegistrationFieldErrorMessage } from '../../messages/messages.js'

/**
 * Canlı bölge metni (P4'ün `role="status"` `aria-live="polite"` bölgesi,
 * wcag madde ③/⑤) — `'available'` DAHİL beş değer + "Kontrol ediliyor…".
 * docs/ux/T-019 "Beş outcome değeri" tablosundan BİREBİR.
 */
const LIVE_STATUS_MESSAGES = {
  available: MESSAGES.registration.slug.available,
  taken: MESSAGES.registration.slug.taken,
  reserved: MESSAGES.registration.slug.reserved,
  invalidFormat: MESSAGES.registration.slug.invalidFormat,
  unreachable: MESSAGES.registration.slug.unreachable,
} satisfies Record<SlugAvailabilityOutcome, string>

export const SLUG_LIVE_STATUS_MESSAGE_KEY_COUNT = Object.keys(LIVE_STATUS_MESSAGES).length

/**
 * `outcome`'un görünür canlı bölge metni. `status === 'idle'` için `null`
 * döner — kullanıcı henüz hiçbir kontrol tetiklemedi (ör. sayfa yeni açıldı,
 * debounce penceresi içinde bekliyor); bu durumda canlı bölgede GÖSTERİLECEK
 * bir metin yok (ux'in tablosu bu durumu TANIMLAMIYOR, `StoreWizard.tsx` bu
 * `null`'ı "hiçbir şey render etme" olarak okur).
 */
export function resolveSlugLiveStatusMessage(
  status: 'idle' | 'checking' | SlugAvailabilityOutcome,
): string | null {
  if (status === 'idle') {
    return null
  }
  if (status === 'checking') {
    return MESSAGES.registration.slug.checking
  }
  return LIVE_STATUS_MESSAGES[status]
}

/**
 * `registration.schema.ts`'in `slugAvailabilityOutcomeSchema` ↔
 * `registrationFieldErrorKeySchema` sıralı karşılığı (SIRAYLA eşlenir,
 * architect'in kendi notu) — `'available'` HARİÇ dört değer.
 */
const FIELD_ERROR_KEY_BY_OUTCOME = {
  taken: 'errors.slug.taken',
  reserved: 'errors.slug.reserved',
  invalidFormat: 'errors.slug.invalidFormat',
  unreachable: 'errors.slug.unreachable',
} satisfies Record<Exclude<SlugAvailabilityOutcome, 'available'>, RegistrationFieldErrorKey>

/**
 * Submit-anı (yarış kaybı, ux "Hata durumları" tablosu) alan hatası metni —
 * `Input.error`'a gider (docs/ui:213'ün kuralı, ayrı bir `role="alert"`
 * kutusu YOK). `resolveRegistrationFieldErrorMessage` (`messages.ts`, S8'in
 * gövdesi) ÜZERİNDEN gider — Türkçe metin İKİNCİ kez burada YAZILMAZ.
 */
export function resolveSlugFieldErrorMessage(
  outcome: Exclude<SlugAvailabilityOutcome, 'available'>,
): string {
  return resolveRegistrationFieldErrorMessage(FIELD_ERROR_KEY_BY_OUTCOME[outcome])
}

// ---------------------------------------------------------------------------
// ⚠ VARSAYIM (RİSKLER'e taşındı) — docs/ui RİSKLER madde 4: "{alan-adı}"
// sabiti bu belgede TANIMLANMADI, bir ortam değişkeninden (ör.
// `VITE_PUBLIC_STOREFRONT_BASE_DOMAIN`) gelmesi öneriliyordu. Bu alt görevin
// "DOKUNACAĞIN DOSYALAR" listesi `vite.config.ts`/`panel-config.ts`/
// `.env.example`'ı KAPSAMIYOR — bu yüzden gerçek bir `VITE_*` değişkeni
// BURADAN bağlanamadı (dosya listesi dışına çıkmak kapsam ihlali olurdu).
// Literal, `.env.example`'daki `APP_BASE_DOMAIN` dev varsayılanının (`apps/
// api`, sunucu-only, panel bundle'ına ASLA sızmaz) YERİNE geçen, SALT
// ÖNİZLEME amaçlı bir sabittir — gerçek doğrulama HER ZAMAN sunucuda
// (`checkSlugAvailability`/`createTenant`). `devops`/`frontend`'in ileride
// `VITE_PUBLIC_STOREFRONT_BASE_DOMAIN` ile bunu gerçek ortam değerine
// bağlaması gerekiyor (RİSKLER'e taşındı).
const STOREFRONT_BASE_DOMAIN_PREVIEW = 'arkesoft.app'

/** P4'ün adres önizleme metni — "Mağazan şu adresten yayına girecek: {slug}.{alan-adı}". */
export function buildSlugPreviewAddress(slug: string): string {
  return `${slug}.${STOREFRONT_BASE_DOMAIN_PREVIEW}`
}

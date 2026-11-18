// @arkesoft/admin — kiracı slug referansı deposu + `/`'in yönlendirme kararı
// (ROADMAP v0.1.0, T-019/S10, docs/ui/T-019-kayit-ve-kiraci-olusturma.md
// KARAR 2 — `stored-tenant-reference.ts`)
//
// SAF, DOM'DAN BAĞIMSIZ — `TwoFactorSetupController` ailesinin AYNI ilkesi
// ("saf karar + enjekte edilen yan etki"): `localStorage`'ı DOĞRUDAN
// KULLANMAZ, çağıran taraf (route dosyası) gerçek `window.localStorage`'ı
// enjekte eder — bu dosya `vitest.config.ts`'in `environment: 'node'`'unda
// test edilebilir kalır (node'da gerçek `localStorage` YOK).
//
// ⚠⚠ ux'in VARSAYIM'ı (`arkesoft.lastTenantId`) BU GÖREVDE FARKLI bir anahtar
// ve DEĞERLE çözüldü (docs/ui'nin "Kapsam notu"): saklanan `tenantId` DEĞİL
// `slug`'dır (ADR-0021 §3.1 — `createTenant` çıktısı `tenantId` TAŞIMAZ,
// `onboardingChecklist` seçicisi `slug`'dır). Anahtar adı da bunu yansıtır.
export const TENANT_SLUG_REFERENCE_STORAGE_KEY = 'arkesoft.lastTenantSlug'

/**
 * Bu modülün ihtiyaç duyduğu minimal `Storage` arayüzü — gerçek
 * `window.localStorage` bu arayüze zaten uyar, testler sahte bir nesne
 * geçirir.
 */
export interface TenantSlugReferenceStorage {
  readonly getItem: (key: string) => string | null
  readonly setItem: (key: string, value: string) => void
  readonly removeItem: (key: string) => void
}

export interface TenantSlugReferenceStore {
  /** Saklı slug'ı okur — hiç yazılmadıysa `null`. */
  readonly read: () => string | null
  /** `createTenant` başarılı olduğunda çağrılır (ux "Veri katmanı notları" madde 2). */
  readonly write: (slug: string) => void
  /** `onboardingChecklist` 404 döndüğünde çağrılır (ux "Saklı referans geçersiz → sessizce sıfırla"). */
  readonly clear: () => void
}

/** `storage` enjekte edilir — bu fonksiyonun KENDİSİ hiçbir global'e dokunmaz. */
export function createTenantSlugReferenceStore(
  storage: TenantSlugReferenceStorage,
): TenantSlugReferenceStore {
  return {
    read: () => storage.getItem(TENANT_SLUG_REFERENCE_STORAGE_KEY),
    write: (slug) => {
      storage.setItem(TENANT_SLUG_REFERENCE_STORAGE_KEY, slug)
    },
    clear: () => {
      storage.removeItem(TENANT_SLUG_REFERENCE_STORAGE_KEY)
    },
  }
}

export type HomeRedirectTarget =
  { readonly kind: 'redirect'; readonly slug: string } | { readonly kind: 'stay' }

/**
 * `/`'in `beforeLoad`'ının SAF kararı (docs/ui P6 "Saklı adres VAR").
 * Boş dize de "yok" sayılır (savunma amaçlı — yazma yolu zaten boş slug
 * yazmaz, ama okuma tarafı kendi başına fail-closed'dır).
 */
export function resolveHomeRedirectTarget(storedSlug: string | null): HomeRedirectTarget {
  if (storedSlug === null || storedSlug.trim().length === 0) {
    return { kind: 'stay' }
  }
  return { kind: 'redirect', slug: storedSlug }
}

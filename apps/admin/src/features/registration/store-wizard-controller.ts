// @arkesoft/admin — StoreWizardController (ROADMAP v0.1.0, T-019/S10,
// docs/ui/T-019-kayit-ve-kiraci-olusturma.md KARAR 2, docs/ux "Faz 2")
//
// SAF, React'TEN BAĞIMSIZ durum makinesi — `TwoFactorSetupController`'ın
// (3 adımlı) EN YAKIN emsali. DÖRT durum (`storeName`/`slug`/`siteType`/
// `submitting` DEĞİL — `isSubmitting` bir BAYRAK, adım `siteType`'ta kalır,
// bkz. aşağıdaki `StoreWizardState`). ⚠⚠ DEBOUNCE BURADA (`setTimeout`/
// `clearTimeout`, global — enjekte EDİLMEZ, vitest'in SAHTE zamanlayıcıları
// (`vi.useFakeTimers()`) globali ZATEN sarmalar, bu yüzden DOM/gerçek zaman
// gerekmeden test edilebilir).
//
// Slug yarış-kaybı (submit anında `taken`/`reserved`/`invalidFormat`/
// `unreachable`) hatasını `slug` adımına GERİ yönlendirme kararı BURADA
// (docs/ux "Hata durumları" → "Slug: yarış kaybı").
import { normalizeTenantSlug } from '@arkesoft/tenancy'
import type {
  CreateTenantInput,
  CreateTenantResult,
  RegistrationFieldErrorKey,
  SiteType,
  SlugAvailabilityOutcome,
} from '@arkesoft/trpc'

import type { PanelError } from '../../errors/panel-error.js'

/** Slug alanındaki her tuş vuruşundan SONRA, yazmayı bitirince beklenen süre (ux VARSAYIM, docs/ui RİSKLER #5). */
export const SLUG_CHECK_DEBOUNCE_MS = 400

export type CheckSlugAvailabilityCallResult =
  | { readonly kind: 'ok'; readonly outcome: SlugAvailabilityOutcome }
  | { readonly kind: 'error'; readonly error: PanelError }

export type CreateTenantCallResult =
  | { readonly kind: 'ok'; readonly result: CreateTenantResult }
  | { readonly kind: 'error'; readonly error: PanelError }

export interface StoreWizardDeps {
  readonly checkSlugAvailability: (slug: string) => Promise<CheckSlugAvailabilityCallResult>
  readonly createTenant: (input: CreateTenantInput) => Promise<CreateTenantCallResult>
}

export type StoreWizardStep = 'storeName' | 'slug' | 'siteType'

export type SlugCheckStatus = 'idle' | 'checking' | SlugAvailabilityOutcome

export interface StoreWizardState {
  readonly step: StoreWizardStep
  readonly storeName: string
  readonly slug: string
  readonly slugCheckStatus: SlugCheckStatus
  /** Ağ/bilinmeyen hata (ux'in tablosu bu durumu TANIMLAMIYOR — fail-closed geri düşüş, canlı bölgede gösterilir). */
  readonly slugCheckErrorMessage: string | null
  /** Submit-anı yarış kaybı (docs/ux "Hata durumları") — `Input.error`'a gider. */
  readonly slugFieldErrorMessage: string | null
  readonly siteType: SiteType | null
  readonly siteTypeErrorMessage: string | null
  readonly isSubmitting: boolean
  readonly submitErrorMessage: string | null
}

export const INITIAL_STORE_WIZARD_STATE: StoreWizardState = {
  step: 'storeName',
  storeName: '',
  slug: '',
  slugCheckStatus: 'idle',
  slugCheckErrorMessage: null,
  slugFieldErrorMessage: null,
  siteType: null,
  siteTypeErrorMessage: null,
  isSubmitting: false,
  submitErrorMessage: null,
}

export type StoreWizardSubmitOutcome =
  | { readonly kind: 'created'; readonly slug: string }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'none' }

/**
 * `registrationFieldErrorKeySchema` ↔ `slugAvailabilityOutcomeSchema`'nın
 * TERS eşlemesi (`slug-outcome-message.ts`'in `FIELD_ERROR_KEY_BY_OUTCOME`'ının
 * tersi) — `createTenant` reddi `fields.slug` İÇİNDE bir i18n ANAHTARI
 * taşır, canlı bölgeyi (`slugCheckStatus`) bu anahtardan GERİ türetmek için.
 */
const OUTCOME_BY_FIELD_ERROR_KEY: Record<
  RegistrationFieldErrorKey,
  Exclude<SlugAvailabilityOutcome, 'available'>
> = {
  'errors.slug.taken': 'taken',
  'errors.slug.reserved': 'reserved',
  'errors.slug.invalidFormat': 'invalidFormat',
  'errors.slug.unreachable': 'unreachable',
}

export class StoreWizardController {
  private state: StoreWizardState = INITIAL_STORE_WIZARD_STATE
  private debounceHandle: ReturnType<typeof setTimeout> | null = null
  /** Eski (stale) bir `checkSlugAvailability` yanıtının geç gelip yeni durumu EZMESİNİ engeller. */
  private latestRequestToken = 0

  constructor(
    private readonly deps: StoreWizardDeps,
    private readonly mapFieldError: (key: string) => string,
    private readonly mapError: (error: PanelError) => string,
    private readonly onChange: (state: StoreWizardState) => void,
  ) {}

  getState(): StoreWizardState {
    return this.state
  }

  private setState(next: StoreWizardState): void {
    this.state = next
    this.onChange(next)
  }

  /** `.tsx`'in `beforeunload`/unmount'ta çağırması ÖNERİLİR — bekleyen debounce zamanlayıcısını iptal eder. */
  dispose(): void {
    if (this.debounceHandle !== null) {
      clearTimeout(this.debounceHandle)
      this.debounceHandle = null
    }
  }

  /**
   * P3 "İleri" — react-hook-form ZATEN zorunluluğu doğruladı (docs/ui "Form
   * mimarisi" tablosu), bu metot `storeName`'in BOŞ OLMADIĞINI varsayar.
   * `normalizeTenantSlug` (`@arkesoft/tenancy`, SAF, bağımlılıksız) ÖNERİ
   * üretir — gerçek doğrulama HER ZAMAN sunucuda (docs/ui P4 notu).
   */
  goToSlugStep(storeName: string): void {
    if (this.state.step !== 'storeName') {
      return
    }
    const trimmedStoreName = storeName.trim()
    const suggestedSlug = normalizeTenantSlug(trimmedStoreName)

    this.setState({
      ...INITIAL_STORE_WIZARD_STATE,
      step: 'slug',
      storeName: trimmedStoreName,
      slug: suggestedSlug,
      slugCheckStatus: 'checking',
    })
    // Adım açıldığında ÖNERİ için OTOMATİK kontrol (ux "Mutlu yol B" madde 3)
    // — debounce'suz, HEMEN tetiklenir.
    void this.runSlugCheck(suggestedSlug)
  }

  goBackToStoreNameStep(): void {
    if (this.state.step !== 'slug') {
      return
    }
    this.dispose()
    this.setState({
      ...INITIAL_STORE_WIZARD_STATE,
      step: 'storeName',
      storeName: this.state.storeName,
    })
  }

  /** Her tuş vuruşu — istek HEMEN atılmaz (ux), yazmayı bitirince `SLUG_CHECK_DEBOUNCE_MS` sonra tetiklenir. */
  setSlug(value: string): void {
    if (this.state.step !== 'slug') {
      return
    }
    this.setState({
      ...this.state,
      slug: value,
      slugCheckStatus: 'checking',
      slugCheckErrorMessage: null,
      slugFieldErrorMessage: null,
    })

    if (this.debounceHandle !== null) {
      clearTimeout(this.debounceHandle)
    }
    this.debounceHandle = setTimeout(() => {
      this.debounceHandle = null
      void this.runSlugCheck(value)
    }, SLUG_CHECK_DEBOUNCE_MS)
  }

  private async runSlugCheck(slug: string): Promise<void> {
    const requestToken = ++this.latestRequestToken
    const result = await this.deps.checkSlugAvailability(slug)

    // Daha YENİ bir istek (sonraki tuş vuruşu) BAŞLADIYSA bu yanıt ESKİDİR — YOKSAY.
    if (requestToken !== this.latestRequestToken) {
      return
    }
    // Kullanıcı bu arada adımdan AYRILDIYSA (geri/ileri) — YOKSAY.
    if (this.state.step !== 'slug' || this.state.slug !== slug) {
      return
    }

    if (result.kind === 'error') {
      this.setState({
        ...this.state,
        slugCheckStatus: 'idle',
        slugCheckErrorMessage: this.mapError(result.error),
      })
      return
    }

    this.setState({ ...this.state, slugCheckStatus: result.outcome, slugCheckErrorMessage: null })
  }

  /** "İleri" (P4) — yalnızca `slugCheckStatus === 'available'` iken ÇAĞRILABİLİR olmalı (buton zaten devre dışı, bu savunma amaçlı tekrar). */
  goToSiteTypeStep(): void {
    if (this.state.step !== 'slug' || this.state.slugCheckStatus !== 'available') {
      return
    }
    this.dispose()
    this.setState({ ...this.state, step: 'siteType' })
  }

  goBackToSlugStep(): void {
    if (this.state.step !== 'siteType') {
      return
    }
    this.setState({ ...this.state, step: 'slug' })
  }

  selectSiteType(siteType: SiteType): void {
    if (this.state.step !== 'siteType') {
      return
    }
    this.setState({ ...this.state, siteType, siteTypeErrorMessage: null })
  }

  async submit(siteTypeRequiredMessage: string): Promise<StoreWizardSubmitOutcome> {
    if (this.state.step !== 'siteType') {
      return { kind: 'none' }
    }
    if (this.state.siteType === null) {
      this.setState({ ...this.state, siteTypeErrorMessage: siteTypeRequiredMessage })
      return { kind: 'none' }
    }

    const siteType = this.state.siteType
    this.setState({ ...this.state, isSubmitting: true, submitErrorMessage: null })

    const result = await this.deps.createTenant({
      name: this.state.storeName,
      slug: this.state.slug,
      siteType,
    })

    if (result.kind === 'ok') {
      return { kind: 'created', slug: result.result.slug }
    }

    return this.handleCreateTenantError(result.error)
  }

  private handleCreateTenantError(error: PanelError): StoreWizardSubmitOutcome {
    if (error.kind === 'known' && error.code === 'UNAUTHENTICATED') {
      return { kind: 'unauthenticated' }
    }

    const slugFieldErrorKey = error.kind === 'known' ? error.fields?.['slug'] : undefined
    if (slugFieldErrorKey !== undefined) {
      // Yarış kaybı (ux "Slug: yarış kaybı") — adım 'slug'a GERİ, Input.error
      // ile gösterilir; canlı bölge GERİ türetilen outcome'a göre güncellenir
      // (tutarlılık — "available" ile çelişen bir durumda KALMAZ).
      this.setState({
        ...this.state,
        step: 'slug',
        isSubmitting: false,
        slugCheckStatus: OUTCOME_BY_FIELD_ERROR_KEY[slugFieldErrorKey],
        slugFieldErrorMessage: this.mapFieldError(slugFieldErrorKey),
      })
      return { kind: 'none' }
    }

    // 429 / ağ / diğer — AYNI adımda kalır, girdi kaybolmaz (ux).
    this.setState({ ...this.state, isSubmitting: false, submitErrorMessage: this.mapError(error) })
    return { kind: 'none' }
  }
}

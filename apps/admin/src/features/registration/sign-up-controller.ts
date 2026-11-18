// @arkesoft/admin — SignUpController (ROADMAP v0.1.0, T-019/S10,
// docs/ui/T-019-kayit-ve-kiraci-olusturma.md KARAR 2, docs/ux "Faz 1")
//
// SAF, React'TEN BAĞIMSIZ durum makinesi — `TwoFactorSetupController`'ın
// AYNI deseni: adım makinesi (`'form'`/`'emailPending'`) + hata eşlemesi
// burada, DOM/render GEREKMEDEN test edilebilir (`vitest.config.ts`'in
// `environment: 'node'` BAĞLAYICI kararı). `mapError` imzası
// `(error: PanelError) => string` — `TwoFactorSetupController`'ın
// DÜZELTME TURU 2'de düzelttiği AYNI imza (gerçek çağrı şekli, `as` CAST
// GEREKMEZ).
//
// ⚠⚠ UI PLANINDAN SAPMA (ölçülmüş, bağlayıcı) — docs/ui P1'in "Bu e-posta ile
// zaten bir hesap var" ayrı bildirim dalı BU SÜRÜMDE ULAŞILAMAZ: Better
// Auth'un `sign-up.mjs` kaynağı OKUNARAK ölçüldü —
// `shouldReturnGenericDuplicateResponse = options.emailAndPassword.
// requireEmailVerification || autoSignIn === false` ve `auth-instance.ts:690`
// `requireEmailVerification: true` OLDUĞU için bu ifade HER ZAMAN `true`;
// var olan bir e-postayla kayıt denemesi `buildGenericDuplicateResponse()`
// çağırır — bu da YENİ bir hesapla BİREBİR AYNI gövdeyi (`{token: null,
// user: <synthetic>}`, 2xx, `Set-Cookie` YOK) döner. Bu KASITLI bir
// kullanıcı-sayımı (enumeration) savunmasıdır (şifre HER İKİ dalda da
// hash'lenir — zamanlama farkı da kapatılmış) — sunucu YAPISAL olarak
// "yeni mi var olan mı" ayrımını İSTEMCİYE SIZDIRMAZ. Bu yüzden bu
// controller'ın `submit`'i TEK bir başarı dalı taşır (`'emailPending'`);
// "existing account" ayrı bir dal İCAT ETMEZ (sahte bir ayrımı TAKLİT
// etmek — ör. e-posta deseni/zamanlama tahmini — güvenlik regresyonu
// olurdu). RİSKLER'e taşındı; `messages.ts`'e `existingAccountNotice`
// anahtarı bu nedenle EKLENMEDİ (ölü kod/ölü metin olurdu).
import type { PanelError } from '../../errors/panel-error.js'

export type SignUpCallResult =
  { readonly kind: 'signed-up' } | { readonly kind: 'error'; readonly error: PanelError }

export type ResendVerificationEmailCallResult =
  { readonly kind: 'sent' } | { readonly kind: 'error'; readonly error: PanelError }

export interface SignUpDeps {
  readonly signUp: (input: {
    readonly email: string
    readonly password: string
  }) => Promise<SignUpCallResult>
  readonly resendVerificationEmail: (email: string) => Promise<ResendVerificationEmailCallResult>
}

export type SignUpState =
  | { readonly step: 'form'; readonly isSubmitting: boolean; readonly errorMessage: string | null }
  | {
      readonly step: 'emailPending'
      readonly email: string
      readonly isResending: boolean
      readonly resendErrorMessage: string | null
    }

export const INITIAL_SIGN_UP_STATE: SignUpState = {
  step: 'form',
  isSubmitting: false,
  errorMessage: null,
}

export class SignUpController {
  private state: SignUpState = INITIAL_SIGN_UP_STATE

  constructor(
    private readonly deps: SignUpDeps,
    private readonly mapError: (error: PanelError) => string,
    private readonly onChange: (state: SignUpState) => void,
  ) {}

  getState(): SignUpState {
    return this.state
  }

  private setState(next: SignUpState): void {
    this.state = next
    this.onChange(next)
  }

  async submitSignUp(email: string, password: string): Promise<void> {
    if (this.state.step !== 'form') {
      return
    }
    this.setState({ step: 'form', isSubmitting: true, errorMessage: null })

    const result = await this.deps.signUp({ email, password })

    if (result.kind === 'error') {
      this.setState({
        step: 'form',
        isSubmitting: false,
        errorMessage: this.mapError(result.error),
      })
      return
    }

    // Yukarıdaki dosya başı yorumu — sunucu "yeni mi var olan mı" AYRIMINI
    // sızdırmaz, bu yüzden TEK başarı dalı: `'emailPending'`.
    this.setState({ step: 'emailPending', email, isResending: false, resendErrorMessage: null })
  }

  async resendVerificationEmail(): Promise<void> {
    if (this.state.step !== 'emailPending') {
      return
    }
    this.setState({ ...this.state, isResending: true, resendErrorMessage: null })

    const result = await this.deps.resendVerificationEmail(this.state.email)

    if (result.kind === 'error') {
      this.setState({
        ...this.state,
        isResending: false,
        resendErrorMessage: this.mapError(result.error),
      })
      return
    }

    this.setState({ ...this.state, isResending: false, resendErrorMessage: null })
  }
}

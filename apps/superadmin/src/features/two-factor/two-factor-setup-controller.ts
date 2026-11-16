// @arkesoft/superadmin — TwoFactorSetupController (ROADMAP v0.0.20,
// T-021/S8, `apps/admin/src/features/two-factor/two-factor-setup-
// controller.ts`'in BİREBİR aynısı — cross-app import yasak olduğu için
// yerel kopya; T-016'nın kurulum mekanizması burada DEĞİŞTİRİLMEDEN
// devralındı).
//
// SAF, React'TEN BAĞIMSIZ durum makinesi — "enable bir kez çağrılır, tekrar
// gösterim get-totp-uri ile" + "verify-totp sonrası platform.session
// invalidation" davranışlarını DOM/render GEREKMEDEN test edilebilir kılar.
//
// `TwoFactorSetupWizard.tsx` bu sınıfı `useState`'in LAZY başlangıç değeri
// ile sarar; TÜM karar mantığı burada yaşar, bileşen yalnızca RENDER eder.
import type { PanelError } from '../../errors/panel-error.js'
import type {
  EnableTwoFactorResult,
  GetTotpUriResult,
  VerifyTwoFactorResult,
} from '../../api/two-factor-rest.js'

export interface TwoFactorSetupDeps {
  readonly enable: (password: string) => Promise<EnableTwoFactorResult>
  readonly getTotpUri: (password: string) => Promise<GetTotpUriResult>
  readonly verifyTotp: (code: string) => Promise<VerifyTwoFactorResult>
  /** `verify-totp` BAŞARILI olduğunda BİR KEZ çağrılır (çağıran `platform.session`'ı invalidate eder). */
  readonly onVerified: () => void
}

export type TwoFactorSetupState =
  | {
      readonly step: 'password'
      readonly isSubmitting: boolean
      readonly errorMessage: string | null
    }
  | {
      readonly step: 'totp'
      readonly totpURI: string
      /** `get-totp-uri` ile tekrar gösterimde `null` OLABİLİR. */
      readonly backupCodes: readonly string[] | null
      readonly isSubmitting: boolean
      readonly errorMessage: string | null
    }
  | {
      readonly step: 'backup-codes'
      readonly backupCodes: readonly string[]
    }
  | {
      readonly step: 'completed'
    }

export class TwoFactorSetupController {
  private hasCalledEnable = false
  private capturedBackupCodes: readonly string[] | null = null
  private state: TwoFactorSetupState = { step: 'password', isSubmitting: false, errorMessage: null }

  constructor(
    private readonly deps: TwoFactorSetupDeps,
    private readonly mapError: (error: PanelError) => string,
    private readonly onChange: (state: TwoFactorSetupState) => void,
  ) {}

  getState(): TwoFactorSetupState {
    return this.state
  }

  private setState(next: TwoFactorSetupState): void {
    this.state = next
    this.onChange(next)
  }

  /**
   * Hangi REST çağrısının yapılacağını belirleyen SAF karar. `enable` zaten
   * bu mount'ta çağrıldıysa `get-totp-uri` seçilir — `enable` İKİNCİ kez
   * ÇAĞRILMAZ (ikinci çağrı sırrı yeniden üretir).
   */
  resolveTotpUriAction(): 'enable' | 'get-totp-uri' {
    return this.hasCalledEnable ? 'get-totp-uri' : 'enable'
  }

  async submitPassword(password: string): Promise<void> {
    if (this.state.step !== 'password' && this.state.step !== 'totp') {
      return
    }
    this.setState({ ...this.state, isSubmitting: true, errorMessage: null })

    const action = this.resolveTotpUriAction()
    const result =
      action === 'enable' ? await this.deps.enable(password) : await this.deps.getTotpUri(password)

    if (result.kind === 'error') {
      this.setState({
        step: 'password',
        isSubmitting: false,
        errorMessage: this.mapError(result.error),
      })
      return
    }

    if (action === 'enable' && result.kind === 'enabled') {
      this.hasCalledEnable = true
      this.capturedBackupCodes = result.backupCodes
    }

    this.setState({
      step: 'totp',
      totpURI: result.totpURI,
      backupCodes: this.capturedBackupCodes,
      isSubmitting: false,
      errorMessage: null,
    })
  }

  async submitCode(code: string): Promise<void> {
    if (this.state.step !== 'totp') {
      return
    }
    this.setState({ ...this.state, isSubmitting: true, errorMessage: null })

    const result = await this.deps.verifyTotp(code)

    if (result.kind === 'error') {
      this.setState({
        ...this.state,
        isSubmitting: false,
        errorMessage: this.mapError(result.error),
      })
      return
    }

    this.deps.onVerified()

    if (this.capturedBackupCodes !== null) {
      this.setState({ step: 'backup-codes', backupCodes: this.capturedBackupCodes })
    } else {
      this.setState({ step: 'completed' })
    }
  }

  /** Kullanıcı adım 3'ten (yedek kodlar) adım 2'ye (kod onayı) GERİ döner — `enable` TEKRAR ÇAĞRILMAZ. */
  goBackToPasswordStep(): void {
    if (this.state.step !== 'totp') {
      return
    }
    this.setState({ step: 'password', isSubmitting: false, errorMessage: null })
  }
}

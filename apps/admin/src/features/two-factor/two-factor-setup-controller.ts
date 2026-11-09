// @arkesoft/admin — TwoFactorSetupController (ROADMAP v0.0.15, T-016/S10)
//
// SAF, React'TEN BAĞIMSIZ durum makinesi — AC11'in İKİ bağlayıcı davranışını
// (madde 4 "enable bir kez çağrılır, tekrar gösterim get-totp-uri ile" +
// madde 5 "verify-totp sonrası session.me invalidation") BURADA, DOM/render
// GEREKMEDEN test edilebilir kılar (`vitest.config.ts`'in `environment:
// 'node'` BAĞLAYICI kararı — architect, apps/admin K5: "bileşen davranışı
// Playwright'ta, burada DEĞİL" — bu dosya o kuralı İHLAL ETMEZ, çünkü React
// bileşeni DEĞİL, saf bir kontrolcü sınıfıdır).
//
// `TwoFactorSetupWizard.tsx` bu sınıfı `useState`'in LAZY başlangıç değeri
// ile sarar (`useRef` DEĞİL — `react-hooks/refs` kuralı render sırasında ref
// okuma/yazmayı yasaklıyor); TÜM karar mantığı burada yaşar, bileşen
// yalnızca RENDER eder.
//
// DÜZELTME TURU 2 (T-016/M-6 — bağlayıcı, `solid` bulgusu): `mapError`
// `(error: unknown) => string` İMZASI TAŞIYORDU — her çağrı sitesi ZATEN
// `TwoFactorErrorResult.error: PanelError` tipinde bir değer gönderiyordu,
// yani imza GERÇEK çağrı şeklinden GENİŞ tutulmuştu ve `TwoFactorSetup
// Wizard.tsx`'in `mapError` sarmalayıcısı bu gereksiz genişliği `error as
// PanelError` CAST'İYLE kapatıyordu — hiçbir runtime doğrulamasından SONRA
// DEĞİL (CLAUDE.md §2 ihlali). İmza artık çağrı şeklinin GERÇEĞİNİ
// (`PanelError`) yansıtıyor; sarmalayıcı CAST'E ihtiyaç duymadan silinebildi
// (bkz. `TwoFactorSetupWizard.tsx`, artık `resolvePanelErrorMessage`
// DOĞRUDAN geçiliyor).
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
  /** AC11 madde 5 — verify-totp BAŞARILI olduğunda BİR KEZ çağrılır (çağıran `session.me`'yi invalidate eder). */
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
      /** `get-totp-uri` ile tekrar gösterimde `null` OLABİLİR (ux'in kabul ettiği sınır — "sayfa yenilenirse yedek kodlar kaybolur"). */
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
   * AC11 madde 4 — hangi REST çağrısının yapılacağını belirleyen SAF karar.
   * `enable` zaten bu mount'ta çağrıldıysa (sihirbaz adım 3'ten adım 2'ye
   * GERİ dönüp tekrar şifre gönderdiyse) `get-totp-uri` seçilir — `enable`
   * İKİNCİ kez ÇAĞRILMAZ (ikinci çağrı sırrı yeniden üretir, backend'in
   * authenticator kaydını öldürür).
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

    // AC11 madde 5 — verify-totp BAŞARILI: tetikleyici BİR KEZ çağrılır.
    this.deps.onVerified()

    if (this.capturedBackupCodes !== null) {
      this.setState({ step: 'backup-codes', backupCodes: this.capturedBackupCodes })
    } else {
      this.setState({ step: 'completed' })
    }
  }

  /** Kullanıcı adım 3'ten (yedek kodlar) adım 2'ye (kod onayı) GERİ döner — `enable` TEKRAR ÇAĞRILMAZ (resolveTotpUriAction zaten `hasCalledEnable`'ı kontrol eder). */
  goBackToPasswordStep(): void {
    if (this.state.step !== 'totp') {
      return
    }
    this.setState({ step: 'password', isSubmitting: false, errorMessage: null })
  }
}

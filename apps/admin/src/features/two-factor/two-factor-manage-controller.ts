// @arkesoft/admin — TwoFactorManageController (ROADMAP v0.0.15, T-016 FIX
// turu 2/M-3, docs/ui/T-016-iki-faktorlu-dogrulama.md P7)
//
// SAF, React'TEN BAĞIMSIZ durum makinesi — `TwoFactorSetupController`'ın
// (AC11 madde 4/5) AYNI deseni: "devre dışı bırak"/"yeni yedek kodlar
// oluştur" KARARI burada, DOM/render GEREKMEDEN test edilebilir
// (`vitest.config.ts`'in `environment: 'node'` BAĞLAYICI kararı — bu dosya
// React bileşeni DEĞİL, saf bir kontrolcü sınıfıdır).
//
// Kök neden (`solid` bulgusu, M-3): bu karar mantığı ESKİDEN
// `TwoFactorStatusCard.tsx`'in İÇİNDEYDİ — `invalidateQueries →
// writeTwoFactorEnabled(false) → setQueryData` ÜÇLÜSÜNDEN biri kaldırılsa
// HİÇBİR test kırmızı olmuyordu (bileşen testsizdi, `vitest.config.ts`
// render testi YASAKLIYOR). M-4 (sessionStorage deposunun silinmesi) ile
// BİRLEŞTİRİLDİ: üçlü artık YOK — başarı sonrası TEK yapılan şey
// `deps.onDisabled()`/`deps.onRegenerated()` tetikleyicisidir (çağıran,
// `session.me`'yi invalidate eder — M-4).
import type { PanelError } from '../../errors/panel-error.js'
import type {
  DisableTwoFactorResult,
  GenerateBackupCodesResult,
} from '../../api/two-factor-rest.js'

export type TwoFactorManageDialogKind = 'none' | 'disable' | 'regenerate'

export interface TwoFactorManageDeps {
  readonly disable: (password: string) => Promise<DisableTwoFactorResult>
  readonly generateBackupCodes: (password: string) => Promise<GenerateBackupCodesResult>
  /** `disable` BAŞARILI olduğunda BİR KEZ çağrılır (AC11 — `disable` de YENİ oturum kurar/eskisini siler; çağıran `session.me`'yi invalidate eder). */
  readonly onDisabled: () => void
  /** `generateBackupCodes` BAŞARILI olduğunda BİR KEZ, YENİ kodlarla çağrılır. */
  readonly onRegenerated: (backupCodes: readonly string[]) => void
}

export interface TwoFactorManageState {
  readonly dialogKind: TwoFactorManageDialogKind
  readonly password: string
  readonly isMutating: boolean
  readonly mutationError: string | null
}

const INITIAL_STATE: TwoFactorManageState = {
  dialogKind: 'none',
  password: '',
  isMutating: false,
  mutationError: null,
}

export class TwoFactorManageController {
  private state: TwoFactorManageState = INITIAL_STATE

  constructor(
    private readonly deps: TwoFactorManageDeps,
    private readonly mapError: (error: PanelError) => string,
    private readonly onChange: (state: TwoFactorManageState) => void,
  ) {}

  getState(): TwoFactorManageState {
    return this.state
  }

  private setState(next: TwoFactorManageState): void {
    this.state = next
    this.onChange(next)
  }

  openDialog(kind: 'disable' | 'regenerate'): void {
    this.setState({ ...INITIAL_STATE, dialogKind: kind })
  }

  closeDialog(): void {
    this.setState(INITIAL_STATE)
  }

  setPassword(password: string): void {
    this.setState({ ...this.state, password })
  }

  /** Diyalog "devre dışı bırak" İÇİN AÇIK DEĞİLSE no-op (savunma amaçlı — `ConfirmDialog` kapalıyken tetiklenemez). */
  async confirmDisable(): Promise<void> {
    if (this.state.dialogKind !== 'disable') {
      return
    }
    this.setState({ ...this.state, isMutating: true, mutationError: null })
    const result = await this.deps.disable(this.state.password)

    if (result.kind === 'error') {
      this.setState({
        ...this.state,
        isMutating: false,
        mutationError: this.mapError(result.error),
      })
      return
    }

    this.deps.onDisabled()
    this.closeDialog()
  }

  /** Diyalog "yeniden oluştur" İÇİN AÇIK DEĞİLSE no-op (savunma amaçlı). */
  async confirmRegenerate(): Promise<void> {
    if (this.state.dialogKind !== 'regenerate') {
      return
    }
    this.setState({ ...this.state, isMutating: true, mutationError: null })
    const result = await this.deps.generateBackupCodes(this.state.password)

    if (result.kind === 'error') {
      this.setState({
        ...this.state,
        isMutating: false,
        mutationError: this.mapError(result.error),
      })
      return
    }

    this.deps.onRegenerated(result.backupCodes)
    this.closeDialog()
  }
}

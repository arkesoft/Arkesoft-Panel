// @arkesoft/admin — ActiveSessionsController + saf sunum yardımcıları
// (ROADMAP v0.0.15.1, T-017/S11, docs/ux/T-017 + docs/ui/T-017)
//
// SAF, React'TEN BAĞIMSIZ durum makinesi — `TwoFactorManageController`'ın
// (T-016 FIX turu 2/M-3) AYNI deseni: "tekil sonlandır"/"tümünü sonlandır"
// KARARI (hangi mutasyon çağrılır, başarı/hata dalı, diyalog açma/kapama)
// burada, DOM/render GEREKMEDEN test edilebilir (`vitest.config.ts`'in
// `environment: 'node'` BAĞLAYICI kararı).
//
// ⚠⚠ UI PLANINDAN SAPMA — KARAR ③ (frontend, S11, bağlayıcı, gerekçeli):
// docs/ui/T-017 RİSKLER #1 üç seçenek sundu ("ConfirmDialog koşulsuz iki
// buton render ediyor, 404'te tek-buton modu bugün YOK") ve kararı
// `frontend`'e BIRAKTI. Bu dosya (c)'yi SEÇTİ: 404 `SESSION_NOT_FOUND`
// durumunda diyalog OTOMATİK kapanır (`handleMutationError` → `closeDialog`
// + `deps.onSessionGone()`), `ConfirmDialog.tsx`'e HİÇBİR DOKUNUŞ YOK.
// Gerekçe: (a) seçeneği `ConfirmDialog`'un "DEĞİŞMEYECEK" kararıyla
// doğrudan çelişirdi (po'nun ölçümü, S10'un bağlayıcı kararı); (b) seçeneği
// ("Sonlandır" `disabled` + "Vazgeç"→"Kapat") `ConfirmDialog`'un onay
// butonunu DIŞARIDAN `disabled` yapacak bir prop SUNMUYOR (yalnızca
// `isConfirming` → `isLoading` → metni "Doğrulanıyor…"ya çeviriyor, "Kapat"
// durumunu TEMSİL EDEMEZ) — sahte-disable (yalnızca `onConfirm`'i no-op
// yapıp butonu görsel olarak AKTİF bırakmak) odaklanılabilir ama hiçbir şey
// yapmayan bir kontrol üretirdi, bu da gerçek bir erişilebilirlik kusuru
// olurdu. (c) `ConfirmDialog`'a SIFIR dokunuşla, parola doğru olduğu için
// zaten "hata" OLMAYAN bir durumu (hedef satır zaten gitmiş) kart
// seviyesinde bir `role="alert"` bildirimiyle anlatır — ux'in "Liste
// güncellendi" mesajı BİREBİR korunur, yalnızca YERİ diyalogdan karta
// taşınır (bkz. `ActiveSessionsCard.tsx`'in `sessionGoneNotice` durumu).
// Orkestratör'e bildirim GEREKMİYOR (yalnızca (a) seçilirse gerekirdi —
// handoff'un ③ notu).
import type { ActiveSessionWire, DeviceBrowserWire, DeviceOsWire } from '@arkesoft/trpc'
import { deviceBrowserSchema, deviceOsSchema } from '@arkesoft/trpc'

import type { PanelError } from '../../errors/panel-error.js'
import { MESSAGES } from '../../messages/messages.js'

// ---------------------------------------------------------------------------
// Saf sunum yardımcıları — `ActiveSessionsCard.tsx` VE bu dosyanın testleri
// tüketir. `packages/ui` bileşenleri bunları BİLMEZ (veri/sunum ayrımı).
// ---------------------------------------------------------------------------

/**
 * `DeviceBrowserWire`'ın TAM kapalı dünyası — `satisfies` DERLEME zamanında
 * eksik/fazla üyeyi YAKALAR (S4'ün önerisi: üye sayısı `deviceBrowserSchema.
 * options`'tan türetilir, elle SAYILMAZ — bkz. aşağıdaki
 * `DEVICE_BROWSER_LABEL_KEY_COUNT`). `other`/`unknown` AYNI Türkçe metne
 * eşlenir (ui planının KARARI, docs/ui/T-017:97 — ikisi de "bu cihazı
 * tanıyamadım" anlamına gelir, ayrı bir anahtar AÇILMAZ).
 */
const BROWSER_LABELS = {
  ...MESSAGES.accountSecurity.sessions.deviceLabels,
  other: MESSAGES.accountSecurity.sessions.browserUnknown,
  unknown: MESSAGES.accountSecurity.sessions.browserUnknown,
} satisfies Record<DeviceBrowserWire, string>

/** {@link BROWSER_LABELS} ile AYNI gerekçe, işletim sistemi ailesi için. */
const OS_LABELS = {
  ...MESSAGES.accountSecurity.sessions.osLabels,
  other: MESSAGES.accountSecurity.sessions.osUnknown,
  unknown: MESSAGES.accountSecurity.sessions.osUnknown,
} satisfies Record<DeviceOsWire, string>

/**
 * `satisfies Record<DeviceBrowserWire, string>` DERLEME zamanında ZATEN
 * tamlığı garanti eder; bu sayaçlar ÇALIŞMA ZAMANI testinin BAĞIMSIZ kanıtı
 * (`ERROR_MESSAGES_KEY_COUNT`'un AYNI deseni, `messages.ts`). Üye sayısı
 * `deviceBrowserSchema.options`/`deviceOsSchema.options`'TAN türetilir —
 * ELLE sayılmaz (S4'ün önerisi).
 */
export const DEVICE_BROWSER_LABEL_KEY_COUNT = Object.keys(BROWSER_LABELS).length
export const DEVICE_OS_LABEL_KEY_COUNT = Object.keys(OS_LABELS).length
export const DEVICE_BROWSER_WIRE_OPTION_COUNT = deviceBrowserSchema.options.length
export const DEVICE_OS_WIRE_OPTION_COUNT = deviceOsSchema.options.length

/** "Chrome · Windows" biçiminde cihaz etiketi — kapalı sözlük, ham `userAgent` ASLA görülmez. */
export function resolveDeviceLabel(
  browserFamily: DeviceBrowserWire,
  osFamily: DeviceOsWire,
): string {
  return `${BROWSER_LABELS[browserFamily]} · ${OS_LABELS[osFamily]}`
}

/**
 * IP'nin GÖRÜNÜR değeri — `null`/`''` (S6'nın iki "yok" sentinel'i, ikisi de
 * tele `null` olarak gelir, bkz. `session-summary.schema.ts`) AYNI Türkçe
 * metne (`ipUnknown`) eşlenir (ui planının KARARI). Maskeleme YOK —
 * ADR-0019 §Karar 2, gerçek IP OLDUĞU GİBİ döner.
 */
export function resolveIpDisplayValue(ipAddress: string | null): string {
  if (ipAddress === null || ipAddress.length === 0) {
    return MESSAGES.accountSecurity.sessions.ipUnknown
  }
  return ipAddress
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * `lastSeenAt`'in bağıl Türkçe karşılığı — 5 dakika altı "Az önce" (ADR-0019
 * md.3'ün "son görülme" penceresinin GERÇEK çözünürlüğü, S6/ui planı).
 * `nowMs` ENJEKTE edilir (saf fonksiyon, `Date.now()` BURADA çağrılmaz) —
 * testin deterministik olabilmesi için (`ActiveSessionsCard.tsx` gerçek
 * `Date.now()`'u ÇAĞIRANDIR).
 */
export function formatLastSeen(lastSeenAtIso: string, nowMs: number): string {
  const diffMs = Math.max(0, nowMs - new Date(lastSeenAtIso).getTime())

  if (diffMs < 5 * MINUTE_MS) {
    return MESSAGES.accountSecurity.sessions.lastSeenJustNow
  }
  if (diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS)
    return MESSAGES.accountSecurity.sessions.lastSeenMinutesAgo.replace(
      '{dakika}',
      minutes.toString(),
    )
  }
  if (diffMs < DAY_MS) {
    const hours = Math.floor(diffMs / HOUR_MS)
    return MESSAGES.accountSecurity.sessions.lastSeenHoursAgo.replace('{saat}', hours.toString())
  }
  const days = Math.floor(diffMs / DAY_MS)
  return MESSAGES.accountSecurity.sessions.lastSeenDaysAgo.replace('{gun}', days.toString())
}

/**
 * "{cihaz} oturumunu sonlandır (IP {ip}, son görülme {süre})" — ux'in
 * erişilebilir ad şablonu (docs/ux/T-017 "Erişilebilirlik niyeti").
 */
export function resolveTerminateAccessibleName(row: ActiveSessionWire, nowMs: number): string {
  return MESSAGES.accountSecurity.sessions.terminateAccessibleName
    .replace('{cihaz}', resolveDeviceLabel(row.browserFamily, row.osFamily))
    .replace('{ip}', resolveIpDisplayValue(row.ipAddress))
    .replace('{süre}', formatLastSeen(row.lastSeenAt, nowMs))
}

/** Step-up diyaloğunun tekil gövde metni — ux'in "hangi oturumun kapatılacağını tekrar eder" şartı. */
export function composeStepUpBodySingle(row: ActiveSessionWire, nowMs: number): string {
  return MESSAGES.accountSecurity.sessions.stepUpBodySingle
    .replace('{cihaz}', resolveDeviceLabel(row.browserFamily, row.osFamily))
    .replace('{ip}', resolveIpDisplayValue(row.ipAddress))
    .replace('{süre}', formatLastSeen(row.lastSeenAt, nowMs))
}

/** "{cihaz} oturumu sonlandırıldı." — tekil sonlandırma başarı bildirimi. */
export function composeTerminateSuccessNotice(row: ActiveSessionWire): string {
  return MESSAGES.accountSecurity.sessions.terminateSuccess.replace(
    '{cihaz}',
    resolveDeviceLabel(row.browserFamily, row.osFamily),
  )
}

/**
 * Listeyi ux'in şartına göre sıralar: "Bu cihaz" ÜSTTE sabit, diğerleri
 * `lastSeenAt` azalan (en yakın zamanda kullanılan ÖNCE) — sunucu sırası
 * (`createdAt` azalan) DEĞİŞMEZ, bu TAMAMEN istemci tarafı bir yeniden
 * dizme (docs/ux/T-017 "Mutlu yol A", madde 2-3).
 */
export function orderActiveSessions(
  rows: readonly ActiveSessionWire[],
): readonly ActiveSessionWire[] {
  const currentRow = rows.find((row) => row.isCurrent) ?? null
  const otherRows = rows
    .filter((row) => !row.isCurrent)
    .slice()
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())

  return currentRow === null ? otherRows : [currentRow, ...otherRows]
}

// ---------------------------------------------------------------------------
// Durum makinesi
// ---------------------------------------------------------------------------

export type SessionDialogKind = 'none' | 'single' | 'all'

export interface ActiveSessionsState {
  readonly dialogKind: SessionDialogKind
  readonly targetSessionId: string | null
  readonly password: string
  readonly isMutating: boolean
  /** 400 `INVALID_PASSWORD` → `Input`'un `error` prop'una gider (field-level). */
  readonly fieldError: string | null
  /** 429/ağ/diğer → diyalog seviyesi `role="alert"` (field'la İLGİSİZ). */
  readonly dialogError: string | null
}

// wcag FIX turu 1/L-3 (solid bulgusu) — `ActiveSessionsCard.tsx`'in kendi
// `INITIAL_SESSIONS_STATE`'i bu sabitin BİREBİR (alan VE değer) kopyasıydı;
// dışa açılıp ORADA import edilir, ikinci bir elle yazım KALMAZ.
export const INITIAL_STATE: ActiveSessionsState = {
  dialogKind: 'none',
  targetSessionId: null,
  password: '',
  isMutating: false,
  fieldError: null,
  dialogError: null,
}

export type SessionMutationResult =
  { readonly kind: 'revoked' } | { readonly kind: 'error'; readonly error: PanelError }

export interface ActiveSessionsDeps {
  readonly revokeSession: (sessionId: string, password: string) => Promise<SessionMutationResult>
  readonly revokeAllSessions: (password: string) => Promise<SessionMutationResult>
}

/**
 * `confirmSingle`/`confirmAll`'ın SONUCU — çağıran (`ActiveSessionsCard.tsx`)
 * bu ayrımlı birleşimi (discriminated union) bir DOM olay işleyicisinin
 * (`onConfirm`) İÇİNDE işler (`switch` + `assertNever`). `ActiveSessionsDeps`
 * BİLEREK `onSingleRevoked`/`onSessionGone`/`onAllRevoked`/
 * `onUnauthenticated` callback'leri TAŞIMAZ (önceki tasarım) — o callback'ler
 * `cardTitleRef`/bildirim `useRef`'lerini KAPATIYORDU ve bu nesne `useState`'in
 * LAZY başlatıcısı İÇİNDE (RENDER sırasında) İNŞA EDİLİYORDU; React'in
 * `react-hooks/refs` kuralı bunu "ref'i RENDER sırasında çağrılan bir
 * fonksiyona GEÇİRMEK" olarak İŞARETLEDİ (bilinmeyen bir kurucunun o ref'i
 * SENKRON okuyup okumadığını STATİK olarak kanıtlayamaz). Bu tasarım TÜM ref
 * erişimini `onConfirm`'in KENDİSİNE (gerçek bir DOM olay işleyicisi,
 * React'in TANIDIĞI güvenli bölge) taşıyarak kökten çözer — controller
 * artık HİÇBİR ref'i BİLMEZ, saf durum geçişi + SONUÇ döner.
 */
export type ActiveSessionsOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'revoked'; readonly sessionId: string }
  | { readonly kind: 'sessionGone' }
  | { readonly kind: 'allRevoked' }
  | { readonly kind: 'unauthenticated' }

export class ActiveSessionsController {
  private state: ActiveSessionsState = INITIAL_STATE

  constructor(
    private readonly deps: ActiveSessionsDeps,
    private readonly mapError: (error: PanelError) => string,
    private readonly onChange: (state: ActiveSessionsState) => void,
  ) {}

  getState(): ActiveSessionsState {
    return this.state
  }

  private setState(next: ActiveSessionsState): void {
    this.state = next
    this.onChange(next)
  }

  openSingleDialog(sessionId: string): void {
    this.setState({ ...INITIAL_STATE, dialogKind: 'single', targetSessionId: sessionId })
  }

  openAllDialog(): void {
    this.setState({ ...INITIAL_STATE, dialogKind: 'all' })
  }

  closeDialog(): void {
    this.setState(INITIAL_STATE)
  }

  setPassword(password: string): void {
    this.setState({ ...this.state, password })
  }

  /** Diyalog "single" İÇİN AÇIK DEĞİLSE `{kind:'none'}` (savunma amaçlı — `ConfirmDialog` kapalıyken tetiklenemez). */
  async confirmSingle(): Promise<ActiveSessionsOutcome> {
    if (this.state.dialogKind !== 'single' || this.state.targetSessionId === null) {
      return { kind: 'none' }
    }
    const targetSessionId = this.state.targetSessionId
    this.setState({ ...this.state, isMutating: true, fieldError: null, dialogError: null })

    const result = await this.runMutation(() =>
      this.deps.revokeSession(targetSessionId, this.state.password),
    )

    if (result.kind === 'revoked') {
      this.closeDialog()
      return { kind: 'revoked', sessionId: targetSessionId }
    }

    return this.handleMutationError(result.error, { sessionNotFoundIsGone: true })
  }

  /** Diyalog "all" İÇİN AÇIK DEĞİLSE `{kind:'none'}` (savunma amaçlı). */
  async confirmAll(): Promise<ActiveSessionsOutcome> {
    if (this.state.dialogKind !== 'all') {
      return { kind: 'none' }
    }
    this.setState({ ...this.state, isMutating: true, fieldError: null, dialogError: null })

    const result = await this.runMutation(() => this.deps.revokeAllSessions(this.state.password))

    if (result.kind === 'revoked') {
      this.closeDialog()
      return { kind: 'allRevoked' }
    }

    return this.handleMutationError(result.error, { sessionNotFoundIsGone: false })
  }

  /**
   * `run`'ın KENDİSİ FIRLATIRSA (gerçek ağ hatası — bir YANIT hiç
   * ALINAMADI), `kind: 'unknown'` bir `PanelError`'a ÇEVRİLİR
   * (`_auth.sign-in.tsx`'in AYNI deseni) — `mapError({kind:'unknown',...})`
   * `MESSAGES.errors.network`'e çözülür (messages.ts'in
   * `resolvePanelErrorMessage`'ı), İKİNCİ bir metin kaynağı İCAT EDİLMEZ.
   */
  private async runMutation(
    run: () => Promise<SessionMutationResult>,
  ): Promise<SessionMutationResult> {
    try {
      return await run()
    } catch {
      return { kind: 'error', error: { kind: 'unknown', requestId: null } }
    }
  }

  private handleMutationError(
    error: PanelError,
    options: { readonly sessionNotFoundIsGone: boolean },
  ): ActiveSessionsOutcome {
    if (error.kind === 'known' && error.code === 'UNAUTHENTICATED') {
      this.closeDialog()
      return { kind: 'unauthenticated' }
    }

    if (
      options.sessionNotFoundIsGone &&
      error.kind === 'known' &&
      error.code === 'SESSION_NOT_FOUND'
    ) {
      this.closeDialog()
      return { kind: 'sessionGone' }
    }

    if (error.kind === 'known' && error.code === 'INVALID_PASSWORD') {
      this.setState({ ...this.state, isMutating: false, fieldError: this.mapError(error) })
      return { kind: 'none' }
    }

    // 429 / ağ / diğer her şey → diyalog seviyesi (field'la İLGİSİZ, ux'in ayrımı).
    this.setState({ ...this.state, isMutating: false, dialogError: this.mapError(error) })
    return { kind: 'none' }
  }
}

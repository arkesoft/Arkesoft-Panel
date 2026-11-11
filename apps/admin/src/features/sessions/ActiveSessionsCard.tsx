// @arkesoft/admin — ActiveSessionsCard (ROADMAP v0.0.15.1, T-017/S11,
// docs/ux/T-017-oturum-listesi-ve-step-up.md, docs/ui/T-017-oturum-
// listesi-ve-step-up.md)
//
// Veri çeken KONTEYNER (CLAUDE.md §9) — `packages/ui` ilkellerini
// (Card/Button/Input/Skeleton) ve `apps/admin`'in `ConfirmDialog`'unu
// PROP'larla besler, kendisi veri çekmeyen bir sunum bileşeni İNŞA ETMEZ.
// Karar/mutasyon mantığı `ActiveSessionsController`'da (saf, testli) —
// bu bileşen SADECE render eder + controller'ı `useState`'in LAZY başlangıç
// değeriyle bağlar (`TwoFactorStatusCard.tsx`'in AYNI deseni).
//
// Dört durum (docs/ux "Ekran durumları" tablosu): yükleniyor → `Skeleton`,
// kart içi hata → inline `role="alert"` + retry, boş → N/A (bu kaynak
// YAPISAL olarak her zaman en az bir satır — çağıranın kendi oturumu —
// içerir), normal → "Bu cihaz" üstte sabit + diğerleri `lastSeenAt` azalan.
//
// ⚠⚠ KARAR ③ (bağlayıcı, gerekçesi `active-sessions-controller.ts`'in
// dosya başı yorumunda): 404 `SESSION_NOT_FOUND` durumunda `ConfirmDialog`
// DEĞİŞTİRİLMEDEN diyalog OTOMATİK kapanır; bu kart `sessionGoneNotice`
// durumuyla kendi `role="alert"` bildirimini gösterir + listeyi tazeler.
//
// Odak yönetimi (docs/ux "Erişilebilirlik niyeti", T-016'nın AYNI deseni):
// tekil sonlandırma BAŞARILI olduğunda VEYA hedef oturum zaten gittiğinde
// (404) satır/diyalog artık YOK — odak `CardTitle`'a (`tabIndex={-1}`)
// taşınır, aynı anda bir `aria-live` bölge bildirimi duyurur. Düz İPTAL
// dalında (Escape/"Vazgeç"/×) odağın tetikleyiciye dönmesi `useDialogTriggerFocus`
// (`solid` FIX turu 2/MED-1 — gerekçe o dosyanın dosya başı yorumunda,
// burada TEKRARLANMAZ) ile yönetilir.
//
// ⚠⚠ React'in `react-hooks/refs`/`react-hooks/purity` kuralları (bağlayıcı,
// `eslint .` KIRMIZI verdi — ÖLÇÜLDÜ): (1) `cardTitleRef`/bildirim
// zamanlayıcı ref'i YALNIZCA gerçek DOM olay işleyicilerinin (`onClick`,
// `onConfirm`) İÇİNDE okunur/yazılır — `ActiveSessionsController`'ın
// `useState`'in LAZY başlatıcısı İÇİNDE (RENDER sırasında) KURULAN
// deps'lerinden HİÇBİRİ artık ref KAPATMAZ (bkz. controller'ın dosya başı
// yorumu — `confirmSingle`/`confirmAll` artık callback ÇAĞIRMAZ, bir
// `ActiveSessionsOutcome` DÖNER, bu bileşenin `onConfirm`'i SONUCU işler).
// (2) "Son görülme" hesaplaması `Date.now()` (saf olmayan, RENDER sırasında
// ÇAĞRILAMAZ) KULLANMAZ — `sessionsQuery.dataUpdatedAt` (TanStack Query'nin
// KENDİ, saf okunabilir alanı, sorgu her tazelendiğinde GÜNCELLENİR) "şimdi"
// için kullanılır; bu aynı zamanda ADR-0019 md.3'ün 300sn hassasiyet
// notuyla TUTARLI (saniye saniye TİKLEYEN bir sayaç GEREKMİYOR).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type JSX } from 'react'

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@arkesoft/ui'

import { activeSessionsQueryKey, activeSessionsQueryOptions } from '../../api/sessions-query.js'
import { revokeAllSessions, revokeSession } from '../../api/sessions-rest.js'
import { ConfirmDialog } from '../../components/ConfirmDialog.js'
import { assertNever } from '../../errors/assert-never.js'
import { useDialogTriggerFocus } from '../../hooks/use-dialog-trigger-focus.js'
import { MESSAGES, resolvePanelErrorMessage } from '../../messages/messages.js'
import {
  ActiveSessionsController,
  composeStepUpBodySingle,
  composeTerminateSuccessNotice,
  formatLastSeen,
  INITIAL_STATE as INITIAL_SESSIONS_STATE,
  orderActiveSessions,
  resolveDeviceLabel,
  resolveIpDisplayValue,
  resolveTerminateAccessibleName,
  type ActiveSessionsOutcome,
  type ActiveSessionsState,
} from './active-sessions-controller.js'

/** Geçici bildirimlerin (başarı/"gitti") görünür kaldığı süre. */
const TRANSIENT_NOTICE_MS = 4000

export function ActiveSessionsCard(): JSX.Element {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const sessionsQuery = useQuery(activeSessionsQueryOptions)

  const cardTitleRef = useRef<HTMLParagraphElement>(null)
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // wcag FIX turu 1/W-1 (high bulgusu, WCAG 2.4.3), `solid` FIX turu 2/MED-1
  // ile paylaşılan hook'a ÇIKARILDI — gerekçe `use-dialog-trigger-focus.ts`
  // dosya başı yorumunda, burada TEKRARLANMAZ.
  const { captureDialogTrigger, focusDialogTriggerAfterClose } = useDialogTriggerFocus()

  const [successNotice, setSuccessNotice] = useState<string | null>(null)
  const [goneNotice, setGoneNotice] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current !== null) {
        clearTimeout(noticeTimeoutRef.current)
      }
    }
  }, [])

  // Aşağıdaki üç yardımcı BİLEREK normal fonksiyon bildirimleridir (`useState`'in
  // LAZY başlatıcısı İÇİNE GÖMÜLMEZ, dosya başı yorumu) — yalnızca gerçek olay
  // işleyicilerinden (`onClick`/`onConfirm`) ÇAĞRILIR.
  function scheduleNoticeClear(clear: () => void): void {
    if (noticeTimeoutRef.current !== null) {
      clearTimeout(noticeTimeoutRef.current)
    }
    noticeTimeoutRef.current = setTimeout(clear, TRANSIENT_NOTICE_MS)
  }

  function focusCardTitle(): void {
    cardTitleRef.current?.focus()
  }

  /** `revoke-all` başarısı VE 401 İKİSİ de bu YOLA çıkar — mevcut `treatAsSignedOut` deseni (`_app.tsx:140-151`), YENİ bir mekanizma İCAT EDİLMEZ. */
  function signOutLocallyAndRedirect(): void {
    queryClient.clear()
    void navigate({ to: '/sign-in' })
  }

  const [sessionsState, setSessionsState] = useState<ActiveSessionsState>(INITIAL_SESSIONS_STATE)
  const [controller] = useState(
    () =>
      new ActiveSessionsController(
        { revokeSession, revokeAllSessions },
        resolvePanelErrorMessage,
        setSessionsState,
      ),
  )

  const sessionsData = sessionsQuery.data ?? null
  const orderedRows = sessionsData !== null ? orderActiveSessions(sessionsData) : []
  const showTerminateAll = sessionsData !== null && sessionsData.length >= 2
  const nowMs = sessionsQuery.dataUpdatedAt

  const dialogTargetRow =
    sessionsState.dialogKind === 'single'
      ? (sessionsData?.find((row) => row.id === sessionsState.targetSessionId) ?? null)
      : null

  /** `ConfirmDialog`'un "Onayla" düğmesinin (gerçek DOM olay işleyicisi) ÇAĞIRDIĞI tek yer — controller SONUÇ döner, TÜM ref/yan etki erişimi BURADA. */
  function handleConfirm(): void {
    void (async () => {
      const outcome: ActiveSessionsOutcome =
        sessionsState.dialogKind === 'all'
          ? await controller.confirmAll()
          : await controller.confirmSingle()

      switch (outcome.kind) {
        case 'revoked': {
          const revokedRow = sessionsData?.find((row) => row.id === outcome.sessionId) ?? null
          void queryClient.invalidateQueries({ queryKey: activeSessionsQueryKey })
          setGoneNotice(null)
          setSuccessNotice(
            revokedRow !== null
              ? composeTerminateSuccessNotice(revokedRow)
              : MESSAGES.accountSecurity.sessions.terminateSuccess.replace(
                  '{cihaz}',
                  MESSAGES.accountSecurity.sessions.deviceUnknown,
                ),
          )
          scheduleNoticeClear(() => {
            setSuccessNotice(null)
          })
          focusCardTitle()
          return
        }
        case 'sessionGone': {
          void sessionsQuery.refetch()
          setSuccessNotice(null)
          setGoneNotice(MESSAGES.accountSecurity.sessions.sessionGoneNotice)
          scheduleNoticeClear(() => {
            setGoneNotice(null)
          })
          focusCardTitle()
          return
        }
        case 'allRevoked':
        case 'unauthenticated':
          signOutLocallyAndRedirect()
          return
        case 'none':
          return
        default:
          assertNever(outcome, 'ActiveSessionsCard: ActiveSessionsOutcome')
      }
    })()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle ref={cardTitleRef} tabIndex={-1}>
          {MESSAGES.accountSecurity.sessions.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sessionsQuery.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : null}

        {sessionsQuery.isError ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-(length:--font-size-body) text-(--color-danger-600)">
              {MESSAGES.accountSecurity.sessions.cardLoadError}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void sessionsQuery.refetch()
              }}
            >
              {MESSAGES.errors.retryButton}
            </Button>
          </div>
        ) : null}

        {successNotice !== null ? (
          <p role="status" className="text-(length:--font-size-body) text-(--color-success-600)">
            {successNotice}
          </p>
        ) : null}

        {goneNotice !== null ? (
          <div className="flex items-center justify-between gap-3">
            <p role="alert" className="text-(length:--font-size-body) text-(--color-danger-600)">
              {goneNotice}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setGoneNotice(null)
              }}
            >
              {MESSAGES.accountSecurity.sessions.sessionGoneClose}
            </Button>
          </div>
        ) : null}

        {sessionsQuery.isSuccess ? (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-3">
              {orderedRows.map((row) => {
                const deviceLabel = resolveDeviceLabel(row.browserFamily, row.osFamily)
                const ipDisplay = resolveIpDisplayValue(row.ipAddress)
                const lastSeenText = formatLastSeen(row.lastSeenAt, nowMs)

                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-1 border-b border-(--color-border-subtle) pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-(--font-weight-semibold) text-(length:--font-size-body) text-(--color-text-primary)">
                        {deviceLabel}
                      </span>
                      {row.isCurrent ? (
                        <span className="font-(--font-weight-semibold) text-(length:--font-size-small) text-(--color-text-primary)">
                          {MESSAGES.accountSecurity.sessions.currentDeviceBadge}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-(length:--font-size-body) text-(--color-text-secondary)">
                      {MESSAGES.accountSecurity.sessions.ipLabel.replace('{ip}', ipDisplay)}
                    </p>
                    <p className="text-(length:--font-size-body) text-(--color-text-secondary)">
                      {MESSAGES.accountSecurity.sessions.lastSeenLabel.replace(
                        '{süre}',
                        lastSeenText,
                      )}
                    </p>
                    {!row.isCurrent ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        aria-label={resolveTerminateAccessibleName(row, nowMs)}
                        onClick={(event) => {
                          captureDialogTrigger(event)
                          setGoneNotice(null)
                          setSuccessNotice(null)
                          controller.openSingleDialog(row.id)
                        }}
                      >
                        {MESSAGES.accountSecurity.sessions.terminateButton}
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>

            {showTerminateAll ? (
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                onClick={(event) => {
                  captureDialogTrigger(event)
                  setGoneNotice(null)
                  setSuccessNotice(null)
                  controller.openAllDialog()
                }}
              >
                {MESSAGES.accountSecurity.sessions.terminateAllButton}
              </Button>
            ) : (
              <p className="text-(length:--font-size-body) text-(--color-text-secondary)">
                {MESSAGES.accountSecurity.sessions.onlyThisDeviceNote}
              </p>
            )}
          </div>
        ) : null}
      </CardContent>

      <SessionStepUpDialog
        open={sessionsState.dialogKind !== 'none'}
        kind={sessionsState.dialogKind === 'all' ? 'all' : 'single'}
        bodyText={
          sessionsState.dialogKind === 'all'
            ? MESSAGES.accountSecurity.sessions.stepUpBodyAll
            : dialogTargetRow !== null
              ? composeStepUpBodySingle(dialogTargetRow, nowMs)
              : ''
        }
        password={sessionsState.password}
        isMutating={sessionsState.isMutating}
        fieldError={sessionsState.fieldError}
        dialogError={sessionsState.dialogError}
        onOpenChange={(open) => {
          if (!open) {
            controller.closeDialog()
            // W-1 — bu dal yalnızca Radix'in KENDİSİ tetiklediğinde çalışır
            // (Escape/overlay/"Vazgeç"/× tıklama); başarı/404/401 dalları
            // `handleConfirm` İÇİNDE state'i değiştirip KENDİ `focus()`
            // çağrısını yapar, `onOpenChange` bu YOLLARDA Radix TARAFINDAN
            // ÇAĞRILMAZ (prop-driven `open` kapanışı callback TETİKLEMEZ).
            focusDialogTriggerAfterClose()
          }
        }}
        onPasswordChange={(value) => {
          controller.setPassword(value)
        }}
        onConfirm={handleConfirm}
      />
    </Card>
  )
}

interface SessionStepUpDialogProps {
  readonly open: boolean
  readonly kind: 'single' | 'all'
  readonly bodyText: string
  readonly password: string
  readonly isMutating: boolean
  readonly fieldError: string | null
  readonly dialogError: string | null
  readonly onOpenChange: (open: boolean) => void
  readonly onPasswordChange: (value: string) => void
  readonly onConfirm: () => void
}

interface StepUpCopy {
  readonly title: string
  readonly confirmLabel: string
  readonly confirmVariant?: 'primary' | 'destructive'
}

function resolveStepUpCopy(kind: 'single' | 'all'): StepUpCopy {
  switch (kind) {
    case 'single':
      return {
        title: MESSAGES.accountSecurity.sessions.stepUpTitleSingle,
        confirmLabel: MESSAGES.accountSecurity.sessions.stepUpConfirmSingle,
      }
    case 'all':
      return {
        title: MESSAGES.accountSecurity.sessions.stepUpTitleAll,
        confirmLabel: MESSAGES.accountSecurity.sessions.stepUpConfirmAll,
        confirmVariant: 'destructive',
      }
    default:
      return assertNever(kind, 'ActiveSessionsCard: SessionDialogKind')
  }
}

/**
 * Tekil ve toplu sonlandırma için TEK, PAYLAŞILAN diyalog bileşimi (ux
 * "Step-up parola diyaloğu" — docs/ui/T-017 bileşen eşlemesi). `ConfirmDialog`
 * (DEĞİŞMEYECEK) + şifre `Input`'u + koşullu diyalog-seviyesi `role="alert"`
 * — `TwoFactorManagePasswordDialog`'un (T-016) AYNI deseni.
 */
function SessionStepUpDialog({
  open,
  kind,
  bodyText,
  password,
  isMutating,
  fieldError,
  dialogError,
  onOpenChange,
  onPasswordChange,
  onConfirm,
}: SessionStepUpDialogProps): JSX.Element {
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const copy = resolveStepUpCopy(kind)

  // wcag/T-016'nın AYNI deseni — alan hatası sonrası odak ALANA geri döner.
  useEffect(() => {
    if (fieldError !== null) {
      passwordInputRef.current?.focus()
    }
  }, [fieldError])

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      body={bodyText}
      confirmLabel={copy.confirmLabel}
      confirmingLabel={MESSAGES.accountSecurity.sessions.stepUpSubmitting}
      cancelLabel={MESSAGES.common.cancel}
      closeLabel={MESSAGES.common.close}
      isConfirming={isMutating}
      {...(copy.confirmVariant !== undefined ? { confirmVariant: copy.confirmVariant } : {})}
      onConfirm={onConfirm}
    >
      <Input
        ref={passwordInputRef}
        label={MESSAGES.accountSecurity.sessions.stepUpPasswordLabel}
        type="password"
        autoComplete="current-password"
        readOnly={isMutating}
        value={password}
        {...(fieldError !== null ? { error: fieldError } : {})}
        onChange={(event) => {
          onPasswordChange(event.target.value)
        }}
      />
      {dialogError !== null ? (
        <p role="alert" className="text-(length:--font-size-body) text-(--color-danger-600)">
          {dialogError}
        </p>
      ) : null}
    </ConfirmDialog>
  )
}

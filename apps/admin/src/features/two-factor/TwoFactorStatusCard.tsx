// @arkesoft/admin — TwoFactorStatusCard (ROADMAP v0.0.15, T-016/S10,
// docs/ui/T-016-iki-faktorlu-dogrulama.md P1 + P7; T-016 FIX turu 2/M-4 +
// M-3 — bkz. aşağıdaki iki not)
//
// Veri çeken KONTEYNER (CLAUDE.md §9) — `packages/ui` ilkellerini
// (Card/Button/Checkbox/Skeleton/CopyButton) ve `apps/admin`'in
// `ConfirmDialog`/`BackupCodesList`'ini PROP'larla besler, kendisi veri
// çekmeyen bir sunum bileşeni İNŞA ETMEZ.
//
// Dört durum (ux "Ekran durumları" tablo 1): yükleniyor → `Skeleton`, kart
// içi hata → inline `role="alert"` + retry, boş → N/A (her zaman açık/
// kapalı, bkz. M-4 notu), normal → açık/kapalı iki görünüm.
//
// ⚠⚠ DÜZELTME TURU 2 (M-4 — bağlayıcı, VERİ KAYBI senaryosu): bu kart
// ESKİDEN kendi `sessionStorage` deposunu (`two-factor-status-store.ts`,
// SEKME BAŞINA) okuyordu. Senaryo: B sekmesi `false` seed'ler → kullanıcı A
// sekmesinde 2FA kurar → B'de kart "Etkinleştir" GÖSTERMEYE DEVAM EDER →
// `enableTwoFactor` İKİNCİ KEZ çağrılır → sır YENİDEN ÜRETİLİR, A'nın
// authenticator kaydı ÖLÜR. Depo/sorgu dosyaları (`two-factor-status-
// store.ts`/`two-factor-status-query.ts`) SİLİNDİ — durum artık TEK
// doğruluk kaynağından, `session.me`'den (`twoFactorEnabled: boolean`,
// ZORUNLU alan, `packages/trpc`) OKUNUYOR; sekmeler arası uyumsuzluk
// YAPISAL olarak İMKÂNSIZ (her sekme AYNI sunucu durumunu sorgular).
// `enable`/`verify-totp` sonrası tazeleme `TwoFactorSetupWizard`'ın
// `onVerified` tetikleyicisinde (AC11 madde 5); `disable` sonrası tazeleme
// AŞAĞIDAKİ `onDisabled`'DA — ikisi de `sessionMeQueryKey`'i invalidate
// eder, İKİNCİ bir yazma/depo YOK.
//
// ⚠⚠ DÜZELTME TURU 2 (M-3 — bağlayıcı): "devre dışı bırak"/"yeniden kodlar
// oluştur" KARAR mantığı (hangi mutasyon çağrılır, başarı/hata dalı, diyalog
// açma/kapama) ESKİDEN bu bileşenin İÇİNDEYDİ ve TESTSİZDİ — artık saf,
// DOM'suz test edilebilir `TwoFactorManageController`'da (`two-factor-
// setup-controller.ts`'in AYNI deseni). Bu bileşen SADECE render eder +
// controller'ı `useState`'in LAZY başlangıç değeriyle bağlar.
//
// ⚠⚠ wcag FIX turu 4/M-W1 (bağlayıcı, 2026-11-09, UI PLANINDAN SAPMA): alt
// `TwoFactorManagePasswordDialog`'daki şifre `Input`'u `ConfirmDialog`'un
// ESKİ genel `errorMessage`/`role="alert"` kutusunu KULLANIYORDU — alandan
// KOPUK, odak hiçbir yere TAŞINMIYORDU. `mutationError` artık `Input.error`
// prop'una gider + hata sonrası `passwordInputRef.current?.focus()`
// çağrılır (bkz. aşağıdaki `TwoFactorManagePasswordDialog`). Bu, docs/ui/
// T-016-iki-faktorlu-dogrulama.md:154'ün BU diyalog için yazdığı "genel
// role=alert" tasarımından SAPAR — gerekçe o dosyanın başındaki not.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type JSX } from 'react'

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@arkesoft/ui'

import { disableTwoFactor, generateBackupCodes } from '../../api/two-factor-rest.js'
import { sessionMeQueryOptions } from '../../api/session-query.js'
import { invalidateSessionIdentity } from '../../api/session-refresh.js'
import { BackupCodesList } from '../../components/BackupCodesList.js'
import { ConfirmDialog } from '../../components/ConfirmDialog.js'
import { MESSAGES, resolvePanelErrorMessage } from '../../messages/messages.js'
import {
  TwoFactorManageController,
  type TwoFactorManageState,
} from './two-factor-manage-controller.js'
import { TwoFactorSetupWizard } from './TwoFactorSetupWizard.js'

const INITIAL_MANAGE_STATE: TwoFactorManageState = {
  dialogKind: 'none',
  password: '',
  isMutating: false,
  mutationError: null,
}

export function TwoFactorStatusCard(): JSX.Element {
  const queryClient = useQueryClient()
  const statusQuery = useQuery(sessionMeQueryOptions)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [regeneratedCodes, setRegeneratedCodes] = useState<readonly string[] | null>(null)
  const [regeneratedSaved, setRegeneratedSaved] = useState(false)

  const [manageState, setManageState] = useState<TwoFactorManageState>(INITIAL_MANAGE_STATE)
  const [manageController] = useState(
    () =>
      new TwoFactorManageController(
        {
          disable: disableTwoFactor,
          generateBackupCodes,
          onDisabled: () => {
            // AC11 — `disable` de YENİ oturum kurar/eskisini siler (ölçülen
            // gerçek); `session.me` (M-4) TAZELENİR, kart eski değeri
            // GÖSTERMEZ.
            invalidateSessionIdentity(queryClient)
          },
          onRegenerated: (backupCodes) => {
            setRegeneratedCodes(backupCodes)
            setRegeneratedSaved(false)
          },
        },
        resolvePanelErrorMessage,
        setManageState,
      ),
  )

  function closeManageDialog(): void {
    manageController.closeDialog()
  }

  if (wizardOpen) {
    return (
      <Card>
        <CardContent>
          <TwoFactorSetupWizard
            onCancel={() => {
              setWizardOpen(false)
            }}
            onCompleted={() => {
              setWizardOpen(false)
            }}
          />
        </CardContent>
      </Card>
    )
  }

  if (regeneratedCodes !== null) {
    return (
      <Card>
        <CardContent>
          <BackupCodesList
            title={MESSAGES.auth.twoFactor.backupCodesTitle}
            codes={regeneratedCodes}
            copyAllLabel={MESSAGES.auth.twoFactor.backupCodesCopyAll}
            copiedLabel={MESSAGES.auth.twoFactor.copiedStatus}
            copyFailedLabel={MESSAGES.auth.twoFactor.copyFailedStatus}
            downloadLabel={MESSAGES.auth.twoFactor.backupCodesDownload}
            downloadFileName={MESSAGES.auth.twoFactor.backupCodesFileName}
            savedCheckboxLabel={MESSAGES.auth.twoFactor.backupCodesSavedCheckbox}
            saved={regeneratedSaved}
            onSavedChange={setRegeneratedSaved}
          />
          <Button
            type="button"
            variant="primary"
            disabled={!regeneratedSaved}
            onClick={() => {
              setRegeneratedCodes(null)
            }}
            className="mt-4"
          >
            {MESSAGES.auth.twoFactor.setupDoneButton}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{MESSAGES.accountSecurity.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {statusQuery.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-11 w-32" />
          </div>
        ) : null}

        {statusQuery.isError ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-(length:--font-size-body) text-(--color-danger-600)">
              {MESSAGES.accountSecurity.twoFactor.cardLoadError}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void statusQuery.refetch()
              }}
            >
              {MESSAGES.errors.retryButton}
            </Button>
          </div>
        ) : null}

        {statusQuery.isSuccess ? (
          <div className="flex flex-col gap-3">
            <p className="font-(--font-weight-semibold) text-(length:--font-size-body) text-(--color-text-primary)">
              {statusQuery.data.twoFactorEnabled
                ? MESSAGES.accountSecurity.twoFactor.statusOnTitle
                : MESSAGES.accountSecurity.twoFactor.statusOffTitle}
            </p>
            {!statusQuery.data.twoFactorEnabled ? (
              <>
                <p className="text-(length:--font-size-body) text-(--color-text-secondary)">
                  {MESSAGES.accountSecurity.twoFactor.statusOffDescription}
                </p>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    setWizardOpen(true)
                  }}
                >
                  {MESSAGES.accountSecurity.twoFactor.enableButton}
                </Button>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    manageController.openDialog('disable')
                  }}
                >
                  {MESSAGES.accountSecurity.twoFactor.disableButton}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    manageController.openDialog('regenerate')
                  }}
                >
                  {MESSAGES.accountSecurity.twoFactor.regenerateBackupCodesButton}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>

      <TwoFactorManagePasswordDialog
        open={manageState.dialogKind === 'disable'}
        title={MESSAGES.accountSecurity.twoFactor.disableConfirmTitle}
        body={MESSAGES.accountSecurity.twoFactor.disableConfirmBody}
        confirmLabel={MESSAGES.accountSecurity.twoFactor.disableButton}
        confirmingLabel={MESSAGES.accountSecurity.twoFactor.disabling}
        confirmVariant="destructive"
        password={manageState.password}
        isMutating={manageState.isMutating}
        mutationError={manageState.mutationError}
        onOpenChange={(open) => {
          if (!open) {
            closeManageDialog()
          }
        }}
        onPasswordChange={(value) => {
          manageController.setPassword(value)
        }}
        onConfirm={() => {
          void manageController.confirmDisable()
        }}
      />

      <TwoFactorManagePasswordDialog
        open={manageState.dialogKind === 'regenerate'}
        title={MESSAGES.accountSecurity.twoFactor.regenerateConfirmTitle}
        body={MESSAGES.accountSecurity.twoFactor.regenerateConfirmBody}
        confirmLabel={MESSAGES.accountSecurity.twoFactor.regenerateBackupCodesButton}
        confirmingLabel={MESSAGES.accountSecurity.twoFactor.regenerating}
        password={manageState.password}
        isMutating={manageState.isMutating}
        mutationError={manageState.mutationError}
        onOpenChange={(open) => {
          if (!open) {
            closeManageDialog()
          }
        }}
        onPasswordChange={(value) => {
          manageController.setPassword(value)
        }}
        onConfirm={() => {
          void manageController.confirmRegenerate()
        }}
      />
    </Card>
  )
}

interface TwoFactorManagePasswordDialogProps {
  readonly open: boolean
  readonly title: string
  readonly body: string
  readonly confirmLabel: string
  readonly confirmingLabel: string
  readonly confirmVariant?: 'primary' | 'destructive'
  readonly password: string
  readonly isMutating: boolean
  readonly mutationError: string | null
  readonly onOpenChange: (open: boolean) => void
  readonly onPasswordChange: (value: string) => void
  readonly onConfirm: () => void
}

/**
 * M-3 (`solid` bulgusu, ikincil) — "devre dışı bırak"/"yeniden kodlar
 * oluştur" diyalogları AYNI `ConfirmDialog` + şifre `Input`'u İKİ KOPYA
 * olarak taşıyordu (paylaşılan `password`/`isMutating`/`mutationError`).
 * Tek dosya-yerel sarmalayıcıda TEKİLLEŞTİRİLDİ.
 */
function TwoFactorManagePasswordDialog({
  open,
  title,
  body,
  confirmLabel,
  confirmingLabel,
  confirmVariant,
  password,
  isMutating,
  mutationError,
  onOpenChange,
  onPasswordChange,
  onConfirm,
}: TwoFactorManagePasswordDialogProps): JSX.Element {
  const passwordInputRef = useRef<HTMLInputElement>(null)

  // wcag FIX turu 4/M-W1 — sunucu hatası (401 yanlış şifre/diğer mutasyon
  // hatası) artık `Input`'un `error` prop'una gider (`ConfirmDialog`'un
  // ESKİ genel `role="alert"` kutusu KALDIRILDI, bkz. `ConfirmDialog.tsx`
  // dosya başı); odak da ALANA geri döner — `TwoFactorChallengeForm.tsx:
  // 90-99`'un AYNI deseni, burada react-hook-form YOK (kontrollü `Input`)
  // olduğu için `setFocus` yerine DOĞRUDAN ref üzerinden `focus()`.
  useEffect(() => {
    if (mutationError !== null) {
      passwordInputRef.current?.focus()
    }
  }, [mutationError])

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      confirmingLabel={confirmingLabel}
      cancelLabel={MESSAGES.common.cancel}
      isConfirming={isMutating}
      {...(confirmVariant !== undefined ? { confirmVariant } : {})}
      onConfirm={onConfirm}
    >
      <Input
        ref={passwordInputRef}
        label={MESSAGES.auth.twoFactor.setupPasswordLabel}
        type="password"
        autoComplete="current-password"
        value={password}
        {...(mutationError !== null ? { error: mutationError } : {})}
        onChange={(event) => {
          onPasswordChange(event.target.value)
        }}
      />
    </ConfirmDialog>
  )
}

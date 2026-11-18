// @arkesoft/superadmin — TwoFactorSetupWizard (ROADMAP v0.0.20, T-021/S8,
// `apps/admin/src/features/two-factor/TwoFactorSetupWizard.tsx`'in BİREBİR
// aynısı — cross-app import yasak olduğu için yerel kopya; T-016'nın
// kurulum mekanizması burada DEĞİŞTİRİLMEDEN devralındı,
// docs/ux/T-021-super-admin-iskeleti.md Ekran 3 notu).
//
// İNCE React sarmalayıcı — TÜM karar mantığı `TwoFactorSetupController`'da.
// Bu bileşen yalnızca RENDER eder + controller'ı `useState`'in LAZY
// başlangıç değeri ile React'in render döngüsüne bağlar.
//
// Sihirbaz `routes/iki-adimli-dogrulama.tsx`'in İÇİNDE adım değişimi (Dialog
// DEĞİL, kabuksuz tam sayfa — Radix GEREKMEZ).
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type JSX } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button, Input } from '@arkesoft/ui'

import { enableTwoFactor, getTotpUri, verifyTotp } from '../../api/two-factor-rest.js'
import { invalidatePlatformSession } from '../../api/platform-session-query.js'
import { BackupCodesList } from '../../components/BackupCodesList.js'
import { MESSAGES, resolvePanelErrorMessage } from '../../messages/messages.js'
import { resolveFieldErrorMessage } from './field-error-message.js'
import {
  TwoFactorSetupController,
  type TwoFactorSetupState,
} from './two-factor-setup-controller.js'

export interface TwoFactorSetupWizardProps {
  readonly onCancel: () => void
  readonly onCompleted: () => void
}

const passwordFormSchema = z.object({ password: z.string().min(1) })
type PasswordFormValues = z.infer<typeof passwordFormSchema>

const codeFormSchema = z.object({
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/),
})
type CodeFormValues = z.infer<typeof codeFormSchema>

export function TwoFactorSetupWizard({
  onCancel,
  onCompleted,
}: TwoFactorSetupWizardProps): JSX.Element {
  const queryClient = useQueryClient()
  const [state, setState] = useState<TwoFactorSetupState>({
    step: 'password',
    isSubmitting: false,
    errorMessage: null,
  })
  const [savedCheckbox, setSavedCheckbox] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const [controller] = useState(
    () =>
      new TwoFactorSetupController(
        {
          enable: enableTwoFactor,
          getTotpUri,
          verifyTotp,
          onVerified: () => {
            // `platform.session` TEK doğruluk kaynağı — TAZELENİR, aksi
            // hâlde duvar eski değeri gösterir.
            invalidatePlatformSession(queryClient)
          },
        },
        resolvePanelErrorMessage,
        setState,
      ),
  )

  useEffect(() => {
    headingRef.current?.focus()
  }, [state.step])

  useEffect(() => {
    if (state.step === 'completed') {
      onCompleted()
    }
  }, [state.step, onCompleted])

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { password: '' },
  })

  const codeForm = useForm<CodeFormValues>({
    resolver: zodResolver(codeFormSchema),
    defaultValues: { code: '' },
  })

  if (state.step === 'password') {
    const onSubmit = passwordForm.handleSubmit(async (values) => {
      await controller.submitPassword(values.password)
      const latestState = controller.getState()
      if (latestState.step === 'password' && latestState.errorMessage !== null) {
        passwordForm.setFocus('password')
      }
    })
    const passwordErrorMessage = resolveFieldErrorMessage(
      state.errorMessage,
      passwordForm.formState.errors.password !== undefined
        ? MESSAGES.auth.twoFactor.setupPasswordRequired
        : undefined,
    )

    return (
      <form
        onSubmit={(event) => {
          void onSubmit(event)
        }}
        noValidate
        className="flex flex-col gap-4"
      >
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
        >
          {MESSAGES.platform.twoFactorWall.title}
        </h2>
        <Input
          label={MESSAGES.auth.twoFactor.setupPasswordLabel}
          type="password"
          autoComplete="current-password"
          readOnly={state.isSubmitting}
          {...(passwordErrorMessage !== undefined ? { error: passwordErrorMessage } : {})}
          {...passwordForm.register('password')}
        />
        <p className="text-(length:--font-size-small) text-(--color-text-secondary)">
          {MESSAGES.auth.twoFactor.setupPasswordHelp}
        </p>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" isLoading={state.isSubmitting}>
            {state.isSubmitting
              ? MESSAGES.auth.twoFactor.setupContinuing
              : MESSAGES.auth.twoFactor.setupContinue}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={state.isSubmitting}
          >
            {MESSAGES.common.cancel}
          </Button>
        </div>
      </form>
    )
  }

  if (state.step === 'totp') {
    const manualKey = extractManualKeyFromTotpUri(state.totpURI)
    const onSubmit = codeForm.handleSubmit(async (values) => {
      await controller.submitCode(values.code)
      const latestState = controller.getState()
      if (latestState.step === 'totp' && latestState.errorMessage !== null) {
        codeForm.setFocus('code')
      }
    })
    const codeErrorMessage = resolveFieldErrorMessage(
      state.errorMessage,
      codeForm.formState.errors.code !== undefined
        ? MESSAGES.auth.twoFactor.codeRequired
        : undefined,
    )

    return (
      <form
        onSubmit={(event) => {
          void onSubmit(event)
        }}
        noValidate
        className="flex flex-col gap-4"
      >
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
        >
          {MESSAGES.platform.twoFactorWall.title}
        </h2>
        <div className="flex flex-col gap-1">
          <p className="text-(length:--font-size-small) font-(--font-weight-semibold) text-(--color-text-primary)">
            {MESSAGES.auth.twoFactor.manualKeyLabel}
          </p>
          <code className="break-all rounded-(--radius-control) bg-(--color-surface-muted) p-3 font-mono text-(length:--font-size-body)">
            {manualKey}
          </code>
          <p className="text-(length:--font-size-small) text-(--color-text-secondary)">
            {MESSAGES.auth.twoFactor.manualKeyInstructions}
          </p>
          {state.backupCodes === null ? (
            <p className="text-(length:--font-size-small) text-(--color-text-secondary)">
              {MESSAGES.auth.twoFactor.setupResumedNotice}
            </p>
          ) : null}
        </div>
        <details>
          <summary className="cursor-pointer text-(length:--font-size-small) text-(--color-brand-500)">
            {MESSAGES.auth.twoFactor.showUriToggle}
          </summary>
          <p className="mt-2 break-all font-mono text-(length:--font-size-small) text-(--color-text-secondary)">
            {state.totpURI}
          </p>
        </details>
        <Input
          label={MESSAGES.auth.twoFactor.codeInputLabel}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="one-time-code"
          readOnly={state.isSubmitting}
          {...(codeErrorMessage !== undefined ? { error: codeErrorMessage } : {})}
          {...codeForm.register('code')}
        />
        <div className="flex gap-2">
          <Button type="submit" variant="primary" isLoading={state.isSubmitting}>
            {state.isSubmitting
              ? MESSAGES.auth.twoFactor.verifying
              : MESSAGES.auth.twoFactor.verifyButton}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              controller.goBackToPasswordStep()
            }}
            disabled={state.isSubmitting}
          >
            {MESSAGES.common.cancel}
          </Button>
        </div>
      </form>
    )
  }

  if (state.step === 'backup-codes') {
    return (
      <div className="flex flex-col gap-4">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
        >
          {MESSAGES.platform.twoFactorWall.title}
        </h2>
        <BackupCodesList
          title={MESSAGES.auth.twoFactor.backupCodesTitle}
          codes={state.backupCodes}
          copyAllLabel={MESSAGES.auth.twoFactor.backupCodesCopyAll}
          copiedLabel={MESSAGES.auth.twoFactor.copiedStatus}
          copyFailedLabel={MESSAGES.auth.twoFactor.copyFailedStatus}
          downloadLabel={MESSAGES.auth.twoFactor.backupCodesDownload}
          downloadFileName={MESSAGES.auth.twoFactor.backupCodesFileName}
          savedCheckboxLabel={MESSAGES.auth.twoFactor.backupCodesSavedCheckbox}
          saved={savedCheckbox}
          onSavedChange={setSavedCheckbox}
        />
        <Button type="button" variant="primary" disabled={!savedCheckbox} onClick={onCompleted}>
          {MESSAGES.auth.twoFactor.setupDoneButton}
        </Button>
      </div>
    )
  }

  // state.step === 'completed' — yukarıdaki `useEffect` `onCompleted`'ı
  // ÇAĞIRDI, bu dal anlık bir boşluk.
  return <></>
}

/**
 * `otpauth://totp/...?secret=XXXX&...`'ten `secret` sorgu parametresini
 * çıkarıp 4'lü gruplar hâlinde okunabilir yapar. Ayrıştırılamazsa HAM URI'yi
 * döner (uydurma YOK).
 */
function extractManualKeyFromTotpUri(totpURI: string): string {
  try {
    const url = new URL(totpURI.replace('otpauth://', 'https://'))
    const secret = url.searchParams.get('secret')
    if (secret === null) {
      return totpURI
    }
    return secret.match(/.{1,4}/g)?.join(' ') ?? secret
  } catch {
    return totpURI
  }
}

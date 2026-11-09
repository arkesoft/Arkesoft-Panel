// @arkesoft/admin — TwoFactorChallengeForm (ROADMAP v0.0.15, T-016/S10,
// docs/ui/T-016-iki-faktorlu-dogrulama.md P5/P6)
//
// Giriş sırasında kod doğrulama (TOTP) VE yedek kod ile giriş — AYNI kabuk,
// tek fark alan/mesajlar (ui planının P6 notu: "P5 ile aynı kabuk"). Veri
// çeken KONTEYNER — `verifyTotp`/`verifyBackupCode` çağırır.
//
// Üç TERMİNAL hata (5-deneme challenge aşımı / 429 hesap kilidi / 600sn
// istemci sayacı) `onChallengeEnded` ile ÜST bileşene (sign-in.tsx)
// bildirilir — o `ErrorState` (headingLevel="h2") render eder (ui planı).
import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type JSX } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from '@tanstack/react-router'
import { z } from 'zod'

import { Button, Input } from '@arkesoft/ui'

import { verifyBackupCode, verifyTotp } from '../../api/two-factor-rest.js'
import { ChallengeCountdown } from '../../components/ChallengeCountdown.js'
import type { PanelError } from '../../errors/panel-error.js'
import {
  formatAccountTemporarilyLockedMessage,
  MESSAGES,
  resolvePanelErrorMessage,
} from '../../messages/messages.js'

export type TwoFactorChallengeMode = 'totp' | 'backup-code'

export interface TwoFactorChallengeFormProps {
  readonly mode: TwoFactorChallengeMode
  readonly onVerified: () => void
  readonly onSwitchMode: () => void
  readonly onChallengeEnded: (message: string) => void
}

const CHALLENGE_TOTAL_SECONDS = 600

const totpCodeSchema = z.object({
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/),
})
const backupCodeSchema = z.object({ code: z.string().min(1) })

/** Üç terminal hata kodu — challenge'ın KENDİSİ geçersiz kaldı (`ErrorState`'e gider). */
const TERMINAL_CODES = new Set([
  'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE',
  'ACCOUNT_TEMPORARILY_LOCKED',
  'INVALID_TWO_FACTOR_COOKIE',
])

function resolveTerminalMessage(
  error: PanelError,
  retryAfterSeconds: number | null,
): string | null {
  if (error.kind !== 'known' || !TERMINAL_CODES.has(error.code)) {
    return null
  }
  if (error.code === 'ACCOUNT_TEMPORARILY_LOCKED' && retryAfterSeconds !== null) {
    return formatAccountTemporarilyLockedMessage(retryAfterSeconds)
  }
  return resolvePanelErrorMessage(error)
}

export function TwoFactorChallengeForm({
  mode,
  onVerified,
  onSwitchMode,
  onChallengeEnded,
}: TwoFactorChallengeFormProps): JSX.Element {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldErrorMessage, setFieldErrorMessage] = useState<string | null>(null)

  const form = useForm<{ code: string }>({
    resolver: zodResolver(mode === 'totp' ? totpCodeSchema : backupCodeSchema),
    defaultValues: { code: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setIsSubmitting(true)
    setFieldErrorMessage(null)

    const result =
      mode === 'totp' ? await verifyTotp(values.code) : await verifyBackupCode(values.code)

    setIsSubmitting(false)

    if (result.kind === 'error') {
      const terminalMessage = resolveTerminalMessage(result.error, result.retryAfterSeconds)
      if (terminalMessage !== null) {
        onChallengeEnded(terminalMessage)
        return
      }
      setFieldErrorMessage(resolvePanelErrorMessage(result.error))
      form.resetField('code')
      form.setFocus('code')
      return
    }

    onVerified()
  })

  const codeLabel =
    mode === 'totp'
      ? MESSAGES.auth.twoFactor.codeInputLabel
      : MESSAGES.auth.twoFactor.backupCodeInputLabel
  const shapeErrorMessage =
    form.formState.errors.code !== undefined
      ? mode === 'totp'
        ? MESSAGES.auth.twoFactor.codeRequired
        : MESSAGES.auth.twoFactor.backupCodeRequired
      : undefined
  const codeErrorMessage: string | undefined = fieldErrorMessage ?? shapeErrorMessage

  return (
    <form
      onSubmit={(event) => {
        void onSubmit(event)
      }}
      noValidate
      className="flex flex-col gap-4"
    >
      <Input
        label={codeLabel}
        inputMode={mode === 'totp' ? 'numeric' : 'text'}
        {...(mode === 'totp' ? { pattern: '[0-9]*', maxLength: 6 } : {})}
        autoComplete="one-time-code"
        readOnly={isSubmitting}
        {...(codeErrorMessage !== undefined ? { error: codeErrorMessage } : {})}
        {...form.register('code')}
      />

      <ChallengeCountdown
        totalSeconds={CHALLENGE_TOTAL_SECONDS}
        onExpire={() => {
          onChallengeEnded(MESSAGES.auth.twoFactor.challengeExpiredMessage)
        }}
        label={MESSAGES.auth.twoFactor.challengeTimeRemaining}
        oneMinuteRemainingAnnouncement={MESSAGES.auth.twoFactor.challengeOneMinuteRemaining}
        expiredAnnouncement={MESSAGES.auth.twoFactor.challengeExpiredAnnouncement}
      />

      <Button type="submit" variant="primary" isLoading={isSubmitting}>
        {isSubmitting ? MESSAGES.auth.twoFactor.verifying : MESSAGES.auth.twoFactor.verifyButton}
      </Button>

      <Link
        to="/sign-in"
        onClick={(event) => {
          event.preventDefault()
          onSwitchMode()
        }}
        className="text-(length:--font-size-small) text-(--color-brand-500)"
      >
        {mode === 'totp'
          ? MESSAGES.auth.twoFactor.useBackupCodeLink
          : MESSAGES.auth.twoFactor.useAuthenticatorLink}
      </Link>
    </form>
  )
}

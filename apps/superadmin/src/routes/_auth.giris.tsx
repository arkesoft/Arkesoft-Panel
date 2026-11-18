// @arkesoft/superadmin — `/giris` rotası (ROADMAP v0.0.20, T-021/S8,
// docs/ux/T-021-super-admin-iskeleti.md Ekran 1-2, docs/ui/T-021 Ekran 1-2
// bileşen eşlemesi — `apps/admin`'in `_auth.sign-in.tsx` deseninin birebir
// taşınması)
//
// KORUMA YOK (herkese açık). react-hook-form + Zod resolver — şema yalnızca
// ŞEKİL/biçim doğrular; GERÇEK kimlik doğrulaması HER ZAMAN sunucuda
// (Better Auth) — istemci doğrulaması sunucu doğrulamasının YERİNE geçmez
// (CLAUDE.md §4).
//
// Giriş BAŞARILI olduğunda `/`'e yönlendirilir — platform yetkisi/2FA
// durumunun kararı ORADAKİ guard'ın (`_app.tsx`) işidir, bu rota o kararı
// TEKRARLAMAZ.
import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type JSX } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button, Card, CardContent, Input } from '@arkesoft/ui'

import { signInWithEmail } from '../api/auth-rest.js'
import { ErrorState } from '../components/ErrorState.js'
import { resolveShapeErrorMessage } from '../errors/resolve-shape-error-message.js'
import {
  TwoFactorChallengeForm,
  type TwoFactorChallengeMode,
} from '../features/two-factor/TwoFactorChallengeForm.js'
import { computeSignInFocusKey } from '../features/two-factor/sign-in-focus.js'
import { formatSupportCodeLine, MESSAGES, resolvePanelErrorMessage } from '../messages/messages.js'

const signInFormSchema = z.object({
  email: z.string().min(1).pipe(z.email()),
  password: z.string().min(1),
})

type SignInFormValues = z.infer<typeof signInFormSchema>

export const Route = createFileRoute('/_auth/giris')({
  component: SignInPage,
})

/** `/giris`'in state makinesi: `credentials` → `twoFactorMethod` → `challengeEnded` — AYNI rota üzerinde state değişimi. */
type SignInStep =
  | { readonly kind: 'credentials' }
  | { readonly kind: 'twoFactorMethod'; readonly mode: TwoFactorChallengeMode }
  | { readonly kind: 'challengeEnded'; readonly message: string }

function SignInPage(): JSX.Element {
  const navigate = useNavigate()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [step, setStep] = useState<SignInStep>({ kind: 'credentials' })
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null)
  const [supportCodeLine, setSupportCodeLine] = useState<string | null>(null)

  useEffect(() => {
    document.title = MESSAGES.meta.signInTitle
  }, [])

  const focusKey = computeSignInFocusKey(step)

  useEffect(() => {
    headingRef.current?.focus()
  }, [focusKey])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInFormSchema),
    defaultValues: { email: '', password: '' },
  })

  const emailErrorMessage = resolveShapeErrorMessage(errors.email?.type, {
    required: MESSAGES.auth.signIn.emailRequired,
    invalidFormat: MESSAGES.auth.signIn.emailInvalid,
    genericError: MESSAGES.auth.signIn.fieldGenericError,
  })
  const passwordErrorMessage = resolveShapeErrorMessage(errors.password?.type, {
    required: MESSAGES.auth.signIn.passwordRequired,
    genericError: MESSAGES.auth.signIn.fieldGenericError,
  })

  function handleTwoFactorVerified(): void {
    void navigate({ to: '/' })
  }

  function handleBackToSignIn(): void {
    setStep({ kind: 'credentials' })
    reset({ email: '', password: '' })
    setSubmitErrorMessage(null)
    setSupportCodeLine(null)
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitErrorMessage(null)
    setSupportCodeLine(null)

    try {
      const result = await signInWithEmail(values)

      if (result.kind === 'two-factor-required') {
        setStep({ kind: 'twoFactorMethod', mode: 'totp' })
        return
      }

      if (result.kind === 'signed-in') {
        await navigate({ to: '/' })
        return
      }

      setSubmitErrorMessage(resolvePanelErrorMessage(result.error))
      setSupportCodeLine(
        formatSupportCodeLine(result.error.kind === 'known' ? result.error.requestId : null),
      )
    } catch {
      setSubmitErrorMessage(MESSAGES.errors.network)
    }
  })

  const headingText =
    step.kind === 'credentials'
      ? MESSAGES.auth.signIn.title
      : step.kind === 'twoFactorMethod'
        ? step.mode === 'totp'
          ? MESSAGES.auth.twoFactor.challengeTitle
          : MESSAGES.auth.twoFactor.backupCodeChallengeTitle
        : MESSAGES.auth.twoFactor.challengeTitle

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 md:p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
        >
          {headingText}
        </h1>

        {step.kind === 'challengeEnded' ? (
          <ErrorState
            headingLevel="h2"
            title={MESSAGES.errors.genericTitle}
            message={step.message}
            supportCodeLine={null}
            retryLabel={MESSAGES.auth.twoFactor.backToSignIn}
            onRetry={handleBackToSignIn}
          />
        ) : (
          <Card>
            <CardContent>
              {step.kind === 'credentials' ? (
                <form
                  onSubmit={(event) => {
                    void onSubmit(event)
                  }}
                  noValidate
                  className="flex flex-col gap-4"
                >
                  {submitErrorMessage !== null ? (
                    <div
                      role="alert"
                      className="flex flex-col gap-1 rounded-(--radius-control) bg-(--color-danger-surface) p-3 text-(length:--font-size-small) text-(--color-danger-600)"
                    >
                      <p>{submitErrorMessage}</p>
                      {supportCodeLine !== null ? <p>{supportCodeLine}</p> : null}
                    </div>
                  ) : null}

                  <Input
                    label={MESSAGES.auth.signIn.emailLabel}
                    type="email"
                    autoComplete="email"
                    readOnly={isSubmitting}
                    {...(emailErrorMessage !== undefined ? { error: emailErrorMessage } : {})}
                    {...register('email')}
                  />

                  <Input
                    label={MESSAGES.auth.signIn.passwordLabel}
                    type="password"
                    autoComplete="current-password"
                    readOnly={isSubmitting}
                    {...(passwordErrorMessage !== undefined ? { error: passwordErrorMessage } : {})}
                    {...register('password')}
                  />

                  <Button type="submit" variant="primary" isLoading={isSubmitting}>
                    {isSubmitting ? MESSAGES.auth.signIn.submitting : MESSAGES.auth.signIn.submit}
                  </Button>
                </form>
              ) : (
                <TwoFactorChallengeForm
                  key={step.mode}
                  mode={step.mode}
                  onVerified={handleTwoFactorVerified}
                  onSwitchMode={() => {
                    setStep({
                      kind: 'twoFactorMethod',
                      mode: step.mode === 'totp' ? 'backup-code' : 'totp',
                    })
                  }}
                  onChallengeEnded={(message) => {
                    setStep({ kind: 'challengeEnded', message })
                  }}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}

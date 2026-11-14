// @arkesoft/admin — `/kayit` rotası (ROADMAP v0.1.0, T-019/S10,
// docs/ux/T-019-kayit-ve-kiraci-olusturma.md Ekran 1-2, docs/ui/T-019 P1/P2)
//
// KORUMA YOK (herkese açık, `_auth.sign-in.tsx`'in BİREBİR kardeşi — kimliksiz
// ikinci ilk ekran, bkz. `bundle-budget.config.ts`). İki durum
// (`'form'`/`'emailPending'`) `SignUpController`'da (`features/registration/
// sign-up-controller.ts`) — bu rota SADECE render eder + controller'ı
// `useState`'in LAZY başlangıcıyla bağlar (`TwoFactorSetupWizard.tsx`'in
// AYNI deseni).
//
// Şekil doğrulaması (zorunlu alan, e-posta biçimi, şifre eşleşmesi)
// react-hook-form + Zod — Zod'un KENDİ mesajı HİÇ okunmaz (sign-in.tsx'in
// AYNI disiplini); gerçek doğrulama HER ZAMAN sunucuda (CLAUDE.md §4).
//
// ⚠⚠ UI PLANINDAN SAPMA (ölçülmüş) — "Bu e-posta ile zaten bir hesap var"
// ayrı bildirimi render EDİLMİYOR: bkz. `sign-up-controller.ts` dosya başı
// yorumu (Better Auth'un enumeration-savunması bu ayrımı YAPISAL olarak
// sızdırmıyor).
import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type JSX } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button, Card, CardContent, cn, FOCUS_RING_CLASS_NAMES, Input } from '@arkesoft/ui'

import { resendVerificationEmail, signUpWithEmail } from '../api/registration-query.js'
import { MESSAGES, resolvePanelErrorMessage } from '../messages/messages.js'
import {
  INITIAL_SIGN_UP_STATE,
  SignUpController,
  type SignUpState,
} from '../features/registration/sign-up-controller.js'

const signUpFormSchema = z
  .object({
    email: z.string().min(1).pipe(z.email()),
    password: z.string().min(1),
    passwordConfirm: z.string().min(1),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    path: ['passwordConfirm'],
    // Zod'un KENDİ mesajı HİÇ okunmaz (dosya başı yorumu) — teknik yer tutucu.
    message: 'password_mismatch',
  })

type SignUpFormValues = z.infer<typeof signUpFormSchema>

function resolveEmailFieldErrorMessage(errorType: string | undefined): string | undefined {
  if (errorType === undefined) {
    return undefined
  }
  if (errorType === 'too_small') {
    return MESSAGES.auth.signUp.emailRequired
  }
  if (errorType === 'invalid_format') {
    return MESSAGES.auth.signUp.emailInvalid
  }
  return MESSAGES.auth.signUp.fieldGenericError
}

function resolvePasswordFieldErrorMessage(errorType: string | undefined): string | undefined {
  if (errorType === undefined) {
    return undefined
  }
  if (errorType === 'too_small') {
    return MESSAGES.auth.signUp.passwordRequired
  }
  return MESSAGES.auth.signUp.fieldGenericError
}

function resolvePasswordConfirmFieldErrorMessage(
  errorType: string | undefined,
): string | undefined {
  if (errorType === undefined) {
    return undefined
  }
  if (errorType === 'too_small') {
    return MESSAGES.auth.signUp.passwordConfirmRequired
  }
  if (errorType === 'custom') {
    return MESSAGES.auth.signUp.passwordMismatch
  }
  return MESSAGES.auth.signUp.fieldGenericError
}

export const Route = createFileRoute('/_auth/kayit')({
  component: SignUpPage,
})

function SignUpPage(): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [state, setState] = useState<SignUpState>(INITIAL_SIGN_UP_STATE)
  const [controller] = useState(
    () =>
      new SignUpController(
        { signUp: signUpWithEmail, resendVerificationEmail },
        resolvePanelErrorMessage,
        setState,
      ),
  )

  useEffect(() => {
    document.title = MESSAGES.meta.signUpTitle
  }, [])

  useEffect(() => {
    headingRef.current?.focus()
  }, [state.step])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: { email: '', password: '', passwordConfirm: '' },
  })

  const emailErrorMessage = resolveEmailFieldErrorMessage(errors.email?.type)
  const passwordErrorMessage = resolvePasswordFieldErrorMessage(errors.password?.type)
  const passwordConfirmErrorMessage = resolvePasswordConfirmFieldErrorMessage(
    errors.passwordConfirm?.type,
  )

  const onSubmit = handleSubmit(async (values) => {
    await controller.submitSignUp(values.email, values.password)
  })

  // Controller'ın `isSubmitting`'i (`submitSignUp`'ın SENKRON setState'i,
  // await'TEN ÖNCE) zaten TEK doğruluk kaynağı — react-hook-form'un KENDİ
  // `formState.isSubmitting`'i İLE birleştirmek (`||`) gereksiz ikinci bir
  // kaynak olurdu (`TwoFactorSetupWizard`'ın da KULLANMADIĞI desen).
  const isSubmitting = state.step === 'form' && state.isSubmitting

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 md:p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {state.step === 'form' ? (
          <Card>
            <CardContent>
              <form
                onSubmit={(event) => {
                  void onSubmit(event)
                }}
                noValidate
                className="flex flex-col gap-4"
              >
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
                >
                  {MESSAGES.auth.signUp.title}
                </h1>

                {state.errorMessage !== null ? (
                  <div
                    role="alert"
                    className="flex flex-col gap-1 rounded-(--radius-control) bg-(--color-danger-surface) p-3 text-(length:--font-size-small) text-(--color-danger-600)"
                  >
                    <p>{state.errorMessage}</p>
                  </div>
                ) : null}

                <Input
                  label={MESSAGES.auth.signUp.emailLabel}
                  type="email"
                  autoComplete="email"
                  readOnly={isSubmitting}
                  {...(emailErrorMessage !== undefined ? { error: emailErrorMessage } : {})}
                  {...register('email')}
                />

                <Input
                  label={MESSAGES.auth.signUp.passwordLabel}
                  type="password"
                  autoComplete="new-password"
                  readOnly={isSubmitting}
                  {...(passwordErrorMessage !== undefined ? { error: passwordErrorMessage } : {})}
                  {...register('password')}
                />

                <Input
                  label={MESSAGES.auth.signUp.passwordConfirmLabel}
                  type="password"
                  autoComplete="new-password"
                  readOnly={isSubmitting}
                  {...(passwordConfirmErrorMessage !== undefined
                    ? { error: passwordConfirmErrorMessage }
                    : {})}
                  {...register('passwordConfirm')}
                />

                <Button type="submit" variant="primary" isLoading={isSubmitting}>
                  {isSubmitting ? MESSAGES.auth.signUp.submitting : MESSAGES.auth.signUp.submit}
                </Button>

                <p className="text-(length:--font-size-small) text-(--color-text-secondary)">
                  {MESSAGES.auth.signUp.haveAccountPrompt}{' '}
                  <Link
                    to="/sign-in"
                    className={cn(
                      'font-(--font-weight-semibold) text-(--color-brand-500)',
                      FOCUS_RING_CLASS_NAMES,
                    )}
                  >
                    {MESSAGES.auth.signUp.goToSignIn}
                  </Link>
                </p>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <div className="flex flex-col gap-4">
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
                >
                  {MESSAGES.auth.signUp.emailPendingTitle}
                </h1>
                <p className="text-(length:--font-size-body) text-(--color-text-secondary)">
                  {MESSAGES.auth.signUp.emailPendingBody.replace('{eposta}', state.email)}
                </p>
                {/* "Giriş yap" bir NAVİGASYON — `Link` (WCAG link/buton ayrımı, docs/ui P2
                    notu), `Button` İÇİNE SARILMAZ (geçersiz iç içe etkileşimli öğe olurdu);
                    `Button`'ın `primary`/`md` görsel sınıflarının AYNISI elle uygulanır
                    (`packages/ui` polimorfik `as` prop'u SUNMUYOR). */}
                <Link
                  to="/sign-in"
                  className={cn(
                    'inline-flex h-11 w-full items-center justify-center gap-2 rounded-(--radius-control) bg-(--color-brand-500) px-4 font-(--font-weight-semibold) text-(length:--font-size-body) text-(--color-text-inverse) transition-colors',
                    FOCUS_RING_CLASS_NAMES,
                  )}
                >
                  {MESSAGES.auth.signUp.goToSignIn}
                </Link>
                <button
                  type="button"
                  disabled={state.isResending}
                  aria-busy={state.isResending ? true : undefined}
                  onClick={() => {
                    void controller.resendVerificationEmail()
                  }}
                  className={cn(
                    'text-left text-(length:--font-size-small) font-(--font-weight-semibold) text-(--color-brand-500) underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60',
                    FOCUS_RING_CLASS_NAMES,
                  )}
                >
                  {state.isResending
                    ? MESSAGES.auth.signUp.resendingEmail
                    : MESSAGES.auth.signUp.resendEmail}
                </button>
                {state.resendErrorMessage !== null ? (
                  <p
                    role="alert"
                    className="text-(length:--font-size-small) text-(--color-danger-600)"
                  >
                    {state.resendErrorMessage}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}

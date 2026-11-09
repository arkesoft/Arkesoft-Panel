// @arkesoft/admin — `/sign-in` rotası (ROADMAP v0.0.7, T-008/S5,
// docs/ux/T-008.md + docs/ui/T-008.md; ROADMAP v0.0.15, T-016/S10 — 2FA
// ikinci adımı EKLENDİ, docs/ux/T-016 Ekran 3, docs/ui/T-016 P5/P6)
//
// KORUMA YOK (herkese açık). react-hook-form + Zod resolver — şema yalnızca
// ŞEKİL/biçim doğrular (zorunlu alan, e-posta biçimi); GERÇEK kimlik
// doğrulaması HER ZAMAN sunucuda (Better Auth) — istemci doğrulaması
// sunucu doğrulamasının YERİNE geçmez (CLAUDE.md §4). Zod'un KENDİ hata
// mesajı HİÇ okunmaz/render edilmez — alan hatası metni `issue.code`'dan
// (`errors.email.type`/`errors.password.type`) `messages.ts`'in Türkçe
// metnine eşlenir; bu sayede Türkçe literal'ler yalnızca `messages.ts`'te
// kalır (AC8).
//
// ⚠⚠ AC11 madde 3 (BAĞLAYICI): 2FA açık bir hesapta `sign-in/email` **200**
// döner + `{twoFactorRedirect:true}` — `signInWithEmail` artık bu gövdeyi
// PARSE EDİYOR (`auth-rest.ts`), bu rota `result.kind === 'two-factor-
// required'` dalını render eder; **401 BEKLEYEN bir kontrol YOK**.
//
// wcag FIX turu 4/M-W2 (bağlayıcı, 2026-11-09): başlık-odak `useEffect`'i
// `computeSignInFocusKey` ile mod geçişini de yakalıyor — bkz. aşağıdaki
// kullanım yeri notu.
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type JSX } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button, Card, CardContent, Input } from '@arkesoft/ui'

import { signInWithEmail } from '../api/auth-rest.js'
import { invalidateSessionIdentity } from '../api/session-refresh.js'
import { ErrorState } from '../components/ErrorState.js'
import {
  TwoFactorChallengeForm,
  type TwoFactorChallengeMode,
} from '../features/two-factor/TwoFactorChallengeForm.js'
import { computeSignInFocusKey } from '../features/two-factor/sign-in-focus.js'
import { formatSupportCodeLine, MESSAGES, resolvePanelErrorMessage } from '../messages/messages.js'

/**
 * Şekil doğrulaması — zorunlu alan + e-posta biçimi. `.email()`'in KENDİ
 * mesaj metni KULLANILMAZ (yukarıdaki dosya başı yorumu); `resolveEmail
 * FieldErrorMessage`/`resolvePasswordFieldErrorMessage` yalnızca
 * `issue.code`'u (react-hook-form'un `error.type`'ı) okur.
 */
const signInFormSchema = z.object({
  // `.email()` zincir metodu eski (`@typescript-eslint/no-deprecated`) —
  // `.pipe(z.email())` resmî yerine geçen biçim; `issue.code` çıktısı
  // BİREBİR AYNI (ÖLÇÜLDÜ): boş → 'too_small', geçersiz biçim →
  // 'invalid_format'.
  email: z.string().min(1).pipe(z.email()),
  password: z.string().min(1),
})

type SignInFormValues = z.infer<typeof signInFormSchema>

// DÜZELTME TURU 1 (`solid` M5): `resolvePanelErrorDisplayMessage`'ın yerel
// kopyası silindi — `../messages/messages.js`'teki `resolvePanelErrorMessage`
// (`_app.tsx`'in de kullandığı AYNI tek doğruluk kaynağı) kullanılıyor.

// DÜZELTME TURU 1 (`solid` M5 ║ `wcag` M3 — bağlayıcı, WCAG 3.3.1/3.3.3):
// tanınmayan `issue.code` artık SESSİZCE `undefined` DÖNMÜYOR — her iki
// çözücü de FAIL-CLOSED: bilinmeyen kod jenerik ama GÖRÜNÜR bir alan
// hatasına düşer (`resolveErrorMessage`'ın desenin AYNISI). Böylece Zod'un
// şeması ileride genişlese bile `Input` HER ZAMAN `aria-invalid` + bir mesaj
// render eder; form sessizce gönderilmez, kullanıcı hiçbir şey görmeden
// kalmaz (CLAUDE.md §10/16 — hatayı `null`'a çevirip sessizce devam etmek
// yasak).
function resolveEmailFieldErrorMessage(errorType: string | undefined): string | undefined {
  if (errorType === undefined) {
    return undefined
  }
  if (errorType === 'too_small') {
    return MESSAGES.auth.signIn.emailRequired
  }
  if (errorType === 'invalid_format') {
    return MESSAGES.auth.signIn.emailInvalid
  }
  return MESSAGES.auth.signIn.fieldGenericError
}

function resolvePasswordFieldErrorMessage(errorType: string | undefined): string | undefined {
  if (errorType === undefined) {
    return undefined
  }
  if (errorType === 'too_small') {
    return MESSAGES.auth.signIn.passwordRequired
  }
  return MESSAGES.auth.signIn.fieldGenericError
}

export const Route = createFileRoute('/_auth/sign-in')({
  component: SignInPage,
})

/**
 * T-016/S10 — sayfanın state makinesi: `credentials` (mutlu yol v0.0.7) →
 * `twoFactorMethod` (`totp`/`backup-code`, ux Ekran 3/4) → `challengeEnded`
 * (üç TERMİNAL hata, ux "Hata durumları"). AYRI bir rota/sayfa YÜKLEMESİ
 * YOK — aynı `_auth/sign-in` üzerinde state değişimi (ui planının şartı).
 */
type SignInStep =
  | { readonly kind: 'credentials' }
  | { readonly kind: 'twoFactorMethod'; readonly mode: TwoFactorChallengeMode }
  | { readonly kind: 'challengeEnded'; readonly message: string }

function SignInPage(): JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [step, setStep] = useState<SignInStep>({ kind: 'credentials' })
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null)
  const [supportCodeLine, setSupportCodeLine] = useState<string | null>(null)

  useEffect(() => {
    document.title = MESSAGES.meta.signInTitle
  }, [])

  // wcag FIX turu 4/M-W2 (bağlayıcı, 2026-11-09): TOTP ↔ yedek kod mod
  // geçişi `step.kind`'ı DEĞİŞTİRMEZ (ikisi de 'twoFactorMethod') — SADECE
  // `step.mode` değişir, bu yüzden `[step.kind]` bağımlılığı mod geçişini
  // KAÇIRIYORDU (odak hiçbir yere taşınmıyordu, `TwoFactorChallengeForm`
  // `key={step.mode}` ile remount olsa da). `computeSignInFocusKey`
  // (`../features/two-factor/sign-in-focus.js`, SAF + test edilmiş) adımın
  // `mode`'unu da kimliğe katar — `headingRef+tabIndex={-1}+focus()`
  // desenini (docs/ux:432-433) TEK bir `useEffect`'te TUTAR, her geçiş
  // noktasına dağınık `focus()` çağrısı EKLEMEZ. Bağımlılık dizisi
  // `react-hooks/exhaustive-deps`'in "basit referans" beklentisiyle UYUMLU
  // olsun diye çağrı ayrı bir değişkene (`focusKey`) ÇIKARILDI.
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

  const emailErrorMessage = resolveEmailFieldErrorMessage(errors.email?.type)
  const passwordErrorMessage = resolvePasswordFieldErrorMessage(errors.password?.type)

  /**
   * 2FA doğrulaması BAŞARILI — AC11 madde 2: önbellek TAZELENİR, aksi hâlde
   * "kurulum/giriş başarılı ama çıkış yaptım" riski. DÜZELTME TURU 2 (M-4):
   * `session.me` (`twoFactorEnabled: boolean`, ZORUNLU) artık 2FA
   * durumunun TEK doğruluk kaynağı — sekme-başına ikinci bir yazma/depo YOK.
   */
  function handleTwoFactorVerified(): void {
    invalidateSessionIdentity(queryClient)
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
        // DÜZELTME TURU 2 (M-4): `result.twoFactorEnabled` ARTIK burada
        // TÜKETİLMİYOR — eski tek tüketicisi (sekme-başına `sessionStorage`
        // deposu) SİLİNDİ; `session.me` bu sayfadan çıkışta zaten TAZE
        // çekilecek (yeni `queryClient`, önceden önbelleklenmiş veri YOK).
        await navigate({ to: '/' })
        return
      }

      setSubmitErrorMessage(resolvePanelErrorMessage(result.error))
      setSupportCodeLine(
        formatSupportCodeLine(result.error.kind === 'known' ? result.error.requestId : null),
      )
    } catch {
      // `signInWithEmail`'in KENDİSİ fırlattı — bir YANIT hiç ALINAMADI
      // (gerçek ağ hatası), `normalizePanelError`'ın ayrıştıracağı bir
      // gövde YOK (UX'in "ağ hatası / istek hiç tamamlanamadı" satırı).
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

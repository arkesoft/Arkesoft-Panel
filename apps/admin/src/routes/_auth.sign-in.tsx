// @arkesoft/admin — `/sign-in` rotası (ROADMAP v0.0.7, T-008/S5,
// docs/ux/T-008.md + docs/ui/T-008.md)
//
// KORUMA YOK (herkese açık). react-hook-form + Zod resolver — şema yalnızca
// ŞEKİL/biçim doğrular (zorunlu alan, e-posta biçimi); GERÇEK kimlik
// doğrulaması HER ZAMAN sunucuda (Better Auth) — istemci doğrulaması
// sunucu doğrulamasının YERİNE geçmez (CLAUDE.md §4). Zod'un KENDİ hata
// mesajı HİÇ okunmaz/render edilmez — alan hatası metni `issue.code`'dan
// (`errors.email.type`/`errors.password.type`) `messages.ts`'in Türkçe
// metnine eşlenir; bu sayede Türkçe literal'ler yalnızca `messages.ts`'te
// kalır (AC8).
import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type JSX } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button, Card, CardContent, Input } from '@arkesoft/ui'

import { signInWithEmail } from '../api/auth-rest.js'
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

function SignInPage(): JSX.Element {
  const navigate = useNavigate()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null)
  const [supportCodeLine, setSupportCodeLine] = useState<string | null>(null)

  useEffect(() => {
    document.title = MESSAGES.meta.signInTitle
    headingRef.current?.focus()
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInFormSchema),
    defaultValues: { email: '', password: '' },
  })

  const emailErrorMessage = resolveEmailFieldErrorMessage(errors.email?.type)
  const passwordErrorMessage = resolvePasswordFieldErrorMessage(errors.password?.type)

  const onSubmit = handleSubmit(async (values) => {
    setSubmitErrorMessage(null)
    setSupportCodeLine(null)

    try {
      const result = await signInWithEmail(values)

      if (result.kind === 'signed-in') {
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 md:p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
        >
          {MESSAGES.auth.signIn.title}
        </h1>
        <Card>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

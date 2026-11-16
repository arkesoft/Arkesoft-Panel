// @arkesoft/superadmin — `/iki-adimli-dogrulama` rotası (ROADMAP v0.0.20,
// T-021/S8, docs/ux/T-021-super-admin-iskeleti.md Ekran 3, docs/ui/T-021
// Ekran 3 bileşen eşlemesi — "duvar kabuksuz": `_app.tsx`'in DIŞINDA, bu
// rota kendi (standalone) guard'ını taşır, `AppShell` HİÇ render EDİLMEZ.
//
// GUARD: `UNAUTHENTICATED` → `/giris`'e yönlendirir. Başarılı + zaten
// `twoFactorEnabled:true` → `/`'e yönlendirir (bu ekranda yapılacak bir şey
// yok). Diğer her hata (ağ/`PLATFORM_NETWORK_NOT_ALLOWED` dahil) →
// `errorComponent`; UX'in şartı: bu durumda duvar GÖSTERİLMEZ (fail-closed
// "bilmiyorum", "2FA kurman gerekiyor" DEMEK DEĞİLDİR).
import { useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  isRedirect,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useState, type JSX } from 'react'

import { platformSessionQueryOptions } from '../api/platform-session-query.js'
import { ErrorState } from '../components/ErrorState.js'
import { LoadingState } from '../components/LoadingState.js'
import { NetworkBlockedWall } from '../components/NetworkBlockedWall.js'
import { TwoFactorSetupWall } from '../components/TwoFactorSetupWall.js'
import { UnauthorizedWall } from '../components/UnauthorizedWall.js'
import { normalizePanelError } from '../errors/normalize-panel-error.js'
import { resolvePlatformSessionGateOutcome } from '../features/platform-session/platform-session-gate.js'
import { TwoFactorSetupWizard } from '../features/two-factor/TwoFactorSetupWizard.js'
import { formatSupportCodeLine, MESSAGES, resolvePanelErrorMessage } from '../messages/messages.js'

export const Route = createFileRoute('/iki-adimli-dogrulama')({
  beforeLoad: async ({ context }) => {
    try {
      const session = await context.queryClient.query({
        ...platformSessionQueryOptions,
        staleTime: 'static',
      })
      const outcome = resolvePlatformSessionGateOutcome({
        status: 'success',
        data: session,
        error: null,
      })
      if (outcome.kind === 'ready') {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw redirect({ to: '/' })
      }
    } catch (caughtError: unknown) {
      // `redirect()` bir `Response` döner, `Error` DEĞİL — kendi attığımız
      // `redirect({ to: '/' })` bu `catch`'in İÇİNDE olduğu için önce buraya
      // düşer. `instanceof Error` kontrolünden ÖNCE yeniden fırlatılmazsa
      // jenerik hataya düşer (ROADMAP v0.0.20, T-021/S8-FIX — aynı desen
      // `_app.tsx`'te).
      if (isRedirect(caughtError)) {
        throw caughtError
      }
      const panelError = normalizePanelError(caughtError)
      if (panelError.kind === 'known' && panelError.code === 'UNAUTHENTICATED') {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw redirect({ to: '/giris' })
      }
      if (caughtError instanceof Error) {
        throw caughtError
      }
      throw new Error('Oturum doğrulama sırasında beklenmeyen bir hata oluştu.', {
        cause: caughtError,
      })
    }
  },
  pendingComponent: WallGuardPendingComponent,
  errorComponent: WallGuardErrorComponent,
  component: TwoFactorWallPage,
})

function WallGuardPendingComponent(): JSX.Element {
  return (
    <main>
      <LoadingState headingLevel="h1" title={MESSAGES.loading.sessionChecking} />
    </main>
  )
}

function WallGuardErrorComponent({ error }: { readonly error: unknown }): JSX.Element {
  const router = useRouter()
  const panelError = normalizePanelError(error)
  const outcome = resolvePlatformSessionGateOutcome({
    status: 'error',
    data: undefined,
    error: panelError,
  })

  if (outcome.kind === 'networkBlocked') {
    return (
      <NetworkBlockedWall
        title={MESSAGES.platform.networkBlocked.title}
        bodyPrefix={MESSAGES.platform.networkBlocked.bodyPrefix}
        envVarName={MESSAGES.platform.networkBlocked.envVarName}
        bodySuffix={MESSAGES.platform.networkBlocked.bodySuffix}
      />
    )
  }

  const supportCodeLine = formatSupportCodeLine(
    panelError.kind === 'known' ? panelError.requestId : null,
  )

  return (
    <main>
      <ErrorState
        headingLevel="h1"
        title={MESSAGES.errors.genericTitle}
        message={resolvePanelErrorMessage(panelError)}
        supportCodeLine={supportCodeLine}
        retryLabel={MESSAGES.errors.retryButton}
        onRetry={() => {
          void router.invalidate()
        }}
      />
    </main>
  )
}

function TwoFactorWallPage(): JSX.Element {
  const navigate = useNavigate()
  const sessionQuery = useQuery(platformSessionQueryOptions)
  const [wizardStarted, setWizardStarted] = useState(false)

  if (sessionQuery.data === undefined) {
    return (
      <main>
        <LoadingState headingLevel="h1" title={MESSAGES.loading.sessionChecking} />
      </main>
    )
  }

  const outcome = resolvePlatformSessionGateOutcome({
    status: sessionQuery.isError ? 'error' : 'success',
    data: sessionQuery.data,
    error: sessionQuery.isError ? normalizePanelError(sessionQuery.error) : null,
  })

  if (outcome.kind === 'unauthorized') {
    return (
      <UnauthorizedWall
        title={MESSAGES.platform.unauthorized.title}
        body={MESSAGES.platform.unauthorized.body}
      />
    )
  }

  if (wizardStarted) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 md:p-6">
        <div className="w-full max-w-sm">
          <TwoFactorSetupWizard
            onCancel={() => {
              setWizardStarted(false)
            }}
            onCompleted={() => {
              void navigate({ to: '/' })
            }}
          />
        </div>
      </main>
    )
  }

  return (
    <TwoFactorSetupWall
      title={MESSAGES.platform.twoFactorWall.title}
      body={MESSAGES.platform.twoFactorWall.body}
      startButtonLabel={MESSAGES.platform.twoFactorWall.startButton}
      onStart={() => {
        setWizardStarted(true)
      }}
    />
  )
}

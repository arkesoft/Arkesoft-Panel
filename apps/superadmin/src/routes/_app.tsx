// @arkesoft/superadmin — korumalı düzen rotası (ROADMAP v0.0.20, T-021/S8,
// docs/ux/T-021-super-admin-iskeleti.md Ekran 6, docs/ui/T-021 "Üç 403'ün
// görsel ayrımı")
//
// GUARD (`beforeLoad`): `context.queryClient.query({...platformSessionQueryOptions,
// staleTime:'static'})` çağırır — bileşen HİÇ render EDİLMEDEN koşar.
//   · `UNAUTHENTICATED` → `/giris`'e SESSİZCE yönlendirir (`apps/admin`'in
//     AYNI deseni).
//   · diğer hatalar (ağ/`PLATFORM_NETWORK_NOT_ALLOWED` dahil) → yukarı
//     gider, `errorComponent` (KABUKSUZ) render eder.
//   · başarılı + `isPlatformAdmin && !twoFactorEnabled` →
//     `/iki-adimli-dogrulama`'ya yönlendirir (tek karar kaynağı:
//     `resolvePlatformSessionGateOutcome`, `_app.tsx` VE
//     `iki-adimli-dogrulama.tsx` İKİSİ DE bunu çağırır).
//   · başarılı + `!isPlatformAdmin` → YÖNLENDİRMEZ (dedicated URL yok),
//     `component` bunu `UnauthorizedWall` ile KABUKSUZ render eder.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createFileRoute,
  isRedirect,
  Outlet,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useCallback, useState, type JSX } from 'react'

import { signOut } from '../api/auth-rest.js'
import { platformSessionQueryOptions } from '../api/platform-session-query.js'
import { AppShell } from '../components/AppShell.js'
import { ErrorState } from '../components/ErrorState.js'
import { LoadingState } from '../components/LoadingState.js'
import { NetworkBlockedWall } from '../components/NetworkBlockedWall.js'
import { UnauthorizedWall } from '../components/UnauthorizedWall.js'
import { normalizePanelError } from '../errors/normalize-panel-error.js'
import { resolvePlatformSessionGateOutcome } from '../features/platform-session/platform-session-gate.js'
import { formatSupportCodeLine, MESSAGES, resolvePanelErrorMessage } from '../messages/messages.js'

export const Route = createFileRoute('/_app')({
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
      if (outcome.kind === 'twoFactorSetupRequired') {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw redirect({ to: '/iki-adimli-dogrulama' })
      }
    } catch (caughtError: unknown) {
      // `redirect()` bir `Response` döner, `Error` DEĞİL — kendi attığımız
      // `redirect({ to: '/iki-adimli-dogrulama' })` bu `catch`'in İÇİNDE
      // olduğu için önce buraya düşer. `instanceof Error` kontrolünden ÖNCE
      // yeniden fırlatılmazsa jenerik hataya düşer (ROADMAP v0.0.20,
      // T-021/S8-FIX — e2e AC-4(a) bunu yakaladı).
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
  pendingComponent: AppGuardPendingComponent,
  errorComponent: AppGuardErrorComponent,
  component: AppLayoutComponent,
})

/** Kabuksuz — `AppShell` render EDİLMEZ (henüz kimlik/yetki verisi doğrulanmadı). */
function AppGuardPendingComponent(): JSX.Element {
  return (
    <main>
      <LoadingState headingLevel="h1" title={MESSAGES.loading.sessionChecking} />
    </main>
  )
}

/**
 * Kabuksuz — `redirect()`'in YUKARI geçtiği her gerçek hata (ağ/sunucu VEYA
 * `PLATFORM_NETWORK_NOT_ALLOWED`) buraya düşer. `networkBlocked` AYRI
 * (danger/`role=alert`) render edilir — diğer her hata "bilmiyorum" genel
 * `ErrorState`'tir (fail-closed: "2FA kurman gerekiyor" DEMEK DEĞİLDİR).
 */
function AppGuardErrorComponent({ error }: { readonly error: unknown }): JSX.Element {
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

/**
 * Guard BAŞARILI olduktan sonra render edilir. İki alt dal:
 *   · `!isPlatformAdmin` → `UnauthorizedWall` KABUKSUZ (navigasyon yok —
 *     hangi bağlantıların erişilebilir olduğu henüz anlamsız).
 *   · aksi hâlde (`isPlatformAdmin && twoFactorEnabled`, guard'ın garantisi)
 *     → `AppShell` + `<Outlet/>`.
 */
function AppLayoutComponent(): JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sessionQuery = useQuery(platformSessionQueryOptions)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutErrorMessage, setSignOutErrorMessage] = useState<string | null>(null)

  const handleSignOut = useCallback((): void => {
    setSignOutErrorMessage(null)
    setIsSigningOut(true)
    void (async () => {
      try {
        const result = await signOut()

        if (result.kind === 'signed-out') {
          queryClient.clear()
          await navigate({ to: '/giris' })
          return
        }

        setSignOutErrorMessage(MESSAGES.shell.signOutErrorMessage)
      } catch {
        setSignOutErrorMessage(MESSAGES.shell.signOutErrorMessage)
      } finally {
        setIsSigningOut(false)
      }
    })()
  }, [navigate, queryClient])

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

  const panelError = sessionQuery.isError ? normalizePanelError(sessionQuery.error) : null

  return (
    <AppShell
      skipToContentLabel={MESSAGES.shell.skipToContent}
      navLabel={MESSAGES.shell.navLabel}
      mobileNavToggleLabel={MESSAGES.shell.mobileNavToggleLabel}
      tenantsLabel={MESSAGES.shell.navTenants}
      auditLogLabel={MESSAGES.shell.navAuditLog}
      signOutLabel={MESSAGES.shell.signOutButton}
      signingOutLabel={MESSAGES.shell.signingOutButton}
      signOutErrorMessage={signOutErrorMessage}
      isSigningOut={isSigningOut}
      onSignOut={handleSignOut}
    >
      {panelError === null ? (
        <Outlet />
      ) : (
        <>
          <h1 className="sr-only">{MESSAGES.errors.genericTitle}</h1>
          <ErrorState
            headingLevel="h2"
            title={MESSAGES.errors.genericTitle}
            message={resolvePanelErrorMessage(panelError)}
            supportCodeLine={formatSupportCodeLine(
              panelError.kind === 'known' ? panelError.requestId : null,
            )}
            retryLabel={MESSAGES.errors.retryButton}
            onRetry={() => {
              void sessionQuery.refetch()
            }}
          />
        </>
      )}
    </AppShell>
  )
}

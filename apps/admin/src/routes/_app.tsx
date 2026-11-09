// @arkesoft/admin — korumalı düzen rotası (ROADMAP v0.0.7, T-008/S5,
// architect "Rota ağacı ve oturum durumu")
//
// GUARD (`beforeLoad`, bağlayıcı): `context.queryClient.query({
// ...sessionMeQueryOptions, staleTime: 'static' })` çağırır (DÜZELTME TURU 1
// `solid` L2/8e — bu yorum `ensureQueryData` ÇAĞIRDIĞINI söylüyordu, ama
// kod `ensureQueryData`'nın eski/`@typescript-eslint/no-deprecated` yerine
// geçen `query({...})` biçimini kullanıyor, bkz. aşağıdaki `beforeLoad`
// gövdesindeki not) — bileşen HİÇ render EDİLMEDEN koşar, 401
// (`UNAUTHENTICATED`) hiçbir veri ekrana GELMEDEN sessizce `/sign-in`'e
// yönlendirir (AC3 yapısal olarak BURADA sağlanıyor). Diğer hatalar
// (gerçek 500/ağ) yukarı gider → `errorComponent` (KABUKSUZ, `AppShell`
// render EDİLMEZ — Topbar'ın göstereceği kimlik verisi YOK, UX "kabuk
// gösterme" kararı).
//
// Oturum durumu: ayrı bir context YOK — TEK TanStack Query cache, TEK
// anahtar `['session','me']`. Guard `queryClient.query(...)`, bu dosyanın
// `component`'i `useQuery` → AYNI cache, İKİNCİ istek YOK.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useState, type JSX } from 'react'

import { signOut } from '../api/auth-rest.js'
import { sessionMeQueryOptions } from '../api/session-query.js'
import { AppShell } from '../components/AppShell.js'
import { ErrorState } from '../components/ErrorState.js'
import { LoadingState } from '../components/LoadingState.js'
import { normalizePanelError } from '../errors/normalize-panel-error.js'
import { formatSupportCodeLine, MESSAGES, resolvePanelErrorMessage } from '../messages/messages.js'

// DÜZELTME TURU 1 (`solid` M5): `resolvePanelErrorDisplayMessage`'ın yerel
// kopyası silindi — `../messages/messages.js`'teki `resolvePanelErrorMessage`
// (S4'ün API boşluğunu kapatan tek doğruluk kaynağı) kullanılıyor.

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    try {
      // `ensureQueryData` eski (`@typescript-eslint/no-deprecated`) —
      // `query({...options, staleTime: 'static'})` resmî yerine geçen API
      // (ÖLÇÜLDÜ, `@tanstack/query-core` tip tanımları): "cache'te varsa
      // onu kullan, yoksa çek ve cachele" davranışı BİREBİR aynı.
      await context.queryClient.query({ ...sessionMeQueryOptions, staleTime: 'static' })
    } catch (caughtError: unknown) {
      const panelError = normalizePanelError(caughtError)
      if (panelError.kind === 'known' && panelError.code === 'UNAUTHENTICATED') {
        // KAÇINILMAZ (CLAUDE.md §2): TanStack Router'ın `redirect()`'i
        // KASITLI olarak bir `Response` döner (`Error` DEĞİL) — router
        // çekirdeği `instanceof Response` ile yönlendirmeyi normal bir
        // hatadan AYIRT eder; bu çerçevenin KENDİ bağlayıcı API sözleşmesi
        // (ROADMAP v0.0.7, T-008/S5).
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw redirect({ to: '/sign-in' })
      }
      // `@typescript-eslint/only-throw-error`: yakalanan değer statik olarak
      // `unknown` — pratikte HER ZAMAN bir `Error` (tRPC/fetch reddi), ama
      // tip güvenliği için RUNTIME'DA daraltılır; pratikte HİÇ ulaşılmayan
      // "Error değil" dalı jenerik bir `Error`'a SARILIR (orijinali `cause`
      // olarak korunur, kaybolmaz).
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

/** Kabuksuz — `AppShell` render EDİLMEZ (henüz kimlik verisi doğrulanmadı). */
function AppGuardPendingComponent(): JSX.Element {
  return (
    <main>
      <LoadingState headingLevel="h1" title={MESSAGES.loading.sessionChecking} />
    </main>
  )
}

/** Kabuksuz — gerçek bir hata (500/ağ), `UNAUTHENTICATED` BURAYA hiç ulaşmaz (yukarıdaki redirect). */
function AppGuardErrorComponent({ error }: { readonly error: unknown }): JSX.Element {
  const router = useRouter()
  const panelError = normalizePanelError(error)
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
 * Guard BAŞARILI olduktan sonra render edilir — `AppShell` + `<Outlet/>`.
 * `useQuery(sessionMeQueryOptions)` guard'ın `queryClient.query(...)`
 * çağrısıyla AYNI cache'i okur (yeni istek YOK); yalnızca İLERİDE bir arka plan yeniden
 * doğrulaması başarısız olursa (`isError`) `AppShell` YERİNDE kalıp
 * `<main>` içeriği `ErrorState` (`headingLevel="h2"`) olur (UX "kabuk
 * gösterme" kararının tersi — burada kimlik ZATEN bir kez gösterildi).
 */
function AppLayoutComponent(): JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sessionQuery = useQuery(sessionMeQueryOptions)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutErrorMessage, setSignOutErrorMessage] = useState<string | null>(null)

  const handleSignOut = useCallback((): void => {
    setSignOutErrorMessage(null)
    setIsSigningOut(true)
    void (async () => {
      try {
        const result = await signOut()

        // `SignOutResult` iki üyeli — `result.kind === 'signed-out'` YANLIŞSA
        // TS bunu zaten `'error'` dalına DARALTIR (ikinci kontrol GEREKMEZ,
        // `@typescript-eslint/no-unnecessary-condition` bunu YAKALADI).
        // DÜZELTME TURU 1 (`solid` L6/8f — değerlendirildi, TAŞINMIYOR):
        // `SESSION_NOT_FOUND` eşlemesi burada, sunum katmanında kalıyor —
        // `normalizePanelError`'ın KENDİSİ dallanma mantığı taşımaz (saf
        // zarf-çözümleme, bkz. dosya başı yorumu), ADR-0010 madde 3.6
        // "dallanma yalnızca `code` üzerinde" kararının BURADAKİ tek tüketici
        // örneği. Paylaşılan bir yardımcıya (`errors/**`) taşımak TEK çağrı
        // yeri için erken bir soyutlama olurdu (kapsam genişlemesi) — ikinci
        // bir tüketici doğarsa (ör. başka bir "oturum zaten bitmiş" akışı)
        // o zaman ortak bir `isSessionAlreadyGone(code)` yardımcısına terfi
        // eder.
        const treatAsSignedOut =
          result.kind === 'signed-out' ||
          (result.error.kind === 'known' && result.error.code === 'SESSION_NOT_FOUND')

        if (treatAsSignedOut) {
          // Bağlayıcı sıra (architect): temizlik → navigasyon. `clear()`
          // SEÇİLDİ (`removeQueries(['session'])` DEĞİL) — yeni bir ekran
          // eklendiğinde unutulur, `clear()` fail-closed.
          queryClient.clear()
          await navigate({ to: '/sign-in' })
          return
        }

        setSignOutErrorMessage(MESSAGES.userMenu.signOutError)
      } catch {
        setSignOutErrorMessage(MESSAGES.userMenu.signOutError)
      } finally {
        setIsSigningOut(false)
      }
      // DÜZELTME TURU 1 (`security` low 8h — değerlendirildi, DEĞİŞTİRİLMEDİ):
      // kısmi çıkış başarısızlığı `security`'nin "savunulabilir" bulduğu
      // davranış — oturum gerçekten CANLI, yerel temizlik yapıp YİNE DE
      // `/sign-in`'e gitmek sahte bir "çıktım" yanılsaması üretirdi. Kalan
      // risk uyarının GÖRÜNÜRLÜĞÜydü: `UserMenu.tsx`'teki mesaj ZATEN
      // `role="alert"` taşıyor VE `onSelect`'teki `event.preventDefault()`
      // menüyü AÇIK tutuyor (dosya başı yorumu) — kullanıcı mesajı menü
      // açıkken GÖRÜR, odak tetikleyicide kalır, mesaj ASLA sessizce
      // kaybolmaz. Ek bir `aria-live` bölgesi/toast GEREKMİYOR.
    })()
  }, [navigate, queryClient])

  // Guard'ın `queryClient.query(...)` çağrısı BAŞARILI olmadan bu bileşen hiç render
  // edilmez, bu yüzden `useQuery` İLK render'da HER ZAMAN senkron `data`
  // döner (TanStack Query cache okuması senkrondur — "üretmeyebilir" YANLIŞ
  // bir gerekçeydi, `solid` tur 2 L-N2 düzeltmesi). Bu dalın GERÇEK erişilebilir
  // yolu `handleSignOut`'un `queryClient.clear()`'ı (aşağıda) SONRASI
  // yeniden render'dır: cache boşaltılır, `sessionQuery.data` bir an
  // `undefined` olur, navigasyon tamamlanana kadar bu savunma dalı o anı
  // KABUKSUZ karşılar.
  if (sessionQuery.data === undefined) {
    return (
      <main>
        <LoadingState headingLevel="h1" title={MESSAGES.loading.sessionChecking} />
      </main>
    )
  }

  const panelError = sessionQuery.isError ? normalizePanelError(sessionQuery.error) : null

  return (
    <AppShell
      skipToContentLabel={MESSAGES.appShell.skipToContent}
      navLabel={MESSAGES.sidebar.navLabel}
      panelLabel={MESSAGES.sidebar.panel}
      accountSecurityLabel={MESSAGES.sidebar.accountSecurity}
      userId={sessionQuery.data.userId}
      noStoreLabel={MESSAGES.topbar.noStoreSelected}
      userMenuTriggerLabel={MESSAGES.topbar.userMenu.trigger}
      signOutLabel={MESSAGES.userMenu.signOut}
      signingOutLabel={MESSAGES.userMenu.signingOut}
      signOutErrorMessage={signOutErrorMessage}
      isSigningOut={isSigningOut}
      onSignOut={handleSignOut}
    >
      {panelError === null ? (
        <Outlet />
      ) : (
        // DÜZELTME TURU 2 (`wcag` low, AC11 "tam bir h1" — bağlayıcı): bu
        // dal `<Outlet/>`'u TAMAMEN unmount eder (route'un KENDİ h1'i,
        // "Panel", onunla birlikte KAYBOLUR) — ÖLÇÜLDÜ, bu durumda sayfada
        // h1 sayısı SIFIRDI. `ErrorState`'in `headingLevel="h2"` kolu
        // (solid M8/L4'ün "simetrik sözleşme, GERÇEKTEN kullanılıyor"
        // dediği KULLANIM) KASITLI KORUNUYOR — DEĞİŞTİRİLMİYOR; aşağıdaki
        // `sr-only` `h1` onun YERİNE geçmiyor, yalnızca heading-navigasyon
        // yapan ekran okuyucu kullanıcılarının (NVDA/JAWS "H" tuşu) bu
        // geçici bildirim durumunda da bulacağı TEK h1'i sağlıyor. Metin
        // kasıtlı olarak `ErrorState`'in GÖRÜNÜR başlığıyla AYNI
        // (`MESSAGES.errors.genericTitle`) — ikinci bir katalog girdisi
        // GEREKMEDİ.
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

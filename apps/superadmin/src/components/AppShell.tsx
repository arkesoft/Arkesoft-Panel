// @arkesoft/superadmin — AppShell (ROADMAP v0.0.20, T-021/S8,
// docs/ui/T-021-super-admin-iskeleti.md "Ekran 6 — Kabuk")
//
// Sidebar + Topbar + `<main>`. Veri ÇEKMEZ — tüm değerler/callback'ler
// çağırandan (`routes/_app.tsx`) prop olarak gelir.
//
// Skip-link + `tabIndex={-1}` `<main>` deseni BİREBİR taşınır
// (`apps/admin/src/components/AppShell.tsx`'in WCAG 2.4.1 Bypass Blocks
// düzeltme turu 2 dersi tekrarlanmaz).
import type { JSX, ReactNode } from 'react'

import { cn, FOCUS_RING_CLASS_NAMES } from '@arkesoft/ui'

import { Sidebar } from './Sidebar.js'
import { Topbar } from './Topbar.js'

export interface AppShellProps {
  readonly skipToContentLabel: string
  readonly navLabel: string
  readonly mobileNavToggleLabel: string
  readonly tenantsLabel: string
  readonly auditLogLabel: string
  readonly signOutLabel: string
  readonly signingOutLabel: string
  readonly signOutErrorMessage: string | null
  readonly isSigningOut: boolean
  readonly onSignOut: () => void
  readonly children: ReactNode
}

export function AppShell({
  skipToContentLabel,
  navLabel,
  mobileNavToggleLabel,
  tenantsLabel,
  auditLogLabel,
  signOutLabel,
  signingOutLabel,
  signOutErrorMessage,
  isSigningOut,
  onSignOut,
  children,
}: AppShellProps): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className={cn(
          FOCUS_RING_CLASS_NAMES,
          'sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-(--radius-control) focus:bg-(--color-surface) focus:px-4 focus:py-2 focus:text-(length:--font-size-body) focus:text-(--color-text-primary)',
        )}
      >
        {skipToContentLabel}
      </a>
      <Topbar
        signOutLabel={signOutLabel}
        signingOutLabel={signingOutLabel}
        signOutErrorMessage={signOutErrorMessage}
        isSigningOut={isSigningOut}
        onSignOut={onSignOut}
      />
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar
          navLabel={navLabel}
          mobileNavToggleLabel={mobileNavToggleLabel}
          tenantsLabel={tenantsLabel}
          auditLogLabel={auditLogLabel}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(FOCUS_RING_CLASS_NAMES, 'flex-1 p-4 md:p-6 xl:px-8')}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

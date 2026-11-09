// @arkesoft/admin — AppShell (ROADMAP v0.0.7, T-008/S5, docs/ui/T-008.md
// responsive plan)
//
// Sidebar + Topbar + `<main>`. Veri ÇEKMEZ (CLAUDE.md §9/§3 sunum/veri
// ayrımı) — tüm değerler/callback'ler çağırandan (`routes/_app.tsx`) prop
// olarak gelir.
//
// Responsive DOM yapısı: mobilde Topbar'ın ALTINDA yatay `nav` şeridi
// (Sidebar kendi içinde `flex-row`/`md:flex-col` ile bunu yönetir); `md:`
// genişlikte flex satırı Sidebar'ı main'in SOLUNA alır — DOM SIRASI
// (Topbar → Sidebar → main) HER İKİ genişlikte de AYNI, yalnızca flex
// yönü/konum Sidebar'ın KENDİ sınıflarıyla değişir (docs/ui/T-008.md).
//
// DÜZELTME TURU 1 (`wcag` low 8c, WCAG 2.4.1): `<main>`'e atlama
// (skip) bağlantısı eklendi. Bugün etkisi düşük (Topbar → Sidebar → main
// yalnızca 2 Tab) ama v0.0.14'ün RBAC'lı, çok öğeli sidebar'ı öncesinde
// gerekli — o sürümde Tab sayısı artacak. Varsayılan `sr-only`, klavye
// odağı aldığında görünür olur (`focus:not-sr-only`); `FOCUS_RING_CLASS_
// NAMES` ile AYNI odak halkası (`@arkesoft/ui`'den İTHAL, literal kopya
// YOK — bkz. `Sidebar.tsx`/`UserMenu.tsx`'teki AYNI not).
//
// DÜZELTME TURU 2 (`wcag` medium, WCAG 2.4.1 Bypass Blocks — bağlayıcı):
// skip-link'in HEDEFİ (`<main>`) `tabIndex` TAŞIMIYORDU — tarayıcı bir
// fragment bağlantısını (`href="#id"`) etkinleştirdiğinde hedefi YALNIZCA
// odaklanabilirse (native focusable VEYA `tabindex` taşıyorsa) odaklar;
// aksi halde odak `<body>`'ye düşer VE bir sonraki Tab DOM'un başından
// (skip-link'in KENDİSİNDEN) yeniden başlar — "atlama" mekanizması FİİLEN
// HİÇBİR ŞEYİ atlamıyordu (ÖLÇÜLDÜ, canlı Playwright probu). `tabIndex={-1}`
// `<main>`'i PROGRAMATİK odağa AÇAR ama Tab SIRASINA EKLEMEZ (-1'in
// tanımı) — bu yüzden normal Tab turunda `<main>` kendisi bir durak
// OLMUYOR (ÖLÇÜLDÜ). Odak göstergesi tutarlılığı için AYNI
// `FOCUS_RING_CLASS_NAMES` (`focus-visible:` — mouse click'le odaklanırsa
// halka GÖRÜNMEZ, skip-link'in Enter'ıyla geleni ise GÖRÜNÜR, ÖLÇÜLDÜ) —
// çıplak `outline-none` YOK, her zaman `focus-visible:ring-*` eşlikçili.
import type { JSX, ReactNode } from 'react'

import { cn, FOCUS_RING_CLASS_NAMES } from '@arkesoft/ui'

import { Sidebar } from './Sidebar.js'
import { Topbar } from './Topbar.js'

export interface AppShellProps {
  readonly skipToContentLabel: string
  readonly navLabel: string
  readonly panelLabel: string
  readonly accountSecurityLabel: string
  readonly userId: string
  readonly noStoreLabel: string
  readonly userMenuTriggerLabel: string
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
  panelLabel,
  accountSecurityLabel,
  userId,
  noStoreLabel,
  userMenuTriggerLabel,
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
        userId={userId}
        noStoreLabel={noStoreLabel}
        userMenuTriggerLabel={userMenuTriggerLabel}
        signOutLabel={signOutLabel}
        signingOutLabel={signingOutLabel}
        signOutErrorMessage={signOutErrorMessage}
        isSigningOut={isSigningOut}
        onSignOut={onSignOut}
      />
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar
          navLabel={navLabel}
          panelLabel={panelLabel}
          accountSecurityLabel={accountSecurityLabel}
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

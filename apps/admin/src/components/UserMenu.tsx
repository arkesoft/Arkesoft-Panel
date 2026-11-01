// @arkesoft/admin — UserMenu (ROADMAP v0.0.7, T-008/S5, docs/ui/T-008.md
// bileşen eşlemesi)
//
// `@radix-ui/react-dropdown-menu` — `Escape` + odak dönüşü Radix'in
// VARSAYILAN davranışı (docs/ui/T-008.md erişilebilirlik notları): bu
// bileşen ELLE `focus()` ÇAĞIRMAZ, Radix'in varsayılanını EZMEZ. Dışarı
// tıklamada kapanma da Radix'in "dismissable layer" varsayılanı.
//
// "Çıkış yap" `Button` DEĞİL — `DropdownMenu.Item` kendi `role="menuitem"`
// ve klavye gezinme sözleşmesini taşır; `cn()` ile `Button`'ın GÖRSEL
// sınıflarını ödünç alır (docs/ui/T-008.md "Not"), `Button` bileşenini
// RENDER ETMEZ.
//
// Her seçimde `event.preventDefault()` çağrılır (Radix'in varsayılan
// "seçince kapat" davranışını BİLEREK devre dışı bırakır) — başarısız
// çıkışta menü AÇIK kalıp hata mesajını gösterebilsin (UX: "oturum
// temizlenmez — yarım çıkış yapılmaz"); başarılı çıkışta zaten tüm
// `AppShell` unmount olacağı için menünün açık/kapalı durumu önemsizdir.
import type { JSX } from 'react'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

// AC12 ODAK SINIFI (DÜZELTME TURU 1 — `solid` M1/M2 ║ `wcag` M2 kapandı):
// `FOCUS_RING_CLASS_NAMES` artık `@arkesoft/ui` barrel'ından İTHAL EDİLİYOR
// (`packages/ui/src/index.ts:24` export etti). Literal kopya SİLİNDİ —
// bkz. `Sidebar.tsx`'teki aynı not.
import { cn, FOCUS_RING_CLASS_NAMES } from '@arkesoft/ui'

export interface UserMenuProps {
  /** Erişilebilir ad — SABİT "Kullanıcı menüsü" (UX: dekoratif rozetten BAĞIMSIZ). */
  readonly triggerLabel: string
  /** `userId`'den türetilen dekoratif kısaltma — `aria-hidden` (UX). */
  readonly badgeInitials: string
  readonly signOutLabel: string
  readonly signingOutLabel: string
  readonly signOutErrorMessage: string | null
  readonly isSigningOut: boolean
  readonly onSignOut: () => void
}

export function UserMenu({
  triggerLabel,
  badgeInitials,
  signOutLabel,
  signingOutLabel,
  signOutErrorMessage,
  isSigningOut,
  onSignOut,
}: UserMenuProps): JSX.Element {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          className={cn(
            FOCUS_RING_CLASS_NAMES,
            'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-(--color-brand-500) text-(length:--font-size-small) font-(--font-weight-semibold) text-(--color-text-inverse)',
          )}
        >
          <span aria-hidden="true">{badgeInitials}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="flex min-w-48 flex-col gap-1 rounded-(--radius-card) border border-(--color-border-subtle) bg-(--color-surface) p-1 shadow-(--shadow-card)"
        >
          <DropdownMenu.Item
            disabled={isSigningOut}
            onSelect={(event) => {
              event.preventDefault()
              onSignOut()
            }}
            className={cn(
              FOCUS_RING_CLASS_NAMES,
              'inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-(--radius-control) px-4 text-(length:--font-size-body) font-(--font-weight-semibold) text-(--color-text-primary) data-disabled:cursor-not-allowed data-disabled:opacity-60 data-highlighted:bg-(--color-surface-muted)',
            )}
          >
            {isSigningOut ? signingOutLabel : signOutLabel}
          </DropdownMenu.Item>
          {signOutErrorMessage !== null ? (
            <p
              role="alert"
              className="px-4 py-1 text-(length:--font-size-small) text-(--color-danger-600)"
            >
              {signOutErrorMessage}
            </p>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

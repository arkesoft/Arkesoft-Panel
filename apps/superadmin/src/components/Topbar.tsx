// @arkesoft/superadmin — Topbar (ROADMAP v0.0.20, T-021/S8,
// docs/ui/T-021-super-admin-iskeleti.md "Ekran 6 — Kabuk", kimlik göstergesi
// bölümü)
//
// ⚠⚠ `platform.session` E-POSTA DÖNDÜRMEZ (yalnızca `{isPlatformAdmin,
// twoFactorEnabled}` — aktör e-postası tele ÇIKMAZ, architect kararı). Bu
// yüzden kimlik göstergesi METİNSİZ, sabit dekoratif bir rozettir
// (`aria-hidden`) — `apps/admin`'in `userId`'den türettiği kısaltma deseni
// burada UYGULANAMAZ (girdi yok).
//
// "Çıkış yap" `Button` DOĞRUDAN görünür (`variant="secondary"`) — Radix
// `DropdownMenu`'lü `UserMenu` BURAYA taşınmadı (S4 kararı): menünün
// içeriği tek bir eylem, dropdown gereksiz dolaylama + gereksiz bir Radix
// bağımlılığı eklerdi. Onay diyaloğu YOK (UX: anında çıkış).
import type { JSX } from 'react'

import { Button } from '@arkesoft/ui'

export interface TopbarProps {
  readonly signOutLabel: string
  readonly signingOutLabel: string
  readonly signOutErrorMessage: string | null
  readonly isSigningOut: boolean
  readonly onSignOut: () => void
}

export function Topbar({
  signOutLabel,
  signingOutLabel,
  signOutErrorMessage,
  isSigningOut,
  onSignOut,
}: TopbarProps): JSX.Element {
  return (
    <header className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-(--color-border-subtle) bg-(--color-surface) px-4 py-2">
      <span
        aria-hidden="true"
        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full bg-(--color-brand-500) text-(length:--font-size-small) font-(--font-weight-semibold) text-(--color-text-inverse)"
      >
        SA
      </span>
      <div className="flex items-center gap-3">
        {signOutErrorMessage !== null ? (
          <p role="alert" className="text-(length:--font-size-small) text-(--color-danger-600)">
            {signOutErrorMessage}
          </p>
        ) : null}
        <Button type="button" variant="secondary" isLoading={isSigningOut} onClick={onSignOut}>
          {isSigningOut ? signingOutLabel : signOutLabel}
        </Button>
      </div>
    </header>
  )
}

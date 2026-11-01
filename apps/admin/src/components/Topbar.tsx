// @arkesoft/admin — Topbar (ROADMAP v0.0.7, T-008/S5, docs/ux/T-008.md +
// docs/ui/T-008.md)
//
// `session.me` YALNIZCA `{userId, sessionId}` döndürüyor (e-posta/ad/mağaza
// adı YOK, R1) — rozet `userId`'den türetilen DEKORATİF bir kısaltma
// (`aria-hidden`), kiracı alanı yerine "Mağaza seçilmedi" (R1, v0.1.0'a
// ertelendi). Bu, AC4'ün "yanıttan türeyen bir değer ekranda" şartını
// sağlar.
//
// "Mağaza seçilmedi" 360px'te gerekirse 2. satıra sarar, KISALTILMAZ (UX).
import type { JSX } from 'react'

import { UserMenu } from './UserMenu.js'

/**
 * `userId`'den dekoratif bir kısaltma türetir — iş mantığı DEĞİL, salt
 * sunum biçimlendirmesi (ilk iki karakter, büyük harf).
 */
export function deriveUserBadgeInitials(userId: string): string {
  return userId.slice(0, 2).toUpperCase()
}

export interface TopbarProps {
  readonly userId: string
  readonly noStoreLabel: string
  readonly userMenuTriggerLabel: string
  readonly signOutLabel: string
  readonly signingOutLabel: string
  readonly signOutErrorMessage: string | null
  readonly isSigningOut: boolean
  readonly onSignOut: () => void
}

export function Topbar({
  userId,
  noStoreLabel,
  userMenuTriggerLabel,
  signOutLabel,
  signingOutLabel,
  signOutErrorMessage,
  isSigningOut,
  onSignOut,
}: TopbarProps): JSX.Element {
  return (
    <header className="flex min-h-14 w-full items-center justify-end gap-3 border-b border-(--color-border-subtle) bg-(--color-surface) px-4 py-2">
      <span
        aria-hidden="true"
        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full bg-(--color-surface-muted) text-(length:--font-size-small) font-(--font-weight-semibold) text-(--color-text-primary)"
      >
        {deriveUserBadgeInitials(userId)}
      </span>
      <span className="max-w-32 text-(length:--font-size-small) text-(--color-text-secondary)">
        {noStoreLabel}
      </span>
      <UserMenu
        triggerLabel={userMenuTriggerLabel}
        badgeInitials={deriveUserBadgeInitials(userId)}
        signOutLabel={signOutLabel}
        signingOutLabel={signingOutLabel}
        signOutErrorMessage={signOutErrorMessage}
        isSigningOut={isSigningOut}
        onSignOut={onSignOut}
      />
    </header>
  )
}

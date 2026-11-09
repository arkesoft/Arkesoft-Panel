// @arkesoft/admin — ConfirmDialog (ROADMAP v0.0.15, T-016/S10,
// docs/ui/T-016-iki-faktorlu-dogrulama.md P7/"Yeni bileşen önerileri")
//
// `@radix-ui/react-dialog` — Orkestratör onayı ④ (2026-11-06) ile eklendi.
// `packages/ui`'ye GİRMİYOR (T-008'in bağlayıcı kararı, `UserMenu.tsx`'in
// `@radix-ui/react-dropdown-menu` ile AYNI gerekçe: "kabuğa özgü kompozisyon,
// henüz paylaşılan ilkel değil").
//
// Erişilebilirlik (docs/ui erişilebilirlik notları): odak tuzağı/`Escape`/
// odağın tetikleyiciye dönmesi Radix'in VARSAYILANI — bu bileşen ELLE
// `focus()` ÇAĞIRMAZ, Radix'in varsayılanını EZMEZ (`UserMenu.tsx`'teki
// AYNI disiplin).
//
// wcag FIX turu 4/M-W1 (bağlayıcı, 2026-11-09, UI PLANINDAN SAPMA — bkz.
// handoff): bu bileşen ESKİDEN genel bir `errorMessage` prop'u alıp kendi
// içinde alandan KOPUK bir `<p role="alert">` render ediyordu (docs/ui/
// T-016-iki-faktorlu-dogrulama.md:154'ün AÇIKÇA tarif ettiği — "Sunucu
// hatası → genel role=alert metni" — tasarım). `errorMessage` prop'u
// KALDIRILDI: hata artık `children` İÇİNDEKİ `Input`'un `error` prop'una
// (çağıranın sorumluluğu, bkz. `TwoFactorStatusCard.tsx`) gider — docs/
// ui:213'ün genel "Field-level hata = Input'un error prop'u, başka bir şey
// DEĞİL" kuralıyla TUTARLI ama docs/ui:154'ün BU bileşen için yazdığı
// metinle ÇELİŞİYOR. `ConfirmDialog`'un TEK tüketicisi
// `TwoFactorStatusCard.tsx` olduğu için bu bileşenin kamusal sözleşmesini
// (iki tüketici de aynı dosyada) değiştirmek güvenli — docs/ui:154'ün
// metninin güncellenmesi `docs`/`release`'in işi.
import type { JSX, ReactNode } from 'react'

import * as Dialog from '@radix-ui/react-dialog'

import { Button, cn, FOCUS_RING_CLASS_NAMES } from '@arkesoft/ui'

export interface ConfirmDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly body: string
  readonly confirmLabel: string
  readonly confirmingLabel: string
  readonly cancelLabel: string
  readonly isConfirming: boolean
  readonly confirmVariant?: 'primary' | 'destructive'
  readonly onConfirm: () => void
  /** Ek form alanı (ör. devre dışı bırakma için şifre `Input`'u) — opsiyonel. */
  readonly children?: ReactNode
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  confirmingLabel,
  cancelLabel,
  isConfirming,
  confirmVariant = 'primary',
  onConfirm,
  children,
}: ConfirmDialogProps): JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-(--color-text-primary)/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-(--radius-card) bg-(--color-surface) p-6 shadow-(--shadow-card)">
          <Dialog.Title className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-(length:--font-size-body) text-(--color-text-secondary)">
            {body}
          </Dialog.Description>
          {children}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary" disabled={isConfirming}>
                {cancelLabel}
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              variant={confirmVariant}
              isLoading={isConfirming}
              onClick={onConfirm}
            >
              {isConfirming ? confirmingLabel : confirmLabel}
            </Button>
          </div>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label={cancelLabel}
              className={cn(
                FOCUS_RING_CLASS_NAMES,
                'absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-(--radius-control) text-(--color-text-secondary)',
              )}
            >
              <span aria-hidden="true">×</span>
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

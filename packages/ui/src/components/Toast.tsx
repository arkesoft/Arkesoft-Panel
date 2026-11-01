// @arkesoft/ui — Toast (ROADMAP v0.0.7, T-008/S2)
//
// YALNIZCA SUNUM — provider/hook/global bildirim kuyruğu YOK. v0.0.7'nin
// akışında bildirim gösterecek hiçbir eylem yok (docs/ui/T-008.md "Toast ve
// DataTable — v0.0.7'de tüketicisi yok"): bu bileşen export edilir ama
// `apps/admin`'den hiçbir import satırı ona değmez. Erken geldi çünkü
// ROADMAP v0.0.7 kapsam maddesi `packages/ui`'ye "Button, Input, Card,
// Toast, DataTable iskeleti" eklenmesini adıyla istiyor; ilk gerçek
// tüketici muhtemelen bir mutation sonrası geri bildirim ekranı (v0.4.0+).

import { forwardRef, type HTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export type ToastVariant = 'info' | 'success' | 'error'

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  variant: ToastVariant
  /** Bildirim başlığı — çağıran taraf i18n kataloğundan geçirir (CLAUDE.md §4). */
  title: string
  /** Bildirim gövdesi (opsiyonel) — i18n kataloğundan geçirilir. */
  description?: string
}

const VARIANT_CLASS_NAMES: Record<ToastVariant, string> = {
  info: 'border-(--color-border-subtle) bg-(--color-surface) text-(--color-text-primary)',
  success: 'border-(--color-success-600) bg-(--color-success-surface) text-(--color-success-600)',
  error: 'border-(--color-danger-500) bg-(--color-danger-surface) text-(--color-danger-600)',
}

export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast(
  { variant, title, description, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      role="status"
      className={cn(
        'flex w-full flex-col gap-1 rounded-(--radius-control) border p-4 text-(length:--font-size-body)',
        VARIANT_CLASS_NAMES[variant],
        className,
      )}
      {...rest}
    >
      <p className="font-(--font-weight-semibold)">{title}</p>
      {description !== undefined && description.length > 0 ? (
        <p className="text-(length:--font-size-small)">{description}</p>
      ) : null}
    </div>
  )
})

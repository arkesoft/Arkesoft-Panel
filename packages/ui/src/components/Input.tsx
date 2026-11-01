// @arkesoft/ui — Input (ROADMAP v0.0.7, T-008/S2, docs/ui/T-008.md bileşen eşlemesi)
//
// `apps/admin` kullanıyor (e-posta/parola alanları). Erişilebilirlik notu
// (docs/ui/T-008.md): `error` prop'u varsa `input`'a `aria-invalid="true"`
// ve `aria-describedby` eklenir, hata metni aynı `id`'li `<p>` içinde
// render edilir; `error` yoksa iki öznitelik de HİÇ render edilmez (boş
// string değil, tamamen yok).

import { forwardRef, useId, type InputHTMLAttributes } from 'react'

import { cn } from '../lib/cn'
import { FOCUS_RING_CLASS_NAMES } from '../tokens'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Görünür etiket metni (placeholder DEĞİL) — her alan etiketli olmalı (CLAUDE.md §4). */
  label: string
  /** Alan hata metni (i18n kataloğundan, çağıran tarafça çözümlenmiş). */
  error?: string
  id?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className, ...rest },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const hasError = error !== undefined && error.length > 0

  return (
    <div className="flex w-full flex-col gap-1">
      <label
        htmlFor={inputId}
        className="text-(length:--font-size-body) font-(--font-weight-regular) text-(--color-text-primary)"
      >
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={hasError ? true : undefined}
        aria-describedby={hasError ? errorId : undefined}
        className={cn(
          'h-11 w-full rounded-(--radius-control) border bg-(--color-surface) px-3 text-(length:--font-size-body) text-(--color-text-primary)',
          hasError ? 'border-(--color-danger-500)' : 'border-(--color-border)',
          FOCUS_RING_CLASS_NAMES,
          className,
        )}
        {...rest}
      />
      {hasError ? (
        <p id={errorId} className="text-(length:--font-size-small) text-(--color-danger-600)">
          {error}
        </p>
      ) : null}
    </div>
  )
})

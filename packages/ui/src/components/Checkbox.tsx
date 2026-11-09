// @arkesoft/ui — Checkbox (ROADMAP v0.0.15, T-016/S10, docs/ui/T-016-iki-
// faktorlu-dogrulama.md "Yeni bileşen önerileri")
//
// Native `<input type="checkbox">` + `accent-(--color-brand-500)` —
// `Input`'un hand-rolled desenine paralel. Radix GEREKMİYOR: tarayıcının
// native checkbox'ı + `accent-color` zaten klavye (`Space` ile toggle) ve
// `aria-checked` eşlemesini taşıyor (T-008'in "packages/ui'ye Radix
// girmiyor" kararını İHLAL ETMİYOR).
//
// ⚠ `accent-color`'ın render ettiği TAM piksel rengi tarayıcıya göre
// değişebilir — bu DOĞRULANAMADI (docs/ui/T-016 RİSKLER madde 4), `wcag`
// turunun `getComputedStyle` ile ölçmesi gerekiyor.
import { forwardRef, useId, type InputHTMLAttributes } from 'react'

import { cn } from '../lib/cn'
import { FOCUS_RING_CLASS_NAMES } from '../tokens'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  /** Görünür etiket metni (her alan etiketli olmalı, CLAUDE.md §4). */
  label: string
  id?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, id, className, ...rest },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="flex items-start gap-2">
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className={cn(
          'mt-0.5 size-5 shrink-0 cursor-pointer rounded-(--radius-control) border border-(--color-border) accent-(--color-brand-500)',
          FOCUS_RING_CLASS_NAMES,
          className,
        )}
        {...rest}
      />
      <label
        htmlFor={inputId}
        className="cursor-pointer text-(length:--font-size-body) font-(--font-weight-regular) text-(--color-text-primary)"
      >
        {label}
      </label>
    </div>
  )
})

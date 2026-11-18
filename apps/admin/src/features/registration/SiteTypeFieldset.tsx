// @arkesoft/admin — SiteTypeFieldset (ROADMAP v0.1.0, T-019/S10,
// docs/ui/T-019-kayit-ve-kiraci-olusturma.md P5 bileşen eşlemesi)
//
// Sunum-only — veri çekmez, karar vermez (`StoreWizard.tsx`'in çağırdığı
// `onChange`'e geri bildirir). Native `<fieldset>`/`<legend>`/2×
// `<input type="radio">` — Radix GEREKMİYOR (ok tuşu gezinmesi + `aria-
// checked` eşlemesi tarayıcı varsayılanı), `Checkbox.tsx`'in AYNI "native
// input + accent-color" deseni. `apps/admin`'e özgü — tek kullanım yeri,
// `packages/ui`'ye TAŞINMIYOR (T-016'nın `BackupCodesList` gerekçesiyle
// AYNI sınıf, docs/ui "Bileşen eşlemesi" notu).
import { useId, type JSX } from 'react'

import type { SiteType } from '@arkesoft/trpc'
import { cn, FOCUS_RING_CLASS_NAMES } from '@arkesoft/ui'

export interface SiteTypeFieldsetProps {
  readonly legend: string
  readonly ecommerceLabel: string
  readonly corporateLabel: string
  readonly value: SiteType | null
  readonly onChange: (siteType: SiteType) => void
  /** Boş seçim hatası — `<fieldset>`'in `aria-describedby`'ına bağlanır (ux'in şartı). */
  readonly errorMessage?: string
}

export function SiteTypeFieldset({
  legend,
  ecommerceLabel,
  corporateLabel,
  value,
  onChange,
  errorMessage,
}: SiteTypeFieldsetProps): JSX.Element {
  const groupName = useId()
  const errorId = useId()
  const hasError = errorMessage !== undefined && errorMessage.length > 0

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={hasError ? errorId : undefined}>
      <legend className="text-(length:--font-size-body) font-(--font-weight-regular) text-(--color-text-primary)">
        {legend}
      </legend>

      <label className="flex min-h-11 cursor-pointer items-center gap-2">
        <input
          type="radio"
          name={groupName}
          value="ecommerce"
          checked={value === 'ecommerce'}
          onChange={() => {
            onChange('ecommerce')
          }}
          className={cn(
            'size-5 shrink-0 cursor-pointer accent-(--color-brand-500)',
            FOCUS_RING_CLASS_NAMES,
          )}
        />
        <span className="text-(length:--font-size-body) text-(--color-text-primary)">
          {ecommerceLabel}
        </span>
      </label>

      <label className="flex min-h-11 cursor-pointer items-center gap-2">
        <input
          type="radio"
          name={groupName}
          value="corporate"
          checked={value === 'corporate'}
          onChange={() => {
            onChange('corporate')
          }}
          className={cn(
            'size-5 shrink-0 cursor-pointer accent-(--color-brand-500)',
            FOCUS_RING_CLASS_NAMES,
          )}
        />
        <span className="text-(length:--font-size-body) text-(--color-text-primary)">
          {corporateLabel}
        </span>
      </label>

      {hasError ? (
        <p
          id={errorId}
          role="alert"
          className="text-(length:--font-size-small) text-(--color-danger-600)"
        >
          {errorMessage}
        </p>
      ) : null}
    </fieldset>
  )
}

// @arkesoft/ui — Button (ROADMAP v0.0.7, T-008/S2, docs/ui/T-008.md bileşen eşlemesi)
//
// `apps/admin` kullanıyor ("Giriş yap" birincil buton, ErrorState "Tekrar
// dene"). CLAUDE.md §2: fonksiyon bileşeni + hook; `packages/ui` veri çekmez
// (CLAUDE.md §3) — bu bileşen yalnızca sunum, iş mantığı taşımaz.

import { forwardRef, type ButtonHTMLAttributes, type JSX } from 'react'

import { cn } from '../lib/cn'
import { FOCUS_RING_CLASS_NAMES } from '../tokens'

/** v0.0.7'de yalnızca `'primary'` tüketiliyor (docs/ui/T-008.md bileşen eşlemesi). */
export type ButtonVariant = 'primary'

/** v0.0.7'de yalnızca `'md'` (44px dokunma hedefi) tüketiliyor. */
export type ButtonSize = 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /**
   * Gönderim sürüyor mu. `true` olduğunda buton `disabled` VE
   * `aria-busy="true"` birlikte set edilir (çift gönderim fiziksel olarak
   * engellenir) ve dahili bir dönen gösterge render edilir. Buton metnini
   * DEĞİŞTİRMEZ — çağıran taraf `children`'ı mesaj kataloğundan geçirir
   * (docs/ui/T-008.md erişilebilirlik notları).
   */
  isLoading?: boolean
}

/**
 * `packages/ui`'nin paylaştığı spinner markup'ı (docs/ui/T-008.md "Yeni
 * bileşen önerileri") — `border-current` ile ebeveynin metin rengini
 * (burada `--color-text-inverse`) devralır, ayrı bir renk token'ı gerekmez.
 */
function LoadingSpinner(): JSX.Element {
  return (
    <span
      aria-hidden="true"
      // WCAG 2.3.3 (AAA, `wcag` tur 1 bulgusu — Button.tsx:40): dönme hareketi
      // `prefers-reduced-motion: reduce` tercihine saygı duymalı. Tailwind'in
      // yerleşik `motion-reduce:` varyantı (ek bağımlılık gerekmez) döndürmeyi
      // kapatır; halka yine görünür kalır (`border-t-transparent` kaybolur ama
      // kenarlık + `border-current` ile yükleniyor durumunun görsel ipucu
      // korunur). AYNI DESENİ `apps/admin/src/components/LoadingState.tsx:34`
      // (S5'in dosyası) için de uygula — oradaki spinner markup'ı bu dosyadan
      // kopyalanmış olabilir.
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  )
}

/**
 * v0.0.7'de her biri tek üyeli (`'primary'`, `'md'`) — ikinci bir üye
 * eklendiğinde yalnızca bu haritalara satır eklenir, koşullu dallanma
 * gerekmez (docs/ui/T-008.md: "Beş bileşenin kapsamı bilinçli küçük").
 */
const VARIANT_CLASS_NAMES: Record<ButtonVariant, string> = {
  primary: 'bg-(--color-brand-500) text-(--color-text-inverse)',
}

const SIZE_CLASS_NAMES: Record<ButtonSize, string> = {
  md: 'h-11 min-w-11',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    disabled,
    type = 'button',
    className,
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled === true || isLoading

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading ? true : undefined}
      className={cn(
        // KARAR (wcag tur 1 low bulgusu, Button.tsx:80 — devre dışı birincil
        // buton ~2.54:1): BİLİNÇLİ OLARAK DEĞİŞTİRİLMEDİ. WCAG 1.4.3/1.4.11
        // devre dışı (inert) bileşenleri kontrast gereksiniminden MUAF tutar —
        // bu bir ihlal değil, iyileştirme önerisi (AAA seviyesi bile değil,
        // gate bulgusu `low`). `disabled:opacity-60` KASITLI: devre dışı
        // butonu görsel olarak "tıklanamaz" hissettirmek için düşük kontrast
        // bir TASARIM SİNYALİ — kontrastı 4.5:1'e çıkarmak butonun etkileşimli
        // göründüğü yanlış izlenimini verir. Değiştirilirse `tokens.ts`'in
        // `CONTRAST_PAIRS`'ine yeni bir girdi eklenmesi VE `tokens.test.ts`'in
        // güncellenmesi gerekir (şu an disabled durumu için ayrı bir çift
        // tanımlı değil). Fikir değiştirilirse bu yorum güncellenmeli.
        'inline-flex items-center justify-center gap-2 rounded-(--radius-control) px-4 font-(--font-weight-semibold) text-(length:--font-size-body) transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        SIZE_CLASS_NAMES[size],
        VARIANT_CLASS_NAMES[variant],
        FOCUS_RING_CLASS_NAMES,
        className,
      )}
      {...rest}
    >
      {isLoading ? <LoadingSpinner /> : null}
      {children}
    </button>
  )
})

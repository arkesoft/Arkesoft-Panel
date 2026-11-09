// @arkesoft/ui — Skeleton (ROADMAP v0.0.15, T-016/S10, docs/ui/T-016-iki-
// faktorlu-dogrulama.md "Yeni bileşen önerileri")
//
// Genel amaçlı yükleniyor placeholder'ı — Radix GEREKTİRMİYOR (T-008'in
// "packages/ui'ye Radix girmiyor" kararını İHLAL ETMİYOR, bu bileşen hiç
// Radix kullanmıyor). `apps/admin`'in `TwoFactorStatusCard`'ı (P1 — kart
// içi yükleniyor, ux'in şartı: "Etkinleştir"/"Devre dışı bırak" hiçbiri
// durum bilinmeden render EDİLMEZ) bunu tüketir.
//
// `aria-hidden` — tek başına anlamlı bir içerik taşımıyor; çağıran taraf
// (apps/admin) yükleniyor durumunu `aria-live`/`aria-busy` ile ayrıca
// duyurur (bu bileşen o duyuruyu KENDİSİ üretmez, Button/LoadingState'in
// deseniyle AYNI sorumluluk ayrımı).
import { forwardRef, type HTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export type SkeletonProps = HTMLAttributes<HTMLDivElement>

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        // WCAG 2.3.3 (AAA) — `Button`/`LoadingState`'teki AYNI desen:
        // `motion-reduce:` hareketi kapatır, blok GÖRÜNÜR kalır.
        'animate-pulse rounded-(--radius-control) bg-(--color-surface-muted) motion-reduce:animate-none',
        className,
      )}
      {...rest}
    />
  )
})

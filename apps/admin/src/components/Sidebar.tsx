// @arkesoft/admin — Sidebar (ROADMAP v0.0.7, T-008/S5, docs/ui/T-008.md
// responsive plan)
//
// RİSK 4 (PM, bağlayıcı): bu sürümde YALNIZCA "Panel" öğesi var. İzne tabi
// olacak hiçbir öğe KONULMAZ (RBAC v0.0.14'te geri alınır).
//
// Responsive: 360px'te `nav` YATAY şerit (`flex-row`), `md:` (768px)
// dikey şeride döner (`md:flex-col md:w-56`), `lg:` biraz daha geniş
// (`lg:w-64`) — DOM/nav YAPISI (tek `nav`, tek bağlantı) HER İKİ genişlikte
// de AYNI, yalnızca flex yönü/genişlik değişir (docs/ui/T-008.md).
// Hamburger/çekmece KURULMADI (UX'in sabit kararı — tek öğeli nav için
// gizleme mekanizması gereksiz sürtünme).
//
// AC12 ODAK SINIFI (DÜZELTME TURU 1 — `solid` M1/M2 ║ `wcag` M2 kapandı):
// `FOCUS_RING_CLASS_NAMES` artık `@arkesoft/ui` barrel'ından İTHAL EDİLİYOR
// (`packages/ui/src/index.ts:24` export etti). Literal kopya SİLİNDİ —
// AC12'nin grep kontrolü "çıplak outline-none" değil, bu zaten
// `focus-visible:outline-none` (eşlikçili) biçiminde. Kaynak `.ts`
// dosyasından üretilen Tailwind utility'leri `apps/admin/src/styles.css`'in
// `@source` globu `.ts`'i de taradığı için derleniyor (bkz. styles.css notu).
import type { JSX } from 'react'

import { Link } from '@tanstack/react-router'

import { FOCUS_RING_CLASS_NAMES } from '@arkesoft/ui'

export interface SidebarProps {
  readonly navLabel: string
  readonly panelLabel: string
}

export function Sidebar({ navLabel, panelLabel }: SidebarProps): JSX.Element {
  return (
    <nav
      aria-label={navLabel}
      className="flex shrink-0 flex-row gap-1 bg-(--color-surface-muted) p-2 md:w-56 md:flex-col md:p-4 lg:w-64"
    >
      <Link
        to="/"
        activeOptions={{ exact: true }}
        activeProps={{
          'aria-current': 'page',
          className: 'bg-(--color-brand-50) text-(--color-brand-500)',
        }}
        className={`${FOCUS_RING_CLASS_NAMES} inline-flex min-h-11 min-w-11 items-center rounded-(--radius-control) px-3 text-(length:--font-size-body) font-(--font-weight-regular) text-(--color-text-primary)`}
      >
        {panelLabel}
      </Link>
    </nav>
  )
}

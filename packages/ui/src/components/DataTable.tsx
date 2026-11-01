// @arkesoft/ui — DataTable (ROADMAP v0.0.7, T-008/S2, PO kararı R3)
//
// SUNUM KABUĞU — sıralama/sayfalama/sanallaştırma ve harici bir tablo
// motoru kütüphanesi YOK (PO kararı R3, AC14). v0.0.7'nin tek ekranı "gerçekten boş" dashboard;
// hiç liste/veri kümesi yok (docs/ui/T-008.md "Toast ve DataTable — v0.0.7'de
// tüketicisi yok"): bu bileşen export edilir ama `apps/admin`'den hiçbir
// import satırı ona değmez. Motor seçimi (hangi tablo kütüphanesi) ilk
// gerçek liste tüketicisine (v0.0.16 medya / v0.0.20 tenant listesi / v0.4.0
// ürün listesi) bırakıldı; bu sürüm yalnızca props yüzeyini sabitliyor.

import type { JSX, ReactNode } from 'react'

import { cn } from '../lib/cn'

export interface DataTableColumn {
  readonly key: string
  readonly header: string
}

/** Her hücre önceden render edilmiş `ReactNode` taşır — DataTable veri çekmez, dönüştürmez (CLAUDE.md §3/§9). */
export type DataTableRow = Readonly<Record<string, ReactNode>>

export interface DataTableProps {
  columns: readonly DataTableColumn[]
  rows: readonly DataTableRow[]
  /** Satır yoksa render edilecek boş durum içeriği. Metin çağıran taraftan (i18n kataloğu). */
  emptyState: ReactNode
  /** Erişilebilir tablo açıklaması (`<caption>`, görsel olarak gizli). */
  caption?: string
  className?: string
}

export function DataTable({
  columns,
  rows,
  emptyState,
  caption,
  className,
}: DataTableProps): JSX.Element {
  if (rows.length === 0) {
    return (
      <div role="status" className={className}>
        {emptyState}
      </div>
    )
  }

  return (
    <table
      className={cn('w-full border-collapse text-left text-(length:--font-size-body)', className)}
    >
      {caption !== undefined ? <caption className="sr-only">{caption}</caption> : null}
      <thead>
        <tr className="border-b border-(--color-border-subtle)">
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className="px-3 py-2 font-(--font-weight-semibold) text-(--color-text-primary)"
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          // Satır kimliği yok (sunum kabuğu, sıralama/sayfalama/sanallaştırma
          // yok — PO kararı R3); dizin bu kapsamda güvenle kullanılabilir.
          <tr key={rowIndex} className="border-b border-(--color-border-subtle)">
            {columns.map((column) => (
              <td key={column.key} className="px-3 py-2 text-(--color-text-primary)">
                {row[column.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

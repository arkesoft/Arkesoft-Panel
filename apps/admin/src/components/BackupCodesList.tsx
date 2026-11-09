// @arkesoft/admin — BackupCodesList (ROADMAP v0.0.15, T-016/S10,
// docs/ui/T-016-iki-faktorlu-dogrulama.md P4 — "2FA'ya özgü formatlama,
// genel bir liste ilkeli DEĞİL")
//
// Gerçek liste semantiği (ux'in şartı): `<ol>`/`<li>`, `div` yığını DEĞİL.
// Veri ÇEKMEZ — yalnızca prop olarak gelen kodları gösterir (sunum/veri
// ayrımı, CLAUDE.md §9). Dosya adı JENERİK (`arkesoft-yedek-kodlar.txt`),
// kimlik GÖMÜLMEZ (ux'in şartı).
import type { JSX } from 'react'

import { Checkbox, CopyButton } from '@arkesoft/ui'

export interface BackupCodesListProps {
  readonly title: string
  readonly codes: readonly string[]
  readonly copyAllLabel: string
  readonly copiedLabel: string
  readonly copyFailedLabel: string
  readonly downloadLabel: string
  readonly downloadFileName: string
  readonly savedCheckboxLabel: string
  readonly saved: boolean
  readonly onSavedChange: (saved: boolean) => void
}

export function BackupCodesList({
  title,
  codes,
  copyAllLabel,
  copiedLabel,
  copyFailedLabel,
  downloadLabel,
  downloadFileName,
  savedCheckboxLabel,
  saved,
  onSavedChange,
}: BackupCodesListProps): JSX.Element {
  const joinedCodes = codes.join('\n')

  const handleDownload = (): void => {
    const blob = new Blob([joinedCodes], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = downloadFileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-(--font-weight-semibold) text-(length:--font-size-body) text-(--color-text-primary)">
        {title}
      </p>
      <ol className="flex flex-col gap-2 rounded-(--radius-card) border border-(--color-border-subtle) bg-(--color-surface-muted) p-4 font-mono text-(length:--font-size-body)">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row sticky bottom-0 bg-(--color-surface) py-2">
        <CopyButton
          value={joinedCodes}
          label={copyAllLabel}
          copiedLabel={copiedLabel}
          failedLabel={copyFailedLabel}
          variant="secondary"
        />
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex h-11 min-w-11 items-center justify-center rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) px-4 text-(length:--font-size-body) font-(--font-weight-semibold) text-(--color-text-primary)"
        >
          {downloadLabel}
        </button>
      </div>
      <Checkbox
        label={savedCheckboxLabel}
        checked={saved}
        onChange={(event) => {
          onSavedChange(event.target.checked)
        }}
      />
    </div>
  )
}

// @arkesoft/ui — CopyButton (ROADMAP v0.0.15, T-016/S10, docs/ui/T-016-iki-
// faktorlu-dogrulama.md "Yeni bileşen önerileri")
//
// `Button`'ı sarmalayan genel amaçlı kopyalama bileşeni — Clipboard API
// (tarayıcı yerleşik), Radix GEREKMİYOR. Manuel anahtar (P3) ve yedek
// kodlar (P4) burada TEKRAR eden deseni paylaşır.
//
// Erişilebilirlik (docs/ui erişilebilirlik notları): "Kopyalandı" geri
// bildirimi `role="status"` (`aria-live="polite"`) — `role="alert"` DEĞİL,
// bu bir hata değil bir onay. Geri bildirim sabit bir süre sonra (varsayılan
// 2000ms) sessizce `label`'a geri döner; bu bileşen VERİ ÇEKMEZ, tRPC'ye
// bağımlı DEĞİL (CLAUDE.md §3/§9).
import { useEffect, useRef, useState, type JSX } from 'react'

import { Button, type ButtonProps } from './Button'

export interface CopyButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  /** Panoya kopyalanacak düz metin. */
  readonly value: string
  /** Buton metni (normal durum) — i18n kataloğundan, çağıran tarafça çözümlenmiş. */
  readonly label: string
  /** "Kopyalandı" durumunda gösterilecek metin — i18n kataloğundan. */
  readonly copiedLabel: string
  /** Kopyalama başarısız olursa (Clipboard API reddi) gösterilecek metin. */
  readonly failedLabel: string
  /** `copiedLabel`'ın görünür kaldığı süre (ms) — varsayılan 2000. */
  readonly resetAfterMs?: number
}

type CopyStatus = 'idle' | 'copied' | 'failed'

export function CopyButton({
  value,
  label,
  copiedLabel,
  failedLabel,
  resetAfterMs = 2000,
  ...buttonProps
}: CopyButtonProps): JSX.Element {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleClick = (): void => {
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setStatus('copied')
      })
      .catch(() => {
        setStatus('failed')
      })
      .finally(() => {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => {
          setStatus('idle')
        }, resetAfterMs)
      })
  }

  const buttonText = status === 'idle' ? label : status === 'copied' ? copiedLabel : failedLabel

  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" {...buttonProps} onClick={handleClick}>
        {buttonText}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {status === 'copied' ? copiedLabel : null}
        {status === 'failed' ? failedLabel : null}
      </span>
    </span>
  )
}

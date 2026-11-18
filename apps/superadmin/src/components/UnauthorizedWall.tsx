// @arkesoft/superadmin — UnauthorizedWall (ROADMAP v0.0.20, T-021/S8,
// docs/ui/T-021-super-admin-iskeleti.md "Üç 403'ün görsel ayrımı" #1)
//
// `PLATFORM_ADMIN_REQUIRED` durumu — kimlik DOĞRU, yetki YOK. Bu bir sistem
// arızası DEĞİL, kalıcı bir yetki sınırıdır: `role="status"` (alarm DEĞİL),
// **nötr** vurgu (`--color-border-subtle` sol kenarlık + `--color-surface-
// muted` zemin + `--color-text-secondary` dekoratif işaret) — eylem YOK,
// hiçbir `Button` render edilmez (odaklanabilir ama işlevsiz kontrol
// bırakılmaz, docs/ux/T-021 madde 5). "Tekrar giriş yap" bağlantısı/önerisi
// YOK (giriş döngüsü yasak — kimlik zaten doğru, tekrar giriş aynı sonucu
// üretir).
//
// Kendi `h1`'ini taşır, mount'ta odağı alır (T-016 Ekran 9 deseni) — kabuğun
// DIŞINDA render edilir (navigasyon yok, çağıranın sorumluluğu).
import { useEffect, useRef, type JSX } from 'react'

export interface UnauthorizedWallProps {
  readonly title: string
  readonly body: string
}

export function UnauthorizedWall({ title, body }: UnauthorizedWallProps): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div
        role="status"
        className="flex w-full max-w-md flex-col gap-3 rounded-(--radius-card) border-l-4 border-(--color-border-subtle) bg-(--color-surface-muted) p-6"
      >
        <span
          aria-hidden="true"
          className="text-(length:--font-size-small) text-(--color-text-secondary)"
        >
          ●
        </span>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
        >
          {title}
        </h1>
        <p className="text-(length:--font-size-body) text-(--color-text-secondary)">{body}</p>
      </div>
    </div>
  )
}

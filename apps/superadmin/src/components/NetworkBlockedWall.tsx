// @arkesoft/superadmin — NetworkBlockedWall (ROADMAP v0.0.20, T-021/S8,
// docs/ui/T-021-super-admin-iskeleti.md "Üç 403'ün görsel ayrımı" #3)
//
// IP guard reddi (`PLATFORM_NETWORK_NOT_ALLOWED`) — doğru kimlik, izinli
// olmayan ağ. Üçünün en "gerçek blokaj" olanı: `role="alert"`, **danger**
// vurgu (`--color-danger-500` sol kenarlık + `--color-danger-surface`
// zemin). Eylem YOK ama ortam değişkeni ADI `font-(--font-weight-semibold)`
// ile vurgulanır — ⚠⚠ allowlist'in İÇERİĞİ (hangi IP'ler izinli) bu
// bileşene HİÇ GEÇİRİLMEZ, çağıran yalnızca `envVarName: string` verir.
//
// Kendi `h1`'ini taşır, mount'ta odağı alır — kabuğun DIŞINDA render edilir.
import { useEffect, useRef, type JSX } from 'react'

export interface NetworkBlockedWallProps {
  readonly title: string
  /** Ortam değişkeni adından ÖNCEKİ metin parçası. */
  readonly bodyPrefix: string
  /** Vurgulanan ortam değişkeni ADI — İÇERİĞİ (izinli IP'ler) DEĞİL. */
  readonly envVarName: string
  /** Ortam değişkeni adından SONRAKİ metin parçası. */
  readonly bodySuffix: string
}

export function NetworkBlockedWall({
  title,
  bodyPrefix,
  envVarName,
  bodySuffix,
}: NetworkBlockedWallProps): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div
        role="alert"
        className="flex w-full max-w-md flex-col gap-3 rounded-(--radius-card) border-l-4 border-(--color-danger-500) bg-(--color-danger-surface) p-6"
      >
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
        >
          {title}
        </h1>
        <p className="text-(length:--font-size-body) text-(--color-text-secondary)">
          {bodyPrefix}{' '}
          <span className="font-(--font-weight-semibold) text-(--color-text-primary)">
            {envVarName}
          </span>{' '}
          {bodySuffix}
        </p>
      </div>
    </div>
  )
}

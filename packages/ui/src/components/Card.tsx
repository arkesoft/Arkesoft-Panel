// @arkesoft/ui — Card (+CardHeader/CardTitle/CardContent) (ROADMAP v0.0.7, T-008/S2)
//
// `apps/admin` kullanıyor (giriş formunu görsel olarak gruplayan kapsayıcı).
// Sayfanın tek `h1`'i her zaman route dosyasının kendisindedir, Card'ın
// İÇİNDE DEĞİL (docs/ui/T-008.md erişilebilirlik notları: "Tek h1'in yeri")
// — `CardTitle` bu yüzden kasıtlı olarak bir `<h*>` ÜRETMEZ; stilize bir
// `<p>`'dir, bir başlık düzeyi dayatmaz.

import { forwardRef, type HTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export type CardProps = HTMLAttributes<HTMLDivElement>

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-(--radius-card) border border-(--color-border-subtle) bg-(--color-surface) p-6 shadow-(--shadow-card)',
        className,
      )}
      {...rest}
    />
  )
})

export type CardHeaderProps = HTMLAttributes<HTMLDivElement>

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn('flex flex-col gap-1.5', className)} {...rest} />
})

export type CardTitleProps = HTMLAttributes<HTMLParagraphElement>

/** Kasıtlı olarak `<p>` — sayfanın tek `h1`'i her zaman route dosyasındadır. */
export const CardTitle = forwardRef<HTMLParagraphElement, CardTitleProps>(function CardTitle(
  { className, ...rest },
  ref,
) {
  return (
    <p
      ref={ref}
      className={cn(
        'text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)',
        className,
      )}
      {...rest}
    />
  )
})

export type CardContentProps = HTMLAttributes<HTMLDivElement>

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(function CardContent(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn('flex flex-col gap-4', className)} {...rest} />
})

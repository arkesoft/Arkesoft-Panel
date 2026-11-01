// @arkesoft/ui — `cn()` yardımcısı (ROADMAP v0.0.7, T-008/S2)
//
// shadcn/ui'nin standart deseni: `clsx` koşullu sınıf adlarını birleştirir,
// `tailwind-merge` çakışan Tailwind sınıflarını (ör. iki `bg-*`) çözer.

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Koşullu sınıf adlarını birleştirir ve çakışan Tailwind sınıflarını çözer.
 * `packages/ui` bileşenlerinin tamamı `className` prop'unu bununla birleştirir.
 */
export function cn(...inputs: readonly ClassValue[]): string {
  return twMerge(clsx(...inputs))
}

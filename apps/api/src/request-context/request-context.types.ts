// @arkesoft/api — ALS sözleşmesi: tipler (ROADMAP v0.0.4, T-002/ST-4, architect K-A5)
//
// `RequestContext`/`TenantResolution`/`TenantContext` BURADA tanımlanır; ama
// `TenantContext` DEĞERİNİ üretecek fabrika burada DEĞİL — o `TenantResolverService`
// (ST-5) sorumluluğunda (istek girdisinden tenant uydurulamaması için, K-A5).
//
// VARSAYIM GERÇEKLEŞTİ (ROADMAP v0.0.5, T-006/S6): `auth` alanı ADDITIVE
// EKLENDİ — `RequestContext` bir `type` olduğu için bu mevcut tüketicileri
// KIRMAZ (yalnızca yeni okuyucular, `AuthGuard`/`current-user.decorator.ts`,
// o alanı görür). `AuthResolution`/`CurrentUserIdentity` BİLEREK BU DOSYADA
// DEĞİL — `TenantResolution`'ın TERSİNE, `auth/auth-resolution.types.ts`
// içinde tanımlı (o dosyanın başı yorumuna bkz: birleşim, onu ÜRETEN
// middleware ve ZORLAYAN guard'ın yaşadığı dizinde durur); bu dosya onu
// İTHAL EDER.

import type { TenantStatus } from '@arkesoft/db'
import type { Logger } from 'pino'

import type { AuthResolution } from '../auth/auth-resolution.types.js'

/**
 * Tenant çözümünün BAŞARISIZ olduğu 11 kesin sebep (architect K-A5/K-A4,
 * bağlayıcı — liste büyütülürse `TenantGuard`/`resolve-host.ts`'in exhaustive
 * switch'leri derleme zamanında kırılır, bu KASITLI: yeni bir ret sebebi
 * sessizce geçemez).
 */
export type TenantResolutionFailureReason =
  | 'missing_host'
  | 'multiple_host_headers'
  | 'unparsable_host'
  | 'base_domain_mismatch'
  | 'bare_base_domain'
  | 'nested_subdomain'
  | 'reserved_subdomain'
  | 'invalid_slug_format'
  | 'no_row'
  | 'soft_deleted'
  | 'header_rejected_in_production'

/**
 * Çözülmüş bir tenant'ın request-scope'a yazılan özeti. `name` BİLEREK YOK —
 * context iş verisi taşımaz (architect K-A4, minimal `select`).
 */
export type TenantContext = {
  readonly id: string
  slug: string
  readonly status: TenantStatus
  readonly source: 'subdomain' | 'custom-domain' | 'dev-header'
}

/**
 * Discriminated union — `TenantGuard` (ST-5) bunu EXHAUSTIVE switch ile okur.
 * `pending`: middleware hiç koşmadı → guard 500 atar (AC7, "default allow" dalı
 * yapısal olarak yok). `exempt`: allowlist'teki uç (`/health` vb.).
 */
export type TenantResolution =
  | { readonly kind: 'pending' }
  | { readonly kind: 'exempt' }
  | { readonly kind: 'resolved'; readonly tenant: TenantContext }
  | { readonly kind: 'unresolved'; readonly reason: TenantResolutionFailureReason }
  | { readonly kind: 'failed'; readonly cause: unknown }

/**
 * `AsyncLocalStorage<RequestContext>`'in taşıdığı tek depo nesnesi (K-A5).
 *
 * - `requestId`/`receivedAt`: değişmez (readonly), istek ömrü boyunca sabit.
 * - `logger`: mutable — ÜÇ yazıcı, SIRALI (FIX turu 1, madde 5 düzeltmesi:
 *   bu alan artık "TEK yazıcı" DEĞİL): `RequestContextMiddleware` (ST-4) İLK
 *   değeri (requestId'li child) yazar; `TenantContextMiddleware` (ST-5)
 *   tenant çözülünce `logger.child({ tenantId })` ile ÜZERİNE yazar;
 *   `AuthContextMiddleware` (ROADMAP v0.0.5, T-006/S6, FIX turu 1) kimlik
 *   doğrulanınca `logger.child({ userId })` ile EN SON üzerine yazar. Üçü de
 *   `app.module.ts`'in `configure()`'undaki AYNI, SIRALI middleware
 *   zincirinde — bir isteğin ömrü boyunca bu alana EN FAZLA üç kez yazılır.
 * - `tenant`: TEK mutable alan — `RequestContextMiddleware` `pending` ile
 *   başlatır, `TenantContextMiddleware` sonucu yazar.
 * - `auth` (ROADMAP v0.0.5, T-006/S6 EKLEMESİ, additive): `tenant`'ın AYNI
 *   deseni — `RequestContextMiddleware` `pending` ile başlatır,
 *   `AuthContextMiddleware` (`TenantContextMiddleware`'DEN SONRA koşar)
 *   sonucu yazar; `AuthGuard` EXHAUSTIVE switch ile okur.
 */
export type RequestContext = {
  readonly requestId: string
  readonly receivedAt: number
  logger: Logger
  tenant: TenantResolution
  auth: AuthResolution
}

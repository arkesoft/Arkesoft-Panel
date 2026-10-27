// @arkesoft/api — ALS sözleşmesi: tipler (ROADMAP v0.0.4, T-002/ST-4, architect K-A5)
//
// `RequestContext`/`TenantResolution`/`TenantContext` BURADA tanımlanır; ama
// `TenantContext` DEĞERİNİ üretecek fabrika burada DEĞİL — o `TenantResolverService`
// (ST-5) sorumluluğunda (istek girdisinden tenant uydurulamaması için, K-A5).
//
// VARSAYIM: v0.0.5 bu tipe `auth` alanını ADDITIVE ekleyecek — `RequestContext`
// bir `interface`/`type` olduğu için yeni bir alan eklemek mevcut tüketicileri
// KIRMAZ (yalnızca yeni okuyucular o alanı görür).

import type { TenantStatus } from '@arkesoft/db'
import type { Logger } from 'pino'

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
 * - `logger`: mutable — TEK YAZICI `TenantContextMiddleware`'dir (ST-5); tenant
 *   çözülünce `logger.child({ tenantId })` ile DEĞİŞTİRİLİR. Bu dosyanın
 *   sahibi (ST-4) bu alana yalnızca İLK değeri (requestId'li child) yazar.
 * - `tenant`: TEK mutable alan — `RequestContextMiddleware` `pending` ile
 *   başlatır, `TenantContextMiddleware` sonucu yazar.
 */
export type RequestContext = {
  readonly requestId: string
  readonly receivedAt: number
  logger: Logger
  tenant: TenantResolution
}

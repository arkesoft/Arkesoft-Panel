// @arkesoft/tenancy — tek giriş noktası (ROADMAP v0.0.8, T-009/S1,
// packages/errors/src/index.ts deseninin birebir kopyası)
//
// Tüketiciler (`apps/api`, v0.0.8'den itibaren `apps/storefront`) HER ZAMAN
// bu dosyadan import eder, iç dosya yoluna (`./resolve-host.js`,
// `./reserved-subdomains.js`) girmez.

export { normalizeHostname, resolveHost } from './resolve-host.js'
export type { HostResolutionFailureReason, ResolveHostResult } from './resolve-host.js'

export { RESERVED_SUBDOMAINS } from './reserved-subdomains.js'

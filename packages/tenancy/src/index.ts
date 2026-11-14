// @arkesoft/tenancy — tek giriş noktası (ROADMAP v0.0.8, T-009/S1,
// packages/errors/src/index.ts deseninin birebir kopyası)
//
// Tüketiciler (`apps/api`, v0.0.8'den itibaren `apps/storefront`) HER ZAMAN
// bu dosyadan import eder, iç dosya yoluna (`./resolve-host.js`,
// `./reserved-subdomains.js`, `./slug.js`) girmez.
//
// GENİŞLEME NOTU (ROADMAP v0.1.0, T-019/S2): üç → altı dışa açılan değer.
// Yeni üçü (`TENANT_SLUG_PATTERN`, `normalizeTenantSlug`,
// `validateTenantSlug`) `./slug.ts`'in kamu yüzeyidir — `foldTurkishCase` ve
// iç katlama tabloları BİLEREK dışa açılmaz.

export { normalizeHostname, resolveHost } from './resolve-host.js'
export type { HostResolutionFailureReason, ResolveHostResult } from './resolve-host.js'

export { RESERVED_SUBDOMAINS } from './reserved-subdomains.js'

export { TENANT_SLUG_PATTERN, normalizeTenantSlug, validateTenantSlug } from './slug.js'
export type { SlugValidationResult } from './slug.js'

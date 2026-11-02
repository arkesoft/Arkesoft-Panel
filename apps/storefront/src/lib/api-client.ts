// @arkesoft/storefront — createStorefrontTrpcClient (ROADMAP v0.0.8,
// T-009/S6, architect K18 tüketicisi)
//
// `@arkesoft/trpc`'nin KÖK alt yolundan (`.`) import eder — `@arkesoft/trpc/
// server` ASLA (ADR-0009 §6, `eslint.config.mjs`'in `trpcServerRestriction`'ı
// bunu zorluyor); `httpBatchLink` YASAK (tek kaynaktan `createTrpcClient`
// zaten `httpLink` kullanıyor, burada yeniden seçim yapılmıyor).
//
// Kiracı host'u (`tenantHost`) istek başına kurulan istemcinin URL
// YETKİSİNE (authority) konur — `createStorefrontServerFetch`'in giden
// `Host` başlığını BUNDAN türetmesiyle (K18) tek doğruluk kaynağı korunur.
// `target` (API'nin iç ağ bağlantı adresi) `STOREFRONT_API_BASE_URL`'den BİR
// KEZ, modül yüklenirken ayrıştırılır — istek başına YENİDEN ayrıştırılmaz.

import { createTrpcClient } from '@arkesoft/trpc'
import type { TrpcClient } from '@arkesoft/trpc'

import type { ApiConnectionTarget } from './storefront-server-fetch.js'
import { createStorefrontServerFetch } from './storefront-server-fetch.js'
import { storefrontEnv } from './storefront-env.js'

/** `STOREFRONT_API_BASE_URL`'den `ApiConnectionTarget`'ı türetir — port belirtilmemişse şemaya göre varsayılana düşer. */
function resolveApiConnectionTarget(rawBaseUrl: string): ApiConnectionTarget {
  const url = new URL(rawBaseUrl)
  const defaultPort = url.protocol === 'https:' ? 443 : 80
  const port = url.port.length > 0 ? Number(url.port) : defaultPort

  return { host: url.hostname, port }
}

/** Modül yüklenirken BİR KEZ çözülür — `storefrontEnv` değişmez (K17). */
const API_CONNECTION_TARGET: ApiConnectionTarget = resolveApiConnectionTarget(
  storefrontEnv.STOREFRONT_API_BASE_URL,
)

/**
 * `tenantHost`'u (host çözümünden gelen, kiracıya özgü değer) URL
 * yetkisine koyan, API'nin iç ağ adresine bağlanan tRPC istemcisi üretir.
 *
 * DÜZELTME TURU 1 (T-009, security bulgu 2, SEV: medium) — DERİNLEMESİNE
 * SAVUNMA: `tenantHost` BOŞSA fail-closed fırlatılır. `resolveHost`
 * (`@arkesoft/tenancy`) bu turda boş host'u zaten reddediyor
 * (`unparsable_host`), ama bu istemci KENDİ BAŞINA da güvenli olmalı —
 * yukarıdaki çözümleme adımı atlanır/değişirse bile burada BOŞ bir host
 * `http://${tenantHost}/trpc` içine geçip WHATWG `URL` ayrıştırıcısının
 * `/trpc` YOLUNU authority'ye taşımasına (`host: 'trpc'`, ölçüldü) ASLA
 * izin verilmez. Mesaj Türkçe DEĞİL — bu bir programlama hatası sinyali,
 * kullanıcıya gösterilmez (i18n kataloğu gerektirmez).
 */
export function createStorefrontTrpcClient(tenantHost: string): TrpcClient {
  if (tenantHost.length === 0) {
    throw new Error('storefront_trpc_client_empty_tenant_host')
  }

  return createTrpcClient({
    url: `http://${tenantHost}/trpc`,
    fetch: createStorefrontServerFetch(API_CONNECTION_TARGET),
  })
}

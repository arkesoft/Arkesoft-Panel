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

import { z } from 'zod'

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

// ⚠⚠ R5 TELAFİSİ (architect, ROADMAP v0.0.10/T-012, BAĞLAYICI — "DAĞITIM
// KAYMASI"): `apps/api` ve `apps/storefront` AYRI dağıtılabilir
// (`ROADMAP.md:1402-1407` kademeli açılış) → tek taraflı rollback GERÇEK bir
// senaryo. Eski `apps/api` + yeni `apps/storefront` kombinasyonunda
// `storefront.currentTenant`'ın yanıtında `themeId`/`themeVersion` alanları
// HİÇ BULUNMAZ — `@arkesoft/trpc`'nin derleme-zamanı tipi (`string | null`)
// bu durumda çalışma zamanında GERÇEKTE `undefined` döner ve HİÇBİR DAL bunu
// YAKALAMAZ (tanımsız davranış). CLAUDE.md §4: "dış dünyadan gelen her veri
// (HTTP gövdesi...) Zod ile parse edilir" — `apps/api`'nin yanıtı bu paket
// için vitrinin GÜVEN SINIRININ DIŞINDADIR (aynı monorepo'da derlenmiş
// olması bunu DEĞİŞTİRMEZ, ayrı dağıtılabilir oldukları için). Bu yüzden
// yanıt BURADA, istemcinin KENDİSİNDE, `unknown` olarak ele alınıp yerel bir
// Zod şemasıyla YENİDEN doğrulanır — `@arkesoft/trpc`'nin
// `storefrontTenantSchema`'sı KASITLI OLARAK yeniden KULLANILMAZ (o şema
// API'NİN kendi çıktısını tanımlar; burada doğrulanan ŞEY API'nin TAAHHÜT
// ETTİĞİ şekil DEĞİL, tele GERÇEKTE GELEN bayt).
//
// `.nullish()` (DEĞİL `.nullable()`) — eksik alanı (`undefined`) VE `null`
// alanı AYNI dalda `?? null`'a indirger: "seçim YOK" gibi davranır, hata
// FIRLAMAZ (`src/middleware.ts` bu normalize edilmiş `null`'ı
// `DEFAULT_THEME_SELECTION`'a yönlendirir — İŞ 3). Düz `result.themeId ??
// null` (bir Zod ADIMI OLMADAN) tek başına denenirse `@typescript-eslint/
// no-unnecessary-condition` kuralı takılabilir — çünkü `@arkesoft/trpc`'nin
// DERLEME-ZAMANI tipi ZATEN `string | null`dır (asla `undefined` değil), bu
// yüzden `?? null` o tip üzerinden "gereksiz" GÖRÜNÜR. Zod'un `.nullish()`
// çıkışı (`string | null | undefined`) `?? null`'ı GERÇEKTEN gerekli kılar —
// bu üç değerli tip BURADA, bu şemanın çıkışında, İLK KEZ doğar.
const storefrontTenantResponseSchema = z.object({
  name: z.string(),
  themeId: z.string().nullish(),
  themeVersion: z.string().nullish(),
})

/** {@link storefrontTenantResponseSchema}'nın normalize edilmiş (eksik/`null` ayrımı KALDIRILMIŞ) çıkış şekli. */
export interface StorefrontTenantApiResponse {
  readonly name: string
  readonly themeId: string | null
  readonly themeVersion: string | null
}

/**
 * `storefront.currentTenant` yanıtını (tipi `unknown` KABUL EDİLİR — tRPC
 * istemcisinin derleme-zamanı tipine GÜVENİLMEZ, R5 dosya başı yorumu)
 * yerel Zod şemasıyla doğrular ve eksik/`null` alan ayrımını `null`'a
 * indirger. Şema reddederse (ör. `name` de yoksa — API'nin TAMAMEN
 * uyumsuz bir sürümü) adlandırılmış bir `ZodError` FIRLAR; bu durum "seçim
 * yok" DEĞİLDİR, çağıranın (middleware) KENDİ hata eşlemesine (503)
 * düşmesi GEREKİR — burada SESSİZCE yutulmaz.
 */
export function parseStorefrontTenantResponse(raw: unknown): StorefrontTenantApiResponse {
  const parsed = storefrontTenantResponseSchema.parse(raw)

  return {
    name: parsed.name,
    themeId: parsed.themeId ?? null,
    themeVersion: parsed.themeVersion ?? null,
  }
}

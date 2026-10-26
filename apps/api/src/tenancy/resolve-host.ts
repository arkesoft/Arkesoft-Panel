// @arkesoft/api — Host başlığından tenant seçici çözümleme (ROADMAP v0.0.4,
// T-002/ST-5, architect K-A4)
//
// SAF FONKSİYON: bu dosyada `@nestjs/*`, `express`, `@arkesoft/db` ya da
// herhangi bir Nest/HTTP çatısı importu YOKTUR (`reserved-subdomains.ts`
// hariç — o da aynı şekilde saf). Amaç: v0.0.8'in storefront'u bu dosya
// ÇİFTİNİ (bu dosya + `reserved-subdomains.ts`) OLDUĞU GİBİ devralabilsin.
//
// KAYNAK YALNIZCA `Host` BAŞLIĞIDIR. `X-Forwarded-Host` OKUNMAZ ve express
// `trust proxy` KAPALI KALIR (bu dosyanın hiçbir parametresi böyle bir
// başlığı temsil ETMEZ — yapısal olarak okunması İMKANSIZ). Gerekçe: bu
// platformda henüz bir ters vekil (reverse proxy) allowlist'i YOK (v0.18.0'a
// kadar). `X-Forwarded-Host` güvenilir sayılsaydı, bir istemci bu başlığı
// elle göndererek `Host` başlığından BAĞIMSIZ bir tenant SEÇEBİLİRDİ — bu da
// Kullanıcı Onayı #1'in ("x-arkesoft-tenant yalnızca NODE_ENV !== 'production'
// iken kabul edilir") kapattığı deliği ARKA KAPIDAN yeniden açardı: üretimde
// host adı TEK doğruluk kaynağı olmalı, güvenilmeyen bir vekil başlığı da
// alternatif bir "istemci beyanı" kapısı olurdu.
//
// TOPLAM 8 ÇÖZÜMSÜZ SEBEP burada üretilir (geri kalan 3 — `no_row`,
// `soft_deleted`, `header_rejected_in_production` — `TenantResolverService`'in
// işidir, K-A4/K-A5 11 sebep listesinin tamamı için bkz.
// `request-context.types.ts`).

import { RESERVED_SUBDOMAINS } from './reserved-subdomains.js'

const MAX_HOST_HEADER_LENGTH = 255

/** Slug biçimi — RFC 1123 alt alan adı etiketiyle UYUMLU, bağlayıcı regex (K-A4). */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * `resolve-host.ts`'in SAF olarak üretebileceği 8 çözümsüz sebep. Değerler
 * `request-context.types.ts`'teki 11 sebeplik `TenantResolutionFailureReason`
 * birleşiminin KESİN bir alt kümesidir (literal dizeler birebir eşleşir) —
 * bu dosya o tipi İMPORT ETMEZ (saflık kısıtı), `TenantResolverService`
 * dönüş değerini doğrudan genişleterek (widening) atar.
 */
export type HostResolutionFailureReason =
  | 'missing_host'
  | 'multiple_host_headers'
  | 'unparsable_host'
  | 'base_domain_mismatch'
  | 'bare_base_domain'
  | 'nested_subdomain'
  | 'reserved_subdomain'
  | 'invalid_slug_format'

/**
 * `resolve-host.ts`'in SAF çözümleme sonucu. `TenantResolverService` bu üç
 * daldan İKİSİNİ (`subdomain`/`custom-domain`) tam olarak BİR Prisma
 * sorgusuna çevirir; `unresolved` dalında SORGU ATILMAZ (K-A4 — "çözümsüz
 * hâllerin hiçbirinde sorgu atılmaz, ucuz ret → host taraması DoS yüzeyi
 * değil").
 */
export type ResolveHostResult =
  | { readonly kind: 'subdomain'; readonly slug: string }
  | { readonly kind: 'custom-domain'; readonly host: string }
  | { readonly kind: 'unresolved'; readonly reason: HostResolutionFailureReason }

/**
 * Bir host adını `new URL('http://' + raw)` ile normalize eder: port soyma,
 * köşeli parantezli IPv6, ASCII küçük harf ve IDN→punycode BEDAVA gelir
 * (sıfır ek bağımlılık). Ardından TEK sondaki nokta soyulur (birden fazla
 * sondaki nokta BİLEREK soyulmaz — architect K-A4 "tek sondaki nokta").
 *
 * Girdi `new URL` tarafından ayrıştırılamazsa (`TypeError`) `undefined`
 * döner — bu da çağıranın "çözümsüz" olarak ele alacağı sinyaldir.
 *
 * `APP_BASE_DOMAIN` da açılışta (`TenantResolverService` kurucusunda) AYNI
 * fonksiyondan geçer — host ve taban alan adı karşılaştırması her zaman
 * normalize edilmiş iki değer arasında yapılır (K-A4, bağlayıcı).
 */
export function normalizeHostname(raw: string): string | undefined {
  let url: URL

  try {
    url = new URL(`http://${raw}`)
  } catch {
    return undefined
  }

  return url.hostname.endsWith('.') ? url.hostname.slice(0, -1) : url.hostname
}

/**
 * `Host` başlığından tenant seçicisini çözer. Algoritma (K-A4, BAĞLAYICI,
 * satır satır):
 *
 * 1. Başlık yok / dizi / 255 karakterden uzun → `unresolved`, sorgu yok.
 * 2. {@link normalizeHostname} ile normalize et; `TypeError` → `unresolved`.
 * 3. `h === normalizedBaseDomain` → `unresolved` (ÇIPLAK taban alan adı
 *    tenant DEĞİLDİR) — bu satır EN KRİTİK satırdır, adım 4'ten ÖNCE kontrol
 *    edilir.
 * 4. `h.endsWith('.' + normalizedBaseDomain)` İLE eşleşme aranır —
 *    `h.endsWith(base)` (dotsuz) KULLANILMAZ: `notarkesoft.localhost` gibi bir
 *    host `arkesoft.localhost` ile bitiyormuş GİBİ görünür ama gerçek etiket
 *    `not`tur, bu YANLIŞ bir tenant eşleşmesi üretirdi. `h.includes(base)` de
 *    KULLANILMAZ: `demo.arkesoft.localhost.evil.com` gibi bir host, taban
 *    alan adını İÇERİR ama ondan TÜREMEZ.
 * 5. Eşleşme YOKSA → `custom-domain` dalı (çağıran `primaryDomain` TAM
 *    eşleşmesiyle sorgulayacak) — bu bir HATA DEĞİLDİR, `evil.com` gibi
 *    taban alan adıyla İLİŞKİSİZ her host da buraya düşer.
 * 6. Eşleşme VARSA, etiket (`label`) çıkarılır: BOŞSA veya slug regex'i
 *    GEÇMİYORSA → `base_domain_mismatch`/`invalid_slug_format`; İÇİNDE `.`
 *    VARSA (iç içe alt alan adı) → `nested_subdomain`; REZERVE listedeyse →
 *    `reserved_subdomain`.
 */
export function resolveHost(
  rawHostHeader: string | string[] | undefined,
  normalizedBaseDomain: string,
): ResolveHostResult {
  // Dizi (çoklu `Host` başlığı) KASITLI OLARAK tek bir değere İNDİRİLMEZ —
  // ilk değer SEÇİLMEZ, direkt çözümsüz (K-A4).
  if (Array.isArray(rawHostHeader)) {
    return { kind: 'unresolved', reason: 'multiple_host_headers' }
  }

  const rawHost = rawHostHeader

  if (rawHost === undefined || rawHost.length === 0) {
    return { kind: 'unresolved', reason: 'missing_host' }
  }

  if (rawHost.length > MAX_HOST_HEADER_LENGTH) {
    return { kind: 'unresolved', reason: 'unparsable_host' }
  }

  const host = normalizeHostname(rawHost)

  if (host === undefined) {
    return { kind: 'unresolved', reason: 'unparsable_host' }
  }

  if (host === normalizedBaseDomain) {
    return { kind: 'unresolved', reason: 'bare_base_domain' }
  }

  const subdomainSuffix = `.${normalizedBaseDomain}`

  if (!host.endsWith(subdomainSuffix)) {
    // Taban alan adıyla İLİŞKİSİZ (ya da ondan türemeyen) her host buraya
    // düşer — ÖZEL ALAN ADI dalı, HATA DEĞİL (K-A4 "eşleşme yoksa").
    return { kind: 'custom-domain', host }
  }

  const label = host.slice(0, host.length - subdomainSuffix.length)

  if (label.length === 0) {
    // `.arkesoft.localhost` gibi bir host: taban alan adı SONEKİYLE eşleşir
    // ama GERİYE hiçbir etiket KALMAZ — ne çıplak taban alan adı (adım 3) ne
    // geçerli bir alt alan adı.
    return { kind: 'unresolved', reason: 'base_domain_mismatch' }
  }

  if (label.includes('.')) {
    // `a.demo-magaza.arkesoft.localhost` — İÇ İÇE alt alan adı desteklenmez.
    return { kind: 'unresolved', reason: 'nested_subdomain' }
  }

  if (RESERVED_SUBDOMAINS.has(label)) {
    return { kind: 'unresolved', reason: 'reserved_subdomain' }
  }

  if (!SLUG_PATTERN.test(label)) {
    return { kind: 'unresolved', reason: 'invalid_slug_format' }
  }

  return { kind: 'subdomain', slug: label }
}

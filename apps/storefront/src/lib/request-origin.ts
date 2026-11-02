// @arkesoft/storefront — resolveRequestOrigin (ROADMAP v0.0.8, T-009/S6,
// architect K20)
//
// `robots.txt`, `sitemap.xml`, `<link rel="canonical">`, `og:url` — orijin
// üreten TEK yer burasıdır; tüketiciler BAŞKA bir yerde orijin TÜRETMEZ.
//
// ⚠ `X-Forwarded-Proto` OKUNMAZ — `@arkesoft/tenancy/resolve-host.ts`'in
// `X-Forwarded-Host` okumama gerekçesiyle BİREBİR AYNI: güvenilir bir vekil
// (reverse proxy) allowlist'i v0.18.0'a kadar YOK. Bu başlığa güvenmek,
// `Host` başlığından BAĞIMSIZ bir şema beyanına izin verir.
//
// ⚠ Bu dosya `env`/`storefrontEnv` OKUMAZ, `primaryDomain` OKUMAZ,
// `APP_BASE_DOMAIN`'i orijin olarak KULLANMAZ (mekanik pin: bu dosyada
// `process.env`/`storefrontEnv` eşleşmesi SIFIR). Orijin HER ZAMAN istek
// başına çözülen kiracı host'undan (`normalizedHost`, çağıranın K21 adım
// 4'te ürettiği değer) türer — sabit bir taban alan adından DEĞİL.
//
// `requestUrl.host`/`.hostname` OKUNMAZ (UYARI 1 — Astro 7.4.2'de bu alanlar
// `Host` başlığını YOK SAYIP `localhost:<port>`'a düşer); `requestUrl.port`
// GÜVENİLİRDİR çünkü bu düşüş değeri de GERÇEK dinleme portunu taşır
// (`astro/dist/core/app/node.js`: `fallbackHostname = localhost:${serverPort}`).

/**
 * `requestUrl`'in ŞEMASI + PORTU ile `normalizedHost`'u (host çözümünden
 * gelen, `Host` başlığı kaynaklı değer) birleştirip kanonik orijini üretir.
 */
export function resolveRequestOrigin(requestUrl: URL, normalizedHost: string): string {
  const portSuffix = requestUrl.port.length > 0 ? `:${requestUrl.port}` : ''
  return `${requestUrl.protocol}//${normalizedHost}${portSuffix}`
}

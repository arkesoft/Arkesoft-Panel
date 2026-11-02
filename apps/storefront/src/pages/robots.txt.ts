// @arkesoft/storefront — `robots.txt` SSR ucu (ROADMAP v0.0.8, T-009/S6,
// architect "Sayfalar ve uçlar")
//
// AC14/AC15 (bağlayıcı): `Sitemap:` satırı İSTEK HOST'UNU taşır — orijin
// `src/middleware.ts`'in `locals.tenant.origin`'inden (K20'nin TEK türetme
// noktasının çıktısı) gelir, `APP_BASE_DOMAIN`/`primaryDomain` BURADA
// OKUNMAZ. Bilinmeyen host'ta bu uca HİÇ ULAŞILMAZ — `src/middleware.ts`
// `unresolved`/API hatası durumunda `next()`'i hiç çağırmaz, bu rota HİÇ
// render EDİLMEZ (AC15, mekanizma TEK yetki noktasında).
//
// `locals.tenant` bu yüzden HER ZAMAN `resolved`dir; `requireResolvedTenant`
// yine de AÇIKÇA çağrılır (savunma — çağıran hatası sessizce yutulmaz).
import type { APIRoute } from 'astro'

import { requireResolvedTenant } from '../lib/storefront-tenant-context.js'

export const GET: APIRoute = ({ locals }) => {
  const tenant = requireResolvedTenant(locals.tenant)
  const body = ['User-agent: *', 'Allow: /', `Sitemap: ${tenant.origin}/sitemap.xml`, ''].join('\n')

  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

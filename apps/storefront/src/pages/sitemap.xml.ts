// @arkesoft/storefront — `sitemap.xml` SSR ucu (ROADMAP v0.0.8, T-009/S6,
// architect "Sayfalar ve uçlar")
//
// Geçerli bir `<urlset>`, TAM OLARAK bir `<url>` → `{origin}/` (bu sürümde
// başka sayfa yok — katalog/ürün listesi kapsam dışı, v0.1.x). AC15 ve
// orijin kaynağı için bkz. `robots.txt.ts`'in dosya başı yorumu (BİREBİR
// aynı gerekçe).
import type { APIRoute } from 'astro'

import { requireResolvedTenant } from '../lib/storefront-tenant-context.js'

export const GET: APIRoute = ({ locals }) => {
  const tenant = requireResolvedTenant(locals.tenant)
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${tenant.origin}/</loc>`,
    '  </url>',
    '</urlset>',
    '',
  ].join('\n')

  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } })
}

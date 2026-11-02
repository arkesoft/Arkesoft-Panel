// @arkesoft/storefront — cache-policy.ts testleri (ROADMAP v0.0.8, T-009/S6,
// DoD "önbellek politikası — altı yanıt sınıfı")
//
// `applyStorefrontCachePolicy` KOŞULSUZ bir atama — hiçbir "sınıf" dallanması
// İÇERMEZ (dosya başı yorumu: "istisna listesi yok"). Bu yüzden altı yanıt
// sınıfının (kiracı 200 · 404 · 503 · robots.txt · sitemap.xml · `/_astro/*`)
// HER BİRİ, o sınıfı TEMSİL EDEN bir `Headers` nesnesiyle AYRI AYRI ölçülür —
// fonksiyonun "hangi içerik türü/duruma bakmadan" aynı başlığı yazdığını
// kanıtlar. `/_astro/*` sınıfı için RİSKLER'de not edilen üretim istisnası
// (Astro Node standalone adaptörünün statik dosya sunucusu bu isteği
// `src/middleware.ts`'e HİÇ ULAŞTIRMAZ) burada YOKTUR — bu test yalnızca
// fonksiyonun KENDİSİNİN o sınıf için de koşulsuz davrandığını kanıtlar.
import { describe, expect, it } from 'vitest'

import { applyStorefrontCachePolicy, STOREFRONT_CACHE_CONTROL } from '../cache-policy.js'

describe('applyStorefrontCachePolicy', () => {
  it('sabit, "private, no-store" değerini taşır', () => {
    expect(STOREFRONT_CACHE_CONTROL).toBe('private, no-store')
  })

  it.each([
    ['kiracı sayfası (200)', 'text/html; charset=utf-8'],
    ['mağaza bulunamadı (404)', 'text/html; charset=utf-8'],
    ['mağaza ulaşılamıyor (503)', 'text/html; charset=utf-8'],
    ['robots.txt', 'text/plain; charset=utf-8'],
    ['sitemap.xml', 'application/xml; charset=utf-8'],
    ['/_astro/* varlığı', 'text/css; charset=utf-8'],
  ])(
    '%s sınıfını temsil eden yanıtta cache-control: private, no-store yazar',
    (_label, contentType) => {
      const headers = new Headers({ 'content-type': contentType })

      applyStorefrontCachePolicy(headers)

      expect(headers.get('cache-control')).toBe('private, no-store')
    },
  )

  it('Vary başlığı YAZMAZ', () => {
    const headers = new Headers()

    applyStorefrontCachePolicy(headers)

    expect(headers.get('vary')).toBeNull()
  })

  it('zaten bir cache-control değeri olan başlıkların üzerine YAZAR (koşulsuz)', () => {
    const headers = new Headers({ 'cache-control': 'public, max-age=31536000, immutable' })

    applyStorefrontCachePolicy(headers)

    expect(headers.get('cache-control')).toBe('private, no-store')
  })
})

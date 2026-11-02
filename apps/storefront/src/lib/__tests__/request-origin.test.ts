// @arkesoft/storefront — request-origin.ts testleri (ROADMAP v0.0.8,
// T-009/S6, DoD "origin türetmesi — iki farklı host → iki farklı çıktı")
//
// Bu modül `process.env` OKUMAZ — statik `import` güvenlidir.
import { describe, expect, it } from 'vitest'

import { resolveRequestOrigin } from '../request-origin.js'

describe('resolveRequestOrigin', () => {
  it('http şemasını ve portu requestUrl üzerinden korur', () => {
    const origin = resolveRequestOrigin(
      new URL('http://localhost:4321/herhangi-bir-yol'),
      'demo.arkesoft.localhost',
    )

    expect(origin).toBe('http://demo.arkesoft.localhost:4321')
  })

  it('port belirtilmemişse (varsayılan şema portu) ":port" eklemez', () => {
    const origin = resolveRequestOrigin(new URL('https://localhost/'), 'musteri.com')

    expect(origin).toBe('https://musteri.com')
  })

  it('iki farklı normalizedHost İKİ FARKLI orijin üretir (sabit taban alan adına düşmez)', () => {
    const requestUrl = new URL('http://localhost:4321/')

    const first = resolveRequestOrigin(requestUrl, 'demo.arkesoft.localhost')
    const second = resolveRequestOrigin(requestUrl, 'musteri-magazasi.com')

    expect(first).toBe('http://demo.arkesoft.localhost:4321')
    expect(second).toBe('http://musteri-magazasi.com:4321')
    expect(first).not.toBe(second)
  })

  it('requestUrl.host/.hostname OKUNMAZ — yalnızca protocol + port kullanılır (UYARI 1)', () => {
    // `new URL('http://localhost:4321/...')`'in host'u KASITLI olarak
    // `normalizedHost` parametresinden FARKLI — çıktı yalnızca VERİLEN
    // `normalizedHost`'u taşımalı, requestUrl'in kendi host'unu DEĞİL.
    const origin = resolveRequestOrigin(
      new URL('http://baska-bir-host.example:9999/yol'),
      'demo.arkesoft.localhost',
    )

    expect(origin).toBe('http://demo.arkesoft.localhost:9999')
    expect(origin).not.toContain('baska-bir-host.example')
  })
})

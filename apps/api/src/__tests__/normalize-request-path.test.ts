// @arkesoft/api — normalizeRequestPath / matchesPrefixOrUnparsablePercentEncoding
// birim testleri (T-021 FIX turu 1, madde F1/F2 — security tur1, `high`)
//
// Kök neden: `normalizeRequestPath` ÖNCEDEN `new URL(...).pathname`
// kullanıyordu — WHATWG URL yüzde-kodlamayı (`%2E` → `.`) ÇÖZMEZ. tRPC'nin
// `resolveResponse.ts:241`i `decodeURIComponent(opts.path)` ile ÇÖZER;
// iki katman AYNI yolu FARKLI görüyordu (F1: `PlatformAdminIpGuard`'ın
// önek testi; F2: `resolveRateLimitPolicy`'nin TAM EŞLEŞMESİ) — kanıt
// zinciri `docs/gates/T-021-security-tur1.md` §1.

import { describe, expect, it } from 'vitest'

import {
  matchesPrefixOrUnparsablePercentEncoding,
  normalizeRequestPath,
} from '../http/normalize-request-path.js'

describe('normalizeRequestPath — yüzde-kodlama tRPC ile BİREBİR aynı şekilde ÇÖZÜLÜR', () => {
  it('kodlanmamış yol DEĞİŞMEDEN döner', () => {
    expect(normalizeRequestPath('/trpc/platform.tenantList')).toBe('/trpc/platform.tenantList')
  })

  it('%2E (büyük harf) "." olarak ÇÖZÜLÜR', () => {
    expect(normalizeRequestPath('/trpc/platform%2EtenantList')).toBe('/trpc/platform.tenantList')
  })

  it('%2e (küçük harf) "." olarak ÇÖZÜLÜR — hex büyük/küçük harf DUYARSIZ', () => {
    expect(normalizeRequestPath('/trpc/platform%2etenantList')).toBe('/trpc/platform.tenantList')
  })

  it("sorgu dizesi decode'a KARIŞMAZ (query string ayrı ayrıştırılır)", () => {
    expect(normalizeRequestPath('/trpc/platform.session?input=%7B%7D')).toBe(
      '/trpc/platform.session',
    )
  })

  it('sondaki "/" decode SONRASINDA soyulur', () => {
    expect(normalizeRequestPath('/trpc/platform%2EtenantList/')).toBe('/trpc/platform.tenantList')
  })

  // ⚠⚠ BOZUK KODLAMA (`%ZZ`) — `decodeURIComponent` FIRLAR. Bu fonksiyon
  // sessizce HAM (çözülmemiş) pathname'e düşer — TAM EŞLEŞMELİ tüketiciler
  // (exempt kümeleri, rota haritaları) için güvenli varsayılan: ham, `%`
  // taşıyan bir yol hiçbir TEMİZ literalle eşleşmez (dosya başı GÜNCELLEME
  // yorumuna bkz, `http/normalize-request-path.ts`).
  it("bozuk yüzde dizisi (%ZZ) FIRLATMAZ, ham pathname'e düşer", () => {
    expect(normalizeRequestPath('/trpc/platform%ZZtenantList')).toBe('/trpc/platform%ZZtenantList')
  })

  it('bozuk yüzde dizisi ham literalle hiçbir TEMİZ yolla eşleşmez (dolaylı kanıt)', () => {
    expect(normalizeRequestPath('/trpc/platform%ZZtenantList')).not.toBe(
      '/trpc/platform.tenantList',
    )
  })

  // T-021 FIX turu 3 (security tur2, F1-TUR2/F2-TUR2, `high`) — NEGATİF
  // REGRESYON: `/trpc` MOUNT segmenti Express'in `case sensitive routing`
  // ayarı KAPALI olduğu için büyük/küçük harf DUYARSIZ eşleşiyordu
  // (`@All('trpc/*path')` `/TRPC/...`'i de ÇALIŞTIRIYORDU) ama bu fonksiyon
  // önceden mount önekini KANONİKLEŞTİRMİYORDU. Üç varyantın (dosya başı
  // GÜNCELLEME yorumu) ÜÇÜ DE artık AYNI küçük harfli mount önekine
  // indirgenmeli — prosedür adı (`platform.tenantList`) DEĞİŞMEDEN kalır.
  it.each(['/TRPC/platform.tenantList', '/Trpc/platform.tenantList', '/tRpC/platform.tenantList'])(
    '%s → mount öneki küçük harfe KANONİKLEŞİR, prosedür adı DEĞİŞMEZ (F1-TUR2/F2-TUR2 regresyonu)',
    (url) => {
      expect(normalizeRequestPath(url)).toBe('/trpc/platform.tenantList')
    },
  )

  // Vacuous DEĞİL — mount öneki OLMAYAN bir büyük/küçük harf varyantı
  // (örn. prosedür adının İÇİNDEKİ harfler) DEĞİŞTİRİLMEMELİ.
  it('mount öneki DIŞINDAKİ büyük/küçük harf DEĞİŞMEZ', () => {
    expect(normalizeRequestPath('/trpc/Platform.TenantList')).toBe('/trpc/Platform.TenantList')
  })

  // Sınır kontrolü — `/trpcX/...` gibi bitişik bir segment YANLIŞLIKLA
  // "mount önekiyle eşleşti" sayılmamalı (önek GENİŞLEMEDİ).
  it("'/trpcX/...' mount öneki SAYILMAZ (sınır kontrolü)", () => {
    expect(normalizeRequestPath('/TRPCX/foo')).toBe('/TRPCX/foo')
  })
})

describe('matchesPrefixOrUnparsablePercentEncoding — ÖNEK testi için TUTUCU varsayılan', () => {
  it('kodlanmamış yol öneke uyuyorsa true', () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/platform.tenantList', '/trpc/platform.'),
    ).toBe(true)
  })

  it('kodlanmamış yol öneke UYMUYORSA false (vacuous DEĞİL)', () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/tenant.current', '/trpc/platform.'),
    ).toBe(false)
  })

  it("%2E ÇÖZÜLÜR ve öneke UYAR → true (F1'in asıl düzeltmesi)", () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/platform%2EtenantList', '/trpc/platform.'),
    ).toBe(true)
  })

  it('%2e (küçük harf) de ÇÖZÜLÜR ve öneke UYAR → true', () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/platform%2etenantList', '/trpc/platform.'),
    ).toBe(true)
  })

  // ⚠⚠ BOZUK KODLAMA — "kapsamda say" (security tur1'in AÇIK şartı):
  // `normalizeRequestPath`'in TERSİNE, bu fonksiyon bozuk kodlamada `true`
  // döner çünkü ÖNEK testinin "eşleşmeme" varsayılanı GÜVENSİZDİR (guard'ı
  // ATLAR).
  it("bozuk yüzde dizisi (%ZZ) → true (tutucu, guard'ı ATLAMAZ)", () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/platform%ZZtenantList', '/trpc/platform.'),
    ).toBe(true)
  })

  it("önek GENİŞLEMEDİ — kapsam dışı bir namespace'in kodlanmış hâli de kapsam dışı kalır", () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/platformX%2Efoo', '/trpc/platform.'),
    ).toBe(false)
  })

  // T-021 FIX turu 3 (security tur2, F1-TUR2, `high`) — NEGATİF REGRESYON:
  // `isPlatformAdminGuardedPath`'in TEK üretim tüketicisi bu fonksiyondur.
  // Üç varyant ÖNCEDEN `false` dönüyordu (guard ANINDA `true`, üç
  // fail-closed dalın HİÇBİRİ değerlendirilmiyordu) — kanıt zinciri
  // `docs/gates/T-021-security-tur2.md` §1(d). Düzeltmeden SONRA üçü de
  // KAPSAMDA sayılmalı.
  it.each(['/TRPC/platform.tenantList', '/Trpc/platform.tenantList', '/tRpC/platform.tenantList'])(
    "%s → ARTIK öneke UYAR (F1-TUR2 regresyonu, guard'ı ATLAMAZ)",
    (url) => {
      expect(matchesPrefixOrUnparsablePercentEncoding(url, '/trpc/platform.')).toBe(true)
    },
  )

  // Vacuous DEĞİL — kapsam DIŞI bir namespace'in MOUNT öneki büyük/küçük
  // harf varyantı da kapsam DIŞI kalmalı (önek GENİŞLEMEDİ).
  it('/TRPC/tenant.current KAPSAM DIŞIDIR (mount öneki değişti, namespace değişmedi)', () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/TRPC/tenant.current', '/trpc/platform.'),
    ).toBe(false)
  })
})

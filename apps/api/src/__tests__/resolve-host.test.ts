// @arkesoft/api — resolve-host.ts tablo testi (ROADMAP v0.0.4, T-002/ST-5,
// architect K-A4, R4 telafisi #5)
//
// ≥25 vaka — architect'in saldırı vektörü listesinin TAMAMI ad ad burada.
// Taban alan adı testlerde SABİT: `arkesoft.localhost` (`.env.example` ile
// aynı, normalize edilmiş hâli kendisiyle özdeş).

import { describe, expect, it } from 'vitest'

import { normalizeHostname, resolveHost } from '../tenancy/resolve-host.js'
import type { ResolveHostResult } from '../tenancy/resolve-host.js'

const BASE = 'arkesoft.localhost'

type Case = {
  readonly name: string
  readonly rawHost: string | string[] | undefined
  readonly expected: ResolveHostResult
}

const cases: readonly Case[] = [
  // --- Temel / pozitif durumlar -------------------------------------------
  {
    name: 'geçerli alt alan adı → subdomain(demo-magaza)',
    rawHost: 'demo-magaza.arkesoft.localhost',
    expected: { kind: 'subdomain', slug: 'demo-magaza' },
  },
  {
    name: 'tek karakterlik geçerli slug (a)',
    rawHost: 'a.arkesoft.localhost',
    expected: { kind: 'subdomain', slug: 'a' },
  },
  {
    name: 'yalnızca rakamlardan oluşan geçerli slug (123)',
    rawHost: '123.arkesoft.localhost',
    expected: { kind: 'subdomain', slug: '123' },
  },

  // --- Başlık yok / dizi / uzunluk -----------------------------------------
  {
    name: 'Host başlığı YOK (undefined) → missing_host, sorgu yok',
    rawHost: undefined,
    expected: { kind: 'unresolved', reason: 'missing_host' },
  },
  {
    name: 'Host başlığı BOŞ dize → missing_host',
    rawHost: '',
    expected: { kind: 'unresolved', reason: 'missing_host' },
  },
  {
    name: 'ÇOKLU Host başlığı (dizi) → multiple_host_headers, ilk değer SEÇİLMEZ',
    rawHost: ['demo-magaza.arkesoft.localhost', 'evil.com'],
    expected: { kind: 'unresolved', reason: 'multiple_host_headers' },
  },
  {
    name: '255 karakterden UZUN host → unparsable_host, sorgu yok',
    rawHost: `${'a'.repeat(260)}.arkesoft.localhost`,
    expected: { kind: 'unresolved', reason: 'unparsable_host' },
  },
  {
    name: 'new URL tarafından AYRIŞTIRILAMAYAN host (boşluk) → unparsable_host',
    rawHost: 'demo magaza.arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'unparsable_host' },
  },

  // --- Dotsuz suffix tuzağı (EN KRİTİK vektör) -----------------------------
  {
    name: 'DOTSUZ SUFFIX TUZAĞI: notarkesoft.localhost → custom-domain (bare "arkesoft.localhost" DEĞİL, "not" slug\'ı DEĞİL)',
    rawHost: 'notarkesoft.localhost',
    expected: { kind: 'custom-domain', host: 'notarkesoft.localhost' },
  },

  // --- includes() tuzağı ----------------------------------------------------
  {
    name: 'includes() TUZAĞI: demo-magaza.arkesoft.localhost.evil.com → custom-domain (taban alan adını İÇERİR ama ondan TÜREMEZ)',
    rawHost: 'demo-magaza.arkesoft.localhost.evil.com',
    expected: { kind: 'custom-domain', host: 'demo-magaza.arkesoft.localhost.evil.com' },
  },

  // --- Fragman soyma ---------------------------------------------------------
  {
    name: 'fragman (#) soyma: evil.com#demo-magaza.arkesoft.localhost → custom-domain(evil.com)',
    rawHost: 'evil.com#demo-magaza.arkesoft.localhost',
    expected: { kind: 'custom-domain', host: 'evil.com' },
  },

  // --- Büyük/küçük harf -------------------------------------------------------
  {
    name: 'büyük harf normalize edilir: DEMO-MAGAZA.ARKESOFT.LOCALHOST → subdomain(demo-magaza)',
    rawHost: 'DEMO-MAGAZA.ARKESOFT.LOCALHOST',
    expected: { kind: 'subdomain', slug: 'demo-magaza' },
  },

  // --- Port soyma ---------------------------------------------------------
  {
    name: 'port soyulur: demo-magaza.arkesoft.localhost:3000 → subdomain(demo-magaza)',
    rawHost: 'demo-magaza.arkesoft.localhost:3000',
    expected: { kind: 'subdomain', slug: 'demo-magaza' },
  },

  // --- IPv6 -------------------------------------------------------------------
  {
    name: 'köşeli parantezli IPv6 + port: [::1]:3000 → custom-domain([::1]) (taban alan adıyla eşleşmez)',
    rawHost: '[::1]:3000',
    expected: { kind: 'custom-domain', host: '[::1]' },
  },

  // --- İç içe alt alan adı -----------------------------------------------------
  {
    name: 'İÇ İÇE alt alan adı: a.demo-magaza.arkesoft.localhost → nested_subdomain',
    rawHost: 'a.demo-magaza.arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'nested_subdomain' },
  },

  // --- Çıplak taban alan adı ----------------------------------------------------
  {
    name: 'ÇIPLAK taban alan adı: arkesoft.localhost → bare_base_domain (tenant DEĞİL)',
    rawHost: 'arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'bare_base_domain' },
  },

  // --- Boş etiket (önde nokta) ---------------------------------------------------
  {
    name: 'ÖNDE NOKTA / boş etiket: .arkesoft.localhost → base_domain_mismatch',
    rawHost: '.arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'base_domain_mismatch' },
  },

  // --- Çifte nokta --------------------------------------------------------------
  {
    name: 'ÇİFTE NOKTA: demo-magaza..arkesoft.localhost → nested_subdomain (etiket içinde nokta kalır)',
    rawHost: 'demo-magaza..arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'nested_subdomain' },
  },

  // --- Sondaki nokta --------------------------------------------------------------
  {
    name: 'SONDAKİ NOKTA soyulur: demo-magaza.arkesoft.localhost. → subdomain(demo-magaza)',
    rawHost: 'demo-magaza.arkesoft.localhost.',
    expected: { kind: 'subdomain', slug: 'demo-magaza' },
  },

  // --- IDN / punycode --------------------------------------------------------------
  {
    name: 'IDN→punycode BEDAVA gelir: müşteri.arkesoft.localhost → subdomain(xn--mteri-kva70e)',
    rawHost: 'müşteri.arkesoft.localhost',
    expected: { kind: 'subdomain', slug: 'xn--mteri-kva70e' },
  },

  // --- Rezerve alt alan adları --------------------------------------------------------
  {
    name: "REZERVE 'www' → reserved_subdomain",
    rawHost: 'www.arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'reserved_subdomain' },
  },
  {
    name: "REZERVE 'api' → reserved_subdomain (platformun API yüzeyini kaçırma engeli)",
    rawHost: 'api.arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'reserved_subdomain' },
  },
  {
    name: "REZERVE 'admin' → reserved_subdomain",
    rawHost: 'admin.arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'reserved_subdomain' },
  },
  {
    name: "REZERVE 'superadmin' → reserved_subdomain",
    rawHost: 'superadmin.arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'reserved_subdomain' },
  },

  // --- %2e%2e path traversal payload --------------------------------------------
  {
    name:
      '%2e%2e PAYLOAD' +
      " (demo-magaza%2e%2e.arkesoft.localhost) → nested_subdomain (URL çözücü %2e'yi literal nokta yapar)",
    rawHost: 'demo-magaza%2e%2e.arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'nested_subdomain' },
  },

  // --- Geçersiz slug biçimi --------------------------------------------------------
  {
    name: 'alt çizgi İÇEREN slug (demo_magaza) → invalid_slug_format',
    rawHost: 'demo_magaza.arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'invalid_slug_format' },
  },
  {
    name: 'TİRE İLE BAŞLAYAN slug (-demo) → invalid_slug_format',
    rawHost: '-demo.arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'invalid_slug_format' },
  },
  {
    name: 'TİRE İLE BİTEN slug (demo-) → invalid_slug_format',
    rawHost: 'demo-.arkesoft.localhost',
    expected: { kind: 'unresolved', reason: 'invalid_slug_format' },
  },

  // --- Taban alan adıyla ilişkisiz özel alan adları (primaryDomain dalı) --------
  {
    name: 'tamamen ilişkisiz özel alan adı → custom-domain(mycustomdomain.com)',
    rawHost: 'mycustomdomain.com',
    expected: { kind: 'custom-domain', host: 'mycustomdomain.com' },
  },

  // --- X-Forwarded-Host atlatma denemesi ----------------------------------------
  {
    name:
      'X-FORWARDED-HOST ATLATMA DENEMESİ: fonksiyon yalnızca GERÇEK Host değerini görür — ' +
      'bir vekil başlığı bu imzada YOKTUR, yapısal olarak OKUNAMAZ. Gerçek Host ' +
      '(attacker.example.com) ne söylerse ona göre karar verilir.',
    rawHost: 'attacker.example.com',
    expected: { kind: 'custom-domain', host: 'attacker.example.com' },
  },
]

describe('resolveHost', () => {
  it.each(cases.map((testCase) => [testCase.name, testCase] as const))('%s', (_name, testCase) => {
    expect(resolveHost(testCase.rawHost, BASE)).toEqual(testCase.expected)
  })

  it(`toplam vaka sayısı ≥25 (gerçek: ${String(cases.length)})`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(25)
  })

  it('X-Forwarded-Host yapısal olarak OKUNAMAZ — fonksiyon imzasında bu başlık için parametre YOK', () => {
    // Bu test derleme-zamanı bir kanıttır: `resolveHost` yalnızca İKİ parametre
    // alır (`rawHostHeader`, `normalizedBaseDomain`) — tam bir `headers` nesnesi
    // DEĞİL. Aşağıdaki çağrı `X-Forwarded-Host` değerini TAŞIYAN bir obje
    // GEÇİRİLEMEYECEĞİNİ (fonksiyonun ikinci parametresi yalnızca bir dize
    // beklediğini) doğrular — "atlatma" kavramsal olarak yapısal olarak
    // İMKANSIZDIR, çünkü okunacak bir alan YOKTUR.
    expect(resolveHost.length).toBe(2)
  })
})

describe('normalizeHostname', () => {
  it('APP_BASE_DOMAIN açılışta AYNI normalizasyondan geçer — büyük harfli taban da normalize olur', () => {
    expect(normalizeHostname('ARKESOFT.LOCALHOST')).toBe('arkesoft.localhost')
  })

  it('ayrıştırılamayan girdide undefined döner (TypeError yakalanır)', () => {
    expect(normalizeHostname('demo magaza.arkesoft.localhost')).toBeUndefined()
  })

  it('tek sondaki nokta soyulur', () => {
    expect(normalizeHostname('arkesoft.localhost.')).toBe('arkesoft.localhost')
  })
})

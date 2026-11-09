// @arkesoft/api — AUTH_OWN_PATHS testleri + ÜÇÜNCÜ kesişim testi (ROADMAP
// v0.0.5, T-006/S6, architect "TENANT İZOLASYONU" → "İKİ KÜME AYRI KALIR",
// AC9 bağlayıcı)
//
// Bu dosyanın ÜÇÜNCÜ bloğu PM R3'ün bağlayıcı testidir:
// `AUTH_DELEGATED_PATHS ∪ AUTH_OWN_PATHS ⊆ TENANT_EXEMPT_PATHS` — test
// dosyası HER ÜÇ kümeyi (`auth-delegated-paths.ts`, `auth-own-paths.ts`,
// `tenancy/tenant-exempt-paths.ts`) import EDEREK karşılaştırır; ÜRETİM
// KODUNDA bu import YOKTUR (`auth-exempt-paths.ts`/`auth-own-paths.ts`/
// `tenant-exempt-paths.ts` birbirine literal yazar, import ETMEZ) — bu
// BAĞIMSIZLIK mekanik olarak `apps/api/src/tenancy/**` dosyalarının HAM
// metninde `from '../auth/` DİZESİ aranarak AYRICA doğrulanır (üretim
// kodunda `tenancy → auth` bağımlılığı YOKTUR kanıtı, BU dosyada — üretim
// kodunda DEĞİL). Node'un KENDİ `fs` API'si kullanılır — harici `grep`
// süreci ÇAĞRILMAZ (test çalıştırıcısının `PATH`'i her ortamda `grep`
// ikilisini İÇERMEYEBİLİR; `fs` taraması hem daha TAŞINABİLİR hem de ek bir
// süreç/kabuk katmanı AÇMAZ).
//
// GÜNCELLEME (ROADMAP v0.0.15, T-016/S5): DÖRDÜNCÜ test BLOĞU v0.0.5'teki
// (o anda doğru olan) "`AUTH_EXEMPT_PATHS`'in `/auth/` alt kümesi
// `AUTH_DELEGATED_PATHS`'in TAMAMIYLA birebir eşittir" invariant'ını
// taşıyordu — v0.0.15'in dört yeni `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`
// üyesi (kimlik GEREKTİREN ama delege EDİLEN yol) bu invariant'ı YANLIŞ
// hâle getirdi (`auth-exempt-paths.ts` dosya başı GÜNCELLEME paragrafı).
// DÖRDÜNCÜ test bu alt görevde SIKILAŞTIRILMIŞ invariant'a GÜNCELLENDİ;
// BEŞİNCİ test BLOĞU bu alt görevin ASIL ÜRÜNÜ — üç kümenin (`AUTH_
// DELEGATED_PATHS`, `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`, `AUTH_
// EXEMPT_PATHS`) YAPISAL partition'ını (alt küme/ayrıklık/tam örtüşme) tam
// çıktı assert'iyle (ADR-0014 — `toContain` DEĞİL, `arrayContaining` +
// UZUNLUK, `rollback-auth-role.isolation.test.ts:232-233`'ün deseni) VE
// yakın-ıska sentetik verilerle (gerçek yol DEĞİL, bir karakter/metot farklı
// dizeler) sabitler.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS,
  AUTH_DELEGATED_PATHS,
  isAuthDelegatedPath,
} from '../auth/auth-delegated-paths.js'
import { AUTH_EXEMPT_PATHS, isAuthExemptPath } from '../auth/auth-exempt-paths.js'
import { AUTH_OWN_PATHS, isAuthOwnPath } from '../auth/auth-own-paths.js'
import { TENANT_EXEMPT_PATHS } from '../tenancy/tenant-exempt-paths.js'

const EXPECTED_OWN_PATHS = [
  '/auth/sessions',
  '/auth/sessions/revoke',
  '/auth/sessions/revoke-all',
] as const

describe('AUTH_OWN_PATHS', () => {
  it('tam olarak üç eleman taşır', () => {
    expect(AUTH_OWN_PATHS.size).toBe(3)
  })

  it('küme TAM OLARAK beklenen üç elemandır', () => {
    expect(new Set(AUTH_OWN_PATHS)).toEqual(new Set(EXPECTED_OWN_PATHS))
  })

  it.each(EXPECTED_OWN_PATHS)('%s tam eşleşmeyle kendi ucumuzdur', (path) => {
    expect(isAuthOwnPath(path)).toBe(true)
  })

  it('prefix eşleşmesi YASAK — /auth/sessions/x kendi ucumuz değildir', () => {
    expect(isAuthOwnPath('/auth/sessions/x')).toBe(false)
  })

  it('/auth/sign-in/email AUTH_OWN_PATHS değildir (delege yol, iki küme ayrımı)', () => {
    expect(isAuthOwnPath('/auth/sign-in/email')).toBe(false)
  })
})

/** `'METHOD /path'` biçimindeki literalden yalnızca yol kısmını çıkarır. */
function extractPath(methodAndPath: string): string {
  const spaceIndex = methodAndPath.indexOf(' ')
  return methodAndPath.slice(spaceIndex + 1)
}

describe('ÜÇÜNCÜ test (PM R3, bağlayıcı) — AUTH_DELEGATED_PATHS ∪ AUTH_OWN_PATHS ⊆ TENANT_EXEMPT_PATHS', () => {
  it('AUTH_DELEGATED_PATHS içindeki her yolun (yöntem hariç) TENANT_EXEMPT_PATHS üyesi olduğu', () => {
    for (const methodAndPath of AUTH_DELEGATED_PATHS) {
      const path = extractPath(methodAndPath)
      expect(TENANT_EXEMPT_PATHS.has(path), `${path} TENANT_EXEMPT_PATHS'te yok`).toBe(true)
    }
  })

  it('AUTH_OWN_PATHS içindeki her yolun TENANT_EXEMPT_PATHS üyesi olduğu', () => {
    for (const path of AUTH_OWN_PATHS) {
      expect(TENANT_EXEMPT_PATHS.has(path), `${path} TENANT_EXEMPT_PATHS'te yok`).toBe(true)
    }
  })

  it('AUTH_OWN_PATHS içindeki hiçbir yolun AUTH_EXEMPT_PATHS üyesi OLMADIĞI (kiracıdan muaf ≠ kimlikten muaf)', () => {
    for (const path of AUTH_OWN_PATHS) {
      expect(AUTH_EXEMPT_PATHS.has(path), `${path} YANLIŞLIKLA AUTH_EXEMPT_PATHS'te`).toBe(false)
    }
  })
})

// FIX turu 1, madde 8 (solid M-3, medium) — `auth-exempt-paths.ts`'in dosya
// başı yorumu VAR OLMAYAN bir mekanik garantiyi iddia ediyordu ("ÜÇÜNCÜ test
// bu yedi literalin AUTH_DELEGATED_PATHS'teki çiftlerle birebir örtüştüğünü
// doğrular" — yukarıdaki ÜÇÜNCÜ test blok BUNU YAPMAZ, yalnızca alt küme
// kontrolleri yapar). DÖRDÜNCÜ test EKLENDİ — gerçek mekanik garanti BURADA;
// `auth-exempt-paths.ts`'in yorumu BU test dosyasına/bloğuna atıfla
// düzeltildi.
//
// GÜNCELLEME (ROADMAP v0.0.15, T-016/S5) — invariant SIKILAŞTIRILDI (bkz.
// dosya başı GÜNCELLEME paragrafı): `AUTH_EXEMPT_PATHS`'in `/auth/` alt
// kümesi artık `AUTH_DELEGATED_PATHS`'in TAMAMIYLA DEĞİL, KİMLİK
// GEREKTİRMEYEN alt kümesiyle (`AUTH_DELEGATED_PATHS \
// AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`) birebir eşittir.
describe('DÖRDÜNCÜ test (solid M-3 + v0.0.15 sıkılaştırması, bağlayıcı) — AUTH_EXEMPT_PATHS ∩ /auth/* ≡ (AUTH_DELEGATED_PATHS \\ AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS) yol kümesi', () => {
  it("AUTH_EXEMPT_PATHS'in /auth/ önekli alt kümesi, AUTH_DELEGATED_PATHS'in KİMLİK GEREKTİRMEYEN alt kümesinin yol kümesiyle BİREBİR eşittir", () => {
    const exemptAuthPaths = new Set(
      [...AUTH_EXEMPT_PATHS].filter((path) => path.startsWith('/auth/')),
    )
    const identityNotRequiredDelegatedPaths = new Set(
      [...AUTH_DELEGATED_PATHS]
        .filter((methodAndPath) => !AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS.has(methodAndPath))
        .map(extractPath),
    )

    expect(exemptAuthPaths).toEqual(identityNotRequiredDelegatedPaths)
  })
})

// BEŞİNCİ test (ROADMAP v0.0.15, T-016/S5 — BU ALT GÖREVİN ASIL ÜRÜNÜ):
// `AUTH_DELEGATED_PATHS`, `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS` ve
// `AUTH_EXEMPT_PATHS`'in (yalnızca `/auth/` alt kümesi — vitrin/health
// elemanları bu partition'ın parçası DEĞİL) YAPISAL partition'ı: HER
// delege yol TAM OLARAK bir sınıfa aittir ("kimlik gerekir" XOR "kimlik
// gerekmez"), iki sınıf AYRIK, ikisinin BİRLEŞİMİ TÜM delege yolları
// kapsar. `toContain`/`.some()` KULLANILMAZ (ADR-0014) — `arrayContaining`
// + UZUNLUK (`rollback-auth-role.isolation.test.ts:232-233` deseni) HER
// assert'te bir ARADA, "beklenenlerin HEPSİ var" VE "beklenmeyen HİÇBİR ŞEY
// yok" sorularını BİRLİKTE yanıtlar.
describe('BEŞİNCİ test (v0.0.15, T-016/S5, bağlayıcı) — üç kümenin YAPISAL partition kanıtı', () => {
  const delegatedPaths = [...AUTH_DELEGATED_PATHS]
  const identityRequiredPaths = [...AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS]
  const identityNotRequiredPaths = delegatedPaths.filter(
    (methodAndPath) => !AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS.has(methodAndPath),
  )

  it('AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS ⊆ AUTH_DELEGATED_PATHS (alt küme)', () => {
    for (const methodAndPath of identityRequiredPaths) {
      expect(
        AUTH_DELEGATED_PATHS.has(methodAndPath),
        `${methodAndPath} AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS'TE ama AUTH_DELEGATED_PATHS'TE DEĞİL`,
      ).toBe(true)
    }
  })

  it('iki sınıf (kimlik gerekir / kimlik gerekmez) AYRIKTIR — kesişim BOŞ', () => {
    const intersection = identityRequiredPaths.filter((methodAndPath) =>
      identityNotRequiredPaths.includes(methodAndPath),
    )
    expect(intersection).toEqual([])
  })

  it("iki sınıfın BİRLEŞİMİ TAM OLARAK AUTH_DELEGATED_PATHS'TİR (her yol EN AZ bir sınıfa ait — tam örtüşme, fazlası/azı yok)", () => {
    const union = [...identityRequiredPaths, ...identityNotRequiredPaths]
    expect(union.length).toBe(delegatedPaths.length)
    expect(union).toEqual(expect.arrayContaining(delegatedPaths))
  })

  it('kimlik GEREKTİRMEYEN sınıfın TAMAMI isAuthExemptPath() ile TRUE, kimlik GEREKTİREN sınıfın TAMAMI FALSE döner (fonksiyon seviyesinde çapraz kontrol)', () => {
    const notRequiredResults = identityNotRequiredPaths.map((methodAndPath) =>
      isAuthExemptPath(extractPath(methodAndPath)),
    )
    const requiredResults = identityRequiredPaths.map((methodAndPath) =>
      isAuthExemptPath(extractPath(methodAndPath)),
    )

    expect(notRequiredResults).toEqual(identityNotRequiredPaths.map(() => true))
    expect(requiredResults).toEqual(identityRequiredPaths.map(() => false))
  })

  // YAKIN-IŞKA sentetik veri (ADR-0014) — GERÇEK bir yol DEĞİL, bir
  // karakter/metot farklı dizeler. Mekanizmanın (tam eşleşme, prefix/regex
  // YOK) yanlışlıkla "neredeyse doğru" bir girdiyi KABUL ETMEDİĞİNİ kanıtlar.
  it.each([
    // Gerçek: 'POST /auth/two-factor/enable' — metot farklı.
    'GET /auth/two-factor/enable',
    // Gerçek: 'POST /auth/two-factor/verify-totp' — sondaki '/' EKLENMİŞ.
    'POST /auth/two-factor/verify-totp/',
    // Gerçek: 'POST /auth/two-factor/disable' — büyük/küçük harf farklı.
    'POST /auth/two-factor/Disable',
    // Gerçek yolların HİÇBİRİ değil — tamamen icat edilmiş komşu bir uç.
    'POST /auth/two-factor/verify-sms',
  ])(
    'yakın-ıska "%s" NE AUTH_DELEGATED_PATHS\'TE NE AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS\'TE var (fail-closed, tam eşleşme)',
    (nearMissMethodAndPath) => {
      expect(AUTH_DELEGATED_PATHS.has(nearMissMethodAndPath)).toBe(false)
      expect(AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS.has(nearMissMethodAndPath)).toBe(false)
    },
  )

  it('isAuthDelegatedPath() yakın-ıska girdilerde de FALSE döner (saf fonksiyon seviyesinde AYNI kanıt)', () => {
    expect(isAuthDelegatedPath('GET', '/auth/two-factor/enable')).toBe(false)
    expect(isAuthDelegatedPath('POST', '/auth/two-factor/Disable')).toBe(false)
    expect(isAuthDelegatedPath('POST', '/auth/two-factor/verify-sms')).toBe(false)
  })
})

/** `apps/api/src/tenancy/**` altındaki her `.ts` dosyasının MUTLAK yolunu (alt dizinler dahil) döner. */
function listTenancyTsFiles(tenancyDir: string): readonly string[] {
  const result: string[] = []

  for (const entry of readdirSync(tenancyDir, { withFileTypes: true })) {
    const entryPath = join(tenancyDir, entry.name)

    if (entry.isDirectory()) {
      result.push(...listTenancyTsFiles(entryPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      result.push(entryPath)
    }
  }

  return result
}

describe("mekanik kanıt: 'tenancy' üretim kodu 'auth' modülünden import ETMEZ", () => {
  it('apps/api/src/tenancy/**\'in HİÇBİR .ts dosyası "from \'../auth/" DİZESİNİ TAŞIMAZ', () => {
    // `.pathname` BİLEREK KULLANILMAZ — repo kök dizin adı bir boşluk
    // TAŞIYABİLİR ("Arkesoft Panel"), `.pathname` bunu `%20` olarak
    // YÜZDE-KODLAR ve `readdirSync` o kodlanmış yolu DOSYA SİSTEMİNDE
    // ARAR (ENOENT). `fileURLToPath` bu kod çözmeyi doğru yapan Node API'sidir.
    const tenancyDir = fileURLToPath(new URL('../tenancy', import.meta.url))
    const needle = "from '../auth/"

    const matches = listTenancyTsFiles(tenancyDir)
      .map((filePath) => ({ filePath, content: readFileSync(filePath, 'utf-8') }))
      .filter(({ content }) => content.includes(needle))
      .map(({ filePath }) => filePath)

    expect(matches, `beklenmeyen eşleşme(ler): ${matches.join(', ')}`).toEqual([])
  })
})

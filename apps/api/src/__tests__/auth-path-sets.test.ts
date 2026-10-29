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

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { AUTH_DELEGATED_PATHS } from '../auth/auth-delegated-paths.js'
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

  it('AUTH_OWN_PATHS içindeki hiçbir yolun AUTH_EXEMPT_PATHS üyesi OLMADIĞI (kiracıdan muaf ≠ kimlikten muaf)', async () => {
    const { AUTH_EXEMPT_PATHS } = await import('../auth/auth-exempt-paths.js')

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
describe('DÖRDÜNCÜ test (solid M-3, bağlayıcı) — AUTH_EXEMPT_PATHS ∩ /auth/* ≡ AUTH_DELEGATED_PATHS yol kümesi', () => {
  it("AUTH_EXEMPT_PATHS'in /auth/ önekli alt kümesi AUTH_DELEGATED_PATHS'in yol kümesiyle BİREBİR eşittir", async () => {
    const { AUTH_EXEMPT_PATHS } = await import('../auth/auth-exempt-paths.js')

    const exemptAuthPaths = new Set(
      [...AUTH_EXEMPT_PATHS].filter((path) => path.startsWith('/auth/')),
    )
    const delegatedPaths = new Set([...AUTH_DELEGATED_PATHS].map(extractPath))

    expect(exemptAuthPaths).toEqual(delegatedPaths)
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

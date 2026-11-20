// @arkesoft/i18n — saflık pini (ROADMAP v0.0.18, T-027/S1)
//
// Bu paket I/O yapmaz, dosya sistemine erişmez, HTTP çatısına bağımlı
// DEĞİLDİR, kiracı verisine erişmez, veritabanına (`@arkesoft/db`,
// `@prisma/client`) veya tel sözleşmesine (`@arkesoft/trpc`) BAĞIMLI
// DEĞİLDİR. Tek `@arkesoft/*` bağımlılığı `@arkesoft/errors`'tır (kod↔anahtar
// defteri oradan ithal edilir, bkz. ADR-0028 taslağı) — yapısal emsal
// `packages/theme-sdk/src/__tests__/purity.test.ts` (düz `src/` yapısı, alt
// dizin YOK — bu paket de aynı şekilde düz; `@arkesoft/versioning` istisnası
// orada, burada `@arkesoft/errors` istisnası var).
//
// Grep kapsamı yorumları İÇERMEZ (dosya başı yorumlarda bu dizgiler SERBEST)
// — yalnızca gerçek kod satırları (import/require ifadeleri) taranır.
//
// ⚠ S1 bu dosyayı yalnızca İSKELET olarak doğurur: bugün `src/`'te üretim
// kaynağı tek dosya — boş barrel `index.ts` (S5a/S5b dolduracak). Barrel
// hiçbir yasaklı dizgi taşımadığı için ilk testin assertion'ı (`files.length
// > 0`) bugünden itibaren GEÇERLİDİR ve ileride S5a/S5b'nin ekleyeceği 12
// dosyayı da KAPSAR — ayrıca bir güncelleme gerekmez.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC_DIR = join(import.meta.dirname, '..')

/** Yorum satırlarını eler — yalnızca gerçek kod satırlarını bırakır. */
function codeLinesOf(filePath: string): readonly string[] {
  return readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
}

/** `src/` altındaki (test dosyaları HARİÇ) tüm `.ts` dosyalarının yolları — paket düz, alt dizin yok. */
function productionSourceFiles(): readonly string[] {
  return readdirSync(SRC_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(SRC_DIR, entry.name))
}

const FORBIDDEN_PATTERNS = [
  /node:fs/,
  /node:path/,
  /node:http/,
  /node:https/,
  /node:url/,
  /node:crypto/,
  /node:process/,
  /(^|[^\w/])['"]fs['"]/,
  /(^|[^\w/])['"]path['"]/,
  /(^|[^\w/])['"]http['"]/,
  /(^|[^\w/])['"]https['"]/,
  /(^|[^\w/])['"]process['"]/,
  /process\./,
  /globalThis\.process/,
  /fetch\(/,
  /@nestjs/,
  /express/,
  /@prisma/,
  // Bu paketin TEK `@arkesoft/*` bağımlılığı `@arkesoft/errors`'tır —
  // negatif lookahead ile istisna tutulur. `@arkesoft/db`, `@arkesoft/trpc`
  // ve diğer tüm `@arkesoft/*` paketleri bu desenle YAKALANIR.
  /from\s+['"]@arkesoft\/(?!errors['"])/,
  /require\(\s*['"]@arkesoft\/(?!errors['"])/,
  /import\(\s*['"]@arkesoft\/(?!errors['"])/,
]

describe('packages/i18n saflık', () => {
  it('src/ üretim kaynaklarında yasaklı import/çağrı dizgisi 0 (yorumlar hariç)', () => {
    const files = productionSourceFiles()
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []

    for (const filePath of files) {
      const codeLines = codeLinesOf(filePath)

      for (const pattern of FORBIDDEN_PATTERNS) {
        const match = codeLines.find((line) => pattern.test(line))
        if (match !== undefined) {
          violations.push(`${filePath}: "${pattern.source}" → ${match}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('package.json dependencies TAM OLARAK { zod, @arkesoft/errors } — başka hiçbir şey yok', () => {
    const packageJsonUrl = new URL('../../package.json', import.meta.url)
    const packageJson: unknown = JSON.parse(readFileSync(packageJsonUrl, 'utf-8'))

    if (
      typeof packageJson !== 'object' ||
      packageJson === null ||
      !('dependencies' in packageJson)
    ) {
      throw new Error('package.json beklenen şekilde değil (dependencies alanı yok)')
    }

    expect(packageJson.dependencies).toEqual({
      zod: 'catalog:',
      '@arkesoft/errors': 'workspace:*',
    })
  })
})

// @arkesoft/tenancy — saflık pini (ROADMAP v0.0.8, T-009/S1, architect K9,
// AC9)
//
// Bu paket I/O yapmaz, veritabanına erişmez, hiçbir Nest/HTTP/Prisma çatısına
// bağımlı DEĞİLDİR (bkz. README "Yapmaz" sütunu). Bu test o iddiayı kod
// satırları üzerinde DENETLER: `src/` altındaki üretim kaynaklarında
// `@nestjs`, `express`, `@arkesoft/db`, `@prisma` dizgilerinden hiçbiri
// GEÇMEZ. `package.json`'daki `dependencies` alanı da BOŞ olmak zorunda —
// bu paket hiçbir şey parse etmediği için `zod` bile YOK (`packages/errors`'tan
// daha katı, bkz. o paketin `dependencies: { zod: catalog: }`'ı).
//
// Grep kapsamı yorumları İÇERMEZ (dosya başı yorumlarda bu dizgiler SERBEST,
// örn. "Nest/HTTP çatısı importu YOKTUR" cümlesi) — yalnızca gerçek kod
// satırları (import/require ifadeleri) taranır.

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

/** `src/` altındaki (test dosyaları HARİÇ) tüm `.ts` dosyalarının yolları. */
function productionSourceFiles(): readonly string[] {
  return readdirSync(SRC_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(SRC_DIR, entry.name))
}

const FORBIDDEN_PATTERNS = [/@nestjs/, /express/, /@arkesoft\/db/, /@prisma/]

describe('packages/tenancy saflık (AC9)', () => {
  it('src/ üretim kaynaklarında yasaklı import dizgisi 0 (yorumlar hariç)', () => {
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

  it('package.json dependencies BOŞ — bu paket hiçbir şey parse etmez (zod dahi yok)', () => {
    const packageJsonUrl = new URL('../../package.json', import.meta.url)
    const packageJson: unknown = JSON.parse(readFileSync(packageJsonUrl, 'utf-8'))

    if (
      typeof packageJson !== 'object' ||
      packageJson === null ||
      !('dependencies' in packageJson)
    ) {
      throw new Error('package.json beklenen şekilde değil (dependencies alanı yok)')
    }

    expect(packageJson.dependencies).toEqual({})
  })
})

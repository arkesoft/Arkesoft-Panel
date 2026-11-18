// @arkesoft/versioning — saflık pini (ROADMAP v0.0.21, T-018/S1, ADR-0020
// Karar 2)
//
// Bu paket I/O yapmaz, dosya sistemine erişmez, HTTP çatısına bağımlı
// DEĞİLDİR, kiracı verisine erişmez, `@arkesoft/errors`'a BAĞIMLI DEĞİLDİR
// ve sistem saatini KENDİSİ OKUMAZ (ADR-0020 Karar 2 + gözden geçirme
// koşulu 2: "saflık bozulmak zorunda kalırsa … Karar 2'nin katman gerekçesi
// o anda geçersizleşir"). Bu test o iddiayı kod satırları üzerinde DENETLER
// — yapısal emsal `packages/tenancy/src/__tests__/purity.test.ts` (düz
// `src/` yapısı, alt dizin YOK — bu paket de aynı şekilde düz).
//
// Grep kapsamı yorumları İÇERMEZ (dosya başı yorumlarda bu dizgiler SERBEST)
// — yalnızca gerçek kod satırları (import/require ifadeleri, yasaklı
// tarih-yapıcı çağrıları) taranır.
//
// ⚠⚠ AC-7 PİNİ — bu dosyanın taradığı yasaklı dizgi kümesi `Date\.now\(` ve
// `new Date\(`'i de İÇERİR: üretim kodu (`support-window.ts` ve
// kardeşleri) sistem saatini ASLA okumaz, her tarih bir fonksiyon
// PARAMETRESİ olarak ENJEKTE edilir (ROADMAP "Sürüm Politikası §6"
// kuralının gerektirdiği gibi, N-2/sunset hesapları yalnızca enjekte
// edilen tarihlerle test edilebilir olsun diye).

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
  // Bu paket SIFIR `@arkesoft/*` bağımlılığı taşır (`packages/errors` ve
  // `packages/theme-sdk`'dan DAHA katı — ikisi de `zod` dışında bir şey
  // taşımıyor olsa da bu paket DÖNGÜNÜN tabanı olduğu için hiçbir
  // `@arkesoft/*` paketini ithal EDEMEZ).
  /from\s+['"]@arkesoft\//,
  /require\(\s*['"]@arkesoft\//,
  /import\(\s*['"]@arkesoft\//,
  // AC-7 — sistem saatini okuyan iki çağrı dizgisi.
  /Date\.now\(/,
  /new Date\(/,
]

describe('packages/versioning saflık', () => {
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

  it('package.json dependencies TAM OLARAK { zod } — başka hiçbir şey yok (AC-9: semver npm paketi dahil)', () => {
    const packageJsonUrl = new URL('../../package.json', import.meta.url)
    const packageJson: unknown = JSON.parse(readFileSync(packageJsonUrl, 'utf-8'))

    if (
      typeof packageJson !== 'object' ||
      packageJson === null ||
      !('dependencies' in packageJson)
    ) {
      throw new Error('package.json beklenen şekilde değil (dependencies alanı yok)')
    }

    expect(packageJson.dependencies).toEqual({ zod: 'catalog:' })
  })
})

// @arkesoft/api — manifest ve kaynak taraması negatif assert'leri (ROADMAP
// v0.0.4, T-002/ST-7, architect AC13/AC14, K-A6)
//
// Üç bağımsız doğrulama:
//   1. AC14: `apps/api/package.json`'da `class-validator`/`class-transformer`
//      YOK (K3 — Zod tabanlı doğrulama, Nest'in hazır `ValidationPipe`'ı DEĞİL).
//   2. AC13: `apps/api/src` içinde `@prisma/client`/`.prisma/client*`'ten GERÇEK
//      bir `import`/`require`/dinamik `import()` YOK (Prisma yalnızca
//      `@arkesoft/db` üzerinden tüketilir — CLAUDE.md §3). Bu dosyanın
//      YORUMLARI (ve bu testin KENDİ dosyası) bu dizeyi SIKÇA anar — yorum
//      satırları bu yüzden taramadan ÖNCE DIŞLANIR.
//   3. `apps/api/package.json`'daki `version`, kök `package.json`'daki
//      `version` ile EŞİT (T-001 precedenti, platform-lockstep).

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const packageJsonSchema = z.object({
  version: z.string().min(1),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

function readPackageJson(url: URL): z.infer<typeof packageJsonSchema> {
  const raw = readFileSync(url, 'utf-8')
  return packageJsonSchema.parse(JSON.parse(raw) as unknown)
}

/**
 * Blok (`/* ... *\/`) ve satır (`//...`) yorumlarını KABACA kaldırır. Bu bir
 * tam TypeScript ayrıştırıcısı DEĞİLDİR — dize literalleri içindeki `//`
 * dizileri (ör. bir URL) o SATIRIN kalanını da keser; bu, bu testin amacı
 * için GÜVENLİDİR: amaç yalnızca gerçek `import`/`require` ifadelerini
 * YORUMLARDAN ayırmak, kodun tamamını yeniden ayrıştırmak DEĞİL.
 */
function stripComments(source: string): string {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '')

  return withoutBlockComments
    .split('\n')
    .map((line) => {
      const index = line.indexOf('//')
      return index === -1 ? line : line.slice(0, index)
    })
    .join('\n')
}

/** Gerçek `import`/`require`/dinamik `import()` ifadelerini (yorum DIŞI) yakalar. */
const PRISMA_CLIENT_IMPORT_PATTERN =
  /(?:\bfrom\s+|\brequire\(\s*|\bimport\(\s*)['"](?:@prisma\/client|\.prisma\/client)(?:\/[^'"]*)?['"]/

function listTypeScriptFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(fullPath))
    } else if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath)
    }
  }

  return files
}

function findPrismaClientImportViolations(srcDir: string): string[] {
  const violations: string[] = []

  for (const filePath of listTypeScriptFiles(srcDir)) {
    const content = stripComments(readFileSync(filePath, 'utf-8'))
    if (PRISMA_CLIENT_IMPORT_PATTERN.test(content)) {
      violations.push(filePath)
    }
  }

  return violations
}

const API_PACKAGE_JSON_URL = new URL('../../package.json', import.meta.url)
const ROOT_PACKAGE_JSON_URL = new URL('../../../../package.json', import.meta.url)
const SRC_DIR = fileURLToPath(new URL('..', import.meta.url))

describe('apps/api/package.json', () => {
  it('AC14: class-validator/class-transformer YOK', () => {
    const pkg = readPackageJson(API_PACKAGE_JSON_URL)
    const allDependencyNames = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]

    expect(allDependencyNames).not.toContain('class-validator')
    expect(allDependencyNames).not.toContain('class-transformer')
  })

  it("version kök package.json'ın version'ı ile EŞİT", () => {
    const apiPkg = readPackageJson(API_PACKAGE_JSON_URL)
    const rootPkg = readPackageJson(ROOT_PACKAGE_JSON_URL)

    expect(apiPkg.version).toBe(rootPkg.version)
  })
})

describe('AC13 — @prisma/client doğrudan importu YOK (src taraması, yorumlar hariç)', () => {
  it('apps/api/src içinde hiçbir dosya @prisma/client veya .prisma/client* import ETMEZ', () => {
    const violations = findPrismaClientImportViolations(SRC_DIR)

    expect(violations).toEqual([])
  })

  it('tarama en az bir dosyayı GERÇEKTEN inceledi (boş dizin yanlış pozitif üretmesin)', () => {
    const scannedCount = listTypeScriptFiles(SRC_DIR).length

    expect(scannedCount).toBeGreaterThan(0)
  })

  it('bu test dosyasının KENDİSİ (yorumlarda ve regex TANIMINDA @prisma/client geçmesine rağmen) YANLIŞ POZİTİF üretmez', () => {
    const selfPath = fileURLToPath(new URL(import.meta.url))
    const content = stripComments(readFileSync(selfPath, 'utf-8'))

    expect(PRISMA_CLIENT_IMPORT_PATTERN.test(content)).toBe(false)
  })
})

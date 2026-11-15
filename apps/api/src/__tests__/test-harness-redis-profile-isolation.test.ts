// @arkesoft/api — TEST-ONLY REDİS PROFİLİNİN MEKANİK İZOLASYONU
// (ROADMAP v0.1.0, T-019 düzeltme turu 4, Q-1 — kullanıcı kararı)
//
// `create-test-redis-connection.ts`'in dosya başı yorumundaki DÖRT katmanlı
// izolasyonun ÜÇÜNCÜ katmanı: `pnpm lint`'teki `no-restricted-imports`
// kuralından BAĞIMSIZ, statik bir grep taraması (`qa`'nın
// `production-write-path-grep.qa.test.ts` deseninin birebir kopyası — AYNI
// `collectImportStatements` çok-satırlı import birleştirme mantığı, AYNI
// "kapı VACUOUS DEĞİL" kontrol deseni). Lint kuralı yanlışlıkla devre dışı
// bırakılsa/atlansa/yanlış dosyaya eklense BİLE bu test KIRMIZI olur.
//
// NE ÖLÇÜLÜYOR: `apps/api/src/**` (ve `packages/db/src/**`, `packages/trpc/
// src/**` — bu paketler de test-only Redis profilini İTHAL EDEBİLECEK
// konumda, R-P1'in "kapsam apps/api'ye özgü değil, platformun tamamına dair
// bir iddia" desenini izler) içindeki `__tests__` DIŞI (üretim) her dosyanın
// import ifadelerinde `__tests__` yol segmenti taşıyan bir modül yolu YOK.
//
// DÜZELTME (ROADMAP v0.1.0, T-019 düzeltme turu 5, `solid` tur 2 M-B):
// `collectImportStatements` önceden `production-write-path-grep.qa.test.ts`
// dosyasından DOĞRUDAN import ediliyordu (`.test.ts` → `.test.ts` importu).
// Bu, o dosyanın KENDİ 10 testinin de bu dosya koşulduğunda İKİNCİ KEZ
// koşmasına yol açıyordu (`qa` tur 3: 13 = bu dosyanın 3'ü + yabancı 10) —
// hem gereksiz iş, hem de bir KAPI 2 ihlalinin yanlış dosyada raporlanma
// riski. Yardımcı artık `./helpers/collect-import-statements.js`'te yaşıyor;
// her iki test dosyası da ORADAN import ediyor, birbirinden değil.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { collectImportStatements } from './helpers/collect-import-statements.js'

/** Depo kökü — bu dosya `apps/api/src/__tests__/` altında. */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

/** Taranan ÜRETİM kaynak kökleri — `production-write-path-grep.qa.test.ts`'in BİREBİR aynısı. */
const PRODUCTION_SOURCE_ROOTS = [
  join('apps', 'api', 'src'),
  join('packages', 'db', 'src'),
  join('packages', 'trpc', 'src'),
] as const

/** `__tests__` KENDİSİ hariç tutulur — orada test dosyaları birbirini normal şekilde import eder. */
const EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  '__tests__',
  'node_modules',
  'dist',
  'generated',
  '.turbo',
])

/** `__tests__` dizinine giden bir modül yolu segmenti — göreli (`../__tests__/x`) VEYA paket-içi (`@arkesoft/x/__tests__`) biçimde arar. */
const TEST_HELPERS_IMPORT_NEEDLE = '__tests__'

type SourceMatch = {
  readonly file: string
  readonly statement: string
}

function collectTypeScriptFiles(rootRelativePath: string, honourExclusions: boolean): string[] {
  const absoluteRoot = join(REPO_ROOT, rootRelativePath)
  const collected: string[] = []

  const walk = (absoluteDirectory: string): void => {
    for (const entryName of readdirSync(absoluteDirectory)) {
      const absoluteEntry = join(absoluteDirectory, entryName)
      const stats = statSync(absoluteEntry)

      if (stats.isDirectory()) {
        if (honourExclusions && EXCLUDED_DIRECTORY_NAMES.has(entryName)) {
          continue
        }
        walk(absoluteEntry)
        continue
      }

      if (entryName.endsWith('.ts')) {
        collected.push(absoluteEntry)
      }
    }
  }

  walk(absoluteRoot)

  return collected
}

function collectProductionFiles(): string[] {
  return PRODUCTION_SOURCE_ROOTS.flatMap((root) => collectTypeScriptFiles(root, true))
}

function findTestHelperImports(files: readonly string[]): SourceMatch[] {
  const matches: SourceMatch[] = []

  for (const absoluteFile of files) {
    const statements = collectImportStatements(readFileSync(absoluteFile, 'utf-8'))

    for (const statement of statements) {
      if (statement.includes(TEST_HELPERS_IMPORT_NEEDLE)) {
        matches.push({ file: relative(REPO_ROOT, absoluteFile), statement })
      }
    }
  }

  return matches
}

describe('test-only Redis profili — mekanik izolasyon (lint-BAĞIMSIZ grep kapısı)', () => {
  it('tarama GERÇEKTEN dosya okuyor (kapı boş küme üzerinde yeşil yanmıyor)', () => {
    const productionFiles = collectProductionFiles()

    expect(productionFiles.length).toBeGreaterThan(50)

    for (const absoluteFile of productionFiles) {
      const segments = relative(REPO_ROOT, absoluteFile).split(/[/\\]/)
      for (const excluded of EXCLUDED_DIRECTORY_NAMES) {
        expect(segments).not.toContain(excluded)
      }
    }
  })

  it('HİÇBİR üretim dosyası `__tests__` altındaki bir modülü import ETMİYOR', () => {
    const matches = findTestHelperImports(collectProductionFiles())

    expect(matches).toEqual([])
  })

  it('kapı VACUOUS DEĞİL: AYNI tarayıcı, SENTETİK bir `__tests__` importu BULUYOR', () => {
    // ⚠ `__tests__` İÇİNDEKİ dosyaların BİRBİRİNİ import ettiği göreli yollar
    // (`./create-test-redis-connection.js`, `./helpers/create-test-app.js`)
    // DOĞALARI GEREĞİ `__tests__` yol SEGMENTİNİ TAŞIMAZ (zaten İÇİNDELER) —
    // bu yüzden REPO'DA, BUGÜN, organik bir "üretimden __tests__'e import"
    // ÖRNEĞİ YOK (tam da bu kapının GARANTİ ETTİĞİ şey — sıfır ihlal). Kapının
    // VACUOUS OLMADIĞINI kanıtlamak için `qa`'nın "ÇOK SATIRLI import KÖR
    // NOKTASI" testinin BİREBİR deseni kullanılır: sentetik bir kaynak
    // (production'da OLABİLECEK, bir dizin YUKARI çıkıp `__tests__`'e giren
    // bir import) tarayıcıya verilir ve BULUNDUĞU doğrulanır.
    const syntheticViolation = [
      "import type { Redis } from 'ioredis'",
      '',
      "import { createTestHarnessRedisConnection } from '../__tests__/helpers/create-test-redis-connection.js'",
      '',
      'export const value = 1',
    ].join('\n')

    const statements = collectImportStatements(syntheticViolation)
    const matches = statements.filter((statement) => statement.includes(TEST_HELPERS_IMPORT_NEEDLE))

    expect(matches).toHaveLength(1)
    expect(matches[0]).toContain('create-test-redis-connection')
  })
})

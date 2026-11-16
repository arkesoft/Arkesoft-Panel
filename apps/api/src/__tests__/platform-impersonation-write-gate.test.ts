// @arkesoft/api — AC-9 (ikinci ayak): `runImpersonated()`'ın TEK çağrı yeri
// VE `apps/api/src/platform/**` içinde veri katmanına DOĞRUDAN erişimin
// SIFIR olduğu (ROADMAP v0.0.20, T-021/S7, ADR-0023 §3)
//
// `production-write-path-grep.qa.test.ts`'in (ROADMAP v0.0.14, T-014/S5)
// AYNI deseni, AYNI disiplin: tarama GERÇEKTEN dosya okur (vacuous DEĞİL,
// kontrol dizini pozitif eşleşme üretir), needle'lar literal-jeton kuralına
// uyar (AGENT_BASELINE.md §5 — `runImpersonated` + `(` ÇALIŞMA ANINDA
// birleştirilir).
//
// İKİ KAPI:
//   KAPI A (AC-9, ADR-0023 §3) — `apps/api/src/platform/**` içinde
//   `runImpersonated(` çağrısı TAM BİR yerde (`platform-read.port.adapter.ts`).
//   KAPI B (dosya başı "⚠⚠ apps/api/src/platform/** altındaki port
//   adaptörleri DI'dan YALNIZCA ImpersonationService alır" kısıtı) —
//   `PrismaService` jetonu `impersonation.service.ts` DIŞINDA HİÇ geçmez.
//
// ⚠ Kapsam SADECE `apps/api/src/platform/**` (`__tests__` İÇERMEZ — bu
// dizinde bugün hiç test dosyası YOK, ama gelecekte biri eklenirse
// YANLIŞ POZİTİF üretmesin diye dışlama MEKANİK olarak uygulanır,
// `production-write-path-grep.qa.test.ts`'in AYNI disiplini).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Depo kökü — bu dosya `apps/api/src/__tests__/` altında. */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

/** Taranan kök — YALNIZCA bu alt görevin modülü. */
const PLATFORM_MODULE_ROOT = join('apps', 'api', 'src', 'platform')

/** Kontrol kökü — AYNI tarayıcının VACUOUS olmadığını kanıtlayan pozitif eşleşme kaynağı. */
const CONTROL_ROOT = join('apps', 'api', 'src', 'trpc', 'ports')

/** Taramadan dışlanan dizin adları. */
const EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  '__tests__',
  'node_modules',
  'dist',
  'generated',
  '.turbo',
])

/**
 * GERÇEK çağrı sözdizimi — ALICI dahil (`this.impersonation.runImpersonated(`).
 * ⚠⚠ ÖLÇÜLDÜ: bare `runImpersonated(` (alıcısız) bu dosyaların KENDİ
 * DOKÜMANTASYONUNDA ("ImpersonationService.runImpersonated()'ın…" gibi
 * DÜZYAZI referanslarında) DA geçiyor — bare needle KALICI YANLIŞ POZİTİF
 * verirdi (`production-write-path-grep.qa.test.ts`'in "literal-jeton"
 * dersiyle AYNI sınıf tuzak, farklı eksen: burada SUBJECT'in kendi
 * YORUMLARI tuzağı kurdu). Alıcı-dahil needle düzyazıda HİÇ geçmez (doğrulandı).
 * Jeton ÇALIŞMA ANINDA birleştirilir (AGENT_BASELINE.md §5).
 */
const RUN_IMPERSONATED_CALL_NEEDLE = ['.impersonation', '.runImpersonated('].join('')

/** `impersonation.service.ts` — AC-9'un TEK meşru çağrı yeri. */
const RUN_IMPERSONATED_CALL_SITE_PATH = join(
  'apps',
  'api',
  'src',
  'platform',
  'platform-read.port.adapter.ts',
)

/** `ImpersonationService`'in KENDİ dosyası — `PrismaService` jetonunun TEK meşru göründüğü yer. */
const IMPERSONATION_SERVICE_PATH = join(
  'apps',
  'api',
  'src',
  'platform',
  'impersonation.service.ts',
)

/**
 * GERÇEK DI enjeksiyonu sözdizimi — `@Inject(PrismaService)` dekoratör
 * argümanı. ⚠⚠ ÖLÇÜLDÜ: bare `PrismaService` jetonu platform/**'in İKİ
 * BAŞKA dosyasının (port adaptörleri) KENDİ YORUMLARINDA ("PrismaService BU
 * DOSYADA ENJEKTE EDİLMEZ") geçiyor — bare needle KALICI YANLIŞ POZİTİF
 * verirdi. Parantez-dahil needle (gerçek dekoratör çağrısı) düzyazıda HİÇ
 * geçmez (doğrulandı). Jeton ÇALIŞMA ANINDA birleştirilir.
 */
const PRISMA_SERVICE_NEEDLE = ['(Prisma', 'Service)'].join('')

type SourceMatch = {
  readonly file: string
  readonly line: number
  readonly text: string
}

function collectTypeScriptFiles(rootRelativePath: string): string[] {
  const absoluteRoot = join(REPO_ROOT, rootRelativePath)
  const collected: string[] = []

  const walk = (absoluteDirectory: string): void => {
    for (const entryName of readdirSync(absoluteDirectory)) {
      const absoluteEntry = join(absoluteDirectory, entryName)
      const stats = statSync(absoluteEntry)

      if (stats.isDirectory()) {
        if (EXCLUDED_DIRECTORY_NAMES.has(entryName)) {
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

function findMatches(files: readonly string[], needle: string): SourceMatch[] {
  const matches: SourceMatch[] = []

  for (const absoluteFile of files) {
    const lines = readFileSync(absoluteFile, 'utf-8').split('\n')

    lines.forEach((text, index) => {
      if (text.includes(needle)) {
        matches.push({
          file: relative(REPO_ROOT, absoluteFile),
          line: index + 1,
          text: text.trim(),
        })
      }
    })
  }

  return matches
}

function collectPlatformModuleFiles(): string[] {
  return collectTypeScriptFiles(PLATFORM_MODULE_ROOT)
}

function collectControlFiles(): string[] {
  return collectTypeScriptFiles(CONTROL_ROOT)
}

describe('platform/** yazma kapıları — tarama yüzeyinin kendisi', () => {
  it('tarama GERÇEKTEN dosya okuyor (kapılar boş küme üzerinde yeşil yanmıyor)', () => {
    const platformFiles = collectPlatformModuleFiles()
    const controlFiles = collectControlFiles()

    expect(platformFiles.length).toBeGreaterThan(3)
    expect(controlFiles.length).toBeGreaterThan(3)

    for (const absoluteFile of platformFiles) {
      const segments = relative(REPO_ROOT, absoluteFile).split(/[/\\]/)
      for (const excluded of EXCLUDED_DIRECTORY_NAMES) {
        expect(segments).not.toContain(excluded)
      }
    }

    expect(platformFiles.map((file) => relative(REPO_ROOT, file))).toContain(
      RUN_IMPERSONATED_CALL_SITE_PATH,
    )
    expect(platformFiles.map((file) => relative(REPO_ROOT, file))).toContain(
      IMPERSONATION_SERVICE_PATH,
    )
  })
})

describe('KAPI A (AC-9) — runImpersonated() apps/api/src/platform/** içinde TAM BİR çağrı yerine sahip', () => {
  it('çağrı TAM OLARAK platform-read.port.adapter.ts dosyasında, TEK satırda', () => {
    const matches = findMatches(collectPlatformModuleFiles(), RUN_IMPERSONATED_CALL_NEEDLE)

    // ⚠ VACUOUS DEĞİL: boş dizi de `toEqual([PATH])`'i KIRARDI — assert'in
    // kendisi "sıfır eşleşme" ile "tam bir eşleşme"yi AYIRT EDER.
    expect(matches.map((match) => match.file)).toEqual([RUN_IMPERSONATED_CALL_SITE_PATH])
    expect(matches).toHaveLength(1)
  })
})

// ⚠⚠ AC-9(2) MUTASYON KANITI — bu test dosyası DEĞİL, raporun KENDİSİ
// taşır: `impersonation.service.ts`'e kasıtlı İKİNCİ bir
// `this.impersonation.runImpersonated(...)` çağrı yeri (geçici) eklenip
// `npx vitest run platform-impersonation-write-gate.test.ts` koşturuldu,
// yukarıdaki testin `toHaveLength(1)` assert'i `received length 2` ile
// KIRMIZI oldu, mutasyon `Edit` ile GERİ ALINDI (ham çıktı raporda).

describe('KAPI B — platform/** port adaptörleri PrismaService ENJEKTE ETMEZ', () => {
  it('`PrismaService` jetonu platform/** içinde YALNIZCA impersonation.service.ts dosyasında geçer', () => {
    const matches = findMatches(collectPlatformModuleFiles(), PRISMA_SERVICE_NEEDLE)
    const matchedFiles = [...new Set(matches.map((match) => match.file))]

    expect(matchedFiles).toEqual([IMPERSONATION_SERVICE_PATH])
  })

  it('kapı VACUOUS DEĞİL — AYNI tarayıcı, `trpc/ports/**`de (kontrol kümesi) PrismaService çağrısı buluyor', () => {
    const controlMatches = findMatches(collectControlFiles(), PRISMA_SERVICE_NEEDLE)
    expect(controlMatches.length).toBeGreaterThan(0)
  })
})

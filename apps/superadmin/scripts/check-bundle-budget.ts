// @arkesoft/superadmin — build-sonrası paket boyutu bütçesi denetimi
// (ROADMAP v0.0.20, T-021/S8, `apps/admin/scripts/check-bundle-budget.ts`'in
// AYNI mekanizması — yalnızca `node:fs`/`node:path`/`node:zlib`, YENİ PAKET
// YOK).
//
// "İLK ROTA" TANIMI bir ÇIKARSAMA DEĞİL: `bundle-budget.config.ts`'teki
// `FIRST_PAINT_ENTRY_POINTS` BİLDİRİMİ + iki fail-closed assertion (A, B —
// aşağıda). Bütçe ÜÇ SAYI raporlar: "paylaşılan çekirdek", her giriş
// noktasının TOPLAMI, ve maksimum/bütçe (%, rezerv). Eşik YALNIZCA
// maksimuma bağlanır.
//
// `no-console` BU DİZİNDE KAPALI (`eslint.config.mjs`) — CLI script'i
// enjekte edilen logger'a sahip DEĞİL, doğrudan stdout/stderr'e yazar.
//
// `bundle-budget.config.ts` STATİK (değer) IMPORT EDİLMEZ — bu script
// `package.json`'un `build` adımında DÜZ `node ./scripts/check-bundle-
// budget.ts` ile çalışıyor (derleme aracı/bundler YOK). Telafi: modül yolu
// ÇALIŞMA ZAMANINDA (`new URL(...).href`) kurulur — `tsc` statik bir `.ts`
// belirteci GÖRMEDİĞİ için TS5097 hiç TETİKLENMEZ, Node'un tip-silmesi ise
// `.ts` uzantısını ÇALIŞMA ZAMANINDA sorunsuz çözer. Yüklenen modülün şekli
// `isBundleBudgetConfig` ile RUNTIME'DA doğrulanıp ANCAK doğrulamadan SONRA
// somut tipe daraltılır (CLAUDE.md §4).

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const SUPERADMIN_ROOT = dirname(fileURLToPath(import.meta.url)) + '/..'
const DIST_DIR = resolve(SUPERADMIN_ROOT, 'dist')
const MANIFEST_PATH = join(DIST_DIR, '.vite', 'manifest.json')

/** `bundle-budget.config.ts`'in dışa açtığı sabitlerin beklenen şekli. */
export interface FirstPaintEntryPointDeclaration {
  readonly label: string
  readonly routeModuleSrcPrefixes: readonly string[]
}

interface BundleBudgetConfig {
  readonly MAX_FIRST_ROUTE_JS_GZIP_BYTES: number
  readonly MAX_FIRST_ROUTE_CSS_GZIP_BYTES: number
  readonly FIRST_PAINT_ENTRY_POINTS: readonly FirstPaintEntryPointDeclaration[]
  readonly DELIBERATELY_LAZY_ROUTE_SRCS: readonly string[]
}

function isFirstPaintEntryPointDeclaration(
  value: unknown,
): value is FirstPaintEntryPointDeclaration {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record['label'] === 'string' &&
    Array.isArray(record['routeModuleSrcPrefixes']) &&
    record['routeModuleSrcPrefixes'].every((prefix) => typeof prefix === 'string')
  )
}

function isBundleBudgetConfig(value: unknown): value is BundleBudgetConfig {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record['MAX_FIRST_ROUTE_JS_GZIP_BYTES'] === 'number' &&
    typeof record['MAX_FIRST_ROUTE_CSS_GZIP_BYTES'] === 'number' &&
    Array.isArray(record['FIRST_PAINT_ENTRY_POINTS']) &&
    record['FIRST_PAINT_ENTRY_POINTS'].every(isFirstPaintEntryPointDeclaration) &&
    Array.isArray(record['DELIBERATELY_LAZY_ROUTE_SRCS']) &&
    record['DELIBERATELY_LAZY_ROUTE_SRCS'].every((src) => typeof src === 'string')
  )
}

/** `bundle-budget.config.ts`'i ÇALIŞMA ZAMANINDA kurulan bir URL ile yükler (yukarıdaki dosya başı yorumu). */
async function loadBundleBudgetConfig(): Promise<BundleBudgetConfig> {
  const modulePath = new URL('../bundle-budget.config.ts', import.meta.url).href
  const loaded: unknown = await import(modulePath)

  if (!isBundleBudgetConfig(loaded)) {
    throw new Error(
      'bundle-budget.config.ts beklenen şekilde değil (bütçe sabitleri + giriş noktası bildirimi bekleniyor)',
    )
  }

  return loaded
}

/** Vite'ın `build.manifest: true` ile ürettiği manifest girdisinin ilgilendiğimiz alanları. */
export interface ManifestEntry {
  readonly file: string
  readonly src?: string
  readonly isEntry?: boolean
  readonly isDynamicEntry?: boolean
  readonly imports?: readonly string[]
  readonly dynamicImports?: readonly string[]
  readonly css?: readonly string[]
}

export type Manifest = Readonly<Record<string, ManifestEntry>>

/** Dış dünyadan (disk) okunan JSON'a Zod OLMADAN tip VERİLMEZ — burada el ile yapısal doğrulama. */
function isManifestEntry(value: unknown): value is ManifestEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record['file'] === 'string'
}

function parseManifest(raw: unknown): Manifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('dist/.vite/manifest.json beklenen şekilde değil (kök nesne değil)')
  }
  const result: Record<string, ManifestEntry> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isManifestEntry(value)) {
      throw new Error(`dist/.vite/manifest.json içindeki "${key}" girdisi beklenen şekilde değil`)
    }
    result[key] = value
  }
  return result
}

function collectEntryKeys(manifest: Manifest): readonly string[] {
  const entryKeys = Object.entries(manifest)
    .filter(([, entry]) => entry.isEntry === true)
    .map(([key]) => key)

  if (entryKeys.length === 0) {
    throw new Error('dist/.vite/manifest.json içinde isEntry:true taşıyan hiçbir girdi yok')
  }

  return entryKeys
}

/** Bildirilen bir önekle `src`'i EŞLEŞEN manifest anahtarlarını bulur (`startsWith`, `?` sonrası sorgu dizesi dahil). */
function findManifestKeysForPrefix(manifest: Manifest, prefix: string): readonly string[] {
  return Object.entries(manifest)
    .filter(([, entry]) => entry.src?.startsWith(prefix) === true)
    .map(([key]) => key)
}

/** Yalnızca STATİK `imports` üzerinde BFS — `dynamicImports` İZLENMEZ (lazy chunk'lar ilk boya değildir). */
function collectStaticImportClosure(manifest: Manifest, seedKeys: readonly string[]): Set<string> {
  const visited = new Set<string>()
  const queue = [...seedKeys]

  while (queue.length > 0) {
    const key = queue.shift()
    if (key === undefined || visited.has(key)) {
      continue
    }
    visited.add(key)

    const entry = manifest[key]
    if (entry === undefined) {
      continue
    }
    for (const importedKey of entry.imports ?? []) {
      if (!visited.has(importedKey)) {
        queue.push(importedKey)
      }
    }
  }

  return visited
}

interface BundleTotals {
  readonly jsGzipBytes: number
  readonly cssGzipBytes: number
}

function sumGzipBytes(
  manifest: Manifest,
  keys: ReadonlySet<string>,
  countedCssFiles: Set<string>,
): BundleTotals {
  let jsGzipBytes = 0
  let cssGzipBytes = 0

  for (const key of keys) {
    const entry = manifest[key]
    if (entry === undefined) {
      continue
    }

    const jsContent = readFileSync(join(DIST_DIR, entry.file))
    jsGzipBytes += gzipSync(jsContent).length

    for (const cssFile of entry.css ?? []) {
      if (countedCssFiles.has(cssFile)) {
        continue
      }
      countedCssFiles.add(cssFile)
      const cssContent = readFileSync(join(DIST_DIR, cssFile))
      cssGzipBytes += gzipSync(cssContent).length
    }
  }

  return { jsGzipBytes, cssGzipBytes }
}

function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KiB`
}

function formatPercentAndReserve(bytes: number, budgetBytes: number): string {
  const percent = (bytes / budgetBytes) * 100
  const reserve = budgetBytes - bytes
  return `%${percent.toFixed(1)}, rezerv ${formatKiB(reserve)}`
}

interface EntryPointTotals {
  readonly label: string
  readonly totals: BundleTotals
}

/**
 * Fail-closed A (bildirim → manifest): bildirilen HER önek EN AZ BİR
 * manifest anahtarıyla eşleşmek ZORUNDA. `process.exitCode = 1` YETMEZ —
 * FIRLATILIR. Eşleşen anahtarları (sonraki adımların yeniden kullanacağı)
 * döner.
 */
export function assertDeclaredPrefixesExist(
  manifest: Manifest,
  firstPaintEntryPoints: readonly FirstPaintEntryPointDeclaration[],
): ReadonlyMap<string, readonly string[]> {
  const claimedKeysByPrefix = new Map<string, readonly string[]>()

  for (const entryPoint of firstPaintEntryPoints) {
    for (const prefix of entryPoint.routeModuleSrcPrefixes) {
      const matches = findManifestKeysForPrefix(manifest, prefix)
      if (matches.length === 0) {
        const allSrcs = Object.values(manifest)
          .map((entry) => entry.src)
          .filter((src): src is string => src !== undefined)
        throw new Error(
          [
            `[bundle-budget] FAIL-CLOSED A: "${entryPoint.label}" giriş noktasının bildirdiği önek`,
            `"${prefix}" dist/.vite/manifest.json içinde HİÇBİR "src" alanıyla eşleşmedi.`,
            `Manifest'teki "src" listesi: ${allSrcs.length > 0 ? allSrcs.join(', ') : '(hiç yok)'}`,
            `Olası nedenler: "autoCodeSplitting" kapatıldı / rota dosyası yeniden adlandırıldı /`,
            `TanStack'ın split son eki değişti. "bundle-budget.config.ts"'teki`,
            `"FIRST_PAINT_ENTRY_POINTS" listesini güncelleyin.`,
          ].join(' '),
        )
      }
      claimedKeysByPrefix.set(prefix, matches)
    }
  }

  return claimedKeysByPrefix
}

/**
 * Fail-closed B (manifest → bildirim): `isDynamicEntry: true` taşıyan HER
 * anahtarın `src`'i ya BİR giriş noktası tarafından talep edilmiş ya
 * `deliberatelyLazyRouteSrcs`'te (TAM EŞİTLİK) OLMAK ZORUNDA. Aksi hâlde
 * FIRLATILIR — susturulması YASAK.
 */
export function assertEveryDynamicEntryIsAccountedFor(
  manifest: Manifest,
  allClaimedPrefixes: readonly string[],
  deliberatelyLazyRouteSrcs: readonly string[],
): void {
  for (const [key, entry] of Object.entries(manifest)) {
    if (entry.isDynamicEntry !== true || entry.src === undefined) {
      continue
    }
    const src = entry.src
    const isClaimedByEntryPoint = allClaimedPrefixes.some((prefix) => src.startsWith(prefix))
    const isDeliberatelyLazy = deliberatelyLazyRouteSrcs.includes(src)
    if (!isClaimedByEntryPoint && !isDeliberatelyLazy) {
      throw new Error(
        [
          `[bundle-budget] FAIL-CLOSED B: manifest anahtarı "${key}" (src: "${src}")`,
          `"isDynamicEntry: true" taşıyor ama HİÇBİR giriş noktası tarafından talep edilmedi VE`,
          `"DELIBERATELY_LAZY_ROUTE_SRCS"'te (TAM EŞLEŞME) değil. Bu, gelecekte bildirilen bir`,
          `rotadan tembel çağrılan bir alt ekranın SESSİZCE ilk boyaya sayılmasını ÖNLEYEN kapı —`,
          `ya "FIRST_PAINT_ENTRY_POINTS"'e bu rotayı EKLEYİN (ilk boyanın parçasıysa) ya da Türkçe`,
          `gerekçeyle "DELIBERATELY_LAZY_ROUTE_SRCS"'e TAM "src" değerini ekleyin (bilerek tembel`,
          `kalacaksa).`,
        ].join(' '),
      )
    }
  }
}

async function main(): Promise<void> {
  const budget = await loadBundleBudgetConfig()

  const manifestRaw: unknown = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
  const manifest = parseManifest(manifestRaw)

  const entryKeys = collectEntryKeys(manifest)

  const claimedKeysByPrefix = assertDeclaredPrefixesExist(manifest, budget.FIRST_PAINT_ENTRY_POINTS)

  const allClaimedPrefixes = budget.FIRST_PAINT_ENTRY_POINTS.flatMap(
    (entryPoint) => entryPoint.routeModuleSrcPrefixes,
  )

  assertEveryDynamicEntryIsAccountedFor(
    manifest,
    allClaimedPrefixes,
    budget.DELIBERATELY_LAZY_ROUTE_SRCS,
  )

  const sharedCoreKeys = collectStaticImportClosure(manifest, entryKeys)
  const sharedCoreCountedCss = new Set<string>()
  const sharedCoreTotals = sumGzipBytes(manifest, sharedCoreKeys, sharedCoreCountedCss)

  const entryPointTotals: EntryPointTotals[] = []
  for (const entryPoint of budget.FIRST_PAINT_ENTRY_POINTS) {
    const ownPrefixKeys = entryPoint.routeModuleSrcPrefixes.flatMap(
      (prefix) => claimedKeysByPrefix.get(prefix) ?? [],
    )
    const seedKeys = [...entryKeys, ...ownPrefixKeys]
    const closureKeys = collectStaticImportClosure(manifest, seedKeys)
    const countedCssFiles = new Set<string>()
    const totals = sumGzipBytes(manifest, closureKeys, countedCssFiles)
    entryPointTotals.push({ label: entryPoint.label, totals })
  }

  process.stdout.write(
    `[bundle-budget] paylaşılan çekirdek — JS (gzip): ${formatKiB(sharedCoreTotals.jsGzipBytes)}, CSS (gzip): ${formatKiB(sharedCoreTotals.cssGzipBytes)}\n`,
  )

  for (const { label, totals } of entryPointTotals) {
    process.stdout.write(
      `[bundle-budget] ${label} — JS (gzip): ${formatKiB(totals.jsGzipBytes)} / bütçe ${formatKiB(budget.MAX_FIRST_ROUTE_JS_GZIP_BYTES)} (${formatPercentAndReserve(totals.jsGzipBytes, budget.MAX_FIRST_ROUTE_JS_GZIP_BYTES)})\n`,
    )
    process.stdout.write(
      `[bundle-budget] ${label} — CSS (gzip): ${formatKiB(totals.cssGzipBytes)} / bütçe ${formatKiB(budget.MAX_FIRST_ROUTE_CSS_GZIP_BYTES)} (${formatPercentAndReserve(totals.cssGzipBytes, budget.MAX_FIRST_ROUTE_CSS_GZIP_BYTES)})\n`,
    )
  }

  const maxJsGzipBytes = Math.max(...entryPointTotals.map(({ totals }) => totals.jsGzipBytes))
  const maxCssGzipBytes = Math.max(...entryPointTotals.map(({ totals }) => totals.cssGzipBytes))

  process.stdout.write(
    `[bundle-budget] MAKSİMUM — JS (gzip): ${formatKiB(maxJsGzipBytes)} / bütçe ${formatKiB(budget.MAX_FIRST_ROUTE_JS_GZIP_BYTES)} (${formatPercentAndReserve(maxJsGzipBytes, budget.MAX_FIRST_ROUTE_JS_GZIP_BYTES)})\n`,
  )
  process.stdout.write(
    `[bundle-budget] MAKSİMUM — CSS (gzip): ${formatKiB(maxCssGzipBytes)} / bütçe ${formatKiB(budget.MAX_FIRST_ROUTE_CSS_GZIP_BYTES)} (${formatPercentAndReserve(maxCssGzipBytes, budget.MAX_FIRST_ROUTE_CSS_GZIP_BYTES)})\n`,
  )

  let exceeded = false

  if (maxJsGzipBytes > budget.MAX_FIRST_ROUTE_JS_GZIP_BYTES) {
    exceeded = true
    process.stderr.write(
      `[bundle-budget] AŞIM: JS ${formatKiB(maxJsGzipBytes)} > bütçe ${formatKiB(budget.MAX_FIRST_ROUTE_JS_GZIP_BYTES)}\n`,
    )
  }

  if (maxCssGzipBytes > budget.MAX_FIRST_ROUTE_CSS_GZIP_BYTES) {
    exceeded = true
    process.stderr.write(
      `[bundle-budget] AŞIM: CSS ${formatKiB(maxCssGzipBytes)} > bütçe ${formatKiB(budget.MAX_FIRST_ROUTE_CSS_GZIP_BYTES)}\n`,
    )
  }

  if (exceeded) {
    process.exitCode = 1
  }
}

// `main()` yalnızca bu dosya DOĞRUDAN çalıştırıldığında koşmalı — İTHAL
// edildiğinde (test) KOŞMAMALI, aksi hâlde her test çalıştırması
// `dist/.vite/manifest.json`'u aramaya çalışıp gereksiz bir hata yazdırır.
const isDirectlyExecuted =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectlyExecuted) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : 'bilinmeyen hata'
    process.stderr.write(`[bundle-budget] Beklenmeyen hata: ${message}\n`)
    process.exitCode = 1
  })
}

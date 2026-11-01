// @arkesoft/admin — build-sonrası paket boyutu bütçesi denetimi (ROADMAP
// v0.0.7, T-008/S5, architect K7, AC16; DÜZELTME TURU 1 — architect Karar 1)
//
// Yalnızca `node:fs`/`node:path`/`node:zlib` — YENİ PAKET YOK (K7 bağlayıcı,
// `rollup-plugin-visualizer` KULLANILMAZ). `package.json`'un `build` script'i
// bunu `vite build`'DEN SONRA (ve `check-compiled-css-contract.ts`'DEN SONRA
// — doğruluk boyut politikasından ÖNCE gelir, DÜZELTME TURU 1 architect
// Karar 2) çalıştırır.
//
// "İLK ROTA" TANIMININ YENİDEN YAZILMASI (DÜZELTME TURU 1 — architect Karar
// 1, BAĞLAYICI): ESKİ tanım ("entry + geçişli statik `imports`",
// `dynamicImports` HARİÇ) TEK bir `isEntry:true` girdisi (`index.html`)
// vardı ve onun `dynamicImports`'u TanStack Router'ın `autoCodeSplitting`'i
// yüzünden DÖRT rota split'ini AYRIMSIZ listeliyordu — biri (`_auth.sign-in`)
// kimlikli ilk boyanın PARÇASI DEĞİL. Sonuç: eski script SIFIR rota kodu
// ölçüyordu (`perf` tur 1 ölçtü: gerçek ilk ekran ≈160 KiB, script 131.38
// görüyordu, ~29 KiB / %18 KÖR NOKTA). Mekanik ayrım manifest'ten
// TÜRETİLEMEZ (ne entry'nin `dynamicImports`'u hangisinin "ilk boya"
// olduğunu söylüyor, ne TÜM `isDynamicEntry` kümesini toplamak doğru olurdu
// — gelecekteki 50 rotayı da ilk boyaya sayardı) → YENİ tanım bir ÇIKARSAMA
// DEĞİL, `bundle-budget.config.ts`'teki `FIRST_PAINT_ENTRY_POINTS`
// BİLDİRİMİ + iki fail-closed assertion (A, B — aşağıda).
//
// Bütçe artık ÜÇ SAYI raporlar: "paylaşılan çekirdek" (her iki giriş
// noktasının da ORTAK statik kapanışı — `isEntry:true` girdilerinin KENDİ
// geçişli statik `imports`'u, hiçbir rota öneki OLMADAN), her giriş
// noktasının TOPLAMI, ve maksimum/bütçe (%, rezerv). Eşik YALNIZCA
// maksimuma bağlanır; CSS AYNI ŞEKİLDE. AC16 REVİZYONU DEĞİL — AC16'nın
// lafzı/eşiği/"aşım build'i kırar" şartı DEĞİŞMİYOR (bkz.
// `bundle-budget.config.ts` dosya başı yorumu); değişen architect'in KENDİ
// operasyonel tanımı (K7).
//
// `no-console` BU DİZİNDE KAPALI (`apps/admin/eslint.config.mjs`) — CLI
// script'i enjekte edilen logger'a sahip DEĞİL, doğrudan stdout/stderr'e yazar
// (CLAUDE.md §4'ün `console.log` yasağı UYGULAMA kodu içindir, bu bir derleme
// script'i).
//
// `bundle-budget.config.ts` STATİK (değer) IMPORT EDİLMEZ — bu script
// `package.json`'un `build` adımında DÜZ `node ./scripts/check-bundle-
// budget.ts` ile çalışıyor (derleme aracı/bundler YOK, Node'un kendi yerleşik
// TypeScript tip-silme desteği): Node'un ESM çözümleyicisi `./x.js`
// belirteçlerini `./x.ts` dosyasına ÇEVİRMEZ (ÖLÇÜLDÜ) ve `.ts` uzantısını
// LİTERAL olarak yazmak `tsc`'de TS5097'ye çarpar (`allowImportingTsExtensions`
// apps/admin'in `tsconfig.json`'ında YOK — bu dosya o dosyanın sahibi DEĞİL).
// Telafi: modül yolu ÇALIŞMA ZAMANINDA (`new URL(...).href`) kurulur — `tsc`
// statik bir `.ts` belirteci GÖRMEDİĞİ için TS5097 hiç TETİKLENMEZ (ÖLÇÜLDÜ),
// Node'un tip-silmesi ise `.ts` uzantısını ÇALIŞMA ZAMANINDA sorunsuz çözer.
// Yüklenen modülün şekli `isBundleBudgetConfig` ile RUNTIME'DA doğrulanıp
// ANCAK doğrulamadan SONRA somut tipe daraltılır (CLAUDE.md §4: "tip zorlama
// yalnızca runtime doğrulamasından hemen sonra").

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const ADMIN_ROOT = dirname(fileURLToPath(import.meta.url)) + '/..'
const DIST_DIR = resolve(ADMIN_ROOT, 'dist')
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

/** Dış dünyadan (disk) okunan JSON'a Zod OLMADAN tip VERİLMEZ — burada el ile yapısal doğrulama (CLAUDE.md §4 ruhu; bu script `zod`'a bağımlı değil, K7 bağlayıcı). */
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

/**
 * Bildirilen bir önekle `src`'i EŞLEŞEN manifest anahtarlarını bulur.
 * Eşleşme `src`'in KENDİSİ üzerinde `startsWith` ile yapılır (`?` SONRASI
 * sorgu dizesi dahil tutulur ama önek `?` İÇERMEDİĞİ için pratikte `?`
 * ÖNCESİ kısımla eşleşir) — TanStack'ın `?tsr-split=component`/
 * `=errorComponent` sonekleri VE ileride doğacak her split KENDİLİĞİNDEN
 * kapsanır (architect Karar 1).
 */
function findManifestKeysForPrefix(manifest: Manifest, prefix: string): readonly string[] {
  return Object.entries(manifest)
    .filter(([, entry]) => entry.src?.startsWith(prefix) === true)
    .map(([key]) => key)
}

/** Yalnızca STATİK `imports` üzerinde BFS — `dynamicImports` İZLENMEZ (K7, lazy chunk'lar ilk boya değildir). */
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

// ---------------------------------------------------------------------------
// DÜZELTME TURU 2 (`solid` L-N5 — bağlayıcı): iki fail-closed assertion
// `main()`'in İÇİNE gömülüydü (130 satır / 7 sorumluluk, bu sürümün en
// büyük fonksiyonu) ve İZOLE test edilemiyordu. Aşağıdaki iki fonksiyon
// SAF (yan etkisiz — `manifest`/`budget` ALIR, `throw` EDER, I/O yapmaz) ve
// dışa açık (birim testi `scripts/__tests__/check-bundle-budget.test.ts`).
// `architect` Risk 2'nin üç yasağı BURADA da geçerli ve İHLAL EDİLMEDİ:
// davranış DEĞİŞMEDİ (`throw` kaldı, bildirim listesi boşaltılmadı,
// assertion B kaldırılmadı) — yalnızca YERİ değişti.
// ---------------------------------------------------------------------------

/**
 * Fail-closed A (bildirim → manifest, architect Karar 1): bildirilen HER
 * önek EN AZ BİR manifest anahtarıyla eşleşmek ZORUNDA. `process.exitCode
 * = 1` YETMEZ — bu sessiz küçülmeyi DÜZELTİYORUZ, o yüzden FIRLATIYORUZ.
 * Eşleşen anahtarları (sonraki adımların yeniden kullanacağı) döner.
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
 * Fail-closed B (manifest → bildirim, architect Karar 1): `isDynamicEntry:
 * true` taşıyan HER anahtarın `src`'i ya BİR giriş noktası tarafından
 * talep edilmiş ya `deliberatelyLazyRouteSrcs`'te OLMAK ZORUNDA. Aksi
 * hâlde FIRLATILIR — susturulması YASAK.
 *
 * DÜZELTME TURU 2 (`solid` L-N6 — bağlayıcı, İŞ 5): `deliberatelyLazyRouteSrcs`
 * eşleşmesi artık TAM EŞİTLİK (`===`) — ÖNCEDEN `startsWith` de kabul
 * ediliyordu, bu yüzden listeye TEK bir `'src/routes/'` satırı eklemek
 * assertion B'yi TÜMÜYLE etkisizleştirebilirdi (architect Risk 2'nin
 * yasakladığı "assertion B'yi kaldırmak" sonucunun GÖRÜNMEZ eşdeğeri).
 * `allClaimedPrefixes` (giriş noktası bildirimi) BİLEREK önek eşleşmesini
 * KORUYOR — bu architect'in BİLİNÇLİ kararı (`?tsr-split=component` gibi
 * son ekler + ileride doğacak her split kendiliğinden kapsansın, fazla
 * sayma yönü GÜVENLİ yön); yalnızca MUAFİYET listesi daraltıldı.
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

  // --- Paylaşılan çekirdek: yalnızca isEntry girdilerinin KENDİ geçişli -----
  // statik kapanışı, hiçbir rota öneki OLMADAN (raporlama amaçlı, eşik bu
  // sayıya BAĞLANMAZ).
  const sharedCoreKeys = collectStaticImportClosure(manifest, entryKeys)
  const sharedCoreCountedCss = new Set<string>()
  const sharedCoreTotals = sumGzipBytes(manifest, sharedCoreKeys, sharedCoreCountedCss)

  // --- Her giriş noktası için AYRI tohum kümesi + statik kapanış -----------
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

  // Eşik YALNIZCA maksimuma bağlanır (architect Karar 1).
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

// DÜZELTME TURU 2 (T-008/S5 — bu dosya artık `assertDeclaredPrefixesExist`/
// `assertEveryDynamicEntryIsAccountedFor` için Vitest tarafından İTHAL
// EDİLİYOR, bkz. `scripts/__tests__/check-bundle-budget.test.ts`). `main()`
// yalnızca bu dosya DOĞRUDAN çalıştırıldığında (`node ./scripts/check-
// bundle-budget.ts`) koşmalı — İTHAL edildiğinde (test) KOŞMAMALI, aksi
// hâlde her test çalıştırması `dist/.vite/manifest.json`'u aramaya çalışıp
// gereksiz bir hata yazdırır (ÖLÇÜLDÜ — testler EKLENİNCE ortaya çıktı).
const isDirectlyExecuted =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectlyExecuted) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : 'bilinmeyen hata'
    process.stderr.write(`[bundle-budget] Beklenmeyen hata: ${message}\n`)
    process.exitCode = 1
  })
}

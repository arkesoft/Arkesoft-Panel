// @arkesoft/trpc — prosedür yüzeyinin JSON Schema temsilini ÜRETEN TEK I/O
// noktası (ROADMAP v0.0.22, T-026/S1). `package.json`'daki `contract:generate`
// betiği bunu doğrudan `node ./scripts/generate-contract-surface.ts` ile
// çalıştırır.
//
// ⚠⚠ YAZMAYA BAŞLAMADAN `packages/theme-sdk/scripts/generate-contract-
// schema.ts:1-53` dosya başı yorumu OKUNDU ve BİREBİR UYGULANDI (madde 7) —
// aşağıdaki İKİ ithalat BİLEREK dinamik + HESAPLANMIŞ bir yolla yapılır,
// STATİK DEĞİL — ölçülmüş bir Node/TypeScript çatışmasının (theme-sdk'nin
// V-PO1'i) ÇÖZÜMÜ:
//
// (a) `../dist/contract/build-contract-surface.js` VE `../dist/contract/
//     canonicalize.js` — `src/contract/build-contract-surface.ts`'in VE
//     `src/contract/canonicalize.ts`'in DERLENMİŞ hâlleri. Bu betik ÖNCE
//     "pnpm --filter @arkesoft/trpc run build", SONRA çalıştırılmalıdır
//     (aşağıdaki hata mesajı). Zorunlu çünkü `build-contract-surface.ts`
//     KENDİSİ `../routers/app.router.js`'i İTHAL EDER — O da `./job.router.js`/
//     `./member.router.js`/`../authz/permission-procedure.js`/`../trpc.js`
//     (ve ZİNCİRLEME onların İTHALATLARINI) çeker; TÜM bu iç zincir `.js`
//     uzantılı belirteçler taşır (NodeNext kuralı, paketin HER YERİNDE), ve
//     Node'un çalışma zamanı ÇÖZÜMLEYİCİSİ (tip sıyırma modunda DAHİ) bu
//     belirteçleri GERÇEK dosyalarla eşler — derlenmemiş `src/` için bu
//     zincirin HİÇBİR halkası gerçek `.js` dosyası DEĞİLDİR (theme-sdk'nin
//     ÖLÇTÜĞÜ AYNI hata sınıfı: `node a.ts` → `./b.js` yalnızca `./b.ts`
//     varken `ERR_MODULE_NOT_FOUND` fırlatır). `dist/` bu zincirin HER
//     halkasını GERÇEK `.js` olarak üretir — bu yüzden yalnızca `dist/`
//     altındaki modüller ÇALIŞIR.
//
//     Bu yollar STATİK yazılsaydı, `pnpm typecheck` `dist/` henüz YOKSA
//     (temiz ağaç) TS2307 ile KIRILIRDI (theme-sdk'nin ÖLÇTÜĞÜ aynı sonuç).
//     Yolu bir DEĞİŞKENE atayıp `import(degisken)` çağırmak TypeScript'in
//     modül ÇÖZÜMLEMESİNİ (ve bu hatayı) DEVRE DIŞI bırakır — dönüş tipi
//     `Promise<unknown>`'a DÜŞER, bu yüzden sonuç aşağıda ELLE doğrulanır
//     (CLAUDE.md §4: dış dünyadan gelen veri — burada "dış dünya" derlenmiş
//     bir JS modülüdür — Zod/daraltma ile doğrulanır; fonksiyon DEĞERİ Zod'la
//     ifade edilemez, `typeof === 'function'` kontrolü eşdeğer narrowing'dir).
//
// (b) `./serialize-contract-surface.ts` — `scripts/`'in KENDİSİ hiçbir zaman
//     `dist/`'e derlenmez (`tsconfig.build.json`'ın `include` alanı yalnızca
//     `src/**/*`), bu yüzden (a)'nın çözümü (dist'e bakmak) BURADA
//     uygulanamaz. Ama `serialize-contract-surface.ts` TEK bir dış
//     bağımlılığa (`prettier`, ÇIPLAK/bare belirteç) sahiptir, BAŞKA hiçbir
//     göreli dosyayı İTHAL ETMEZ (kendi dosya başı yorumu) — bu yüzden
//     Node'un YERLEŞİK TypeScript çalıştırma desteği (tip sıyırma) bu
//     dosyayı DOĞRUDAN, derlemeden çalıştırabilir, YALNIZCA belirteç `.ts`
//     uzantısını AÇIKÇA taşıyorsa. `.ts` uzantılı bir belirteç STATİK
//     yazılsaydı TS5097 ile KIRILIRDI (`allowImportingTsExtensions` bu
//     paketin tsconfig.json'ında YOK) — bu yüzden (a) İLE AYNI "değişkene
//     ata, sonra `import()` çağır" tekniği kullanılır.
//
// Üç ithalat da `main()`'in İÇİNDE, yalnızca bu dosya DOĞRUDAN
// ÇALIŞTIRILDIĞINDA (aşağıdaki `isDirectlyExecuted()` koruması) tetiklenir —
// `src/__tests__/contract-surface.test.ts` bu dosyayı HİÇ İTHAL ETMEZ (kendi
// serileştirici/kanonikleştirici kopyasını `../contract/*.js` VE
// `../../scripts/serialize-contract-surface.js`'ten STATİK olarak alır,
// `vitest`'in TS çözümleyicisi bu eşlemeyi şeffaf halleder) — bu yüzden test
// `dist/`'in varlığına BAĞLI DEĞİLDİR.
//
// ⚠ GENERATOR SÜRÜM ÇÖZÜMÜ (A-T26-3) — BU dosyanın TEK I/O'sunun bir diğer
// parçası: `zod`/`@trpc/server`'ın KURULU sürümleri `node_modules`'tan
// `package.json` okunarak çözülür (`createRequire().resolve()`, bare
// belirteç — pnpm'in sembolik bağlarını normal Node çözümlemesiyle BULUR).
// Çözülemezse (paket eksik/bozuk) SESSİZCE ATLANMAZ — açık bir `Error`
// fırlatılır (CLAUDE.md §4: beklenen durum için hata fırlat, `null`/varsayım
// DEĞİL).

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { z } from 'zod'

/** `docs/api-contract-surface.json`'ın repo köküne göre MUTLAK yolu. */
const DOCS_CONTRACT_SURFACE_PATH = fileURLToPath(
  new URL('../../../docs/api-contract-surface.json', import.meta.url),
)

const requireFromHere = createRequire(import.meta.url)

/** Bir paketin `package.json`'ındaki `version` alanı — DIŞ DÜNYADAN gelen JSON, Zod ile parse edilir (CLAUDE.md §4). */
const packageVersionSchema = z.object({ version: z.string().min(1) })

/**
 * `packageName/package.json`'ı `node_modules` çözümlemesiyle BULUR ve
 * `version` alanını okur. Çözülemezse (paket kurulu değil/`package.json`
 * beklenen alanı taşımıyor) AÇIKÇA raporlanır — A-T26-3'ün kanıtı.
 */
function readInstalledPackageVersion(packageName: string): string {
  const packageJsonSpecifier = `${packageName}/package.json`

  let resolvedPath: string
  try {
    resolvedPath = requireFromHere.resolve(packageJsonSpecifier)
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : String(error)
    throw new Error(
      `"${packageName}" paketinin sürümü ÇÖZÜLEMEDİ (A-T26-3) — "${packageJsonSpecifier}" node_modules içinde BULUNAMADI. Orijinal hata: ${originalMessage}`,
      { cause: error },
    )
  }

  const rawContents: unknown = JSON.parse(readFileSync(resolvedPath, 'utf8'))
  const parsed = packageVersionSchema.safeParse(rawContents)
  if (!parsed.success) {
    throw new Error(
      `"${packageJsonSpecifier}" beklenen "version" alanını TAŞIMIYOR (A-T26-3) — dosya: ${resolvedPath}`,
    )
  }
  return parsed.data.version
}

type ContractSurfaceGeneratorShape = { readonly zod: string; readonly trpcServer: string }

type BuildContractSurfaceFn = (generator: ContractSurfaceGeneratorShape) => unknown

/** `../dist/contract/build-contract-surface.js`'in beklenen dışa aktarım şeklini doğrulayan tip koruyucu — `as` KULLANMAZ. */
function isBuildContractSurfaceModule(
  value: unknown,
): value is { buildContractSurface: BuildContractSurfaceFn } {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('buildContractSurface' in value)) {
    return false
  }
  return typeof value.buildContractSurface === 'function'
}

/** (a) numaralı ithalat — dosya başı yorumu, `build-contract-surface.js` kolu. */
async function loadBuildContractSurface(): Promise<BuildContractSurfaceFn> {
  const distModulePath = '../dist/contract/build-contract-surface.js'
  let moduleExports: unknown
  try {
    moduleExports = await import(distModulePath)
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : String(error)
    throw new Error(
      `"../dist/contract/build-contract-surface.js" yüklenemedi. Önce "pnpm --filter @arkesoft/trpc run build" ` +
        `çalıştırılmalı (sözleşme yüzeyi derlenmiş çıktıdan üretilir). Orijinal hata: ${originalMessage}`,
      { cause: error },
    )
  }

  if (!isBuildContractSurfaceModule(moduleExports)) {
    throw new Error(
      '"../dist/contract/build-contract-surface.js" beklenen "buildContractSurface" dışa aktarımını taşımıyor.',
    )
  }

  return moduleExports.buildContractSurface
}

type CanonicalizeJsonValueFn = (value: unknown) => unknown

/** `../dist/contract/canonicalize.js`'in beklenen dışa aktarım şeklini doğrulayan tip koruyucu — `as` KULLANMAZ. */
function isCanonicalizeModule(
  value: unknown,
): value is { canonicalizeJsonValue: CanonicalizeJsonValueFn } {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('canonicalizeJsonValue' in value)) {
    return false
  }
  return typeof value.canonicalizeJsonValue === 'function'
}

/** (a) numaralı ithalat — dosya başı yorumu, `canonicalize.js` kolu. */
async function loadCanonicalizeJsonValue(): Promise<CanonicalizeJsonValueFn> {
  const distModulePath = '../dist/contract/canonicalize.js'
  let moduleExports: unknown
  try {
    moduleExports = await import(distModulePath)
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : String(error)
    throw new Error(
      `"../dist/contract/canonicalize.js" yüklenemedi. Önce "pnpm --filter @arkesoft/trpc run build" ` +
        `çalıştırılmalı. Orijinal hata: ${originalMessage}`,
      { cause: error },
    )
  }

  if (!isCanonicalizeModule(moduleExports)) {
    throw new Error(
      '"../dist/contract/canonicalize.js" beklenen "canonicalizeJsonValue" dışa aktarımını taşımıyor.',
    )
  }

  return moduleExports.canonicalizeJsonValue
}

type SerializeContractSurfaceFn = (
  canonicalDocument: unknown,
  targetFilePath: string,
) => Promise<string>

/** `./serialize-contract-surface.ts`'in beklenen dışa aktarım şeklini doğrulayan tip koruyucu — `as` KULLANMAZ. */
function isSerializerModule(
  value: unknown,
): value is { serializeContractSurface: SerializeContractSurfaceFn } {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('serializeContractSurface' in value)) {
    return false
  }
  return typeof value.serializeContractSurface === 'function'
}

/** (b) numaralı ithalat — dosya başı yorumu. */
async function loadSerializeContractSurface(): Promise<SerializeContractSurfaceFn> {
  const serializerModulePath = './serialize-contract-surface.ts'
  const moduleExports: unknown = await import(serializerModulePath)

  if (!isSerializerModule(moduleExports)) {
    throw new Error(
      '"./serialize-contract-surface.ts" beklenen "serializeContractSurface" dışa aktarımını taşımıyor.',
    )
  }

  return moduleExports.serializeContractSurface
}

async function main(): Promise<void> {
  const generator: ContractSurfaceGeneratorShape = {
    zod: readInstalledPackageVersion('zod'),
    trpcServer: readInstalledPackageVersion('@trpc/server'),
  }

  const buildContractSurface = await loadBuildContractSurface()
  const canonicalizeJsonValue = await loadCanonicalizeJsonValue()
  const serializeContractSurface = await loadSerializeContractSurface()

  const document = buildContractSurface(generator)
  const canonicalDocument = canonicalizeJsonValue(document)
  const formatted = await serializeContractSurface(canonicalDocument, DOCS_CONTRACT_SURFACE_PATH)

  writeFileSync(DOCS_CONTRACT_SURFACE_PATH, formatted, 'utf8')
  process.stdout.write(`api-contract-surface.json üretildi → ${DOCS_CONTRACT_SURFACE_PATH}\n`)
}

/** Bu dosyanın `node`'a doğrudan GİRİŞ (entry) modülü olarak verilip verilmediğini denetler — ithal edildiğinde (test) `main()` TETİKLENMEZ. */
function isDirectlyExecuted(): boolean {
  const entryArgument = process.argv[1]
  if (entryArgument === undefined) {
    return false
  }
  return import.meta.url === pathToFileURL(entryArgument).href
}

if (isDirectlyExecuted()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`HATA: ${message}\n`)
    process.exitCode = 1
  })
}

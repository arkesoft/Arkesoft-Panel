// @arkesoft/theme-sdk — tema sözleşmesi JSON Schema'sını ÜRETEN TEK I/O
// noktası (ROADMAP v0.0.9, T-010/S7). `package.json`'daki `schema:generate`
// betiği bunu doğrudan `node ./scripts/generate-contract-schema.ts` ile
// çalıştırır (S1'in iskeleti, DOKUNULMADI).
//
// ⚠ İKİ İTHALAT BİLEREK DİNAMİK + HESAPLANMIŞ (computed) BİR YOL İLE YAPILIR,
// STATİK DEĞİL — ölçülmüş bir Node/TypeScript çatışmasının (V-PO1) ÇÖZÜMÜ:
//
// (a) `../dist/json-schema.js` — `src/json-schema.ts`'in DERLENMİŞ hâli.
//     Bu paket `packages/db`'nin emsalini izler: ÖNCE "pnpm --filter
//     @arkesoft/theme-sdk run build", SONRA bu betik (bkz. aşağıdaki hata
//     mesajı). Zorunlu çünkü `json-schema.ts` KENDİSİ `./manifest/
//     manifest.ts`'i, O da `../errors.js`/`../messages.js`/`../migrations/
//     chain.js`/`./templates.js`/`../settings/primitives.js`'i İTHAL EDER —
//     tüm bu iç ZİNCİR `.js` uzantılı belirteçler taşır (NodeNext kuralı,
//     paketin HER YERİNDE), ve Node'un çalışma zamanı ÇÖZÜMLEYİCİSİ (tip
//     sıyırma modunda DAHİ) bu belirteçleri GERÇEK dosyalarla eşler —
//     derlenmemiş `src/` için bu zincirin HİÇBİR halkası gerçek `.js` dosyası
//     DEĞİLDİR (ÖLÇÜLDÜ: `node a.ts` → `./b.js` yalnızca `./b.ts` varken
//     `ERR_MODULE_NOT_FOUND` fırlatır). `dist/` bu zincirin HER halkasını
//     GERÇEK `.js` olarak üretir — bu yüzden yalnızca `dist/json-schema.js`
//     ÇALIŞIR.
//
//     Bu yol STATİK yazılsaydı (`import ... from '../dist/json-schema.js'`),
//     `pnpm typecheck` `dist/` henüz YOKSA (temiz ağaç, CLAUDE.md §6'nın
//     kapı sırası `typecheck`'i `build`'DEN ÖNCE çalıştırır) TS2307 ile
//     KIRILIRDI (ÖLÇÜLDÜ). Yolu bir DEĞİŞKENE atayıp `import(degisken)`
//     çağırmak TypeScript'in modül ÇÖZÜMLEMESİNİ (ve bu hatayı) DEVRE DIŞI
//     bırakır — dönüş tipi `Promise<unknown>`'a DÜŞER, bu yüzden sonuç
//     aşağıda `isThemeContractJsonSchemaModule` ile ELLE doğrulanır
//     (CLAUDE.md §4: dış dünyadan gelen veri — burada "dış dünya" derlenmiş
//     bir JS modülüdür — Zod/daraltma ile doğrulanır; fonksiyon DEĞERİ Zod'la
//     ifade edilemez, `typeof === 'function'` kontrolü eşdeğer narrowing'dir).
//
// (b) `./serialize-schema.ts` — `scripts/`'in KENDİSİ hiçbir zaman `dist/`'e
//     derlenmez (tsconfig.build.json dosya başı yorumu), bu yüzden (a)'nın
//     çözümü (dist'e bakmak) BURADA uygulanamaz. Ama `serialize-schema.ts`
//     TEK bir dış bağımlılığa (`prettier`, ÇIPLAK/bare belirteç) sahiptir,
//     BAŞKA hiçbir göreli dosyayı İTHAL ETMEZ — bu yüzden Node'un YERLEŞİK
//     TypeScript çalıştırma desteği (tip sıyırma) bu dosyayı DOĞRUDAN,
//     derlemeden çalıştırabilir, YALNIZCA belirteç `.ts` uzantısını AÇIKÇA
//     taşıyorsa (ÖLÇÜLDÜ: `node a.ts` → `./b.ts` ÇALIŞIR, `./b.js` varken
//     BİLE `.ts` dosyasını DEĞİL). `.ts` uzantılı bir belirteç STATİK
//     yazılsaydı TS5097 ile KIRILIRDI (`allowImportingTsExtensions` bu
//     paketin tsconfig.json'ında YOK, S1'in dosyası, DOKUNULMAZ) — bu yüzden
//     (a) İLE AYNI "değişkene ata, sonra `import()` çağır" tekniği kullanılır.
//
// Her iki ithalat da `main()`'in İÇİNDE, yalnızca bu dosya DOĞRUDAN
// ÇALIŞTIRILDIĞINDA (aşağıdaki `isDirectlyExecuted()` koruması) tetiklenir —
// `src/__tests__/contract-schema.test.ts` bu dosyayı HİÇ İTHAL ETMEZ (kendi
// serileştirici kopyasını `./serialize-schema.js`'ten STATİK olarak alır,
// `vitest`'in TS çözümleyicisi `.js`→`.ts` eşlemesini şeffaf halleder) — bu
// yüzden test `dist/`'in varlığına BAĞLI DEĞİLDİR (V-PO1'in ispat şartı).

import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** `docs/theme-contract.schema.json`'ın repo köküne göre MUTLAK yolu. */
const DOCS_SCHEMA_PATH = fileURLToPath(
  new URL('../../../docs/theme-contract.schema.json', import.meta.url),
)

type BuildThemeContractJsonSchemaFn = () => unknown

/** `../dist/json-schema.js`'in beklenen dışa aktarım şeklini doğrulayan tip koruyucu — `as` KULLANMAZ. */
function isThemeContractJsonSchemaModule(
  value: unknown,
): value is { buildThemeContractJsonSchema: BuildThemeContractJsonSchemaFn } {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('buildThemeContractJsonSchema' in value)) {
    return false
  }
  return typeof value.buildThemeContractJsonSchema === 'function'
}

type SerializeThemeContractJsonSchemaFn = (
  schema: unknown,
  targetFilePath: string,
) => Promise<string>

/** `./serialize-schema.ts`'in beklenen dışa aktarım şeklini doğrulayan tip koruyucu — `as` KULLANMAZ. */
function isSerializerModule(
  value: unknown,
): value is { serializeThemeContractJsonSchema: SerializeThemeContractJsonSchemaFn } {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('serializeThemeContractJsonSchema' in value)) {
    return false
  }
  return typeof value.serializeThemeContractJsonSchema === 'function'
}

/** (a) numaralı ithalat — dosya başı yorumu. */
async function loadBuildThemeContractJsonSchema(): Promise<BuildThemeContractJsonSchemaFn> {
  const distModulePath = '../dist/json-schema.js'
  let moduleExports: unknown
  try {
    moduleExports = await import(distModulePath)
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : String(error)
    throw new Error(
      `"../dist/json-schema.js" yüklenemedi. Önce "pnpm --filter @arkesoft/theme-sdk run build" ` +
        `çalıştırılmalı (tema sözleşmesi şeması derlenmiş çıktıdan üretilir). Orijinal hata: ${originalMessage}`,
      { cause: error },
    )
  }

  if (!isThemeContractJsonSchemaModule(moduleExports)) {
    throw new Error(
      '"../dist/json-schema.js" beklenen "buildThemeContractJsonSchema" dışa aktarımını taşımıyor.',
    )
  }

  return moduleExports.buildThemeContractJsonSchema
}

/** (b) numaralı ithalat — dosya başı yorumu. */
async function loadSerializeThemeContractJsonSchema(): Promise<SerializeThemeContractJsonSchemaFn> {
  const serializerModulePath = './serialize-schema.ts'
  const moduleExports: unknown = await import(serializerModulePath)

  if (!isSerializerModule(moduleExports)) {
    throw new Error(
      '"./serialize-schema.ts" beklenen "serializeThemeContractJsonSchema" dışa aktarımını taşımıyor.',
    )
  }

  return moduleExports.serializeThemeContractJsonSchema
}

async function main(): Promise<void> {
  const buildThemeContractJsonSchema = await loadBuildThemeContractJsonSchema()
  const serializeThemeContractJsonSchema = await loadSerializeThemeContractJsonSchema()

  const schema = buildThemeContractJsonSchema()
  const formatted = await serializeThemeContractJsonSchema(schema, DOCS_SCHEMA_PATH)

  writeFileSync(DOCS_SCHEMA_PATH, formatted, 'utf8')
  process.stdout.write(`theme-contract.schema.json üretildi → ${DOCS_SCHEMA_PATH}\n`)
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

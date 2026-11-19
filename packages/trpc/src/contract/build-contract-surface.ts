// @arkesoft/trpc — prosedür yüzeyinin SAF üretimi (ROADMAP v0.0.22, T-026/S1,
// architect'in dokuz maddelik tasarımı — "doğruluk birimi: prosedür yolu +
// işlem türü + girdi/çıktı şemalarının ŞEKLİ")
//
// 🚫 BU DOSYA `src/index.ts`'TEN EXPORT EDİLMEZ VE EDİLMEMELİDİR (R-A3):
// `../routers/app.router.js`'i (ve onun transitif olarak çektiği TÜM sunucu
// tarafı grafiği — `routers/**`, `authz/permission-procedure.js`, `trpc.js`,
// `ports/**`) İTHAL EDER. `index.ts`'ten export edilmesi `__tests__/browser-
// entry-closure.qa.test.ts`'in sözleşmesini (tarayıcı girişi sunucu tarafı
// modül ÇEKMEZ) SESSİZCE kırardı. Tüketiciler bu modülü paket İÇİNDEN
// (`scripts/generate-contract-surface.ts`, `__tests__/contract-surface.
// test.ts`) göreli ithalatla kullanır, `./index.js`/`./server.js`'ten DEĞİL.
// Emsal: `authz/procedure-surface.ts:28-30`'un AYNI uyarısı — jeton burada
// BİLEREK bitişik yazılmadı (literal-jeton kuralı, AGENT_BASELINE.md §5),
// yukarıdaki satırlar "export edilmeyen" yasağı denetleyen bir kapının kendi
// kapsamına girse bile yanlış pozitif ÜRETMESİN diye.
//
// ⚠ SAF: bu dosya dosya YAZMAZ, Node yerleşiklerini (`node:*`) İTHAL ETMEZ,
// `process.`'e erişmez, `prettier` İTHAL ETMEZ. Üretim araç zincirinin
// (zod/@trpc/server) çözülmüş sürümleri de BURADA okunmaz — bu I/O
// gerektirir (paketin kendi `node_modules`'ını okumak), bu yüzden
// {@link ContractSurfaceGenerator} ÇAĞIRANDAN (TEK I/O noktası:
// `scripts/generate-contract-surface.ts`) bir PARAMETRE olarak alınır —
// bu, fonksiyonun SAF kalmasının TEK şartıdır.
//
// ⚠⚠ `io` AÇIKÇA YAZILIR (madde 1, architect'in EN KRİTİK detayı): girdi
// şeması `z.toJSONSchema(parser, { io: 'input', ... })`, çıktı şeması
// `{ io: 'output', ... }` ile üretilir. Varsayılana (`'output'`) GÜVENMEK
// YASAK — üç `.default()` alanı (`platform.schema.ts:89`, `:159`,
// `job-summary.schema.ts:169`, üçü de "limit") GİRDİDE opsiyonel, ÇIKTIDA
// zorunludur; yanlış `io` ile `required` dizisi SESSİZCE yanlış şişer
// (ÖLÇÜLDÜ, bkz. `__tests__/contract-surface.test.ts`'in A-T26-1 kanıtı: gerçek
// `job.list`/`platform.tenantList`/`platform.auditLog` girdi şemalarında
// `io:'output'` ile çağrıldığında `limit` `required`'A GİRER, `io:'input'`
// ile ASLA girmez).
//
// ⚠ `unrepresentable: 'throw'` (VARSAYILAN, AÇIKÇA YAZILI) KORUNUR —
// `theme-sdk`'nin `'any'` tercihi DEVRALINMAZ: `'any'` temsil edilemeyen
// alanı SESSİZCE `{}` ("her şey") yapar, bu bir kırıcı-değişiklik
// dedektöründe KÖR NOKTADIR. Bugün risk SIFIR (ÖLÇÜLDÜ: 17 prosedürün
// 17'sinde de `.transform()`/`.custom()`/`.pipe()`/`.refine()` YOK) — risk
// doğarsa bu fonksiyon GÜRÜLTÜLÜ fırlatır, SESSİZCE `{}` üretmez.
//
// ⚠⚠ `_def.inputs` bir DİZİDİR (`Parser[]`, bugün uzunluk 0 veya 1).
// Uzunluk > 1 SESSİZCE `[0]` ALINMAZ — {@link resolveSingleInputParser}
// GÜRÜLTÜLÜ hata fırlatır (yığılmış `.input()` çağrıları sözleşmeyi
// DEĞİŞTİRİR ve görünmez KALMAMALI). `Parser` bir BİRLEŞİM tipidir; Zod
// şeması olduğu RUNTIME'DA daraltılır ({@link isZodSchema},
// `instanceof z.ZodType`), Zod değilse FIRLATILIR — `as` KULLANILMAZ
// (emsal: `__tests__/authz-consistency.test.ts:54-93`, "Zod ile parse →
// tRPC yükseltmesi GÜRÜLTÜLÜ kırar, sessiz boş envanter üretip assert'leri
// vacuous YAPMAZ").
//
// Madde 9 (TÜRETİLMİŞ sayaçlar): `namespaceCount`/`procedureCount` BU
// dosyada da hesaplanır (dokümanın kendi alanları) AMA `__tests__/contract-
// surface.test.ts` bunlara GÜVENMEZ — canlı router'dan BAĞIMSIZ olarak
// YENİDEN hesaplar. Buradaki hesaplama yalnızca ARTEFAKTIN kendi içinde
// `jq` ile okunabilir bir alan sunmak içindir.

import { z } from 'zod'

import { appRouter } from '../routers/app.router.js'

/** Router'ın kendi `_def.type` kaydından okunan işlem türü. */
export type ContractSurfaceOperation = 'query' | 'mutation'

/**
 * Üretim araç zincirinin çözülmüş sürümleri. I/O gerektirdiği için bu dosya
 * BUNU OKUMAZ — çağıran (`scripts/generate-contract-surface.ts`) `node_modules`
 * okuyarak hesaplar ve PARAMETRE olarak geçirir (bu dosyanın SAF kalmasının
 * TEK şartı, dosya başı yorumu).
 */
export interface ContractSurfaceGenerator {
  readonly zod: string
  readonly trpcServer: string
}

/**
 * Tek bir prosedürün serileştirilmiş şekli. `input` `null` OLABİLİR —
 * girdi YOKSA (`session.me` gibi, `_def.inputs.length === 0`) `input: null`.
 * Bu paketteki HİÇBİR prosedür `.output()` çağrısını ATLAMIYOR (ÖLÇÜLDÜ,
 * 17/17) ama `output` da AYNI nedenle NULLABLE: gelecekte biri atlarsa
 * `output: null` aynı biçimde ifade eder, sessizce DÜŞMEZ.
 */
export interface ContractSurfaceProcedureEntry {
  readonly operation: ContractSurfaceOperation
  readonly input: z.core.JSONSchema.BaseSchema | null
  readonly output: z.core.JSONSchema.BaseSchema | null
}

/** `docs/api-contract-surface.json`'ın kök şekli. */
export interface ContractSurfaceDocument {
  readonly formatVersion: 1
  readonly generator: ContractSurfaceGenerator
  /** ⚠ TÜRETİLMİŞ alan — dosya başı yorumu madde 9. */
  readonly namespaceCount: number
  /** ⚠ TÜRETİLMİŞ alan — AYNI gerekçe. */
  readonly procedureCount: number
  readonly procedures: Readonly<Record<string, ContractSurfaceProcedureEntry>>
}

/**
 * `value`'nun `key` adlı özelliğini taşıdığını daraltır — FONKSİYON
 * değerlerini de kabul eder (tRPC'nin prosedür kayıtları fonksiyondur).
 * `__tests__/authz-consistency.test.ts`'in `hasProperty`'siyle AYNI desen;
 * test dosyasından İTHAL EDİLMEZ (üretim kodu bir test yardımcısına bağımlı
 * OLMAZ — bağımlılık yönü tersine döner).
 */
function hasProperty<Key extends string>(value: unknown, key: Key): value is Record<Key, unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') && value !== null && key in value
  )
}

/** `value[key]`'i `unknown` olarak okur; yoksa `undefined`. */
function readProperty(value: unknown, key: string): unknown {
  return hasProperty(value, key) ? value[key] : undefined
}

/** `value`'nun DÜZ bir nesne (dizi/`null`/fonksiyon DEĞİL) olduğunu daraltır. */
function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `value`'nun `'query'`/`'mutation'` olduğunu daraltır. */
function isOperation(value: unknown): value is ContractSurfaceOperation {
  return value === 'query' || value === 'mutation'
}

/** `value`'nun bir Zod şeması olduğunu RUNTIME'DA daraltır — `as` KULLANILMAZ (dosya başı yorumu). */
function isZodSchema(value: unknown): value is z.ZodType {
  return value instanceof z.ZodType
}

/**
 * `value`'nun bir dizi olduğunu `unknown[]` olarak daraltır —
 * `Array.isArray`'in yerleşik imzası (`arg is any[]`) BİLEREK kullanılmaz:
 * ondan doğrudan destructure etmek `@typescript-eslint/no-unsafe-assignment`'ı
 * tetikler (ÖLÇÜLDÜ) — bu sarmalayıcı akışa `any` SIZDIRMASIN diye `unknown[]`
 * döner (`contract/canonicalize.ts`'teki `isUnknownArray`'in AYNI deseni).
 */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

/**
 * Router'ın GERÇEK prosedür kaydı: `appRouter._def.procedures` — anahtarı
 * NOKTALI TAM YOL (`namespace.action`) olan DÜZ bir nesne (A-A2'nin ÖLÇÜLMÜŞ
 * cevabı, `authz-consistency.test.ts`'in AYNI iç API okuması).
 */
function readProcedureRecord(): Readonly<Record<string, unknown>> {
  const procedures = readProperty(readProperty(appRouter, '_def'), 'procedures')
  if (!isPlainObject(procedures)) {
    throw new Error(
      '"appRouter._def.procedures" beklenen düz nesne biçiminde değil — tRPC iç API\'si değişmiş olabilir.',
    )
  }
  return procedures
}

/**
 * `_def.inputs`'tan TEK bir Zod girdi parser'ı okur — dizi UZUNLUĞUNA göre
 * üç dal: 0 → girdi YOK (`null`), 1 → tek parser, >1 → GÜRÜLTÜLÜ hata
 * (dosya başı yorumu, madde 4). Export edilir: `__tests__/contract-surface.
 * test.ts` bu üç dalı GERÇEK router'a dokunmadan (sentetik `rawInputs`
 * diziyle) birim test eder.
 */
export function resolveSingleInputParser(
  procedurePath: string,
  rawInputs: unknown,
): z.ZodType | null {
  if (!isUnknownArray(rawInputs)) {
    throw new Error(
      `"${procedurePath}" prosedürünün "_def.inputs" alanı dizi DEĞİL — tRPC iç API'si değişmiş olabilir.`,
    )
  }
  if (rawInputs.length === 0) {
    return null
  }
  if (rawInputs.length > 1) {
    throw new Error(
      `"${procedurePath}" prosedürü BİRDEN FAZLA (.input() zinciri, ${String(rawInputs.length)} adet) girdi parser'ı taşıyor — sözleşme yüzeyi bunu SESSİZCE "ilkini al" ile ÖZETLEMEZ; yığılmış .input() çağrıları sözleşmeyi değiştirir, elle incele.`,
    )
  }
  const [parser] = rawInputs
  if (!isZodSchema(parser)) {
    throw new Error(
      `"${procedurePath}" prosedürünün girdi parser'ı bir Zod şeması DEĞİL — tRPC'nin "Parser" birleşiminin Zod-dışı dalı (ör. fonksiyon tabanlı doğrulayıcı) bu sürümde TEMSİL EDİLEMEZ.`,
    )
  }
  return parser
}

/**
 * `_def.output`'tan Zod çıktı parser'ını okur — tanımsızsa (`.output()`
 * atlanmışsa) `null` döner. Export edilir: {@link resolveSingleInputParser}
 * ile AYNI test erişilebilirliği gerekçesi.
 */
export function resolveOutputParser(procedurePath: string, rawOutput: unknown): z.ZodType | null {
  if (rawOutput === undefined) {
    return null
  }
  if (!isZodSchema(rawOutput)) {
    throw new Error(
      `"${procedurePath}" prosedürünün çıktı parser'ı bir Zod şeması DEĞİL — tRPC'nin "Parser" birleşiminin Zod-dışı dalı bu sürümde TEMSİL EDİLEMEZ.`,
    )
  }
  return rawOutput
}

/** Bir Zod parser'ını BELİRTİLEN `io` ile JSON Schema'ya çevirir — `null` girdi `null` döner (madde 1 + madde 3). */
function serializeParser(
  parser: z.ZodType | null,
  io: 'input' | 'output',
): z.core.JSONSchema.BaseSchema | null {
  if (parser === null) {
    return null
  }
  return z.toJSONSchema(parser, { io, unrepresentable: 'throw' })
}

/** `job.list` → `'job'` — yol'un NOKTADAN ÖNCEKİ bölümü, namespace sayımı için. */
function namespaceOf(procedurePath: string): string {
  const separatorIndex = procedurePath.indexOf('.')
  return separatorIndex === -1 ? procedurePath : procedurePath.slice(0, separatorIndex)
}

/**
 * Router'ın GERÇEK prosedür envanterini (`appRouter._def.procedures`)
 * {@link ContractSurfaceDocument}'a çevirir. SAF — I/O yapmaz, dosya
 * başı yorumunda listelenen üç kritik kural (`io`, `unrepresentable`,
 * `inputs.length>1`) BURADA uygulanır.
 */
export function buildContractSurface(generator: ContractSurfaceGenerator): ContractSurfaceDocument {
  const rawProcedures = readProcedureRecord()
  const sortedPaths = Object.keys(rawProcedures).sort()

  const procedures: Record<string, ContractSurfaceProcedureEntry> = {}
  for (const procedurePath of sortedPaths) {
    const procedureValue = rawProcedures[procedurePath]
    const def = readProperty(procedureValue, '_def')

    const rawOperation = readProperty(def, 'type')
    if (!isOperation(rawOperation)) {
      throw new Error(
        `"${procedurePath}" prosedürünün "_def.type" alanı "query"/"mutation" DEĞİL (okunan: ${String(rawOperation)}) — tRPC iç API'si değişmiş olabilir.`,
      )
    }

    const inputParser = resolveSingleInputParser(procedurePath, readProperty(def, 'inputs'))
    const outputParser = resolveOutputParser(procedurePath, readProperty(def, 'output'))

    procedures[procedurePath] = {
      operation: rawOperation,
      input: serializeParser(inputParser, 'input'),
      output: serializeParser(outputParser, 'output'),
    }
  }

  const namespaceCount = new Set(sortedPaths.map((procedurePath) => namespaceOf(procedurePath)))
    .size

  return {
    formatVersion: 1,
    generator,
    namespaceCount,
    procedureCount: sortedPaths.length,
    procedures,
  }
}

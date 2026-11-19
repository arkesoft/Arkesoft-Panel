// @arkesoft/trpc — AC: sözleşme yüzeyi üretiminin BİRİM + REGRESYON testleri
// (ROADMAP v0.0.22, T-026/S1)
//
// Bu dosya `../contract/build-contract-surface.js` / `../contract/
// canonicalize.js`'i `src/`'ten STATİK olarak İTHAL EDER — `dist/`'in VARLIĞI
// bu testi ETKİLEMEZ (temiz bir ağaçta, `rm -rf dist`, BİLE yeşil kalır).
// `../../scripts/serialize-contract-surface.js`'i de STATİK ithal eder
// (`scripts/` dizini, vitest'in Vite tabanlı çözümleyicisi `.js`→`.ts`
// eşlemesini ÇALIŞMA ZAMANINDA şeffafça halleder — generator betiğinin
// (`scripts/generate-contract-surface.ts`) AKSİNE bu test PLAIN `node` İLE
// ÇALIŞTIRILMAZ, bu yüzden generator'ın dinamik+hesaplanmış ithalat
// tekniğine (theme-sdk V-PO1 emsali) hiç GEREK YOK — `packages/theme-sdk/
// src/__tests__/contract-schema.test.ts`'in AYNI gerekçesi).
//
// ⚠ GENERATOR SÜRÜM ÇÖZÜMÜ burada da `generate-contract-surface.ts`'in AYNI
// yöntemiyle (node_modules'tan `package.json` okuma) TEKRARLANIR — İKİ
// KOPYA sapma riski taşır AMA bu TEST dosyasıdır, üretim kodu DEĞİL
// (`__tests__/authz-consistency.test.ts`'in `hasProperty`/`readProperty`
// yardımcılarını üretim kodundan AYRI TUTMA deseninin AYNI sınıf istisnası
// — bağımlılık yönü tersine dönmesin).

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  buildContractSurface,
  resolveOutputParser,
  resolveSingleInputParser,
} from '../contract/build-contract-surface.js'
import type { ContractSurfaceGenerator } from '../contract/build-contract-surface.js'
import { canonicalizeJsonValue } from '../contract/canonicalize.js'
import { appRouter } from '../routers/app.router.js'
import { jobListInputSchema } from '../schemas/job-summary.schema.js'
import { serializeContractSurface } from '../../scripts/serialize-contract-surface.js'
// Katman 1 bağlantısı (ROADMAP v0.0.22, T-026/S2 handoff'u, "Katman 1 — anlamsal
// (SINIFLANDIRAN)" / "Katman 2 — bayt (DETERMİNİZM)" ayrımı): aşağıdaki iki
// ithalat yalnızca EK yapar, bu dosyanın (S1) ÜSTÜNDEKİ hiçbir satırına
// DOKUNMAZ. `classifyContractChange` S2'nin SAF sınıflandırıcısıdır;
// `ContractSurfaceProcedureEntry` diskteki JSON'u `ContractSurfaceDocument`
// şekline z.custom() ile (Zod doğrulamasından HEMEN SONRA tip bağlama,
// CLAUDE.md §4) bağlamak için kullanılır — `as` KULLANILMAZ.
import { classifyContractChange } from '../contract/classify-contract-change.js'
import type { ContractSurfaceProcedureEntry } from '../contract/build-contract-surface.js'

/** `docs/api-contract-surface.json`'ın repo köküne göre MUTLAK yolu (theme-sdk'nin AC12 testinin AYNI deseni). */
const DOCS_CONTRACT_SURFACE_PATH = fileURLToPath(
  new URL('../../../../docs/api-contract-surface.json', import.meta.url),
)

const requireFromHere = createRequire(import.meta.url)
const packageVersionSchema = z.object({ version: z.string().min(1) })

/** `generate-contract-surface.ts`'in AYNI sürüm çözümü — dosya başı yorumu. */
function readInstalledPackageVersion(packageName: string): string {
  const resolvedPath = requireFromHere.resolve(`${packageName}/package.json`)
  const rawContents: unknown = JSON.parse(readFileSync(resolvedPath, 'utf8'))
  return packageVersionSchema.parse(rawContents).version
}

/** Testin GERÇEK generator'ı — script'in üreteceğiyle BİREBİR aynı (freshness testinin ÖN ŞARTI). */
const REAL_GENERATOR: ContractSurfaceGenerator = {
  zod: readInstalledPackageVersion('zod'),
  trpcServer: readInstalledPackageVersion('@trpc/server'),
}

// ---------------------------------------------------------------------------
// Madde 9 — router envanterinin BAĞIMSIZ yeniden hesaplanması
// (`__tests__/authz-consistency.test.ts`'in A-A2 iç API okumasının AYNI
// deseni — kasıtlı DUPLİKASYON, üretim kodu bir test yardımcısına bağımlı
// OLMASIN diye)
// ---------------------------------------------------------------------------

function hasProperty<Key extends string>(value: unknown, key: Key): value is Record<Key, unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') && value !== null && key in value
  )
}

function readProperty(value: unknown, key: string): unknown {
  return hasProperty(value, key) ? value[key] : undefined
}

const procedureRecordSchema = z.record(z.string(), z.unknown())

/** `appRouter._def.procedures`'ın GERÇEK anahtar kümesi — madde 9'un "dosyaya güvenme" yasağının kanıtı. */
function readRouterProcedurePaths(): readonly string[] {
  const procedures = procedureRecordSchema.parse(
    readProperty(readProperty(appRouter, '_def'), 'procedures'),
  )
  return Object.keys(procedures)
}

function namespaceOf(procedurePath: string): string {
  const separatorIndex = procedurePath.indexOf('.')
  return separatorIndex === -1 ? procedurePath : procedurePath.slice(0, separatorIndex)
}

describe('madde 9 — namespaceCount/procedureCount CANLI router’dan yeniden hesaplanır', () => {
  it('router envanteri BOŞ DEĞİL ve LİTERAL 17 prosedür / 7 namespace verir (vacuous olmama kanıtı)', () => {
    const paths = readRouterProcedurePaths()

    expect(paths.length).toBe(17)
    expect(new Set(paths.map(namespaceOf)).size).toBe(7)
  })

  it('buildContractSurface() çıktısının procedureCount/namespaceCount/procedures anahtarları CANLI hesaplamayla eşleşir (dosyanın kendi alanına GÜVENİLMEZ)', () => {
    const paths = readRouterProcedurePaths()
    const document = buildContractSurface(REAL_GENERATOR)

    expect(document.procedureCount).toBe(paths.length)
    expect(document.namespaceCount).toBe(new Set(paths.map(namespaceOf)).size)
    expect(Object.keys(document.procedures).sort()).toEqual([...paths].sort())
  })

  it('"procedures" anahtarları ZATEN sıralı döner (D3, buildContractSurface’in kendi garantisi)', () => {
    const document = buildContractSurface(REAL_GENERATOR)
    const keys = Object.keys(document.procedures)

    expect(keys).toEqual([...keys].sort())
  })

  it('formatVersion === 1 ve generator SOMUT semver dizeleri taşır (A-T26-3)', () => {
    const document = buildContractSurface(REAL_GENERATOR)

    expect(document.formatVersion).toBe(1)
    expect(document.generator.zod).toMatch(/^\d+\.\d+\.\d+/)
    expect(document.generator.trpcServer).toMatch(/^\d+\.\d+\.\d+/)
  })
})

// ---------------------------------------------------------------------------
// A-T26-1 — `io` AÇIKÇA YAZILIR, varsayılana güvenilmez
// ---------------------------------------------------------------------------

describe('A-T26-1 — "io" açıkça "input": üç .default() alanı GİRDİDE opsiyonel kalır', () => {
  it('job.list / platform.tenantList / platform.auditLog girdi şemasında "limit" "required" DİZİSİNDE YOK (ama "properties"te VAR — "hiç yok"a indirgenmez)', () => {
    const document = buildContractSurface(REAL_GENERATOR)

    for (const procedurePath of ['job.list', 'platform.tenantList', 'platform.auditLog'] as const) {
      const entry = document.procedures[procedurePath]
      if (entry === undefined || entry.input === null) {
        throw new Error(`"${procedurePath}" girdi şeması beklenmedik biçimde tanımsız/null.`)
      }

      expect(entry.input.required ?? []).not.toContain('limit')
      expect(entry.input.properties?.['limit']).toBeDefined()
    }
  })

  it('KARŞIT KANIT — AYNI şema "io: output" ile üretilseydi "limit" "required" OLURDU (yanlış io riski GÖRÜNÜR kılınır)', () => {
    const wrongIoSchema = z.toJSONSchema(jobListInputSchema, {
      io: 'output',
      unrepresentable: 'throw',
    })

    expect(wrongIoSchema.required).toContain('limit')
  })

  it('session.me gibi girdisiz bir prosedürde "input" "null"dır (boş nesne DEĞİL)', () => {
    const document = buildContractSurface(REAL_GENERATOR)
    const entry = document.procedures['session.me']

    expect(entry?.input).toBeNull()
    expect(entry?.output).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Madde 4 — `_def.inputs`/`_def.output` değer olarak okunur; uzunluk > 1
// SESSİZCE [0] alınmaz, GÜRÜLTÜLÜ fırlatır
// ---------------------------------------------------------------------------

describe('resolveSingleInputParser — "_def.inputs" dizisinin üç dalı (A-T26-2, madde 4)', () => {
  it('uzunluk 0 → null (girdi yok)', () => {
    expect(resolveSingleInputParser('test.path', [])).toBeNull()
  })

  it('uzunluk 1, Zod şeması → AYNI referans döner (değer olarak okundu, tip bildiriminden DEĞİL)', () => {
    const schema = z.object({ a: z.string() })

    expect(resolveSingleInputParser('test.path', [schema])).toBe(schema)
  })

  it('uzunluk > 1 → GÜRÜLTÜLÜ fırlatır, SESSİZCE "[0]" ALINMAZ', () => {
    const first = z.object({ a: z.string() })
    const second = z.object({ b: z.string() })

    expect(() => resolveSingleInputParser('test.path', [first, second])).toThrow(/BİRDEN FAZLA/)
  })

  it('Zod-dışı bir parser (fonksiyon tabanlı doğrulayıcı) → FIRLAR, "as" ile sessizce KABUL EDİLMEZ', () => {
    const nonZodParser = (): unknown => undefined

    expect(() => resolveSingleInputParser('test.path', [nonZodParser])).toThrow(/Zod şeması DEĞİL/)
  })

  it('"_def.inputs" dizi DEĞİLSE → FIRLAR (tRPC iç API’si değişmiş senaryosu)', () => {
    expect(() => resolveSingleInputParser('test.path', 'not-an-array')).toThrow(/dizi DEĞİL/)
  })
})

describe('resolveOutputParser — "_def.output" değer olarak okunur (A-T26-2)', () => {
  it('tanımsız → null (.output() atlanmış senaryosu)', () => {
    expect(resolveOutputParser('test.path', undefined)).toBeNull()
  })

  it('Zod şeması → AYNI referans döner', () => {
    const schema = z.object({ a: z.string() })

    expect(resolveOutputParser('test.path', schema)).toBe(schema)
  })

  it('Zod-dışı değer → FIRLAR', () => {
    expect(() => resolveOutputParser('test.path', 'not-a-schema')).toThrow(/Zod şeması DEĞİL/)
  })
})

// ---------------------------------------------------------------------------
// canonicalizeJsonValue — D1/D2 determinizm
// ---------------------------------------------------------------------------

describe('canonicalizeJsonValue — D1 (anahtar sıralama) + D2 (required sıralama, diğer diziler KORUNUR)', () => {
  it('nesne anahtarları özyinelemeli alfabetik sıralanır (D1)', () => {
    const input = { b: 1, a: { d: 2, c: 3 } }
    const canonical = canonicalizeJsonValue(input)

    expect(canonical).toEqual({ a: { c: 3, d: 2 }, b: 1 })
    expect(JSON.stringify(canonical)).toBe('{"a":{"c":3,"d":2},"b":1}')
  })

  it('"required" dizisi sıralanır (D2)', () => {
    const input = { required: ['b', 'a'] }

    expect(JSON.stringify(canonicalizeJsonValue(input))).toBe('{"required":["a","b"]}')
  })

  it('"enum" gibi DİĞER diziler SIRASINI KORUR — konumsal anlam taşır (D2 istisnası)', () => {
    const input = { enum: ['z', 'a', 'm'] }

    expect(JSON.stringify(canonicalizeJsonValue(input))).toBe('{"enum":["z","a","m"]}')
  })

  it('dizi İÇİNDEKİ nesnelerin KENDİ anahtarları SIRALANIR, dizinin eleman sırası KORUNUR', () => {
    const input = { oneOf: [{ z: 1, a: 2 }, { y: 3 }] }

    expect(JSON.stringify(canonicalizeJsonValue(input))).toBe('{"oneOf":[{"a":2,"z":1},{"y":3}]}')
  })

  it('girdiyi MUTASYONA UĞRATMAZ', () => {
    const input = { required: ['b', 'a'] }
    canonicalizeJsonValue(input)

    expect(input.required).toEqual(['b', 'a'])
  })
})

// ---------------------------------------------------------------------------
// serializeContractSurface — TEK serileştirici, determinizm + bayatlık
// ---------------------------------------------------------------------------

describe('serializeContractSurface — TEK serileştirici, Prettier uyumlu, determinist', () => {
  it('AYNI kanonik girdi İKİ KEZ serileştirildiğinde BİREBİR aynı dizeyi üretir', async () => {
    const document = buildContractSurface(REAL_GENERATOR)
    const canonical = canonicalizeJsonValue(document)

    const first = await serializeContractSurface(canonical, DOCS_CONTRACT_SURFACE_PATH)
    const second = await serializeContractSurface(canonical, DOCS_CONTRACT_SURFACE_PATH)

    expect(first).toBe(second)
  })

  it('docs/api-contract-surface.json BAYAT DEĞİL — bellekte yeniden üretilen belge diskteki dosyayla BAYT-BİREBİR eşleşir', async () => {
    const document = buildContractSurface(REAL_GENERATOR)
    const canonical = canonicalizeJsonValue(document)
    const expectedContents = await serializeContractSurface(canonical, DOCS_CONTRACT_SURFACE_PATH)
    const actualContents = readFileSync(DOCS_CONTRACT_SURFACE_PATH, 'utf8')

    expect(actualContents).toBe(expectedContents)
  })
})

// ---------------------------------------------------------------------------
// Katman 1 bağlantısı (ROADMAP v0.0.22, T-026/S2) — ANLAMSAL freshness.
// Yukarıdaki "serializeContractSurface" bloğu Katman 2'dir (BAYT-BİREBİR,
// "kırıldı mı" sorusunu yanıtlar). Bu blok Katman 1'dir (SINIFLANDIRAN,
// "ne sınıfta" sorusunu yanıtlar): diskteki belge ile CANLI router'dan
// üretilen belge `classifyContractChange` ile karşılaştırılır ve ANLAMSAL
// olarak SIFIR fark / `PATCH` beklenir. İkisi birbirinin YERİNE geçmez —
// T-026/S2 handoff'unun "Katman 2 'kırıldı'yı, Katman 1 'ne sınıfta'yı
// söyler" ayrımı (bu dosyanın S1 tarafından yazılan yukarıdaki satırlarına
// DOKUNULMADI — bu blok tamamen EKtir).
// ---------------------------------------------------------------------------

/**
 * `ContractSurfaceProcedureEntry['input']`/`['output']` ya `null` YA DA bir
 * JSON Schema DÜĞÜMÜDÜR (düz nesne, dizi/ilkel DEĞİL). TAM JSON Schema
 * GRAMERİNİ doğrulamaz — konu bu TESTİN kapsamı DIŞINDA (konu:
 * `classifyContractChange`'in ANLAMSAL karşılaştırması) — ama `() => true`
 * GİBİ TOTOLOJİK DEĞİLDİR (F4 düzeltmesi, T-026 düzeltme tur 1, `solid`
 * medium bulgusu: önceki hâl SEMANTİK olarak `as` ile EŞDEĞERDİ, dosya başı
 * "`as` KULLANILMAZ" iddiasıyla ÇELİŞİYORDU). Bir dizi/sayı/dize geçerse
 * GERÇEKTEN REDDEDER — `__tests__/contract-surface.test.ts`'in KENDİ
 * testiyle (aşağıda) doğrulanır.
 */
function isJsonSchemaNodeOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'object' && !Array.isArray(value))
}

/** Diskten okunan `docs/api-contract-surface.json`'ın beklenen üst-seviye şekli — DIŞ DÜNYA verisi, Zod ile parse edilir (CLAUDE.md §4). */
const diskContractSurfaceDocumentSchema = z.object({
  formatVersion: z.literal(1),
  generator: z.object({ zod: z.string().min(1), trpcServer: z.string().min(1) }),
  namespaceCount: z.number().int().nonnegative(),
  procedureCount: z.number().int().nonnegative(),
  procedures: z.record(
    z.string(),
    z.object({
      operation: z.union([z.literal('query'), z.literal('mutation')]),
      // `z.custom()`: Zod doğrulamasından HEMEN SONRA tip bağlama (CLAUDE.md
      // §4) — `isJsonSchemaNodeOrNull` GERÇEK bir runtime kontrolüdür,
      // `as` KULLANILMAZ.
      input: z.custom<ContractSurfaceProcedureEntry['input']>(isJsonSchemaNodeOrNull),
      output: z.custom<ContractSurfaceProcedureEntry['output']>(isJsonSchemaNodeOrNull),
    }),
  ),
})

describe('Katman 1 bağlantısı — docs/api-contract-surface.json ↔ CANLI router, ANLAMSAL fark YOK (classifyContractChange, T-026/S2)', () => {
  it('diskteki belge CANLI belgeyle classifyContractChange ile karşılaştırıldığında 0 fark / "PATCH" döner', () => {
    const diskRawContents: unknown = JSON.parse(readFileSync(DOCS_CONTRACT_SURFACE_PATH, 'utf8'))
    const diskDocument = diskContractSurfaceDocumentSchema.parse(diskRawContents)
    const liveDocument = buildContractSurface(REAL_GENERATOR)

    const classification = classifyContractChange(diskDocument, liveDocument)

    expect(classification.diffs).toHaveLength(0)
    expect(classification.severity).toBe('PATCH')
    expect(classification.generatorDrift.changed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// T-026 düzeltme tur 1 — F4: `isJsonSchemaNodeOrNull` TOTOLOJİK DEĞİL,
// GERÇEKTEN reddediyor (`solid` medium bulgusu — eski `() => true` semantik
// olarak `as` ile eşdeğerdi).
// ---------------------------------------------------------------------------

describe('F4 düzeltmesi — isJsonSchemaNodeOrNull totolojik DEĞİL, dizi/sayı/dizeyi GERÇEKTEN reddeder', () => {
  it('null → kabul (girdisiz/çıktısız prosedür)', () => {
    expect(isJsonSchemaNodeOrNull(null)).toBe(true)
  })

  it('düz nesne → kabul (JSON Schema düğümü)', () => {
    expect(isJsonSchemaNodeOrNull({ type: 'string' })).toBe(true)
  })

  it('dizi → REDDEDİLİR (önceki "() => true" bunu da kabul ederdi)', () => {
    expect(isJsonSchemaNodeOrNull(['type', 'string'])).toBe(false)
  })

  it('dize → REDDEDİLİR', () => {
    expect(isJsonSchemaNodeOrNull('type')).toBe(false)
  })

  it('sayı → REDDEDİLİR', () => {
    expect(isJsonSchemaNodeOrNull(42)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// `security` tur 1 bulgusu (medium) — "otomatik yayımlama hattının içerik
// kapısı yok": `contract-surface.test.ts:276-283`'teki bayt testi yalnızca
// "disk == yeniden üretilen" der (yeniden üretim bunu HER ZAMAN sağlar),
// `guards.sh` alt kontrol 3 yalnızca VARLIK denetler. Aşağıdaki üç kapı
// PUBLIC depoya commit edilen artefaktın İÇERİĞİNİ fail-closed denetler —
// bugünkü ölçümle önemsiz (hepsi PASS), ama bir `.describe()`/`.default()`
// ile iç bilgi/ortam değeri sızdığında KIRMIZI yanar.
// ---------------------------------------------------------------------------

/** `value`'nun DÜZ bir nesne (dizi/`null` DEĞİL) olduğunu daraltır — bu dosyanın KENDİ kopyası (üretim kodu bir test yardımcısına bağımlı OLMAZ, dosya başı yorumu madde 9'un AYNI gerekçesi). */
function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Bir JSON değerini ÖZYİNELEMELİ gezer; her (anahtar, değer) çiftini
 * `visit`'e verir. `pattern`/`$schema`/`format` gibi anahtarların DEĞERİNİN
 * İÇİNDE arama yapılıp yapılmayacağına KARAR VERMEZ — o eleme ÇAĞIRANIN işi
 * (security tur 1 §5'in "naif tarama FP verir" ölçümü; bu gezici ham veriyi
 * verir, politika çağıranda).
 *
 * ⚠⚠ DÜZELTME (T-026 düzeltme tur 2, `security` medium bulgusu — dizi
 * elemanları için `visit()` HİÇ ÇAĞRILMIYORDU): eski gövde dizi dalında
 * yalnızca ÖZYİNELERdi, kendi `visit`'i çağırmıyordu — dizi İÇİNDEKİ dizeler
 * (ör. `z.enum([...])` ÇALIŞMA ZAMANI verisinden üretilirse, kiracı
 * slug'ları/iş kimlikleri gibi) D6 taramasının TAMAMEN DIŞINDA kalıyordu.
 * Şimdi her dizi elemanı için `visit(`${arrayItemKey}[]`, item)` ÇAĞRILIR —
 * `arrayItemKey` bir önceki `isPlainRecord` dalından TAŞINAN anahtardır
 * (dizinin KENDİSİNİN hangi alanda olduğu). Üst seviyede (dizi DEĞİLSE)
 * `arrayItemKey` `undefined` kalır, bu yüzden en dış çağrıda (bu dosyanın
 * `document` kökünde) sentetik bir anahtar ÜRETİLMEZ — yalnızca gerçek bir
 * ebeveyn anahtarı VARSA sentetik `[]` soneki eklenir.
 */
function walkJsonEntries(
  value: unknown,
  visit: (key: string, val: unknown) => void,
  arrayItemKey?: string,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (arrayItemKey !== undefined) {
        visit(`${arrayItemKey}[]`, item)
      }
      walkJsonEntries(item, visit, arrayItemKey)
    }
    return
  }
  if (isPlainRecord(value)) {
    for (const key of Object.keys(value)) {
      const child = value[key]
      visit(key, child)
      walkJsonEntries(child, visit, key)
    }
  }
}

describe('security tur 1 (medium) — otomatik yayımlama hattının İÇERİK kapıları (PUBLIC depo, D6)', () => {
  it('(a) üretilen yüzeyde description/title/$comment/examples anahtarı YOK (bugün 0 — ilk emisyonda İÇ BİLGİ eklenirse kırmızı yanar)', () => {
    const document = buildContractSurface(REAL_GENERATOR)
    const forbiddenMetadataKeys: readonly string[] = [
      'description',
      'title',
      '$comment',
      'examples',
    ]
    const foundKeys: string[] = []

    walkJsonEntries(document, (key) => {
      if (forbiddenMetadataKeys.includes(key)) {
        foundKeys.push(key)
      }
    })

    expect(foundKeys).toEqual([])
  })

  it('(b) üretilen yüzeyde her "default" değeri number/boolean (hesaplanmış/ortam değişkenine bağlı bir dize SIZDIRMAZ)', () => {
    const document = buildContractSurface(REAL_GENERATOR)
    const defaultValues: unknown[] = []

    walkJsonEntries(document, (key, value) => {
      if (key === 'default') {
        defaultValues.push(value)
      }
    })

    // Vacuous olmama kanıtı — bugün 3 `.default()` alanı var (job.list,
    // platform.tenantList, platform.auditLog'un "limit" alanı).
    expect(defaultValues.length).toBeGreaterThan(0)
    for (const value of defaultValues) {
      expect(typeof value === 'number' || typeof value === 'boolean').toBe(true)
    }
  })

  it('(c) D6 yasak jeton deseni (mutlak zaman damgası / UUID-ULID) "pattern"/"$schema"/"format" DIŞINDAKİ string değerlerde 0 (security tur1 §5 taramasının AYNI deseni, naif FP\'den arındırılmış)', () => {
    const document = buildContractSurface(REAL_GENERATOR)
    // security tur 1 §5'in BAĞIMSIZ teyit ettiği desen — ISO tarih/saat,
    // 10+ haneli sayı (epoch), uuid/ULID adı.
    const forbiddenLeakPattern = /\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}|\d{10,}|uuid|ULID/i
    const excludedScanKeys: readonly string[] = ['pattern', '$schema', 'format']
    const leaks: string[] = []

    walkJsonEntries(document, (key, value) => {
      if (excludedScanKeys.includes(key)) {
        return
      }
      if (typeof value === 'string' && forbiddenLeakPattern.test(value)) {
        leaks.push(`${key}=${value}`)
      }
    })

    expect(leaks).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// T-026 düzeltme tur 2 — S4: `walkJsonEntries` dizi elemanları için de
// `visit()` çağırır (eski gövde yalnızca özyinelerdi, dizi İÇİNDEKİ dizeler
// D6 taramasının DIŞINDAYDI).
// ---------------------------------------------------------------------------

describe('S4 düzeltmesi — walkJsonEntries artık dizi ELEMANLARI için de visit() çağırır', () => {
  it('bir dizi İÇİNDEKİ dizge "pattern" DIŞI bir anahtarda bile taramaya YAKALANIR (önceden SESSİZCE kaçırılırdı)', () => {
    const syntheticLeakingDocument = {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['2024-01-01-leak', 'active'] },
      },
    }
    const forbiddenLeakPattern = /\d{4}-\d{2}-\d{2}/
    const visitedEntries: { key: string; value: unknown }[] = []

    walkJsonEntries(syntheticLeakingDocument, (key, value) => {
      visitedEntries.push({ key, value })
    })

    const leaks = visitedEntries.filter(
      ({ value }) => typeof value === 'string' && forbiddenLeakPattern.test(value),
    )

    // Mutasyon kanıtı: dizi elemanı İÇİN sentetik "enum[]" anahtarıyla
    // visit() çağrıldığı KANITLANIR — eski gövdede bu girdi HİÇ ÜRETİLMEZDİ.
    expect(leaks).toEqual([{ key: 'enum[]', value: '2024-01-01-leak' }])
  })

  it('kök değer doğrudan dizi İSE (ebeveyn anahtarı YOK) sentetik "[]" soneki ÜRETİLMEZ (üst seviye vacuous olmama karşıt-kanıtı)', () => {
    const visitedKeys: string[] = []

    walkJsonEntries(['a', 'b'], (key) => {
      visitedKeys.push(key)
    })

    expect(visitedKeys).toEqual([])
  })

  it('gerçek üretilen yüzeyde (c) testinin AYNI taraması — dizi elemanları dahil — HALA 0 sızıntı verir (karşıt-kanıt: düzeltme bugünkü artefaktı KIRMAZ)', () => {
    const document = buildContractSurface(REAL_GENERATOR)
    const forbiddenLeakPattern = /\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}|\d{10,}|uuid|ULID/i
    const excludedScanKeys: readonly string[] = ['pattern', '$schema', 'format']
    const leaks: string[] = []

    walkJsonEntries(document, (key, value) => {
      if (excludedScanKeys.includes(key)) {
        return
      }
      if (typeof value === 'string' && forbiddenLeakPattern.test(value)) {
        leaks.push(`${key}=${value}`)
      }
    })

    expect(leaks).toEqual([])
  })
})

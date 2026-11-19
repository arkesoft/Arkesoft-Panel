// @arkesoft/trpc — sözleşme yüzeyi SAPMASININ sınıflandırıcısı (ROADMAP
// v0.0.22, T-026/S2, architect'in kural tablosu — AC-36/AC-37'nin kalbi)
//
// Bu dosya iki {@link ContractSurfaceDocument} ("önce"/"sonra") alır ve
// aralarındaki farkı architect'in kural tablosuna göre MAJOR/MINOR olarak
// SINIFLANDIRIR. Snapshot testinin KIRILMASI sınıflandırma DEĞİLDİR — bu
// modülün işi SAPMAYI SINIFLANDIRMAK, snapshot'ı güncellemek/doğrulamak
// DEĞİLDİR (o iş `scripts/generate-contract-surface.ts`'in ve `S4`'ün CI
// adımının işi).
//
// 🚫 BU DOSYA `src/index.ts`'TEN EXPORT EDİLMEZ (S1'in `build-contract-
// surface.ts`/`authz/procedure-surface.ts`'inin AYNI gerekçesi, emsal:
// `build-contract-surface.ts:1-16`, `authz/procedure-surface.ts:28-30`):
// aşağıdaki `ContractSurfaceDocument` vb. ithalatı BUGÜN tip-YALNIZCA
// (`import type`, `verbatimModuleSyntax` altında ÇALIŞMA ZAMANINDA SİLİNİR)
// olduğu için `../routers/app.router.js`'i ÇALIŞMA ZAMANINDA ÇEKMİYOR — AMA
// bu dosya `index.ts`'ten export edilmeYECEK, çünkü (a) kardeş modüllerle
// AYNI iç-denetim-aracı sınıfındadır (public API yüzeyi DEĞİL, CI betiğinin
// bir parçasıdır), (b) ileride biri `build-contract-surface.ts`'ten bir
// DEĞER (fonksiyon) ithal ederse bu "tip-yalnızca" garantisi SESSİZCE
// bozulur ve `browser-entry-closure.qa.test.ts` o anda KIRILIR — export
// yasağı bu riski BUGÜNDEN kapatır, ihlalin keşfi bir gate turuna
// BIRAKILMAZ. Tüketiciler bu modülü paket İÇİNDEN göreli ithalatla kullanır.
//
// ⚠ SAF: dosya YAZMAZ, Node yerleşiklerini İTHAL ETMEZ, `process.`'e
// erişmez. Girdi/çıktı tamamen bellek içi değerlerdir ({@link
// ContractSurfaceDocument}); hiçbir dosya okuma/yazma burada YAPILMAZ —
// `docs/api-contract-surface.json`'ı okuyup/karşılaştıran I/O `scripts/`
// VEYA çağıranın (`S4`'ün CI adımı) işidir.
//
// Kural tablosu (architect, T-026 handoff — SIRASI BU DOSYANIN kaynağı):
//   Prosedür eklendi                      → girdi MINOR
//   Prosedür kaldırıldı / yol değişti     → girdi MAJOR
//   operation query↔mutation              → girdi MAJOR
//   Opsiyonel alan eklendi                → girdi MINOR · çıktı MINOR
//   Zorunlu alan eklendi                  → girdi MAJOR · çıktı MINOR
//   Alan kaldırıldı                       → girdi MAJOR · çıktı MAJOR
//   Opsiyonel → zorunlu                   → girdi MAJOR · çıktı MAJOR ⚠ bkz. aşağı
//   Zorunlu → opsiyonel                   → girdi MINOR · çıktı MAJOR
//   Tip/enum/pattern DARALDI              → girdi MAJOR · çıktı MAJOR
//   Tip/enum GENİŞLEDİ                    → girdi MINOR · çıktı MAJOR
//   generator bloğu değişti               → GENERATOR_DRIFT (sınıf DEĞİL, ayrı rapor)
//
// ⚠ YAZILI AŞIRI-SIKILIK — architect'in BİLİNÇLİ kararı: çıktıda opsiyonel
// → zorunlu teorik olarak kırıcı DEĞİLDİR (tüketici zaten alanı okuyordu);
// yine de MAJOR verilir çünkü (a) ROADMAP §2 girdi/çıktı ayrımı YAPMAZ ve bu
// politikayı gevşetmek architect'in bugünkü yetkisinde DEĞİL, (b) fail-closed
// bu deponun tutarlı felsefesidir, (c) mutasyon girdiye VEYA çıktıya
// uygulansın sonuç aynı kalır. Ayırt edici kod `OUTPUT_FIELD_BECAME_REQUIRED`
// raporda GÖRÜNÜR — `docs` (S4) gerekçeli indirgeme notunu buna dayandırır.
//
// Genel sınıf = tüm farkların EN AĞIRI'sı (MAJOR > MINOR > PATCH, hiç fark
// yoksa PATCH). `generator` sapması bu sıralamaya KATILMAZ — ayrı alan.

import type {
  ContractSurfaceDocument,
  ContractSurfaceGenerator,
  ContractSurfaceOperation,
  ContractSurfaceProcedureEntry,
} from './build-contract-surface.js'
import { canonicalizeJsonValue } from './canonicalize.js'

// ---------------------------------------------------------------------------
// Ortak tipler
// ---------------------------------------------------------------------------

/** Tekil bir farkın ağırlığı — tablo yalnızca bu ikisini üretir. */
export type ContractChangeSeverity = 'MAJOR' | 'MINOR'

/** Genel sınıflandırmanın ağırlığı — hiç fark yoksa `PATCH`. */
export type ContractClassificationSeverity = ContractChangeSeverity | 'PATCH'

/** Bir farkın hangi eksende olduğu — rapor biçiminde "girdi"/"çıktı"/"prosedür" etiketine çevrilir. */
export type ContractChangeScope = 'procedure' | 'input' | 'output'

/** `_def`/şema seviyesinde değil, PROSEDÜRÜN KENDİSİ seviyesindeki farklar. */
export type ProcedureChangeReason = 'PROCEDURE_ADDED' | 'PROCEDURE_REMOVED' | 'OPERATION_CHANGED'

/**
 * Alan seviyesindeki farklar — `INPUT_`/`OUTPUT_` öneki EKSENİ taşır (tablo
 * girdi/çıktı için AYRI ağırlık veriyor, bu yüzden tek bir "FIELD_REMOVED"
 * kodu YETMEZ — `S4`'ün dokümantasyonu bu ayrımı okuyabilsin diye kod
 * SEVİYESİNDE ayrışır, metin ayrıştırmaya GEREK KALMAZ).
 */
export type FieldChangeReason =
  | 'INPUT_OPTIONAL_FIELD_ADDED'
  | 'OUTPUT_OPTIONAL_FIELD_ADDED'
  | 'INPUT_REQUIRED_FIELD_ADDED'
  | 'OUTPUT_REQUIRED_FIELD_ADDED'
  | 'INPUT_FIELD_REMOVED'
  | 'OUTPUT_FIELD_REMOVED'
  | 'INPUT_FIELD_BECAME_REQUIRED'
  | 'OUTPUT_FIELD_BECAME_REQUIRED'
  | 'INPUT_FIELD_BECAME_OPTIONAL'
  | 'OUTPUT_FIELD_BECAME_OPTIONAL'
  | 'INPUT_TYPE_NARROWED'
  | 'OUTPUT_TYPE_NARROWED'
  | 'INPUT_TYPE_WIDENED'
  | 'OUTPUT_TYPE_WIDENED'

/** Tablonun ÜRETEBİLECEĞİ TÜM ayırt edici kodlar — `S4` bu birleşimi BİREBİR belgeler. */
export type ContractChangeReason = ProcedureChangeReason | FieldChangeReason

interface ContractChangeDiffBase {
  readonly reason: ContractChangeReason
  readonly severity: ContractChangeSeverity
  readonly procedurePath: string
  readonly description: string
}

/** Prosedürün KENDİSİ eklendi/kaldırıldı/işlem türü değişti — alan YOK. */
export interface ProcedureLevelContractChangeDiff extends ContractChangeDiffBase {
  readonly scope: 'procedure'
  readonly reason: ProcedureChangeReason
}

/** Girdi/çıktı şemasının BİR alanındaki fark. */
export interface FieldLevelContractChangeDiff extends ContractChangeDiffBase {
  readonly scope: 'input' | 'output'
  readonly reason: FieldChangeReason
  readonly fieldName: string
}

export type ContractChangeDiff = ProcedureLevelContractChangeDiff | FieldLevelContractChangeDiff

/** `generator` bloğundaki sapma — SINIF DEĞİL, ayrı rapor (dosya başı yorumu). */
export interface GeneratorDriftReport {
  readonly changed: boolean
  readonly before: ContractSurfaceGenerator
  readonly after: ContractSurfaceGenerator
}

/** {@link classifyContractChange}'in tam sonucu. */
export interface ContractChangeClassification {
  /** Tüm `diffs`'in EN AĞIRI'sı; fark yoksa `'PATCH'`. */
  readonly severity: ContractClassificationSeverity
  readonly diffs: readonly ContractChangeDiff[]
  readonly generatorDrift: GeneratorDriftReport
}

// ---------------------------------------------------------------------------
// Yerel `assertNever` — `apps/api/src/errors/assert-never.ts` İLE AYNI
// desen, AMA BAĞIMSIZ KOPYA: `packages/trpc` → `apps/api` bağımlılığı
// CLAUDE.md §3'ün "apps/* → packages/*" yön kuralını TERSİNE çevirirdi.
// Kopyalama burada BİLİNÇLİ — paket sınırını aşan bir ithalat yerine tek
// satırlık bir yardımcının tekrarı tercih edilmiştir.
// ---------------------------------------------------------------------------

function assertNever(value: never, context: string): never {
  throw new Error(`${context}: beklenmeyen değer — ${JSON.stringify(value)}`)
}

// ---------------------------------------------------------------------------
// JSON Schema okuma yardımcıları — `canonicalize.ts`'in `isUnknownArray`/
// `isJsonRecord` İLE AYNI desen (burada da `as`/`any` KULLANILMAZ).
// ---------------------------------------------------------------------------

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !isUnknownArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/** Bir JSON Schema düğümünün `properties` alanını okur — yoksa/biçimsizse boş nesne (gürültüsüz varsayılan, ÇÜNKÜ bu alan OLMAYABİLİR — ör. `z.string()` kök şeması). */
function readSchemaProperties(schema: unknown): Readonly<Record<string, unknown>> {
  if (!isJsonRecord(schema)) {
    return {}
  }
  const properties = schema['properties']
  return isJsonRecord(properties) ? properties : {}
}

/** Bir JSON Schema düğümünün `required` alanını `Set<string>` olarak okur. */
function readSchemaRequired(schema: unknown): ReadonlySet<string> {
  if (!isJsonRecord(schema)) {
    return new Set()
  }
  const required = schema['required']
  if (!isUnknownArray(required)) {
    return new Set()
  }
  return new Set(required.filter(isString))
}

/** `type` alanını (dize veya dize dizisi) normalize eder — yoksa/biçimsizse `null` (bu eksende KIYASLANAMAZ demek). */
function readSchemaTypeSet(schema: unknown): ReadonlySet<string> | null {
  if (!isJsonRecord(schema)) {
    return null
  }
  const type = schema['type']
  if (isString(type)) {
    return new Set([type])
  }
  if (isUnknownArray(type)) {
    const strings = type.filter(isString)
    return strings.length === type.length ? new Set(strings) : null
  }
  return null
}

/** `enum` alanını JSON-serileştirilmiş değer kümesi olarak okur — yoksa `null`. */
function readSchemaEnumSet(schema: unknown): ReadonlySet<string> | null {
  if (!isJsonRecord(schema)) {
    return null
  }
  const enumValues = schema['enum']
  if (!isUnknownArray(enumValues)) {
    return null
  }
  return new Set(enumValues.map((value) => JSON.stringify(value)))
}

/** `pattern` alanını okur — yoksa `null`. */
function readSchemaPattern(schema: unknown): string | null {
  if (!isJsonRecord(schema)) {
    return null
  }
  const pattern = schema['pattern']
  return isString(pattern) ? pattern : null
}

/**
 * Alan seviyesinde kıyaslanacak "gerçek" düğümü bulur (F1 düzeltmesi, T-026
 * düzeltme tur 1, `solid` high bulgusu — "kök şema düğümü hiç kıyaslanmıyor").
 * Kök düğüm KENDİSİ `properties` TAŞIYORSA (object kökü — bugünkü yaygın
 * biçim) DEĞİŞTİRİLMEDEN döner. Kök bir DİZİYSE (`type: "array"`, ör.
 * `session.list` çıktısı — `{ type:"array", items:{...8 alan...} }`) VE
 * `items` nesne-şekilliyse (`items.properties` VAR) `items` döner — çağıran
 * artık dizinin ELEMANININ alanlarını kıyaslar, dizinin KENDİSİNİ DEĞİL
 * (dizi düğümünün `properties` alanı YOKTUR, döngü hiç çalışmazdı). Diğer
 * TÜM durumlarda (ilkel kök, `items` nesne-şekilli DEĞİL, vb.) düğüm
 * DEĞİŞTİRİLMEDEN döner; `readSchemaProperties`/`readSchemaRequired` orada
 * `properties` BULAMAZ ve sonuç `PATCH`'e düşer.
 *
 * ⚠⚠ DÜZELTME (T-026 düzeltme tur 2, `solid` high bulgusu — S1a): yukarıdaki
 * paragrafın eski hâli "var olan hiçbir sonucu GEVŞETMEZ" diyordu — BU YANLIŞ
 * ÇIKTI. Kök şekli TAKAS edilirse (önce object kökü, sonra `items` nesne-
 * şekilli bir DİZİ kökü — veya tersi) bu fonksiyon İKİ TARAFI DA aynı
 * `properties` nesnesine yönlendirebilir (biri doğrudan kendi `properties`'i,
 * öbürü `items.properties`'i) ⇒ alanlar eşit görünür ⇒ 0 diff / `PATCH` —
 * düzeltme ÖNCESİ (kıyaslama doğrudan ham kök üzerinde yapılırken) AYNI girdi
 * `OUTPUT_FIELD_REMOVED`/MAJOR verirdi. Bu GERÇEK bir gevşetmeydi. Düzeltme
 * bu fonksiyonun KENDİSİNDE değil, çağıranda (`diffProcedureIo`): hedef
 * çözümünden SONRA, orijinal (çözülmemiş) kökler `stripRootStructuralKeys`
 * ile süzülüp `isSchemaEqual` ile kıyaslanır; farklıysa fail-closed
 * `*_TYPE_NARROWED` eklenir — bkz. `diffProcedureIo` içindeki kök-şekil
 * koruması. Bu AYRICA S1'in ikinci yarısını da kapatır: kök `type`/
 * `additionalProperties`/`$schema` gibi `properties`/`required`/`items`
 * DIŞINDAKİ anahtarlar bu süzgeçte KALIR, dolayısıyla onlardaki fark da
 * yakalanır (ayrı bir okuyucu YAZILMADI — aynı süzgeç ikisini de kapsar).
 * ⚠⚠ `in` operatörü KULLANILMAZ (T-023'ün prototip zinciri tuzağı,
 * ADR-0027) — `Object.keys().includes()` ile MUTASYONSUZ anahtar
 * kontrolü yapılır.
 */
function resolveFieldDiffTarget(schema: unknown): unknown {
  if (!isJsonRecord(schema)) {
    return schema
  }
  const ownKeys = Object.keys(schema)
  if (ownKeys.includes('properties')) {
    return schema
  }
  if (!ownKeys.includes('items')) {
    return schema
  }
  const items = schema['items']
  return isJsonRecord(items) && Object.keys(items).includes('properties') ? items : schema
}

/** İki şema düğümünün KANONİK (anahtar sırası bağımsız) olarak EŞİT olup olmadığı. */
function isSchemaEqual(before: unknown, after: unknown): boolean {
  return (
    JSON.stringify(canonicalizeJsonValue(before)) === JSON.stringify(canonicalizeJsonValue(after))
  )
}

/**
 * Bir JSON Schema düğümünden `properties`/`required`/`items` anahtarlarını
 * ÇIKARIR, KALAN anahtarları (`type`, `additionalProperties`, `$schema` vb.)
 * YENİ bir nesnede döner (S1b düzeltmesi, T-026 düzeltme tur 2, `solid` high
 * bulgusu). `Object.fromEntries` KULLANILIR — `rebuilt[key] = schema[key]`
 * İLE elle kurma KULLANILMAZ: girdi anahtarlarından biri LİTERAL `"__proto__"`
 * İSE (`JSON.parse` BUNU meşru bir ÖZ anahtar olarak üretebilir) köşeli
 * parantez ATAMASI (`obj[k] = v`) `k === '__proto__'` durumunda ÖZ anahtar
 * YARATMAZ, nesnenin [[Prototype]]'INI DEĞİŞTİRİR — sessiz veri kaybı/
 * bozulma (`stripTrackedAxisKeys`'in AYNI sınıfı, aşağıda). `Object.fromEntries`
 * `[[DefineOwnProperty]]` KULLANDIĞI için bu özel durumdan ETKİLENMEZ.
 */
function stripRootStructuralKeys(schema: Readonly<Record<string, unknown>>): unknown {
  const remainingKeys = Object.keys(schema).filter(
    (key) => key !== 'properties' && key !== 'required' && key !== 'items',
  )
  return Object.fromEntries(remainingKeys.map((key) => [key, schema[key]]))
}

type FieldConstraintChange = 'NARROWED' | 'WIDENED' | 'UNCHANGED'

/** İki string kümesini alt küme ilişkisine göre `NARROWED`/`WIDENED`/eşitse `UNCHANGED` olarak sınıflandırır; ne alt ne üst kümeyse (kıyaslanamaz) FAIL-CLOSED `NARROWED` döner. */
function compareValueSets(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): FieldConstraintChange {
  const isSubsetOf = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean =>
    [...left].every((item) => right.has(item))

  const afterSubsetOfBefore = isSubsetOf(after, before)
  const beforeSubsetOfAfter = isSubsetOf(before, after)

  if (afterSubsetOfBefore && beforeSubsetOfAfter) {
    return 'UNCHANGED'
  }
  if (afterSubsetOfBefore) {
    return 'NARROWED'
  }
  if (beforeSubsetOfAfter) {
    return 'WIDENED'
  }
  // Ne alt küme ne üst küme (ör. enum ["a","b"] → ["b","c"]) — eşdeğerlik
  // KANITLANAMAZ. Fail-closed felsefesiyle tutarlı: DARALDI say.
  return 'NARROWED'
}

/** `enum` ekseninde kıyaslar — HER İKİ tarafta da `enum` YOKSA `null` (eksen UYGULANAMAZ). */
function compareEnumAxis(before: unknown, after: unknown): FieldConstraintChange | null {
  const beforeEnum = readSchemaEnumSet(before)
  const afterEnum = readSchemaEnumSet(after)
  if (beforeEnum === null || afterEnum === null) {
    return null
  }
  return compareValueSets(beforeEnum, afterEnum)
}

/** `type` ekseninde kıyaslar — HER İKİ tarafta da `type` YOKSA `null` (eksen UYGULANAMAZ). */
function compareTypeAxis(before: unknown, after: unknown): FieldConstraintChange | null {
  const beforeType = readSchemaTypeSet(before)
  const afterType = readSchemaTypeSet(after)
  if (beforeType === null || afterType === null) {
    return null
  }
  return compareValueSets(beforeType, afterType)
}

/** `pattern` ekseninde kıyaslar — pattern'in VARLIĞI/YOKLUĞU da bir sinyaldir, `null` DÖNMEZ (ekseni "uygulanamaz" diye ATLAMAK pattern eklenmesini/kaldırılmasını KAÇIRIR). */
function comparePatternAxis(before: unknown, after: unknown): FieldConstraintChange {
  const beforePattern = readSchemaPattern(before)
  const afterPattern = readSchemaPattern(after)
  if (beforePattern === afterPattern) {
    return 'UNCHANGED'
  }
  if (beforePattern === null) {
    return 'NARROWED' // pattern EKLENDİ → kısıtlama arttı
  }
  if (afterPattern === null) {
    return 'WIDENED' // pattern KALDIRILDI → kısıtlama azaldı
  }
  return 'NARROWED' // iki farklı pattern — eşdeğerlik KANITLANAMAZ, fail-closed
}

/**
 * İzlenen ÜÇ eksenin (`enum`/`type`/`pattern`) anahtarlarını bir şema
 * düğümünden MUTASYONSUZ çıkarır (`Object.keys().filter()` + yeniden kurma —
 * `in` operatörü KULLANILMAZ, T-023'ün prototip zinciri tuzağı,
 * ADR-0027). F3 düzeltmesinin (T-026 düzeltme tur 1, `solid`
 * medium bulgusu — "eksen gölgelemesi, ikinci biçim") tek yapı taşı: KALAN
 * düğümün eşitliği, izlenen bir eksendeki değişimin İZLENMEYEN bir kısıtın
 * (ör. `minLength`) EŞZAMANLI değişimini GÖLGELEMESİNİ önlemek için kullanılır.
 *
 * ⚠⚠ DÜZELTME (T-026 düzeltme tur 2, `solid` medium bulgusu — S3'ün İKİNCİ
 * yeri): eski gövde `rebuilt[key] = schema[key]` İLE elle kuruyordu — girdi
 * anahtarlarından biri LİTERAL `"__proto__"` İSE bu atama ÖZ anahtar
 * YARATMAZ, `rebuilt`'in [[Prototype]]'INI DEĞİŞTİRİR (sessiz bozulma,
 * `stripRootStructuralKeys` İLE AYNI sınıf). `Object.fromEntries` bu özel
 * duruma düşmez (`[[DefineOwnProperty]]` kullanır) — kapatıldı.
 */
const TRACKED_AXIS_KEYS: readonly string[] = ['enum', 'type', 'pattern']

function stripTrackedAxisKeys(schema: unknown): unknown {
  if (!isJsonRecord(schema)) {
    return schema
  }
  const remainingKeys = Object.keys(schema).filter((key) => !TRACKED_AXIS_KEYS.includes(key))
  return Object.fromEntries(remainingKeys.map((key) => [key, schema[key]]))
}

/** İzlenen üç eksenin (`enum`/`type`/`pattern`) DIŞINDA da bir fark olup olmadığını söyler. */
function hasUntrackedConstraintChange(before: unknown, after: unknown): boolean {
  return !isSchemaEqual(stripTrackedAxisKeys(before), stripTrackedAxisKeys(after))
}

/**
 * Bir alanın tip/enum/pattern kısıtının "önce"den "sonra"ya DARALDIĞINI mı
 * GENİŞLEDİĞİNİ mi yoksa DEĞİŞMEDİĞİNİ mi belirler (tek tablo satırı: "Tip/
 * enum/pattern daraldı/genişledi").
 *
 * ⚠ F3 DÜZELTMESİ (T-026 düzeltme tur 1, `solid` medium bulgusu — "eksen
 * gölgelemesinin ikinci biçimi"): önce İZLENMEYEN bir kısıtta (ör.
 * `minLength`) fark olup olmadığına bakılır — VARSA, izlenen eksenlerin
 * WIDENED/NARROWED raporu GÜVENİLİR DEĞİLDİR ve sonuç fail-closed `NARROWED`
 * olur.
 *
 * ⚠⚠ DÜZELTME (T-026 düzeltme tur 2, `solid` medium bulgusu — S2, "ilk
 * konuşan ekseni dön" deseni İZLENEN ÜÇ EKSENİN KENDİ ARASINDA da aynen
 * yeniden üretiliyordu): İZLENMEYEN eksende fark yoksa üç eksen artık
 * SIRAYLA denenip İLK konuşanda dönülmez — ÜÇÜ DE değerlendirilir ve sonuç
 * NARROWED-BASKIN katlanır (herhangi biri `NARROWED` derse sonuç `NARROWED`,
 * yoksa herhangi biri `WIDENED` derse `WIDENED`). Eski sıralı-erken-dönüş
 * karşı vakası: `{enum:["a","b"]} → {enum:["a","b","c"], pattern:"^[ab]$"}`
 * — `enum` GENİŞLEDİ (WIDENED) ilk konuşup erken dönerdi, AYNI ANDA EKLENEN
 * `pattern` (NARROWED) HİÇ DEĞERLENDİRİLMEZDİ ⇒ yanlışlıkla MINOR. Katlama
 * bunu düzeltir: NARROWED baskın geldiği için gerçek sonuç MAJOR'a çıkar.
 * Bu, var olan hiçbir `NARROWED` sonucunu `WIDENED`'a ÇEVİRMEZ (monoton
 * sıkılaştırma kısıtı) — yalnızca `WIDENED`→`NARROWED` yönünde değişebilir
 * (NARROWED hiçbir zaman WIDENED'a dönüşmez, çünkü katlama NARROWED'ı HER
 * ZAMAN önceliklendirir).
 *
 * İzlenen üç eksenin HİÇBİRİ `NARROWED`/`WIDENED` demiyorsa (hepsi
 * `UNCHANGED` veya `null`) ama şema YİNE DE değiştiyse güvenlik ağı olarak
 * fail-closed `NARROWED` döner. ⚠ DÜZELTME (T-026 düzeltme tur 3, Orkestratör
 * ölçtü): bu dal "matematiksel olarak ulaşılamaz" DEĞİLDİR — ör.
 * `enum:["a","b"]→["b","a"]` SADECE enum SIRASI değişimi: `isSchemaEqual`
 * sıra DUYARLI olduğu için `false` döner, AMA `compareValueSets` (Set
 * tabanlı) sıra KÖRÜDÜR ve `UNCHANGED` der ⇒ üç eksen de `UNCHANGED`, dal
 * GERÇEKTEN çalışır. Zararsızdır (fail-closed sonuç zaten doğru: MAJOR),
 * yalnızca "ulaşılamaz" iddiası YANLIŞTI.
 */
function compareFieldConstraint(before: unknown, after: unknown): FieldConstraintChange {
  if (isSchemaEqual(before, after)) {
    return 'UNCHANGED'
  }

  if (hasUntrackedConstraintChange(before, after)) {
    return 'NARROWED'
  }

  const axisChanges = [
    compareEnumAxis(before, after),
    compareTypeAxis(before, after),
    comparePatternAxis(before, after),
  ].filter((change): change is FieldConstraintChange => change !== null)

  if (axisChanges.some((change) => change === 'NARROWED')) {
    return 'NARROWED'
  }
  if (axisChanges.some((change) => change === 'WIDENED')) {
    return 'WIDENED'
  }

  // Şema DEĞİŞTİ (isSchemaEqual false) ama izlenen ÜÇ eksende (enum/type/
  // pattern) VE izlenmeyen eksende de fark YOK — bu dal ULAŞILABİLİR (ör.
  // enum SIRA değişimi, yukarıdaki fonksiyon başı yorumu), "ulaşılamaz"
  // İDDİASI yanlıştı; sonuç yine güvenlik ağı olarak fail-closed: DARALDI say.
  return 'NARROWED'
}

// ---------------------------------------------------------------------------
// `io`'ya göre ayrışan FieldChangeReason seçimi — TEK exhaustive switch,
// 7 çağrı yerinden yeniden kullanılır.
// ---------------------------------------------------------------------------

export type ContractChangeIo = 'input' | 'output'

function reasonForIo<InputReason extends FieldChangeReason, OutputReason extends FieldChangeReason>(
  io: ContractChangeIo,
  inputReason: InputReason,
  outputReason: OutputReason,
): InputReason | OutputReason {
  switch (io) {
    case 'input':
      return inputReason
    case 'output':
      return outputReason
    default:
      return assertNever(io, 'classify-contract-change.ts: ContractChangeIo')
  }
}

// ---------------------------------------------------------------------------
// `buildDiff` — ZORUNLU MADDE 3: `reason` üzerinde EXHAUSTIVE switch +
// `assertNever`. Her dal severity + scope + description'ı BİRLİKTE üretir —
// tablonun TEK kaynağı burasıdır.
// ---------------------------------------------------------------------------

type DiffInput =
  | { readonly reason: 'PROCEDURE_ADDED'; readonly procedurePath: string }
  | { readonly reason: 'PROCEDURE_REMOVED'; readonly procedurePath: string }
  | {
      readonly reason: 'OPERATION_CHANGED'
      readonly procedurePath: string
      readonly before: ContractSurfaceOperation
      readonly after: ContractSurfaceOperation
    }
  | {
      readonly reason: FieldChangeReason
      readonly procedurePath: string
      readonly io: ContractChangeIo
      readonly fieldName: string
    }

function buildDiff(input: DiffInput): ContractChangeDiff {
  switch (input.reason) {
    case 'PROCEDURE_ADDED':
      return {
        reason: input.reason,
        severity: 'MINOR',
        scope: 'procedure',
        procedurePath: input.procedurePath,
        description: `yeni prosedür: "${input.procedurePath}"`,
      }
    case 'PROCEDURE_REMOVED':
      return {
        reason: input.reason,
        severity: 'MAJOR',
        scope: 'procedure',
        procedurePath: input.procedurePath,
        description: `prosedür kaldırıldı: "${input.procedurePath}"`,
      }
    case 'OPERATION_CHANGED':
      return {
        reason: input.reason,
        severity: 'MAJOR',
        scope: 'procedure',
        procedurePath: input.procedurePath,
        description: `işlem türü "${input.before}" → "${input.after}" değişti`,
      }
    case 'INPUT_OPTIONAL_FIELD_ADDED':
    case 'OUTPUT_OPTIONAL_FIELD_ADDED':
      return {
        reason: input.reason,
        severity: 'MINOR',
        scope: input.io,
        procedurePath: input.procedurePath,
        fieldName: input.fieldName,
        description: `yeni OPSİYONEL alan: "${input.fieldName}"`,
      }
    case 'INPUT_REQUIRED_FIELD_ADDED':
      return {
        reason: input.reason,
        severity: 'MAJOR',
        scope: input.io,
        procedurePath: input.procedurePath,
        fieldName: input.fieldName,
        description: `yeni ZORUNLU alan: "${input.fieldName}"`,
      }
    case 'OUTPUT_REQUIRED_FIELD_ADDED':
      return {
        reason: input.reason,
        severity: 'MINOR',
        scope: input.io,
        procedurePath: input.procedurePath,
        fieldName: input.fieldName,
        description: `yeni ZORUNLU alan: "${input.fieldName}"`,
      }
    case 'INPUT_FIELD_REMOVED':
    case 'OUTPUT_FIELD_REMOVED':
      return {
        reason: input.reason,
        severity: 'MAJOR',
        scope: input.io,
        procedurePath: input.procedurePath,
        fieldName: input.fieldName,
        description: `"${input.fieldName}" alanı KALDIRILDI`,
      }
    case 'INPUT_FIELD_BECAME_REQUIRED':
    case 'OUTPUT_FIELD_BECAME_REQUIRED':
      return {
        reason: input.reason,
        severity: 'MAJOR',
        scope: input.io,
        procedurePath: input.procedurePath,
        fieldName: input.fieldName,
        description: `"${input.fieldName}" OPSİYONELDEN ZORUNLUYA`,
      }
    case 'INPUT_FIELD_BECAME_OPTIONAL':
      return {
        reason: input.reason,
        severity: 'MINOR',
        scope: input.io,
        procedurePath: input.procedurePath,
        fieldName: input.fieldName,
        description: `"${input.fieldName}" ZORUNLUDAN OPSİYONELE`,
      }
    case 'OUTPUT_FIELD_BECAME_OPTIONAL':
      return {
        reason: input.reason,
        severity: 'MAJOR',
        scope: input.io,
        procedurePath: input.procedurePath,
        fieldName: input.fieldName,
        description: `"${input.fieldName}" ZORUNLUDAN OPSİYONELE`,
      }
    case 'INPUT_TYPE_NARROWED':
    case 'OUTPUT_TYPE_NARROWED':
      return {
        reason: input.reason,
        severity: 'MAJOR',
        scope: input.io,
        procedurePath: input.procedurePath,
        fieldName: input.fieldName,
        description: `"${input.fieldName}" tip/enum/pattern DARALDI`,
      }
    case 'INPUT_TYPE_WIDENED':
      return {
        reason: input.reason,
        severity: 'MINOR',
        scope: input.io,
        procedurePath: input.procedurePath,
        fieldName: input.fieldName,
        description: `"${input.fieldName}" tip/enum GENİŞLEDİ`,
      }
    case 'OUTPUT_TYPE_WIDENED':
      return {
        reason: input.reason,
        severity: 'MAJOR',
        scope: input.io,
        procedurePath: input.procedurePath,
        fieldName: input.fieldName,
        description: `"${input.fieldName}" tip/enum GENİŞLEDİ`,
      }
    default:
      return assertNever(input, 'classify-contract-change.ts: DiffInput.reason')
  }
}

/**
 * `record[key]`'i YALNIZCA `key` KENDİ (own) anahtarıysa okur; aksi halde
 * `undefined` döner (S3 düzeltmesi, T-026 düzeltme tur 2, `security`/`solid`
 * — "`in` operatörü/köşeli-parantez okuma prototip zincirini yürür"). Köşeli
 * parantez okuması (`record[key]`) `in` operatörüyle AYNI sınıf sızıntıyı
 * taşır: `key === 'toString'` gibi bir durumda `Object.prototype`'tan
 * KALITSAL bir FONKSİYON döner, `isJsonRecord` onu elemediği için
 * `JSON.stringify` ile `undefined`'a düşer ve gerçek şemaya ASLA eşit olmaz
 * ⇒ sınıf tesadüfen MAJOR'da kalsa da `reason` kodu HER ZAMAN yanlış
 * TEŞHİS eder. `Object.keys().includes()` ile ÖZ anahtar kontrolü yapılır.
 */
function readOwnProperty(record: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.keys(record).includes(key) ? record[key] : undefined
}

// ---------------------------------------------------------------------------
// Bir prosedürün TEK bir `io` (girdi/çıktı) şemasındaki alan farklarının
// taranması.
// ---------------------------------------------------------------------------

function diffProcedureIo(
  procedurePath: string,
  io: ContractChangeIo,
  beforeSchema: unknown,
  afterSchema: unknown,
): readonly ContractChangeDiff[] {
  // ⚠ F2 DÜZELTMESİ (T-026 düzeltme tur 1, `security` medium bulgusu —
  // "null↔nesne dalı fail-OPEN"): şemanın VAR/YOK (`null`) geçişi artık
  // ERKEN DÖNÜŞLE kapsam dışına alınmıyor. `null` taraf, aşağıdaki
  // `readSchemaProperties`/`readSchemaRequired`'ın `isJsonRecord` OLMAYAN
  // (ör. `null`) girdide ZATEN `{}`/boş `Set` DÖNMESİ sayesinde DOĞAL olarak
  // `{ properties: {}, required: [] }` GİBİ davranır — bu YENİ bir kural
  // DEĞİL, var olan okuyucuların tutarlı UYGULANMASIDIR (`solid`'in
  // gerekçesi). Önceki `if (beforeSchema === null || afterSchema === null)
  // return []` bu davranışı BASTIRIYOR ve ör. argümansız bir prosedüre
  // ZORUNLU girdi eklenmesini (gerçek MAJOR) SESSİZCE `PATCH` olarak
  // raporluyordu. Her iki taraf da `null` kalırsa (girdisiz prosedür
  // DEĞİŞMEDİ) iki taraf da `{}`'e indirgenir, fark YOK, sonuç yine `PATCH`
  // — fail-open DEĞİL, sadece aşırı-sıkı DEĞİL.
  const beforeDiffTarget = resolveFieldDiffTarget(beforeSchema)
  const afterDiffTarget = resolveFieldDiffTarget(afterSchema)

  const diffs: ContractChangeDiff[] = []

  // ⚠⚠ KÖK-ŞEKİL KORUMASI (S1a düzeltmesi, T-026 düzeltme tur 2, `solid`
  // high bulgusu): `resolveFieldDiffTarget` kök şekli TAKAS edildiğinde
  // (object↔array) iki tarafı da AYNI `properties` nesnesine yönlendirebilir
  // ⇒ alan karşılaştırması 0 diff döner. Burada ORİJİNAL (çözülmemiş)
  // köklerin `properties`/`required`/`items` DIŞI kısmı (`type`,
  // `additionalProperties`, `$schema` dahil — S1b'nin ikinci yarısı AYNI
  // süzgeçle kapanır) kıyaslanır; farklıysa fail-closed `*_TYPE_NARROWED`
  // eklenir.
  if (isJsonRecord(beforeSchema) && isJsonRecord(afterSchema)) {
    const beforeRootRest = stripRootStructuralKeys(beforeSchema)
    const afterRootRest = stripRootStructuralKeys(afterSchema)
    if (!isSchemaEqual(beforeRootRest, afterRootRest)) {
      diffs.push(
        buildDiff({
          reason: reasonForIo(io, 'INPUT_TYPE_NARROWED', 'OUTPUT_TYPE_NARROWED'),
          procedurePath,
          io,
          // ⚠ `'(root)'` REZERVE bir sentinel alan adıdır — gerçek bir alan
          // `z.object({ '(root)': ... })` ile bu adı taşırsa rapor
          // çarpışabilir (tip değiştirilmedi, `solid` tur 3: 4 dokunuş / 0
          // davranış kazancı — borç satırı, ROADMAP).
          fieldName: '(root)',
        }),
      )
    }
  } else if (isJsonRecord(beforeSchema) !== isJsonRecord(afterSchema)) {
    // ⚠⚠ DÜZELTME (S5, T-026 düzeltme tur 3, `solid` high bulgusu — "kök-
    // şekil korumasının `null` istisnası fail-open"): yukarıdaki dalın ESKİ
    // yorumu "`null`↔nesne geçişi zaten alan döngüsünde doğru
    // sınıflandırılıyor, burada MÜKERRER/yanlış bir kök-tipi diff'i
    // EKLENMEMELİ" diyordu — BU YANLIŞ ÇIKTI. Doğru olan TEK durum: non-null
    // tarafın ÇÖZÜLMÜŞ (`resolveFieldDiffTarget`) hedefi `properties`
    // TAŞIYORSA (object kökü) — o zaman alan döngüsü GERÇEKTEN alanları
    // doğru yakalar. Non-null taraf `properties` TAŞIMIYORSA (ilkel kök —
    // `{type:"string"}`, `{anyOf:[...]}`, ilkel dizi/tuple kökü) alan
    // döngüsü HER İKİ tarafı da boş `properties`/`{}`'e indirger ⇒ 0 diff /
    // `PATCH` — ör. `input: null` → `.input(z.string())` eklenmesi GERÇEK
    // MAJOR'dır ama düzeltme ÖNCESİ 0 diff dönerdi (bkz. S5 mutasyon kanıtı,
    // `classify-contract-change.test.ts`). Burada non-null tarafın ÇÖZÜLMÜŞ
    // hedefinde `properties` ARANIR; yoksa tek bir fail-closed `(root)`
    // diff'i eklenir — yön (`null`→nesne veya nesne→`null`) ÖNEMSİZ, ikisi
    // de AYNI sınıfa (MAJOR) düşer. `?? {}` TARZI bir normalizasyon
    // KULLANILMADI — bu, F2'nin `onlyDiff` testlerini (object kökü
    // `properties` TAŞIDIĞI için bu dal onlarda ATLANIR) KIRARDI.
    const nonNullDiffTarget = isJsonRecord(beforeSchema) ? beforeDiffTarget : afterDiffTarget
    const nonNullHasProperties =
      isJsonRecord(nonNullDiffTarget) && Object.keys(nonNullDiffTarget).includes('properties')
    if (!nonNullHasProperties) {
      diffs.push(
        buildDiff({
          reason: reasonForIo(io, 'INPUT_TYPE_NARROWED', 'OUTPUT_TYPE_NARROWED'),
          procedurePath,
          io,
          fieldName: '(root)',
        }),
      )
    }
  }

  const beforeProperties = readSchemaProperties(beforeDiffTarget)
  const afterProperties = readSchemaProperties(afterDiffTarget)
  const beforeRequired = readSchemaRequired(beforeDiffTarget)
  const afterRequired = readSchemaRequired(afterDiffTarget)

  const allFieldNames = new Set<string>([
    ...Object.keys(beforeProperties),
    ...Object.keys(afterProperties),
  ])

  for (const fieldName of [...allFieldNames].sort()) {
    // ⚠⚠ S3 DÜZELTMESİ (T-026 düzeltme tur 2, `security`/`solid` — `in`
    // operatörü prototip zincirini yürür): `fieldName in beforeProperties`
    // `fieldName === 'toString'` gibi bir durumda, `beforeProperties`'in
    // KENDİ anahtarı OLMASA BİLE `Object.prototype`'tan KALITSAL olarak
    // `true` dönerdi ⇒ gerçekte EKLENMİŞ/KALDIRILMIŞ bir alan yanlışlıkla
    // "zaten vardı" sayılır, aşağıdaki `compareFieldConstraint` dalına
    // düşer ve ORADA da köşeli-parantez okuması (DÜZELTİLDİ, `readOwnProperty`)
    // AYNI sızıntıyı taşırdı. `Object.keys().includes()` SADECE ÖZ anahtarı
    // sayar.
    const existedBefore = Object.keys(beforeProperties).includes(fieldName)
    const existsAfter = Object.keys(afterProperties).includes(fieldName)

    if (!existedBefore && existsAfter) {
      const reason = afterRequired.has(fieldName)
        ? reasonForIo(io, 'INPUT_REQUIRED_FIELD_ADDED', 'OUTPUT_REQUIRED_FIELD_ADDED')
        : reasonForIo(io, 'INPUT_OPTIONAL_FIELD_ADDED', 'OUTPUT_OPTIONAL_FIELD_ADDED')
      diffs.push(buildDiff({ reason, procedurePath, io, fieldName }))
      continue
    }

    if (existedBefore && !existsAfter) {
      const reason = reasonForIo(io, 'INPUT_FIELD_REMOVED', 'OUTPUT_FIELD_REMOVED')
      diffs.push(buildDiff({ reason, procedurePath, io, fieldName }))
      continue
    }

    const wasRequired = beforeRequired.has(fieldName)
    const isRequired = afterRequired.has(fieldName)
    if (!wasRequired && isRequired) {
      diffs.push(
        buildDiff({
          reason: reasonForIo(io, 'INPUT_FIELD_BECAME_REQUIRED', 'OUTPUT_FIELD_BECAME_REQUIRED'),
          procedurePath,
          io,
          fieldName,
        }),
      )
    } else if (wasRequired && !isRequired) {
      diffs.push(
        buildDiff({
          reason: reasonForIo(io, 'INPUT_FIELD_BECAME_OPTIONAL', 'OUTPUT_FIELD_BECAME_OPTIONAL'),
          procedurePath,
          io,
          fieldName,
        }),
      )
    }

    const constraintChange = compareFieldConstraint(
      readOwnProperty(beforeProperties, fieldName),
      readOwnProperty(afterProperties, fieldName),
    )
    switch (constraintChange) {
      case 'NARROWED':
        diffs.push(
          buildDiff({
            reason: reasonForIo(io, 'INPUT_TYPE_NARROWED', 'OUTPUT_TYPE_NARROWED'),
            procedurePath,
            io,
            fieldName,
          }),
        )
        break
      case 'WIDENED':
        diffs.push(
          buildDiff({
            reason: reasonForIo(io, 'INPUT_TYPE_WIDENED', 'OUTPUT_TYPE_WIDENED'),
            procedurePath,
            io,
            fieldName,
          }),
        )
        break
      case 'UNCHANGED':
        break
      default:
        assertNever(constraintChange, 'classify-contract-change.ts: FieldConstraintChange')
    }
  }

  return diffs
}

// ---------------------------------------------------------------------------
// Severity sıralaması — genel sınıf = EN AĞIRI (MAJOR > MINOR > PATCH).
// ---------------------------------------------------------------------------

function classificationRank(severity: ContractClassificationSeverity): number {
  switch (severity) {
    case 'MAJOR':
      return 2
    case 'MINOR':
      return 1
    case 'PATCH':
      return 0
    default:
      return assertNever(severity, 'classify-contract-change.ts: ContractClassificationSeverity')
  }
}

function combineSeverity(
  current: ContractClassificationSeverity,
  next: ContractChangeSeverity,
): ContractClassificationSeverity {
  return classificationRank(next) > classificationRank(current) ? next : current
}

/** `generator` bloğundaki sapma — dosya başı yorumu: SINIF DEĞİL, ayrı rapor. */
function detectGeneratorDrift(
  before: ContractSurfaceGenerator,
  after: ContractSurfaceGenerator,
): GeneratorDriftReport {
  const changed = before.zod !== after.zod || before.trpcServer !== after.trpcServer
  return { changed, before, after }
}

// ---------------------------------------------------------------------------
// Ana API
// ---------------------------------------------------------------------------

/**
 * İki {@link ContractSurfaceDocument}'ı ("önce"/"sonra") architect'in kural
 * tablosuna göre karşılaştırır. SAF — her iki girdi de bellek içi
 * değerlerdir, dosya okunmaz. `before`/`after`'ın `procedureCount`/
 * `namespaceCount` alanlarına GÜVENİLMEZ — yalnızca `.procedures` (ve
 * `generator` sapması için `.generator`) okunur, madde 9'un "türetilmiş
 * sayaca güvenme" felsefesiyle TUTARLI.
 */
export function classifyContractChange(
  before: ContractSurfaceDocument,
  after: ContractSurfaceDocument,
): ContractChangeClassification {
  const diffs: ContractChangeDiff[] = []

  const allPaths = new Set<string>([
    ...Object.keys(before.procedures),
    ...Object.keys(after.procedures),
  ])

  for (const procedurePath of [...allPaths].sort()) {
    const beforeEntry: ContractSurfaceProcedureEntry | undefined = before.procedures[procedurePath]
    const afterEntry: ContractSurfaceProcedureEntry | undefined = after.procedures[procedurePath]

    if (beforeEntry === undefined && afterEntry === undefined) {
      // `allPaths` yalnızca GERÇEK anahtarlardan kurulduğu için bu dal
      // ÇALIŞMA ZAMANINDA erişilemez; TS daraltması için güvenlik ağı.
      continue
    }
    if (beforeEntry === undefined) {
      diffs.push(buildDiff({ reason: 'PROCEDURE_ADDED', procedurePath }))
      continue
    }
    if (afterEntry === undefined) {
      diffs.push(buildDiff({ reason: 'PROCEDURE_REMOVED', procedurePath }))
      continue
    }

    if (beforeEntry.operation !== afterEntry.operation) {
      diffs.push(
        buildDiff({
          reason: 'OPERATION_CHANGED',
          procedurePath,
          before: beforeEntry.operation,
          after: afterEntry.operation,
        }),
      )
    }

    diffs.push(...diffProcedureIo(procedurePath, 'input', beforeEntry.input, afterEntry.input))
    diffs.push(...diffProcedureIo(procedurePath, 'output', beforeEntry.output, afterEntry.output))
  }

  const severity = diffs.reduce<ContractClassificationSeverity>(
    (worst, diff) => combineSeverity(worst, diff.severity),
    'PATCH',
  )

  return {
    severity,
    diffs,
    generatorDrift: detectGeneratorDrift(before.generator, after.generator),
  }
}

/** {@link ContractChangeScope} → rapordaki Türkçe etiket. */
function scopeLabel(scope: ContractChangeScope): string {
  switch (scope) {
    case 'procedure':
      return 'prosedür'
    case 'input':
      return 'girdi'
    case 'output':
      return 'çıktı'
    default:
      return assertNever(scope, 'classify-contract-change.ts: ContractChangeScope')
  }
}

/**
 * {@link ContractChangeClassification}'ı okunabilir, satır satır bir rapora
 * çevirir — "Beklenen rapor biçimi" (T-026/S2 handoff'u). SAF: string
 * üretir, hiçbir yere YAZMAZ (stdout'a yazmak ÇAĞIRANIN işi).
 */
export function formatContractChangeReport(classification: ContractChangeClassification): string {
  const lines: string[] = [`SÖZLEŞME SAPMASI — ${String(classification.diffs.length)} fark`]

  for (const diff of classification.diffs) {
    lines.push(
      `  [${diff.severity}] ${scopeLabel(diff.scope)}  ${diff.procedurePath} · ${diff.description} (${diff.reason})`,
    )
  }

  lines.push(
    classification.severity === 'PATCH'
      ? 'SONUÇ: PATCH — public API sözleşmesinde izlenen bir fark yok'
      : `SONUÇ: ${classification.severity} — public API için ${classification.severity} sürüm GEREKLİ (ROADMAP Sürüm Politikası §2)`,
  )

  if (classification.diffs.length > 0) {
    lines.push('Yüzey kasıtlı değiştiyse: pnpm --filter @arkesoft/trpc run contract:generate')
  }

  if (classification.generatorDrift.changed) {
    const { before: beforeGenerator, after: afterGenerator } = classification.generatorDrift
    lines.push(
      `GENERATOR_DRIFT — zod ${beforeGenerator.zod} → ${afterGenerator.zod}, ` +
        `@trpc/server ${beforeGenerator.trpcServer} → ${afterGenerator.trpcServer}`,
    )
  }

  return lines.join('\n')
}

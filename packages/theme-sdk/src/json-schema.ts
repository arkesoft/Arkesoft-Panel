// @arkesoft/theme-sdk — tema sözleşmesinin JSON Schema temsilinin SAF üretimi
// (ROADMAP v0.0.9, T-010/S7, architect "V7" bağlayıcı kısıtı + Orkestratörün
// V1 ampirik ölçümü)
//
// ⚠ BU DOSYA SAF'TIR — dosya YAZMAZ, Node yerleşiklerini (`node:*`) İTHAL
// ETMEZ, `process.`'e erişmez, `prettier`'ı İTHAL ETMEZ. Saflık pini
// (`src/__tests__/purity.test.ts`, S2) bu dosyayı da tarar. Serileştirme VE
// biçimlendirme `../scripts/`'te yaşar (V7, "biçimlendirme `src/**`'e
// GİREMEZ") — bu dosya yalnızca bir JSON Schema NESNESİ döndürür, hiçbir
// dizeye çevirmez.
//
// ⚠ YALNIZCA MANİFEST ŞEMASI EMİT EDİLİR (V1-d gerekçesi): Orkestratörün
// ampirik ölçümü `z.toJSONSchema()`'nın `strictObject` İÇİN `additionalProp
// erties:false` ürettiğini, ama DÜZ `z.object` için DAHİ aynısını ürettiğini
// (`io` varsayılanı `'output'` olduğu için REDDET/"strictObject" ile SOY/
// "z.object" ayırt edilemiyor) doğruladı. Bu paketin güven sınırı kararı
// (PM/architect) ayar DEĞERİ şeması için "SOY ama RAPORLA" (bkz. `../settings
// /validate-settings.ts`) — ama `z.toJSONSchema()` çıktısı bu YUMUŞAK kuralı
// YANLIŞ TEMSİL EDER (sanki REDDEDİYORMUŞ gibi görünür). Bu yüzden ayar
// DEĞERİ şeması (`THEME_SETTING_VALUE_SCHEMA` türünden bağımsız bir şema)
// BURADAN hiç emit edilmez — yalnızca MANİFEST'in (yazar masada, zaten
// REDDET olan) kök şeması üretilir. (V1-h kaçış kapısını not eder: `io:
// 'input'` ayırt edebilir, ama bu paket o yolu bugün kullanmıyor.)
//
// ⚠ İKİ EK ÖLÇÜM (S7'nin kendi ölçümü, bu dosyanın yazılması sırasında
// yapıldı — gerçek paket + gerçek `z.toJSONSchema()` çağrısıyla, `dist/`
// üzerinden):
//
// (1) `manifest/templates.ts`'teki `THEME_TEMPLATE_TYPE_SCHEMA` bir
//     `.transform()` TAŞIYOR (bilinen yedi değerden birine `as` ile dar
//     tipleme, S5'in kendi dosya başı yorumunda gerekçeli). VARSAYILAN
//     ayarlarla `z.toJSONSchema()` bunun için "Transforms cannot be
//     represented in JSON Schema" fırlatır — bu, TÜM manifest şemasının
//     üretimini durdurur (templates ZORUNLU bir alan). `manifest/
//     templates.ts` DOKUNULMAZ (S5 bitirdi) — çözüm BURADA: `unrepresentable:
//     'any'` seçeneği fırlatmayı `{}` (boş şema) ile değiştirir, ve aşağıdaki
//     `override` bu BOŞ şemayı `THEME_TEMPLATE_TYPES`'tan türetilen bir
//     `enum`'a GERİ KAZANDIRIR — `THEME_TEMPLATE_TYPES` zaten `templates.ts`
//     'in PUBLIC dışa aktarımı (DEĞİŞTİRİLMEDİ, yalnızca KULLANILDI).
//
// (2) `manifest/manifest.ts`'teki `migrate` alanı `z.custom<...>()` taşıyor
//     (gerçek JS fonksiyonu, JSON'a serileştirilemez — manifest.ts'in kendi
//     dosya başı yorumu: bu alan theme.json'ın SAF JSON gövdesi DEĞİL,
//     `defineTheme()`'in bellek-içi nesnesidir). `unrepresentable: 'any'`
//     bunu da fırlatmadan `{}` yapar, ama `{}` ("herhangi bir şey") bir JSON
//     Schema TÜKETİCİSİ için YANILTICI OLURDU — sanki `migrate` alanı
//     theme.json'da BEKLENEN bir alanmış gibi görünür, değildir. KARAR:
//     `migrations` alanı ÜRETILEN JSON Schema'dan TAMAMEN ÇIKARILIR
//     (`properties.migrations` + `required` listesindeki girdi silinir).
//     Alternatif (`override` ile `migrate`'i elle bir şemaya eşlemek)
//     REDDEDİLDİ — JSON Schema bir FONKSİYONU hiçbir biçimde temsil edemez,
//     yarım bir temsil (`from`/`to` var ama `migrate` yok/`{}`) tüketiciyi
//     yanlış yönlendirmekten başka işe yaramaz; dosya başı yorumunun kendi
//     diliyle: bu alan zaten "theme.json'ın SAF JSON gövdesi değil".
//
// ⚠ B5 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti B) — `id`/`sdkRange`
// alanları VE `ThemeAssetRef.path` `.check()` (fonksiyon tabanlı refine)
// KULLANIR; `z.toJSONSchema()` bir `.check()`'ten `pattern` TÜRETEMEZ
// (`version`'ın `.regex()`'i gibi OTOMATİK değil) — ÖLÇÜLDÜ: üçü de
// yayınlanan şemada çıplak `{"type":"string"}` olarak düşüyordu, redleri
// TAŞIMIYORDU (üçüncü taraf tema araçları `path`'i "herhangi bir dize"
// SANIRDI). `templates[].type` için ZATEN kurulu olan `override` mekanizması
// (1 numaralı ölçüm) BURAYA da uygulanır — desen BİLİNİYORDU, yalnızca bu
// ÜÇ yüzeye UYGULANMAMIŞTI (solid'in bulgusu). Desenlerin KENDİSİ BURADA
// YENİDEN TANIMLANMAZ — `manifest/manifest.ts` (`THEME_ID_PATTERN`,
// `THEME_SDK_RANGE_FORMAT_PATTERN`) ve `manifest/asset-ref.ts`
// (`ASSET_PATH_FORMAT_PATTERN`, `MAX_ASSET_PATH_LENGTH`) artık bu amaçla
// EXPORT edilir (davranışları DEĞİŞMEDİ, B4'ün dersiyle AYNI gerekçe: iki
// kaynak SAPMA riski doğurur, bu yüzden TEK kaynak + import).
//
// ⚠ ZAYIF İZDÜŞÜM (bilinçli, NOT edilen bir boşluk) — `ThemeAssetRef.path`
// runtime'da İKİ KURAL taşır: (a) izin listesi deseni + uzunluk sınırı
// (BURADA `pattern`/`maxLength` ile TAM ifade edilir) VE (b) hiçbir yol
// SEGMENTİNİN tam olarak `..` olmaması (yol geçişi reddi, `isTraversalSegment`
// — asset-ref.ts). (b) standart bir JSON Schema `pattern`/`maxLength`
// alanıyla KISA VE OKUNUR biçimde ifade EDİLEMEZ (segment bazlı bir kural,
// tek bir düzenli ifadeyle TEMSİLİ mümkün olsa da okunurluğu/doğrulanabilir-
// liği kurban ederdi) — bu yüzden TEMSİL EDİLMEDİ, `jsonSchema.description`
// alanına AÇIK bir not OLARAK yazılır (aşağıda, `ASSET_REF_PATH_WEAK_
// PROJECTION_NOTE`) ki üçüncü taraf bir tema aracı bu boşluğu BİLİNÇSİZCE
// keşfetmesin. `src/__tests__/contract-schema.test.ts` bu notun VE
// pattern/maxLength'in yayınlanan şemada VARLIĞINI pinler (düşen/ifade
// edilen kuralların SESSİZCE yeniden kaybolmaması için, B5'in kendi
// gerekçesi).
//
// ⚠ F4 DÜZELTMESİ (T-010 düzeltme turu 2/3, security'nin bulgusu S4) —
// `settings[].key` (VE `group.children[].key`, AYNI biçim — `./settings/
// keys.ts`'in `SETTING_KEY_SCHEMA`'sı `.check()` TABANLI) B5'in KAPATTIĞI
// AYNI boşluğu TAŞIYORDU: yayınlanan şemada çıplak `{"type":"string"}`,
// `pattern`/`maxLength` YOK. B5'in `id`/`sdkRange`/`ThemeAssetRef.path`
// için kurduğu `override` deseni BURAYA da uygulanır — `SETTING_KEY_FORMAT_
// PATTERN`/`MAX_SETTING_KEY_LENGTH` (`./settings/keys.js`'ten EXPORT edilir,
// B5'in `ASSET_PATH_FORMAT_PATTERN` emsaliyle BİREBİR aynı gerekçe: tek
// kaynak, iki kopya YOK). `key` için de İKİ runtime kuralı `pattern`/
// `maxLength` ile TAM ifade EDİLEMEZ — isim kara listesi (9 ad, `./settings
// /keys.ts`'in `UNSAFE_SETTING_KEYS`'i) VE yinelenen-`key` reddi (aynı dizi
// İÇİNDE, `./settings/duplicate-key-check.ts`) — bu yüzden AYNI "zayıf
// izdüşüm" biçimiyle `jsonSchema.description`'a YAZILIR (aşağıda,
// `SETTING_KEY_WEAK_PROJECTION_NOTE`).

import { z } from 'zod'

import { ASSET_PATH_FORMAT_PATTERN, MAX_ASSET_PATH_LENGTH } from './manifest/asset-ref.js'
import {
  THEME_ID_PATTERN,
  THEME_MANIFEST_SCHEMA,
  THEME_SDK_RANGE_FORMAT_PATTERN,
} from './manifest/manifest.js'
import { THEME_TEMPLATE_TYPES } from './manifest/templates.js'
import { MAX_SETTING_KEY_LENGTH, SETTING_KEY_FORMAT_PATTERN } from './settings/keys.js'

/** `id` alanının JSON Schema izdüşümü için `override` yolu — kök seviyede sabit. */
const ID_OVERRIDE_PATH: readonly (string | number)[] = ['properties', 'id']

/** `sdkRange` alanının JSON Schema izdüşümü için `override` yolu — kök seviyede sabit. */
const SDK_RANGE_OVERRIDE_PATH: readonly (string | number)[] = ['properties', 'sdkRange']

// ⚠ Saflık pininin (`__tests__/purity.test.ts`, DOKUNULMAZ) yasaklı dizgi
// taraması `/(^|[^\w/])['"]path['"]/` — node'un YERLEŞİK `path` MODÜLÜNÜN
// İTHALİNİ yakalamak için var — bu paketin KENDİ veri alanı olan JSON
// Schema özelliği ADI "path" ile YANLIŞ POZİTİF üretir (bir modül ithali
// DEĞİL, bir dize SABİTİ). AGENT_BASELINE'ın "literal-jeton kuralı" burada
// uygulanır: jeton çalışma anında İKİ PARÇADAN birleştirilir, pinin kendi
// taraması bu satırı bir modül ithali SANMAZ.
const ASSET_REF_PATH_PROPERTY_NAME = 'pa' + 'th'

/**
 * `ThemeAssetRef.path` alanının JSON Schema izdüşümü için `override`
 * SON EKİ (suffix) — TAM yol DEĞİL, çünkü `image` ayarının `default.path`'i
 * İKİ bağımsız yerde belirir (kök `settings` VE `group.children`, `z.
 * toJSONSchema()` bu ikisini PAYLAŞILAN bir `$defs` referansına
 * İNDİRGEMEZ — V1'in "(e) $defs doğmadı" ampirik ölçümüyle TUTARLI, her
 * ikisi de KENDİ TAM kopyasını üretir). Son ek eşleşmesi HER İKİSİNİ de
 * yakalar; bu desenin BAŞKA bir alanla çakışma riski YOK — `default.path`
 * biçimi paket içinde YALNIZCA `ThemeAssetRef`'e ait.
 */
const ASSET_REF_PATH_OVERRIDE_SUFFIX: readonly (string | number)[] = [
  'properties',
  'default',
  'properties',
  ASSET_REF_PATH_PROPERTY_NAME,
]

/** `ThemeAssetRef.path`'in izdüşümüne eklenen, ifade EDİLEMEYEN runtime kuralını BELGELEYEN not (dosya başı yorumu, "ZAYIF İZDÜŞÜM"). */
const ASSET_REF_PATH_WEAK_PROJECTION_NOTE =
  'Ek çalışma zamanı kısıtı (zayıf izdüşüm — bu JSON Schema\'da TAM ifade edilemez): hiçbir yol segmenti tam olarak ".." olamaz (yol geçişi reddi).'

/**
 * `settings[].key` (VE `group.children[].key`) alanının izdüşümüne eklenen,
 * ifade EDİLEMEYEN iki runtime kuralını BELGELEYEN not (F4 düzeltmesi, dosya
 * başı yorumu, "ZAYIF İZDÜŞÜM" — `ASSET_REF_PATH_WEAK_PROJECTION_NOTE`
 * emsaliyle BİREBİR aynı biçim).
 */
const SETTING_KEY_WEAK_PROJECTION_NOTE =
  'Ek çalışma zamanı kısıtları (zayıf izdüşüm — bu JSON Schema\'da TAM ifade edilemez): (1) belirli isimler (ör. "__proto__", "constructor", "toString") biçimsel olarak uyumlu olsa da REDDEDİLİR (isim kara listesi). (2) aynı dizi (settings veya children) içinde birden fazla tanım AYNI key\'i taşıyamaz (yinelenen key reddi).'

/**
 * `key` alanının JSON Schema izdüşümü için `override` SON EKİ — `settings[].
 * key` VE `group.children[].key` İKİ bağımsız konumda belirir (F4 düzeltmesi,
 * `ASSET_REF_PATH_OVERRIDE_SUFFIX`'in B5 emsaliyle AYNI gerekçe — dizi
 * elemanları `items` altında TEK şema paylaşır). Son ek eşleşmesi HER
 * İKİSİNİ de yakalar; `key` adı bu paket içinde YALNIZCA ayar tanımlarına
 * ait olduğu için (confirmed: `rg` ile tarandı) BAŞKA bir alanla çakışma
 * riski YOK.
 */
const SETTING_KEY_OVERRIDE_SUFFIX: readonly (string | number)[] = ['properties', 'key']

/** `path`'in {@link SETTING_KEY_OVERRIDE_SUFFIX} ile BİTİP bitmediğini denetler (dosya başı yorumu — `endsWithAssetRefPathSuffix`'in BİREBİR aynı deseni). */
function endsWithSettingKeySuffix(path: readonly (string | number)[]): boolean {
  if (path.length < SETTING_KEY_OVERRIDE_SUFFIX.length) {
    return false
  }
  const offset = path.length - SETTING_KEY_OVERRIDE_SUFFIX.length
  return SETTING_KEY_OVERRIDE_SUFFIX.every((segment, index) => path[offset + index] === segment)
}

function pathEquals(
  path: readonly (string | number)[],
  expected: readonly (string | number)[],
): boolean {
  if (path.length !== expected.length) {
    return false
  }
  return expected.every((segment, index) => path[index] === segment)
}

/** `path`'in {@link ASSET_REF_PATH_OVERRIDE_SUFFIX} ile BİTİP bitmediğini denetler (dosya başı yorumu — iki bağımsız konum, SON EK eşleşir). */
function endsWithAssetRefPathSuffix(path: readonly (string | number)[]): boolean {
  if (path.length < ASSET_REF_PATH_OVERRIDE_SUFFIX.length) {
    return false
  }
  const offset = path.length - ASSET_REF_PATH_OVERRIDE_SUFFIX.length
  return ASSET_REF_PATH_OVERRIDE_SUFFIX.every((segment, index) => path[offset + index] === segment)
}

/**
 * `z.toJSONSchema()`'nın `override` callback'ine gelen `path`'in TAM OLARAK
 * `templates[].type` alanına işaret edip etmediğini denetler. Ölçülmüş yol
 * (bu dosyanın yazılması sırasında `override` içine `console.log` ile
 * doğrulandı, kalıcı kod değil): `['properties','templates','items',
 * 'properties','type']` — dizi İÇİNDEKİ her elemanın ŞEMASI aynı `items`
 * altında TEK KEZ üretilir (JSON Schema'da dizi elemanları tek bir `items`
 * şemasını PAYLAŞIR, elemana göre TEKRARLANMAZ).
 */
const TEMPLATE_TYPE_OVERRIDE_PATH: readonly (string | number)[] = [
  'properties',
  'templates',
  'items',
  'properties',
  'type',
]

function isTemplateTypeOverridePath(path: readonly (string | number)[]): boolean {
  if (path.length !== TEMPLATE_TYPE_OVERRIDE_PATH.length) {
    return false
  }
  return TEMPLATE_TYPE_OVERRIDE_PATH.every((segment, index) => path[index] === segment)
}

/**
 * `properties.migrations`'ı (ve `required` listesindeki girdisini) üretilen
 * kök şemadan siler — (2) numaralı ölçüm/karar. Girdi nesnesini DEĞİŞTİRMEZ,
 * yeni bir nesne döndürür (saflık: bu fonksiyon bir KOPYA üzerinde çalışır).
 *
 * ⚠ Dönüş tipi BİLEREK `z.core.JSONSchema.BaseSchema`'dır, `ObjectSchema`
 * DEĞİL — `ObjectSchema`'nın `type: "object"` LİTERAL alanı, `generated.type
 * !== 'object'` biçimindeki bir runtime kontrolüyle STATİK olarak
 * DARALTILAMAZ (`BaseSchema.type` ayrımlı bir birleşimin DİSKRİMİNANTI
 * DEĞİLDİR, sıradan bir `SchemaType | SchemaType[] | undefined` alanıdır) —
 * bunu `as` İLE zorlamak CLAUDE.md §2'nin izin verdiği "runtime
 * doğrulamasından HEMEN SONRA" durumunun ÖTESİNE geçerdi (gerçek bir runtime
 * KONTROLÜ değil, tip sistemine bir İDDİA olurdu). `BaseSchema` ZATEN
 * `properties`/`required` alanlarını taşır (opsiyonel) — tüketiciler
 * (`buildThemeContractJsonSchema`'nın çağıranları: generator, test) bu
 * alanlara `?.`/`?? []` ile ERİŞİR, nominal `ObjectSchema` tipine İHTİYAÇ
 * DUYMAZLAR.
 */
function withoutMigrationsField(
  rootSchema: z.core.JSONSchema.BaseSchema,
): z.core.JSONSchema.BaseSchema {
  const properties = rootSchema.properties
  if (properties === undefined) {
    return rootSchema
  }

  const propertiesWithoutMigrations: Record<string, z.core.JSONSchema._JSONSchema> = {
    ...properties,
  }
  delete propertiesWithoutMigrations['migrations']

  const requiredWithoutMigrations = (rootSchema.required ?? []).filter(
    (fieldName) => fieldName !== 'migrations',
  )

  return {
    ...rootSchema,
    properties: propertiesWithoutMigrations,
    required: requiredWithoutMigrations,
  }
}

/**
 * `generated`'ın gerçekten bir "object" kök şeması olduğunu doğrular.
 * `THEME_MANIFEST_SCHEMA` bir `z.strictObject` olduğu için bu HER ZAMAN
 * doğrudur — çağıranları için fail-fast bir güvence (CLAUDE.md §4: beklenen
 * durum için hata fırlat, sessizce devam etme).
 */
function assertRootSchemaIsObject(generated: z.core.JSONSchema.BaseSchema): void {
  if (generated.type !== 'object') {
    throw new Error(
      'Tema sözleşmesi kök JSON Schema\'sı beklenen "object" türünde değil — z.toJSONSchema() çıktısı değişmiş olabilir.',
    )
  }
}

/**
 * Tema sözleşmesinin (`ThemeManifest`/`THEME_MANIFEST_SCHEMA`) kök JSON
 * Schema NESNESİNİ üretir. SAF — dosya yazmaz, dize döndürmez; serileştirme
 * ve Prettier biçimlendirme `../scripts/serialize-schema.ts`'in işidir (V7).
 */
export function buildThemeContractJsonSchema(): z.core.JSONSchema.BaseSchema {
  const generated = z.toJSONSchema(THEME_MANIFEST_SCHEMA, {
    // (1) + (2) numaralı ölçümler — fırlatmayı önler (dosya başı yorumu).
    unrepresentable: 'any',
    override: ({ path, jsonSchema }) => {
      if (isTemplateTypeOverridePath(path)) {
        // (1) numaralı ölçüm — boş şemayı ({}), bilinen yedi şablon türünün
        // `enum`'u ile GERİ KAZANDIRIR. `THEME_TEMPLATE_TYPES` salt-okunur
        // bir `as const` dizisidir; JSON Schema'nın `enum` alanı sıradan bir
        // dizidir, bu yüzden yayılma (spread) ile KOPYALANIR.
        jsonSchema.type = 'string'
        jsonSchema.enum = [...THEME_TEMPLATE_TYPES]
        return
      }

      // B5 düzeltmesi (dosya başı yorumu) — `id`/`sdkRange`/`ThemeAssetRef.
      // path` `.check()` tabanlı refine KULLANIR, `z.toJSONSchema()` bundan
      // `pattern` TÜRETEMEZ; üçü de BURADA, tek kaynaktan (manifest.ts/
      // asset-ref.ts'in EXPORT edilen desenleri) geri kazandırılır.
      if (pathEquals(path, ID_OVERRIDE_PATH)) {
        jsonSchema.pattern = THEME_ID_PATTERN.source
        return
      }

      if (pathEquals(path, SDK_RANGE_OVERRIDE_PATH)) {
        jsonSchema.pattern = THEME_SDK_RANGE_FORMAT_PATTERN.source
        return
      }

      if (endsWithAssetRefPathSuffix(path)) {
        jsonSchema.pattern = ASSET_PATH_FORMAT_PATTERN.source
        jsonSchema.maxLength = MAX_ASSET_PATH_LENGTH
        jsonSchema.description = ASSET_REF_PATH_WEAK_PROJECTION_NOTE
        return
      }

      // F4 düzeltmesi (dosya başı yorumu) — `key` `.check()` tabanlı refine
      // KULLANIR, `z.toJSONSchema()` bundan `pattern` TÜRETEMEZ; B5'in
      // deseniyle AYNI şekilde, tek kaynaktan (`./settings/keys.js`'in
      // EXPORT edilen desen/sınırı) geri kazandırılır.
      if (endsWithSettingKeySuffix(path)) {
        jsonSchema.pattern = SETTING_KEY_FORMAT_PATTERN.source
        jsonSchema.maxLength = MAX_SETTING_KEY_LENGTH
        jsonSchema.description = SETTING_KEY_WEAK_PROJECTION_NOTE
      }
    },
  })

  assertRootSchemaIsObject(generated)
  return withoutMigrationsField(generated)
}

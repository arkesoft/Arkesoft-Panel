// @arkesoft/theme-sdk — tanım listesi → ayar DEĞERİ şeması (ROADMAP v0.0.9,
// T-010/S3)
//
// `ThemeSettingDefinition[]` (theme.json'ın `settings` dizisi, zaten
// `primitives.ts`'in şemasından geçmiş, TİPLİ girdi) → bir tema örneğinin
// ayar DEĞERLERİ nesnesini doğrulayacak Zod şeması. Bu, `primitives.ts`'teki
// TANIM şemalarından (strictObject, bilinmeyen anahtarı REDDEDER) BİLİNÇLİ
// OLARAK FARKLI bir şema üretir: değer şeması düz `z.object` (varsayılan
// `strip` davranışı) kullanır — "SOY ama RAPORLA" güven sınırının temeli
// (bkz. `validate-settings.ts` dosya başı yorumu, AC5).
//
// `group` için değer şekli, çocuklarının DEĞER şeklini taşıyan NESTED bir
// nesnedir — `schemaFromDefinitions` kendi üzerine ÖZYİNELİ çağrılır (grup
// tanımları zaten derinlik-1 olduğu için — bkz. `primitives.ts` — bu
// özyineleme en fazla BİR seviye iner, sonsuz döngü riski YOK).

import { z } from 'zod'

import { assertNever } from '../assert-never.js'
import { ThemeContractError, type ThemeContractIssue } from '../errors.js'
import { THEME_ASSET_REF_SCHEMA } from '../manifest/asset-ref.js'
import { findDuplicateSettingKeyIssues } from './duplicate-key-issues.js'
import { THEME_COLOR_HEX_PATTERN, type ThemeSettingDefinition } from './primitives.js'
import { findUnsafeSettingKeyIssues } from './unsafe-key-scan.js'

/**
 * Ayar DEĞERLERİ nesnesinin genel tipi — JSONB'den okunan, Zod'un parse
 * ÇIKTISI (CLAUDE.md §4: dış veri Zod'suz tip almaz). Dinamik anahtar kümesi
 * (hangi temanın hangi ayarları tanımladığı) derleme zamanında bilinemez;
 * `unknown` + daraltma (CLAUDE.md §2) burada `Record<string, unknown>`
 * biçiminde karşılığını bulur — tüketici (ör. S8'in `defineTheme()` dönüşü)
 * kendi daraltmasını yapar.
 */
export type ThemeSettingsValue = Readonly<Record<string, unknown>>

/** `select` ayarının DEĞERİNİN tanımdaki `options` listesine ait olduğunu zorlar — tanım şemasındaki (`primitives.ts`) `default ∈ options` refine'ının DEĞER karşılığı. */
function selectValueSchema(options: readonly { readonly value: string }[]): z.ZodType<string> {
  return z.string().check((payload) => {
    const isKnownOption = options.some((option) => option.value === payload.value)

    if (!isKnownOption) {
      payload.issues.push({
        code: 'custom',
        input: payload.value,
        message: `select ayarının değeri ("${payload.value}") options listesinde yok.`,
        params: { themeContractErrorCode: 'THEME_SETTING_INVALID' },
      })
    }
  })
}

/** Tek bir ayar tanımının DEĞER şemasını üretir. `group` kendi üzerine özyineli çağrı yapar (derinlik-1 garantisi `primitives.ts`'ten gelir). */
function valueSchemaForDefinition(definition: ThemeSettingDefinition): z.ZodType {
  switch (definition.type) {
    case 'color':
      return z.string().regex(THEME_COLOR_HEX_PATTERN)
    case 'font':
      return z.string()
    case 'select':
      return selectValueSchema(definition.options)
    case 'toggle':
      return z.boolean()
    case 'image':
      return THEME_ASSET_REF_SCHEMA.optional()
    case 'text': {
      let schema = z.string()
      if (definition.maxLength !== undefined) {
        schema = schema.max(definition.maxLength)
      }
      return schema
    }
    case 'number': {
      let schema = z.number()
      if (definition.min !== undefined) {
        schema = schema.min(definition.min)
      }
      if (definition.max !== undefined) {
        schema = schema.max(definition.max)
      }
      if (definition.step !== undefined) {
        schema = schema.multipleOf(definition.step)
      }
      return schema
    }
    case 'group':
      return schemaFromDefinitions(definition.children)
    default:
      return assertNever(definition, 'schema-from-definitions.ts: ThemeSettingDefinition.type')
  }
}

/**
 * ⚠ F1 KÖK ÇÖZÜMÜ (T-010 düzeltme turu 2/3, security'nin önerisi) — ayar
 * tanımı listesinin TAM savunmacı ön kontrolü (yinelenen `key` + tam `key`
 * kabul edilebilirliği) ARTIK YALNIZCA BURADA yaşar, `schemaFromDefinitions`'ın
 * İÇİNDE. Önceki tur (1/3) üç gerçek giriş noktasının (`validateThemeSettings`,
 * `deriveDefaultSettings`, `schemaFromDefinitions`) HER BİRİ bu kontrolün
 * kendi (bazen KISMİ) kopyasını taşıyordu:
 *   - `validateThemeSettings` — ikisini de (duplicate + unsafe) KENDİSİ
 *     çağırıyordu (TAM, ama AYRI bir kopya).
 *   - `deriveDefaultSettings` — yalnızca `findUnsafeSettingKeyIssues`
 *     çağırıyordu (yinelenen `key` kontrolü EKSİKTİ — security'nin S1
 *     bulgusu: bir `group`/kök dizide yinelenen `key` varsayılanı
 *     SESSİZCE gölgeliyordu).
 *   - `schemaFromDefinitions`'ın KENDİSİ — yalnızca `findUnsafeSettingKeyIssues`
 *     çağırıyordu (AYNI eksiklik; `migrations/run.ts:221`'in BU fonksiyonu
 *     çağırması yüzünden migration YOLU da yinelenen `key`'e karşı
 *     KORUMASIZDI — security'nin S1 bulgusu, AYNI kök).
 * Artık TEK bir `assertDefinitionsAreAcceptable` bu fonksiyonun BAŞINDA
 * çalışır; üç çağıranın ÜÇÜ DE (`deriveDefaultSettings` bu fonksiyonu
 * ÇAĞIRARAK, `validateThemeSettings` bu fonksiyonun FIRLATMASINI
 * `try`/`catch` ile Result'a çevirerek, `migrateThemeSettings` AYNI
 * şekilde `try`/`catch` ile — F2 düzeltmesi, `../migrations/run.ts`) BU
 * TEK noktadan geçer; bir İKİNCİ/ÜÇÜNCÜ kopya KALMADI.
 */
function assertDefinitionsAreAcceptable(definitions: readonly ThemeSettingDefinition[]): void {
  const duplicateKeyIssues = findDuplicateSettingKeyIssues(definitions)
  const unsafeKeyIssues = findUnsafeSettingKeyIssues(definitions)
  const issues: readonly ThemeContractIssue[] = [...duplicateKeyIssues, ...unsafeKeyIssues]

  if (issues.length > 0) {
    throw new ThemeContractError(issues)
  }
}

/**
 * Bir tanım listesinden ayar DEĞERLERİ nesnesinin Zod şemasını türetir.
 * `z.object` (strip) KULLANILIR, `z.strictObject` DEĞİL — bilinmeyen
 * anahtarlar bu düzeyde SESSİZCE soyulur; RAPORLAMA (`unknownKeys`)
 * `validate-settings.ts`'in sorumluluğudur (ham girdiyle anahtar kümesi
 * farkı alınarak, bkz. o dosya).
 *
 * ⚠ M2 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti A, security'nin bulgusu)
 * — bu fonksiyon `defineTheme()`'i ATLAYIP DOĞRUDAN çağrılabildiği için
 * AC6 katman 1 burada DEVREDE DEĞİLDİ (bkz. `defaults.ts`'teki AYNI not).
 * Bulgu SESSİZCE ATLANMAZ — bu fonksiyon bir ŞEMA DÖNDÜRDÜĞÜ (Result
 * DEĞİL) için `ThemeContractError` FIRLATILIR. F1 (yukarıdaki dosya başı
 * notu) bu ön kontrolü TAM hâle getirdi (yinelenen `key` de dahil).
 */
export function schemaFromDefinitions(
  definitions: readonly ThemeSettingDefinition[],
): z.ZodType<ThemeSettingsValue> {
  assertDefinitionsAreAcceptable(definitions)

  const shape = Object.fromEntries(
    definitions.map(
      (definition) => [definition.key, valueSchemaForDefinition(definition)] as const,
    ),
  )

  return z.object(shape)
}

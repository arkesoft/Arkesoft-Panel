// @arkesoft/theme-sdk — `deriveDefaultSettings()` (ROADMAP v0.0.9, T-010/S3)
//
// Bir tanım listesinden (`ThemeSettingDefinition[]`, zaten `primitives.ts`'in
// şemasından geçmiş TİPLİ girdi) ayar DEĞERLERİ nesnesinin VARSAYILAN
// hâlini türetir. `group` için çocukların varsayılanları İÇ İÇE üretilir —
// `deriveDefaultSettings` kendi üzerine özyineli çağrılır (derinlik-1
// garantisi `primitives.ts`'ten gelir, sonsuz döngü riski YOK).
//
// ⚠ AC10'UN ASIL TESTİ S8'İN İŞİ (`defineTheme()` üzerinden, sekiz ilkelin
// HEPSİNİ bir arada gezerek) — bu dosya türetmeyi DOĞRU KURAR ve kendi
// (daha dar kapsamlı) birim testini taşır; S8'in testi bunun ÜZERİNE GELİR,
// YERİNE GEÇMEZ.

import { assertNever } from '../assert-never.js'
import type { ThemeSettingDefinition } from './primitives.js'
import { schemaFromDefinitions, type ThemeSettingsValue } from './schema-from-definitions.js'

/** Tek bir ayar tanımının varsayılan DEĞERİNİ çıkarır. */
function defaultValueOfDefinition(definition: ThemeSettingDefinition): unknown {
  switch (definition.type) {
    case 'color':
    case 'font':
    case 'select':
    case 'toggle':
    case 'image':
    case 'text':
    case 'number':
      return definition.default
    case 'group':
      return deriveDefaultSettings(definition.children)
    default:
      return assertNever(definition, 'defaults.ts: ThemeSettingDefinition.type')
  }
}

/**
 * Bir tanım listesinden ayar DEĞERLERİ nesnesinin varsayılan hâlini türetir.
 * `image` ilkelinin `default`'ı OPSİYONEL olduğu için (bkz. `primitives.ts`)
 * bu anahtarın değeri `undefined` OLABİLİR — bu KASITLIDIR, bir temanın her
 * görsel ayarı için varsayılan bir görsel sağlaması zorunlu değildir.
 *
 * ⚠ M2 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti A, security'nin bulgusu)
 * — bu fonksiyon `defineTheme()`'i ATLAYIP DOĞRUDAN çağrılabildiği için
 * (şema ayrıştırmasından GEÇMEMİŞ bir tanım listesiyle) AC6 katman 1
 * (`SETTING_KEY_SCHEMA`) burada DEVREDE DEĞİLDİ — güvensiz bir `key`
 * (`__proto__` sınıfı) SESSİZCE bir ÖZ anahtar olarak çıktıya girebiliyordu.
 * Bulgu SESSİZCE ATLANMAZ (görev kısıtı) — bu fonksiyon bir Result
 * DÖNDÜRMEDİĞİ için (DEĞER döner) `ThemeContractError` FIRLATILIR.
 *
 * ⚠ F1 KÖK ÇÖZÜMÜ (T-010 düzeltme turu 2/3, security'nin önerisi) — bu
 * fonksiyon ARTIK kendi ön kontrol KOPYASINI taşımaz; `./schema-from-
 * definitions.js`'in `schemaFromDefinitions`'ını ÇAĞIRIR (dönen şema
 * KULLANILMAZ, YALNIZCA doğrulama YAN ETKİSİ için) — o fonksiyonun İÇİNDEKİ
 * TEK, TAM ön kontrolden (yinelenen `key` + tam `key` kabul edilebilirliği,
 * `schema-from-definitions.ts` dosya başı yorumu) geçer. ÖNCEKİ hâl
 * (yalnızca `findUnsafeSettingKeyIssues`) yinelenen `key`'i KONTROL
 * ETMİYORDU — bir `group`/kök dizide yinelenen `key` varsayılanı SESSİZCE
 * gölgeliyordu (security'nin S1 bulgusu).
 */
export function deriveDefaultSettings(
  definitions: readonly ThemeSettingDefinition[],
): ThemeSettingsValue {
  schemaFromDefinitions(definitions)

  return Object.fromEntries(
    definitions.map(
      (definition) => [definition.key, defaultValueOfDefinition(definition)] as const,
    ),
  )
}

// @arkesoft/theme-sdk — ayar tanımı listesinde GÜVENSİZ/GEÇERSİZ `key`
// taraması (ROADMAP v0.0.9, T-010 düzeltme turu 1/3 · parti A, M2 ·
// düzeltme turu 2/3, solid'in bulgusu M2)
//
// ⚠ GEREKÇE (M2, security'nin bulgusu) — `./keys.ts`'teki `SETTING_KEY_
// SCHEMA` yalnızca `validateThemeManifest` YOLUYLA (bir `theme.json`'ın
// şema ayrıştırması SIRASINDA) devreye girer. Üç DOĞRUDAN DIŞA AÇIK giriş
// noktası (`validateThemeSettings`, `deriveDefaultSettings`,
// `schemaFromDefinitions`) tanım listesini ZATEN TİPLİ (`ThemeSettingDefinition
// []`) olarak alır — bu, şema ayrıştırmasından GEÇMİŞ olduğu anlamına
// GELMEZ (bir çağıran `defineTheme()`'i ATLAYIP bu fonksiyonları doğrudan
// çağırabilir, nitekim bu paketin KENDİ testleri tam olarak bunu yapıyor).
// Bu modül bu ÜÇ giriş noktası için ORTAK bir savunmacı ön kontrol sağlar —
// `group.children` İÇİNE de ÖZYİNELİ iner (derinlik-1 garantisi `primitives.
// ts`'ten gelir, sonsuz döngü riski YOK).
//
// ⚠ M2 DÜZELTMESİ (T-010 düzeltme turu 2/3, solid'in bulgusu) — bu tarama
// ÖNCEDEN yalnızca `isUnsafeSettingKey` (isim kara listesi) KULLANIYORDU —
// `SETTING_KEY_SCHEMA`'nın (manifest yolu) uyguladığı biçim deseni +
// uzunluk sınırı burada YOKTU. Sonuç: üç DOĞRUDAN giriş noktası `''`/
// `' '`/`'../x'`/`'a\nb'`/`'<script>'`/5000 karakter gibi girdileri KABUL
// ediyordu — manifest yolunun AYNI girdiler için REDDETTİĞİ YARIM GÜÇ.
// Artık `./keys.ts`'in `isAcceptableSettingKey`'i (isim kara listesi VE
// biçim VE uzunluk, TEK kaynak) kullanılır — iki tüketici ARTIK AYNI GÜÇTE.
//
// Bulgu SESSİZCE ATLANMAZ (görev kısıtı): `deriveDefaultSettings` ve
// `schemaFromDefinitions` bir `{ ok, issues }` Result DÖNDÜRMEDİĞİ için
// (biri bir DEĞER, biri bir Zod ŞEMASI döner) issue'yu `ThemeContractError`
// olarak FIRLATIRLAR (CLAUDE.md §4 genel akışı, `errors.ts`'in fırlatan
// ikiz deseniyle TUTARLI). `validateThemeSettings` KENDİ Result biçimini
// zaten taşıdığı için issue'yu `{ ok: false, issues }` olarak DÖNER,
// FIRLATMAZ (bkz. `./validate-settings.ts`).

import type { ThemeContractIssue } from '../errors.js'
import { THEME_CONTRACT_MESSAGES } from '../messages.js'
import { formatThemeContractPath, type ThemeContractPathSegment } from '../paths.js'
import { isAcceptableSettingKey } from './keys.js'
import type { ThemeSettingDefinition } from './primitives.js'

/**
 * Bir tanım dizisinde (KÖK VEYA bir `group.children`) güvensiz İSİMLİ VEYA
 * geçersiz BİÇİMLİ bir `key` taşıyan elemanları ÖZYİNELİ olarak bulur ve
 * `ThemeContractIssue[]`'a çevirir (`isAcceptableSettingKey`, `./keys.js`
 * — TEK kaynak, dosya başı yorumu). `pathPrefix` çağıranın kendi alan
 * yolunu önceden eklemesini sağlar.
 */
export function findUnsafeSettingKeyIssues(
  definitions: readonly ThemeSettingDefinition[],
  pathPrefix: readonly ThemeContractPathSegment[] = [],
): readonly ThemeContractIssue[] {
  return definitions.flatMap((definition, index): readonly ThemeContractIssue[] => {
    const ownIssue: readonly ThemeContractIssue[] = isAcceptableSettingKey(definition.key)
      ? []
      : [
          {
            code: 'THEME_SETTING_KEY_UNSAFE',
            path: formatThemeContractPath([...pathPrefix, index, 'key']),
            message: THEME_CONTRACT_MESSAGES.THEME_SETTING_KEY_UNSAFE,
          },
        ]

    const childIssues: readonly ThemeContractIssue[] =
      definition.type === 'group'
        ? findUnsafeSettingKeyIssues(definition.children, [...pathPrefix, index, 'children'])
        : []

    return [...ownIssue, ...childIssues]
  })
}

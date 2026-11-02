// @arkesoft/theme-sdk — yinelenen `key` → `ThemeContractIssue[]` (ROADMAP
// v0.0.9 T-010 düzeltme turu 1/3 · parti A, H2)
//
// `./duplicate-key-check.ts`'in saf tarayıcısını ÖZYİNELİ olarak (bir
// `group` tanımının `children`'ı İÇİNE inerek) `ThemeContractIssue[]`'a
// çevirir. İKİ tüketicisi var:
//   - `./validate-settings.ts` — `validateThemeSettings`'in SAVUNMACI ön
//     kontrolü (H1+H2 birlikte: doğrudan `validateThemeSettings` çağrısına
//     geçirilen, HENÜZ manifest şemasından GEÇMEMİŞ bir tanım dizisi de
//     yakalanır).
//   - `../manifest/validate-manifest.ts` — KÖK `settings` dizisi için
//     post-parse kontrol (manifest.ts'in şema seviyesinde `.check()`
//     EKLENEMEDİĞİ için; bkz. o dosyanın üstündeki "TAŞIMA KARARI" emsali —
//     bu T-010 düzeltme turunda `manifest.ts` parti B'nin dosyası, bu
//     yüzden şema SEVİYESİNDE DEĞİL orkestrasyon SEVİYESİNDE kapatılır).
// `group.children`'ın KENDİSİ `primitives.ts`'te ŞEMA SEVİYESİNDE zaten
// kapatıldığı için (ayrı bir `.check()`, `./duplicate-key-check.ts`'i
// doğrudan kullanır) bu dosyanın özyinelemesi ORADA bulunan bir yineleneni
// TEKRAR raporlayabilir — bu bir GERİLEME DEĞİL, aynı sonucun iki bağımsız
// giriş noktasından (şema VE savunmacı ön kontrol) AYNI şekilde
// yakalanması; `validateThemeManifest` zaten şema aşamasında DURUR
// (`parsed.success` false ise bu dosyaya hiç gelinmez).
//
// Özel bir hata kodu AÇILMADI — genel-geçer `THEME_SETTING_INVALID`
// kullanılır (kapalı 15'lik liste, görev kısıtı).

import type { ThemeContractIssue } from '../errors.js'
import { THEME_CONTRACT_MESSAGES } from '../messages.js'
import { formatThemeContractPath, type ThemeContractPathSegment } from '../paths.js'
import { findDuplicateSettingKeyEntries } from './duplicate-key-check.js'
import type { ThemeSettingDefinition } from './primitives.js'

/**
 * Bir tanım dizisinde (KÖK VEYA bir `group.children`) yinelenen `key`
 * taşıyan elemanları ÖZYİNELİ olarak bulur ve `ThemeContractIssue[]`'a
 * çevirir. `pathPrefix` çağıranın kendi alan yolunu (ör. manifest için
 * `['settings']`, doğrudan çağrı için `[]`) önceden eklemesini sağlar.
 */
export function findDuplicateSettingKeyIssues(
  definitions: readonly ThemeSettingDefinition[],
  pathPrefix: readonly ThemeContractPathSegment[] = [],
): readonly ThemeContractIssue[] {
  const ownIssues: readonly ThemeContractIssue[] = findDuplicateSettingKeyEntries(definitions).map(
    (duplicate) => ({
      code: 'THEME_SETTING_INVALID',
      path: formatThemeContractPath([...pathPrefix, duplicate.index, 'key']),
      message: THEME_CONTRACT_MESSAGES.THEME_SETTING_INVALID,
    }),
  )

  const nestedIssues: readonly ThemeContractIssue[] = definitions.flatMap((definition, index) =>
    definition.type === 'group'
      ? findDuplicateSettingKeyIssues(definition.children, [...pathPrefix, index, 'children'])
      : [],
  )

  return [...ownIssues, ...nestedIssues]
}

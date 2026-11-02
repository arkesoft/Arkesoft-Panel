// @arkesoft/theme-sdk — ayar tanımı dizisinde yinelenen `key` tespiti
// (ROADMAP v0.0.9, T-010 düzeltme turu 1/3 · parti A, H2)
//
// ⚠ GEREKÇE (H2, security'nin bulgusu) — `settings` ve `group.children`
// dizilerinde yinelenen `key` kontrol edilmiyordu; `schemaFromDefinitions`/
// `deriveDefaultSettings`'in `Object.fromEntries` kullanımı yüzünden SON
// tanım ÖNCEKİNİ sessizce gölgeliyordu. Örnek: `[{key:'hero',type:'image'},
// {key:'hero',type:'text'}]` → 'hero' anahtarının DEĞER şeması `text`'in
// (serbest metin) şemasıdır, `image`'ın `ThemeAssetRef` + yol doğrulaması
// (H1) HİÇ ÇALIŞMAZ. Bu, `../manifest/templates.ts`'teki `THEME_TEMPLATES_
// SCHEMA`'nın dizi seviyesi `.check()` deseniyle AYNI sınıf bir kural (tek
// elemanın kendi başına BİLEMEYECEĞİ, TÜM diziye bakması gereken bir kural).
//
// Bu dosya SADECE saf (side-effect'siz) tarama mantığını taşır — `key`
// alanı DIŞINDA hiçbir alana bakmaz, bu yüzden `ThemeSettingDefinition`'a
// (primitives.ts) BAĞIMLI DEĞİLDİR (yapısal tip `{ readonly key: string }`
// yeterli) — `primitives.ts`'in bu modülü İTHAL EDEBİLMESİ için (group.
// children şemasının `.check()`'i) döngüsel bağımlılık (primitives.ts ↔ bu
// dosya) OLUŞMAMASI gerekiyordu; bu yüzden ÇIKARILAN tanım tipine değil,
// yapısal bir alt kümeye bağımlıdır. Özyineleme (group.children İÇİNE
// inme) VE issue biçimine (Zod `payload.issues` veya `ThemeContractIssue[]`)
// ÇEVİRME İŞİ bu dosyanın SORUMLULUĞUNDA DEĞİL — her tüketici (primitives.
// ts, `../settings/duplicate-key-issues.ts`) kendi biçimine kendisi çevirir;
// tek doğrulama kaynağı burada (sekiz yüzeyde — templates, settings, group.
// children, asset-ref vb. — AYNI "önceki tekrar edilmez" mantığı sekiz kez
// YAZILMASIN).

/** Bir yinelenen `key` bulgusu — dizideki (ikinci veya sonraki) konumu + anahtarın kendisi. */
export interface DuplicateSettingKeyEntry {
  readonly index: number
  readonly key: string
}

/**
 * Bir tanım dizisinde (KÖK `settings` VEYA bir `group.children`) yinelenen
 * `key` taşıyan elemanları bulur — İLK occurrence meşru kabul edilir,
 * SONRAKİ her occurrence bir bulgu olarak döner (`../manifest/templates.ts`'in
 * `THEME_TEMPLATE_DUPLICATE` deseniyle AYNI sıralama kuralı).
 */
export function findDuplicateSettingKeyEntries(
  definitions: readonly { readonly key: string }[],
): readonly DuplicateSettingKeyEntry[] {
  const firstIndexOfKey = new Map<string, number>()
  const duplicates: DuplicateSettingKeyEntry[] = []

  definitions.forEach((definition, index) => {
    const firstIndex = firstIndexOfKey.get(definition.key)

    if (firstIndex !== undefined) {
      duplicates.push({ index, key: definition.key })
      return
    }

    firstIndexOfKey.set(definition.key, index)
  })

  return duplicates
}

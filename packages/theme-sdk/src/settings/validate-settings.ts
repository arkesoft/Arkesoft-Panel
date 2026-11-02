// @arkesoft/theme-sdk — "SOY ama RAPORLA" ayar değeri doğrulayıcısı
// (ROADMAP v0.0.9, T-010/S3, AC5 + AC6 İKİNCİ KATMAN)
//
// ⚠ GÜVEN SINIRI KARARI (pm, bağlayıcı) — ayar DEĞERLERİNDE (manifest
// DEĞİL) bilinmeyen bir anahtar REDDEDİLMEZ, SOYULUR ama RAPORLANIR.
// Gerekçe: CLAUDE.md §9'un 7 günlük geri alma penceresi + N-2 sürüm
// uyumluluğu, bir temanın v2'de YAZDIĞI ayar nesnesinin v1 ŞEMASIYLA (geri
// alma sırasında) OKUNABİLMESİNİ zorunlu kılıyor — v2, v1'den YENİ bir
// anahtar eklemiş olabilir; bu v1 için "bilinmeyen"dir ama KULLANICININ
// KENDİ VERİSİDİR. Reddetmek rollback'i kullanıcının kendi verisi üzerinde
// KIRAR. Manifest (theme.json, tema YAZARININ beyanı) için karar TERSTİR
// (REDDET, `src/manifest/` → S5) — iki yüzey, iki güven modeli (farklı
// yazar/tüketici ilişkisi: manifest'i tema YAZARI, ayar değerlerini
// SON KULLANICI/mağaza sahibi üretir).
//
// ⚠ SDK HİÇBİR ŞEYİ KALICILAŞTIRMAZ VEYA SİLMEZ — `unknownKeys` salt
// RAPORdur; çağıran (ör. `apps/api`'deki bir tRPC prosedürü) bu listeyle NE
// YAPACAĞINA kendi karar verir (ör. bir denetim kaydına yazmak, mağaza
// sahibini uyarmak). Bu paket I/O yapmaz (saflık pini, `__tests__/
// purity.test.ts`).
//
// ⚠ AC6 İKİNCİ KATMAN — SESSİZ BAŞARISIZLIK NOKTASI (T-010 handoff notu,
// ölçüldü): bu fonksiyon Zod'un `safeParse` ÇIKTISINI (`result.data`)
// döner, HAM GİRDİYİ ASLA. Ham girdiyi döndürmek `__proto__` gibi bir
// anahtarı (ör. `JSON.parse('{"__proto__":1}')`'in ürettiği, Object.
// prototype'ı DEĞİL bir ÖZ/kendi anahtar olan girdi) İLERİ TAŞIR ve
// prototip kirliliği testini YANLIŞ NEDENLE geçirir. `zod@4.6.7` bu sınıfa
// karşı inşaen sağlamlaştırılmıştır (`util.js:95-102` `assignProp` →
// `Object.defineProperty` kullanır; `util.js:128-134` `putProp` →
// `__proto__` setter'ını atlatır; `util.js:593-598` issue kurarken
// `__proto__` anahtarını düşürür) — AMA BU GARANTİ YALNIZCA PARSE ÇIKTISI
// DÖNDÜRÜLDÜĞÜNDE GEÇERLİDİR. Testler (`__tests__/validate-settings.
// test.ts`) bunu İKİ assertion'la kanıtlar: (1) `(result.value as Record<
// string, unknown>).polluted === undefined` (2) `result.value` ham girdiyle
// REFERANS EŞİT DEĞİL (`not.toBe(rawInput)`) — İKİNCİSİ OLMADAN BİRİNCİSİ
// YANLIŞ NEDENLE yeşil kalabilir (ham girdi döndürülse de `polluted` zaten
// tanımsız olurdu, ama o durumda `__proto__` İLERİ TAŞINMIŞ olurdu).

import {
  ThemeContractError,
  type ThemeContractFailure,
  type ThemeContractIssue,
} from '../errors.js'
import { formatThemeContractPath, type ThemeContractPathSegment } from '../paths.js'
import type { ThemeSettingDefinition } from './primitives.js'
import { schemaFromDefinitions, type ThemeSettingsValue } from './schema-from-definitions.js'
import { themeContractIssuesFromZodError } from './zod-issue-mapping.js'

/**
 * `validateThemeSettings`'in BAŞARI dalı. ⚠ `ThemeContractResult<T>`'TEN
 * (errors.ts) KASITLI OLARAK FARKLI bir birleşimdir — o tipin başarı dalı
 * `warnings` taşır, bu fonksiyon ise AC5'in isim sözleşmesine göre
 * `unknownKeys` taşımak ZORUNDADIR (görev tanımındaki imza birebir).
 * Başarısızlık dalı için `ThemeContractFailure` AYNEN yeniden kullanılır
 * (şekli `{ ok: false; issues }` zaten birebir örtüşüyor — ikinci bir tip
 * TANIMLAMAK gereksiz tekrar olurdu).
 */
export interface ThemeSettingsValidationSuccess {
  readonly ok: true
  readonly value: ThemeSettingsValue
  readonly unknownKeys: readonly string[]
}

/** `validateThemeSettings`'in dönüş birleşimi. */
export type ThemeSettingsValidationResult = ThemeSettingsValidationSuccess | ThemeContractFailure

/**
 * Girdinin KENDİ anahtar kümesi − tanımların bildirdiği anahtar kümesi
 * farkını hesaplar. `input` bu noktada zaten BAŞARIYLA parse edilmiş (bir
 * nesne olduğu Zod tarafından doğrulanmış) olduğu için `Object.keys` ile
 * güvenle okunabilir — bu salt OKUMA'dır; `Object.keys` `__proto__`'yu bir
 * ÖZ/kendi anahtar olarak (JSON.parse'ın üretebileceği gibi) döner ama
 * prototipi MUTASYONA UĞRATMAZ.
 *
 * ⚠ M3 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti A, solid'in bulgusu) —
 * eski hâli yalnızca KÖK seviyeyi okuyordu; bir `group` değer nesnesi
 * İÇİNDEKİ bilinmeyen anahtar `z.object` strip ile SOYULUYORDU ama
 * `unknownKeys`'e HİÇ GİRMİYORDU (AC5'in "SOY ama RAPORLA"sı iç içe
 * ayarlarda TUTMUYORDU — rollback/N-2 gerekçesi İÇ İÇE anahtar için
 * BİREBİR AYNI geçerli). Şimdi tanım ağacı boyunca ÖZYİNELİ inilir, bir
 * `group` tanımına karşılık gelen İÇ İÇE girdi nesnesi kendi alt tanım
 * listesiyle AYNI şekilde taranır; yol `formatThemeContractPath` ile
 * `advanced.ghost` biçiminde biçimlendirilir (`../paths.js`, paketin TEK
 * biçimlendirme noktası — dosya başı yorumlarına bakınız).
 */
function unknownKeysOf(
  definitions: readonly ThemeSettingDefinition[],
  input: unknown,
  pathPrefix: readonly ThemeContractPathSegment[] = [],
): readonly string[] {
  if (typeof input !== 'object' || input === null) {
    return []
  }

  const inputRecord = input as Record<string, unknown>
  const knownKeys = new Set(definitions.map((definition) => definition.key))

  const ownUnknownKeys = Object.keys(inputRecord)
    .filter((key) => !knownKeys.has(key))
    .map((key) => formatThemeContractPath([...pathPrefix, key]))

  const nestedUnknownKeys = definitions.flatMap((definition) =>
    definition.type === 'group'
      ? unknownKeysOf(definition.children, inputRecord[definition.key], [
          ...pathPrefix,
          definition.key,
        ])
      : [],
  )

  return [...ownUnknownKeys, ...nestedUnknownKeys]
}

/**
 * Bir tema örneğinin ayar DEĞERLERİ nesnesini (JSONB'den okunan, `unknown`)
 * tanım listesine göre doğrular. Bilinmeyen anahtarlar hataya YOL AÇMAZ —
 * SOYULUR (`value`'da YOK) ama RAPORLANIR (`unknownKeys`'te VAR). Geçersiz
 * bir ayar DEĞERİ (ör. tip uyumsuzluğu, `select`'in `options` dışı bir
 * değeri) `ok: false` ile issue listesi döner — `path`/`code` ikisi de
 * `../paths.js`/`./zod-issue-mapping.js` üzerinden TUTARLI biçimlendirilir
 * (⚠ S5, `src/` KÖKÜNE taşımayı DEĞERLENDİRDİ ama S6'nın eşzamanlı
 * `migrations/run.ts`'i bu modülü ESKİ konumdan import ettiği ve S5'in
 * `run.ts`'e dokunması YASAK olduğu için TAŞIMADI, bkz. o dosyanın başı),
 * `message` HER ZAMAN Türkçe (`THEME_CONTRACT_MESSAGES`, AC3).
 *
 * ⚠ F1 KÖK ÇÖZÜMÜ (T-010 düzeltme turu 2/3, security'nin önerisi) — bu
 * fonksiyon ARTIK kendi savunmacı ön kontrol KOPYASINI (yinelenen `key` +
 * güvensiz `key`, H2 + M2) taşımaz. `schemaFromDefinitions`'ın (`./schema-
 * from-definitions.js`) İÇİNDEKİ TEK, TAM ön kontrol (yinelenen `key` +
 * tam `key` kabul edilebilirliği) `ThemeContractError` olarak FIRLAR; bu
 * fonksiyon onu `try`/`catch` ile YAKALAYIP kendi Result sözleşmesine
 * (`{ ok: false, issues }`) ÇEVİRİR — fırlatma bu fonksiyonun SINIRINI
 * ASLA AŞMAZ (bu fonksiyon ZATEN bir Result döndürdüğü için,
 * `deriveDefaultSettings`/`migrateThemeSettings`'in FIRLATAN/`try`-yakalayan
 * deseninden FARKLI bir sözleşme taşır — görev tanımının imzası).
 */
export function validateThemeSettings(
  definitions: readonly ThemeSettingDefinition[],
  input: unknown,
): ThemeSettingsValidationResult {
  let schema: ReturnType<typeof schemaFromDefinitions>
  try {
    schema = schemaFromDefinitions(definitions)
  } catch (schemaConstructionError) {
    if (schemaConstructionError instanceof ThemeContractError) {
      return { ok: false, issues: schemaConstructionError.issues }
    }
    // Hata YUTULMAZ (CLAUDE.md §4) — bu fonksiyonun sözleşmesi YALNIZCA
    // `ThemeContractError`'ı Result'a çevirir, BAŞKA bir beklenmedik hata
    // türü (ör. bir programlama hatası) SESSİZCE yutulmaz, yukarı iletilir.
    throw schemaConstructionError
  }

  const result = schema.safeParse(input)

  if (!result.success) {
    const issues: readonly ThemeContractIssue[] = themeContractIssuesFromZodError(
      result.error,
      'THEME_SETTING_INVALID',
    )
    return { ok: false, issues }
  }

  return {
    ok: true,
    value: result.data,
    unknownKeys: unknownKeysOf(definitions, input),
  }
}

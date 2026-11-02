// @arkesoft/theme-sdk — Zod issue → ThemeContractIssue dönüşümü (ROADMAP
// v0.0.9, T-010/S3 başlattı, T-010/S5 ikinci bir tüketici ekledi)
//
// ⚠ TAŞIMA KARARI (S5, handoff'ta "KARARLAR" bölümünde AYRICA bildirilir):
// bu modül S3'te `src/settings/zod-issue-mapping.ts` olarak doğdu (tek
// tüketici `validate-settings.ts`'ti). S5'in görevi `src/` KÖKÜNE taşımaya
// İZİN VERİYORDU (iki+ alan tüketince, manifest → settings katmanlaması
// tuhaf olurdu) — AMA S5 başladığında S6'nın `src/migrations/run.ts`'i
// ZATEN YAZILMIŞTI ve BU dosyayı `../settings/zod-issue-mapping.js`
// (ESKİ/BUGÜNKÜ konum) üzerinden import ediyordu. S5'in DOKUNMA kısıtı
// `run.ts`'e KESİNLİKLE İZİN VERMİYOR (S6 EŞZAMANLI çalışıyordu) — bir
// taşıma `run.ts`'in import'unu KIRARDI ve S5'in o dosyayı DÜZELTMESİ
// YASAKTI. Bu yüzden S5 TAŞIMADI — modül `src/settings/` altında KALDI;
// S5'in YENİ `manifest/validate-manifest.ts`'i bu modüle `../settings/
// zod-issue-mapping.js` (bir seviye yukarı + `settings/`) ile ulaşır. Bu,
// "manifest → settings" katman yönü açısından ideal DEĞİL ama S6'nın
// paralel çalışmasını BOZMAMAK, io/layering estetiğinden DAHA ÖNCELİKLİ
// bir kısıttı (ölçülebilir kapı: `run.ts` değişmedi, `git status --short`
// handoff'ta kanıtlanır).
//
// Kural: bir Zod issue'su `code: 'custom'` VE `params.themeContractErrorCode`
// BİLİNEN bir `ThemeContractErrorCode` taşıyorsa (ör. `settings/keys.ts`'in
// ürettiği `THEME_SETTING_KEY_UNSAFE`, `manifest/templates.ts`'in ürettiği
// `THEME_TEMPLATE_UNKNOWN`/`THEME_TEMPLATE_DUPLICATE`/`THEME_TEMPLATE_MISSING`)
// o kod KULLANILIR; aksi halde (Zod'un KENDİ ürettiği `invalid_type`/
// `too_big`/`invalid_format` gibi issue'lar — özel bir `params` TAŞIMAZLAR)
// çağıranın verdiği `fallbackCode` kullanılır.
//
// ⚠ S5'İN EKLEDİĞİ ÜÇÜNCÜ DAL — `code: 'unrecognized_keys'` (bir
// `z.strictObject`'in bilinmeyen anahtar reddi, AC4). Bu issue tipi
// `custom` DEĞİLDİR — Zod'un ÇEKİRDEK nesne doğrulaması ürettiği için
// (şemanın KENDİSİ bir `.check()` REFINE'I değil, temel ayrıştırma
// adımıdır) şema İÇİNDEN bir `params.themeContractErrorCode` etiketi İĞNE
// EDİLEMEZ — eşleme BU DOSYADA (merkezi, tek nokta) yapılır. Bir
// `unrecognized_keys` issue'su BİRDEN FAZLA anahtar taşıyabilir
// (`issue.keys: string[]`) — her anahtar KENDİ `ThemeContractIssue`'suna
// genişletilir (`flatMap`, tek issue → N issue), path'i `[...issue.path,
// key]` (bilinmeyen anahtarın KENDİSİ path'e eklenir, ör. kök seviyede
// `'tempaltes'`, iç içe bir yerde `'templates[2].tempaltes'`). Bu eşleme
// `z.strictObject` kullanan HER YÜZEY için geçerlidir (manifest KÖKÜ,
// şablon/slot nesneleri, ayar TANIM nesneleri — hepsi theme.json'ın bir
// parçası, "yazar masada" felsefesi hepsine eşit uygulanır); ayar
// DEĞERLERİ (`schemaFromDefinitions`'ın ürettiği şema) `z.object` (strip)
// kullanır ve bu kod yolunu HİÇBİR ZAMAN tetiklemez — bu üçüncü dal S3'ün
// "SOY ama RAPORLA" davranışını ÇÜRÜTMEZ.
//
// ⚠ MESAJ KAYNAĞI KASITLI OLARAK `issue.message` DEĞİL: Zod'un kendi ürettiği
// issue metinleri varsayılan olarak İNGİLİZCEDİR (tr locale'i bilinçli
// kullanılmıyor, bkz. `../messages.ts` dosya başı yorumu) — bu paketin
// mesaj sözleşmesi HER ZAMAN `THEME_CONTRACT_MESSAGES[code]`'dan gelir
// (Türkçe geliştirici metni, AC3). Tek biçimlendirme noktası
// `../paths.js`'teki `formatThemeContractPath` — ham segment dizisi burada
// elle biçimlendirilmez.

import type { z } from 'zod'

import type { ThemeContractErrorCode, ThemeContractIssue } from '../errors.js'
import { THEME_CONTRACT_MESSAGES } from '../messages.js'
import { formatThemeContractPath, type ThemeContractPathSegment } from '../paths.js'

/** `THEME_CONTRACT_MESSAGES`'in anahtar kümesi — 15 kararlı kodun KENDİSİ, elle tekrarlanmaz. */
const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set(Object.keys(THEME_CONTRACT_MESSAGES))

/** `unknown` bir değerin bilinen bir `ThemeContractErrorCode` olup olmadığını daraltır (CLAUDE.md §2: `any` yasak, `unknown` + daraltma kullanılır). */
function isThemeContractErrorCode(value: unknown): value is ThemeContractErrorCode {
  return typeof value === 'string' && KNOWN_ERROR_CODES.has(value)
}

/**
 * Zod'un `issue.path`'i `PropertyKey[]` (`string | number | symbol`) —
 * `ThemeContractPathSegment` ise `string | number` (bkz. `./paths.ts`).
 * Bu paketin ürettiği şemalarda (nesne anahtarı / dizi indeksi) bir path
 * segmenti PRATİKTE asla `symbol` OLMAZ, ama tip sistemi bunu bilemez;
 * kaçınılmaz uç durum için `symbol`'ü okunur bir dizeye çevirir (`unknown`
 * değer üretmez, veri kaybına da YOL AÇMAZ — `symbol.toString()` geliştirici
 * log'unda okunur kalır).
 */
function toPathSegment(segment: PropertyKey): ThemeContractPathSegment {
  return typeof segment === 'symbol' ? segment.toString() : segment
}

/**
 * Bir `unrecognized_keys` issue'sunu — BİRDEN FAZLA anahtar taşıyabildiği
 * için — anahtar sayısı kadar `ThemeContractIssue`'ya genişletir (dosya
 * başı yorumu, S5 eklentisi). Her zaman `THEME_MANIFEST_UNKNOWN_KEY` kodu
 * kullanılır — `fallbackCode` burada GEÇERSİZDİR, "bilinmeyen anahtar"
 * anlamı bağlamdan BAĞIMSIZDIR.
 */
function themeContractIssuesFromUnrecognizedKeys(
  issue: z.core.$ZodIssueUnrecognizedKeys,
): readonly ThemeContractIssue[] {
  const basePath = issue.path.map(toPathSegment)

  return issue.keys.map((key) => ({
    code: 'THEME_MANIFEST_UNKNOWN_KEY',
    path: formatThemeContractPath([...basePath, key]),
    message: THEME_CONTRACT_MESSAGES.THEME_MANIFEST_UNKNOWN_KEY,
  }))
}

/** Tek bir Zod issue'sunu bir VEYA DAHA FAZLA `ThemeContractIssue`'ya çevirir (`unrecognized_keys` çoğullaşabilir). */
function themeContractIssuesFromZodIssue(
  issue: z.core.$ZodIssue,
  fallbackCode: ThemeContractErrorCode,
): readonly ThemeContractIssue[] {
  if (issue.code === 'unrecognized_keys') {
    return themeContractIssuesFromUnrecognizedKeys(issue)
  }

  const customCode: unknown =
    issue.code === 'custom' ? issue.params?.['themeContractErrorCode'] : undefined
  const code = isThemeContractErrorCode(customCode) ? customCode : fallbackCode

  return [
    {
      code,
      path: formatThemeContractPath(issue.path.map(toPathSegment)),
      message: THEME_CONTRACT_MESSAGES[code],
    },
  ]
}

/**
 * Bir Zod `ZodError`'ın issue listesini `ThemeContractIssue[]`'a çevirir.
 * `fallbackCode` — issue özel bir `themeContractErrorCode` TAŞIMIYORSA
 * (ör. temel tip/aralık uyumsuzluğu) kullanılacak genel-geçer kod.
 * `flatMap` kullanılır — bir `unrecognized_keys` issue'su birden fazla
 * `ThemeContractIssue` üretebilir (dosya başı yorumu).
 */
export function themeContractIssuesFromZodError(
  error: z.ZodError,
  fallbackCode: ThemeContractErrorCode,
): readonly ThemeContractIssue[] {
  return error.issues.flatMap((issue) => themeContractIssuesFromZodIssue(issue, fallbackCode))
}

// @arkesoft/versioning — semver ARALIK (range) ayrıştırma + karşılama
// hesabı (ROADMAP v0.0.21, T-018/S1, ADR-0020 Karar 2)
//
// ⚠ KAPALI GRAMER — bu dosya `packages/theme-sdk/src/manifest/manifest.ts`'in
// `sdkRange` biçimini (architect'in `:72-84`'te OKUYUP ÖLÇTÜĞÜ gramer)
// karşılar: operatör kümesi `^ ~ >= <= > < =` VEYA YOK, boşlukla ayrılmış
// VE-birleşimi. `||` (ayrık birleşim), `x`/`*` joker, tire aralıkları
// (`1.0.0 - 2.0.0`) ve gelişmiş ön-sürüm aralık semantiği BİLİNÇLİ OLARAK
// YAZILMADI — platformun kendi grameri bunları YAPISAL OLARAK REDDEDİYOR,
// uygulamak ÖLÜ KOD olurdu (ADR-0020 Karar 2, "Değerlendirilen
// alternatifler" tablosu, `semver` npm paketini reddetme gerekçesiyle AYNI).
//
// Gramerin BIRAKTIĞI üç boşluk, yazılı semantik kurallarla BURADA kapatılır
// (gramer onları kabul eder ama bir ANLAM vermez):
//
// 1. Operatörsüz çekirdek (`1.2.3`) ⇒ `=`. Verilmezse `satisfies('1.2.3',
//    '1.2.3')`'ün sonucu TANIMSIZ olurdu.
// 2. `^`/`~`'nin `0.x` özel hâlleri npm UYUMLUDUR: `^0.1.0` ⇒ `>=0.1.0
//    <0.2.0` · `^0.0.3` ⇒ `>=0.0.3 <0.0.4` · `~0.1.0` ⇒ `>=0.1.0 <0.2.0`.
//    Bu, el yazımı bir uygulamanın npm'den SESSİZCE ayrıştığı TEK yerdir
//    (R-A6) — sınır testleri `__tests__/range.test.ts`'te ZORUNLUDUR.
// 3. Asgari ön-sürüm kuralı: ön-sürüm taşıyan bir sürüm aralığı
//    KARŞILAMAZ; İSTİSNA: bir karşılaştırıcı AYNI major.minor.patch
//    üçlüsünde KENDİ ön-sürümünü taşıyorsa. Yoksa `satisfies('1.0.0-rc.1',
//    '>=1.0.0')` TANIMSIZ davranış olurdu.
//
// ⚠ FAIL-CLOSED: {@link satisfies} biçim geçersizse `false` döner —
// "karşılamıyor" ile "geçersiz" BİLİNÇLİ OLARAK AYNI sonuca düşer (dosya
// içindeki fonksiyon yorumu).

import {
  compareSemverParts,
  parseSemver,
  SEMVER_CORE_PATTERN_SOURCE,
  type SemverParts,
} from './semver.js'

/** Bir aralık karşılaştırıcısının operatörü — `^ ~ >= <= > < =`; gramerde "YOK" durumu `=`'e normalize edilir (dosya başı kural 1). */
export type RangeOperator = '^' | '~' | '>=' | '<=' | '>' | '<' | '='

/** Tek bir karşılaştırıcı: operatör + ayrıştırılmış semver. */
export type RangeComparator = {
  readonly operator: RangeOperator
  readonly version: SemverParts
}

/** Boşlukla ayrılmış karşılaştırıcıların VE-birleşimi (gramer, dosya başı notu). */
export type SemverRange = {
  readonly comparators: readonly RangeComparator[]
}

/**
 * Tek bir karşılaştırıcı TOKEN'ını (operatör öneki + semver çekirdeği)
 * ayrıştıran, çapalı ve YAKALAYAN desen. Operatör önekinin kaynağı
 * (`\^|~|>=|<=|>|<|=`) `packages/theme-sdk/src/manifest/manifest.ts`'in
 * `RANGE_OPERATOR_SOURCE`'uyla AYNI yedi değerdir (architect'in okuyup
 * ölçtüğü gramer) — burada doğrudan yakalayan bir grup olarak gömülüdür
 * (theme-sdk'nın çapasız, gömülebilir versiyonundan FARKLI olarak bu
 * paket onu tek bir token'ı doğrudan doğrulamak için kullanır).
 */
const COMPARATOR_TOKEN_PATTERN = new RegExp(`^(\\^|~|>=|<=|>|<|=)?(${SEMVER_CORE_PATTERN_SOURCE})$`)

/**
 * Regex'in yakaladığı operatör metnini {@link RangeOperator}'a daraltır.
 * `undefined` (operatör YOK) kural 1 gereği `=`'e normalize edilir. Regex
 * zaten yalnızca bu yedi değerden birini yakalayabildiği için `default`
 * dalı asla tetiklenmez — ama `as` İLE zorlamak YERİNE açık `switch` ile
 * daraltılır (CLAUDE.md §2, runtime doğrulamasız `as` yasağı).
 */
function toRangeOperator(operatorText: string | undefined): RangeOperator | undefined {
  if (operatorText === undefined) {
    return '='
  }
  switch (operatorText) {
    case '^':
    case '~':
    case '>=':
    case '<=':
    case '>':
    case '<':
    case '=':
      return operatorText
    default:
      return undefined
  }
}

/**
 * Bir aralık dizesini {@link SemverRange}'e ayrıştırır. Gramer dışına
 * çıkan (`||`, `x`/`*`, tire aralığı dahil) her dize `undefined` döner —
 * dizeden tipe geçişin tek sınırı (semver.ts'teki İKİ KATMAN notuyla AYNI
 * ilke).
 */
export function parseRange(range: string): SemverRange | undefined {
  const trimmed = range.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  const tokens = trimmed.split(/\s+/)
  const comparators: RangeComparator[] = []

  for (const token of tokens) {
    const match = COMPARATOR_TOKEN_PATTERN.exec(token)
    if (match === null) {
      return undefined
    }

    const operatorText = match[1]
    const versionText = match[2]
    if (versionText === undefined) {
      return undefined
    }

    const operator = toRangeOperator(operatorText)
    if (operator === undefined) {
      return undefined
    }

    const version = parseSemver(versionText)
    if (version === undefined) {
      return undefined
    }

    comparators.push({ operator, version })
  }

  if (comparators.length === 0) {
    return undefined
  }

  return { comparators }
}

/**
 * `^` karşılaştırıcısının üst sınırını hesaplar — npm UYUMLU `0.x` özel
 * hâlleriyle (dosya başı kural 2): `major > 0` ⇒ `(major+1).0.0` ·
 * `major === 0 && minor > 0` ⇒ `0.(minor+1).0` · `major === 0 && minor
 * === 0` ⇒ `0.0.(patch+1)`.
 */
function caretUpperBound(base: SemverParts): SemverParts {
  if (base.major > 0) {
    return { major: base.major + 1, minor: 0, patch: 0, prerelease: undefined }
  }
  if (base.minor > 0) {
    return { major: 0, minor: base.minor + 1, patch: 0, prerelease: undefined }
  }
  return { major: 0, minor: 0, patch: base.patch + 1, prerelease: undefined }
}

/** `~` karşılaştırıcısının üst sınırı — her zaman minor'ü bir artırır, patch'i sıfırlar (dosya başı kural 2). */
function tildeUpperBound(base: SemverParts): SemverParts {
  return { major: base.major, minor: base.minor + 1, patch: 0, prerelease: undefined }
}

/**
 * Bir karşılaştırıcının TEK BAŞINA bir sürümü karşılayıp karşılamadığını
 * hesaplar. Ayrımlı birleşim üzerinde kapsayıcı `switch` + yerel
 * `assertNever` (CLAUDE.md §4: "boolean/dize bayrak yığını kurma" — bu
 * paket `@arkesoft/errors`'a bağımlı olamadığı için `assertNever`'ın
 * paket-yerel bir kopyası burada yaşar, `packages/theme-sdk/src/
 * assert-never.ts`'in gerekçesiyle AYNI bilinçli karar).
 */
function comparatorMatches(version: SemverParts, comparator: RangeComparator): boolean {
  switch (comparator.operator) {
    case '=':
      return compareSemverParts(version, comparator.version) === 0
    case '>':
      return compareSemverParts(version, comparator.version) === 1
    case '>=':
      return compareSemverParts(version, comparator.version) !== -1
    case '<':
      return compareSemverParts(version, comparator.version) === -1
    case '<=':
      return compareSemverParts(version, comparator.version) !== 1
    case '^':
      return (
        compareSemverParts(version, comparator.version) !== -1 &&
        compareSemverParts(version, caretUpperBound(comparator.version)) === -1
      )
    case '~':
      return (
        compareSemverParts(version, comparator.version) !== -1 &&
        compareSemverParts(version, tildeUpperBound(comparator.version)) === -1
      )
    default:
      return assertNever(comparator.operator, 'range.ts: RangeComparator.operator')
  }
}

/**
 * Paket-yerel `assertNever` — bu paket `@arkesoft/errors`'a bağımlı
 * OLAMAZ (ADR-0020 Karar 2), bu yüzden platformdaki diğer kopyalar
 * (`packages/theme-sdk/src/assert-never.ts` vb.) gibi BURADA AYRI bir
 * kopya yaşar; terfi BİLİNÇLİ OLARAK REDDEDİLDİ (aynı gerekçe: davranışsal
 * sonuç yok, erken soyutlama olur, ROADMAP borç 1583'ün tavsiyesiyle
 * ÇATIŞMAZ). `RangeComparator.operator` kapalı bir birleşim olduğu ve
 * `parseRange`'in ürettiği HER değer yukarıdaki `switch`'in bir dalıyla
 * eşleştiği için bu dal ÇALIŞMA ZAMANINDA asla tetiklenmez — fırlatma
 * yalnızca bir PROGRAMCI HATASI (yeni bir operatör eklenip dal unutulması)
 * durumunda devreye girer, bir DOMAIN hatası değildir (ADR-0020'nin "hata
 * fırlatmaz" beyanı normal biçim/karşılama akışları için geçerlidir).
 */
function assertNever(value: never, context: string): never {
  throw new Error(`${context}: beklenmeyen değer — ${JSON.stringify(value)}`)
}

/**
 * Ön-sürüm taşıyan bir sürümün aralığı karşılayıp karşılamayacağını
 * belirleyen asgari ön-sürüm kuralı (dosya başı kural 3). Ön-sürüm
 * taşımayan sürümler için bu kural hiç TETİKLENMEZ (her zaman `true`).
 */
function satisfiesMinimumPrereleaseRule(version: SemverParts, range: SemverRange): boolean {
  if (version.prerelease === undefined) {
    return true
  }

  return range.comparators.some(
    (comparator) =>
      comparator.version.prerelease !== undefined &&
      comparator.version.major === version.major &&
      comparator.version.minor === version.minor &&
      comparator.version.patch === version.patch,
  )
}

/**
 * Zaten ayrıştırılmış bir sürümün, zaten ayrıştırılmış bir aralığı
 * karşılayıp karşılamadığını hesaplar. TOPLAM bir fonksiyondur — her iki
 * girdi de zaten tip sınırının ÖTESİNDEDİR, `undefined` DÖNEMEZ.
 */
export function satisfiesParsed(version: SemverParts, range: SemverRange): boolean {
  if (!satisfiesMinimumPrereleaseRule(version, range)) {
    return false
  }

  return range.comparators.every((comparator) => comparatorMatches(version, comparator))
}

/**
 * Bir sürüm DİZESİNİN bir aralık DİZESİNİ karşılayıp karşılamadığını
 * hesaplar. ⚠ FAIL-CLOSED: `version` veya `range` biçimsizse `false`
 * döner — "karşılamıyor" ile "geçersiz" BİLİNÇLİ OLARAK AYNI sonuca düşer
 * (dosya başı notu).
 */
export function satisfies(version: string, range: string): boolean {
  const parsedVersion = parseSemver(version)
  const parsedRange = parseRange(range)
  if (parsedVersion === undefined || parsedRange === undefined) {
    return false
  }
  return satisfiesParsed(parsedVersion, parsedRange)
}

/**
 * Bir `ThemeRelease`'in beyan ettiği `sdkRange`'in, platformda kurulu
 * GERÇEK `theme-sdk` sürümüyle (`sdkVersion`) uyumlu olup olmadığını
 * hesaplar. `satisfies`'in ADLANDIRILMIŞ, tema-sözleşmesi bağlamına özgü
 * bir sarmalayıcısıdır — fail-closed davranışı ondan DEVRALIR.
 */
export function isThemeReleaseCompatibleWithSdk(input: {
  readonly sdkRange: string
  readonly sdkVersion: string
}): boolean {
  return satisfies(input.sdkVersion, input.sdkRange)
}

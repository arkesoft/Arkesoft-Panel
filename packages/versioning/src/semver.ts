// @arkesoft/versioning — semver ÇEKİRDEK BİÇİM deseni + major çıkarımı +
// TOPLAM karşılaştırma (ROADMAP v0.0.21, T-018/S1, ADR-0020 Karar 2)
//
// ⚠ TAŞINAN KAYNAK — `SEMVER_CORE_PATTERN_SOURCE`, `SEMVER_FORMAT_PATTERN` ve
// `extractMajor` BU paketten ÖNCE `packages/theme-sdk/src/semver-format.ts`'te
// yaşıyordu ve ADR-0020 Karar 2 ile BİREBİR buraya taşındı (theme-sdk artık
// bu üçünü buradan ithal eder). O dosyanın kendi başı yorumu (`semver-
// format.ts:1-39`) aşağıda BİREBİR aktarılmıştır — ADR-0020'nin kendi
// ifadesiyle "bu projenin en değerli kurumsal belleği":
//
// ------------------------------------------------------------------------
// // @arkesoft/theme-sdk — paylaşılan semver ÇEKİRDEK BİÇİM deseni + major
// // çıkarımı (ROADMAP v0.0.9, T-010 düzeltme turu 1/3 · parti B, B4 bulgusu)
// //
// // ⚠ YALNIZCA BİÇİM — KARŞILAŞTIRMA YOK (bağlayıcı kısıt, architect'in
// // "Modül yerleşimi" kararıyla AYNI gerekçe: `packages/versioning`'in işi,
// // bu paket o pakete bağımlılık DOĞURMAZ). Bu modül `"1.2.0" < "1.5.0"`
// // türünden bir ÖNCELİK/ARALIK HESABI YAPMAZ — yalnızca (a) bir dizenin
// // semver GİBİ GÖRÜNÜP GÖRÜNMEDİĞİNİ ve (b) onun MAJOR bileşenini (bir
// // TAMSAYI çıkarımı) söyler.
// //
// // ⚠ ÖLÇÜLEN SAPMA (B4, security/solid'in bulgusu) — bu modül var olmadan
// // ÖNCE `migrations/chain.ts` (S4) VE `manifest/manifest.ts` (S5) birbirinden
// // BAĞIMSIZ iki semver çekirdek deseni taşıyordu (S4/S5 paralelliğinin
// // bedeli — ikisi de AYRI ayrı "semver KARŞILAŞTIRMASI yapılmaz" gerekçesini
// // kendi dosya başı yorumunda tekrarlıyordu, ama deseni KENDİ yazıyordu).
// // `chain.ts`'inki resmi semver.org düzenli ifadesinin BİREBİR kopyasıydı
// // (prerelease'in sayısal tanımlayıcısında BAŞTAKİ SIFIRI REDDEDER, spesifi-
// // kasyona UYUMLU); `manifest.ts`'inki DAHA GEVŞEKTİ (`[0-9A-Za-z-]+` —
// // baştaki sıfırı KABUL ederdi). Ölçülen sonuç: `"1.0.0-01"` manifest'in
// // `version`/`sdkRange` biçim kontrolünden GEÇİYORDU ama `chain.ts`'in
// // `extractMajor()`'ı `undefined` DÖNÜYORDU — AYNI girdi için biri KABUL biri
// // RED ediyor, tutarsız/sapmış bir sözleşme üretiyordu (iki ayrı
// // `THEME_MANIFEST_INVALID` bulgusuna yol açabiliyordu).
// //
// // ⚠ KARAR (B4 düzeltmesi) — DAHA KATI olan, resmi semver.org
// // spesifikasyonuna TAM UYUMLU desen KAZANDI. Gerekçe: semver.org'un KENDİSİ
// // "sayısal tanımlayıcılarda baştaki sıfır YASAKTIR" der (`01` geçerli bir
// // semver prerelease tanımlayıcısı DEĞİLDİR) — `chain.ts`'in deseni zaten
// // spesifikasyona UYUMLUYDU, `manifest.ts`'in deseni BİLİNÇLİ bir gevşetme
// // DEĞİLDİ (S4/S5'in BAĞIMSIZ yazılmasının yan etkisiydi, iki dosyanın kendi
// // başı yorumunda da AÇIKLANMIŞTI). Sonuç: `"1.0.0-01"` artık HER İKİ
// // tüketicide de REDDEDİLİR — tek kaynak bu dosya (`rg` ile tanım sayısı 1).
// //
// // `manifest.ts`'in `sdkRange` biçimi (operatör öneki + boşlukla ayrılmış
// // birden çok çekirdek) bu kaynak dizeyi (`SEMVER_CORE_PATTERN_SOURCE`) KENDİ
// // üst deseninin İÇİNE gömer — bu yüzden hem ÇAPALI bir `RegExp`
// // (`SEMVER_FORMAT_PATTERN`, tek bir TAM semver'i doğrudan test etmek için)
// // hem de ÇAPASIZ bir KAYNAK DİZESİ (`SEMVER_CORE_PATTERN_SOURCE`, bir ÜST
// // desenin PARÇASI olarak kullanılmak için) dışa açılır.
// ------------------------------------------------------------------------
//
// ⚠ İKİ KATMAN (architect kararı, bu dosyaya özgü — taşınan yorumun
// DEVAMI DEĞİL): CLAUDE.md §4 "beklenen durumlar için hata fırlat" der, ama
// bu paket domain hatası TANIMLAMAZ ve `@arkesoft/errors`'a bağımlı OLAMAZ
// (saflık, ADR-0020 Karar 2). Çözüm: dizeden tipe geçişin TEK sınırı
// `parseSemver`/`extractMajor` — biçim geçersizse `undefined` döner (bu
// şekil `extractMajor`'ın ZATEN taşıdığı, kabul görmüş biçimdir). Sınırın
// ÖTESİNDE (`compareSemverParts`) fonksiyonlar TOPLAMDIR — zaten ayrıştırılmış
// `SemverParts` üzerinde çalışır, `undefined` DÖNEMEZ. `compareSemver` bu
// iki katmanı birleştiren bir SARMALAYICIDIR (dizeden tipe geçiş + toplam
// karşılaştırma) — biçimlerden biri geçersizse `undefined` döner.

/**
 * Semver ÇEKİRDEĞİ (major.minor.patch + opsiyonel prerelease/build) — resmi
 * semver.org düzenli ifadesinin BİREBİR kopyası, ÇAPA (anchor) TAŞIMAZ.
 */
export const SEMVER_CORE_PATTERN_SOURCE =
  '(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?'

/** Tek bir TAM semver dizesini (çapalı) doğrulayan desen — {@link extractMajor}'ın da kullandığı TEK kaynak. */
export const SEMVER_FORMAT_PATTERN = new RegExp(`^${SEMVER_CORE_PATTERN_SOURCE}$`)

/**
 * Bir semver dizesinin MAJOR bileşenini çıkarır. Biçim geçersizse
 * `undefined` döner. `'1.2.3'` → `1` gibi bir TAMSAYI çıkarımıdır; bir
 * ARALIK/KARŞILAŞTIRMA hesabı burada YOKTUR (dosya başı yorumu).
 */
export function extractMajor(version: string): number | undefined {
  const match = SEMVER_FORMAT_PATTERN.exec(version)
  if (match === null) {
    return undefined
  }

  // Birinci yakalama grubu eşleşme başarılıysa HER ZAMAN tanımlıdır
  // (`(0|[1-9]\d*)` en az bir rakam içerir) — `noUncheckedIndexedAccess`
  // bunu bilemediği için `as` YERİNE açık bir `undefined` kontrolüyle
  // daraltılır (CLAUDE.md §2).
  const majorGroup = match[1]
  if (majorGroup === undefined) {
    return undefined
  }

  return Number(majorGroup)
}

/**
 * Bir semver dizesinin ayrıştırılmış bileşenleri. `prerelease` yalnızca
 * ÖN-SÜRÜM tanımlayıcı dizesini taşır (ör. `"rc.1"`), build metadata'yı
 * (`+...`) İÇERMEZ — build metadata semver.org spesifikasyonuna göre
 * ÖNCELİK karşılaştırmasına hiç KATILMAZ, bu yüzden ayrıştırılmış tipte
 * hiç yer AÇILMADI.
 */
export type SemverParts = {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: string | undefined
}

/**
 * Bir semver dizesini {@link SemverParts}'a ayrıştırır. Biçim geçersizse
 * `undefined` döner — repodaki semver çekirdek biçiminin TEK giriş sınırı
 * budur (dosya başı "İKİ KATMAN" notu).
 */
export function parseSemver(version: string): SemverParts | undefined {
  const match = SEMVER_FORMAT_PATTERN.exec(version)
  if (match === null) {
    return undefined
  }

  // `(0|[1-9]\d*)` her biri en az bir rakam içerdiği için eşleşme
  // başarılıysa bu üç grup HER ZAMAN tanımlıdır — `noUncheckedIndexedAccess`
  // bunu bilemediği için `as` YERİNE açık `undefined` kontrolüyle daraltılır
  // (`extractMajor`'ın deseniyle AYNI, CLAUDE.md §2).
  const majorText = match[1]
  const minorText = match[2]
  const patchText = match[3]
  if (majorText === undefined || minorText === undefined || patchText === undefined) {
    return undefined
  }

  // Build metadata'yı (varsa) at, SONRA ÖN-SÜRÜM ayracını (ilk `-`) bul.
  // `version.split('+')` her zaman en az bir eleman döndürür (boş dizge
  // bile `['']` verir) — bu yüzden `?? version` fallback'i yalnızca tip
  // sistemini (`noUncheckedIndexedAccess`) tatmin etmek içindir, çalışma
  // zamanında ASLA tetiklenmez.
  const withoutBuildMetadata = version.split('+')[0] ?? version
  const prereleaseSeparatorIndex = withoutBuildMetadata.indexOf('-')
  const prerelease =
    prereleaseSeparatorIndex === -1
      ? undefined
      : withoutBuildMetadata.slice(prereleaseSeparatorIndex + 1)

  return {
    major: Number(majorText),
    minor: Number(minorText),
    patch: Number(patchText),
    prerelease,
  }
}

/**
 * İki ayrıştırılmış semver'in ÖNCELİK sırasını karşılaştırır (semver.org
 * "Precedence" bölümü — major/minor/patch sayısal, sonra ön-sürüm; build
 * metadata hiç KATILMAZ, zaten {@link SemverParts} onu taşımıyor).
 * TOPLAM bir fonksiyondur — `SemverParts` zaten ayrıştırılmış olduğu için
 * `undefined` dönemez (dosya başı "İKİ KATMAN" notu).
 */
export function compareSemverParts(a: SemverParts, b: SemverParts): -1 | 0 | 1 {
  if (a.major !== b.major) {
    return a.major < b.major ? -1 : 1
  }
  if (a.minor !== b.minor) {
    return a.minor < b.minor ? -1 : 1
  }
  if (a.patch !== b.patch) {
    return a.patch < b.patch ? -1 : 1
  }

  // major.minor.patch eşit — ön-sürüm taşımayan sürüm ÜSTÜNDÜR (semver.org:
  // "a pre-release version has lower precedence than the associated normal
  // version").
  if (a.prerelease === undefined && b.prerelease === undefined) {
    return 0
  }
  if (a.prerelease === undefined) {
    return 1
  }
  if (b.prerelease === undefined) {
    return -1
  }

  return comparePrereleaseIdentifiers(a.prerelease, b.prerelease)
}

/**
 * Nokta ile ayrılmış ön-sürüm tanımlayıcılarını soldan sağa karşılaştırır
 * (semver.org "Precedence" madde 11.4). Daha FAZLA tanımlayıcı taşıyan
 * taraf, önceki tanımlayıcılar eşitse ÜSTÜNDÜR.
 */
function comparePrereleaseIdentifiers(a: string, b: string): -1 | 0 | 1 {
  const aIdentifiers = a.split('.')
  const bIdentifiers = b.split('.')
  const maxLength = Math.max(aIdentifiers.length, bIdentifiers.length)

  for (let index = 0; index < maxLength; index += 1) {
    const aIdentifier = aIdentifiers[index]
    const bIdentifier = bIdentifiers[index]

    if (aIdentifier === undefined) {
      return -1
    }
    if (bIdentifier === undefined) {
      return 1
    }

    const comparison = compareIdentifier(aIdentifier, bIdentifier)
    if (comparison !== 0) {
      return comparison
    }
  }

  return 0
}

const NUMERIC_IDENTIFIER_PATTERN = /^\d+$/

/**
 * Tek bir ön-sürüm tanımlayıcısını karşılaştırır: sayısal tanımlayıcılar
 * sayısal olarak, alfasayısal tanımlayıcılar ASCII sözlük sırasına göre
 * karşılaştırılır; sayısal tanımlayıcılar alfasayısal tanımlayıcılardan
 * HER ZAMAN daha düşük önceliklidir (semver.org madde 11.4.1-11.4.3).
 */
function compareIdentifier(a: string, b: string): -1 | 0 | 1 {
  const aIsNumeric = NUMERIC_IDENTIFIER_PATTERN.test(a)
  const bIsNumeric = NUMERIC_IDENTIFIER_PATTERN.test(b)

  if (aIsNumeric && bIsNumeric) {
    const aValue = Number(a)
    const bValue = Number(b)
    if (aValue === bValue) {
      return 0
    }
    return aValue < bValue ? -1 : 1
  }
  if (aIsNumeric) {
    return -1
  }
  if (bIsNumeric) {
    return 1
  }
  if (a === b) {
    return 0
  }
  return a < b ? -1 : 1
}

/**
 * İki semver DİZESİNİ karşılaştırır. {@link parseSemver} + {@link
 * compareSemverParts}'ın SARMALAYICISIDIR — herhangi biri biçimsiz ise
 * `undefined` döner (dizeden tipe geçişin tek sınırı, dosya başı notu).
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 | undefined {
  const partsA = parseSemver(a)
  const partsB = parseSemver(b)
  if (partsA === undefined || partsB === undefined) {
    return undefined
  }
  return compareSemverParts(partsA, partsB)
}

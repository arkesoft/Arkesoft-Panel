// @arkesoft/theme-sdk — paylaşılan semver ÇEKİRDEK BİÇİM deseni + major
// çıkarımı (ROADMAP v0.0.9, T-010 düzeltme turu 1/3 · parti B, B4 bulgusu)
//
// ⚠ YALNIZCA BİÇİM — KARŞILAŞTIRMA YOK (bağlayıcı kısıt, architect'in "Modül
// yerleşimi" kararıyla AYNI gerekçe: `packages/versioning`'in işi, bu paket
// o pakete bağımlılık DOĞURMAZ). Bu modül `"1.2.0" < "1.5.0"` türünden bir
// ÖNCELİK/ARALIK HESABI YAPMAZ — yalnızca (a) bir dizenin semver GİBİ
// GÖRÜNÜP GÖRÜNMEDİĞİNİ ve (b) onun MAJOR bileşenini (bir TAMSAYI çıkarımı)
// söyler.
//
// ⚠ ÖLÇÜLEN SAPMA (B4, security/solid'in bulgusu) — bu modül var olmadan
// ÖNCE `migrations/chain.ts` (S4) VE `manifest/manifest.ts` (S5) birbirinden
// BAĞIMSIZ iki semver çekirdek deseni taşıyordu (S4/S5 paralelliğinin
// bedeli — ikisi de AYRI ayrı "semver KARŞILAŞTIRMASI yapılmaz" gerekçesini
// kendi dosya başı yorumunda tekrarlıyordu, ama deseni KENDİ yazıyordu).
// `chain.ts`'inki resmi semver.org düzenli ifadesinin BİREBİR kopyasıydı
// (prerelease'in sayısal tanımlayıcısında BAŞTAKİ SIFIRI REDDEDER, spesifi-
// kasyona UYUMLU); `manifest.ts`'inki DAHA GEVŞEKTİ (`[0-9A-Za-z-]+` —
// baştaki sıfırı KABUL ederdi). Ölçülen sonuç: `"1.0.0-01"` manifest'in
// `version`/`sdkRange` biçim kontrolünden GEÇİYORDU ama `chain.ts`'in
// `extractMajor()`'ı `undefined` DÖNÜYORDU — AYNI girdi için biri KABUL biri
// RED ediyor, tutarsız/sapmış bir sözleşme üretiyordu (iki ayrı
// `THEME_MANIFEST_INVALID` bulgusuna yol açabiliyordu).
//
// ⚠ KARAR (B4 düzeltmesi) — DAHA KATI olan, resmi semver.org
// spesifikasyonuna TAM UYUMLU desen KAZANDI. Gerekçe: semver.org'un KENDİSİ
// "sayısal tanımlayıcılarda baştaki sıfır YASAKTIR" der (`01` geçerli bir
// semver prerelease tanımlayıcısı DEĞİLDİR) — `chain.ts`'in deseni zaten
// spesifikasyona UYUMLUYDU, `manifest.ts`'in deseni BİLİNÇLİ bir gevşetme
// DEĞİLDİ (S4/S5'in BAĞIMSIZ yazılmasının yan etkisiydi, iki dosyanın kendi
// başı yorumunda da AÇIKLANMIŞTI). Sonuç: `"1.0.0-01"` artık HER İKİ
// tüketicide de REDDEDİLİR — tek kaynak bu dosya (`rg` ile tanım sayısı 1).
//
// `manifest.ts`'in `sdkRange` biçimi (operatör öneki + boşlukla ayrılmış
// birden çok çekirdek) bu kaynak dizeyi (`SEMVER_CORE_PATTERN_SOURCE`) KENDİ
// üst deseninin İÇİNE gömer — bu yüzden hem ÇAPALI bir `RegExp`
// (`SEMVER_FORMAT_PATTERN`, tek bir TAM semver'i doğrudan test etmek için)
// hem de ÇAPASIZ bir KAYNAK DİZESİ (`SEMVER_CORE_PATTERN_SOURCE`, bir ÜST
// desenin PARÇASI olarak kullanılmak için) dışa açılır.

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

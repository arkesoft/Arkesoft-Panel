// @arkesoft/versioning — N-2 desteklenen sürüm penceresi (ROADMAP v0.0.21,
// T-018/S1, ADR-0020 Karar 3; kural kaynağı `ROADMAP.md` "Sürüm Politikası
// §6 — Desteklenen versiyon penceresi (N-2)")
//
// ⚠ DÖRT BİRİMİN DÖRT AYRI KURALI VAR — tek bir `isSupported()` ile
// GEÇİŞTİRİLMEZ (architect kararı). §6'nın metni:
//
//   - Platform: en güncel iki minor geriye kadar desteklenir (N, N-1, N-2).
//     Daha geride kalan tenant'a panelde uyarı çıkar ve 30 gün içinde
//     yükseltme zorunlu hale gelir.
//   - theme-sdk: en güncel iki major desteklenir. Eski major için yalnızca
//     güvenlik patch'i çıkar.
//   - Public API: her major, yerine geçen major yayınlandıktan sonra en az
//     12 ay daha yaşar.
//   - Tema: bir temanın son iki majoru desteklenir.
//
// ⚠ §6'NIN BOŞLUĞU — FAIL-CLOSED KAPATILDI: §6 "candidate'in major'ı
// latest'ten FARKLI" durumunu hiç konuşmuyor. Karar (architect): daha
// KÜÇÜK major ⇒ DESTEKSİZ (fail-closed — eski bir major platformun
// kendisini YANLIŞ desteklenmiş sanmasını önler); daha BÜYÜK major
// (kiracı ileride, ör. bir geri alma/race durumu) ⇒ DESTEKLİ (platform
// bir tenant'ı kendi geleceğinden dolayı ÇÖKERTMEMELİDİR). Bu asimetri
// (a)'nın `isPlatformVersionSupported`'ında UYGULANIR ve `isWithinMajorWindow`
// özel yardımcısı üzerinden (b)/(c)'ye de AYNI felsefeyle YANSIR.
//
// ⚠ DÜRÜSTLÜK NOTU (architect, korunur) — (b) ve (c) BUGÜN aynı aritmetiği
// kullanıyor. İKİ AYRI fonksiyon olarak kalıyorlar çünkü GİRDİLERİ ve YAŞAM
// DÖNGÜLERİ farklı (biri tek küresel SDK "latest", biri TEMA BAŞINA
// `ThemeRelease` latest'ı) ve §6 ikisini AYRI maddelerde tanımlıyor →
// ileride AYRIŞABİLİRLER. Aritmetik TEK BİR özel yardımcıda (`isWithinMajorWindow`)
// yaşar — KOPYALANMAZ. Aritmetiğin bugün aynı olduğu GİZLENMİYOR;
// fonksiyonları BİRLEŞTİRMEK REDDEDİLİYOR.
//
// ⚠ TARİHLER ENJEKTE EDİLİR — bu dosya sistem saatini KENDİSİ OKUMAZ (her
// tarih girdisi bir fonksiyon PARAMETRESİDİR); "güncel zaman"ı okumak
// `apps/api`'nin işidir. (d) takvim AYI aritmetiği UTC'de yapılır, ay-sonu
// taşması (ör. 31 Ocak + 12 ay, 29 Şubat artık yıl + 12 ay) ELLE ve
// SAFLIK İÇİNDE hesaplanır — bir Date YAPICISI çağırmak YERİNE girdi
// tarihinin yapısal bir KOPYASI (üretici global klonlama) üretilip o kopya
// üzerinde `setUTC*` ÇAĞRILARIYLA mutasyona uğranır; bu, bu dosyanın
// saflık pininin ("sistem saatini okuyan ÇAĞRI sıfır") ölçtüğü tam
// sınıfı YAPISAL OLARAK dışarıda tutar. Kapsayıcılık AÇIK:
// `isSupported ⇔ now < sunsetDate` (son tarihte DESTEKSİZ). (e) GÜN
// aritmetiği (30 × 24 saat) milisaniye farkı üzerinden yapılır — UTC'de
// ay uzunluğu/DST sorusu hiç DOĞMAZ.

import type { SemverParts } from './semver.js'

/** (a) Platform — en güncel iki minor GERİYE kadar desteklenir (N, N-1, N-2). */
export const PLATFORM_SUPPORTED_MINOR_WINDOW = 2

/**
 * `candidate`'in `latest`'e göre KAÇ minor GERİDE olduğunu hesaplar.
 * `major` FARKLIYSA bu soru ANLAMSIZDIR → `undefined` döner (bu paketin
 * "sınırda undefined" ilkesinin major-fark durumuna özgü bir uygulaması —
 * biçim hatası DEĞİL, kavramsal uygulanamazlık).
 */
export function countPlatformMinorsBehind(input: {
  readonly candidate: SemverParts
  readonly latest: SemverParts
}): number | undefined {
  if (input.candidate.major !== input.latest.major) {
    return undefined
  }
  return input.latest.minor - input.candidate.minor
}

/**
 * `candidate` platform sürümünün `latest`'e göre N-2 penceresi İÇİNDE
 * olup olmadığını hesaplar (dosya başı "§6'NIN BOŞLUĞU" notundaki
 * fail-closed asimetriyle).
 */
export function isPlatformVersionSupported(input: {
  readonly candidate: SemverParts
  readonly latest: SemverParts
}): boolean {
  if (input.candidate.major < input.latest.major) {
    return false
  }
  if (input.candidate.major > input.latest.major) {
    return true
  }

  const minorsBehind = countPlatformMinorsBehind(input)
  // Yukarıdaki iki dal major farkını ZATEN eledi — bu noktada
  // `minorsBehind` ASLA `undefined` olamaz. Tip sistemi (`noUncheckedIndexedAccess`
  // bu fonksiyonun İÇİNDEN bunu bilemediği için) açık kontrolle daraltılır.
  if (minorsBehind === undefined) {
    return false
  }

  return minorsBehind <= PLATFORM_SUPPORTED_MINOR_WINDOW
}

/**
 * Major-pencere aritmetiğinin TEK özel yardımcısı (dürüstlük notu, dosya
 * başı). `candidateMajor`'ın `latestMajor`'a göre `windowSize` majorluk
 * pencere İÇİNDE olup olmadığını hesaplar; `candidateMajor` İLERİDEYSE
 * (a)'nın asimetrisiyle AYNI felsefeyle `true` döner.
 */
function isWithinMajorWindow(
  candidateMajor: number,
  latestMajor: number,
  windowSize: number,
): boolean {
  if (candidateMajor > latestMajor) {
    return true
  }
  return latestMajor - candidateMajor < windowSize
}

/** (b) theme-sdk — en güncel iki major desteklenir. */
export const THEME_SDK_SUPPORTED_MAJOR_WINDOW = 2

/** `candidate` theme-sdk sürümünün `latest`'e göre major-penceresi içinde olup olmadığını hesaplar. */
export function isThemeSdkVersionSupported(input: {
  readonly candidate: SemverParts
  readonly latest: SemverParts
}): boolean {
  return isWithinMajorWindow(
    input.candidate.major,
    input.latest.major,
    THEME_SDK_SUPPORTED_MAJOR_WINDOW,
  )
}

/** (c) Tema — bir temanın son iki majoru desteklenir (TEMA BAŞINA latest, (b)'nin küresel latest'inden farklı girdi/yaşam döngüsü). */
export const THEME_SUPPORTED_MAJOR_WINDOW = 2

/** `candidate` tema sürümünün o temanın `latestForTheme`'ine göre major-penceresi içinde olup olmadığını hesaplar. */
export function isThemeVersionSupported(input: {
  readonly candidate: SemverParts
  readonly latestForTheme: SemverParts
}): boolean {
  return isWithinMajorWindow(
    input.candidate.major,
    input.latestForTheme.major,
    THEME_SUPPORTED_MAJOR_WINDOW,
  )
}

/** (d) Public API — her major, yerine geçen major yayınlandıktan sonra en az 12 ay daha yaşar. */
export const PUBLIC_API_SUNSET_MONTHS = 12

/** Bir UTC yılının artık yıl olup olmadığı — Date nesnesi KURMADAN saf takvim aritmetiği. */
function isUtcLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

const DAYS_IN_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * Verilen (taşma DÜZELTİLMİŞ) yıl/ay çiftinin gün sayısını hesaplar — ay
 * SONU taşmasını (ör. 31 Ocak + 1 ay → geçersiz "31 Şubat") ÖNLEMEK için
 * {@link resolvePublicApiSunsetDate} tarafından kullanılır. `zeroBasedMonth`
 * 0-11 dışına taşabilir (çağıran taraf `setUTCMonth` ile normalize ETMİŞ
 * olsa da bu fonksiyon BAĞIMSIZ test edilebilir kalsın diye kendi
 * normalize eder).
 */
function daysInUtcMonth(year: number, zeroBasedMonth: number): number {
  const yearOffset = Math.floor(zeroBasedMonth / 12)
  const month = ((zeroBasedMonth % 12) + 12) % 12
  const effectiveYear = year + yearOffset

  if (month === 1 && isUtcLeapYear(effectiveYear)) {
    return 29
  }
  // `month` her zaman 0-11 aralığında olduğu için bu erişim ASLA
  // `undefined` dönmez — `noUncheckedIndexedAccess` bunu bilemediği için
  // açık fallback'le daraltılır (CLAUDE.md §2, çalışma zamanında tetiklenmez).
  return DAYS_IN_MONTH[month] ?? 31
}

/**
 * Bir public API major'ının yerine geçen major yayınlandığı tarihten
 * (`supersededAt`) itibaren en az {@link PUBLIC_API_SUNSET_MONTHS} ay
 * sonra sona erdiği tarihi hesaplar. UTC takvim ayı aritmetiği; ay-sonu
 * taşması (ör. 29 Şubat bir artık yılda + 12 ay, hedef yıl artık yıl
 * DEĞİLSE) hedef ayın GERÇEK son gününe KIRPILARAK önlenir.
 *
 * ⚠ Bu fonksiyon `Date` YAPICISINI çağırmaz (dosya başı notu) — girdinin
 * yapısal bir kopyası üretilip o kopya `setUTC*` çağrılarıyla mutasyona
 * uğratılır, girdinin KENDİSİ DEĞİŞTİRİLMEZ (fonksiyon saftır).
 */
export function resolvePublicApiSunsetDate(input: { readonly supersededAt: Date }): Date {
  const sunsetDate = structuredClone(input.supersededAt)
  const originalDay = sunsetDate.getUTCDate()

  // ÖNCE güne 1 ata (her ayda var olduğu garanti bir gün), SONRA ay ekle —
  // bu sıralama olmazsa ör. 31 Ocak + 12 ay ara adımda geçersiz bir tarihe
  // (31 Şubat gibi) düşüp JS'in kendi normalizasyonuyla Mart'a TAŞABİLİRDİ.
  sunsetDate.setUTCDate(1)
  sunsetDate.setUTCMonth(sunsetDate.getUTCMonth() + PUBLIC_API_SUNSET_MONTHS)

  const lastDayOfTargetMonth = daysInUtcMonth(sunsetDate.getUTCFullYear(), sunsetDate.getUTCMonth())
  sunsetDate.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth))

  return sunsetDate
}

/**
 * Bir public API major'ının `now` anında HÂLÂ desteklenip
 * desteklenmediğini hesaplar. `supersededAt === null` ⇒ major henüz
 * yerine geçilmedi, HER ZAMAN desteklidir. Kapsayıcılık AÇIK:
 * `now < sunsetDate` ⇒ desteklidir — SON TARİHTE (eşitlikte) DESTEKSİZDİR.
 */
export function isPublicApiMajorSupported(input: {
  readonly supersededAt: Date | null
  readonly now: Date
}): boolean {
  if (input.supersededAt === null) {
    return true
  }

  const sunsetDate = resolvePublicApiSunsetDate({ supersededAt: input.supersededAt })
  return input.now.getTime() < sunsetDate.getTime()
}

/** (e) Platform N-2 dışına düşen kiracı için zorunlu yükseltme bekleme süresi — gün cinsinden (30 × 24 saat, UTC, DST sorusu doğmaz). */
export const MANDATORY_UPGRADE_GRACE_DAYS = 30

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Bir kiracının N-2 penceresi dışına düştüğü tarihten (`fellOutOfWindowAt`)
 * {@link MANDATORY_UPGRADE_GRACE_DAYS} gün sonraki zorunlu yükseltme son
 * tarihini hesaplar. Milisaniye-kesin fark (30 × 24 saat) — takvim ayı
 * belirsizliği veya DST sorusu YOKTUR (`resolvePublicApiSunsetDate`'in
 * takvim-ayı aritmetiğinden FARKLI, kasıtlı olarak daha basit).
 *
 * ⚠ `Date` YAPICISI çağırmaz (dosya başı notu) — yapısal kopya + `setTime`.
 */
export function resolveMandatoryUpgradeDeadline(input: { readonly fellOutOfWindowAt: Date }): Date {
  const deadline = structuredClone(input.fellOutOfWindowAt)
  deadline.setTime(deadline.getTime() + MANDATORY_UPGRADE_GRACE_DAYS * MILLISECONDS_PER_DAY)
  return deadline
}

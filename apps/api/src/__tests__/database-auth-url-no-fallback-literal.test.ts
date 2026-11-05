// @arkesoft/api — c3: `apps/api/src/auth/**` içinde `DATABASE_AUTH_URL` ile
// `DATABASE_URL`'in AYNI İFADEDE (`??`/`||`/`?:`) geçmediğini denetleyen
// mekanik kapı (ROADMAP v0.0.14.1, T-015/ST-F, AC3-c3, R-PM4/K-A4).
//
// ⚠⚠ LİTERAL-JETON KURALI (AGENT_BASELINE §5, ZORUNLU — emsal
// `assert-queue-capable-redis.test.ts:13-16`, "CONFIG" + " " + "SET"
// deseni; T-014 FIX 2'de bu tuzak CI'ı FİİLEN KIRDI): bu kapının aradığı
// jeton — iki ortam değişkeni adının bir `??`/`||`/`?:` operatörüyle AYNI
// satırda birleşmiş hâli — KENDİ KAYNAĞINDA BİTİŞİK YAZILMAZ. Aşağıdaki
// `AUTH_URL_TOKEN`/`PLAIN_URL_TOKEN` sabitleri parçalardan `join()` ile
// ÇALIŞMA ANINDA kurulur; (c)'deki "boş değil" kanıtının sentetik kötü
// satırı da AYNI şekilde parçalardan birleştirilir. GEREKÇE: bu dosya
// `apps/api/src/__tests__/` altında yaşar — TARANAN dizin `apps/api/src/
// auth/**`'tir ve bugün bu dosyayı KAPSAMAZ — ama bir sonraki geliştirici
// "neden ayrıştırılmış" diye düşünüp dosyayı auth/__tests__'e TAŞIRSA veya
// forbidden pattern'i kelimesi kelimesine örnek diye BİTİŞİK yazarsa, kapı
// KENDİ YORUMUNU/ÖRNEĞİNİ ihlal olarak eşler ve KALICI YANLIŞ POZİTİF
// üretir — tam T-014 FIX 2'nin "set_config" yorumda bitişik yazılınca
// AC4 kapısının kendi yorumunu ihlal olarak eşlemesiyle AYNI sınıf hata.
// BİRLEŞTİRMEYİN — "düzeltme" amacıyla parçaları tek stringe birleştirmek
// bu testi KENDİ KENDİNİ eşleyen, kalıcı kırmızı bir kapıya çevirir.
//
// ⚠ R-PO8 NOTU: bu dosya `ci.yml:755-781`'in GUC (`app.tenant_id`/
// `set_config`) literal-jeton taramasının KAPSAMINDA DEĞİL — o tarama
// BAŞKA bir jeton çiftini denetliyor. Buradaki disiplin TAMAMEN bu testin
// KENDİ iç tutarlılığı içindir.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** `'DATABASE_AUTH_URL'` — parçalardan kurulur (dosya başı yorumu). */
const AUTH_URL_TOKEN = ['DATABASE', 'AUTH', 'URL'].join('_')
/** `'DATABASE_URL'` — parçalardan kurulur (dosya başı yorumu). */
const PLAIN_URL_TOKEN = ['DATABASE', 'URL'].join('_')
/** `'??'` ve `'||'` — parçalardan kurulur. */
const NULLISH_OPERATOR = '?' + '?'
const OR_OPERATOR = '|' + '|'

/**
 * Bir kaynak satırı YASAKLI geri düşüş kalıbını taşıyor mu: iki token AYNI
 * satırda birlikte geçiyor VE aralarında `??`/`||` operatörü VAR, veya bir
 * `?...:` (ternary) şekli var. İki token birlikte geçmiyorsa HER ZAMAN
 * `false` — tek token'ın (ör. üretim kodundaki `env.DATABASE_AUTH_URL`
 * ataması) tek başına görünmesi MEŞRU ve beklenen, bulgu SAYILMAZ.
 */
function lineHasFallbackPattern(line: string): boolean {
  if (!line.includes(AUTH_URL_TOKEN) || !line.includes(PLAIN_URL_TOKEN)) {
    return false
  }

  if (line.includes(NULLISH_OPERATOR) || line.includes(OR_OPERATOR)) {
    return true
  }

  // Ternary heuristiği: `?` sonrası `:`'den ÖNCE başka bir `?`/`:` yoksa
  // (basit, tek seviyeli bir ternary gövdesi) — iki token zaten satırda
  // BİRLİKTE olduğu için bu yeterince dar bir sinyal.
  return /\?[^?:]*:/.test(line)
}

/**
 * Birleştirilmiş bir satır — METİN + bu metnin BAŞLADIĞI HAM (orijinal
 * dosyadaki, 1 tabanlı) satır numarası.
 *
 * T-015 FIX turu 2 (solid SD-6r düzeltmesi) — `rawLineNumber` EKLENDİ.
 * ÖNCESİNDE (SD-6r) çağıran taraf `mergedLines.forEach((line, index) =>
 * ... lineNumber: index + 1)` ile birleştirilmiş DİZİNİN kendi indeksini
 * satır numarası SAYIYORDU — ama birleştirme iki ham satırı TEK öğeye
 * İNDİRDİĞİNDE birleştirilmiş dizi ham diziden KISA olur, bu noktadan
 * SONRAKİ her indeks ham dosyadaki GERÇEK satırdan KAYAR (ÖLÇÜLMÜŞ,
 * aşağıdaki "(SD-6r boş değil kanıtı)" testi). Doğru çapa birleştirilmiş
 * dizinin KENDİ sırası değil, HAM dosyadaki satırın numarasıdır —
 * `rawLineNumber` bunu birleştirme BOYUNCA TAŞIR.
 */
type MergedLine = {
  readonly text: string
  readonly rawLineNumber: number
}

/**
 * T-015 FIX turu 1, madde 4 (solid SD-6) düzeltmesi — `lineHasFallbackPattern`
 * SATIR bazlıdır, ama prettier uzun bir `??`/`||` ifadesini İKİ satıra
 * bölebilir (operatör ÖNCEKİ satırın SONUNDA veya SONRAKİ satırın
 * BAŞINDA) — bu durumda iki token FARKLI satırlara düşer ve SATIR bazlı
 * kontrol kaçırır (ÖLÇÜLDÜ, aşağıdaki "(SD-6 öncesi davranış)" testi).
 *
 * Bu fonksiyon, bir ÖNCEKİ satır `??`/`||` İLE BİTİYORSA veya bir satır
 * `??`/`||` İLE BAŞLIYORSA onu ÖNCEKİ (birleştirilmiş) satırla TEK satıra
 * indirir — prettier'ın bu iki operatör için GERÇEKTEN ürettiği iki sarma
 * biçimini (operatör-sonda / operatör-başta) kapsar. Bare ternary (`?`/`:`)
 * çok satırlı sarmaları KASITLI OLARAK kapsam DIŞI — ternary'nin tek karakterli
 * operatörlerini satır başı/sonunda ARAMAK, gerçek kaynak ağacında (optional
 * chaining `?.`, tip imzalarındaki `?:`) YANLIŞ POZİTİF riskini ÖLÇÜLMEDEN
 * artırırdı; bulgu metninin BİREBİR atfı ("iki satıra bölünmüş `??`") da
 * yalnızca bu İKİ operatörü kapsıyor.
 *
 * Her birleştirilmiş öğe KENDİ `rawLineNumber`'ını (birleştirmeye katılan İLK
 * ham satırın 1 tabanlı numarası) TAŞIR — SD-6r düzeltmesi, yukarıdaki `MergedLine`
 * yorumu.
 */
function mergeOperatorLineContinuations(lines: readonly string[]): MergedLine[] {
  const merged: MergedLine[] = []

  lines.forEach((line, rawIndex) => {
    const rawLineNumber = rawIndex + 1
    const previousIndex = merged.length - 1
    const previous = previousIndex >= 0 ? merged[previousIndex] : undefined

    if (previous !== undefined) {
      const previousEndsWithOperator =
        previous.text.trimEnd().endsWith(NULLISH_OPERATOR) ||
        previous.text.trimEnd().endsWith(OR_OPERATOR)
      const currentStartsWithOperator =
        line.trimStart().startsWith(NULLISH_OPERATOR) || line.trimStart().startsWith(OR_OPERATOR)

      if (previousEndsWithOperator || currentStartsWithOperator) {
        // `rawLineNumber` BİLEREK `previous.rawLineNumber`'DA KALIR — bulgu
        // birleştirmeye katılan İLK (en erken) ham satırı işaret eder.
        merged[previousIndex] = {
          text: `${previous.text} ${line.trim()}`,
          rawLineNumber: previous.rawLineNumber,
        }
        return
      }
    }

    merged.push({ text: line, rawLineNumber })
  })

  return merged
}

const AUTH_DIR = join(import.meta.dirname, '..', 'auth')
/** Bu dosyanın KENDİ yolu — "kapı kendi kaynağını eşlemiyor" kanıtı için. */
const SELF_PATH = join(import.meta.dirname, 'database-auth-url-no-fallback-literal.test.ts')

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }
    if (entry.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
      files.push(fullPath)
    }
  }

  return files
}

describe('apps/api/src/auth/** — DATABASE_AUTH_URL/DATABASE_URL AYNI ifadede YOK (AC3-c3)', () => {
  it('gerçek kaynak ağacında SIFIR ihlal — mekanik grep kapısı (çok satırlı sarmalar DAHİL, SD-6)', () => {
    const files = listSourceFiles(AUTH_DIR)
    expect(files.length).toBeGreaterThan(0) // taranan dizin BOŞ değil (vacuity karşıtı)

    const violations: {
      readonly file: string
      readonly lineNumber: number
      readonly line: string
    }[] = []

    for (const file of files) {
      const rawLines = readFileSync(file, 'utf-8').split('\n')
      const mergedLines = mergeOperatorLineContinuations(rawLines)
      // SD-6r düzeltmesi — satır numarası `mergedLines`'ın KENDİ indeksinden
      // DEĞİL, her öğenin TAŞIDIĞI `rawLineNumber`'dan (ham dosyadaki GERÇEK
      // satır) okunur (yukarıdaki `mergeOperatorLineContinuations` yorumu).
      for (const merged of mergedLines) {
        if (lineHasFallbackPattern(merged.text)) {
          violations.push({ file, lineNumber: merged.rawLineNumber, line: merged.text })
        }
      }
    }

    expect(violations).toEqual([])
  })

  // T-015 FIX turu 1, madde 4 (solid SD-6) — "boş değil" kanıtı: SD-6 ÖNCESİ
  // SATIR bazlı kontrol, prettier'ın GERÇEKTEN ürettiği iki sarma biçimini
  // (operatör-sonda / operatör-başta) KAÇIRIYORDU. Bu test İKİSİNİ de —
  // (1) ÖNCEKİ (ham, birleştirilmemiş) davranışın KAÇIRDIĞINI, (2) YENİ
  // (`mergeOperatorLineContinuations` + `lineHasFallbackPattern`) davranışın
  // YAKALADIĞINI — AYNI sentetik satır çiftleriyle gösterir.
  it('(SD-6 boş değil kanıtı) ÇOK SATIRLI (prettier sarması) geri düşüş — SATIR bazlı kontrol KAÇIRIR, birleştirilmiş kontrol YAKALAR', () => {
    // Prettier biçimi 1 — operatör ÖNCEKİ satırın SONUNDA.
    const operatorTrailingLines = [
      `const x = env.${AUTH_URL_TOKEN} ${NULLISH_OPERATOR}`,
      `  env.${PLAIN_URL_TOKEN}`,
    ]
    // Prettier biçimi 2 — operatör SONRAKİ satırın BAŞINDA.
    const operatorLeadingLines = [
      `const x = env.${AUTH_URL_TOKEN}`,
      `  ${NULLISH_OPERATOR} env.${PLAIN_URL_TOKEN}`,
    ]

    for (const multiLine of [operatorTrailingLines, operatorLeadingLines]) {
      // ÖNCEKİ (SD-6 öncesi) davranış: HER satır BAĞIMSIZ kontrol edilirse
      // ikisi de `false` döner — kapı KAÇIRIR (ölçülmüş bulgu).
      expect(multiLine.some((line) => lineHasFallbackPattern(line))).toBe(false)

      // YENİ davranış: birleştirilmiş satırda kontrol `true` döner.
      const merged = mergeOperatorLineContinuations(multiLine)
      expect(merged.some((entry) => lineHasFallbackPattern(entry.text))).toBe(true)
    }
  })

  // T-015 FIX turu 2 (solid SD-6r düzeltmesi) — satır NUMARASININ (teşhis
  // çıktısının) doğruluğu, SD-6'nın "YAKALAMA" doğruluğundan AYRI bir iddia.
  // SD-6r ÖNCESİ: `lineNumber: index + 1` BİRLEŞTİRİLMİŞ dizinin indeksini
  // kullanıyordu — bir satır birleştiğinde (iki ham satır → tek öğe) dizi
  // KISALIYOR ve bu noktadan SONRAKİ her bulgunun raporlanan satırı ham
  // dosyadaki GERÇEK satırdan KAYIYORDU. Bu test BEKLENEN (ham dosyadaki
  // gerçek) satır İLE RAPORLANAN satırı AÇIKÇA karşılaştırır.
  it('(SD-6r boş değil kanıtı) raporlanan satır numarası HAM dosyadaki ihlal satırıyla EŞİT, birleştirilmiş dizinin indeksiyle DEĞİL', () => {
    // Sentetik dosya: satır 1 zararsız, satır 2-3 İKİ SATIRA BÖLÜNMÜŞ bir
    // ihlal (operatör-sonda biçimi), satır 4 zararsız, satır 5 TEK SATIRLIK
    // İKİNCİ bir ihlal — ihlal HAM dosyada satır 5'TEDİR.
    const syntheticLines = [
      '// zararsız satır 1',
      `const x = env.${AUTH_URL_TOKEN} ${NULLISH_OPERATOR}`,
      `  env.${PLAIN_URL_TOKEN}`,
      '// zararsız satır 4',
      `const y = env.${AUTH_URL_TOKEN} ${NULLISH_OPERATOR} env.${PLAIN_URL_TOKEN}`,
    ]
    // HAM dosyadaki (1 tabanlı) GERÇEK satır numaraları.
    const EXPECTED_FIRST_VIOLATION_RAW_LINE = 2
    const EXPECTED_SECOND_VIOLATION_RAW_LINE = 5

    const merged = mergeOperatorLineContinuations(syntheticLines)
    const violations = merged.filter((entry) => lineHasFallbackPattern(entry.text))

    expect(violations).toHaveLength(2)
    expect(violations[0]?.rawLineNumber).toBe(EXPECTED_FIRST_VIOLATION_RAW_LINE)
    expect(violations[1]?.rawLineNumber).toBe(EXPECTED_SECOND_VIOLATION_RAW_LINE)

    // SD-6r ÖNCESİ (ölçülmüş, YANLIŞ) davranışın AYNI veriyle ÜRETTİĞİ satır
    // numaraları — birleştirilmiş dizinin KENDİ indeksi (`index + 1`).
    // Birleştirme satır 2-3'ü TEK öğeye indirdiği için dizi KISALIYOR ve
    // ikinci bulgu, GERÇEK satır 5 YERİNE birleştirilmiş dizideki indeksi
    // (4) raporluyordu — KAYMANIN KENDİSİ.
    const preSd6rLineNumbers = merged
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => lineHasFallbackPattern(entry.text))
      .map(({ index }) => index + 1)
    expect(preSd6rLineNumbers).toEqual([2, 4])
    expect(preSd6rLineNumbers[1]).not.toBe(EXPECTED_SECOND_VIOLATION_RAW_LINE)
  })

  // T-015 FIX turu 1, madde 4 (solid SD-6) — kapının KENDİ KAYNAĞINI eşleyip
  // eşlemediğinin DOĞRUDAN kanıtı (literal-jeton kuralı, dosya başı yorumu).
  // Bu dosya `AUTH_DIR` taramasının KAPSAMI DIŞINDA olsa da, aynı
  // (birleştirme-farkında) algoritmayı KENDİ İÇERİĞİNE uygulayıp SIFIR ihlal
  // beklemek, "forbidden pattern kendi kaynağında bitişik yazılmadı" iddiasını
  // BEYAN değil ÖLÇÜM olarak doğrular.
  it('(literal-jeton kuralı kanıtı) kapı KENDİ KAYNAĞINI ihlal olarak eşlemiyor', () => {
    const ownLines = readFileSync(SELF_PATH, 'utf-8').split('\n')
    expect(ownLines.length).toBeGreaterThan(0) // vacuity karşıtı — dosya okunabildi

    const mergedOwnLines = mergeOperatorLineContinuations(ownLines)
    const ownViolations = mergedOwnLines.filter((entry) => lineHasFallbackPattern(entry.text))

    expect(ownViolations).toEqual([])
  })

  it('(boş değil kanıtı) DETEKTÖR, PARÇALARDAN çalışma anında kurulan sentetik kötü satırları YAKALAR', () => {
    const nullishBadLine = [
      'const x = env.',
      AUTH_URL_TOKEN,
      ' ',
      NULLISH_OPERATOR,
      ' env.',
      PLAIN_URL_TOKEN,
    ].join('')
    const orBadLine = [
      'const x = env.',
      AUTH_URL_TOKEN,
      ' ',
      OR_OPERATOR,
      ' env.',
      PLAIN_URL_TOKEN,
    ].join('')
    const ternaryBadLine = [
      'const x = cond ? env.',
      AUTH_URL_TOKEN,
      ' : env.',
      PLAIN_URL_TOKEN,
    ].join('')
    const reversedOrderBadLine = [
      'const x = env.',
      PLAIN_URL_TOKEN,
      ' ',
      NULLISH_OPERATOR,
      ' env.',
      AUTH_URL_TOKEN,
    ].join('')

    expect(lineHasFallbackPattern(nullishBadLine)).toBe(true)
    expect(lineHasFallbackPattern(orBadLine)).toBe(true)
    expect(lineHasFallbackPattern(ternaryBadLine)).toBe(true)
    expect(lineHasFallbackPattern(reversedOrderBadLine)).toBe(true)
  })

  it('(yanlış pozitif karşıtı) TEK token içeren meşru satırlar YAKALANMAZ', () => {
    const onlyAuthToken = `this.client = createPrismaClient({ databaseUrl: env.${AUTH_URL_TOKEN} })`
    const onlyPlainToken = `const x = env.${PLAIN_URL_TOKEN}`
    const bothTokensNoOperator = `// env.${AUTH_URL_TOKEN} değişti, env.${PLAIN_URL_TOKEN} artık kullanılmıyor.`

    expect(lineHasFallbackPattern(onlyAuthToken)).toBe(false)
    expect(lineHasFallbackPattern(onlyPlainToken)).toBe(false)
    // İKİ token AYNI satırda ama operatör YOK → geri düşüş DEĞİL, bulgu YOK.
    expect(lineHasFallbackPattern(bothTokensNoOperator)).toBe(false)
  })
})

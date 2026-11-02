// @arkesoft/theme-sdk — saflık pini (ROADMAP v0.0.9, T-010/S2, architect
// ADR-0013 taslağı "saflık pini = v0.0.10'un üç önbellek yolunu açık tutan
// mekanizma")
//
// Bu paket I/O yapmaz, dosya sistemine erişmez, HTTP çatısına bağımlı
// DEĞİLDİR, kiracı verisine erişmez, semver KARŞILAŞTIRMASI yapmaz
// (`packages/versioning`'in işi) ve `@arkesoft/errors`'a BAĞIMLI DEĞİLDİR
// (bkz. README "Yapmaz" sütunu). Bu test o iddiayı kod satırları üzerinde
// DENETLER — yapısal emsal `packages/tenancy/src/__tests__/purity.test.ts`
// ama SATIR SATIR KOPYALANAMADI, iki noktada FARKLILAŞTI (ikisi de ölçüldü):
//
// (1) `readdirSync(SRC_DIR, { recursive: true })` ile dönen her `Dirent`'in
//     GERÇEK dizini `entry.parentPath`'tedir, `SRC_DIR`'in KENDİSİ DEĞİL —
//     `tenancy`'nin emsali `recursive: true` KULLANMADIĞI için `join(SRC_DIR,
//     entry.name)` orada doğruydu. Burada `recursive: true` KULLANILIYOR
//     (çünkü S8'de `manifest/`, `settings/`, `migrations/` alt dizinleri
//     doğacak, ⚠ BUGÜN HENÜZ DOĞMADI — bkz. alttaki not) — bu yüzden yol
//     `join(entry.parentPath, entry.name)` OLMAK ZORUNDA. `entry.name`'i
//     `SRC_DIR` ile birleştirmek alt dizin dosyaları için YANLIŞ bir yol
//     üretir ve `readFileSync` bunu SESSİZCE atlamaz, `ENOENT` ile PATLAR —
//     ama bugün `src/` düz olduğu için (alt dizin YOK) bu hata bugün tetik
//     bile ÇEKMEZ; yalnızca S8 ağacı tamamladığında ortaya çıkardı. Doğru
//     biçim şimdiden kuruldu.
//
// (2) `tenancy`'nin `dependencies` iddiası (`toEqual({})`, bağımlılığı
//     BOŞ) bu paket için GEÇERSİZ — theme-sdk Zod ile JSONB/`theme.json`
//     okuması YAPAR (CLAUDE.md §4: "dış dünyadan gelen her veri Zod ile
//     parse edilir"), bu yüzden kapalı bağımlılık listesi TAM OLARAK
//     `{ zod: 'catalog:' }`'tir — `@arkesoft/errors` ve
//     `@arkesoft/versioning` dahil DEĞİLDİR (architect kararı, Modül
//     yerleşimi bölümü).
//
// ⚠ ÖZYİNELEME ÖZ-ÖLÇÜMÜ (S8'İN İŞİ, AYNI DOSYAYA EKLENDİ — S2'nin notu
// birebir uygulandı, İKİNCİ bir pin dosyası AÇILMADI): S2 anında `src/`
// DÜZDÜ (yalnızca `errors.ts`/`messages.ts`/`paths.ts`/`assert-never.ts` +
// `index.ts`), alt dizin üretim dosyası YOKTU — "tarama en az bir ALT DİZİN
// dosyası buldu" assertion'ı o anda yazılsaydı ZORUNLU OLARAK kırmızı
// olurdu. Şimdi (`define-theme.ts` + `manifest/`/`settings/`/`migrations/`
// ağacı S3–S8 boyunca tamamlandı) bu ölçülebilir — aşağıdaki "özyineleme
// iddiasının öz-ölçümü" testi `recursive: true`'nun GERÇEKTEN bir şey
// taradığını KANITLAR. Bu testin DEĞERİ şu satırdadır:
// `recursive: true` ileride SESSİZCE düşürülürse (ör. bir refactor,
// `readdirSync(SRC_DIR)` çağrısına geri dönerse) üstteki "yasaklı dizgi 0"
// testi YEŞİL KALIR (çünkü artık alt dizinleri HİÇ TARAMAZ, ihlal
// bulamadığı için değil, ARAMADIĞI için) — pinin kendisi SESSİZCE
// işe yaramaz hâle gelir. Bu test o sessiz başarısızlığı YAKALAR: tarama
// `settings/`, `manifest/` veya `migrations/` içinde EN AZ BİR dosya
// BULAMAZSA kırmızıya düşer. Mutasyon kanıtı (recursive: true geçici
// kaldırıldı → bu assertion kırmızıya döndü → geri alındı) handoff
// paketinde ham çıktı olarak taşınır, bu dosyada TEKRARLANMAZ.
//
// Grep kapsamı yorumları İÇERMEZ (dosya başı yorumlarda bu dizgiler SERBEST)
// — yalnızca gerçek kod satırları (import/require ifadeleri, `fetch(`
// çağrıları, `process.` erişimleri) taranır.

import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC_DIR = join(import.meta.dirname, '..')

/** Yorum satırlarını eler — yalnızca gerçek kod satırlarını bırakır. */
function codeLinesOf(filePath: string): readonly string[] {
  return readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
}

/**
 * `src/` altındaki (test dosyaları HARİÇ, `__tests__/` dizini dahil değil)
 * tüm `.ts` dosyalarının yolları. `recursive: true` — S8'de doğacak alt
 * dizinleri (`manifest/`, `settings/`, `migrations/`) kapsam dışı
 * BIRAKMAMAK için. `entry.parentPath` kullanımı ZORUNLU (dosya başı yorumu
 * madde 1) — `entry.name`'i `SRC_DIR`'e göre birleştirmek alt dizin
 * dosyaları için yanlış yol üretir.
 */
function productionSourceFiles(): readonly string[] {
  return readdirSync(SRC_DIR, { withFileTypes: true, recursive: true })
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith('.ts') && !entry.parentPath.includes('__tests__'),
    )
    .map((entry) => join(entry.parentPath, entry.name))
}

const FORBIDDEN_PATTERNS = [
  /node:fs/,
  /node:path/,
  /node:http/,
  /node:https/,
  /node:url/,
  /node:crypto/,
  /node:process/,
  /(^|[^\w/])['"]fs['"]/,
  /(^|[^\w/])['"]path['"]/,
  /(^|[^\w/])['"]http['"]/,
  /(^|[^\w/])['"]https['"]/,
  /(^|[^\w/])['"]process['"]/,
  /process\./,
  /globalThis\.process/,
  /fetch\(/,
  /@nestjs/,
  /express/,
  /@prisma/,
  // `@arkesoft\/` yerine İTHALAT biçimine özgü iki desen: kapsam "başka bir
  // @arkesoft paketini İTHAL ETME" (kapalı bağımlılık listesi) — `src/index.ts`
  // (S1'in iskelet çıktısı, bu turda DOKUNULMADI) kendi paket ADINI
  // `PACKAGE_NAME = '@arkesoft/theme-sdk'` dize sabiti olarak taşıyor; bu bir
  // BAĞIMLILIK İTHALİ değil, kendi kimliğini bildiren bir sabittir — genel
  // `/@arkesoft\//` deseni bunu YANLIŞ POZİTİF olarak yakalardı.
  /from\s+['"]@arkesoft\//,
  /require\(\s*['"]@arkesoft\//,
  /import\(\s*['"]@arkesoft\//,
]

/**
 * S3–S8'de doğan, üretim kodu barındıran üç alt dizin. Bu liste
 * `productionSourceFiles()`'ın `recursive: true`'sunun GERÇEKTEN çalıştığını
 * ölçmenin tek amacı için var — paketin modül yerleşimini BURADA yeniden
 * TANIMLAMAZ, yalnızca "en az biri bulundu mu" sorusunu sorar.
 */
const SUBDIRECTORIES_WITH_PRODUCTION_FILES: readonly string[] = [
  'settings',
  'manifest',
  'migrations',
]

/** Bir dosya yolunun S3–S8'in alt dizinlerinden BİRİNİN içinde olup olmadığını kontrol eder (platforma göre `sep` ile BÖLER — `/` sabit YAZILMAZ). */
function isWithinProductionSubdirectory(filePath: string): boolean {
  const segments = filePath.split(sep)
  return SUBDIRECTORIES_WITH_PRODUCTION_FILES.some((subdirectory) =>
    segments.includes(subdirectory),
  )
}

describe('packages/theme-sdk saflık', () => {
  it('src/ üretim kaynaklarında yasaklı import/çağrı dizgisi 0 (yorumlar hariç)', () => {
    const files = productionSourceFiles()
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []

    for (const filePath of files) {
      const codeLines = codeLinesOf(filePath)

      for (const pattern of FORBIDDEN_PATTERNS) {
        const match = codeLines.find((line) => pattern.test(line))
        if (match !== undefined) {
          violations.push(`${filePath}: "${pattern.source}" → ${match}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('package.json dependencies TAM OLARAK { zod } — @arkesoft/errors ve @arkesoft/versioning dahil DEĞİL', () => {
    const packageJsonUrl = new URL('../../package.json', import.meta.url)
    const packageJson: unknown = JSON.parse(readFileSync(packageJsonUrl, 'utf-8'))

    if (
      typeof packageJson !== 'object' ||
      packageJson === null ||
      !('dependencies' in packageJson)
    ) {
      throw new Error('package.json beklenen şekilde değil (dependencies alanı yok)')
    }

    expect(packageJson.dependencies).toEqual({ zod: 'catalog:' })
  })

  it('özyineleme iddiasının öz-ölçümü: tarama EN AZ BİR ALT DİZİN dosyası bulmuş olmalı (recursive: true sessizce düşerse bu kırmızıya döner)', () => {
    const files = productionSourceFiles()

    const filesWithinSubdirectories = files.filter(isWithinProductionSubdirectory)

    expect(filesWithinSubdirectories.length).toBeGreaterThan(0)
  })

  it("pin src/json-schema.ts'i de tarıyor (S7nin saf üreticisi saflık taramasının KAPSAMI içinde)", () => {
    const files = productionSourceFiles()
    const scannedJsonSchemaFile = files.find((filePath) =>
      filePath.endsWith(`${sep}json-schema.ts`),
    )

    expect(scannedJsonSchemaFile).toBeDefined()
  })
})

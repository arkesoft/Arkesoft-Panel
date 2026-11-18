// @arkesoft/theme-sdk — saflık pini (ROADMAP v0.0.9, T-010/S2, architect
// ADR-0013 taslağı "saflık pini = v0.0.10'un üç önbellek yolunu açık tutan
// mekanizma")
//
// Bu paket I/O yapmaz, dosya sistemine erişmez, HTTP çatısına bağımlı
// DEĞİLDİR, kiracı verisine erişmez, semver KARŞILAŞTIRMASI yapmaz
// (`packages/versioning`'in işi) ve `@arkesoft/errors`'a BAĞIMLI DEĞİLDİR
// (bkz. README "Yapmaz" sütunu). ⚠ ADR-0020 Karar 2/B (v0.0.21) ile TEK
// istisna açıldı: `@arkesoft/versioning`'den semver çekirdek BİÇİM ilkesi
// (`SEMVER_CORE_PATTERN_SOURCE`/`SEMVER_FORMAT_PATTERN`/`extractMajor`)
// ithal edilir — karşılaştırma fonksiyonları (`parseSemver`/`compareSemver`/
// `satisfies`) HÂLÂ ithal edilmez. Bu test o iddiayı kod satırları üzerinde
// İKİ AYRI SEVİYEDE denetler — yapısal emsal
// `packages/tenancy/src/__tests__/purity.test.ts` ama SATIR SATIR
// KOPYALANAMADI, iki noktada FARKLILAŞTI (ikisi de ölçüldü):
//
// ⚠⚠ qa gate T-018 tur 1, bulgu SD-1 (medium, solid gate'in bulgusu) —
// AŞAĞIDAKİ PARAGRAF ARTIK DOĞRU, ÖNCESİNDE DEĞİLDİ: solid gate'in ölçtüğü
// gibi, `FORBIDDEN_PATTERNS`'teki negatif lookahead (`/from\s+['"]@arkesoft\/
// (?!versioning['"])/` vb.) PAKET seviyesinde çalışır — "şu paketten BAŞKA
// hiçbir `@arkesoft/*` paketi ithal edilmiyor" sorusunu doğrular, ama
// "`@arkesoft/versioning`'den SPESİFİK OLARAK hangi isimler ithal
// ediliyor" sorusunu HİÇ SORMAZ. Somut senaryo (solid'in bulgusu, birebir):
// v0.16.0'da `migrations/chain.ts`'e `import { compareSemver } from
// '@arkesoft/versioning'` eklenirse, negatif lookahead'den GEÇERDİ (paket
// hâlâ `@arkesoft/versioning`), üstteki test YEŞİL KALIRDI ve ADR-0020
// Karar 2'nin bağlayıcı kısıtı ("theme-sdk karşılaştırma yapmaz") SESSİZCE
// düşerdi. Aşağıdaki İKİNCİ test (`SEMVER_SYMBOL_ALLOWLIST` pini) bu
// boşluğu SEMBOL seviyesinde kapatır — iki test birlikte PAKET+SEMBOL
// ikilisini tam kapsar; bu paragraf artık (pin eklendiğinden sonra) doğru
// bir beyandır (ÖNCEKİ hâliyle solid'in "beyan ↔ gerçeklik" bulgusunun tam
// örneğiydi — burada ya pin eklenir ya iddia kaldırılır denmişti; pin
// eklendi).
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
//     `{ zod: 'catalog:', '@arkesoft/versioning': 'workspace:*' }`'tir —
//     `@arkesoft/errors` dahil DEĞİLDİR (architect kararı, Modül yerleşimi
//     bölümü); `@arkesoft/versioning` ise ADR-0020 Karar 2/B ile v0.0.21'de
//     EKLENDİ (semver çekirdek biçim ilkesinin sahibi değişti — bu TESTİ
//     GEVŞETME DEĞİLDİR, CLAUDE.md §10 md 6'nın kapsadığı durum değil:
//     kısıtın amacı [karşılaştırma mantığının theme-sdk'ya sızmaması]
//     kaldırılmadı, SEC-5a emsaliyle aynı sınıf bir "kararın zorunlu ikinci
//     yarısı"dır).
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
  //
  // ⚠ ADR-0020 KARAR 2/B — bu üç desen artık `@arkesoft/versioning`'i
  // (negatif lookahead ile) İSTİSNA TUTAR: semver çekirdek biçim ilkesi
  // (`SEMVER_CORE_PATTERN_SOURCE`/`SEMVER_FORMAT_PATTERN`/`extractMajor`)
  // o pakete taşındı ve bu paket onu oradan ithal eder (`manifest/
  // manifest.ts`, `migrations/chain.ts`). Bu değişiklik testi GEVŞETME
  // değildir (CLAUDE.md §10 md 6) — kısıtın amacı (karşılaştırma
  // mantığının theme-sdk'ya sızmaması) kaldırılmadı, güçlendirildi: bu
  // paket hâlâ `parseSemver`/`compareSemver`/`satisfies` İTHAL EDEMEZ,
  // başka hiçbir `@arkesoft/*` paketi de serbest DEĞİLDİR — tek açılan
  // kenar `@arkesoft/versioning`'dir (bkz. `docs/adr/0020-...md` Karar 2).
  // ⚠⚠ BU DESEN PAKET SEVİYESİNDEDİR (qa gate T-018 tur 1, SD-1 — hangi
  // İSİMLERİN ithal edildiğini DENETLEMEZ). Sembol seviyesindeki pin
  // `SEMVER_SYMBOL_ALLOWLIST` testindedir (aşağıda) — ikisi BİRLİKTE
  // ADR-0020 Karar 2'nin tam kısıtını (paket + sembol) kapatır.
  /from\s+['"]@arkesoft\/(?!versioning['"])/,
  /require\(\s*['"]@arkesoft\/(?!versioning['"])/,
  /import\(\s*['"]@arkesoft\/(?!versioning['"])/,
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

/**
 * ⚠⚠ qa gate T-018 tur 1, SD-1 düzeltmesi — `@arkesoft/versioning`'den
 * ithal edilmesine İZİN VERİLEN TEK üç isim (ADR-0020 Karar 2, `semver.ts`
 * dosya başı "İKİ KATMAN" notu: theme-sdk yalnızca BİÇİM ilkesini ithal
 * eder, KARŞILAŞTIRMA fonksiyonlarını DEĞİL). Bu küme TAM OLARAK solid
 * gate'in önerdiği düzeltmedir: "isimli bağları
 * {SEMVER_CORE_PATTERN_SOURCE, SEMVER_FORMAT_PATTERN, extractMajor}
 * kümesine pinleyen bir assertion ekle".
 */
const ALLOWED_VERSIONING_NAMED_IMPORTS: ReadonlySet<string> = new Set([
  'SEMVER_CORE_PATTERN_SOURCE',
  'SEMVER_FORMAT_PATTERN',
  'extractMajor',
])

/**
 * `@arkesoft/versioning`'den yapılan HER `import { ... } from
 * '@arkesoft/versioning'` ifadesinin isimli bağlarını (named bindings)
 * çıkarır. Çok satırlı import gövdelerini de yakalamak için ham dosya
 * İÇERİĞİ üzerinde (satır-filtrelenmiş DEĞİL) çalışır — yorum satırlarında
 * bu TAM sözdizimi (`import { … } from '@arkesoft/versioning'`) GERÇEKÇİ
 * olarak oluşmaz, dolayısıyla yanlış pozitif riski YOKTUR (dosya başı
 * yorumunun kendisi bu dizgiyi hiçbir yerde bu biçimde TAŞIMAZ — ölçüldü).
 * `type` anahtar sözcüğü ve `as` takma adları (varsa) elenir, ORİJİNAL isim
 * döndürülür.
 */
function namedImportsFromVersioningPackage(filePath: string): readonly string[] {
  const content = readFileSync(filePath, 'utf-8')
  const importClausePattern =
    /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@arkesoft\/versioning['"]/g

  const names: string[] = []
  for (const match of content.matchAll(importClausePattern)) {
    const clause = match[1]
    if (clause === undefined) {
      continue
    }
    for (const rawBinding of clause.split(',')) {
      const trimmed = rawBinding.trim()
      if (trimmed.length === 0) {
        continue
      }
      // `type X` (karma tip importu) ve `X as Y` (takma ad) — her iki
      // durumda da denetlenen şey ORİJİNAL (kaynak paketteki) isimdir.
      const withoutTypeKeyword = trimmed.replace(/^type\s+/, '')
      const originalName = withoutTypeKeyword.split(/\s+as\s+/)[0]
      if (originalName !== undefined && originalName.length > 0) {
        names.push(originalName)
      }
    }
  }
  return names
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

  // ⚠⚠ qa gate T-018 tur 1, SD-1 düzeltmesi (solid gate'in medium bulgusu) —
  // yukarıdaki "yasaklı dizgi 0" testi PAKET seviyesinde çalışır
  // (`@arkesoft/versioning` DIŞINDA bir `@arkesoft/*` ithal edilmiyor mu?).
  // Bu test SEMBOL seviyesinde denetler: `@arkesoft/versioning`'den
  // ithal edilen İSİMLERİN TAMAMI `ALLOWED_VERSIONING_NAMED_IMPORTS`
  // kümesinde mi? Somut senaryo (solid'in bulgusu): `migrations/chain.ts`'e
  // `import { compareSemver } from '@arkesoft/versioning'` eklenirse,
  // üstteki test (paket hâlâ `@arkesoft/versioning` olduğu için) YEŞİL
  // kalırdı — bu test KIRMIZI verir (mutasyon kanıtı: qa gate T-018 tur 1
  // raporu, `shasum` çifti ile).
  it("@arkesoft/versioning'den YALNIZCA {SEMVER_CORE_PATTERN_SOURCE, SEMVER_FORMAT_PATTERN, extractMajor} ithal edilir — SEMBOL seviyesinde pin (qa gate T-018 tur 1, SD-1 düzeltmesi)", () => {
    const files = productionSourceFiles()
    expect(files.length).toBeGreaterThan(0)

    const disallowedImports: string[] = []

    for (const filePath of files) {
      const importedNames = namedImportsFromVersioningPackage(filePath)
      for (const name of importedNames) {
        if (!ALLOWED_VERSIONING_NAMED_IMPORTS.has(name)) {
          disallowedImports.push(`${filePath}: "${name}"`)
        }
      }
    }

    expect(disallowedImports).toEqual([])
  })

  it('package.json dependencies TAM OLARAK { zod, @arkesoft/versioning } — @arkesoft/errors dahil DEĞİL (ADR-0020 Karar 2/B, v0.0.21)', () => {
    const packageJsonUrl = new URL('../../package.json', import.meta.url)
    const packageJson: unknown = JSON.parse(readFileSync(packageJsonUrl, 'utf-8'))

    if (
      typeof packageJson !== 'object' ||
      packageJson === null ||
      !('dependencies' in packageJson)
    ) {
      throw new Error('package.json beklenen şekilde değil (dependencies alanı yok)')
    }

    expect(packageJson.dependencies).toEqual({
      zod: 'catalog:',
      '@arkesoft/versioning': 'workspace:*',
    })
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

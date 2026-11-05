// @arkesoft/api — ÜRETİM YAZMA YOLLARININ MEKANİK KAPILARI
// (ROADMAP v0.0.14, T-014/S5; architect "en kolay atlanacak üç şey" madde 3,
// K-A12 madde 3; po R-PO5; architect R-A8)
//
// Bu dosya üç kapı taşır ve ÜÇÜ DE tip sistemiyle kapatılamayan iddialardır:
//
//   KAPI 1 — DENETİM KAYDI YAZMANIN TEK YOLU. Bir servisin denetim tablosunun
//   yazma delegesini DOĞRUDAN çağırması DERLEMEYİ KIRMAZ (tip sistemi kiracı
//   kapsamını zorlar, ŞEMA kapısını zorlamaz) → `diff` Zod kapısı delinebilir.
//   İkinci savunma bir grep kapısıdır.
//
//   KAPI 2 — ÜRETİMDE KULLANICI SERT SİLME YOLU YOK. INV-OWNER'ı uygulama
//   kodu koruyor; onu DIŞARIDAN delebilecek tek yol bir kullanıcı satırının
//   sert silinmesidir (yabancı anahtar aksiyonu bu sürümde DEĞİŞTİRİLMİYOR —
//   gerekçe migration linter'ının yıkıcı-ifade kuralı). O yolun üretimde
//   OLMADIĞI olgusu bu kapıyla pinlenir. ⚠ Bu kapı "borç kapandı" DEMEZ:
//   veritabanı garantisi hesap silme yüzeyi açıldığında gelecek.
//
//   KAPI 3 — DENETİM YAZMA KAPISI LOGGER İMPORT ETMEZ (AC6'nın YAPISAL yarısı;
//   çalışma zamanı yarısı `audit-log-no-log-leak.test.ts`'te).
//
// ⚠⚠ KAPSAM, İKİ BAĞIMSIZ ÖLÇÜMLE DARALTILDI (po R-PO5 + architect R-A8):
//   · Test dizinleri KAPSAM DIŞI. İzolasyon süitinin probu denetim yazma
//     delegesini MEŞRU olarak çağırır ve DÖRT test dosyası kullanıcı silme
//     çağırır — testleri kapsama almak KALICI YANLIŞ POZİTİF üretir.
//   · Veri katmanı paketinin ÜRETİLEN istemci dizini KAPSAM DIŞI: Prisma'nın
//     ürettiği dosyalar her delegenin her metodunu örnek kodda ANIYOR
//     (ölçüldü — aksi hâlde kapı daha ilk koşumda yanlış pozitif verirdi).
//
// ⚠ LİTERAL-JETON KURALI (AGENT_BASELINE.md §5): denetlenen jetonlar bu
// dosyada BİTİŞİK yazılmaz; çalışma anında iki parçadan birleştirilir.
// Kapsam bugün bu dosyayı dışlıyor, ama kapsamı daraltan bir gelecek
// değişiklik bu dosyayı KENDİ kapısına yem etmesin.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Depo kökü — bu dosya `apps/api/src/__tests__/` altında. */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

/**
 * KAPI 2'nin taradığı ÜRETİM kaynak kökleri — kullanıcı silme yolunun
 * YOKLUĞU platformun TAMAMI hakkında bir iddiadır, tek uygulama hakkında
 * değil.
 */
const PRODUCTION_SOURCE_ROOTS = [
  join('apps', 'api', 'src'),
  join('packages', 'db', 'src'),
  join('packages', 'trpc', 'src'),
] as const

/**
 * KAPI 1'in taradığı kök — YALNIZCA bu uygulamanın kaynağı (po R-PO5'in
 * yazdığı kapsam).
 *
 * ⚠ VERİ KATMANI PAKETİ BİLEREK DIŞARIDA ve gerekçe ÖLÇÜLDÜ, varsayılmadı:
 * o paketin istemci dosyası ile bir tip pini, denetim delegesinin kiracı-SIZ
 * istemci allowlist'ine EKLENMEDİĞİNİ anlatan YORUMLARINDA aranan çağrı
 * ifadesini metin olarak ANIYOR (iki eşleşme). İkisi de birer YORUM, yani
 * kapıyı kalıcı yanlış pozitife düşüren tipik bir literal-jeton tuzağı —
 * ve o paketteki iddianın bekçisi zaten bir grep değil, DERLEME kısıtıdır
 * (delege kiracı-sız istemci tipinde YOKTUR).
 */
const AUDIT_WRITE_SCOPE_ROOTS = [join('apps', 'api', 'src')] as const

/** Taramadan DIŞLANAN dizin adları — gerekçeleri dosya başı yorumunda. */
const EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  '__tests__',
  'node_modules',
  'dist',
  'generated',
  '.turbo',
])

/** Denetim kaydı yazma delegesi çağrısı — jeton ÇALIŞMA ANINDA birleştirilir. */
const AUDIT_WRITE_NEEDLE = ['.auditLog', 'create'].join('.')

/** Kullanıcı satırının sert silinmesi — `delete` ve `deleteMany`'nin İKİSİNİ de yakalar. */
const USER_HARD_DELETE_NEEDLE = ['.user', 'delete'].join('.')

/** Denetim yazma kapısının dosya yolu — KAPI 1'in TEK meşru eşleşme yeri. */
const AUDIT_WRITER_PATH = join('apps', 'api', 'src', 'audit', 'audit-log.writer.ts')

/** KAPI 3'ün kontrol dosyası: logger'ı GERÇEKTEN import eden bir üretim dosyası. */
const LOGGER_IMPORTING_CONTROL_PATH = join(
  'apps',
  'api',
  'src',
  'request-context',
  'request-context.middleware.ts',
)

/** Test dizinlerinin kendisi — kapıların vacuous OLMADIĞINI kanıtlayan kontrol kümesi. */
const CONTROL_TEST_ROOTS = [join('packages', 'db', 'src', '__tests__')] as const

type SourceMatch = {
  readonly file: string
  readonly line: number
  readonly text: string
}

/** Verilen kökün altındaki tüm `.ts` dosyalarını, dışlanan dizinleri ATLAYARAK toplar. */
function collectTypeScriptFiles(rootRelativePath: string, honourExclusions: boolean): string[] {
  const absoluteRoot = join(REPO_ROOT, rootRelativePath)
  const collected: string[] = []

  const walk = (absoluteDirectory: string): void => {
    for (const entryName of readdirSync(absoluteDirectory)) {
      const absoluteEntry = join(absoluteDirectory, entryName)
      const stats = statSync(absoluteEntry)

      if (stats.isDirectory()) {
        if (honourExclusions && EXCLUDED_DIRECTORY_NAMES.has(entryName)) {
          continue
        }
        walk(absoluteEntry)
        continue
      }

      if (entryName.endsWith('.ts')) {
        collected.push(absoluteEntry)
      }
    }
  }

  walk(absoluteRoot)

  return collected
}

/** `needle`'ı içeren satırları, depo köküne göreli yolla birlikte döner. */
function findMatches(files: readonly string[], needle: string): SourceMatch[] {
  const matches: SourceMatch[] = []

  for (const absoluteFile of files) {
    const lines = readFileSync(absoluteFile, 'utf-8').split('\n')

    lines.forEach((text, index) => {
      if (text.includes(needle)) {
        matches.push({
          file: relative(REPO_ROOT, absoluteFile),
          line: index + 1,
          text: text.trim(),
        })
      }
    })
  }

  return matches
}

function collectProductionFiles(): string[] {
  return PRODUCTION_SOURCE_ROOTS.flatMap((root) => collectTypeScriptFiles(root, true))
}

function collectAuditWriteScopeFiles(): string[] {
  return AUDIT_WRITE_SCOPE_ROOTS.flatMap((root) => collectTypeScriptFiles(root, true))
}

function collectControlTestFiles(): string[] {
  return CONTROL_TEST_ROOTS.flatMap((root) => collectTypeScriptFiles(root, false))
}

describe('üretim yazma yolu kapıları — tarama yüzeyinin kendisi', () => {
  it('tarama GERÇEKTEN dosya okuyor (kapılar boş küme üzerinde yeşil yanmıyor)', () => {
    const productionFiles = collectProductionFiles()
    const controlFiles = collectControlTestFiles()

    // Üç üretim kökünde bugün yüzlerce dosya var; eşik düşük tutuldu ki
    // dosya eklemek/silmek bu assert'i kırmasın — ama SIFIR da olamaz.
    expect(productionFiles.length).toBeGreaterThan(50)
    expect(controlFiles.length).toBeGreaterThan(0)

    // Dışlama GERÇEKTEN uygulanıyor: hiçbir üretim dosyası dışlanan bir dizin
    // adını yolunda taşımıyor.
    for (const absoluteFile of productionFiles) {
      const segments = relative(REPO_ROOT, absoluteFile).split(/[/\\]/)
      for (const excluded of EXCLUDED_DIRECTORY_NAMES) {
        expect(segments).not.toContain(excluded)
      }
    }

    // Denetim yazma kapısının dosyası HER İKİ taramanın da İÇİNDE (aksi hâlde
    // KAPI 1 "tek meşru eşleşme" iddiasını ölçemezdi).
    expect(productionFiles.map((file) => relative(REPO_ROOT, file))).toContain(AUDIT_WRITER_PATH)
    expect(collectAuditWriteScopeFiles().map((file) => relative(REPO_ROOT, file))).toContain(
      AUDIT_WRITER_PATH,
    )
  })
})

describe('KAPI 1 — denetim kaydı yazmanın TEK üretim yolu yazma kapısıdır', () => {
  it('bu uygulamanın üretim kodunda denetim yazma delegesi YALNIZCA yazma kapısı dosyasında çağrılır', () => {
    const matches = findMatches(collectAuditWriteScopeFiles(), AUDIT_WRITE_NEEDLE)

    expect(matches.map((match) => match.file)).toEqual([AUDIT_WRITER_PATH])
    // Tek dosya YETMEZ: o dosyada da TEK çağrı olmalı (ikinci bir çağrı
    // kapıdan geçmeyen bir yazma yolu olabilirdi).
    expect(matches).toHaveLength(1)
  })

  it('kapı VACUOUS DEĞİL: aynı tarayıcı, test dizinlerinde MEŞRU çağrıyı buluyor (po R-PO5)', () => {
    const controlMatches = findMatches(collectControlTestFiles(), AUDIT_WRITE_NEEDLE)

    // ⚠ İki şeyi birden kanıtlar: (a) aranan jeton gerçek kodla eşleşiyor
    // (kalıp yanlış değil), (b) test dizinlerini kapsama almak kalıcı yanlış
    // pozitif üretirdi — yani dışlama gerekçesi ÖLÇÜLMÜŞ bir olgu.
    expect(controlMatches.length).toBeGreaterThan(0)
  })
})

describe('KAPI 2 — üretim kodunda kullanıcı SERT SİLME yolu yok (K-A12 madde 3)', () => {
  it('üç üretim kökünde kullanıcı silme çağrısı SIFIR', () => {
    const matches = findMatches(collectProductionFiles(), USER_HARD_DELETE_NEEDLE)

    expect(matches).toEqual([])
  })

  it('kapı VACUOUS DEĞİL: aynı tarayıcı, test dizinlerinde silme çağrılarını buluyor (architect R-A8)', () => {
    const controlMatches = findMatches(collectControlTestFiles(), USER_HARD_DELETE_NEEDLE)

    // ⚠ R-A8'in uyarısı burada ÖLÇÜLÜYOR: test dosyaları kullanıcı siliyor →
    // kapsamı repo geneline açmak kapıyı KALICI yanlış pozitife düşürürdü.
    expect(controlMatches.length).toBeGreaterThan(0)
  })
})

/**
 * Bir TypeScript kaynağının `import` ifadelerini çıkarır ve her ifadeyi TEK
 * SATIRA indirger. SAF fonksiyon (dosya okumaz) — bu yüzden sentetik kaynakla
 * doğrudan ölçülebilir.
 *
 * ⚠ Yorumlar BİLEREK kapsam dışı ve bu ölçülmüş bir gerekliliktir: denetim
 * yazma kapısının dosya başı yorumu "logger" kelimesini zaten ANIYOR
 * (iddiasını yazıyor) — yorumları da tarayan bir kapı kendi gerekçe metnini
 * ihlal sanardı.
 *
 * ⚠⚠ NEDEN SATIR BAZLI SÜZME YETMİYOR — `qa` TUR 1'DE ÖLÇÜLMÜŞ KÖR NOKTA
 * (`solid` tur 1, L-4): bu kapının ilk biçimi yalnızca `import` ile BAŞLAYAN
 * satırları süzüyordu. TypeScript import'ları ÇOK SATIRLI yazılabilir ve o
 * biçimde jeton İKİNCİ/ÜÇÜNCÜ satıra düşer; birinci satır `import` ile başlar
 * ama jetonu TAŞIMAZ → kapı YEŞİL kalır. `qa` bunu varsaymadı, ÖLÇTÜ: denetim
 * yazma kapısına gerçek, çözülebilen ve TÜKETİLEN çok satırlı bir logger
 * import'u eklendiğinde `pnpm typecheck` EXIT 0 verdi ve KAPI 3 **7/7 yeşil**
 * geçti. Düzeltme: ifadeler kapanış tırnağına kadar BİRLEŞTİRİLİR.
 */
export function collectImportStatements(source: string): string[] {
  const statements: string[] = []
  let pending: string | undefined

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim()

    if (pending === undefined) {
      if (!line.startsWith('import')) {
        continue
      }
      pending = line
    } else {
      pending = `${pending} ${line}`
    }

    // Bir import ifadesi modül yolunun kapanış tırnağıyla (isteğe bağlı `;`)
    // biter. Kapanmayan ifade SONRAKİ satırla birleşmeye devam eder.
    if (/['"];?$/.test(pending)) {
      statements.push(pending)
      pending = undefined
    }
  }

  return statements
}

/** Logger/pino jetonu taşıyan import ifadeleri — jeton çalışma anında birleştirilir. */
const LOGGER_IMPORT_PATTERN = new RegExp(['logging', 'logger', 'pino'].join('|'), 'i')

function findLoggerImports(relativeFilePath: string): string[] {
  return collectImportStatements(readFileSync(join(REPO_ROOT, relativeFilePath), 'utf-8')).filter(
    (statement) => LOGGER_IMPORT_PATTERN.test(statement),
  )
}

describe('KAPI 3 — denetim yazma kapısı logger İMPORT ETMEZ (AC6 yapısal yarısı)', () => {
  it('yazma kapısı dosyasında logger import eden ifade YOK', () => {
    expect(findLoggerImports(AUDIT_WRITER_PATH)).toEqual([])
  })

  it('kapı VACUOUS DEĞİL: aynı tarayıcı, logger import EDEN kontrol dosyasında eşleşme buluyor', () => {
    expect(findLoggerImports(LOGGER_IMPORTING_CONTROL_PATH).length).toBeGreaterThan(0)
  })

  it('ÇOK SATIRLI import KÖR NOKTASI KAPANDI — tarayıcı sentetik kaynakta jetonu buluyor', () => {
    // ⚠ `solid` L-4'ün regresyon testi. Saf tarayıcı sayesinde sentetik
    // kaynakla ölçülüyor; geçici dosya yazmaya gerek YOK.
    const multiLineSource = [
      "import type { TenantTransactionClient } from '@arkesoft/db'",
      'import {',
      '  ROOT_LOGGER,',
      "} from '../logging/logging.tokens.js'",
      '',
      'export const value = 1',
    ].join('\n')

    const statements = collectImportStatements(multiLineSource)

    // İki ifade: biri tek satır, biri ÜÇ satırdan birleştirilmiş.
    expect(statements).toHaveLength(2)
    expect(statements[1]).toBe("import { ROOT_LOGGER, } from '../logging/logging.tokens.js'")

    // ⚠ ESKİ BİÇİMİN KAÇIRDIĞI ŞEY: jeton `import` ile BAŞLAYAN satırda DEĞİL.
    const firstLinesOnly = multiLineSource
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import'))
      .filter((line) => LOGGER_IMPORT_PATTERN.test(line))
    expect(firstLinesOnly).toEqual([])

    // Yeni tarayıcı onu BULUYOR — kör noktanın kapandığının doğrudan ölçümü.
    expect(statements.filter((statement) => LOGGER_IMPORT_PATTERN.test(statement))).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// KAPI 4 — DENETİM KAYDI APPEND-ONLY: üretimde UPDATE/DELETE yolu YOK
// (`qa` tur 1; `solid` tur 1 L-5'in ölçülmüş kapanışı)
// ---------------------------------------------------------------------------
//
// ⚠⚠ KAPININ GEREKÇESİ ÖLÇÜLDÜ, VARSAYILMADI. Şema ve izolasyon probu
// "denetim kaydı APPEND-ONLY'dir; tek meşru yazma yolu salt INSERT'tir"
// diyor. Ama bu iddianın ÜRETİM yarısının HİÇBİR bekçisi yoktu:
// kiracı kapsamlı transaction istemcisi denetim tablosunun TAM delegesini
// taşıyor (`client.ts` allowlist'i `'auditLog'`'u `TenantTransactionClient`'a
// EKLEDİ — INSERT'in çalışması için gerekli), dolayısıyla güncelleme/silme
// metotları da DERLENİR.
//
// `qa` bunu bir mutasyonla ölçtü: üye servisine, mevcut denetim satırlarının
// `subject` alanını yeniden yazan bir çağrı eklendi. `pnpm typecheck` EXIT 0,
// `eslint` EXIT 0 ve ÜÇ grep kapısı da **7/7 yeşil** geçti — yani denetim izini
// SESSİZCE tahrif eden bir üretim yolu hiçbir kapıya ÇARPMIYORDU.
//
// ⚠ Bu kapı veritabanı seviyesinde bir garanti DEĞİL (uygulama rolü dört DML
// yetkisinin dördüne de sahiptir ve bunu `catalog-lint` ZORUNLU tutuyor) —
// `security` tur 1'in L2'si o gerilimi ayrıca kaydetti. Buradaki iddia daha
// dar ve tam olarak denetlenebilir olanı: UYGULAMA KATMANI o yolu AÇMIYOR.
describe('KAPI 4 — denetim kaydı üretimde GÜNCELLENMİYOR ve SİLİNMİYOR (append-only)', () => {
  /** Denetim kaydı mutasyon delegeleri — jetonlar ÇALIŞMA ANINDA birleştirilir. */
  const AUDIT_MUTATION_NEEDLES = [
    ['.auditLog', 'update'].join('.'),
    ['.auditLog', 'delete'].join('.'),
    ['.auditLog', 'upsert'].join('.'),
  ] as const

  it('bu uygulamanın üretim kodunda denetim kaydı UPDATE/DELETE/UPSERT çağrısı SIFIR', () => {
    const files = collectAuditWriteScopeFiles()

    for (const needle of AUDIT_MUTATION_NEEDLES) {
      // `updateMany`/`deleteMany` de yakalanır: `.auditLog.update` öneki
      // `.auditLog.updateMany`'nin İÇİNDE yer alıyor.
      expect(findMatches(files, needle), `append-only ihlali: ${needle}`).toEqual([])
    }
  })

  it('kapı VACUOUS DEĞİL: aynı tarayıcı, AYNI kökte INSERT çağrısını buluyor', () => {
    // ⚠ Kalıp biçiminin doğru olduğunun kanıtı: tarayıcı ve kök aynı; tek fark
    // delege adı. INSERT eşleşmesi bulunuyorsa UPDATE/DELETE için dönen boş
    // küme "kalıp hiçbir şeyle eşleşmiyor" yüzünden değildir.
    expect(findMatches(collectAuditWriteScopeFiles(), AUDIT_WRITE_NEEDLE).length).toBe(1)
  })
})

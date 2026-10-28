// @arkesoft/db — prob süiti için geçici migration ağacı + SQL üreteci (T-004 / T2-1, S1)
//
// `migration-set.ts`'in kanıtlayıcısı yalnızca test dosyasıdır (K-C4 nedeniyle
// `vitest`'siz) — bu yüzden gerçek `node:fs` enumerasyonunu koşturan bir
// `mkdtemp` ağacı kurmak gerekir (K-C1): sahte/enjekte edilmiş bir okuyucu
// arayüzü, T2-1'in kusurlu olduğu bileşeni (okuyucunun kendisi) atlar.
//
// R-C6 bağlayıcı: bu dosya SQL YAZAR, SQL AYRIŞTIRMAZ — `CREATE TABLE` deseni
// yalnızca `migration-set.ts`'te vardır, burada ikinci bir kopyası kurulmaz.
//
// R5 (bağlayıcı, PO): veritabanına dokunmaz — yalnızca `node:fs/os/path/url`.
//
// DÜZELTME TURU 1 (T-004, security + solid gate bulguları):
//   - C3: `directoryName` artık yol ayracı / ".." içermiyor diye doğrulanıyor.
//   - C5: kök seviyesine dosya yazan `rootFiles` parametresi eklendi —
//     `migration_lock.toml`'un migration dizinlerinin KARDEŞİ olduğu gerçek
//     Prisma düzenini (V3'ün isDirectory() yarısı) artık bir fixture GERÇEKTEN
//     kuruyor (önceden yalnızca existsSync() yarısı kanıtlanıyordu).
//   - C6: `includeMigrationLock` → `hasMigrationLock` (CLAUDE.md §4 boolean
//     öneki).
//   - C9: `withTemporaryMigrationSet`'in spekülatif `<T>` jeneriği kaldırıldı,
//     `run` artık `void` döner — asenkron gövde desteklenmez, tek satır not.
//   - B1: `generateSetNotNullStatement` eklendi (DESTRUCTIVE_STATEMENT'ın
//     "SET NOT NULL" dalını koşturan tek üreteç).
//   - A (security bulgu 1): `generateSingleLineCreateTableStatement` eklendi —
//     Prisma'nın KANONİK OLMAYAN (tek satır) `CREATE TABLE` biçimini üretir.
//
// DÜZELTME TURU 2 (T-004, qa/security/solid tur 2):
//   - D2 (security tur2, low): `assertSafeEntryName` artık TEK NOKTA (`.`) ve
//     yalnızca nokta içeren adları da reddediyor — `join(root, '.')` kökün
//     KENDİSİNE çözülüyordu, o fixture'ı kullanan bir vaka hiçbir şey
//     ölçmeden yeşil kalıyordu.
//   - D3 (solid tur2, low): `assertSafeDirectoryName` → `assertSafeEntryName`
//     olarak yeniden adlandırıldı — fonksiyon bir DOSYA adı için de
//     çağrılıyordu (`rootFiles`/`rootSymlinks` döngüleri) ama adı/mesajı
//     yalnızca dizinden söz ediyordu.
//   - B (qa + solid tur2, medium/low): `rootSymlinks` parametresi eklendi —
//     `migration.sql` içeren bir dizine işaret eden kök sembolik bağı kurar.
//     Bu, `readMigrationSet`'teki `entry.isDirectory()` filtresinin
//     `existsSync`'ten GERÇEKTEN ayrıştığı tek girdi sınıfıdır (symlink için
//     `Dirent.isDirectory()` `false`, `existsSync` ise bağlantıyı izler).
//
// DÜZELTME TURU 3 (solid gate T-004 tur 3, bulgu low): `rootSymlinks`
// hedefinin `directories` içinde GERÇEKTEN var olduğu ve kendi `migration.sql`
// dosyasını taşıdığı artık zorlanıyor — önceden belgelenmiş ama kod
// tarafından ZORLANMAYAN bu ön koşul, yanlış yazılmış bir hedef adının
// `isDirectory()` pin'ini sessizce kaybetmesine (başka bir sebeple yine
// "yeşil" kalmasına) izin veriyordu. Hedef bulunamazsa `withTemporaryMigrationSet`
// artık fixture KULLANIM HATASI olarak fırlatır.

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Bir migration dizininin içeriği. İkisi de isteğe bağlı: `migrationSql`
 * yoksa yalnızca `migration_lock.toml` (veya hiçbir şey) içeren bir dizin
 * kurulur — V3'ün ("migration.sql taşımayan dizin sessizce dışlanır")
 * davranışsal kanıtının EXISTSSYNC yarısı için.
 *
 * C7 (solid tur1, low) — `?:` burada BİLİNÇLİ tercih: alan gerçekten YOK
 * olabiliyor (örn. yalnızca lock dosyası taşıyan bir dizin). `exactOptionalPropertyTypes`
 * altında `: T | undefined` yazılsaydı her çağrı noktası `migrationSql: undefined`
 * yazmaya zorlanırdı (gereksiz gürültü). Bu, `migration-set.ts`'teki
 * `MigrationSetViolation` tipinin TERS kararının (`: T | undefined`) çelişkisi
 * DEĞİL (satır numarasına değil AD'a atıf — solid gate T-004 tur 2, bulgu D5):
 * orada alan HER zaman VAR ama değeri `undefined` olabilir; burada alanın
 * KENDİSİ opsiyonel.
 */
export type MigrationDirectoryContent = {
  readonly migrationSql?: string
  readonly hasMigrationLock?: boolean
}

/**
 * Verilen DİZİN veya DOSYA adının `mkdtemp` kökünün DIŞINA yazmadığını (ve
 * kökün KENDİSİNE çözülmediğini) doğrular. Kontrol ÜÇ sandbox-kaçış sınıfını
 * kapsar (düzeltme turu 3, solid gate T-004 tur 3 bulgu low/C5-iv: önceki
 * metin "üç" diyordu ama yalnızca iki madde listeliyordu, üçüncüsü — boş ad —
 * belgesizdi):
 *  - yol ayracı (`/`, `\`) veya `..` içeren adlar (C3, security tur1 bulgu3,
 *    low) — kök dışına dizin/dosya yazar, `rmSync(root)` onu temizlemez.
 *  - yalnızca nokta(lar)dan oluşan adlar (D2, security tur2, low) —
 *    `join(root, '.')` KÖKÜN KENDİSİNE çözülür; bu fixture'ı kullanan bir
 *    vaka hiçbir şey ölçmeden yeşil kalır.
 *  - BOŞ ad (`entryName.length === 0`) — `join(root, '')` de KÖKÜN KENDİSİNE
 *    çözülür, yani dots-only ile AYNI sınıf; ayrı bir madde olarak sayılır
 *    çünkü ayrı bir koşuldur.
 *
 * DÜZELTME TURU 2 (D3, solid tur2, low): `assertSafeDirectoryName` adı ve
 * eski mesajı ("geçersiz dizin adı") yalnızca dizinden söz ediyordu; fonksiyon
 * `rootFiles`/`rootSymlinks` döngülerinde bir DOSYA/SEMBOLİK BAĞ adı için de
 * çağrılıyor. Ad ve mesaj gerçek kullanıma uydurulup `assertSafeEntryName`
 * olarak yeniden adlandırıldı (tek tanım + tüm çağrı noktaları).
 */
function assertSafeEntryName(entryName: string): void {
  if (
    entryName.includes('/') ||
    entryName.includes('\\') ||
    entryName.includes('..') ||
    entryName.length === 0 ||
    /^\.+$/.test(entryName)
  ) {
    throw new Error(
      `withTemporaryMigrationSet: geçersiz girdi adı "${entryName}" — yol ayracı, ".." veya yalnızca nokta içeremez (geçici kök dışına ya da kökün kendisine yazmayı önler).`,
    )
  }
}

/**
 * `directories`'teki her girdi için bir alt dizin kuran geçici bir
 * `prisma/migrations/` ağacı oluşturur, `run(migrationsDir)`'i çağırır ve
 * SONUÇ NE OLURSA OLSUN ağacı siler. `rootFiles` verilirse, kökün KENDİSİNE
 * (migration alt dizinlerinin KARDEŞİ olarak) ek dosyalar yazar — gerçek
 * Prisma düzenindeki `prisma/migrations/migration_lock.toml` konumunu taklit
 * eder ve `readMigrationSet`'in `entry.isDirectory()` filtresini (V3'ün
 * önceden kanıtlanmamış yarısı, C5) gerçekten koşturur.
 *
 * K-C10 (bağlayıcı): temizlik `try/finally` ile yapılır, `afterEach` İLE
 * DEĞİL — kurulum ile temizleme sözdizimsel olarak bağlı kalır, bir assertion
 * fırladığında bile dizin sızmaz (PM R4).
 *
 * GÜVENLİK (security gate'in `critical` sınıf yüzeyi): silinecek yol
 * `mkdtempSync`'in DÖNÜŞ DEĞERİNDEN başka hiçbir şeyden türetilmez — `rootUrl`
 * birleştirmesi veya sabit bir kök KULLANILMAZ. `root` değişkeni tutulur ve
 * `rmSync` yalnızca onu hedefler.
 *
 * C9 (solid tur1, low) — önceki imza `<T>` jeneriği taşıyordu ama 9 çağrı
 * noktasının hiçbiri `run`'ın dönüşünü kullanmıyordu; `T`'nin `Promise`'i de
 * kapsaması `await withTemporaryMigrationSet(dirs, async (dir) => {...})`
 * yazıldığında `finally`'nin ağacı promise çözülmeden silmesi tuzağını açık
 * bırakıyordu. Jenerik kaldırıldı: `run` SENKRON olmalı ve `void` döner;
 * asenkron gövde DESTEKLENMEZ (bugün hiçbir çağrı asenkron değil).
 *
 * DÜZELTME TURU 2 — `rootSymlinks` (qa + solid tur2): kökte, `directories`'teki
 * BİR dizine işaret eden sembolik bağlar kurar (hedef, kendi `migration.sql`
 * dosyasını taşıyan gerçek bir alt dizin olmalı). Bu, `readMigrationSet`'teki
 * `entry.isDirectory()` filtresinin `existsSync`'ten GERÇEKTEN ayrıştığı tek
 * girdi sınıfıdır — normal bir dosya için iki kontrol de aynı sonuca varır
 * (redundant), ama symlink için `Dirent.isDirectory()` `false` döner,
 * `existsSync` ise bağlantıyı İZLER ve `true` döner.
 */
export function withTemporaryMigrationSet(
  directories: ReadonlyMap<string, MigrationDirectoryContent>,
  run: (migrationsDir: URL) => void,
  rootFiles?: ReadonlyMap<string, string>,
  rootSymlinks?: ReadonlyMap<string, string>,
): void {
  // Önek TAM OLARAK "arkesoft-migration-set-" olmalı (R-P6) — aksi hâlde S1(e)
  // ve `solid`'in sızıntı denetimi ölçülemez hâle gelir.
  const root = mkdtempSync(join(tmpdir(), 'arkesoft-migration-set-'))

  try {
    for (const [directoryName, content] of directories) {
      assertSafeEntryName(directoryName)
      const directoryPath = join(root, directoryName)
      mkdirSync(directoryPath, { recursive: true })

      if (content.migrationSql !== undefined) {
        writeFileSync(join(directoryPath, 'migration.sql'), content.migrationSql, 'utf8')
      }
      if (content.hasMigrationLock === true) {
        writeFileSync(
          join(directoryPath, 'migration_lock.toml'),
          'provider = "postgresql"\n',
          'utf8',
        )
      }
    }

    if (rootFiles !== undefined) {
      for (const [fileName, content] of rootFiles) {
        assertSafeEntryName(fileName)
        writeFileSync(join(root, fileName), content, 'utf8')
      }
    }

    if (rootSymlinks !== undefined) {
      for (const [symlinkName, targetDirectoryName] of rootSymlinks) {
        assertSafeEntryName(symlinkName)
        assertSafeEntryName(targetDirectoryName)
        // DÜZELTME TURU 3 (solid gate T-004 tur 3, bulgu low): `:124-129`'un
        // belgelenmiş ön koşulu ("hedef, kendi `migration.sql` dosyasını
        // taşıyan GERÇEK bir alt dizin olmalı") ÖNCEDEN zorlanmıyordu —
        // `symlinkSync` sarkan (dangling) bir bağ oluşturmaktan şikâyet
        // etmiyor, hedef adı bir harf yanlış yazılırsa `existsSync` BAŞKA bir
        // sebeple `false` döner, girdi yine elenir ve test yeşil kalırdı ama
        // artık `isDirectory()` filtresini PİNLEMEZDİ (D2'nin kapattığı
        // sınıfın aynısı — bir sonraki turda yeniden açılmıştı). Ön koşul
        // burada zorlanır: hedef `directories`'te GERÇEKTEN var olmalı VE
        // kendi `migration.sql`'ini taşımalı; aksi hâlde bu bir fixture
        // KULLANIM HATASIDIR (test başarısızlığı değil), `assertSafeEntryName`
        // ile aynı üslupta fırlatılır.
        const targetContent = directories.get(targetDirectoryName)
        if (targetContent?.migrationSql === undefined) {
          throw new Error(
            `withTemporaryMigrationSet: rootSymlinks hedefi "${targetDirectoryName}" "directories" içinde "migration.sql" taşıyan bir dizin olarak bulunamadı — sarkan/yanlış yazılmış bir sembolik bağ, vakayı sessizce (başka bir sebeple) geçer kılabilir.`,
          )
        }
        symlinkSync(join(root, targetDirectoryName), join(root, symlinkName), 'dir')
      }
    }

    // `rootUrl` sonunda `/` ile üretilir (K-C10) — `migration-set.ts`'teki
    // savunmacı normalizasyon bunu zaten tekrar garanti eder, ama üretici
    // tarafta da doğru biçim verilir.
    const rootHref = pathToFileURL(root).href
    const rootUrl = new URL(rootHref.endsWith('/') ? rootHref : `${rootHref}/`)

    run(rootUrl)
  } finally {
    // Yalnızca `root` (mkdtempSync dönüşü) silinir — türetilmiş/birleştirilmiş
    // veya sabit bir kök KULLANILMAZ.
    rmSync(root, { recursive: true, force: true })
  }
}

/**
 * Prisma'nın gerçek emit biçimini taklit eden bir `CREATE TABLE` ifadesi
 * üretir (R-C3: fixture biçim sadakati, gerçek repo süitiyle aynı regex'lere
 * uyması için gerçek dosyadaki satır düzenine sadık kalınır).
 */
export function generateCreateTableStatement(
  tableName: string,
  columnDefinitions: readonly string[],
  primaryKeyColumn: string,
): string {
  const columnsBlock = columnDefinitions.map((definition) => `    ${definition}`).join(',\n')
  return [
    '-- CreateTable',
    `CREATE TABLE "${tableName}" (`,
    `${columnsBlock},`,
    '',
    `    CONSTRAINT "${tableName}_pkey" PRIMARY KEY ("${primaryKeyColumn}")`,
    ');',
  ].join('\n')
}

/**
 * Prisma'nın KANONİK OLMAYAN bir `CREATE TABLE` biçimini (tek satır) üretir —
 * security gate T-004 tur 1 bulgu 1 (high) kanıtı: `migration-set.ts`'teki
 * KATI gövde deseni (`\n);` çapası) bu biçimi AYRIŞTIRAMAZ, ama GEVŞEK ad
 * deseni tabloyu YİNE DE görür (`extractCreatedTableNames`). Elle yazılacak
 * v0.0.13 SQL migration'larının taşıyabileceği biçimi temsil eder.
 */
export function generateSingleLineCreateTableStatement(
  tableName: string,
  columnDefinitions: readonly string[],
): string {
  return `CREATE TABLE "${tableName}" (${columnDefinitions.join(', ')});`
}

/** Prisma'nın gerçek emit biçimini taklit eden bir `CREATE UNIQUE INDEX` ifadesi üretir. */
export function generateCreateUniqueIndexStatement(
  indexName: string,
  tableName: string,
  columns: readonly string[],
): string {
  const columnList = columns.map((column) => `"${column}"`).join(', ')
  return `-- CreateIndex\nCREATE UNIQUE INDEX "${indexName}" ON "${tableName}"(${columnList});`
}

/** Prisma'nın gerçek emit biçimini taklit eden bir `DROP COLUMN` ifadesi üretir (AC7c). */
export function generateDropColumnStatement(tableName: string, columnName: string): string {
  return `-- AlterTable\nALTER TABLE "${tableName}" DROP COLUMN "${columnName}";`
}

/**
 * Prisma'nın gerçek emit biçimini taklit eden bir `SET NOT NULL` ifadesi
 * üretir (solid gate T-004 tur 1 bulgu B1/medium — `DESTRUCTIVE_STATEMENT`
 * kuralının "SET NOT NULL" dalını o zamana kadar hiçbir fixture koşturmuyordu).
 */
export function generateSetNotNullStatement(tableName: string, columnName: string): string {
  return `-- AlterTable\nALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET NOT NULL;`
}

/** Birden çok ifadeyi Prisma'nın yaptığı gibi boş satırla ayırıp birleştirir. */
export function joinMigrationStatements(statements: readonly string[]): string {
  return `${statements.join('\n\n')}\n`
}

T-004 — SOLID / Kod Kalitesi Gate, Tur 1
Tarih: 2026-10-28
Sürüm: v0.0.13 önkoşulu (T2-1 kapanışı)

GATE: solid
SONUÇ: PASS

---

## 0. Kapsam ve yöntem

Denetlenen (S1, `db` sahipliği):

| Dosya                                                        | Satır | Durum   |
| ------------------------------------------------------------ | ----- | ------- |
| `packages/db/src/__tests__/helpers/migration-set.ts`         | 316   | YENİ    |
| `packages/db/src/__tests__/helpers/migration-set-fixture.ts` | 122   | YENİ    |
| `packages/db/src/__tests__/migration-sql.test.ts`            | 335   | DEĞİŞİR |

Referans olarak okundu (değişmedi, bulgu yazılmadı): `packages/db/src/tenancy.ts`,
`packages/db/src/index.ts`, `packages/db/prisma/migrations/20261026082729_init/migration.sql`,
`packages/db/prisma/migrations/` dizin listesi, `packages/config/eslint/base.js`,
`packages/config/tsconfig/base.json`.

**Yöntem kısıtı:** `Bash` erişimi yok. `pnpm lint/typecheck/test` **çalıştırılmadı**;
`git show HEAD:packages/db/src/__tests__/migration-sql.test.ts` **okunamadı** — eski hâl
yalnızca `T-004.md`'deki alıntılardan (satır 28-36) değerlendirildi. Ölçemediğim
davranışsal iddialar `[DOĞRULANMALI]` ile işaretlendi ve bulgu olarak yazılmadı.

---

## 1. PM/architect'in dört kez çağırdığı kalemler

### R-C6 — KOPYA MANTIK: **temiz**, kopya bulunamadı

| Denetim                                                        | Sonuç                                                                                                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture'ta ikinci bir `CREATE TABLE` regex'i                   | **yok.** Yardımcıdaki tek desen `migration-set.ts:101`. Fixture'ta hiç `RegExp`/`match`/`matchAll`/`split(';')` yok.                                                                               |
| Fixture'ta ikinci taksonomi karşılaştırması                    | **yok.** `migration-set-fixture.ts` `TenantTaxonomy`'yi import bile etmiyor; `platformLevelTables`/`tenantScopedTables` adları dosyada hiç geçmiyor.                                               |
| Fixture SQL **yazıyor** mu, **ayrıştırıyor** mu                | Yalnızca **yazıyor**: `generateCreateTableStatement` (87), `generateCreateUniqueIndexStatement` (104), `generateDropColumnStatement` (114), `joinMigrationStatements` (119) — hepsi string üretir. |
| Test dosyasında doğrulama mantığının elle tekrarlanmış parçası | **yok.** `collectRealRepoViolations` (`migration-sql.test.ts:56-65`) yalnızca `readMigrationSet` + `collectMigrationSetViolations` çağırıp `rule`'a göre filtreliyor — mantık değil, seçim.        |

`migration-sql.test.ts:245`'teki `endsWith('_init')` kontrolü **fixture hakkında bir
iddia** (AC5'in davranışsal ölçümü), doğrulama kuralının kopyası değil.
`migration-set.ts:281-283`'teki `CREATE UNIQUE INDEX` regex'i R-C6 kapsamında **değil**:
farklı bir ifade türü, tek örneği var.

**Sonuç: AC2/AC4'ün kanıt değeri korunmuş. `medium` bulgu üretilmedi.**

### K-C4 — `vitest`/`expect` yardımcıda yok: **temiz**

`migration-set.ts:18` tek import: `node:fs`. Dosyada `vitest`, `expect`, `describe`, `it`
**hiç** geçmiyor. Fırlatma iki noktada ve ikisi de sade `new Error`:
`migration-set.ts:133` (`{ cause }` ile sarmalı, V-C4) ve `:312`. v0.0.13 promosyonu için
saf `git mv` yolu açık.

### R-C5 / R4 — temizlik sızıntısı: **yapısal olarak temiz**

`migration-set-fixture.ts:49` → `mkdtempSync` **try'dan ÖNCE** (başarısız olursa silinecek
bir şey yok), `:51` `try`, `:75-79` `finally { rmSync(root, …) }`. Dizin kurulum döngüsü
(`:52-66`) **try'ın içinde** → yarı kurulmuş ağaç da temizlenir. Tek `return` ifadesi
(`:74`) `try` gövdesinde; erken `return` veya `finally`'yi atlayan başka çıkış yolu yok.
`afterEach`/`beforeEach` dosyalarda **hiç yok** (tek eşleşme `:34`'teki açıklama yorumu).
Silinen yol yalnızca `mkdtempSync` dönüş değeri (`root`); `rootUrl` birleştirmesinden veya
sabit kökten türetilmiş bir yol `rmSync`'e geçmiyor.

**Sınır:** gerçek artık yokluğu (S1(e)) süreci koşturmayı gerektirir →
**`[DOĞRULANMALI]` (1):** `os.tmpdir()` altında `arkesoft-migration-set-*` artığı kalmadığı
iddiası `qa`'nın önce/sonra listeleme ölçümüne bağlı; statik yapı doğru, ölçüm bende yok.
İç içe `withTemporaryMigrationSet` çağrısı bugün hiçbir vakada yok. Asenkron gövde tuzağı
→ **L3**.

### R-C7 — tip disiplini

| Kalem                                             | Sayım / sonuç                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `any`                                             | **0**                                                                                                                                                                                                  |
| `as` (tip zorlama)                                | **0** (üç dosyada hiç yok; `as const` da yok)                                                                                                                                                          |
| `@ts-ignore` / `@ts-expect-error`                 | **0**                                                                                                                                                                                                  |
| Dışa açılan fonksiyonların dönüş tipi             | **7/7 açık** (`withTrailingSlash`, `stripLineComments`, `extractCreatedTables` dahil module-private olanlar da açık)                                                                                   |
| `noUncheckedIndexedAccess` daraltması             | `match[1]`/`match[2]` → `migration-set.ts:105-109` daraltılmış · `Map.get` → `:196`, `:215`, `:270` daraltılmış, `:266` `?? ''` ile. **Daraltılmamış erişim yok.** Ancak dördü **erişilemez** → **L4** |
| `exactOptionalPropertyTypes` → `: T \| undefined` | `migration-set.ts:52-57` **uyuyor** (gerekçe yorumuyla). `migration-set-fixture.ts:24-27` `?:` kullanıyor → **L6**                                                                                     |
| Yalnızca `Error` örneği fırlatılıyor              | **evet**, 2/2                                                                                                                                                                                          |

---

## 2. Diğer architect kısıtları

- **K-C3 ayrımı korunmuş.** `collectMigrationSetViolations` (`:167`) **veri döndürüyor**
  (`readonly MigrationSetViolation[]`, ilk ihlalde durmuyor); `validateMigrationSet`
  (`:302-315`) **13 satırlık ince sarmalayıcı** — `collect` + boşsa `return` + tek `Error`.
  K-C8'in tek filtre noktası sağlam: R1 muafiyeti `collect`'in çıktısına tek `filter`
  olarak girer, 7 kurala dağılmaz. Gövde boyutu ayrı bir kalem → **L1**.
- **K-C6 uyumlu.** `migration-set.ts:149-157` elle `<`/`>` karşılaştırması;
  `localeCompare` üç dosyada **hiç yok**. `// VARSAYIM(V1):` yorumu `:121-124`'te **var** ve
  `localeCompare`'in neden kullanılmadığını da açıklıyor. "İlk yaratım kazanır"
  `:223` `if (!firstCreationByTable.has(...))` ile uygulanmış, gerekçesi `:210-212`'de.
- **K-C7 uyumlu.** `stripLineComments` (`:80-88`) yalnızca `--`'dan satır sonuna kadar
  atıyor. Blok yorum iddiası **yok** — `:74-75` sınırı açıkça kabul ediyor ve literal yerine
  "slash-star...star-slash" yazarak AGENT_BASELINE §5 literal-jeton tuzağından da kaçınmış.
  **Orijinal dizin adının korunması:** normalizasyon `sql` alanına uygulanıyor,
  `directoryName` `MigrationFile`'da ayrı bir alan olarak taşındığı için hiç dokunulmuyor
  (`:189-192`); tüm mesajlar `migration.directoryName`/`creation.directoryName` kullanıyor →
  AC8 temiz. Mekanizmanın kendisi test edilmiyor → **M2**.
- **K-C5 uyumlu.** İki yeni dosya `src/__tests__/helpers/` altında; `src/` köküne taşınmamış.
  `src/index.ts:18` yalnızca `tenancy.js` re-export'u — `migration-set` dışa açılmamış →
  `dist/` yüzeyi değişmiyor, AC11 muafiyet yolu korunuyor.
- **R-P6 uyumlu.** `migration-set-fixture.ts:49` öneki tam olarak
  `'arkesoft-migration-set-'`.
- **R-P1 uyumlu.** `it.each`/`test.each`/`describe.each` **0 eşleşme**. Modül üst
  seviyesinde yalnızca `new URL(...)` (`:53`) ve düz nesne literali (`:159-162`) var — `fs`
  mutasyonu yok. `withTemporaryMigrationSet`'in **9 çağrısının 9'u** da bir `it()`
  gövdesinde (`:166, 177, 186, 195, 208, 243, 272, 298, 328`); hiçbir `describe()` gövdesinde
  iş yapılmıyor. `buildPrimaryProbDirectories` üst seviyede yalnızca **tanımlanıyor**.
- **R-C3 (biçim sadakati) — gerçek dosyaya karşı doğruladım.**
  `generateCreateTableStatement` çıktısı gerçek
  `20261026082729_init/migration.sql:10-23` düzenine birebir uyuyor (`-- CreateTable`,
  4 boşluk girinti, kolonlardan sonra boş satır, `CONSTRAINT "<t>_pkey" PRIMARY KEY`, `);`).
  `generateCreateUniqueIndexStatement` çıktısı gerçek `:63` satırına uyuyor
  (`ON "t"("a", "b");`). `extractCreatedTables` regex'inin `\n\);` çapası iki kaynakta da
  tutuyor.

---

## 3. Katman, bağımlılık, hata yönetimi

- **Katman:** `packages/db` "şema, migration, RLS, seed" yapar. Kendi migration kümesini
  doğrulayan mekanik kontrol bu sınırın içinde; iş mantığı yok. **İhlal yok.**
- **Bağımlılık yönü:** importlar yalnızca `node:fs`, `node:os`, `node:path`, `node:url`,
  `vitest` (yalnızca test dosyası) ve paket içi `../index.js`. `apps/*` bağımlılığı yok,
  paketler arası yeni kenar yok, **döngüsel bağımlılık yok** (`index.ts` → `tenancy.ts`,
  test → `index.ts`; ters kenar yok). R5 uyumlu: `test-client.ts`/`env.ts`/`client.ts`/
  `guard-policy.ts` import edilmiyor, veritabanına dokunulmuyor.
- **Sağlayıcı dallanması:** N/A (dış sağlayıcı yok).
- **Hata yönetimi:** `catch {}` yok. Tek `catch` (`migration-set.ts:132`) hatayı
  `{ cause }` ile sarmalayıp yukarı iletiyor — yutma yok, `null`'a çevirme yok.
  `continue` kullanımları (`:107, 138, 143, 197, 216, 221, 243, 278`) hata yutma değil,
  **filtre/akış** kararları; her birinin gerekçesi ya yorumda ya kural adında.
  `AppError` hiyerarşisi **beklenmiyor**: bu modül test/lint yardımcısı, `packages/errors`'a
  bağımlı olması K-C4'ün "`node` altında sade koşsun" kısıtıyla çelişir — sade `Error` doğru
  seçim.
- **Ölü kod:** `migration-set.ts`'in 7 export'u da kullanılıyor (`MigrationFile` dışa açılan
  imza elemanı olduğu için zorunlu; `CreatedTable` bilinçli module-private).
  **Fixture'ın dört üreteç fonksiyonunun dördü de kullanılıyor:**
  `generateCreateTableStatement` (10 çağrı), `generateCreateUniqueIndexStatement` (2),
  `generateDropColumnStatement` (1, AC7c), `joinMigrationStatements` (10).
  Yorumlanmış kod, `TODO`, "sonra kullanacağız" dosyası yok. Tek ölü yüzey: **L3** ve **L4**.
- **İsimlendirme (CLAUDE.md §4):** dosyalar kebab-case ✓ · tipler PascalCase ✓ ·
  fonksiyon/değişken camelCase ✓ · sabitler SCREAMING_SNAKE_CASE ✓
  (`PRISMA_INTERNAL_TABLE`, `MIGRATIONS_DIR`, `PRIMARY_PROB_TAXONOMY`) · adlar İngilizce,
  yorumlar Türkçe ✓ · `data`/`temp`/`handle`/`process` gibi belirsiz ad **yok**.
  Tek boolean sapması → **L5**.
- **Yorum kalitesi:** yorumların ezici çoğunluğu *neden*i anlatıyor ve karar kimliğine
  (K-C*/R-C*/AC*) bağlı — bu dosyalarda kodu tekrarlayan yorum yok. İki yerde yorum
  kapsamı olduğundan geniş → **L2**, **M2**.

---

## 4. Yeniden raporlanmayanlar (talimat gereği)

`readonly T[]` ↔ `ReadonlyArray<T>` sözdizimi · `migration-set.ts` ile
`migration-sql.test.ts`'in ayrı dosyalar olması (K-C4 sonucu) · fixture'ın ilk dizininin
`_init` ile bitmesi (K-C9, kanıtın çekirdeği) · R-C1 (meşru contract-fazı `DROP COLUMN`
muafiyeti; `docs`'a devredildi) · R-C4 (string literali içindeki `DROP `, kabul edilen sınır).
Prettier/ESLint'in yakaladığı biçim ve kural kalemleri de yazılmadı.

---

## 5. BULGULAR

```
GATE: solid
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] packages/db/src/__tests__/migration-sql.test.ts:307 (+ packages/db/src/__tests__/helpers/migration-set.ts:200)
    — Test adı `AC7c: "DROP " veya "SET NOT NULL" içeren migration hata üretir` iki dalı
      doğruladığını söylüyor; fixture yalnızca `DROP COLUMN` üretiyor
      (`generateDropColumnStatement`, migration-set-fixture.ts:114-116) ve `SET NOT NULL`
      üreten bir yardımcı/fixture hiç yok. `DESTRUCTIVE_STATEMENT` kuralının
      `normalized.includes('SET NOT NULL')` yarısı hiçbir vakada koşmuyor → yazım hatası
      veya elden kaçırma sessiz kalır. Üstelik R-C1/K-C8'in v0.0.13'te muafiyet kuracağı
      dal tam olarak bu. Test adı ile doğrulanan davranış arasındaki fark başlı başına kalem
      (kriter 10).
    — Düzeltme: `migration-set-fixture.ts`'e `generateSetNotNullStatement(tableName, columnName)`
      ekle ve AC7c'ye ikinci bir `it()` vakası koy (veya test adını yalnızca `DROP ` diyecek
      şekilde daralt — ama o zaman kural yarısı test edilmemiş kalır, tercih edilen yol
      vakayı eklemek).
    — Sorumlu: db
  - [SEV: medium] packages/db/src/__tests__/helpers/migration-set.ts:80-88
    — `stripLineComments` K-C7'nin tek mekanizması ve var oluş gerekçesi açıkça yazılmış
      ("bir yorumda `DROP ` geçtiği an kalıcı yanlış pozitif üretir"), ancak bu davranışı
      doğrulayan **hiçbir test vakası yok**. AC7c fixture'ındaki tek yorum `-- AlterTable`
      ve gerçek repo migration'ında `--` satırlarının içinde yıkıcı jeton yok → fonksiyon
      kaldırılsa veya `indexOf('--')` mantığı bozulsa (örn. `slice(commentIndex)` yazılsa)
      süit **yeşil kalır**. Bilinçli olarak eklenmiş bir davranışın regresyon koruması yok;
      v0.0.13 işaret yorumu (`-- arkesoft:allow-destructive`) normalizasyondan önce
      ayrıştırılacağı için bu mekanizma ileride de değişecek.
    — Düzeltme: prob süitine tek vaka: yorum satırında `DROP COLUMN` geçen ama gerçek
      ifadesi yalnızca `CREATE TABLE` olan bir migration kur → `DESTRUCTIVE_STATEMENT`
      ihlali **üretilmediğini** doğrula (`not.toThrow()` veya `.some(...)` → `false`).
      Fixture'a yorum enjekte edebilmek için üreteçlere ihtiyaç yok, düz string yeter.
    — Sorumlu: db
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:167-295
    — `collectMigrationSetViolations` 129 satır ve yedi kuralın **tamamını** tek gövdede,
      beş ardışık döngüde barındırıyor (boş küme · yıkıcı tarama · kümülatif yüzey kurulumu ·
      ileri yön taksonomi · ters yön taksonomi + öncü indeks). SRP açısından yedi ayrı
      değişme sebebi tek fonksiyonda. K-C3 **yalnızca** "veri döndür + fırlatma ince
      sarmalayıcıda" ayrımını şart koşuyor; kuralları module-private saf fonksiyonlara
      (`collectDestructiveViolations(...)`, `collectForwardTaxonomyViolations(...)` gibi)
      bölmek ne bu ayrımı ne de K-C8'in tek filtre noktasını bozar — `collect` yine tek
      giriş noktası kalır. Architect'in reddettiği şey ayrı `assertX()`'lerdi (ilk ihlalde
      durur), ihlal **döndüren** yardımcılar değil. R-C2 gereği v0.0.13 bu fonksiyona canlı
      şema kuralları ekleyecek → gövde büyümeye devam eder. ESLint'te `max-lines-per-function`
      veya `complexity` kuralı yok, yani araç bunu yakalamıyor.
    — Düzeltme: bugün değiştirmek zorunlu değil; v0.0.13'te kural eklemeden **önce** gövdeyi
      kural başına saf yardımcılara böl. Teknik borç olarak kaydedilsin.
    — Sorumlu: architect (v0.0.13 planı) / db
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set-fixture.ts:59-65
    — `includeMigrationLock` `migration_lock.toml`'u migration **ALT dizinine** yazıyor
      (`join(directoryPath, 'migration_lock.toml')`). Gerçek Prisma düzeninde bu dosya
      migration dizinlerinin **kardeşi**:
      `packages/db/prisma/migrations/migration_lock.toml` (doğruladım, dizin listesi iki
      girdili). Dört yorum bunu "V3'ün davranışsal kanıtı" diye adlandırıyor
      (fixture:20-23, migration-sql.test.ts:102, migration-set.ts:143, T-004 S1(2)).
      Fiilen kanıtlanan şey `existsSync(migration.sql)` filtresi — bu gerçek ve değerli —
      ama V3'ün `isDirectory()` yarısı (kök seviyesinde **dizin olmayan** girdi) hiçbir
      fixture'da kurulmuyor: `withTemporaryMigrationSet` kökte yalnızca dizin oluşturuyor,
      dosya yazma yolu yok. `isDirectory()` filtresi (migration-set.ts:138) bu yüzden
      sadece gerçek repo süitinde dolaylı olarak koşuyor. Yorum, kanıtın kapsamını
      olduğundan geniş gösteriyor — beş yıl sonra okuyan "lock dosyası vakası kapsanmış"
      sanar.
    — Düzeltme: ya yorumları "migration.sql taşımayan dizin dışlanır" ile daralt, ya da
      `withTemporaryMigrationSet`'e kök seviyesine `migration_lock.toml` yazan tek satırlık
      bir yol ekleyip gerçek düzeni taklit et (ikincisi `isDirectory()`'yi de prob kapsamına
      alır, R-C3 biçim sadakatine de uyar).
    — Sorumlu: db
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set-fixture.ts:43-46
    — `withTemporaryMigrationSet<T>`'nin `T` jeneriği ve `run`'ın dönüş değeri **9 çağrı
      noktasının hiçbirinde** kullanılmıyor (hepsi `void` gövde). Bugün ihtiyaç olmayan
      genellik (CLAUDE.md §10.13, K-C8'in "spekülatif API yasak" ilkesi). Yan etkisi gizli
      bir sızıntı tuzağı: `T` `Promise`'i de kapsadığı için
      `await withTemporaryMigrationSet(dirs, async (dir) => { … })` yazıldığında `finally`
      ağacı promise çözülmeden siler → hem sızıntı sınıfı hem ENOENT. Bugün tüm gövdeler
      senkron `node:fs`, dolayısıyla gerçek bir hata **yok**; kayıt niteliğinde.
      `[DOĞRULANMALI] (2)`: `await`'li çağrıda ESLint `no-floating-promises`'in sessiz
      kalacağı iddiasını `pnpm lint` çalıştırmadan ölçemedim (`packages/config/eslint/base.js:80`
      kuralın açık olduğunu gösteriyor, ancak awaited çağrı kuralın kapsamı dışıdır).
    — Düzeltme: imzayı `run: (migrationsDir: URL) => void` yap (jenerik kalkar) **ve**
      asenkron gövdenin desteklenmediğini tek satır yorumla belirt.
    — Sorumlu: db
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:196-199, 215-218, 266
    — `normalizedByMigration` Map'i `:189-192`'de aynı `migrations` dizisinden
      `directoryName` anahtarıyla doldurulduğu için `.get()` **hiçbir zaman** `undefined`
      dönemez; üç `if (normalized === undefined) continue` dalı ve `:266`'daki `?? ''`
      **erişilemez**. Tip sistemi `Map.get`'i `T | undefined` saydığı için lint/tsc bunu
      yakalamıyor, ama dört ölü dal kapsam ölçümünde kalıcı boşluk bırakıyor ve okuyucuya
      var olmayan bir hata durumu düşündürüyor. Ayrıca Map'in ada göre anahtarlanması,
      `collectMigrationSetViolations` dışa açık olduğu için (v0.0.13 promosyonu, K-C4/K-C5)
      aynı `directoryName`'i iki kez taşıyan elle kurulmuş bir girdide sessiz çakışma
      üretir: ikinci kayıt birincinin normalize SQL'ini ezer ve yıkıcı tarama aynı metni
      iki kez, diğerini hiç taramaz.
    — Düzeltme: Map yerine tek geçişte
      `const normalized: readonly { migration: MigrationFile; sql: string }[] =
      migrations.map((m) => ({ migration: m, sql: stripLineComments(m.sql) }))` kur;
      daraltma, `?? ''` ve dört ölü dal birlikte kalkar, çakışma sınıfı da kapanır.
    — Sorumlu: db
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set-fixture.ts:26
    — `includeMigrationLock?: boolean` alanı CLAUDE.md §4 isimlendirme tablosunun boolean
      kuralına (`is`/`has`/`can` öneki) uymuyor; `hasMigrationLock` beklenir. Aynı Task'ta
      `migration-set.ts:233-234` (`isPlatformTable`/`isTenantTable`) kurala uyduğu için
      sapma tutarsız. (Önem derecesi notu: ajan talimatım isimlendirme standardı ihlalini
      `medium` sayıyor, AGENT_BASELINE §4 isimlendirmeyi `low` sayıyor — baseline'ın "emin
      değilsen bir alt seviyeyi seç" kuralı uygulandı; tek alan adı, davranış etkisi yok.)
    — Düzeltme: alanı `hasMigrationLock` olarak yeniden adlandır (tek tanım + 2 kullanım).
    — Sorumlu: db
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set-fixture.ts:24-27
    — `MigrationDirectoryContent` `?:` kullanıyor; R-C7 `exactOptionalPropertyTypes` altında
      `?:` **değil** `: T | undefined` diyor ve `migration-set.ts:52-57` ters yönü seçip
      gerekçesini yoruma yazmış. Buradaki `?:` aslında **doğru** tercih (alan gerçekten yok
      olabilir; `: T | undefined` `'…_lock_only'` gibi girdileri `migrationSql: undefined`
      yazmaya zorlardı) — kusur kararın **gerekçesiz** olması: aynı Task'ta iki çelişkili
      konvansiyon var ve bakımcı R-C7'nin ihlal edildiğini sanır.
    — Düzeltme: tipin üstüne tek satır: "`?:` bilinçli — alan gerçekten YOK olabiliyor;
      `exactOptionalPropertyTypes` altında `: T | undefined` her çağrı noktasını açık
      `undefined` yazmaya zorlardı (bkz. migration-set.ts:46-51, ters durum)."
    — Sorumlu: db
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:281-283
    — `MISSING_TENANT_ID_LEADING_UNIQUE_INDEX` regex'i `ON "<t>"("tenant_id",` — sondaki
      virgül yüzünden indeksin **en az iki kolonlu** olmasını şart koşuyor. Tek kolonlu
      `CREATE UNIQUE INDEX … ON "t"("tenant_id");` kuralın adını ("öncü kolonlu") sağladığı
      hâlde ihlal sayılırdı. Bu büyük olasılıkla **kasıtlı** (CLAUDE.md §7
      `(tenant_id, <sorgulanan kolon>)` **bileşik** indeks istiyor) ama hiçbir yerde
      yazılmamış ve test edilmemiş; ileride tenant başına tek satır tutan bir tabloda
      (`@@unique([tenantId])`) yanlış pozitif üretip "testi gevşetme" baskısı doğurabilir —
      K-C7'nin kaçınmak için kurulduğu hata sınıfının aynısı. Güvence **daraltılmıyor**
      (yön sıkılaştırma), bu yüzden `low`.
    — Düzeltme: regex'in üstüne gerekçeyi yaz ("CLAUDE.md §7 bileşik indeks şartı: tek
      kolonlu benzersizlik bilinçli olarak kabul edilmiyor") veya kuralı tek kolonlu
      indeksi de kabul edecek şekilde gevşet — hangisi seçilirse prob süitinde bir vakayla
      sabitlensin.
    — Sorumlu: db
ÖLÇÜMLER:
  - Denetlenen dosya: 3 (773 satır) · referans olarak okunan: 6 dosya
  - `any`: 0 · `as` (tip zorlama): 0 · `@ts-ignore`/`@ts-expect-error`: 0 · `console.*`: 0
  - `it.each`/`test.each`/`describe.each`: 0 · `afterEach`/`beforeEach`: 0 (yalnızca 1 açıklama yorumu)
  - `catch` bloğu: 1 (sarmalayıp iletiyor, `{ cause }`) · boş `catch`: 0 · `throw`: 2, ikisi de `new Error`
  - En büyük fonksiyon: `collectMigrationSetViolations` — **129 satır** (migration-set.ts:167-295).
    İkinci: `buildPrimaryProbDirectories` 49 satır (veri kurucu) · `withTemporaryMigrationSet` 38 satır
  - Dışa açılan fonksiyonlarda açık dönüş tipi: 11/11
  - **KOPYA MANTIK: BULUNAMADI** (fixture'ta ikinci `CREATE TABLE` regex'i yok, ikinci
    taksonomi karşılaştırması yok, fixture SQL yalnızca yazıyor; test dosyasında elle
    tekrarlanmış kural yok) → AC2/AC4'ün kanıt değeri korunuyor
  - Kullanılmayan export: 0 · fixture'ın 4 üretecinin 4'ü de kullanılıyor
  - Bulgu dağılımı: critical 0 · high 0 · **medium 2** · low 7 (toplam 9)
  - `[DOĞRULANMALI]` etiketli iddia: **2** (artık yokluğu ölçümü; awaited çağrıda
    `no-floating-promises` davranışı)
  - FAIL kuralı (AGENT_BASELINE §4): high/critical yok, medium 2 (< 3) → **PASS**,
    9 bulgu teknik borca kaydedilir
  - Çalıştırılmadı (`Bash` yok): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
    `git show HEAD:…migration-sql.test.ts`
```

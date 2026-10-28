T-004 — SOLID / Kod Kalitesi Gate, Tur 2 (artımlı)
Tarih: 2026-10-28
Sürüm: v0.0.13 önkoşulu (T2-1 kapanışı)

GATE: solid
SONUÇ: PASS

> Bu rapor **tur 1'in üzerine** yazılmıştır. Tur 1'de doğrulanmış ve bu turda
> değişmemiş kalemler (katman sınırları, bağımlılık yönü, döngüsel bağımlılık,
> hata yönetimi deseni, K-C3/K-C4/K-C5/K-C6/R-P6 uyumu) **yeniden gerekçelendirilmedi**;
> yalnızca bu turda değişen yüzeye ve tur 1 bulgularının kapanışına odaklanıldı.
> Tur 1 raporu: `.claude/workflow/reviews/T-004-solid-tur1.md`.

---

## 0. Kapsam, ölçüm ve yöntem kısıtı

| Dosya                                                        | Tur 1 | Tur 2 | Δ    |
| ------------------------------------------------------------ | ----- | ----- | ---- |
| `packages/db/src/__tests__/helpers/migration-set.ts`         | 316   | 434   | +118 |
| `packages/db/src/__tests__/helpers/migration-set-fixture.ts` | 122   | 204   | +82  |
| `packages/db/src/__tests__/migration-sql.test.ts`            | 335   | 579   | +244 |

Referans olarak okundu (değişmedi, bulgu yazılmadı): `packages/db/src/index.ts`
(AC11 yüzeyi — `migration-set` **dışa açılmamış**, K-C5 korunuyor), `packages/db/tsconfig.json`
(`include: ["src/**/*"]` → `__tests__` tip kontrolü kapsamında), `packages/config/eslint/base.js`.

**Yöntem kısıtı (tur 1 ile aynı):** `Bash` yok. `pnpm lint/typecheck/test/build`
**çalıştırılmadı**, `git diff` **okunmadı**. Ölçemediğim davranışsal iddialar
`[DOĞRULANMALI]` ile işaretlendi ve **bulgu olarak yazılmadı**.

**Handoff'taki iki ölçümü düzeltiyorum (statik sayım):**

1. `collectMigrationSetViolations` **310 satır değil, 165 satır** (`migration-set.ts:250-414`).
   Tur 1'de 129 satırdı → **+36**, yani %28 büyüme. Handoff'taki "~310" muhtemelen
   dosyanın kalan kısmını da sayıyor.
2. Yeni vaka sayısı **+11 değil, +9**. `it(` literali: tur 1 = 15 (6 gerçek + 9 prob),
   tur 2 = **24** (6 gerçek + 18 prob). Bağlayıcı olan `qa`'nın gerçek koşum çıktısı.

---

## 1. Tur 1 bulgularının kapanışı

| #   | Tur 1 bulgusu                                      | Durum                                      |
| --- | -------------------------------------------------- | ------------------------------------------ |
| M1  | `SET NOT NULL` dalı hiç koşmuyor (medium)          | **kapandı** — gerçekten pinlendi           |
| M2  | `stripLineComments`'in testi yok (medium)          | **kapandı** — mekanizmayı gerçekten pinler |
| L1  | `collectMigrationSetViolations` gövde boyutu (low) | **açık** — gerekçe kabul edildi            |
| L2  | C5 / V3 yorum kapsamı (low)                        | **kısmen** → yeni **L1** (aşağıda)         |
| L3  | C9 `<T>` jeneriği + async tuzağı (low)             | **kapandı** (araç düzeyinde korumalı)      |
| L4  | C4 erişilemez `Map.get` dalları (low)              | **kapandı** — dallar artık pinli           |
| L5  | C6 `includeMigrationLock` boolean öneki (low)      | **kapandı**                                |
| L6  | C7 `?:` gerekçesi (low)                            | **kapandı** (ama bkz. yeni **L4**)         |
| L7  | C8 ≥2-kolon şartı gerekçesiz (low)                 | **kapandı**                                |

### M1 (`SET NOT NULL`) — kapandı, dal **gerçekten** pinli

`generateSetNotNullStatement` (`migration-set-fixture.ts:197-199`) eklendi, tek çağrısı
`migration-sql.test.ts:362`, vaka `:348-374`. Test adı **daraltılmadı**, vaka eklendi —
tur 1'de tercih ettiğim yol.

Kritik kontrol: vaka dalı **kaza eseri** değil gerçekten pinliyor mu? Yıkıcı tarama
`DROP ∨ SET NOT NULL` disjonksiyonu olduğu için fixture'da bir `DROP` jetonu bulunsa
vaka `SET NOT NULL` dalı bozulsa bile yeşil kalırdı. Fixture'ın iki migration'ı:
`CREATE TABLE "tenant" (… CONSTRAINT "tenant_pkey" PRIMARY KEY ("id"));` ve
`ALTER TABLE "tenant" ALTER COLUMN "legacy_required_field" SET NOT NULL;` — **hiçbirinde
`DROP` yok**. Tek tetikleyici `DESTRUCTIVE_SET_NOT_NULL_PATTERN` (`migration-set.ts:119`,
kullanım `:286`). Dal pinli. `\s+` toleransı ayrıca `:395`'teki çift boşluk vakasıyla
pinlenmiş.

### M2 (`stripLineComments`) — kapandı, **o mekanizmayı** pinliyor

`migration-sql.test.ts:418-441`. İki mutasyona karşı statik olarak kontrol ettim:

- **No-op** (`db`'nin koşturduğu ters kontrol): yorum satırındaki `DROP COLUMN` metinde
  kalır → `DESTRUCTIVE_STATEMENT` fırlar → `not.toThrow()` **kırmızı**. ✔
- **`slice(commentIndex)`** (tur 1'de örnek verdiğim ters mutasyon: kodu atıp yorumu
  tutmak): yorum satırı **tamamen** korunur → `DROP` hâlâ metinde → **kırmızı**. ✔

Vaka "başka bir sebeple" geçmiyor: taksonomi `{platformLevelTables:['tenant'],
tenantScopedTables:[]}` ve tablo **kanonik** biçimde yaratıldığı için `UNCLASSIFIED_TABLE`,
`UNPARSABLE_CREATE_TABLE`, `MISSING_*` kurallarının hiçbiri aday değil — fixture'ın tek
olası ihlali `DESTRUCTIVE_STATEMENT`. `db`'nin bildirdiği ters kontrol statik okumayla
tutarlı.

### L4/C4 (`Map` → tek geçiş dizisi) — kapandı, çakışma sınıfı da kapandı

`normalizedMigrations` (`migration-set.ts:276-279`). Tur 1'in dört erişilemez dalı yok.
Kalan iki `undefined` daraltması artık **erişilebilir ve pinli**:
`:351-352` (`firstBodyByTable.get` → `UNPARSABLE_CREATE_TABLE`, pin: `A-2`, test `:508`) ve
`:384-385` (`firstNameOccurrenceByTable.get` → `MISSING_TENANT_SCOPED_TABLE`, pin: `AC7a`,
test `:264`). Tur 1'deki "ölü dal" sınıfı **tamamen** kapanmış.

**Çakışma yer değiştirdi mi?** Hayır, kapandı. Aynı `directoryName` iki kez geçerse her
iki kayıt da dizide kalır → yıkıcı tarama **ikisini de** görür (eski `Map` birincinin
SQL'ini eziyordu). Kalan iki `Map` (`:300`, `:315`) **tablo adıyla** anahtarlı ve "ilk
yaratım kazanır" K-C6'nın **kasıtlı** semantiği, sessiz çakışma değil.

### L3/C9 (jenerik + async tuzağı) — kapandı; tip düzeyinde **değil**, araç düzeyinde

İmza `run: (migrationsDir: URL) => void` (`migration-set-fixture.ts:96`). Handoff'un
tespiti **doğru ve tip düzeyinde okunabilir bir gerçek**: TypeScript `void` dönüş
beklenen bir konuma `Promise<void>` dönen bir fonksiyonu **kabul eder** (void-dönüş
bivaryansı), yani `async (dir) => {…}` tip hatası vermez.

Gerçek koruma yorum **değil**, lint: `packages/config/eslint/base.js:81`
`@typescript-eslint/no-misused-promises: 'error'` ve bu kuralın `checksVoidReturn`
seçeneği **varsayılan olarak açık**; `base.js:168` `projectService: true` ile tip bilgisi
mevcut, `packages/db/tsconfig.json` `src/**/*` ile `__tests__` kapsamda. Yani async gövde
geçilirse `pnpm lint` kırmızıya döner.
**→ `[DOĞRULANMALI] (1)`:** kuralın bu dosyada bu çağrı biçimi için fiilen tetiklendiğini
`pnpm lint` çalıştırmadan ölçemedim; yapılandırma okuması bunu destekliyor.
**Bulgu yazmadım** — araçların yakaladığı kalem (talimat: "araçların yakaladığı şeyi
tekrar bulgu yazma"). Tek iyileştirme önerisi: `:91-92`'deki yorum "desteklenmez" derken
**hangi mekanizmanın** engellediğini de yazsın (`no-misused-promises`), çünkü okuyucu
bugün tip sisteminin engellediğini sanabilir. Bu öneri bulgu seviyesine çıkmıyor.

### L1 (gövde boyutu) — **açık**, `db`'nin gerekçesini KABUL EDİYORUM, severity `low` kalıyor

Gerekçe (`migration-set.ts:244-248`): "düzeltme turunda bölmek R-C6 (tek ad deseni + tek
gövde deseni) riskini artırır". Değerlendirmem:

- **Kabul edilebilir.** Bu turun mandası _düzeltme_, _yeniden yapılandırma_ değil. Turun
  ana işi tam olarak desen sayısını ikiye çıkarmaktı (security bulgu 1); aynı turda beş
  döngüyü saf yardımcılara bölmek, kopya desen riskini gate'in **asıl** denetim kaleminde
  (R-C6) artırırdı. Borç **kodda yorum olarak** kayıtlı ve ROADMAP borç defterinde satırı
  var.
- **Gerçek büyüme +36 satır (129 → 165), handoff'un "+181"i değil.** Severity'yi
  yükseltmeyi haklı kılacak bir sıçrama yok.
- **Koşul:** v0.0.13 canlı şema kurallarını (R-C2) **bölmeden önce** eklerse bu kalem
  `medium`'a çıkar. Bugün `low`.
- **Çift kayıt olmaması için bu turda yeniden bulgu yazılmadı** — ROADMAP borç satırı
  (S2(c)) zaten mevcut; aynı kalemi ikinci bir gate turunda tekrar yazmak defteri bozar.

### C5 — **kısmen** kapandı → yeni **L1** bulgusu (aşağıda)

`rootFiles` parametresi gerçek bir ihtiyaca hizmet ediyor (spekülatif değil, tek çağrısı
`migration-sql.test.ts:568-577`) ve `isDirectory()` dalı artık **koşuyor**. Ancak dal
**pinli değil** ve iki yorum hâlâ "kanıt" diyor — ayrıntı yeni L1'de.

### C6 / C7 / C8 — kapandı

- `hasMigrationLock` (`migration-set-fixture.ts:48`), kullanımlar `migration-sql.test.ts:135,162`.
  CLAUDE.md §4 boolean öneki ✔
- `?:` gerekçe yorumu (`migration-set-fixture.ts:39-44`) var ve `migration-set.ts`'teki ters
  kararla karşıtlığı doğru açıklıyor. (Çapraz referansın **satır numarası** bayatladı → yeni L4.)
- ≥2-kolon şartı gerekçesi (`migration-set.ts:395-399`) + `AC7d` pin vakası
  (`migration-sql.test.ts:446-476`). **Gevşetilmedi**, güvence daralmadı ✔
  Talimat gereği yeniden `low` yazılmadı.

---

## 2. Yeni gerileme taraması

### R-C6 — **TEYİT EDİLDİ: kopya mantık yok**

| Denetim                                                     | Sonuç                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CREATE TABLE` regex **literali** sayısı                    | **tam iki**, ikisi de `migration-set.ts`: `:135` (gövde, katı) · `:164` (ad, gevşek). Kalan dokuz `CREATE TABLE` geçişi yorum veya hata mesajı.                                                                                                                       |
| Fixture/test'te `RegExp` / `matchAll` / `.match(`           | **0** — fixture yalnızca şablon dizgisi yazıyor (`:155`, `:174`), ayrıştırmıyor. Testteki tek regex `toThrow(/…/)` beklentileri.                                                                                                                                      |
| `new RegExp` (`:398`)                                       | `CREATE UNIQUE INDEX` — farklı ifade türü, tek örnek (tur 1'de de R-C6 kapsamı dışıydı).                                                                                                                                                                              |
| Ad deseni ⊆ gövde deseni ilişkisi                           | Gövde deseninin eşleştiği her metin ad deseniyle de eşleşir (`" ("` ⊂ `\s+"`) → `firstBodyByTable` anahtarları ⊆ `firstNameOccurrenceByTable`.                                                                                                                        |
| `firstBodyByTable.get(...) === undefined` **üçüncü yol mu** | **Hayır.** Bu bir **birleştirme (join)**, ikinci bir eşleştirme mantığı değil: tablo adı üzerinden iki kümenin farkını alıyor ve farkı tek kurala (`UNPARSABLE_CREATE_TABLE`) çeviriyor. Yeni desen, yeni taksonomi karşılaştırması veya elle tekrarlanmış kural yok. |

**AC2/AC4'ün kanıt değeri korunuyor.** İki desenin **sonuçları** birleştirilirken doğan
tek yeni semantik: bir tablo _ad_ olarak A'da, _ayrıştırılabilir gövde_ olarak B'de
görünürse gövde gerektiren kurallar B'nin gövdesini kullanır ve A'daki kanonik olmayan
ifade sessizce geçer. Bu yalnızca **aynı tablonun iki kez yaratılması** hâlinde olur;
K-C6 bu durumu açıkça ayrı kural **yapmadı** (v0.0.13 canlı katalog linter'ına devretti)
→ **bulgu yazmıyorum**, kabul edilmiş tasarım sınırı.

### R-C7 — tip disiplini: temiz

`any` **0** · `as` / `as const` **0** · `@ts-ignore` / `@ts-expect-error` **0** ·
`console.*` **0** (üç dosyada tam metin arama). Yeni `UNPARSABLE_CREATE_TABLE` kuralı:

- `exactOptionalPropertyTypes` ✔ — ihlal nesnesi (`:353-358`) dört alanın **tamamını**
  açıkça veriyor, `?:` yok.
- `noUncheckedIndexedAccess` ✔ — yeni kodun tek indeksli erişimi `match[1]`/`match[2]`
  (`:139-141`) ve ikisi de `=== undefined` ile daraltılmış. `Map.get` erişimleri
  (`:351`, `:384`) daraltılmış **ve** her ikisinin dalı pinli.
- Union doc yorumu (`:48`) "SEKİZ durum" diyor — sayı **doğru** (8 kural).
- Kural adı `UNPARSABLE_CREATE_TABLE` → SCREAMING_SNAKE_CASE ✔ (CLAUDE.md §4).

Ek kontrol (yeni yüzey): `g` bayraklı iki desen (`:135`, `:164`) fonksiyon **içinde**
oluşturuluyor → `lastIndex` durum sızıntısı sınıfı yok; modül seviyesindeki iki desen
(`:118-119`) `g` **taşımıyor** ve `.test()` ile kullanılıyor → aynı sınıf orada da yok.
`sql.toUpperCase()` (`:283`) — `toLocaleUpperCase` **değil**, yani Türkçe `i/İ` tuzağı yok.

### R-P1 — `it.each` hâlâ yok, fixture hâlâ yalnızca `it()` gövdesinde

`it.each` / `test.each` / `describe.each` → **0**. `afterEach`/`beforeEach` → **0**
(tek eşleşme `migration-set-fixture.ts:78`'deki açıklama yorumu).
`withTemporaryMigrationSet`'in **17 çağrısının 17'si** bir `it()` gövdesinde
(`:174, 185, 194, 203, 216, 251, 280, 306, 336, 369, 388, 407, 435, 469, 500, 522, 543, 568`
— satır sıralamasına göre her çağrı en yakın `it(`'in içinde). Modül üst seviyesinde
yalnızca `new URL(...)` (`:55`), düz nesne literali (`:167-170`) ve **tanım** var;
hiçbir `describe()` gövdesinde iş yapılmıyor. `vitest list` toplama fazı güvende.

### Ölü kod / isimlendirme — temiz

`migration-set.ts`'in 7 export'u kullanılıyor. Fixture'ın **altı** export'unun altısı da:
`generateSingleLineCreateTableStatement` → `:491`, `:513`; `generateSetNotNullStatement` →
`:362`; diğer dördü tur 1'deki gibi. Yorumlanmış kod / `TODO` / "sonra kullanacağız"
dosyası yok. Yeni değişken adları (`normalizedMigrations`, `firstNameOccurrenceByTable`,
`firstBodyByTable`, `bodyRecord`, `upperSql`, `cumulativeNormalizedSql`) açık ve
İngilizce; `data`/`temp`/`handle`/`process` yok.

### Değişmeyen kalemler (yeniden gerekçelendirilmedi)

Katman sınırı (`packages/db` kendi migration'ını doğrular, iş mantığı yok) · bağımlılık
yönü (`node:*` + paket içi `../index.js`, `apps/*` yok, döngü yok) · sağlayıcı dallanması
(N/A) · hata yönetimi (tek `catch` `:196` → `{ cause }` ile sarmalayıp iletiyor; boş
`catch` yok; üç `throw`'un üçü de sade `new Error`) · K-C4 (`vitest`/`expect` yardımcıda
**yok**) · K-C5 / AC11 (`src/index.ts` yüzeyi değişmemiş) · R-P6 (`mkdtemp` öneki) ·
K-C10 (`mkdtempSync` try'dan önce, tek `return` yok, `finally` yalnızca `root`'u siler).

**`[DOĞRULANMALI]` (2):** süit sonrası `os.tmpdir()` altında `arkesoft-migration-set-*`
artığı kalmadığı iddiası — yapısal olarak doğru, ölçüm `qa`'nın önce/sonra listelemesinde
(tur 1 ile aynı sınır).

---

## 3. Yeniden raporlanmayanlar (talimat gereği)

`readonly T[]` sözdizimi · `migration-set.ts` ↔ test dosyası ayrımı (K-C4) · fixture'ın
ilk dizininin `_init` ile bitmesi (K-C9) · C8'in ≥2-kolon şartı (kasıtlı, gerekçesi yazıldı
ve `AC7d` ile pinlendi) · `stripLineComments`'in string-literal sınırı (R-C4, `architect`,
vade v0.0.13) · `collectMigrationSetViolations` gövde boyutu (tur 1 L1 — açık borç, ROADMAP
satırı var, çift kayıt yapılmadı) · Prettier/ESLint'in yakaladığı biçim ve kural kalemleri
(`no-misused-promises` dahil).

**Yüzeysel benzerlik, kasıtlı olarak bulgu yazılmadı:** `migration-set.ts:362`
(`includes('"tenant_id"')`) ile `:371` (`includes('"tenant_id" TEXT NOT NULL')`) benzer
görünüyor ama **farklı sebeplerle değişecek** iki kural (varlık kontrolü ↔ zorunluluk
kontrolü); birleştirmek daha kötü bir tasarım olurdu. Aynı şekilde `rootFiles` opsiyonel
parametresi (`migration-set-fixture.ts:97`) **spekülatif genellik değil** — tek, gerçek
bir çağrı noktası var.

---

## 4. BULGULAR

```
GATE: solid
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] packages/db/src/__tests__/helpers/migration-set.ts:164 (+ :135, :283)
    — Yıkıcı tarama bu turda harf ve boşluk duyarsız hâle getirildi (`:283 toUpperCase()`,
      `:118-119` `\b`/`\s+`), ama TABLO ÇIKARIMI harf duyarlı ve `CREATE TABLE` jetonuna
      bitişik kaldı: `/CREATE TABLE\s+"([^"]+)"/g`. İki somut girdi HER İKİ desene de
      görünmez:
        (i) `create table "invoice" (...)` — herhangi bir harf varyantı;
        (ii) `CREATE TABLE IF NOT EXISTS "invoice" (...)` — gevşek desen `CREATE TABLE`
             sonrası doğrudan `"` bekliyor.
      Sonuç: taksonomide OLMAYAN bir tablo bu biçimlerden biriyle yaratılırsa ne
      `UNCLASSIFIED_TABLE` ne `UNPARSABLE_CREATE_TABLE` üretilir → süit SESSİZCE yeşil
      kalır. Bu tam olarak T2-1'in başarısızlık biçimi (bu Task'ın var oluş sebebi) ve
      security gate'in tur 1'de `high` verdiği sınıfın kardeş boyutu: düzeltme "kanonik
      gövde" boyutunu kapattı, "ifade başlangıcı" boyutunu açık bıraktı — hem de aynı
      dosyadaki kardeş tarama toleranslı hâle getirilirken. `:152-153`'teki yorum gevşek
      desenin "Prisma'nın tam emit biçimine bağlı DEĞİL" olduğunu söylüyor; bu yalnızca
      boşluk/tek-satır için doğru, harf ve `IF NOT EXISTS` için DEĞİL → iddia davranıştan
      geniş. Hiçbir vaka iki girdiyi kapsamıyor.
      Bugün Prisma her zaman kanonik büyük harf emit ettiği için ulaşılamaz (bu yüzden
      `high` değil), ancak gevşek desenin eklenme gerekçesi (`:160-161`) zaten "v0.0.13'te
      ELLE yazılacak SQL migration'ları" — yani kuralın hedef girdisi tam bu sınıf.
      Sınıflandırma: **(b) önceden vardı, yüzeye çıkmadı** — tur 1'de iki tarama da harf
      duyarlıydı ve bunu KAÇIRDIM (K-C7'nin "harf duyarlılığı korunur" kararını yıkıcı
      tarama için kabul etmiştim); asimetri ve geniş yorum bu turda doğdu.
    — Düzeltme: ad desenini `(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi)`
      hâline getir VEYA bu dosyada zaten kurulmuş olan ayna-bekçisini genişlet: harf
      duyarsız `CREATE\s+TABLE` eşleşme SAYISI çıkarılan ad sayısından fazlaysa
      `UNPARSABLE_CREATE_TABLE` üret. İki prob vakasıyla pinle (küçük harf + IF NOT
      EXISTS). R-C6 engeli DEĞİL: R-C6 fixture/test'te ikinci desen yasaklıyor; tek sahip
      modülde iki kasıtlı desen (`:135`/`:164`) + ad-gövde bekçisi bu turda zaten emsal
      olarak kabul edildi. `:152-153` yorumu da gerçek kapsamla daraltılsın.
    — Sorumlu: db (düzeltme) / architect (v0.0.13 kapsam kararı)
  - [SEV: low] packages/db/src/__tests__/migration-sql.test.ts:553-578
    (+ packages/db/src/__tests__/helpers/migration-set-fixture.ts:74-76,
       packages/db/src/__tests__/helpers/migration-set.ts:217-220)
    — `V3-kök` vakası `isDirectory()` dalını artık KOŞTURUYOR (tur 1 C5'in asıl talebi
      karşılandı), ama dalı PİNLEMİYOR: kök seviyesindeki `migration_lock.toml` normal bir
      DOSYA olduğu için `!entry.isDirectory()` filtresi kaldırılsa bile
      `existsSync(join(root,'migration_lock.toml','migration.sql'))` **false** döner, girdi
      yine atlanır ve vaka YEŞİL kalır. İki filtre normal dosyalar için birbirinin yedeği;
      ikisini ayırt eden TEK girdi, `migration.sql` içeren bir dizine işaret eden bir
      SYMLINK'tir (`Dirent.isDirectory()` symlink girdisi için `false`, `existsSync`
      bağlantıyı İZLER → filtre kalkarsa symlink migration sayılır). Fixture'da
      `symlinkSync` yolu yok. Dolayısıyla `migration-set-fixture.ts:76` ("gerçekten
      koşturur") **doğru**, ama `migration-set.ts:219` ("`!entry.isDirectory()` dalıyla
      AYRICA KANITLANIR") hâlâ olduğundan güçlü — tur 1 C5'in şikâyeti (yorum kanıt
      kapsamını geniş gösteriyor) yeni sözcüklerle kısmen yeniden üretilmiş. Vakanın
      kendisi değerli ve DAVRANIŞI doğru doğruluyor ("kökteki lock dosyası migration
      sayılmaz") — kaldırılmasın.
    — Düzeltme: `migration-set.ts:217-220` yorumunu daralt ("dal artık koşuyor;
      `existsSync` yedeklediği için PİNLİ değil — ayırt edici tek girdi symlink") veya
      fixture'a `rootSymlinks` yolu ekleyip gerçek pin'i kur (Windows'ta symlink izni
      gerektirir; eklenirse platform koşulu yorumla belgelenmeli).
    — Sorumlu: db
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set-fixture.ts:123 (+ :56, :64)
    — C5 düzeltmesi `assertSafeDirectoryName`'i bir DOSYA adı için de çağırıyor
      (`rootFiles` döngüsü), ama fonksiyonun adı ve hata mesajı (`:64`
      "geçersiz dizin adı \"…\"") yalnızca dizinden söz ediyor: kökte geçersiz bir dosya
      adı verilirse mesaj `migration_lock.toml`'u "dizin" diye niteler. Kontrolün KENDİSİ
      doğru ve gerekli (sandbox dışına yazmayı önleyen güvenlik kontrolü); kusur ad ile
      kullanım arasındaki kayma — düzeltme turunun doğurduğu yeni sapma.
      Sınıflandırma: **(a) düzeltmenin doğurduğu gerileme.**
    — Düzeltme: `assertSafeEntryName` olarak yeniden adlandır ve mesajı "geçersiz girdi
      adı" yap (tek tanım + 2 çağrı), ya da çağrı başına ince iki sarmalayıcı kullan.
    — Sorumlu: db
  - [SEV: low] packages/db/src/__tests__/migration-sql.test.ts:348, 379, 395, 418, 446, 486, 508, 530, 553
    — Yeni dokuz vakanın yedisinin ADI, geçici bir inceleme turunun yerel kimliğiyle
      başlıyor: `AC7c-ek (B1)`, `C1:` (**iki ayrı vaka aynı önekle**), `B2:`, `AC7d:`,
      `A-1/A-2/A-3`, `V3-kök`. Beş yıl sonra `B2`, `A-1`, `C1` yalnızca
      `.claude/workflow/reviews/` altındaki bir tur raporu üzerinden çözülebilir; `AC7d`
      ise bir Task kabul kriteri GİBİ görünüyor ama T-004 AC7 yalnızca (a)(b)(c)
      tanımlıyor → Task'ta `AC7d` arayan okuyucu hiçbir şey bulamaz. Aynı sorun iki
      `describe` adında da var (`:485`, `:552`). Hafifletici: her vakanın üstünde TAM
      atıflı bir yorum var (örn. "security gate T-004 tur 1, bulgu 1") — kimlik oraya ait,
      vaka adına değil. Vaka adlarındaki iki nokta sonrası davranış cümlesi zaten tek
      başına yeterli.
      Sınıflandırma: **(a) düzeltmenin doğurduğu gerileme.**
    — Düzeltme: tur-yerel öneki `it()` adından çıkar, yorumda bırak; yalnızca gerçekten
      var olan `AC*` kimlikleri önek olarak kalsın (`AC7d` → davranış cümlesi + yorumda
      "C8, solid tur 1").
    — Sorumlu: db
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set-fixture.ts:43
    (+ packages/db/src/__tests__/helpers/migration-set.ts:245,
       packages/db/src/__tests__/migration-sql.test.ts:19, :263)
    — Düzeltme turu üç yorum iddiasını bayatlattı:
        (i) `migration-set-fixture.ts:43` "`migration-set.ts:52-57`'deki TERS karar" —
            o satır aralığı TUR 1 numaralandırması; dosya +118 satır büyüdü, `: T |
            undefined` kararı artık `migration-set.ts:64-75`'te, `:52-57` ise
            `MigrationSetRule` doc yorumunun ortası.
        (ii) `migration-set.ts:245` "bu fonksiyon **7 kuralın** tamamını tek gövdede
            barındırıyor" — kural sayısı bu turda **8** oldu (`:48` doğru sayıyı veriyor,
            iki yorum çelişiyor).
        (iii) `migration-sql.test.ts:19` "Prob süiti (**9 vaka**)" — artık **18**; `:263`
            `describe` adı "AC7: **üç ayrı** iki-yönlülük vakası" diyor ama blok **sekiz**
            vaka taşıyor ve çoğu iki-yönlülükle ilgili değil.
      Hiçbiri davranışı etkilemiyor; kusur yorumun GÜNCELLİĞİ (CLAUDE.md §4 / kriter 12).
      Sınıflandırma: **(a) düzeltmenin doğurduğu gerileme.**
    — Düzeltme: satır numarası yerine AD ile referans ver — dosya bunu zaten iki yerde
      doğru yapıyor (`migration-set.ts:219` "V3-kök vakası", `:399` "Pinned test: AC7d");
      kural sayısını `:245`'te 8 yap veya sayıyı yorumdan çıkar; vaka sayılarını
      `:19`/`:263`'te güncelle ya da sayısal iddiayı kaldır.
    — Sorumlu: db
ÖLÇÜMLER:
  - Denetlenen dosya: 3 (1217 satır; tur 1: 773) · referans okunan: 3
  - `any`: 0 · `as` / `as const`: 0 · `@ts-ignore`/`@ts-expect-error`: 0 · `console.*`: 0
  - En büyük fonksiyon: `collectMigrationSetViolations` — **165 satır**
    (migration-set.ts:250-414; tur 1: 129 → +36. Handoff'taki "~310" DÜZELTİLDİ.)
    İkinci: `buildPrimaryProbDirectories` 49 (veri kurucu) · `withTemporaryMigrationSet` 47
  - **KOPYA MANTIK: BULUNAMADI (teyit).** `CREATE TABLE` regex LİTERALİ tam **iki**, ikisi de
    migration-set.ts (`:135` gövde/katı, `:164` ad/gevşek); kalan 9 geçiş yorum/mesaj.
    Fixture + test dosyasında `RegExp`/`matchAll`/`.match(` → **0**. İki desenin sonuçları
    tablo adı üzerinden BİRLEŞTİRİLİYOR (`:351`), üçüncü bir eşleştirme mantığı doğmamış.
  - Test vakası (`it(` literali): **24** (6 gerçek repo + 18 prob); tur 1: 15 → **+9**
    (handoff "+11" DÜZELTİLDİ; bağlayıcı olan `qa`'nın koşum çıktısı)
  - `it.each`/`test.each`/`describe.each`: 0 · `afterEach`/`beforeEach`: 0 (1 açıklama yorumu)
  - `withTemporaryMigrationSet` çağrısı: 17, **17/17'si `it()` gövdesinde** (R-P1 uyumlu)
  - `catch`: 1 (`{ cause }` ile sarmalayıp iletiyor) · boş `catch`: 0 · `throw`: 3, üçü de `new Error`
  - Kullanılmayan export: 0 (migration-set 7/7 · fixture 6/6; yeni iki üreteç de kullanılıyor)
  - Erişilemez dal: **0** (tur 1'deki 4 dal kapandı; kalan 2 `undefined` dalı pinli:
    A-2 → UNPARSABLE_CREATE_TABLE, AC7a → MISSING_TENANT_SCOPED_TABLE)
  - Tur 1 bulgu kapanışı: **kapandı 6** (M1, M2, L3, L4, L5, L6, L7 → 7 kalem) ·
    **kısmen 1** (L2/C5 → yeni low) · **açık 1** (L1 gövde boyutu, gerekçe kabul edildi,
    ROADMAP borç satırı mevcut, çift kayıt yapılmadı)
  - Bulgu dağılımı: critical 0 · high 0 · **medium 1** · low 4 (toplam 5; tur 1: 2+7=9)
  - Yeni medium sınıflandırması: (a) 0 · **(b) 1** · (c) 0
  - `[DOĞRULANMALI]` etiketli iddia: **2** (artık yokluğu ölçümü; `no-misused-promises`'ın
    async gövde için fiilen tetiklenmesi)
  - FAIL kuralı (AGENT_BASELINE §4): high/critical yok, medium 1 (< 3) → **PASS**
  - Çalıştırılmadı (`Bash` yok): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
    `git diff`
```

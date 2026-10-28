T-004 — SOLID / Kod Kalitesi Gate, Tur 3 (dar: kapanış doğrulaması + gerileme)
Tarih: 2026-10-28
Sürüm: v0.0.13 önkoşulu (T2-1 kapanışı), FIX 2 sonrası

GATE: solid
SONUÇ: PASS

> Bu tur **dar mandalı**: tur 2'nin beş bulgusunun kapanışı + FIX 2'nin doğurduğu
> gerileme. Tur 1/2'de doğrulanmış ve bu turda değişmemiş kalemler (katman sınırları,
> bağımlılık yönü, döngüsel bağımlılık, hata yönetimi deseni, K-C3/K-C4/K-C5/K-C6/R-P6)
> **yeniden gerekçelendirilmedi**. Önceki raporlar:
> `.claude/workflow/reviews/T-004-solid-tur1.md`, `T-004-solid-tur2.md`.

---

## 0. Kapsam, ölçüm ve yöntem kısıtı

| Dosya                                                        | Tur 1 | Tur 2 | Tur 3 | Δ(2→3) |
| ------------------------------------------------------------ | ----- | ----- | ----- | ------ |
| `packages/db/src/__tests__/helpers/migration-set.ts`         | 316   | 434   | 545   | +111   |
| `packages/db/src/__tests__/helpers/migration-set-fixture.ts` | 122   | 204   | 251   | +47    |
| `packages/db/src/__tests__/migration-sql.test.ts`            | 335   | 579   | 838   | +259   |

Referans olarak **grep ile** doğrulandı (bulgu yazılmadı): `packages/db/src/index.ts`
(`migration-set`/`__tests__` geçişi **0** → K-C5/AC11 korunuyor).

**Yöntem kısıtı (tur 1/2 ile aynı):** `Bash` yok. `pnpm lint/typecheck/test/build`
**çalıştırılmadı**, `git diff` **okunmadı**. Ölçemediğim davranışsal iddialar
`[DOĞRULANMALI]` ile işaretlendi ve **bulgu olarak yazılmadı**.

---

## 1. Tur 2 bulgularının kapanışı

| #                            | Tur 2 bulgusu                                 | Durum                                |
| ---------------------------- | --------------------------------------------- | ------------------------------------ |
| M1 (medium)                  | Harf/`IF NOT EXISTS` duyarlılığı asimetrisi   | **kapandı**                          |
| L1 (low)                     | V3-kök vakası `isDirectory()`'yi pinlemiyordu | **kapandı** (kalıntı risk → yeni L3) |
| L2 (low)                     | `assertSafeDirectoryName` ad/kullanım kayması | **kapandı** (doküman sayısı → L5-iv) |
| L3 (low)                     | Vaka adlarındaki tur-yerel kimlikler          | **kapandı**                          |
| L4 (low)                     | Bayat yorumlar                                | **kısmen** → yeni **L5**             |
| tur 1 L1 (`collect…` boyutu) | Açık teknik borç                              | **`no_change_needed`** (bkz. §1.6)   |

### 1.1 M1 (harf duyarlılığı asimetrisi) — **kapandı**

Her iki çıkarım deseni artık `i` bayraklı, `\s+` toleranslı, `IF NOT EXISTS` ve
(tırnaklı/tırnaksız) şema önekine duyarsız:

- gövde: `migration-set.ts:196` — iki yakalama grubu
- ad: `migration-set.ts:236` — bir yakalama grubu

Tur 2'de verdiğim iki somut girdinin ikisi de artık görünür ve **pinli**:
`migration-sql.test.ts:658-689` altı biçim varyantını (küçük harf, `Create Table`,
çift boşluk, `IF NOT EXISTS`, `public."x"`, `CREATE\nTABLE`) **tek `it()` içinde**
tablo-sürücülü döngüyle `UNCLASSIFIED_TABLE` üzerinden doğruluyor; `:691` kanonik
regresyonu kapatıyor. `:152-153`'teki geniş iddia da yeniden yazıldı (`:224-233`
artık hangi biçimlerin kapsamda, hangisinin — tırnaksız ad — **dışında** olduğunu
açıkça sayıyor).

**R-C6 hâlâ sağlam mı? → EVET, teyit.** Üç soruyu ayrı ayrı yanıtlıyorum:

1. **Sayaç, yasakladığım "ikinci çıkarım deseni" kategorisine girmiyor.**
   `CREATE_TABLE_TOKEN_PATTERN` (`:169`, `/CREATE\s+TABLE\b/gi`) **yakalama grubu
   taşımıyor**; tek kullanımı `[...sql.matchAll(...)].length` (`:393`). Hiçbir tablo
   adı, gövde veya taksonomi karşılaştırması üretmiyor. R-C6'nın yasağı "aynı bilgiyi
   ikinci bir yerden ÇIKARMAK"tı; bu bir **kardinalite ölçümü**. Kabul.
2. **Üçlü yapı üçüncü bir eşleştirme yolu doğurmadı.** İki ayrı mekanizma var ve
   ikisi de **aynı kural koduna** (`UNPARSABLE_CREATE_TABLE`) çıkıyor:
   - **birleştirme (join):** `:459-468` — ad kümesi ∖ gövde kümesi, tablo adı üzerinden.
   - **sayım karşılaştırması:** `:395` — `tokenCount > nameCount`.
     İnvaryant statik olarak sağlam: ad deseninin her eşleşmesi tam bir
     `CREATE\s+TABLE` jetonu tüketir ve eşleşmeler örtüşmez → `nameCount ≤ tokenCount`
     **her zaman**. Yani bekçi "fazla sayarak" sessizleştirilemez.
3. **İki üretim yolu testte ayırt ediliyor** (kritik kontrol — yoksa biri ölü kalırdı):
   - `:521-541` (tek satırlık, taksonomide OLAN tablo): `tokenCount = nameCount = 1`
     → bekçi susar, **join yolu** fırlar.
   - `:714-730` (tırnaksız ad): `nameCount = 0` → ad döngüsü hiç koşmaz, **yalnızca
     bekçi** fırlar.
   - `:736-767` (D1 sınır vakası): assertion `violation.tableName === 'invoice_short'`
     ile **join yolunu** seçiyor (bekçi yolu `tableName: undefined` üretir, `:399`).
     Ayrıca `ledger_entry` için ihlal **olmadığını** da doğruluyor → gövde çapasının
     `[^;]*?` daralmasının gerçek pin'i.

### 1.2 L1 (V3-kök / `isDirectory()`) — **kapandı**; vaka **gerçekten** pinliyor

Statik gerekçe (`Bash` yok, mutasyonu ben koşturmadım): `symlinkSync(join(root, target),
join(root, alias), 'dir')` (`migration-set-fixture.ts:170`) kökte bir **sembolik bağ**
girdisi yaratıyor. `readdirSync(..., { withFileTypes: true })` bu girdi için
`Dirent.isDirectory() === false` / `isSymbolicLink() === true` döndürür; `existsSync`
ise bağlantıyı **izler** → `.../alias/migration.sql` **var**. Dolayısıyla
`migration-set.ts:285` filtresi kaldırılırsa alias **migration sayılır** ve
`migration-sql.test.ts:637-639`'un `toEqual(['…_symlink_target'])` beklentisi iki
elemanlı diziyle karşılaşıp **kırmızıya** döner (leksikografik sıra: `…014_target`,
`…015_alias`). Tur 2'de "ayırt edici tek girdi symlink'tir" dediğim sınıf **tam olarak**
kurulmuş. `db`'nin bildirdiği ters doğrulama statik okumayla tutarlı
→ `[DOĞRULANMALI] (1)`.

Yorum da artık **gerçeği** söylüyor: `migration-set.ts:276-284` iki kontrolün normal
dosyalar için **REDUNDANT** olduğunu açıkça yazıyor ve pin'i symlink vakasına atfediyor.
Tur 2'nin "yorum kanıttan geniş" şikâyeti kapandı.

**`skipIf` sessiz bir kapsam kaybı mı? → Hayır, bu Task'ta üç kez çıkan "test
kanıtladığından fazlasını iddia ediyor" sınıfının bir biçimi DEĞİL.** Gerekçe:

- `it.skipIf(process.platform === 'win32')` (`:616`) Vitest reporter'ında vakayı
  **"skipped" olarak sayar ve basar** — sessiz değil, görünür. `test.skip` ile kalıcı
  susturma (CLAUDE.md §6 yasağı) değil; koşul **platform**, kırılan bir assertion değil.
- Bağlayıcı ortam CI ve CI `ubuntu-latest` (yorumda T-004.md V-C5'e atıf, `:612-614`)
  → pin **her zaman** koşuyor. Windows'ta kaybolan şey yerel geri bildirim, güvence
  değil.
- Koşul **toplama fazında** değerlendiriliyor ama yalnızca bir `process.platform`
  okuması; `mkdtemp` tetiklenmiyor → R-P1 güvende (bkz. §2.5).

Gözlem (bulgu değil, kapsam dışı/devops): repoda "atlanan test sayısı > 0 ise kır"
türünde bir bütçe yok; ileride platform dışı bir gerekçeyle eklenen bir `skipIf`
kimsenin dikkatini çekmez. Bu, T-004'ün değil CI politikasının kalemi.
Ancak bu vakanın **gerçek** sessiz-yeşil riski `skipIf` değil, hedefin
doğrulanmaması → **L3**.

### 1.3 L2 (`assertSafeEntryName`) — **kapandı**

Ad (`migration-set-fixture.ts:84`), mesaj (`:93`, "geçersiz girdi adı") ve `/^\.+$/`
reddi (`:90`) yerinde. Çağrı noktası tur 3'te **dört**: `:143` (`directories`),
`:161` (`rootFiles`), `:168` + `:169` (`rootSymlinks` — ad **ve** hedef). Doküman
sayı iddiası tutmuyor → **L5-iv**. Ad/kullanım kayması kusuru **giderildi**.

### 1.4 L3 (tur-yerel kimlikler) — **kapandı**

- **Sahte-AC kalmadı:** `AC7d` tüm `it`/`describe` adlarından çıkmış (tek geçişi
  `migration-sql.test.ts:39`'daki tarihsel değişiklik notu — orada doğru yerde).
  Önek olarak kalan kimlikler yalnızca gerçek Task AC'leri: `AC1` (`:186`), `AC2`
  (`:197`), `AC8` (`:206`), `AC4` (`:215`), `AC6` (`:228`), `AC5` (`:240`),
  `AC7a/b/c` (`:277`, `:302`, `:328`).
- **Çıplak tur-yerel önekler yok:** `B1:`, `B2:`, `C1:`, `A-1`, `V3-kök` artık
  başlıklarda önek değil.
- **Kalan 32 adın tamamı davranış cümlesi taşıyor.** Örnek: `:714` "tırnaksız tablo
  adı taşıyan CREATE TABLE sessizce geçmez, UNPARSABLE_CREATE_TABLE üretir (ayna
  bekçisi)" — "ayna bekçisi" modülde (`:162`) tanımlı bir alan terimi, tur-yerel kimlik
  değil.
- `describe` sayısal iddiası da düzeldi: `:276` artık "AC7: iki-yönlülük ve ilişkili
  ihlal vakaları" (tur 2'de "üç ayrı … vakası" diyordu, blok sekiz vaka taşıyordu).

**Kalıntı, bulgu YAZILMADI:** beş adda (`:361`, `:392`, `:408`, `:431`, `:459`) tam
atıf (`solid gate T-004 tur 1 bulgu B1` vb.) hem **üstteki yorumda** hem **ad içinde**
duruyor — tekrar, ama **çözülebilir** tekrar; tur 2'nin asıl şikâyeti ("beş yıl sonra
`B2` çözülemez") giderilmiş. Bunu `low` yazmak ratchet olurdu.

### 1.5 L4 (bayat yorumlar) — **kısmen kapandı**, yeni bayat iddialar doğdu → **L5**

| Tur 2 kalemi                                     | Durum                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| (i) `fixture:43` satır-numaralı çapraz referans  | **kapandı** — `:59` artık `MigrationSetViolation`'a **ad** ile atıf |
| (ii) `migration-set.ts:245` "7 kural"            | **kapandı** — `:327` "SEKİZ kuralın tamamını"; `:64` ile tutarlı    |
| (iii) `test:19` "9 vaka" · `:263` "üç ayrı vaka" | **kapandı** — sayısal iddia kaldırıldı/`qa` çıktısına devredildi    |

**Ama kural sayısı/vaka sayısı için güncellik yine bozuldu** (tur 2'de bu sınıfı ben
yakalamıştım; FIX 2 dosyaları yine büyüttü): `:329` bu kez **satır sayısını** sabitledi
("165 satır") ve aynı turda fonksiyon 191 satıra çıktı; `:66-68` sekizinci kuralın
**ikinci üretim yolunu** (ayna bekçisi) hiç anmıyor. Ayrıntı **L5**.
Doğru olanlar da var: `test:16` "Gerçek repo süiti (6 vaka)" → gerçekten 6 (`:81`–`:102`);
`test:33-41`'in FIX 2 vaka envanteri (altı varyant tek `it()`, kanonik regresyon, ayna
bekçisi, symlink, iki dize literali + bir RLS, D1) birebir doğru.

### 1.6 Tur 1 L1 — `collectMigrationSetViolations` **191 satır**: `no_change_needed`, `low` KALIYOR

Ölçüm: `migration-set.ts:334-524` = **191 satır** (tur 1: 129 · tur 2: 165 → **+26**,
%16). Büyüme tek kaynaktan: ayna bekçisi döngüsü (`:386-403`, 18 satır).

**Eşiği aşmadı; `medium`'a çıkarmıyorum.** Tur 2'de eşiği açıkça tanımlamıştım:
"v0.0.13 canlı şema kurallarını (R-C2) **bölmeden önce** eklerse `medium`'a çıkar."
Bu koşul gerçekleşmedi — FIX 2 canlı şema kuralı eklemedi. Kalem ROADMAP borç
defterinde (S2(c)) kayıtlı; aynı kalemi üçüncü bir gate turunda yeniden yazmak defteri
bozar (çift kayıt).

**Ancak tavsiye GÜÇLENDİ ve bölmenin gerekçesi ZAYIFLADI:** FIX 1'de bölmeye karşı
verilen gerekçe "R-C6 (tek ad + tek gövde deseni) riskini artırır"dı. FIX 2'nin iki
yeni kaygısı (`maskSingleQuotedStringLiterals` `:157`, `CREATE_TABLE_TOKEN_PATTERN`
`:169`) **zaten modül seviyesinde saf yardımcı** olarak ayrıldı; gövdedeki beş döngünün
her biri `normalizedMigrations` üzerinde saf bir fonksiyona dönüştürülebilir ve bu
**hiçbir deseni kopyalamaz**. Yani R-C6 artık bölmenin önünde durmuyor. v0.0.13'te
kural eklemeden **önce** bölünmesi beklentisi aynen geçerli.

---

## 2. Yeni gerileme taraması

### 2.1 `maskSingleQuotedStringLiterals` — tek sorumluluk **korunmuş**

Tanım `migration-set.ts:157`, desen `:145`. **Tek çağrısı `:372`** (tam metin arama) —
yalnızca yıkıcı tarama girdisinde. `stripLineComments` (`:115`) tek çağrısı `:363`;
ad/gövde çıkarımı (`:235`/`:194`) çağrıları `:394`, `:410`, `:428` — **hiçbiri
maskelenmiş metin almıyor**. Yorum (`:139-143`) bu sınırı ve R-C4'ün bilerek açık
bırakıldığını doğru yazıyor. Saf fonksiyon, yan etkisiz, dönüş tipi açık. ✔

### 2.2 Üç normalizasyon katmanının sıralaması — **bir örtük bağımlılık VAR**

| Katman                           | Girdi                                | Tüketici          |
| -------------------------------- | ------------------------------------ | ----------------- |
| `stripLineComments` (`:363`)     | ham `migration.sql`                  | **üç** tüketici   |
| `maskSingleQuotedStringLiterals` | yorum **temizlenmiş** metin (`:372`) | yıkıcı tarama     |
| ayna bekçisi sayacı (`:393`)     | yorum temizlenmiş, **maskelenmemiş** | UNPARSABLE kuralı |

- **`strip` → `mask` sıralaması örtük bir ön koşul yaratıyor** ve belgelenmemiş: yorum
  temizliği bir dize literalinin içinden `--` keserse (`VALUES ('a -- b')`) geride
  **tek** tırnak kalır ve maskeleyicinin çift eşleştirmesi kayar. Yön analizi §L2'de.
- Ters sıra **koruyucu**: apostrof içeren bir `-- don't drop this` yorumu önce silindiği
  için maskeleyiciye hiç ulaşmıyor. Yani bugünkü sıra **doğru olan**; eksik olan,
  sıranın bir **ön koşul** olduğunun yazılı olmaması.
- **Durum sızıntısı yok:** `:145` ve `:169` modül seviyesinde `g` bayraklı, ama `:145`
  `String.replace` ile (bitişte `lastIndex` sıfırlanır) ve `:169` `String.matchAll`
  ile kullanılıyor — `matchAll` deseni **klonlar**, orijinalin `lastIndex`'ini
  değiştirmez. `:196`/`:236` ise fonksiyon içinde kuruluyor. İki yerleşim tutarsız
  **ama bugün güvenli**; latent tuzak (`:393` bir gün `P.test(...)`/`P.exec(...)`
  döngüsüne çevrilirse modül seviyesindeki `g` deseni migration'lar arasında durum
  taşır) için bulgu **yazmıyorum** — bugün yanlış davranış yok, kardeş desenler zaten
  doğru deseni gösteriyor.
- **K-C3 `collect`/`validate` ayrımı HÂLÂ net:** `validateMigrationSet` (`:531-544`)
  ince fırlatma sarmalayıcısı; iş mantığı taşımıyor, parametre eklenmemiş, muafiyet
  kancası yok. ✔

### 2.3 `rootSymlinks` üçüncü opsiyonel parametre — **ölü parametre YOK**, ama API şekli bozuldu

`rootFiles` tek çağrı: `migration-sql.test.ts:601`. `rootSymlinks` tek çağrı: `:642`.
İkisi de **gerçek** bir vakayı besliyor, spekülatif genellik değil. Ancak dördüncü
pozisyonel opsiyonel parametre ilk kullanımında zaten `undefined` deliği yazdırdı
(`:641`) → **L4**. Hedef doğrulamasının eksikliği → **L3**.

### 2.4 R-C7 — tip disiplini: **temiz**

Üç dosyada tam metin arama: `any` **0** · `as` / `as const` **0** · `@ts-ignore` /
`@ts-expect-error` **0** · `console.*` **0** · `.skip` / `.only` / `TODO` / `FIXME` **0**.

- `exactOptionalPropertyTypes` ✔ — iki yeni ihlal nesnesi (`:396-401`, `:461-466`)
  dört alanın **tamamını** açıkça veriyor. `rootFiles?`/`rootSymlinks?` **parametre**
  opsiyonelliği (`:134-135`) bu kuralın kapsamı değil; `:641`'deki açık `undefined`
  geçişi opsiyonel parametre için geçerli.
- `noUncheckedIndexedAccess` ✔ — yeni kodun indeksli erişimi yok; bekçi yalnızca
  `.length` okuyor (`:393-394`). `match[1]`/`match[2]` (`:200-201`, `:240`) hâlâ
  `=== undefined` ile daraltılmış; `Map.get` dalları (`:459`, `:492`) daraltılmış **ve**
  pinli.
- Yeni adlar İngilizce ve açık: `maskSingleQuotedStringLiterals`,
  `SINGLE_QUOTED_STRING_LITERAL_PATTERN`, `CREATE_TABLE_TOKEN_PATTERN`, `tokenCount`,
  `nameCount`, `rootSymlinks`, `symlinkName`, `targetDirectoryName`, `assertSafeEntryName`.
  Sabitler SCREAMING_SNAKE_CASE ✔ · `data`/`temp`/`handle`/`process` **yok** ✔ ·
  dosya adları kebab-case ✔.
- `MigrationSetRule` birleşimi 8 üye, doc sayısı (`:64` "SEKİZ") doğru ✔.

### 2.5 R-P1 — `it.each` hâlâ **yok**, fixture hâlâ yalnızca `it()` gövdesinde

`.each(` → **0** · `beforeEach`/`afterEach` → **0**. `withTemporaryMigrationSet`
**26 çağrısının 26'sı** bir `it()` (veya `it.skipIf(...)(...)`) gövdesinde — satır
eşlemesini tek tek doğruladım (`187,198,207,216,229,264,293,319,349,382,401,420,448,
482,513,535,556,593,633,680,704,723,756,785,809,831`). Altı biçim varyantı **tek `it()`
içindeki `for` döngüsünde** (`:674-688`), toplama fazında değil. `it.skipIf`'in koşulu
toplama anında yalnızca `process.platform` okuyor — `mkdtemp` tetiklenmiyor. Modül üst
seviyesinde yalnızca `new URL` (`:66`), nesne literalleri ve **tanımlar** var.
`vitest list` güvende. ✔

### 2.6 Ölü kod / katman / bağımlılık — temiz

`migration-set.ts` **7/7** export kullanılıyor; fixture **8/8** (yeni `rootSymlinks`
yolu dışa açılmış bir API değil, parametre). Yorumlanmış kod / "sonra kullanacağız"
dosyası yok. Katman sınırı, bağımlılık yönü (`node:*` + paket içi `../index.js`),
döngü yokluğu, hata yönetimi (tek `catch` `:268` → `{ cause }` ile sarmalar; boş
`catch` 0; `throw` 3, üçü de sade `new Error`), K-C4 (`vitest`/`expect` yardımcıda yok),
K-C5 (`src/index.ts` yüzeyi değişmemiş), R-P6 (`mkdtemp` öneki `:139`), K-C10
(`try/finally`, `rmSync` yalnızca `mkdtempSync` dönüşünü hedefler `:184`) — **tur 1/2
ile aynı, yeniden gerekçelendirilmedi**.

**İncelendi, bilinçli olarak bulgu YAZILMADI (önceden vardı, FIX 2 dokunmadı, bu turun
mandası dışı):** `migration-set.ts:510` `new RegExp` tablo adını kaçışlamadan
enterpolasyona sokuyor. Taksonomi adları bugün `[a-z_]` ve bu kalem tur 1/2'de de
R-C6 kapsamı dışıydı; dar turda yeni kalem açmak ratchet olur.

---

## 3. Yeniden raporlanmayanlar (talimat gereği)

`readonly T[]` (ESLint zorunlu) · K-C4 dosya ayrımı · fixture ilk dizininin `_init`
ile bitmesi (K-C9) · C8'in ≥2-kolon şartı (kasıtlı, `:503-509` gerekçeli,
`migration-sql.test.ts:459` ile pinli) · `stripLineComments`'in string-literal kaçırma
sınırı (R-C4, `architect`, v0.0.13 — `db` bunu bilerek kapatmadı ve açıkça raporladı;
L2 bu sınıfı **yeniden raporlamıyor**, yalnızca FIX 2'nin GETİRDİĞİ yeni yönü ve geniş
iddiayı yazıyor) · `=> void` imzasının `async` kabul etmesi (gerçek koruma
`no-misused-promises`, araç kalemi) · `collectMigrationSetViolations` gövde boyutu
(§1.6, açık ROADMAP borcu, çift kayıt yapılmadı) · Prettier/ESLint'in yakaladığı biçim
kalemleri.

**Yüzeysel benzerlik, kasıtlı olarak bulgu yazılmadı:** `:470` (`includes('"tenant_id"')`)
ile `:479` (`includes('"tenant_id" TEXT NOT NULL')`) — farklı sebeplerle değişecek iki
kural, birleştirmek daha kötü tasarım. `:395` (sayım) ile `:460` (join) — aynı kural
kodunu üreten **iki farklı teşhis**, kopya değil; ikisi de ayrı ayrı pinli (§1.1).

---

## 4. BULGULAR

```
GATE: solid
SONUÇ: PASS
BULGULAR:
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:393
    (+ :169, :145, :372)
    — AYNA BEKÇİSİ yanlış pozitif yüzeyi: bekçi, yorum temizlenmiş ama MASKELENMEMİŞ
      metin üzerinde `CREATE TABLE` JETONU sayıyor. Aynı turda kardeş tarama (yıkıcı
      ifade) tam bu sebeple maskeleme kazandı (`:372`), bekçi KAZANMADI. Sonuç: kod
      OLMAYAN metinde geçen "CREATE TABLE" ifadesi `tokenCount`'u şişirir ve
      `UNPARSABLE_CREATE_TABLE` üretir. İki somut girdi:
        (i) `INSERT INTO "audit_log" ("statement") VALUES ('CREATE TABLE foo (...)');`
            — tokenCount 1, nameCount 0 → ihlal (yanlış);
        (ii) blok yorumu (slash-star) içinde geçen bir `CREATE TABLE` örneği —
            `stripLineComments` yalnızca `--` işliyor (R-C4, kabul edilmiş sınır).
      Yön YANLIŞ POZİTİF (gürültülü kırmızı), sessiz yeşil DEĞİL — bu yüzden `low`:
      süit yanlış yere kırılır, güvence kaybı olmaz. Bugün Prisma emit'inde ulaşılamaz;
      hedef girdi sınıfı (v0.0.13'ün ELLE yazılacak SQL migration'ları, seed INSERT'leri)
      bu biçimi taşıyabilir.
      Sınıflandırma: **(a) FIX 2'nin doğurduğu** — bekçi bu turda eklendi.
    — Düzeltme: bekçiyi de maskelenmiş metin üzerinde çalıştır
      (`maskSingleQuotedStringLiterals(sql)` — tüketici sayısı 1'den 2'ye çıkar, YENİ
      desen gerekmez, R-C6 engeli yok) VEYA `:162-167` yorumunu daralt ("yorum/dize
      içindeki metin de sayılır; yanlış pozitif mümkün, R-C4 ile birlikte v0.0.13'te
      kapanır") ve bir prob vakasıyla bugünkü davranışı PİNLE.
    — Sorumlu: db (düzeltme) / architect (R-C4 ile birleştirme kararı, v0.0.13)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:153-155
    (+ :139-143, :363 → :372)
    — MASKELEME İDDİASI DAVRANIŞTAN GENİŞ + örtük sıralama ön koşulu belgesiz.
      `:153-155` "gerçek `DROP COLUMN` / `SET NOT NULL` ifadeleri (tırnak içinde
      DEĞİLLER) ETKİLENMEZ" diyor. Bu, tırnak EŞLEŞTİRMESİNİN doğru olmasına bağlı ve
      maskeleyici sade bir çift-eşleştirme (`/'(?:[^']|'')*'/g`), tokenizer değil.
      Tek sayıda apostrof kaldığında maskeleme ifade sınırını AŞAR ve tırnak DIŞINDAKİ
      gerçek bir yıkıcı ifadeyi yutar — yani FIX 2, yıkıcı taramaya ilk kez bir
      YANLIŞ NEGATİF (sessiz yeşil) yönü ekledi; önce yalnızca yanlış pozitif üretebilirdi.
      İki tetikleyici:
        (i) çift tırnaklı tanımlayıcı içinde apostrof — `ALTER TABLE "o'clock" DROP
            COLUMN "x";` ardından herhangi bir sonraki apostrof: aradaki `DROP COLUMN`
            maskelenir → `DESTRUCTIVE_STATEMENT` KAÇAR;
        (ii) `strip` → `mask` SIRASININ yan etkisi: `VALUES ('a -- b');` satırında
            yorum temizliği literalin içinden keser, geride TEK tırnak kalır, sonraki
            apostrofa kadar her şey (varsa bir `DROP`) maskelenir.
      Not: bu, R-C4'ün (tokenizer yokluğu) YENİDEN raporlanması DEĞİL — R-C4 `architect`
      sahipliğinde v0.0.13'e vadeli ve kapsam dışı; buradaki bulgu (1) iddianın
      mutlak yazılması ve (2) sıralamanın bir ÖN KOŞUL olduğunun hiçbir yerde
      yazılmaması. Prisma emit'inde her iki tetikleyici de ulaşılamaz → `low`.
      Sınıflandırma: **(a) FIX 2'nin doğurduğu.**
    — Düzeltme: `:153-155`'i daralt ("tırnak eşleştirmesi tek sayıda apostrofta kayar;
      tam doğruluk R-C4 tokenizer'ına bağlı, v0.0.13") ve `:157`'nin doc'una ön koşulu
      yaz ("girdi `stripLineComments`'ten GEÇMİŞ olmalı; sıra tersine çevrilirse yorum
      içindeki apostroflar eşleştirmeyi bozar"). İsteğe bağlı prob: tek apostroflu
      tanımlayıcı vakasıyla bugünkü (eksik) davranışı pinle.
    — Sorumlu: db (yorum) / architect (R-C4 kapsamına alma)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set-fixture.ts:166-171
    (+ :124-129, packages/db/src/__tests__/migration-sql.test.ts:629-631)
    — `rootSymlinks` hedefi DOĞRULANMIYOR; belgelenmiş ön koşul zorlanmıyor. `:124-126`
      yorumu "hedef, kendi `migration.sql` dosyasını taşıyan GERÇEK bir alt dizin
      OLMALI" diyor, ama kod yalnızca ad güvenliğini (`assertSafeEntryName`) kontrol
      ediyor; `directories` içinde böyle bir giriş olup olmadığına BAKMIYOR.
      `symlinkSync` sarkan (dangling) bağ oluşturmaktan şikâyet etmez → hedef adı bir
      harf yanlış yazılırsa `existsSync` BAŞKA bir sebeple `false` döner, girdi yine
      elenir ve `:637-639` beklentisi YEŞİL kalır: vaka artık `isDirectory()`
      filtresini PİNLEMEZ ama bunu kimse görmez. Bu, D2'nin (`join(root, '.')` kökün
      kendisine çözülüyordu → "vaka hiçbir şey ölçmeden yeşil kalıyordu") kapattığı
      sınıfın TAM AYNISI — aynı dosyada, bir sonraki turda yeniden açıldı; ve bu
      Task'ta üç kez çıkan "test kanıtladığından fazlasını iddia ediyor" sınıfının
      asıl kalıntısı (`skipIf` değil, bu).
      Sınıflandırma: **(a) FIX 2'nin doğurduğu.**
    — Düzeltme: `rootSymlinks` döngüsünde iki satırlık bir ön koşul: hedefin
      `directories` içinde bulunması VE `migrationSql !== undefined` olması; aksi
      hâlde `assertSafeEntryName` ile aynı üslupta `throw` (fixture kullanım hatası,
      test başarısızlığı değil).
    — Sorumlu: db
  - [SEV: low] packages/db/src/__tests__/migration-sql.test.ts:641
    (+ packages/db/src/__tests__/helpers/migration-set-fixture.ts:131-136)
    — DÖRT POZİSYONEL PARAMETRE, İKİSİ OPSİYONEL: `withTemporaryMigrationSet(
      directories, run, rootFiles?, rootSymlinks?)`. Dördüncü parametrenin İLK
      kullanımı zaten üçüncüsü için bir `undefined` DELİĞİ yazdırdı (`:641`). Çağrı
      yerinde hangi `undefined`'ın neye karşılık geldiği okunamıyor ve v0.0.13'te
      beşinci bir fixture boyutu gelirse `undefined, undefined, x` olur (KISS /
      kriter 6). İki parametrenin kendisi spekülatif DEĞİL (her birinin gerçek, tek
      bir çağrısı var — ölü parametre yok); kusur yalnızca API şekli.
      Sınıflandırma: **(a) FIX 2'nin doğurduğu.**
    — Düzeltme: fixture'ı tek bir seçenek nesnesine al —
      `withTemporaryMigrationSet({ directories, rootFiles, rootSymlinks }, run)`;
      `exactOptionalPropertyTypes` altında opsiyonel alanlar hiç YAZILMAZ, `undefined`
      deliği kaybolur. 26 çağrı noktasını değiştirdiği için v0.0.13'te şema linter'ı
      promosyonuyla birlikte yapılması makul (bugün zorunlu değil).
    — Sorumlu: db / architect (v0.0.13 zamanlaması)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:329
    (+ :66-68, :297-302, packages/db/src/__tests__/helpers/migration-set-fixture.ts:70)
    — YORUM GÜNCELLİĞİ/DOĞRULUĞU — dört kalem (CLAUDE.md §4, kriter 12). Tur 2'nin
      aynı sınıfı, FIX 2 dosyaları yine büyüttüğü için yeniden açıldı:
        (i) `:329` "gerçek satır sayısı … 165 satır" — fonksiyon artık
            **191 satır** (`:334-524`). FIX 2 tur 2'nin ölçümünü yoruma SABİTLEDİ ve
            aynı turda geçersiz kıldı. Satır sayısını yoruma yazmak bu dosyada
            üçüncü kez bayatlıyor → sayıyı tamamen çıkarmak doğru çözüm.
        (ii) `:66-68` `UNPARSABLE_CREATE_TABLE` doc'u kuralın YALNIZCA bir üretim
            yolunu (ad∖gövde birleştirmesi) anlatıyor; FIX 2'nin eklediği İKİNCİ yol
            (ayna bekçisi, jeton sayımı — `:395`) hiç anılmıyor. Beş yıl sonra tipin
            doc'unu okuyan, `tableName: undefined` ile gelen bir ihlali açıklayamaz.
        (iii) `:297-302` çapraz referansı YANLIŞ tesisi gösteriyor: bu `existsSync`
            dalının kanıtı "kök seviyesindeki migration_lock.toml" vakası DEĞİL (o
            girdi bir satır önce `isDirectory()` ile elenir, bu dala hiç GELMEZ);
            dalı gerçekten koşturan `buildPrimaryProbDirectories`'in
            `…_fixture_lock_only` dizini (AC1 vakası, `migration-sql.test.ts:175`,
            `:186`). Ayrıca "`migration.sql` İÇİNDEKİ bir dizin" ifadesi bozuk
            (kastedilen "İÇERMEYEN").
        (iv) `migration-set-fixture.ts:70` "Kontrol **üç** sandbox-kaçış sınıfını
            kapsar:" diyor, liste **iki** madde taşıyor; koddaki `length === 0` dalı
            (`:89`) belgesiz. (`join(root, '')` de köke çözülür, yani dots-only ile
            aynı sınıf — madde ya eklenmeli ya sayı düzeltilmeli.)
      Hiçbiri davranışı etkilemiyor.
      Sınıflandırma: **(a) FIX 2'nin doğurduğu.**
    — Düzeltme: (i) sayıyı yorumdan çıkar, "tek gövdede sekiz kural" ifadesi yeter;
      (ii) `MigrationSetRule` doc'una ikinci üretim yolunu bir cümleyle ekle;
      (iii) referansı `…_fixture_lock_only` / AC1 vakasına çevir ve "İÇERMEYEN" yaz;
      (iv) üçüncü maddeyi yaz veya sayıyı ikiye indir.
    — Sorumlu: db
ÖLÇÜMLER:
  - Denetlenen dosya: 3 (1634 satır; tur 2: 1217 → +417) · referans grep: 1 (`src/index.ts`)
  - `any`: 0 · ` as ` / `as const`: 0 · `@ts-ignore`/`@ts-expect-error`: 0 ·
    `console.*`: 0 · `.skip`/`.only`/`TODO`/`FIXME`: 0
  - En büyük fonksiyon (GERÇEK satır sayısı): `collectMigrationSetViolations` —
    **191 satır** (migration-set.ts:334-524; tur 1: 129 · tur 2: 165 → +26, %16).
    İkinci: `withTemporaryMigrationSet` 56 (fixture:131-186) ·
    üçüncü: `buildPrimaryProbDirectories` 49 (veri kurucu, test:129-177).
    → Eşik AŞILMADI; tur 2'de tanımlanan yükseltme koşulu (canlı şema kuralı
    eklenmesi) gerçekleşmedi → `low` KALIYOR, çift kayıt yapılmadı (§1.6).
  - KOPYA MANTIK: **BULUNAMADI (teyit).** `CREATE TABLE` regex literali **üç**, üçü de
    migration-set.ts: `:169` SAYAÇ (yakalama grubu YOK) · `:196` gövde (2 grup) ·
    `:236` ad (1 grup). Sayaç bir ÇIKARIM deseni değil → R-C6 sağlam. Fixture + test
    dosyasında `RegExp`/`matchAll`/`.match(`/`.replace(` → **0** (tek regex kullanımı
    `toThrow(/…/)`). Aynı kural kodunun iki üretim yolu var (`:395` sayım, `:460`
    birleştirme) ve her ikisi de AYRI vakalarla pinli; üçüncü bir eşleştirme yolu YOK.
  - Test vakası (`it(` + `it.skipIf`): **32** (6 gerçek repo + 26 prob); tur 2: 24 → +8.
    `describe`: 9. Bağlayıcı sayım `qa`'nın gerçek koşum çıktısı.
  - `it.each`/`test.each`/`describe.each`: **0** · `beforeEach`/`afterEach`: **0**
  - `withTemporaryMigrationSet` çağrısı: **26**, **26/26'sı `it()` gövdesinde** (R-P1 ✔)
  - Atlanabilir vaka: **1** (`it.skipIf(process.platform === 'win32')`, test:616) —
    gerekçe yorumda (`:612-614`), CI `ubuntu-latest`'te KOŞAR, Vitest "skipped" olarak
    BASAR → sessiz kapsam kaybı değil
  - `catch`: 1 (`{ cause }` ile sarmalar) · boş `catch`: 0 · `throw`: 3, üçü de `new Error`
  - Kullanılmayan export: **0** (migration-set 7/7 · fixture 8/8) · erişilemez dal: **0**
  - Tur 2 bulgu kapanışı: **kapandı 4** (M1 medium, L1, L2, L3) · **kısmen 1** (L4 → yeni L5) ·
    **`no_change_needed` 1** (tur 1 L1 gövde boyutu — açık ROADMAP borcu S2(c))
  - Bulgu dağılımı: critical 0 · high 0 · **medium 0** · **low 5**
    (tur 1: 2 medium + 7 low · tur 2: 1 medium + 4 low)
  - Yeni medium sınıflandırması: **medium YOK** — yeni beş bulgunun beşi de `low`,
    beşi de **(a) FIX 2'nin doğurduğu**; (b) 0 · (c) 0
  - `[DOĞRULANMALI]` etiketli iddia: **3** — (1) symlink vakasının `isDirectory()`
    filtresi kaldırıldığında kırmızıya döndüğü (statik olarak gerekçelendirildi,
    mutasyonu `db` koşturdu, ben koşturmadım); (2) süit sonrası `os.tmpdir()` altında
    `arkesoft-migration-set-*` artığı kalmadığı; (3) `no-misused-promises`'ın async
    gövde için fiilen tetiklendiği (tur 2'den devam)
  - FAIL kuralı (AGENT_BASELINE §4): high/critical 0, medium 0 → **PASS**
  - Çalıştırılmadı (`Bash` yok): `pnpm lint`, `pnpm typecheck`, `pnpm test`,
    `pnpm build`, `git diff`
```

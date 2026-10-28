# T-004 — security gate, tur 3 (dar: kapanış doğrulaması + yeni yüzey)

Tarih: 2026-10-28 · Dal: `main` · İlgili sürüm: **v0.0.13 önkoşulu** (T2-1 kapanışı)
Versiyon etkisi: `patch` · Kapsam: `packages/db/src/__tests__/helpers/` (2 dosya, çalışma zamanı kodu yok)
Önceki turlar: `T-004-security-tur1.md` (FAIL — 1 high + 4 low) · `T-004-security-tur2.md` (PASS — 1 medium + 4 low)

```
GATE: security
SONUÇ: FAIL
BULGULAR:
  - [SEV: high] packages/db/src/__tests__/helpers/migration-set.ts:145,157,372 — `maskSingleQuotedStringLiterals` (FIX 2'nin C düzeltmesi) YANLIŞ POZİTİFİ kapattı ama FAIL-OPEN bir yol açtı: desen `/'(?:[^']|'')*'/g` tırnakları ÇİFTLER hâlinde eşler; bir migration dosyasında TEK SAYIDA tek tırnak varsa, ilk "sahipsiz" tırnaktan bir sonraki tırnağa kadar olan HER ŞEY boşlukla maskelenir — arada duran GERÇEK `DROP COLUMN` / `DROP TABLE` / `SET NOT NULL` ifadesi `DESTRUCTIVE_STATEMENT` ÜRETMEZ ve başka hiçbir kural ateşlemediği için süit SESSİZCE YEŞİL kalır. Dört bağımsız ve GERÇEKÇİ yol ampirik olarak doğrulandı (hepsi `[]`, kontrol grubu aynı dosyada apostrof/`--` çıkarılınca `["DESTRUCTIVE_STATEMENT"]` üretiyor → gerileme kanıtlı): (C2) dolar-tırnaklı (`$$ ... $$`) plpgsql gövdesi içinde Türkçe blok yorumu `/* tenant'in kimligi ... */` — Postgres'te TAMAMEN GEÇERLİ ve v0.0.13'ün getireceği elle yazılmış RLS/rol SQL'inin tipik biçimi; ardından gelen `ALTER TABLE "app_user" DROP COLUMN "legacy_note";` + dosya sonundaki `INSERT ... VALUES ('locale','tr-TR');` maskeyi kapatıyor → ihlal YOK. (C3) `stripLineComments` ile ZİNCİRLEME: `INSERT INTO "plan" ("n") VALUES ('Pro -- en iyi');` satırı yorum temizliğinde `--`'den KESİLİYOR, geriye sahipsiz bir tırnak kalıyor, maske sonraki `DROP COLUMN`'u yutuyor → ihlal YOK (maskeleme, R-C4'ün etki alanını "yorum kaçırma"dan "yıkıcı ifade gizleme"ye BÜYÜTTÜ). (C1) çift tırnaklı tanımlayıcı içinde apostrof (`ALTER TABLE "o'brien" DROP COLUMN "x";`) → ihlal YOK. (C5) kapanmayan literal (`VALUES ('x);`) → ihlal YOK. Senaryo (kim/hangi girdiyle/ne elde eder): v0.0.13'te RLS politikalarını elle yazan geliştirici fonksiyon gövdesine Türkçe bir blok yorum (`tenant'in`) koyuyor ve aynı dosyada bir kolonu `DROP COLUMN` ile kaldırıyor; expand/contract bekçisi (CLAUDE.md §10.10) yeşil veriyor, yıkıcı migration PR'dan geçip üretime çıkıyor → veri kaybı ve platform rollback'inin şema rollback'i gerektirmesi. Blast radius SINIRLI: maske yalnızca yıkıcı tarama girdisinde (satır 372) kullanılıyor, ad/gövde çıkarımı maskesiz `sql` üzerinde koşuyor → tenant_id/taksonomi kuralları ETKİLENMİYOR (J1 ampirik: aynı dosyada `UNCLASSIFIED_TABLE` hâlâ üretiliyor), bu yüzden `critical` DEĞİL. `high` gerekçesi: tur 2 durumuna göre AÇIK bir gerileme (maskesiz hâl bu dosyaları yakalıyordu), mekanik bekçinin tek işi olan sahte-yeşil engelini kaybediyor ve tur 1'in aynı sınıf "güvence daralması" bulgusuyla simetrik. — Önerilen düzeltme: regex maskeleme yerine tek geçişli, DURUM TUTAN bir tarayıcı (tek tırnak + `$$` dolar-tırnak + `/* */` blok yorumu) ve FAIL-CLOSED davranış: literal kapanmamışsa/tırnak sayısı tekse maskeleme UYGULANMAZ, ham metin taranır VE ayrı bir `UNPARSABLE_SQL` ihlali üretilir. Geçici minimum: `(sql.match(/'/g) ?? []).length % 2 === 1` ise maskeyi atla + ihlal üret. — Sorumlu ajan: `db` (tarayıcıya promosyon: `architect`, v0.0.13 — R-C4 ile aynı iş)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:169,392-403 — "Ayna bekçisi" girdisi MASKELENMEMİŞ ve blok yorumu temizlenmemiş metin: `INSERT INTO "audit" VALUES ('CREATE TABLE x');` (A8) ve `/* CREATE TABLE audit (id text); */` (A8c) jeton sayısını şişirip YANLIŞ POZİTİF `UNPARSABLE_CREATE_TABLE` üretiyor (ampirik). `-- CREATE TABLE ...` satır yorumu TEMİZ (A8b: `[]`) çünkü `stripLineComments` bekçiden ÖNCE koşuyor. Fail-closed (süit kırmızı olur, sızıntı yok); risk, geliştiricinin kuralı gevşetme baskısı (CLAUDE.md §10.6). Bekçinin KENDİSİ atlatılamıyor: `nameCount ≤ tokenCount` yapısal olarak garanti (I7 ampirik: `CREATE TABLE "a1"` + `CREATE TABLE a2` → bekçi ateşliyor), `CREATE TABLE"invoice"` (boşluksuz) da yakalanıyor (I1). — Önerilen düzeltme: bekçi ve ad/gövde çıkarımı da maskelenmiş + blok yorumu temizlenmiş metin üzerinde koşsun (tek normalizasyon hattı, bulgu 1'in tarayıcısıyla aynı iş). — Sorumlu ajan: `db`
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:196 — D1 düzeltmesi (`[\s\S]*?` → `[^;]*?`) yutmayı kapattı ama YENİ bir yanlış pozitif doğurdu: gövdesinde noktalı virgül taşıyan KANONİK bir `CREATE TABLE` artık ayrıştırılamıyor → `UNPARSABLE_CREATE_TABLE`. Ampirik: `"note" TEXT NOT NULL DEFAULT 'a;b'` (D1b) ve `CONSTRAINT "c" CHECK ("id" <> ';')` (D1c) ikisi de ihlal üretiyor; Prisma bu biçimi emit etmiyor ama v0.0.13'ün elle yazılacak SQL'i (CHECK kısıtı, varsayılan değer) üretebilir. Fail-closed. — Önerilen düzeltme: gövde taramasını `;` yasağı yerine parantez dengesi veya tırnak-duyarlı ifade bölmesiyle sınırla (bulgu 1'in tarayıcısıyla birlikte). — Sorumlu ajan: `db`
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:169 — Ayna bekçisinin kör noktası: `CREATE\s+TABLE\b` jetonuna UYMAYAN ama geçerli Postgres olan biçimler HEM ad deseninden HEM bekçiden kaçıyor, yani SESSİZCE geçiyor (fail-open). Ampirik `[]`: `CREATE UNLOGGED TABLE "invoice" (...)` (I2), `CREATE UNLOGGED TABLE invoice (...)` (I3), `CREATE/* c */TABLE invoice (...)` (I4), `CREATE /* c */ TABLE "invoice" (...)` (I5). `low` gerekçesi: tenant tablosunun `UNLOGGED` yazılması veya `CREATE` ile `TABLE` arasına blok yorum konması somut senaryo kurmak için fazla egzotik; gerileme de değil (bekçi bu turda YENİ eklendi, kapsamı daralmadı). — Önerilen düzeltme: jeton desenini `CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+|GLOBAL\s+|LOCAL\s+)*TABLE\b` yap ve blok yorumlarını normalizasyonda temizle; ya da v0.0.13 şema linter'ının açık sınırı olarak ROADMAP borcuna yaz. — Sorumlu ajan: `db`
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:115-123 — `stripLineComments` string-literal sınırı: `UPDATE "tenant" SET "note" = '--'; DROP TABLE "app_user";` hâlâ ihlal üretmiyor. **BİLİNÇLİ OLARAK BORÇTA** (R-C4, sorumlu `architect`, vade v0.0.13); `db` bu turda "kapanmadı" beyan etti, doğrulandı — fonksiyon DEĞİŞMEMİŞ. Bu turda önemi ARTTI: bulgu 1'in C3 yolu, yorum temizliğinin bir literali kesmesinin artık yalnızca yorum kaçırmakla kalmayıp maskeleme üzerinden GERÇEK bir `DROP`'u gizlediğini gösteriyor → R-C4 ile bulgu 1 AYNI tarayıcıda çözülmeli. Şişirilmedi; kaydın sürekliliği + yeni bağlam notu için tekrar edildi. — Önerilen düzeltme: bulgu 1 ile tek iş olarak ele al. — Sorumlu ajan: `architect` (v0.0.13)
ÖLÇÜMLER:
  - Denenen vektör: 73 (63 ampirik prob + 10 statik/konfig kontrolü) — A anahtar kelime biçimi (14), B maskeleme yanlış pozitifi (9), C maskeleme atlatma/fail-open (7), D gövde çapası (4), E `assertSafeEntryName` (11), F `rootSymlinks` + `rmSync` symlink izleme (7), G gerçek repo (3), I ayna bekçisi boşlukları (7), J maske kapsamı (1), H statik (10)
  - İncelenen dosya: 6 (`migration-set.ts`, `migration-set-fixture.ts`, `tenancy.ts`, gerçek `20261026082729_init/migration.sql`, tur 2 raporu, `AGENT_BASELINE.md`)
  - Tur 2 bulgu kapanışı: **medium (harf duyarlılığı) KAPANDI** · **low-C (`'Drop Shipping'`) KAPANDI** (yanlış pozitif gitti — ama bulgu 1'i doğurdu) · **low-D1 KAPANDI** (atıf doğru) · **low-D2 KAPANDI** · **low-R-C4 BORÇTA** (beklendiği gibi, `db` beyanı doğrulandı)
  - Yeni bulgu dağılımı: critical 0 · high 1 · medium 0 · low 4 (1'i devralınan borç kaydı)
  - Tenant izolasyon listesi (CLAUDE.md §7): karşılanmayan madde YOK — yeni tablo/kolon/endpoint/prosedür/kuyruk işi/önek/anahtar yok; 14 madde yapısal olarak N/A. 1-3. maddelerin MEKANİK BEKÇİSİ bu değişikliğin konusu ve o yönde (tenant_id/taksonomi) bu turda gerileme YOK (J1)
  - `rootSymlinks` (yeni yüzey): **TEMİZ, `critical` yok** — bağ adı VE hedef adı `assertSafeEntryName`'den geçiyor (satır 168-169), hedef her zaman `join(root, ...)` → kök içi; kaçış denemeleri (`../escape-link`, `../../etc`, `..`, `.`) RED; `rmSync(root, {recursive, force})` sembolik bağı İZLEMİYOR (F3 ampirik: kök dışındaki kurban dizin VE dosya `rmSync` sonrası hâlâ var) → veri kaybı yolu YOK
  - Sıralama analizi: `stripLineComments` → (ayna bekçisi + ad + gövde: MASKESİZ) ve `stripLineComments` → `maskSingleQuotedStringLiterals` → (yalnızca yıkıcı tarama). Maske 2 yerde geçiyor (tanım + tek çağrı). Bu asimetri bulgu 1 (fail-open) ve bulgu 2 (fail-closed) olarak kayıtlı
  - Gerçek repo: `20261026082729_init` tek dizin, gerçek taksonomiyle **0 ihlal**; dosyada tek-tırnak sayısı **26 (çift)** → bulgu 1 bugün TETİKLENMİYOR, tetikleyici v0.0.13'ün elle yazılmış SQL'i
  - `pnpm audit`: KOŞTURULMADI (Orkestratör talimatı + doğrulama) — `git diff HEAD --name-only -- pnpm-lock.yaml package.json '**/package.json'` **BOŞ**; yeni dosyalar yalnızca `node:fs/os/path/url` kullanıyor (H: 7 import, hepsi `node:`). Tur 1/2 sonucu geçerli
  - Bozulmamış kontroller (yeniden denetlenmedi, yalnızca teyit): `rmSync` hedefi = `mkdtempSync` dönüşü ✓ · `try/finally` ✓ · R5 yalnızca `node:` ✓ · K-C4 `vitest`/`expect` yok ✓ · K-C8 muafiyet jetonu yok ✓ · sır/PII/`any`/DB erişimi yok ✓ · `tmpdir()`'de `arkesoft-*` artığı `[]` ✓
  - FAIL kuralı (AGENT_BASELINE §4): en az bir `high` → **FAIL**
```

---

## 1. Tur 2 bulgularının kapanışı — kendi kanıtımla

Tüm sonuçlar `scratchpad/probe3.ts` + `probe3b.ts` ile, gerçek yardımcıların mutlak yoldan
dinamik import'u üzerinden (`node --experimental-strip-types`) üretildi. `db`/Orkestratör
beyanı kabul edilmedi.

### 1.1 `medium` — anahtar kelime biçimi → **KAPANDI**

Tur 2'de ölçtüğüm altı biçimin **hepsi** artık ihlal üretiyor (hiçbiri `[]` değil):

```
A1 kucuk harf  create table "invoice"  -> ["UNCLASSIFIED_TABLE:invoice"]   <- tur2'de []
A2 karisik     Create Table "invoice"  -> ["UNCLASSIFIED_TABLE:invoice"]   <- tur2'de []
A3 cift bosluk CREATE  TABLE "invoice" -> ["UNCLASSIFIED_TABLE:invoice"]   <- tur2'de []
A4 IF NOT EXISTS                       -> ["UNCLASSIFIED_TABLE:invoice"]   <- tur2'de []
A5 sema oneki  public."invoice"        -> ["UNCLASSIFIED_TABLE:invoice"]   <- tur2'de []
A5b tirnakli sema "p"."invoice"        -> ["UNCLASSIFIED_TABLE:invoice"]
A6 CREATE\nTABLE                       -> ["UNCLASSIFIED_TABLE:invoice"]   <- tur2'de []
A7 TIRNAKSIZ ad (ayna bekcisi)         -> ["UNPARSABLE_CREATE_TABLE"]      <- tur2'de []
A9  kanonik (TERS YON)                 -> []                               (sıkı kontrol korundu)
A9b kucuk harf kanonik, tenant_id yok  -> ["MISSING_TENANT_ID_COLUMN:invoice", ...]
```

Ters yön korundu: kanonik biçim yanlış pozitif üretmiyor (A9), gövde gerektiren kurallar
küçük harfli kanonik girdide de ateşliyor (A9b), gerçek repo migration'ı 0 ihlal (G).

**Ayna bekçisi atlatılabilir mi?** Yapısal olarak `nameCount ≤ tokenCount` (her ad eşleşmesi
bir `CREATE TABLE` jetonu tüketir, eşleşmeler örtüşmez) → "ad sayısını şişirip jeton sayısını
gizleme" yolu YOK (I7 ampirik olarak teyit: karışık dosyada bekçi ateşliyor). Bulduğum iki
kusur ters yönde: yorumda/string'de geçen `CREATE TABLE` sayacı **şişiriyor** → yanlış pozitif
(bulgu 2, çünkü maskeleme/blok yorum temizliği bekçiden ÖNCE koşmuyor — `--` satır yorumu
koşuyor, A8b temiz), ve jeton desenine uymayan geçerli biçimler (`CREATE UNLOGGED TABLE`,
`CREATE/* c */TABLE`) bekçiye de görünmüyor (bulgu 4).

### 1.2 `low` C — `'Drop Shipping'` yanlış pozitifi → **KAPANDI, ama bulgu 1'i doğurdu**

```
B1 'Drop Shipping'        -> []                          <- tur2'de DESTRUCTIVE_STATEMENT
B2 'drop shipping'        -> []                          <- tur2'de DESTRUCTIVE_STATEMENT
B3 DEFAULT 'set not null' -> []                          <- tur2'de DESTRUCTIVE_STATEMENT
B4 GERCEK DROP COLUMN     -> ["DESTRUCTIVE_STATEMENT"]   (korundu)
B5 GERCEK SET NOT NULL    -> ["DESTRUCTIVE_STATEMENT"]   (korundu)
B6 GERCEK DROP TABLE      -> ["DESTRUCTIVE_STATEMENT"]   (korundu)
B7 ENABLE ROW LEVEL SECURITY + CREATE POLICY (v0.0.13)  -> []   (temiz)
B8 kacisli 'it''s' + DROP -> ["DESTRUCTIVE_STATEMENT"]   ('' kaçışı doğru ele alınmış)
B9 'a\'b' + DROP          -> ["DESTRUCTIVE_STATEMENT"]   (ters-bölü kaçışı sorun değil)
```

**Maskeleme atlatılabilir mi? EVET — en önemli yeni vektör gerçekleşti** (bulgu 1):

```
C1 "o'brien" tanimlayici + DROP COLUMN + sonraki literal -> []   (DROP GİZLENDİ)
C2 $$...$$ icinde /* tenant'in */ + DROP COLUMN          -> []   (DROP GİZLENDİ)
C2-kontrol (apostrof kaldirildi)                         -> ["DESTRUCTIVE_STATEMENT"]
C3 'Pro -- en iyi' (strip literali kesiyor) + DROP       -> []   (DROP GİZLENDİ)
C3-kontrol (-- kaldirildi)                               -> ["DESTRUCTIVE_STATEMENT"]
C4 tek tirnak DROP'tan SONRA                             -> ["DESTRUCTIVE_STATEMENT"]
C5 kapanmayan literal ('x); ) + DROP                     -> []   (DROP GİZLENDİ)
J1 maske kapsami: ad/taksonomi kurallari etkilenmiyor    -> ["DESTRUCTIVE_STATEMENT","UNCLASSIFIED_TABLE:invoice"]
```

Kontrol çiftleri (C2/C2-kontrol, C3/C3-kontrol) gerilemeyi **izole ediyor**: aynı yıkıcı
ifade, tek fark dosyanın başka bir yerindeki bir apostrof veya bir `--`.

### 1.3 `low` D1 — gövde çapası → **KAPANDI** (yeni yanlış pozitifle)

```
D1  a tek satir + invoice kanonik -> ["UNPARSABLE_CREATE_TABLE:a","MISSING_TENANT_ID_COLUMN:invoice"]
```

Tur 2'de tek sonuç `UNPARSABLE_CREATE_TABLE:b` (yanlış tablo suçlanıyordu) idi; artık **doğru
tablo** (`a`) ayrıştırılamaz sayılıyor **ve** yutulan kanonik tablonun gerçek ihlali
(`MISSING_TENANT_ID_COLUMN:invoice`) görülüyor. Ters yönde D1b/D1c yeni yanlış pozitifi
doğurdu (bulgu 3), D1d kanonik tenant tablosu hâlâ temiz (`[]`).

### 1.4 `low` D2 — `.` kabulü → **KAPANDI** (atlatılamadı)

```
"." / ".." / "..." / "./"  -> RED
". ." / "%2e" / "%2e%2e" / ".<ZWSP>" / "<ZWSP>." / " . " / "a.b" -> KABUL
```

Kabul edilen adların hepsi **kök içinde gerçek birer dizin** (`okunan=[<ad>]`) — kökün
KENDİSİNE çözülen ve dolayısıyla hiçbir şey ölçmeden yeşil kalan sınıf kapandı; `%2e` dosya
sistemi düzeyinde literal bir ad, kaçış vektörü değil.

### 1.5 `low` R-C4 → **BORÇTA** (bkz. bulgu 5, önemi arttı)

---

## 2. Yeni yüzey

| Yüzey                                | Kanıt                                                                                                                                                                                          | Sonuç                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `rootSymlinks` hedefi kök içinde mi  | `symlinkSync(join(root, target), join(root, name), 'dir')`; ad VE hedef `assertSafeEntryName`'den geçiyor; `../escape-link`, `../../etc`, `..`, `.` → **RED**                                  | **TEMİZ**                                          |
| `rmSync` symlink izleyip siler mi    | Kök dışında kurban dizin + dosya kuruldu, köke dir-link ve file-link verildi, `rmSync(root,{recursive,force})` koştu → `kok silindi: true`, `kurban dosya var: true`, `kurban dizin var: true` | **TEMİZ — `critical` yok, veri kaybı yolu yok**    |
| `readMigrationSet` symlink davranışı | Fixture symlink'li kök → `okunan=["20261026000001_real"]` (bağ `isDirectory()` filtresiyle elenir, `existsSync` izlese de)                                                                     | Beklendiği gibi, sızıntı yok                       |
| Maske/yorum/bekçi **sıralaması**     | Bekçi + ad + gövde **maskesiz** metinde; maske **yalnızca** yıkıcı taramada (H: tek çağrı). `stripLineComments` her ikisinden önce → literali kesip sahipsiz tırnak üretebiliyor               | **Biri diğerinin girdisini bozuyor** → bulgu 1 + 2 |

---

## 3. Dokunulmazlık kanıtı

İki salt-okuma prob script'i scratchpad'de koştu; repo dosyalarına **yazılmadı**,
`git checkout`/`commit`/`push`/`gh` yazma komutu ve yıkıcı DB komutu **çalıştırılmadı**.

```
 M packages/db/src/__tests__/migration-sql.test.ts
?? .claude/workflow/reviews/T-004-qa-tur1.md
?? .claude/workflow/reviews/T-004-qa-tur2.md
?? .claude/workflow/reviews/T-004-security-tur1.md
?? .claude/workflow/reviews/T-004-security-tur2.md
?? .claude/workflow/reviews/T-004-solid-tur1.md
?? .claude/workflow/reviews/T-004-solid-tur2.md
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

(oturum başındaki durumla birebir aynı; bu rapor dosyası gate sözleşmesi gereği eklenir)
· `tmpdir()`'de `arkesoft-*` artığı: `[]` · kök dışı kurban artığı prob sonunda temizlendi

## 4. FAIL gerekçesi

`AGENT_BASELINE.md` §4: en az bir `high` → **FAIL**. Tur 2'nin `medium`'u ve üç `low`'u
kendi kanıtımla **kapandı**; ancak C düzeltmesi fail-closed bir yanlış pozitifi
**fail-open bir sahte-yeşile** çevirdi (bulgu 1) — bu, mekanik bekçinin varlık nedeniyle
doğrudan çelişiyor ve tur 2'ye göre gerilemedir. Düzeltme, R-C4 ile **tek iş** olarak
(durum tutan tarayıcı + fail-closed davranış) ele alınmalı; kalan dört `low` teknik borca
(bulgu 2-4: `db`, v0.0.13 şema linter'ı; bulgu 5: `architect`, R-C4) kaydedilmeli.

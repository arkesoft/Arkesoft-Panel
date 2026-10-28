# T-004 — security gate, tur 6 (çok dar: tek soru — `high` kapandı mı?)

**İLK SATIR CEVABI: `high` KAPANDI.** Tur 5'te raporladığım **14 kaçış vektörünün
14'ü de** artık `DESTRUCTIVE_STATEMENT` üretiyor (14/14). Maskeleme makinesi
kaldırıldığı için yutma mekanizması **yok**; kaldırma işlemi **yeni bir fail-open
doğurmadı** (ayna bekçisi yalnızca fail-closed yanlış pozitif açtı, ampirik).

Tarih: 2026-10-28 · Dal: `main` · İlgili sürüm: **v0.0.13 önkoşulu** (T2-1 kapanışı)
Versiyon etkisi: `patch` · Kapsam: `packages/db/src/__tests__/helpers/migration-set.ts`
Önceki turlar: tur1 FAIL (1 high + 4 low) · tur2 PASS · tur3 FAIL · tur4 FAIL ·
tur5 **FAIL** (14 kaçış) · **tur6 PASS**

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:234-235,492-501 — `db`'nin BEYAN ETTİĞİ 1. BOŞLUK TEYİT EDİLDİ: yıkıcı jeton taraması artık harf duyarlı ve tek boşluğa bağlı (`includes('DROP ')` / `includes('SET NOT NULL')`), FIX 1'in C1 normalizasyonu geri alındı. Dokuz ampirik kaçış: `drop column` (N02) · `Drop Column` (N03) · `DROP\nCOLUMN` (N05) · `DROP\tCOLUMN` (N06) · `SET  NOT NULL` çift boşluk (N08) · `SET NOT  NULL` (N09) · `SET NOT\nNULL` (N10) · `set not null` (N11) · dosya sonunda sondaki boşluksuz `DROP` (N15). Saldırı senaryosu: v0.0.13'ün elle yazılacak RLS migration'ında geliştirici `alter table "invoice" drop column "legacy_note";` satırını küçük harfle yazarsa expand/contract bekçisi yeşil verir ve yıkıcı migration PR'dan geçer → veri kaybı. YÜZEY ÖLÇÜMÜ (talep edilen karşılaştırma): bu yüzey tur 5'in 14 kaçışından **yapısal olarak çok daha dar**. (a) 14 kaçışta yıkıcı ifadenin KENDİSİ kusursuzdu — kanonik, BÜYÜK harfli, tek boşluklu `ALTER TABLE ... DROP COLUMN ...;`; yutulmasının nedeni dosyanın BAŞKA bir yerindeki ilgisiz bir apostroftu (`/* tenant'in */` gibi bir Türkçe yorum). Yani tetikleyici ifadenin dışındaydı, inceleyen insanın gözüne GÖRÜNMÜYORDU ve sapma gerektirmiyordu. (b) Kalan boşlukta sapma yıkıcı jetonun İÇİNDE olmak zorunda — kaçış için geliştiricinin DDL'i kanonik olmayan biçimde yazması gerekir; diff'i okuyan insan küçük harfli `drop column`'u AYNI SATIRDA görür. (c) Prisma'nın kendi emit'i her zaman BÜYÜK harf + tek boşluk: gerçek repo migration'ında küçük harfli `drop `/`set not null` geçişi **0** (ölçüldü); 21 DDL anahtar sözcüğünün tamamı kanonik. (d) 14 vektörün 14'ünde jeton kanonikti → bugün 14/14 yakalanıyor. — Önerilen düzeltme: AYRI YAMA YAPMA (dördüncü sezgisel = dördüncü atlatma). Tek birleşik borç kalemi R-D1'e (aşağıda) gir; o tarayıcı normalizasyonu doğru katmanda yapar. — Sorumlu ajan: `architect` (v0.0.13, R-D1)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:514-525 — `db`'nin BEYAN ETTİĞİ 2. BOŞLUK TEYİT EDİLDİ ve FAIL-OPEN OLMADIĞI KANITLANDI: ayna bekçisi artık maskelenmemiş `stripLineComments` çıktısında sayıyor; dize literali içindeki sahte jeton yeniden yanlış pozitif üretiyor. Ampirik: `VALUES ('CREATE TABLE x')` → `["UNPARSABLE_CREATE_TABLE"]` (MG1, sahte kırmızı) · `VALUES ('CREATE TABLE "zzz"')` → `["UNPARSABLE_CREATE_TABLE:zzz"]` (MG2) · sahte + gerçek tırnaksız tablo → iki ihlal, gerçek olan HÂLÂ görünüyor (MG3) · sahte jetonun gerçek bir tenant tablosunun "yaratılmış" görünmesini sağlayıp `MISSING_TENANT_SCOPED_TABLE`'ı susturması denendi → `UNPARSABLE_CREATE_TABLE:invoice` + `MISSING_TENANT_ID_LEADING_UNIQUE_INDEX` ile YİNE kırmızı (MG4) · sahte jeton + gerçek `DROP TABLE` → `DESTRUCTIVE_STATEMENT` yutulmuyor (MG5). Yapısal gerekçe: ad deseni (`extractCreatedTableNames`) her eşleşmesi için jeton deseninin de (`CREATE_TABLE_TOKEN_PATTERN`) eşleşmesini gerektirir, yani `nameCount` `tokenCount`'u ASLA aşamaz → `tokenCount > nameCount` kapısı yalnızca gürültü yönünde kayar. Sonuç: beklenen davranış birebir gerçekleşti, **yalnızca fail-closed**. — Önerilen düzeltme: R-D1'e gir (tarayıcı literalleri tanıyınca bu yanlış pozitif de kendiliğinden kapanır). — Sorumlu ajan: `architect` (v0.0.13, R-D1)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:210-218,249-252 — BORÇTA, YENİDEN DENETLENMEDİ (Orkestratör talimatı): R-C4 (`stripLineComments`'in dize sınırını kaçırması — `SET "note" = '--'; DROP TABLE "x";` tek satırda, ampirik olarak hâlâ kaçıyor: N16 → `[]`) ve `CREATE/* yorum */TABLE`. İkisi de kullanıcı kararıyla v0.0.13'e gitti, bilinen ve belgeli. Tek yeni not: `stripLineComments` artık yıkıcı taramanın ÖNÜNDEKİ TEK normalizasyon katmanı olduğu için R-C4'ün ağırlığı arttı (eskiden maskeleme ikinci bir katmandı — gerçi o katman kendisi fail-open'dı, yani net güvenlik bakiyesi POZİTİF). — Önerilen düzeltme: R-D1'e gir. — Sorumlu ajan: `architect` (v0.0.13, R-D1)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:234-235 — YENİ YÜZEY TARAMASINDA ÇIKAN, HEAD'DEN DEVRALINAN KAPSAM BOŞLUĞU (tur 5'in regex'inde de YOKTU, yani kaldırmanın ürünü DEĞİL): yıkıcı ifade taksonomisi yalnızca iki jeton tanıyor. CLAUDE.md §10.10'un saydığı "NOT NULL ekleme" biçimlerinden `ALTER TABLE "t" ADD COLUMN "c" TEXT NOT NULL` (N19) kapsam dışı; ayrıca `TRUNCATE TABLE` (N20) ve `ALTER TABLE ... RENAME COLUMN` (N21) de kapsam dışı — üçü de ampirik olarak `[]`. Somut senaryo: geliştirici tek adımda `ADD COLUMN ... NOT NULL` ekler (expand/contract'ın tam olarak yasakladığı şey), bekçi yeşil verir, migration mevcut satırlarda patlar → üretimde başarısız dağıtım. `critical`/`high` DEĞİL çünkü bu bir sızıntı/atlatma değil, bekçinin hiç iddia etmediği bir kapsam; ve T2-1'in mandası değil. — Önerilen düzeltme: R-D1'e gir (tarayıcı ifade seviyesinde çalışınca taksonomi genişletmek ucuz olur). — Sorumlu ajan: `architect` (v0.0.13, R-D1)
ÖLÇÜMLER:
  - **`high` KAPANDI MI: EVET.** 14 vektörün sonucu: **14/14 YAKALANDI** (`["DESTRUCTIVE_STATEMENT"]`). Kaçan: 0. F-A1 ✓ F-B1 ✓ F-B3 ✓ F-C1 ✓ F-C2 ✓ F-C3 ✓ F-D1 ✓ F-D2 ✓ F-E1 ✓ F-F1 ✓ F-G3 ✓ F-G4 ✓ F-I1 ✓ F-J1 ✓ — üç sınıfın (i/ii/iii) tamamı kapandı, çünkü yutma MEKANİZMASI (maskeleme) artık yok
  - Kaldırma doğrulaması (kod içi ölçüm): `maskSingleQuotedStringLiterals` kod-satırı 0 (toplam 5, hepsi yorum) · `maskSingleQuotedStringLiteralsSafely` 0 (2) · `hasStringLiteralMatchSpanningStatementBoundary` 0 (1) · `SINGLE_QUOTED_STRING_LITERAL_PATTERN` 0 (1) · `countSingleQuoteCharacters` 0 (1) · `UNPARSABLE_SQL` 0 (6) · `maskedSql` 0. **Kural sayısı = 8** (union üyesi sayımı). Orkestratörün doğrulaması teyit edildi
  - **YENİ YÜZEY TARAMASI: 22 hücreli matris, 22/22 beklendiği gibi.** 8 yakalandı (kanonik `DROP COLUMN`, çift boşluklu `DROP  COLUMN`, `SET NOT NULL`, `DROP TABLE`, `DROP CONSTRAINT`, `DROP COLUMN IF EXISTS`, `DROP INDEX`, `DROP ...; -- yorum`), 14 kaçtı. Kaçan 14'ün dağılımı: **9** harf/boşluk sapması (bulgu 1, BEYAN EDİLDİ) · **1** R-C4 (bulgu 3, borçta) · **1** DOĞRU davranış (`-- DROP COLUMN` yorumu temizlendi, kaçış değil) · **3** hiç kapsanmamış ifade sınıfı (bulgu 4). **Kaldırmanın ürettiği BEYAN EDİLMEMİŞ yeni fail-open: YOK**
  - Ayna bekçisi fail-open probu: 5 vektör (MG1–MG5), **5/5 fail-CLOSED**. Hiçbiri bir ihlali susturmadı; `nameCount ≤ tokenCount` yapısal değişmezi gerekçelendirdi. Beklenen sonuç (yalnızca `VALUES ('CREATE TABLE x')` yanlış pozitifi) birebir gerçekleşti
  - Ters yön (regresyon) **9/9 TEMİZ**: `'Drop Shipping'` `[]` · `'drop shipping'` `[]` · `DEFAULT 'set not null'` `[]` · gerçek `DROP COLUMN` `[DESTRUCTIVE_STATEMENT]` · gerçek `SET NOT NULL` `[DESTRUCTIVE_STATEMENT]` · gerçek `DROP TABLE` `[DESTRUCTIVE_STATEMENT]` · `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` + `current_setting('app.tenant_id', TRUE)` `[]` · kanonik tenant tablosu + bileşik UNIQUE indeks `[]` · `'DROP SHIPPING'` (büyük harf) `[DESTRUCTIVE_STATEMENT]` — HEAD'in bilinen, bilinçli, test ile PİNLENMİŞ yanlış pozitifi (`migration-sql.test.ts:1002`), **bulgu yazılmadı**
  - **Gerçek repo KRİTİK kontrolü GEÇTİ:** `20261026082729_init` tek dizin, gerçek taksonomi (platform=2, tenant=1) → **sekiz kuralda 0 ihlal**. Apostrof 26, küçük harfli `drop `/`set not null` geçişi **0**. Yanlış pozitif gürültüsü yok, CI kırmızıya dönmüyor
  - Süit: `pnpm --filter @arkesoft/db test` → **5 dosya, 115 test, 115 geçti** (111 → 115, beyan edilen artış doğrulandı). Testi gevşetme yok; tur 5'in prob süiti "maskeleme kaldırıldı" başlığıyla korunmuş ve E6 dalı hâlâ pinli
  - Toplam prob: **52 çalıştırma** (14 vektör + 22 yüzey matrisi + 5 ayna bekçisi + 9 ters yön + 1 gerçek repo + 1 kaldırma ölçümü) — tek script, salt okuma
  - İncelenen dosya: 3 repo dosyası (`migration-set.ts` tam okuma · `migration-sql.test.ts` hedefli grep · gerçek `migration.sql` ampirik) + 1 önceki rapor (tur 5)
  - Tenant izolasyon listesi (CLAUDE.md §7): **karşılanmayan madde YOK.** Bu değişiklik yeni tablo/kolon/endpoint/prosedür/kuyruk işi/S3 öneki/önbellek anahtarı/süper admin yolu EKLEMİYOR; 14 madde yapısal olarak N/A. 1–3. maddelerin MEKANİK BEKÇİSİ bu değişikliğin konusu ve o yönde gerileme YOK (gerçek repo 0 ihlal + R8 kanonik probu teyit etti). `MISSING_TENANT_ID_COLUMN` / `TENANT_ID_ON_PLATFORM_TABLE` / `MISSING_TENANT_ID_LEADING_UNIQUE_INDEX` / `UNCLASSIFIED_TABLE` / `MISSING_TENANT_SCOPED_TABLE` kuralları kaldırmadan ETKİLENMEDİ
  - `pnpm audit`: KOŞTURULMADI (Orkestratör talimatı). `git diff --stat HEAD -- package.json pnpm-lock.yaml packages/db/package.json` **BOŞ** → yeni bağımlılık yok, tur 1/2/3 sonucu geçerli. Dosya yalnızca `node:fs/path/url` kullanıyor
  - Bozulmamış kontroller: sır/PII/kart verisi/token yok · `any`/`@ts-ignore` yok · K-C4 (`vitest`/`expect` import yok) · R5 (yalnızca `node:`) · enjeksiyon yüzeyi yok (dosya veritabanına dokunmaz, ham SQL ÜRETMEZ — yalnızca OKUR) · KVKK N/A (kişisel veri işlenmiyor) · oran sınırlama/SSRF/dosya yükleme N/A (uç nokta yok)
  - Yeni bulgu dağılımı: critical 0 · **high 0** · medium 0 · low 4
  - FAIL kuralı (AGENT_BASELINE §4): critical/high yok, medium < 3 → **PASS**. Dört `low` teknik borca kaydedilir
```

---

## 1. Belirleyici kanıt — 14/14

Tur 5'in üç kaçış sınıfının tamamı aynı tek nedene dayanıyordu: `maskSingleQuoted…`
maskesi yıkıcı ifadeyi **silerek** `includes`'ın göreceği metinden çıkarıyordu.
Maske gittiği için üç sınıfın da ön koşulu (çift sayıda sahipsiz tırnak, `;`'siz
aralık, son ifade) **anlamını yitirdi** — apostroflar artık metni değiştirmiyor.

```
id      TUR 5               TUR 6                       sınıf
F-A1    []                  ["DESTRUCTIVE_STATEMENT"]   (i)
F-F1    []                  ["DESTRUCTIVE_STATEMENT"]   (i)
F-J1    []                  ["DESTRUCTIVE_STATEMENT"]   (i)
F-B1    []                  ["DESTRUCTIVE_STATEMENT"]   (ii)
F-B3    []                  ["DESTRUCTIVE_STATEMENT"]   (ii)  gerçekçi RLS, q=4
F-E1    []                  ["DESTRUCTIVE_STATEMENT"]   (ii)
F-G3    []                  ["DESTRUCTIVE_STATEMENT"]   (ii)  DROP TABLE
F-G4    []                  ["DESTRUCTIVE_STATEMENT"]   (ii)  SET NOT NULL
F-I1    []                  ["DESTRUCTIVE_STATEMENT"]   (ii)
F-C1    []                  ["DESTRUCTIVE_STATEMENT"]   (iii) ; YOK
F-C2    []                  ["DESTRUCTIVE_STATEMENT"]   (iii) ; YOK
F-C3    []                  ["DESTRUCTIVE_STATEMENT"]   (iii) ; YOK
F-D1    []                  ["DESTRUCTIVE_STATEMENT"]   (iii)
F-D2    []                  ["DESTRUCTIVE_STATEMENT"]   (iii)
```

F-B3 (tur 5'in "gerçekçi v0.0.13 RLS migration'ı" senaryosu) artık yakalanıyor —
`;`siz aralık, blok yorumlar ve `current_setting('app.tenant_id', TRUE)` literali
hiçbir fark yaratmıyor.

## 2. Yeni yüzey — kaldırma fail-open doğurdu mu?

**Hayır.** 22 hücreli matris ve 5 ayna bekçisi probu, kaldırmanın ürettiği
**beyan edilmemiş** tek bir fail-open bile göstermiyor. İki kaldırma etkisi:

| Etki                                       | Yön                | Durum                         |
| ------------------------------------------ | ------------------ | ----------------------------- |
| Harf/boşluk duyarsızlığı (C1) geri alındı  | fail-OPEN daraltma | beyan edildi, low 1           |
| `UNPARSABLE_SQL` kaldırıldı                | nötr               | yalnızca maskeleme sinyaliydi |
| Ayna bekçisi maskelenmemiş metinde sayıyor | **fail-CLOSED**    | beyan edildi, low 2           |

Ayna bekçisinin fail-open olamamasının yapısal gerekçesi: `extractCreatedTableNames`
deseni (`CREATE\s+TABLE\s+…"ad"`) her eşleşmesinde `CREATE_TABLE_TOKEN_PATTERN`
(`CREATE\s+(mods)*TABLE\b`) de eşleşir → `nameCount ≤ tokenCount` her zaman. Bekçi
yalnızca `tokenCount > nameCount` olduğunda ihlal ürettiği için sayı şişmesi
**gürültü** yönünde, susturma yönünde değil (MG1–MG5 ampirik).

## 3. Kalan boşluklar — TEK birleşik borç kalemi

Tur 5'te önerdiğim gibi, dört low'un dördü **ayrı yama almamalı**; dördü de aynı
mekanizmanın (karakter seviyesi `includes`/regex, ifade farkındalığı olmayan tarama)
sonucu:

> **R-D1 — `architect`, v0.0.13: durum tutan tek geçişli migration SQL tarayıcısı.**
> Tek tırnak + `''` kaçışı + `$tag$` dolar-tırnak + `/* */` blok yorumu + `--` satır
> yorumu durumlarını tanıyan, ifade seviyesinde (`;`) bölen bir tarayıcı; dosya sonunda
> literal/yorum açık kalırsa fail-closed işaret. Üstünde çalışan yıkıcı ifade
> taksonomisi **normalize edilmiş jetonlar** üzerinde karar verir. Bu tek iş şunların
> **hepsini** kapatır: (1) harf/düzensiz boşluk boşluğu [low 1] · (2) ayna bekçisi
> yanlış pozitifi [low 2] · (3) R-C4 `stripLineComments` dize sınırı + `CREATE/* c */TABLE`
> [low 3] · (4) `ADD COLUMN … NOT NULL` / `TRUNCATE` / `RENAME` kapsam boşluğu [low 4].

Dördüncü bir sezgisel yama (ör. "jetonu büyük harfe çevir") **önermiyorum** — tur
3/4/5'te üç sezgisel denendi ve üçü de bir sonraki turda atlatıldı; ayrıca bu turda
kullanıcı kararıyla alınan netlik (HEAD semantiği + görünür borç) sezgisel bir yamanın
vereceği sahte güvenden daha sağlam.

## 4. Dokunulmazlık kanıtı

Tek salt-okuma prob script'i scratchpad'de koştu (`probe-tur6.ts`); repo dosyalarına
**yazılmadı**, `git checkout`/`commit`/`push`/`gh` yazma komutu ve yıkıcı DB komutu
**çalıştırılmadı**, `pnpm audit` **koşturulmadı** (talimat). `pnpm --filter @arkesoft/db test`
salt okuma (vitest run). Oturum sonu `git status --porcelain` tur 5 ile **birebir aynı**
(bu rapor dosyası gate sözleşmesi gereği eklenir):

```
 M packages/db/src/__tests__/migration-sql.test.ts
?? .claude/workflow/reviews/T-004-qa-tur{1,2,3,4}.md
?? .claude/workflow/reviews/T-004-security-tur{1,2,3,4,5}.md
?? .claude/workflow/reviews/T-004-solid-tur{1,2,3}.md
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

## 5. PASS gerekçesi

`AGENT_BASELINE.md` §4: critical/high yok, `medium` sayısı 0 (< 3) → **PASS**.
Dört `low` ROADMAP borç defterine **tek kalem (R-D1)** olarak girer. Tur 3'te
başlayan ve beş tur süren `high` zinciri **kapandı**.

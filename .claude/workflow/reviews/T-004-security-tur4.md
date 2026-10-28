# T-004 — security gate, tur 4 (dar: FIX 3 kapanış doğrulaması)

Tarih: 2026-10-28 · Dal: `main` · İlgili sürüm: **v0.0.13 önkoşulu** (T2-1 kapanışı)
Versiyon etkisi: `patch` · Kapsam: `packages/db/src/__tests__/helpers/` (2 dosya, çalışma zamanı kodu yok)
Önceki turlar: tur1 FAIL (1 high + 4 low) · tur2 PASS (1 medium + 4 low) · tur3 **FAIL** (1 high + 4 low)

```
GATE: security
SONUÇ: FAIL
BULGULAR:
  - [SEV: high] packages/db/src/__tests__/helpers/migration-set.ts:248-256 — TUR 3'ÜN `high`'I KAPANMADI (gerileme DEĞİL, aynı bulgunun daralmış tetikleyicisi). `maskSingleQuotedStringLiteralsSafely()` fail-closed kararını YALNIZCA "tek tırnak sayısı TEK" koşuluna bağlıyor; oysa fail-open'ın asıl nedeni tırnak sayısının tekliği değil, SAHİPSİZ (literal açmayan) tırnakların ÇİFTLER hâlinde eşlenmesidir. ÇİFT sayıda sahipsiz tırnak üretmek maskeyi hâlâ ifade sınırının ötesine taşıyor, `maskingSkipped=false` kalıyor, `UNPARSABLE_SQL` ÜRETİLMİYOR ve aradaki gerçek `DROP COLUMN`/`DROP TABLE`/`SET NOT NULL` SESSİZCE yutuluyor → süit yeşil. Yedi bağımsız yol ampirik olarak doğrulandı, hepsi `[]` ve her birinin kontrol çifti (yalnızca apostroflar kaldırılmış aynı dosya) `["DESTRUCTIVE_STATEMENT"]` üretiyor: (E1) iki çift tırnaklı tanımlayıcı apostrofu `ALTER TABLE "o'brien" DROP COLUMN "x"; ALTER TABLE "d'arcy" ADD COLUMN "y" TEXT;` · (E2) `/* a'b */ DROP TABLE "x"; /* c'd */` · (E2b) iki Türkçe blok yorumu arasında `DROP COLUMN` · (E3) `stripLineComments`'in İKİ literali kesmesi (`VALUES ('Pro -- en iyi'); … DROP COLUMN …; VALUES ('Lite -- ucuz');`) · (E4) `$$ a'b $$ DROP COLUMN $$ c'd $$` · (E4b) iki plpgsql gövdesinde apostrof + aradaki `DROP COLUMN` · (E6) aynı yol `SET NOT NULL` için de açık. SOMUT SENARYO (kim/hangi girdiyle/ne elde eder): v0.0.13'ün RLS migration'ını elle yazan geliştirici dosyaya iki Türkçe blok yorum koyuyor (`tenant'in oturum değişkeni`, `musteri'nin talebi`) ve `current_setting('app.tenant_id', TRUE)` literalini kullanıyor → dosyada 4 tırnak (ÇİFT), ortadaki `ALTER TABLE "app_user" DROP COLUMN "legacy_note";` maskenin İKİNCİ çiftine düşüyor; ampirik sonuç `[]` (kontrol: apostroflar kaldırılınca `["DESTRUCTIVE_STATEMENT"]`). Expand/contract bekçisi (CLAUDE.md §10.10) yeşil veriyor, yıkıcı migration PR'dan geçip üretime çıkıyor → VERİ KAYBI ve platform rollback'inin şema rollback'i gerektirmesi. Tetikleyici tur 3'e göre daha ZOR (sahipsiz tırnak sayısının çift olması gerekiyor) ama gerçekçi SQL'de bu tesadüfi: her Türkçe apostrof, her `$$` gövdesindeki kesme işareti, kesilen her literal bir sahipsiz tırnak üretir ve sayı %50 olasılıkla çift. Blast radius tur 3 ile aynı: maske yalnızca yıkıcı tarama + ayna bekçisi girdisinde; tenant_id/taksonomi kuralları ETKİLENMİYOR (bkz. ölçümler) → `critical` DEĞİL. — Önerilen düzeltme: sayım tabanlı sezgiselden VAZGEÇ; `maskSingleQuotedStringLiteralsSafely` tek geçişli, DURUM TUTAN bir tarayıcıya dönsün (tek tırnak + `''` kaçışı + `$$…$$` dolar-tırnak + `/* */` blok yorumu) ve literal açılmış hâlde dosya sonuna gelinirse `UNPARSABLE_SQL` üretsin. Sayımla devam edilecekse geçici minimum: maskelenen her eşleşmenin `;` İÇERMEMESİ şart koşulsun — `;` içeren bir maske eşleşmesi ifade sınırını aşmış demektir → maskeleme atlanır + `UNPARSABLE_SQL`. (Bu tek satırlık kontrol yukarıdaki yedi yolu da, tur 3'ün dördünü de kapatır; `'Drop Shipping'`/`DEFAULT 'set not null'` yanlış pozitif kapanışını BOZMAZ, `DEFAULT 'a;b'` dışında — o da fail-closed.) — Sorumlu ajan: `db` (tarayıcıya promosyon: `architect`, v0.0.13 — R-C4 ile aynı iş)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:552-563 — Ayna bekçisinin BLOK YORUMU kör noktası: `/* CREATE TABLE audit (id text); */` hâlâ `tokenCount`'u şişirip YANLIŞ POZİTİF `UNPARSABLE_CREATE_TABLE` üretiyor (A8c ampirik). **BİLİNÇLİ OLARAK BORÇTA** — kodda R-C4'ün kardeşi olarak yorumla işaretli (satır 549-551). Fail-closed (süit kırmızı olur, sızıntı yok). Dize literali yolu (A8) KAPANDI. Şişirilmedi; kaydın sürekliliği için tekrar edildi. — Önerilen düzeltme: blok yorum temizliğini bulgu 1'in tarayıcısıyla TEK iş olarak ele al. — Sorumlu ajan: `architect` (v0.0.13, R-C4 ile)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:278-279 — Ayna bekçisinin kalan kör noktası: `CREATE/* c */TABLE invoice (...)` hem ad deseninden HEM bekçiden kaçıyor → `[]` (I4 ampirik, FAIL-OPEN). `UNLOGGED`/`TEMP`/`TEMPORARY` biçimleri KAPANDI. Kodda kasıtlı dışarıda bırakıldığı yorumla belgeli. Egzotik senaryo (geliştirici `CREATE` ile `TABLE` arasına blok yorum koymaz), gerileme değil. — Önerilen düzeltme: bulgu 2 ile aynı normalizasyon hattında çöz veya ROADMAP borcu olarak bırak. — Sorumlu ajan: `architect` (v0.0.13, R-C4 ile)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:157-165 — `stripLineComments` string-literal sınırı (R-C4) DEĞİŞMEDİ, **BORÇTA** (sorumlu `architect`, vade v0.0.13); teyit edildi. Yan etki: `UPDATE "tenant" SET "note" = '--'; DROP TABLE "app_user";` artık `["UNPARSABLE_SQL"]` üretiyor (tur 3'te `[]`) — strip literali kesiyor, kalan tek tırnak FIX 3'ün tekil sayı kapısını tetikliyor. Yani bu TEK girdi için davranış fail-closed'a döndü, ama bulgu 1'in E3 yolu aynı mekanizmanın ÇİFT sayıda tekrarının hâlâ fail-open olduğunu gösteriyor → R-C4 ile bulgu 1 AYNI tarayıcıda çözülmeli. — Önerilen düzeltme: bulgu 1 ile tek iş. — Sorumlu ajan: `architect` (v0.0.13)
ÖLÇÜMLER:
  - Denenen vektör: 38 (36 ampirik prob + 2 statik/git kontrolü) — tur 3 high'ın dört yolu (4), ÇİFT-tırnak atlatma + kontrol grupları (12), ters yön/regresyon (7), ayna bekçisi (9), D1 çapası (5), R-C4 (1)
  - İncelenen dosya: 4 (`migration-set.ts`, `migration-set-fixture.ts`, gerçek `20261026082729_init/migration.sql`, tur 3 raporu)
  - **ÇİFT-TIRNAK ATLATMA DENEMESİ: BAŞARILI (7/7 yol).** FIX 3 fail-closed DEĞİL — yalnızca TEK-SAYI vakasını kapattı. Bu turun belirleyici ölçümü; `high` KAPANMADI
  - Tur 3 high'ın dört yolu: **C2 ✓ C3 ✓ C1 ✓ C5 ✓** — dördü de artık `["UNPARSABLE_SQL","DESTRUCTIVE_STATEMENT"]` üretiyor (tur 3'te dördü de `[]`). FIX 3 ölçülen dört yolu kapattı; ölçülmeyen sınıfı kapatmadı
  - Tur 3 bulgu kapanışı: **high KAPANMADI** (yalnızca tetikleyicisi daraldı) · **low ayna bekçisi KISMEN** (A8 dize literali KAPANDI, A8c blok yorumu BORÇTA) · **low D1 KAPANDI** (`DEFAULT 'a;b'` ve `CHECK ("id" <> ';')` artık ayrıştırılıyor → yalnızca `UNCLASSIFIED_TABLE`; yutma önleme KORUNUYOR: taksonomide sınıflı `a` + kanonik `invoice` → `["UNPARSABLE_CREATE_TABLE:a","MISSING_TENANT_ID_COLUMN:invoice", …]`) · **low bekçi kör noktası KISMEN** (`UNLOGGED`/`TEMP`/`TEMPORARY` KAPANDI; `CREATE/* c */TABLE` BORÇTA) · **low R-C4 BORÇTA** (beyan doğrulandı)
  - Ters yön (regresyon) TEMİZ: `'Drop Shipping'` `[]` · `'drop shipping'` `[]` · `DEFAULT 'set not null'` `[]` · gerçek `DROP COLUMN` `[DESTRUCTIVE_STATEMENT]` · gerçek `SET NOT NULL` `[DESTRUCTIVE_STATEMENT]` · gerçek `DROP TABLE` `[DESTRUCTIVE_STATEMENT]` · `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` `[]` · kanonik tenant tablosu `[]`
  - Gerçek repo: `20261026082729_init` tek dizin, tırnak sayısı **26 (ÇİFT)** → `UNPARSABLE_SQL` ÜRETMİYOR; gerçek taksonomiyle **0 ihlal**. Yanlış pozitif gürültüsü yok
  - Yeni bulgu dağılımı: critical 0 · high 1 (kapanmamış, devralınan) · medium 0 · low 3 (hepsi bilinçli borç)
  - Tenant izolasyon listesi (CLAUDE.md §7): karşılanmayan madde YOK — yeni tablo/kolon/endpoint/prosedür/kuyruk işi/önek/anahtar yok; 14 madde yapısal olarak N/A. 1-3. maddelerin MEKANİK BEKÇİSİ bu değişikliğin konusu; o yönde (tenant_id/taksonomi/bileşik indeks) bu turda gerileme YOK — D1d, D1 ve gerçek repo probları teyit etti
  - `pnpm audit`: KOŞTURULMADI (Orkestratör talimatı) — `git status --porcelain` çıktısında `package.json`/`pnpm-lock.yaml` değişikliği YOK, yeni dosyalar yalnızca `node:fs/path/url` kullanıyor. Tur 1/2/3 sonucu geçerli
  - Bozulmamış kontroller (yeniden denetlenmedi, yalnızca teyit): `rootSymlinks`/`rmSync` (dosya diff'i bu alana dokunmadı) ✓ · R5 yalnızca `node:` ✓ · K-C4 `vitest`/`expect` yok ✓ · K-C8 muafiyet jetonu yok ✓ · sır/PII/`any` yok ✓
  - FAIL kuralı (AGENT_BASELINE §4): en az bir `high` → **FAIL**
```

---

## 1. Belirleyici kanıt — ÇİFT sayıda sahipsiz tırnakla atlatma

Tetikleyici `countSingleQuoteCharacters(sql) % 2 === 1`. Ama fail-open'ın mekanizması
tırnak sayısının TEKLİĞİ değil; `/'(?:[^']|'')*'/g` deseninin tırnakları **sırayla
çiftlemesi**. Sahipsiz tırnak sayısı ÇİFT olduğunda kapı hiç açılmıyor, maske yine
ifade sınırını aşıyor.

```
E1   ALTER TABLE "o'brien" DROP COLUMN "x"; ALTER TABLE "d'arcy" ADD COLUMN "y" TEXT;  q=2 -> []
E2   /* a'b */ DROP TABLE "x"; /* c'd */                                                q=2 -> []
E2b  iki Türkçe blok yorum arasında DROP COLUMN                                         q=2 -> []
E3   VALUES ('Pro -- en iyi'); + DROP COLUMN + VALUES ('Lite -- ucuz');                 q=4 -> []
E4   $$ a'b $$ DROP COLUMN $$ c'd $$                                                    q=2 -> []
E4b  iki plpgsql gövdesinde apostrof + aradaki DROP COLUMN                              q=2 -> []
E6   "o'brien" … SET NOT NULL; … "d'arcy" ADD COLUMN                                    q=2 -> []

kontrol grupları (yalnızca apostroflar kaldırıldı):
E1-ktrl / E2-ktrl / E4-ktrl                                                             q=0 -> ["DESTRUCTIVE_STATEMENT"]
```

Maske çıktısı (`~` = boşlukla maskelenen), E1 için — `DROP COLUMN "x";` ifadesi
tamamen kayboluyor:

```
ALTER TABLE "o~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~arcy" ADD COLUMN "y" TEXT;
```

### Gerçekçi v0.0.13 RLS migration'ı — sessiz yeşil

```sql
-- RLS politikalari (v0.0.13)
/* Her tenant yalnizca kendi kaydini gorur; politika tenant'in oturum
   degiskenini kullanir. */
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_tenant_isolation" ON "invoice"
  USING ("tenant_id" = current_setting('app.tenant_id', TRUE));

ALTER TABLE "app_user" DROP COLUMN "legacy_note";

/* Not: musteri'nin talebi uzerine eski kolon kaldirildi. */
```

4 tırnak (ÇİFT) → `maskingSkipped=false` → ihlal **`[]`**.
Kontrol (`tenant'in`→`tenantin`, `musteri'nin`→`musterinin`, q=2) →
**`["DESTRUCTIVE_STATEMENT"]`**. Tek fark: iki Türkçe apostrof.

Bu, tur 3 raporunun C2 senaryosunun ÇİFT-tırnaklı kardeşi; FIX 3 C2'yi kapattı,
bu varyantı kapatmadı.

## 2. Tur 3 high'ın dört yolu — dördü de kapandı

```
C2  $$…$$ + /* tenant'in … */ + DROP COLUMN + VALUES ('locale','tr-TR')  q=5 TEK  -> ["UNPARSABLE_SQL","DESTRUCTIVE_STATEMENT"]
C3  VALUES ('Pro -- en iyi'); → strip → sahipsiz tırnak + DROP COLUMN    q=2*     -> ["UNPARSABLE_SQL","DESTRUCTIVE_STATEMENT"]
C1  ALTER TABLE "o'brien" DROP COLUMN "x";                               q=1 TEK  -> ["UNPARSABLE_SQL","DESTRUCTIVE_STATEMENT"]
C5  VALUES ('x);  + DROP COLUMN                                          q=1 TEK  -> ["UNPARSABLE_SQL","DESTRUCTIVE_STATEMENT"]
```

\* C3 ham metinde 2 tırnak taşır ama sayım `stripLineComments`'TEN SONRA yapıldığı için
1'e düşüyor → kapı açılıyor. Sayımın strip sonrası olması doğru karar; sorun sayımın
kendisinin yetersiz olması.

## 3. Diğer tur 3 bulguları

| Bulgu                      | Durum       | Kanıt                                                                                                                                                             |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ayna bekçisi maskelenmemiş | **KISMEN**  | A8 `VALUES ('CREATE TABLE x')` → `[]` **KAPANDI**; A8b `-- CREATE TABLE …` → `[]`; A8c `/* CREATE TABLE … */` → `UNPARSABLE_CREATE_TABLE` **BORÇTA**              |
| D1 `;` yanlış pozitifi     | **KAPANDI** | D1b `DEFAULT 'a;b'` ve D1c `CHECK ("id" <> ';')` → yalnızca `UNCLASSIFIED_TABLE:invoice`; yutma önleme korundu (D1 → `UNPARSABLE_CREATE_TABLE:a` + …)             |
| Bekçi kör noktası          | **KISMEN**  | I2/I2b `CREATE UNLOGGED TABLE`, I3 `TEMP`, I3b `TEMPORARY`, A7 tırnaksız → hepsi `UNPARSABLE_CREATE_TABLE` **KAPANDI**; I4 `CREATE/* c */TABLE` → `[]` **BORÇTA** |
| R-C4                       | **BORÇTA**  | `stripLineComments` değişmemiş; probu artık `["UNPARSABLE_SQL"]` (yan etki, bkz. bulgu 4)                                                                         |

## 4. Dokunulmazlık kanıtı

İki salt-okuma prob script'i scratchpad'de koştu; repo dosyalarına **yazılmadı**,
`git checkout`/`commit`/`push`/`gh` yazma komutu ve yıkıcı DB komutu **çalıştırılmadı**.
Oturum sonu `git status --porcelain` (bu rapor dosyası gate sözleşmesi gereği eklenir;
`T-004-*-tur3.md` dosyaları oturum başında zaten vardı):

```
 M packages/db/src/__tests__/migration-sql.test.ts
?? .claude/workflow/reviews/T-004-qa-tur{1,2,3}.md
?? .claude/workflow/reviews/T-004-security-tur{1,2,3}.md
?? .claude/workflow/reviews/T-004-solid-tur{1,2,3}.md
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

## 5. FAIL gerekçesi ve ESCALATED notu

`AGENT_BASELINE.md` §4: en az bir `high` → **FAIL**. Bu dördüncü tur olduğu için Task
`ESCALATED` olur.

Orkestratör/kullanıcı kararı için not: kalan `high` **tek satırlık** bir kontrolle
kapatılabilir — maskelenen her eşleşmenin `;` içermemesi şartı (bulgu 1'in önerilen
düzeltmesindeki geçici minimum). Tam durum-tutan tarayıcı (`$$` + blok yorum + literal)
`architect`'in v0.0.13 işi (R-C4 ile aynı iş) ve bu Task'ın kapsamını aşıyor. Üç `low`
bulgunun hepsi bilinçli, kodda yorumla belgeli borç; teknik borç defterine kaydedilmeleri
yeterli.

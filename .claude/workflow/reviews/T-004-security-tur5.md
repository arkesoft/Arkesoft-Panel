# T-004 — security gate, tur 5 (çok dar: tek soru — `high` kapandı mı?)

**İLK SATIR CEVABI: `high` KAPANMADI.** Sekizinci yol VAR, aranan ve ölçülen bir
sınır değil — **24 avlanma vektöründen 14'ü ihlal üretmiyor** (`[]`), 14'ünün de
kontrol çifti `["DESTRUCTIVE_STATEMENT"]`.

Tarih: 2026-10-28 · Dal: `main` · İlgili sürüm: **v0.0.13 önkoşulu** (T2-1 kapanışı)
Versiyon etkisi: `patch` · Kapsam: `packages/db/src/__tests__/helpers/migration-set.ts`
Önceki turlar: tur1 FAIL (1 high + 4 low) · tur2 PASS · tur3 **FAIL** · tur4 **FAIL** (ESCALATED)

```
GATE: security
SONUÇ: FAIL
BULGULAR:
  - [SEV: high] packages/db/src/__tests__/helpers/migration-set.ts:283-313 — TUR 3/4'ÜN `high`'I HÂLÂ KAPANMADI (gerileme DEĞİL; aynı bulgunun üçüncü kez daralmış tetikleyicisi). Tur 4 düzeltmesi (`hasStringLiteralMatchSpanningStatementBoundary`) fail-open'ı YALNIZCA "maskelenen eşleşme `;` İÇERİYOR" vakasında kapatıyor. Ama eşleşmenin ifade sınırını aşması için `;` İÇERMESİ GEREKMEZ: `;` maskelenen aralığın DIŞINDA da kalabilir (eşleşme ifadenin ortasında başlayıp ortasında biterse) veya yıkıcı ifade dosyanın SON ifadesi olup `;` hiç taşımaz. Dolayısıyla "çift sayıda sahipsiz tırnak + hiçbir eşleşmede `;` yok + arada gerçek yıkıcı ifade" kombinasyonu HÂLÂ `maskingSkipped=false` bırakıyor, `UNPARSABLE_SQL` ÜRETİLMİYOR ve maskeleme gerçek bir `DROP COLUMN`/`DROP TABLE`/`DROP CONSTRAINT`/`SET NOT NULL` ifadesini SESSİZCE yutuyor → süit yeşil. ONDÖRT bağımsız yol ampirik olarak doğrulandı; hepsi `[]`, hepsinin kontrol çifti (yalnızca apostroflar kaldırılmış aynı dosya) `["DESTRUCTIVE_STATEMENT"]`. Üç yeni SINIF: (i) iki apostrof AYNI ifadenin içinde, hiç `;` aşılmıyor (F-A1, F-F1, F-J1) · (ii) öncesi/sonrası blok yorumu, terminatör `;` eşleşmenin DIŞINDA kalıyor (F-B1, F-B3, F-E1, F-G3, F-G4, F-I1) · (iii) yıkıcı ifade dosyanın SON ifadesi, `;` HİÇ YOK (F-C1, F-C2, F-C3, F-D1, F-D2). SOMUT SENARYO (kim/hangi girdiyle/ne elde eder) — F-B3, elle yazılacak v0.0.13 RLS migration'ının BİREBİR gerçekçi hâli: geliştirici `CREATE POLICY ... USING ("tenant_id" = current_setting('app.tenant_id', TRUE));` satırını yazıyor (gerçek, meşru literal — 2 tırnak), ardından iki Türkçe blok yorum koyuyor (`/* tenant'in eski kolonu */` ve satır sonunda `/* musteri'nin talebi */`) ve araya `ALTER TABLE "app_user" DROP COLUMN "legacy_note";` yazıyor. Tırnak sayısı 4 (ÇİFT) → tek-sayı kapısı açılmıyor; iki eşleşmenin HİÇBİRİ `;` içermiyor (terminatör `;` ikinci apostroftan SONRA) → `;` kapısı da açılmıyor; maske `tenant'…'nin` aralığını yutuyor ve `DROP COLUMN` ifadesi maskelenmiş metinden TAMAMEN kayboluyor (aşağıda maske çıktısı). Ampirik: `[]`. Kontrol (iki apostrof kaldırıldı): `["DESTRUCTIVE_STATEMENT"]`. Expand/contract bekçisi (CLAUDE.md §10.10) yeşil veriyor, yıkıcı migration PR'dan geçiyor → VERİ KAYBI ve platform rollback'inin şema rollback'i gerektirmesi. Tetikleyici tur 4'e göre DAHA KOLAY değil ama DAHA GENİŞ: artık `;` barındırmayan her aralık yeterli, bu da (iii) sınıfı sayesinde "son ifadede DROP + herhangi iki apostrof" kadar basit. Blast radius tur 3/4 ile AYNI: maske yalnızca yıkıcı tarama + ayna bekçisi girdisinde; `tenant_id`/taksonomi/bileşik indeks kuralları ETKİLENMİYOR (gerçek repo probu teyit etti) → `critical` DEĞİL. — Önerilen düzeltme: SAYIM/DESEN TABANLI SEZGİSELDEN TAMAMEN VAZGEÇ. Üçüncü bir yama (ör. "eşleşme `\n` içermesin", "eşleşme N karakterden uzun olmasın") de aynı şekilde atlatılır; mekanizma yanlış, eşik değil. `maskSingleQuotedStringLiteralsSafely` tek geçişli, DURUM TUTAN bir tarayıcıya dönsün: tek tırnak + `''` kaçışı + `$$tag$$` dolar-tırnak + `/* */` blok yorumu + `--` satır yorumu durumlarını tanısın; dosya sonunda literal/yorum AÇIK kalırsa `UNPARSABLE_SQL` üretsin. Bu, R-C4 + ayna bekçisinin blok yorum kör noktası + `CREATE/* c */TABLE` borçlarının ÜÇÜNÜ de aynı geçişte kapatır (dört kalem → tek iş). Ara çözüm ARANMAMALI; alternatif olarak yıkıcı tarama bu Task'tan ÇIKARILIP v0.0.13'e (tarayıcıyla birlikte) ertelenebilir — bu, bugünkü yanlış güven duygusundan daha güvenlidir. — Sorumlu ajan: `architect` (tarayıcı tasarımı + R-C4 ile tek iş, v0.0.13); karar Orkestratör/kullanıcı
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:296-313,552-563,278-279,157-165 — Tur 4'ün üç `low`'u (ayna bekçisi blok yorum kör noktası / `CREATE/* c */TABLE` / R-C4 `stripLineComments` dize sınırı) Orkestratör talimatı gereği YENİDEN DENETLENMEDİ; kullanıcı kararıyla v0.0.13'e gittiler, borçta. Tek not: bulgu 1'in önerilen tarayıcısı bu üçünü de kapsar — ayrı kalem olarak takip edilmeleri gerekmez. — Önerilen düzeltme: ROADMAP borç defterinde bulgu 1 ile BİRLEŞTİR. — Sorumlu ajan: `architect` (v0.0.13)
ÖLÇÜMLER:
  - **`high` KAPANDI MI: HAYIR.** Sekizinci yol BULUNDU ve tek değil — ONDÖRT kaçış, ÜÇ ayrı sınıf
  - Tur 4'ün yedi yolu (hepsi artık ihlal ÜRETİYOR): E1 ✓ · E2 ✓ · E2b ✓ · E3 ✓ · E4 ✓ · E4b ✓ · E6 ✓ — altısı `["UNPARSABLE_SQL","DESTRUCTIVE_STATEMENT"]`, biri (E4b yeniden kurulumu) `["DESTRUCTIVE_STATEMENT"]`. NOT: E4b reprodüksiyonum apostrofları `--` yorumuna koyduğu için `stripLineComments` onları sildi (q=0) → tur 4'teki q=2 hâlinin BİREBİR kopyası DEĞİL; yerine F-E1/F-E2 `$$` sınıfını kapsıyor. Tur 4 düzeltmesi ölçülen yedi yolu kapattı
  - **8. YOL ARAMASI: 24 vektör denendi → 14 KAÇIŞ (fail-open), 10 yakalandı.** Kaçanlar: F-A1 · F-B1 · F-B3 · F-C1 · F-C2 · F-C3 · F-D1 · F-D2 · F-E1 · F-F1 · F-G3 · F-G4 · F-I1 · F-J1. **14/14 kontrol çifti `["DESTRUCTIVE_STATEMENT"]`** — tek fark apostroflar. Bu, "bulamadım ama kanıt değil" DEĞİL; POZİTİF ampirik kanıt
  - Kaçışın yapısal koşulu doğrulandı: ÇİFT sahipsiz tırnak + hiçbir eşleşmede `;` YOK + eşleşmenin İÇİNDE `\bDROP\s` veya `\bSET\s+NOT\s+NULL\b`. Yakalanan 10 vektör ya TEK tırnak sayısına (F-B2 q=3, F-E2 q=3) ya eşleşmede `;`e (F-F2, F-H2) ya da yıkıcı jetonun eşleşme DIŞINDA kalmasına (F-A2, F-A3, F-A4, F-G1, F-G2, F-H1) düştü
  - Ters yön (regresyon) TEMİZ, 8/8: `'Drop Shipping'` `[]` · `'drop shipping'` `[]` · `DEFAULT 'set not null'` `[]` · gerçek `DROP COLUMN` `[DESTRUCTIVE_STATEMENT]` · gerçek `SET NOT NULL` `[DESTRUCTIVE_STATEMENT]` · gerçek `DROP TABLE` `[DESTRUCTIVE_STATEMENT]` · `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` + `current_setting('app.tenant_id', TRUE)` `[]` · kanonik tenant tablosu + bileşik UNIQUE indeks `[]`
  - **Gerçek repo KRİTİK kontrolü GEÇTİ:** `20261026082729_init` tek dizin, 26 tırnak (ÇİFT), gerçek taksonomi (platform=2, tenant=1) → **0 ihlal**, `UNPARSABLE_SQL` yok. Yanlış pozitif gürültüsü yok, CI kırmızıya dönmüyor
  - Bilinçli davranış değişimi TEYİT EDİLDİ (bulgu DEĞİL): `DEFAULT 'a;b'` → `["UNPARSABLE_SQL","UNCLASSIFIED_TABLE:invoice"]` · `CHECK ("id" <> ';')` → `["UNPARSABLE_SQL","UNCLASSIFIED_TABLE:invoice"]`. Fail-closed yönde, kullanıcı onaylı, gevşetme değil
  - İncelenen dosya: 2 (`migration-set.ts` tam okuma, gerçek `20261026082729_init/migration.sql` ampirik) + 1 rapor (tur 4)
  - Toplam prob: 42 (24 avlanma + 7 tur4 yolu + 8 regresyon + 1 gerçek repo + 2 davranış teyidi) + 14 kontrol çifti = 56 çalıştırma
  - Yeni bulgu dağılımı: critical 0 · high 1 (kapanmamış, devralınan) · medium 0 · low 1 (üç borcun tek satırlık birleşik kaydı)
  - Tenant izolasyon listesi (CLAUDE.md §7): **karşılanmayan madde YOK** — bu değişiklik yeni tablo/kolon/endpoint/prosedür/kuyruk işi/S3 öneki/önbellek anahtarı EKLEMİYOR; 14 madde yapısal olarak N/A. 1-3. maddelerin MEKANİK BEKÇİSİ bu değişikliğin konusu ve o yönde (tenant_id/taksonomi/bileşik indeks) gerileme YOK (gerçek repo + R8 probu teyit etti). Bulgu 1 bir tenant VERİ SIZINTISI değil, expand/contract bekçisinin fail-open'ı → `high`
  - `pnpm audit`: KOŞTURULMADI (Orkestratör talimatı). `git status --porcelain` çıktısında `package.json`/`pnpm-lock.yaml` değişikliği YOK; dosya yalnızca `node:fs/path/url` kullanıyor. Tur 1/2/3 sonucu geçerli
  - Bozulmamış kontroller (yeniden denetlenmedi): sır/PII/`any`/`@ts-ignore` yok · K-C4 (`vitest`/`expect` yok) · R5 (yalnızca `node:`) · K-C8 muafiyet jetonu yok
  - FAIL kuralı (AGENT_BASELINE §4): en az bir `high` → **FAIL**
```

---

## 1. Belirleyici kanıt — `;` İÇERMEYEN sekizinci yol

Tur 4 düzeltmesi iki kapı kuruyor:

```
1) countSingleQuoteCharacters(sql) % 2 === 1                    → atla + UNPARSABLE_SQL
2) hasStringLiteralMatchSpanningStatementBoundary(sql)           → atla + UNPARSABLE_SQL
   (= herhangi bir eşleşme ';' içeriyor)
```

İkinci kapının varsayımı şu: _"ifade sınırını aşan bir eşleşme `;` içerir."_ Bu **yanlış**.
Eşleşme ifadenin **ortasında** başlayıp **ortasında** bitebilir (terminatör `;` eşleşmenin
dışında kalır), ya da yıkıcı ifade dosyanın **son** ifadesi olup `;` hiç taşımaz.

### Ondört kaçış — saldırı / kontrol çifti

```
id      SALDIRI(apostroflu)  KONTROL(apostrofsuz)        sınıf
F-A1    []                   ["DESTRUCTIVE_STATEMENT"]   (i)   tek ifade, iki tanımlayıcı apostrofu
F-F1    []                   ["DESTRUCTIVE_STATEMENT"]   (i)   '' kaçışı + iki tanımlayıcı apostrofu
F-J1    []                   ["DESTRUCTIVE_STATEMENT"]   (i)   $tag$ dolar-tırnak + iki apostrof
F-B1    []                   ["DESTRUCTIVE_STATEMENT"]   (ii)  öncesi+sonrası blok yorum, ; DIŞARIDA
F-B3    []                   ["DESTRUCTIVE_STATEMENT"]   (ii)  GERÇEKÇİ v0.0.13 RLS (q=4)
F-E1    []                   ["DESTRUCTIVE_STATEMENT"]   (ii)  $$ gövdesi + iki yorum apostrofu
F-G3    []                   ["DESTRUCTIVE_STATEMENT"]   (ii)  DROP TABLE
F-G4    []                   ["DESTRUCTIVE_STATEMENT"]   (ii)  SET NOT NULL
F-I1    []                   ["DESTRUCTIVE_STATEMENT"]   (ii)  meşru 'Drop Shipping' + iki apostrof
F-C1    []                   ["DESTRUCTIVE_STATEMENT"]   (iii) son ifade, ; YOK
F-C2    []                   ["DESTRUCTIVE_STATEMENT"]   (iii) son ifade, ; YOK
F-C3    []                   ["DESTRUCTIVE_STATEMENT"]   (iii) son ifade, ; YOK
F-D1    []                   ["DESTRUCTIVE_STATEMENT"]   (iii) kesilmiş literal + son ifade
F-D2    []                   ["DESTRUCTIVE_STATEMENT"]   (iii) kesilmiş literal + yorum apostrofu
```

### F-B3 — elle yazılacak v0.0.13 RLS migration'ının gerçekçi hâli

```sql
CREATE POLICY "p" ON "invoice" USING ("tenant_id" = current_setting('app.tenant_id', TRUE));
/* tenant'in eski kolonu */
ALTER TABLE "app_user" DROP COLUMN "legacy_note" /* musteri'nin talebi */;
```

`q=4` (ÇİFT) · iki eşleşme, **hiçbiri `;` içermiyor** → iki kapı da kapalı →
`maskingSkipped=false`. Maske çıktısı (`~` = boşlukla maskelenen):

```
CREATE POLICY "p" ON "invoice" USING ("tenant_id" = current_setting(~~~~~~~~~~~~~~~, TRUE));
/* tenant~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~nin talebi */;
```

`ALTER TABLE "app_user" DROP COLUMN "legacy_note"` ifadesi **tamamen kayboldu**.
Sonuç: `[]`. Tek apostrofları silince: `["DESTRUCTIVE_STATEMENT"]`.

### (iii) sınıfı — en kolay tetikleyici

```sql
/* tenant'in */
ALTER TABLE "app_user" DROP COLUMN "legacy_note"
/* musteri'nin */
```

Yıkıcı ifade dosyanın sonunda, terminatör `;` hiç yok. `q=2`, eşleşmede `;` yok → `[]`.
Bu sınıf için gereken tek şey: **son ifadede bir `DROP` + herhangi iki apostrof.**

## 2. Neden üçüncü bir yama ARANMAMALI

Üç turda üç sezgisel denendi ve her biri bir sonraki turda atlatıldı:

| Tur | Kapı                               | Atlatma                                               |
| --- | ---------------------------------- | ----------------------------------------------------- |
| 3   | tırnak sayısı TEK                  | ÇİFT sayı (7 yol)                                     |
| 4   | eşleşmede `;` var                  | `;`siz aralık (14 yol)                                |
| 5?  | eşleşmede `\n` var / uzunluk eşiği | tek satırlık F-A1, F-B1, F-G3, F-G4 (zaten tek satır) |

Hipotetik "eşleşme `\n` içermesin" kapısı F-A1/F-B1/F-G3/F-G4/F-I1'i (beş kaçış)
**kapatmaz** — hepsi tek satır. Hipotetik "eşleşme 80 karakterden uzun olmasın"
kapısı F-A1'i (`'brien_log" DROP COLUMN "x'`, 26 karakter) kapatmaz ve gerçek
literal yanlış pozitifleri üretir. **Mekanizma yanlış, eşik değil.** Doğru çözüm
durum tutan tek geçişli tarayıcı; o da R-C4 + ayna bekçisi blok yorumu +
`CREATE/* c */TABLE` borçlarını aynı geçişte kapatır.

## 3. Ters yön ve gerçek repo

```
R1 'Drop Shipping'                        []                        TEMİZ  OK
R2 'drop shipping'                        []                        TEMİZ  OK
R3 DEFAULT 'set not null'                 []                        TEMİZ  OK
R4 ALTER TABLE ... DROP COLUMN            [DESTRUCTIVE_STATEMENT]   YAKALA OK
R5 ALTER COLUMN ... SET NOT NULL          [DESTRUCTIVE_STATEMENT]   YAKALA OK
R6 DROP TABLE                             [DESTRUCTIVE_STATEMENT]   YAKALA OK
R7 ENABLE ROW LEVEL SECURITY + POLICY     []                        TEMİZ  OK
R8 kanonik tenant tablosu + bileşik indeks []                       TEMİZ  OK

GERÇEK REPO: 20261026082729_init · tırnak=26 (ÇİFT) · taksonomi platform=2/tenant=1
             → 0 ihlal. UNPARSABLE_SQL YOK, yanlış pozitif YOK.
```

## 4. Bilinçli davranış değişimi — teyit

```
DEFAULT 'a;b'          → ["UNPARSABLE_SQL","UNCLASSIFIED_TABLE:invoice"]
CHECK ("id" <> ';')    → ["UNPARSABLE_SQL","UNCLASSIFIED_TABLE:invoice"]
```

İkisi de `q=2` (ÇİFT), eşleşme `;` içeriyor → ikinci kapı açılıyor. Davranış **tam
olarak beyan edildiği gibi**. Fail-closed yönde sıkılaşma, kullanıcı onaylı — **bulgu
yazılmadı**.

## 5. Dokunulmazlık kanıtı

İki salt-okuma prob script'i scratchpad'de koştu (`probe-tur5.mts`, `ctrl-tur5.mts`);
repo dosyalarına **yazılmadı**, `git checkout`/`commit`/`push`/`gh` yazma komutu ve
yıkıcı DB komutu **çalıştırılmadı**, `pnpm audit` **koşturulmadı** (talimat).
Oturum sonu `git status --porcelain` tur 4 ile **birebir aynı** (bu rapor dosyası gate
sözleşmesi gereği eklenir):

```
 M packages/db/src/__tests__/migration-sql.test.ts
?? .claude/workflow/reviews/T-004-qa-tur{1,2,3,4}.md
?? .claude/workflow/reviews/T-004-security-tur{1,2,3,4}.md
?? .claude/workflow/reviews/T-004-solid-tur{1,2,3}.md
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

## 6. FAIL gerekçesi ve Orkestratör için not

`AGENT_BASELINE.md` §4: en az bir `high` → **FAIL**. Beşinci tur, Task `ESCALATED`
kalıyor.

Karar için iki seçenek — **üçüncü bir sezgisel yama ÖNERMİYORUM** (bkz. §2):

- **(A) Tarayıcıya promosyon.** `architect`, v0.0.13: durum tutan tek geçişli
  tarayıcı. R-C4 + ayna bekçisi blok yorumu + `CREATE/* c */TABLE` + bu `high`'ın
  **dördünü** birden kapatır. Bu Task'ın kapsamını aşar.
- **(B) Yıkıcı taramayı bu Task'tan ÇIKAR.** `DESTRUCTIVE_STATEMENT` kuralı ve
  maskeleme hattı kaldırılır, v0.0.13'e tarayıcıyla birlikte gelir. T-004'ün asıl
  AC'si (migration KÜMESİNİN tamamını okuma + taksonomi karşılaştırması) bundan
  **etkilenmez** ve o yüzey sağlam (gerçek repo + R8 teyit etti). Yanlış güven
  duygusu veren yeşil bir bekçiden, hiç bekçi olmaması daha güvenlidir — ve
  eksiklik ROADMAP borcu olarak **görünür** kalır.

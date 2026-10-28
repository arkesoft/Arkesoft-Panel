# T-004 — security gate, tur 2 (artımlı)

Tarih: 2026-10-28 · Dal: `main` · İlgili sürüm: **v0.0.13 önkoşulu** (T2-1 kapanışı)
Versiyon etkisi: `patch` · Kapsam: `packages/db/src/__tests__` (3 dosya, çalışma zamanı kodu yok)
Önceki tur: `.claude/workflow/reviews/T-004-security-tur1.md` (FAIL — 1 high + 4 low)

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] packages/db/src/__tests__/helpers/migration-set.ts:164 — Ad deseni (`/CREATE TABLE\s+"([^"]+)"/g`) ANAHTAR KELİME BİÇİMİNE hâlâ duyarlı: `create table "invoice" (...)` (küçük harf), `Create Table`, `CREATE  TABLE` (çift boşluk), `CREATE TABLE IF NOT EXISTS "invoice"`, `CREATE TABLE public."invoice"`, tırnaksız ad ve `CREATE\nTABLE` biçimlerinin HEPSİ hiçbir ihlal üretmiyor (ampirik: S5a–S5g `[]`; kanonik kontrol S5h `UNCLASSIFIED_TABLE`). Yıkıcı tarama bu turda büyük harfe NORMALİZE EDİLDİ (C1) ama tablo adı/gövde desenleri edilmedi → asimetri. Saldırı/kaza senaryosu (tur 1'in senaryosunun harf ekseni): v0.0.13 elle yazılmış SQL migration'ları getiriyor (RLS politikası, rol ayrımı); geliştirici o dosyaya küçük harfli `create table if not exists "invoice" ("id" text not null, "tenant_id" text not null);` yazıyor ve `tenancy.ts` taksonomisine eklemeyi unutuyor → süit YEŞİL → tablo RLS allowlist'ine hiç girmiyor → `withTenant()` kapsamı dışında kalan `invoice` üzerinden A tenant'ı B tenant'ının faturalarını okuyor. `medium` gerekçesi (şişirme/küçültme değil): (a) HEAD'e göre GERİLEME DEĞİL — eski `/CREATE TABLE "([^"]+)"/g` deseni de harf duyarlıydı, güvence daralmadı; (b) bugünkü repoda tetikleyici YOK (tek migration Prisma üretimi, kanonik; gerçek taksonomiyle 0 ihlal — ampirik doğrulandı); (c) bu, PM kararı 2'nin `ALTER TABLE … ADD COLUMN "tenant_id"` tespitini v0.0.13'e bıraktığı ELLE YAZILAN SQL kovasının tam aynısı (R-C2) → aynı vadeye yazılması tutarlı. — Önerilen düzeltme: ad ve gövde desenlerini `i` bayrağıyla koştur ve `CREATE\s+TABLE(\s+IF\s+NOT\s+EXISTS)?\s+(?:"[^"]+"\.)?"([^"]+)"` biçimine genişlet; tırnaksız/şema önekli biçim v0.0.13 şema linter'ına bırakılacaksa ROADMAP teknik borcuna açıkça yazılsın. — Sorumlu ajan: `db` (vade: v0.0.13 şema linter'ı)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:135 — Gövde deseninin tembel `([\s\S]*?)\n\);` çapası İFADE SINIRINI AŞABİLİYOR: tek satırlık bir `CREATE TABLE "a" ("id" TEXT NOT NULL);` ifadesini kanonik bir `CREATE TABLE "b" (…"tenant_id" TEXT NOT NULL\n);` izlediğinde `a`'nın gövdesi `b`'nin gövdesini YUTUYOR; `a` TENANT_SCOPED ve `tenant_id` kolonu YOK olsa bile `MISSING_TENANT_ID_COLUMN` ÜRETİLMİYOR (ampirik G1: yalnızca `UNPARSABLE_CREATE_TABLE:b`; G1-kontrol aynı küme kanonik yazıldığında doğru şekilde `MISSING_TENANT_ID_COLUMN:a` veriyor). `low` gerekçesi: süit yine KIRMIZI oluyor (yutulan tablo `UNPARSABLE_CREATE_TABLE` üretiyor) → sessiz sahte-yeşil DEĞİL, yalnızca SUÇLU TABLO YANLIŞ raporlanıyor; ayrıca eski kodun ada çapalı gövde regex'i de aynı tembel aşmayı yapıyordu (devralınan, gerileme değil). Risk, geliştiricinin kanonik olan `b`'yi "biçimi bozuk" sanıp deseni gevşetmesi. — Önerilen düzeltme: gövde taramasını ifade sınırında durdur (`([^;]*?)\n\);` veya ifadeleri önce `;` ile bölüp her birinde ayrı ayrı ara). — Sorumlu ajan: `db`
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:118 — C1 düzeltmesi YANLIŞ POZİTİF yüzeyini genişletti: tarama büyük harfe normalize edildiği için veri/seed migration'ındaki `INSERT INTO "plan" (…) VALUES ('pln_1', 'Drop Shipping');` artık `DESTRUCTIVE_STATEMENT` üretiyor (ampirik F: `'Drop Shipping'`, `'drop shipping'` ikisi de ihlal; eski harf duyarlı `includes('DROP ')` bu ikisini YAKALAMIYORDU). Aynı şekilde `DEFAULT 'set not null'` string literali de tripliyor; `"to-drop x"` gibi tire+boşluklu kolon adı da (`\b` sınırı `_` için doğru çalışıyor — `"dropped_at"`, `"drop_at"`, `DROPDOWN`, `"backdrop url"` TEMİZ). Fail-closed olduğu için veri sızıntısı yok; risk, bir Türk e-ticaret platformunda "Drop Shipping" plan adının gerçekten geçmesi ve kuralı gevşetme baskısı doğurması (CLAUDE.md §10.6 bunu yasaklıyor). v0.0.13'ün gerçek içeriği (`ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`) bu kuraldan TEMİZ geçiyor (ampirik F4). — Önerilen düzeltme: taramayı string literallerini atlayan bir tarayıcıya taşı (R-C4 ile aynı iş) veya DML (`INSERT`/`UPDATE`) satırlarını kapsam dışında tut; bugün için ROADMAP borç satırı yeterli. — Sorumlu ajan: `db`
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:99-107 — `stripLineComments` string-literal sınırı: `UPDATE "tenant" SET "note" = '--'; DROP TABLE "app_user";` hâlâ ihlal üretmiyor (ampirik, tur 1 ile aynı sonuç: `[]`). **BİLİNÇLİ OLARAK BORÇTA** — R-C4, sorumlu `architect`, vade v0.0.13; bu turda düzeltilmesi beklenmiyordu. Şişirilmedi, yalnızca kaydın sürekliliği için tekrar edildi. — Önerilen düzeltme: v0.0.13 şema linter'ına promosyonda tek-tırnak durumu izleyen tarayıcı. — Sorumlu ajan: `architect` (v0.0.13)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set-fixture.ts:56-67 — `assertSafeDirectoryName` tek nokta `.` adını KABUL ediyor: `join(root, '.')` kökün kendisine çözülür ve fixture `root/migration.sql` yazar; `readMigrationSet` bunu `entry.isDirectory()` filtresiyle atar → o fixture'ı kullanan bir vaka HİÇBİR ŞEY ölçmeden yeşil kalır (ampirik C3: `name="."` → `KABUL (okunan=[])`). Kök DIŞINA yazma YOK, artık YOK, temizlik çalışıyor → güvenlik sınırı ihlali değil, sahte-yeşil sınıfı bir fixture API kusuru. — Önerilen düzeltme: `.` ve `..` için nokta-yalnızca adları da reddet (`/^\.+$/`). — Sorumlu ajan: `db`
ÖLÇÜMLER:
  - Denenen vektör: 83 (75 ampirik prob + 8 statik/konfig kontrolü) — S1–S4c (8), S5a–h (8), C1 yakalama (7), C1 yanlış pozitif (7), R-C4 (1), C3 ad atlatma (17), C3b rootFiles anahtarı (5), C2 özel karakter (6), rootFiles+finally (6), C4 çift dizin adı (1), gerçek repo (1), sızıntı (1), G1/G1-kontrol/G2 (3), F yanlış pozitif (4); statik: R-C6 regex sayımı, tsc asenkron atanabilirlik, eslint `no-misused-promises`, vitest `include`, import/sır/`any`/DB/K-C8 grep'leri
  - İncelenen dosya: 7 (3 teslimat + `git show HEAD:migration-sql.test.ts` + `packages/config/eslint/base.js` + `packages/db/vitest.config.ts` + gerçek `20261026082729_init/migration.sql`)
  - Tur 1 bulgu kapanışı: **high KAPANDI** · low-C1 **KAPANDI** · low-C2 **KAPANDI** · low-C3 **KAPANDI** (artık kök dışına yazma yok) · low-R-C4 **BORÇTA** (beklendiği gibi)
  - Yeni bulgu dağılımı: critical 0 · high 0 · medium 1 · low 4 (4 low'un 1'i tur 1'den devralınan borç kaydı)
  - Tenant izolasyon listesi (CLAUDE.md §7): karşılanmayan madde YOK — yeni tablo/kolon/endpoint/prosedür/kuyruk işi/indeks/önek/anahtar yok, 14 madde yapısal olarak N/A. Listenin 1–3. maddelerinin MEKANİK BEKÇİSİ bu değişikliğin konusu; bekçide kalan tek kör nokta bulgu 1 (anahtar kelime biçimi)
  - `pnpm audit`: KOŞTURULMADI (Orkestratör talimatı + kendi doğrulamam) — `git diff HEAD --name-only -- pnpm-lock.yaml '**/package.json' package.json` BOŞ; yeni dosyalar yalnızca `node:fs/os/path/url` kullanıyor. Tur 1 sonucu geçerli
  - FAIL kuralı (AGENT_BASELINE §4): high/critical 0, medium 1 (< 3) → **PASS**, bulgular teknik borca kaydedilir
```

---

## 1. Tur 1 bulgularının kapanışı — kendi kanıtımla

Tüm sonuçlar `scratchpad/probe2.ts` + `probe2b.ts` ile, gerçek yardımcıların mutlak
yoldan dinamik import'u üzerinden (`node --experimental-strip-types`) üretildi. Devops/db
beyanı kabul edilmedi.

### 1.1 `high` — güvence daralması → **KAPANDI**

```
S1 tek satir, taksonomide YOK   : ["UNCLASSIFIED_TABLE"]        <- tur1'de []
S2 tek satir, PLATFORM'da       : ["UNPARSABLE_CREATE_TABLE"]   <- tur1'de []
S2b tek satir, TENANT'ta        : ["UNPARSABLE_CREATE_TABLE","MISSING_TENANT_ID_LEADING_UNIQUE_INDEX"]
S3 girintili kapanis, YOK       : ["UNCLASSIFIED_TABLE"]        <- tur1'de [] (kör nokta)
S3b girintili kapanis, PLATFORM : ["UNPARSABLE_CREATE_TABLE"]
S4 TERS YON kanonik (bos olmali): []
S4b kanonik + tenant_id PLATFORM: ["TENANT_ID_ON_PLATFORM_TABLE"]
S4c kanonik + tenant_id EKSIK   : ["MISSING_TENANT_ID_COLUMN"]
```

- **(1)** Taksonomide olmayan tek satırlık tablo → `UNCLASSIFIED_TABLE` **üretiyor**.
- **(2)** Taksonomide olan tek satırlık tablo → `UNPARSABLE_CREATE_TABLE` **üretiyor**
  (tur 1'in tam senaryosu artık sessiz geçmiyor).
- **(3)** Girintili kapanış (`\n  );`) **artık kör nokta değil** — hem `UNCLASSIFIED_TABLE`
  hem `UNPARSABLE_CREATE_TABLE` dalında görülüyor.
- **(4) Ters yön korundu:** kanonik biçimli kümeler ihlal **üretmiyor** (S4 `[]`), gövde
  gerektiren üç kuralın hepsi kanonik girdide **hâlâ ateşliyor** (S4b/S4c) → sıkı kontrol
  kaybedilmemiş, ayna simetrisi oluşmamış. Gerçek repo migration'ı da 0 ihlal
  (`okunan dizinler: ["20261026082729_init"]`, `gercek taksonomi ihlalleri: []`).
- **(5) R-C6 teyit edildi:** `migration-set.ts`'te `CREATE TABLE` içeren 10 satırın yalnızca
  **ikisi regex literali** — satır 135 (gövde, katı) ve satır 164 (ad, gevşek); kalan sekiz
  geçiş yorum, biri de `message` şablonu. `new RegExp` tek yerde (satır 400) ve girdisi
  taksonomi sabiti (`tenantTables`), dış dünya değil. Fixture tarafında `CREATE TABLE` yalnızca
  **şablon dizesi olarak yazılıyor**, ayrıştırılmıyor → kopya mantık doğmamış.

Kalan kör nokta → bulgu 1 (`medium`, anahtar kelime biçimi ekseni, S5).

### 1.2 `low` C1 — harf/boşluk duyarlılığı → **KAPANDI**

```
drop column (kucuk)             -> ["DESTRUCTIVE_STATEMENT"]
DROP\tCOLUMN (tab)              -> ["DESTRUCTIVE_STATEMENT"]
DROP\nCOLUMN (yenisatir)        -> ["DESTRUCTIVE_STATEMENT"]
SET  NOT NULL (cift bosluk)     -> ["DESTRUCTIVE_STATEMENT"]
set\tnot\nnull (karisik)        -> ["DESTRUCTIVE_STATEMENT"]
DROP TABLE                      -> ["DESTRUCTIVE_STATEMENT"]
```

Yanlış pozitif taraması — `\b` sınırı **yeterli**:

```
"dropped_at"   -> []      "drop_at"     -> []     DROPDOWN -> []
"backdrop url" -> []      yorumda DROP COLUMN (K-C7) -> []
"to-drop x"              -> ["DESTRUCTIVE_STATEMENT"]   (tire+boşluk, snake_case kuralıyla ulaşılamaz)
DEFAULT 'set not null'   -> ["DESTRUCTIVE_STATEMENT"]
'Drop Shipping' (INSERT) -> ["DESTRUCTIVE_STATEMENT"]   -> bulgu 3 (low)
```

`_` kelime karakteri olduğu için snake_case kolon adları (CLAUDE.md §4) güvende. Genişleyen
yanlış pozitif yüzeyi bulgu 3'te kayıtlı.

### 1.3 `low` C2 — URL kodlama → **KAPANDI**

```
20261026000001_add#1     -> okunan=["20261026000001_add#1"]     <- tur1'de []
20261026000002_a?b       -> okunan=["20261026000002_a?b"]       <- tur1'de []
20261026000003_a%2Fb     -> okunan=["20261026000003_a%2Fb"]     <- tur1'de []
20261026000004_a b       -> okunan=["20261026000004_a b"]
20261026000005_yuzde%41  -> okunan=["20261026000005_yuzde%41"]
20261026000006_normal    -> okunan=["20261026000006_normal"]
```

`pathToFileURL(join(fileURLToPath(base), …))` sınıfı kapattı; `#`, `?`, `%`, boşluk içeren
dizinler artık **okunuyor** → AC1'in "her dizin okunur" sözleşmesi sessizce ihlal edilmiyor.

### 1.4 `low` C3 — `directoryName` doğrulaması → **KAPANDI** (atlatılamadı)

17 vektör denendi; **kök dışına tek bir yazma bile üretilemedi**, `tmpdir()`'de `escape-*`
artığı **hiç oluşmadı**:

| Girdi                                         | Sonuç                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `../escape-x`, `..`, `....`, `a..b`           | **RED** (`..`)                                                            |
| `/etc/escape-x`, `a/b`, `%2e%2e/escape-x`     | **RED** (`/`)                                                             |
| `a\b`, `．．/x` (unicode + ayraç)             | **RED**                                                                   |
| `.`                                           | KABUL — `root`'a çözülür, kök İÇİ, `okunan=[]` → bulgu 5                  |
| `C:`, `C:escape`                              | KABUL — POSIX'te düz ad; `path.win32.join` da sürücüyü çözmez → kaçış yok |
| `．．` (fullwidth, ayraçsız), `.hidden`, `x ` | KABUL — kök içi düz ad, temizlendi                                        |
| `sub�x`                                       | `node:fs` fırlattı; `finally` temizledi                                   |
| **`rootFiles` anahtarları**                   | `../escape-root.txt`, `a/b.txt`, `..`, `` → hepsi **RED**; `ok.txt` kabul |

`rootFiles` anahtarları **aynı kontrolden geçiyor** (satır 123). URL-kodlanmış `%2e%2e`
dosya sistemi seviyesinde literal bir ad olduğu için kaçış vektörü değil.

### 1.5 `low` R-C4 — `stripLineComments` string literali → **BORÇTA**

`UPDATE "tenant" SET "note" = '--'; DROP TABLE "app_user";` → `[]` (tur 1 ile aynı).
R-C4 kapsamında, sorumlu `architect`, vade v0.0.13. Bulgu 4 olarak **borç notuyla** tekrar
edildi, şişirilmedi.

---

## 2. Yeni yüzey — düzeltme ne açtı?

| Yüzey                                      | Kanıt                                                                                                                                                                                                                                                                                                                                               | Sonuç                                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`rootFiles` (C5)**                       | `kok icerigi (run icinde): ["19700101000000_a","README.md","migration_lock.toml"]` → `run sonrasi kok var mi: false`                                                                                                                                                                                                                                | **TEMİZ** — `rmSync` kök dosyalarını da siliyor; anahtarlar `assertSafeDirectoryName`'den geçiyor; değer yalnızca dosya içeriği olarak yazılıyor, ayrıştırılmıyor |
| **`UNPARSABLE_CREATE_TABLE` (yeni kural)** | Gerçek `20261026082729_init` + gerçek taksonomi → `[]`; kanonik fixture'lar → `[]` (S4, G1-kontrol)                                                                                                                                                                                                                                                 | **Yanlış pozitif üretmiyor.** Tek yan etkisi bulgu 2'deki yanlış ATIF                                                                                             |
| **`finally` her çıkış yolunda**            | `run FIRLATTI -> kok silindi mi: true` · `erken RETURN -> true` · `rootFiles'lı normal çıkış -> true` · `tmpdir ayakta: true` · süit sonrası `arkesoft-*` artığı `[]`                                                                                                                                                                               | **BOZULMAMIŞ** — tur 1'in `critical` sınıfı hâlâ gerçekleşmiyor; `rmSync` hedefi yalnızca `mkdtempSync` dönüşü, `try` ondan sonra başlıyor                        |
| **`<T>` jeneriğinin kaldırılması (C9)**    | `tsc --strict` ile `(dir: URL) => void` imzasına **asenkron geri çağrı atanabiliyor** (exit 0) → ağaç gövde `await`'ten dönmeden siliniyor (`await SONRASI kok hala var mi: false`). ANCAK `packages/config/eslint/base.js:81` `@typescript-eslint/no-misused-promises: 'error'` (varsayılan `checksVoidReturn.arguments`) bunu **lint'te** yakalar | **KAPALI (ikinci savunma ile)** — tip sistemi değil, `pnpm lint` engelliyor; bugün hiçbir çağrı asenkron değil → bulgu yazılmadı, kayda geçirildi                 |
| **`Map` → tek geçiş dizisi (C4)**          | Aynı `directoryName` iki kez: `["UNCLASSIFIED_TABLE:invoice"]` — **iki girdinin ikisi de taranıyor**                                                                                                                                                                                                                                                | **KAPANDI** — "son yazan kazanır" sessiz çakışması yok; yer değiştirmemiş                                                                                         |
| **Yeni fixture üreteçleri**                | `generateSetNotNullStatement` ve `generateSingleLineCreateTableStatement` yalnızca şablon dizesi döndürüyor (satır 174, 198); fixture dosyasında `matchAll`/`RegExp`/`exec` **yok**                                                                                                                                                                 | **TEMİZ** — SQL **yazıyor**, ayrıştırmıyor (R-C6 korundu)                                                                                                         |

---

## 3. Değişmeyen gerçekler — bozulmuş mu?

| Kontrol                                     | Teyit                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `rmSync` hedefi = `mkdtempSync` dönüşü      | **KORUNDU** (satır 101/138, `try` 103'te başlıyor)                                                        |
| R5 — yalnızca `node:` builtin               | **KORUNDU** — 7 import: `node:fs`×2, `node:os`, `node:path`×2, `node:url`×2                               |
| K-C4 — yardımcıda `vitest`/`expect` yok     | **KORUNDU** — `vitest` import'u yalnızca `migration-sql.test.ts:32`'de                                    |
| K-C8 — muafiyet mekanizması yok             | **KORUNDU** — `allow/exempt/skip/ignore/bypass/options?` grep'i yardımcılarda **sıfır** eşleşme           |
| `src/index.ts` · `tenancy.ts` · `prisma/**` | **DEĞİŞMEMİŞ** — `git status --porcelain` yalnızca `migration-sql.test.ts` (M) + 2 yeni yardımcı (??)     |
| Sır / PII                                   | **TEMİZ** — parola/token/API anahtarı/özel anahtar/TCKN/CVV/bağlantı dizesi grep'i: eşleşme yok           |
| `any` / `@ts-ignore` / DB erişimi           | **YOK** — `prisma.`/`withTenant`/`queryRaw`/`executeRaw` grep'i: eşleşme yok                              |
| `pnpm audit`                                | Lockfile ve tüm `package.json` dosyaları **değişmemiş** → tur 1 sonucu geçerli, yeniden koşturulmadı      |
| Enjeksiyon / SSRF / ödeme / yetki / KVKK    | **N/A** (değişmedi) — SQL çalıştırılmıyor, ağ isteği/HTTP ucu/prosedür/ödeme akışı/kişisel veri yok       |
| `vitest` `include: ['src/**/*.test.ts']`    | Yardımcılar test olarak **toplanmıyor** → modül üst seviyesinde `mkdtemp` tetiklenmiyor (R-P1 ile uyumlu) |

---

## 4. Dokunulmazlık kanıtı

Tüm vektörler scratchpad'de iki salt-okuma script'i ile koşturuldu; repo dosyalarına
**yazılmadı**, `git checkout`/`commit`/`push`/`gh` yazma komutu ve yıkıcı DB komutu
**çalıştırılmadı**.

```
=== PROB SONRASI git status ===
 M packages/db/src/__tests__/migration-sql.test.ts
?? .claude/workflow/reviews/T-004-qa-tur1.md
?? .claude/workflow/reviews/T-004-security-tur1.md
?? .claude/workflow/reviews/T-004-solid-tur1.md
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

(oturum başındaki durumla birebir aynı; bu rapor dosyası gate sözleşmesi gereği eklenir)
· `tmpdir()`'de `arkesoft-*` artığı: `[]` · kök dışı `escape-*` artığı: **hiç oluşmadı**

## 5. PASS gerekçesi

`AGENT_BASELINE.md` §4: `critical`/`high` **yok**, `medium` **1** (eşik 3) → **PASS**.
Tur 1'in `high` bulgusu kendi ürettiğim kanıtla **kapandı**; üç `low` da kapandı, biri
(R-C4) beklendiği gibi borçta. Kalan 1 `medium` + 4 `low` teknik borca kaydedilmeli;
bulgu 1 ve 2 v0.0.13 şema linter'ı promosyonuna **bağlanmalı**, çünkü tetikleyicisi tam
olarak o sürümün getireceği elle yazılmış SQL migration'ları.

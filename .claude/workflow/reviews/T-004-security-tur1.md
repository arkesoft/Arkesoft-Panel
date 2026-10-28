# T-004 — security gate, tur 1

Tarih: 2026-10-28 · Dal: `main` · İlgili sürüm: **v0.0.13 önkoşulu** (T2-1 kapanışı)
Versiyon etkisi: `patch` (architect) · Kapsam: `packages/db/src/__tests__` (3 dosya, çalışma zamanı kodu yok)

```
GATE: security
SONUÇ: FAIL
BULGULAR:
  - [SEV: high] packages/db/src/__tests__/helpers/migration-set.ts:101 — Güvence DARALDI: `extractCreatedTables` deseni `/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/` Prisma'nın TAM emit şekline bağlı; eski uygulamanın gevşek `/CREATE TABLE "([^"]+)"/g` adı-çıkarımı kaldırıldı. Sonuç: kanonik biçime uymayan bir `CREATE TABLE` ifadesi (tek satırlık, veya kapanış parantezi girintili) hem `UNCLASSIFIED_TABLE` hem `TENANT_ID_ON_PLATFORM_TABLE` kurallarına TAMAMEN görünmez olur. Saldırı/kaza senaryosu: v0.0.13 elle yazılmış SQL migration'ları getiriyor (RLS politikaları, rol ayrımı); bir geliştirici o migration'a `CREATE TABLE "invoice" ("id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL);` satırını yazar ve tabloyu `tenancy.ts` taksonomisine eklemeyi unutur → test YEŞİL kalır → tablo RLS allowlist'ine hiç girmez → `withTenant()` kapsamı dışında kalan `invoice` tablosu üzerinden A tenant'ı B tenant'ının faturalarını okur. Bu, T2-1'in kapatmak için açıldığı sahte-yeşil sınıfının yeni bir kör noktası; ileri yön (`MISSING_TENANT_SCOPED_TABLE`) yalnızca taksonomide ZATEN yazılı tabloları kurtarır, "taksonomiye yazılmayı unutulan tablo" yönü — yani T2-1 yönü — korumasız. Ampirik kanıt aşağıda (V1/V1b/V1c). — Önerilen düzeltme: tablo ADI çıkarımını gövde ayrıştırmasından AYIR; `UNCLASSIFIED_TABLE` gevşek ad deseni (`/CREATE TABLE\s+"([^"]+)"/g`) üzerinde koşsun, gövde gerektiren iki kural (`MISSING_TENANT_ID_COLUMN`, `TENANT_ID_ON_PLATFORM_TABLE`) gövdeyi ayrıştıramadığında SESSİZ GEÇMESİN, yeni bir `UNPARSABLE_CREATE_TABLE` ihlali üretsin (R-C6 korunur: tek `CREATE TABLE` ad deseni + tek gövde deseni, kopya mantık doğmaz). — Sorumlu ajan: `db`
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:80-88 — `stripLineComments` FAZLA temizliyor: `indexOf('--')` satırın geri kalanını, `--` bir STRING LİTERALİNİN içinde olsa bile atıyor. Eski kod ham metni taradığı için `UPDATE "tenant" SET "note" = '--'; DROP TABLE "app_user";` satırındaki `DROP ` yakalanıyordu; yeni kod bu satırı hiç görmüyor (ampirik: V5). K-C7'nin kendisi gevşeme DEĞİL (yorumdaki `DROP ` kalıcı yanlış pozitifini önlüyor, V6 doğrulandı) — bulgu yalnızca string literali sınırına ait. R-C4'te "kabul edilen sınır" olarak belgeli; somut tetikleyici bugün yok. — Önerilen düzeltme: v0.0.13 şema linter'ına promosyonda tek-tırnak durumunu izleyen bir tarayıcıya geç; bugün için R-C4 notu yeterli. — Sorumlu ajan: `architect` (v0.0.13)
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set-fixture.ts:52-57 — `withTemporaryMigrationSet` çağıranın verdiği `directoryName`'i `join(root, directoryName)` ile doğrulamadan birleştiriyor; `'../arkesoft-X'` adı geçici kökün DIŞINA dizin+dosya yazar ve `rmSync(root)` onu temizlemediği için artık bırakır (ampirik: W3 — kök dışı dosya oluştu, kök silindikten sonra da kaldı). SİLME hedefi etkilenmiyor (aşağıdaki Yüzey 2 sonucu) → veri kaybı yok, yalnızca sandbox dışına yazma + sızıntı. Bugün tüm çağrılar test dosyasındaki sabit literaller; fonksiyon imzası ise hiçbir kısıt vaat etmiyor. — Önerilen düzeltme: `directoryName` için yol ayracı / `..` içermediğini doğrulayan bir ön kontrol + ihlalde `throw`. — Sorumlu ajan: `db`
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:141-145 — `new URL(`${entry.name}/migration.sql`, normalizedBase)` dizin adını URL-kodlamıyor: adı `#`, `?` veya `%` içeren bir migration dizini için `existsSync` false döner ve dizin SESSİZCE atlanır (ampirik: W5/dbg2 — `20261026000001_add#1`, `..._a?b`, `..._a%2Fb` üçü de `okunan=[]`; `_normal` okunuyor). Hiçbir ihlal üretilmediği için AC1'in "migration.sql içeren HER dizin okunur" sözleşmesi sessizce ihlal edilir — T2-1 ile aynı sahte-yeşil sınıfı. Eski kodda da aynı kuruluş vardı → gevşeme DEĞİL, devralınan kusur. Prisma dizin adını slug'ladığı için gerçek tetikleyici bugün ulaşılamaz (Prisma kurulu olmadığı için sanitizasyon kaynaktan doğrulanamadı) → `low`. — Önerilen düzeltme: `pathToFileURL(join(fileURLToPath(normalizedBase), entry.name, 'migration.sql'))` kullan; veya `encodeURIComponent(entry.name)`. — Sorumlu ajan: `db`
  - [SEV: low] packages/db/src/__tests__/helpers/migration-set.ts:200 — Yıkıcı tarama `includes('DROP ')` + `includes('SET NOT NULL')`: büyük/küçük harfe ve TEK boşluğa duyarlı. `drop column`, `set not null`, `DROP\tCOLUMN`, `SET  NOT NULL` kaçar (ampirik: V4 — küçük harfli iki varyant da ihlal üretmedi). Eski kod da birebir aynıydı → gevşeme DEĞİL; ancak taramanın kapsamı artık ELLE YAZILACAK v0.0.13 migration'larını da içeriyor ve orada küçük harf makul. — Önerilen düzeltme: normalize metni büyük harfe çevirip `\bDROP\s`, `\bSET\s+NOT\s+NULL\b` regex'leriyle tara (K-C7'nin harf duyarlılığı kararı yalnızca YORUM temizliği içindi, ifade taraması için gerekçelendirilmemiş). — Sorumlu ajan: `db`
ÖLÇÜMLER:
  - Denenen vektör: 20 (V1, V1b, V1c, V2, V3, V4a, V4b, V5, V5-kontrol, V6, W0, W1, W2, W3, W4, W5×4, W6, W7, W8)
  - İncelenen dosya: 4 (3 teslimat + `git show HEAD:migration-sql.test.ts` eski hâl) · ~770 satır yeni/değişen
  - Bulgu dağılımı: critical 0 · high 1 · medium 0 · low 4
  - `pnpm audit`: KOŞTURULMADI — gerekçe: `git diff HEAD --name-only` ile `pnpm-lock.yaml`, kök ve paket `package.json` dosyalarının DEĞİŞMEDİĞİ doğrulandı; yeni bağımlılık yok (yeni dosyalar yalnızca `node:fs/os/path/url` kullanıyor)
  - Tenant izolasyon listesi (CLAUDE.md §7): karşılanmayan madde YOK — yeni tablo/kolon/endpoint/prosedür/kuyruk işi/indeks/önek/anahtar eklenmiyor, 14 maddenin tamamı yapısal olarak N/A. Listenin 1-3. maddelerinin MEKANİK BEKÇİSİ bu değişikliğin konusu; bulgu 1 o bekçide yeni bir kör nokta bırakıyor
  - Eski/yeni değişmez karşılaştırması: 5 değişmezden **4'ü korunmuş veya genişlemiş, 1'i daralmış** (ayrıntı aşağıda)
```

---

## Yüzey 1 — Güvencenin daraltılması (eski/yeni değişmez karşılaştırması)

`git show HEAD:packages/db/src/__tests__/migration-sql.test.ts` ile satır satır karşılaştırıldı.

| #   | Değişmez                                   | Eski hâl                                                                                                          | Yeni hâl                                                                             | Sonuç                                                                                              |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | tenant tablosu `tenant_id TEXT NOT NULL`   | `extractCreateTableBody` bulamazsa FIRLAT + `toContain('"tenant_id" TEXT NOT NULL')`, yalnızca `_init` dosyasında | `MISSING_TENANT_SCOPED_TABLE` + `MISSING_TENANT_ID_COLUMN`, kümülatif                | **GENİŞLEDİ** — "hiç yaratılmamış" ile "kolonu yok" artık ayrı kurallar, küme geneline uygulanıyor |
| 2   | Yaratılan her tablo taksonomide            | `/CREATE TABLE "([^"]+)"/g` (**gevşek ad deseni**) → `knownTables.has(name)`                                      | `/CREATE TABLE "..." \(...\n\);/` (**tam blok deseni**) → `UNCLASSIFIED_TABLE`       | **DARALDI → bulgu 1 (high)** — biçimi sapan `CREATE TABLE` artık hiç görülmüyor                    |
| 3   | `tenant_id` taşıyan tablo platformda değil | Aynı gevşek ad deseni + `not.toContain('"tenant_id"')`                                                            | `TENANT_ID_ON_PLATFORM_TABLE`, ilk yaratımın gövdesinde                              | **Kural korundu, GİRDİSİ daraldı** — bulgu 1 ile aynı kök neden                                    |
| 4   | `tenant_id` öncü kolonlu UNIQUE INDEX      | `CREATE UNIQUE INDEX "[^"]+" ON "<t>"\("tenant_id",` — yalnızca `_init` metninde                                  | **Birebir aynı regex**, `cumulativeNormalizedSql` üzerinde                           | **KORUNDU + GENİŞLEDİ** — indeks sonraki bir migration'da da olabilir                              |
| 5   | Yıkıcı tarama (`DROP `, `SET NOT NULL`)    | Ham `_init` metninde `not.toContain` ×2                                                                           | Aynı iki jeton, `--` yorumları temizlenmiş metinde, **her** migration için ayrı ayrı | **Dizin kapsamı GENİŞLEDİ** (1 → N) · metin kapsamı K-C7 gereği kasıtlı daraldı (bulgu 2, `low`)   |

Ampirik kanıt (bulgu 1):

```
===== V1: tek satirlik CREATE TABLE (tenant_id tasiyan, taksonomide YOK) =====
ESKI regex tablo adlari : [ 'invoice' ]          <- eski kod tabloyu GORURDU (UNCLASSIFIED ihlali)
YENI collect ihlalleri  : []                      <- yeni kod TAMAMEN KOR
===== V1b: girintili kapanis parantezi =====
ESKI regex tablo adlari : [ 'invoice' ]
YENI collect ihlalleri  : []
===== V1c: PLATFORM tablosu tek satirda tenant_id tasiyor (ters kontrol) =====
YENI collect ihlalleri  : []                      <- TENANT_ID_ON_PLATFORM_TABLE da kor
===== V2: ayni SQL, tablo taksonomide YAZILI ise =====
YENI collect ihlalleri  : [ 'MISSING_TENANT_SCOPED_TABLE' ]   <- ileri yon kurtariyor
===== V3: CRLF =====
YENI collect ihlalleri  : [ 'UNCLASSIFIED_TABLE' ]            <- CRLF SORUN DEGIL
```

K-C7 kasıtlı değişikliği doğrulandı, gevşeme olarak yazılmadı:

```
===== V6: yorum icinde DROP -> yanlis pozitif YOK (K-C7 kasitli) =====
[]
```

Gerçek `prisma/migrations/20261026082729_init/migration.sql` biçimi kontrol edildi:
`CREATE TABLE "x" (` … `\n);` (0. kolonda kapanış) → **bugünkü tek migration katı deseni
karşılıyor**, gerçek repo süitinin 6 vakası doğru sebeple yeşil. Kör nokta yalnızca
gelecekteki (özellikle elle yazılacak) migration'larda açılıyor.

## Yüzey 2 — `rmSync(..., { recursive: true, force: true })` → `critical` sınıf **gerçekleşmiyor**

Kaynak incelemesi + ampirik doğrulama:

- `const root = mkdtempSync(join(tmpdir(), 'arkesoft-migration-set-'))` — `rmSync` hedefi
  **tam olarak** `mkdtempSync` dönüş değeri; `join`/`dirname`/`resolve`/`new URL`/string
  birleştirme ile **türetilmiyor**. `rootUrl` yalnızca `run()`'a geçirilir, silmede
  kullanılmaz.
- `try` bloğu `mkdtempSync` çağrısından **sonra** başlıyor → `mkdtempSync` fırlarsa `finally`
  **hiç koşmaz**; tanımsız/boş hedefle `rmSync` imkânsız.
- `root` boş string, `/`, `tmpdir()`'ın kendisi veya repo içi bir yol olamaz (`mkdtempSync`
  ya benzersiz bir alt dizin döner ya fırlatır).
- `run()` fırlattığında kök yine siliniyor (W2: `kok silindi mi: true`), `tmpdir()` ayakta
  (W1: `tmpdir hala var mi: true`), süit sonrası `arkesoft-migration-set-*` artığı **yok**
  (W0/W8: `[]`).
- `rootUrl` sonunda `/` ile üretiliyor (W1: `kok sonunda / var mi: true`) **ve** okuyucu
  tarafındaki `withTrailingSlash` savunmacı normalizasyonu K-C10'u ikinci kez garanti
  ediyor — dbg2'de `/` ile biten taban üzerinden `_normal` dizini doğru okundu. Son segment
  düşmesi (K-C10'un endişesi) **gerçekleşmiyor**.

→ **`critical` bulgu yok.** Tek kalan yüzey, çağıranın verdiği `directoryName` ile kök
**dışına yazma** (bulgu 3, `low`) — silme hedefini etkilemiyor.

## Ayrıca bakılanlar

| Kontrol                                                 | Sonuç                                                                                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R5** — yeni dosyalar DB'ye dokunuyor mu               | **TEMİZ.** Toplam 5 import, hepsi `node:fs` / `node:os` / `node:path` / `node:url`. `test-client.ts`/`env.ts`/`client.ts`/`guard-policy.ts` **yok** |
| **K-C4** — yardımcıda `vitest`/`expect`                 | **TEMİZ.** Yalnızca yorum metinlerinde geçiyor, import veya çağrı yok                                                                               |
| **K-C8** — muafiyet mekanizması kurulmuş mu             | **KURULMAMIŞ** (doğru). `allow                                                                                                                      | exempt | skip | ignore | bypass | options` taramasında tek eşleşme bir yorum satırı; hiçbir parametre/opsiyon yok |
| Sır / PII                                               | **TEMİZ.** 3 dosyada parola, token, API anahtarı, özel anahtar, bağlantı dizesi, e-posta, TCKN, kart deseni **yok**                                 |
| `src/index.ts` · `tenancy.ts` · `prisma/**`             | **DEĞİŞMEMİŞ** (`git status --porcelain` o yollarda boş) → AC10/AC11 tarafı güvenlik açısından temiz                                                |
| `any` / `as` / `@ts-ignore`                             | **YOK**                                                                                                                                             |
| Enjeksiyon yüzeyi                                       | Ham SQL **çalıştırılmıyor** — SQL metni yalnızca okunuyor/üretilip diske yazılıyor. Komut çalıştırma, HTML, yönlendirme yüzeyi yok                  |
| `new RegExp` içine tablo adı interpolasyonu (satır 281) | Girdi repo içi taksonomi sabiti (`tenancy.ts`), dış dünya değil → kaçışsız interpolasyon kabul edilebilir. Eski kod da aynıydı                      |
| KVKK / kişisel veri                                     | N/A — kişisel veri toplanmıyor, saklanmıyor                                                                                                         |
| Oran sınırlama / SSRF / dosya yükleme / ödeme / yetki   | N/A — bu değişiklikte ağ isteği, HTTP ucu, prosedür, ödeme akışı veya yetki kararı yok                                                              |

**Kapsam dışı olduğu doğrulanan (bulgu değil):** `ALTER TABLE … ADD COLUMN "tenant_id"`
tespiti yok — `TENANT_ID_ON_PLATFORM_TABLE` yalnızca ilk yaratımın gövdesine bakıyor.
PM kararı 2 bunu açıkça v0.0.13'e bıraktı ve AC10 yeni `low` borç satırı istiyor; bu gate
onu **R-C2'nin bağlayıcılığını teyit ederek** kabul ediyor.

## Prob yöntemi ve dokunulmazlık kanıtı

Tüm vektörler scratchpad'de üç salt-okuma script'i ile koşturuldu
(`node --experimental-strip-types`, yardımcılar mutlak yoldan dinamik import edildi).
Repo dosyalarına **yazılmadı**:

```
=== PROB SONRASI git status (repo dosyalari degismedi kaniti) ===
 M packages/db/src/__tests__/migration-sql.test.ts
?? .claude/workflow/reviews/T-004-qa-tur1.md
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

(oturum başındaki durumla birebir aynı) · `arkesoft-*` geçici artığı yok ·
`git commit`/`push`/`gh` yazma komutu ve yıkıcı DB komutu **çalıştırılmadı**.

## FAIL gerekçesi

`AGENT_BASELINE.md` §4: **en az bir `high` bulgu → FAIL**. Bulgu 1 düzeltilip tekrar
koşturulmalı. 4 `low` bulgu FAIL üretmez; bulgu 1 düzeltilirse bulgu 3-5 teknik borca
kaydedilebilir, bulgu 2 zaten R-C4 ile belgeli.

# T-005 · `solid` gate · Tur 3 (son düzeltme turu doğrulaması)

Tarih: 2026-10-29 · Sürüm: **v0.0.13** · Dal: `main` (commit atılmadı)

```
GATE: solid
SONUÇ: PASS
```

> **Araç kısıtı:** `Bash` yok. Hiçbir komut çalıştırılmadı; satır/kural sayımları
> `Read`/`Grep` ile elle yapıldı. `lint`/`typecheck`/`test`/`test:isolation`/`build`/
> `format:check` sayıları Orkestratör ölçümüdür — burada **ölçülemedi (araç yok)**.

---

## 1. Tur 2'nin 13 satırının durumu

| #    | Tur 2 bulgusu                                                   | Durum                                                  | Kanıt (dosya:satır)                                                                                                                                                                                                                                                     |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1   | [med] `['migrate','deploy']` ÜÇ yerde                           | **KAPANDI**                                            | Üretim kodunda jeton çifti **tek** yerde: `guard-policy.ts:312-313` (`CommandSpec`:213-219, `COMMANDS`:263-318, karar `:427-432`). `run-guarded-prisma.ts`'te yalnızca **tarihsel yorum** (`:36`, `:214`); iki yüklem fiilen **silinmiş**                               |
| M2   | [med] `expressionReferencesSetting` alt dize araması            | **KAPANDI** (mekanizma değişti)                        | Yardımcı silindi; `buildCanonicalPolicyExpression()`:175-177 + `isCanonicalPolicyExpression()`:197-199 **tam eşitlik**. 8 atlatma fixture'ı `catalog-lint.test.ts:286-334`, canlı deparse kanıtı `catalog-lint-live.isolation.test.ts:202-244`. Ayrı değerlendirme → §3 |
| low  | `docs/development.md:264, :285-286` ters liste + `beforetesi`   | **KAPANDI**                                            | `:264` sarmalı komut listesi, `:285-286` `db:deploy` artık **sarmalı**; `beforetesi` repoda **yok** (grep)                                                                                                                                                              |
| low  | `test-client.ts:22-26, :76-79` migrator "RLS'e tabi değil"      | **KAPANDI**                                            | `:22-32` ve `:82-92` — iddia açıkça **yanlış** ilan edildi, gerekçe (yalnızca katalog introspection'ı) yazıldı                                                                                                                                                          |
| low  | `run-guarded-prisma.ts:48-49, :250-252` "dört" ama beş          | **KAPANDI**                                            | `:57-59` "Diğer **beş** sarmalanmış komut (migrate dev, migrate reset, db push, db seed, studio)"                                                                                                                                                                       |
| low  | `prisma.module.ts:9-10` bayat yorum                             | **KAPANDI**                                            | `:9-11` tarihsel satır "AŞAĞIDAKİ GÜNCELLEME NOTUNDA … zaten EKLENDİ" ile birleştirildi                                                                                                                                                                                 |
| low  | `catalog-lint.ts:87` `TenantIsolationTaxonomy` ölü export       | **KAPANDI**                                            | `:135` artık modül-içi `type`; gerekçe `:130-133`; kullanım `:142`, `:438`. Repoda hiçbir import yok (grep)                                                                                                                                                             |
| low  | `prepare-db/action.yml:56` 150+ karakterlik adım adı            | **KAPANDI** (yeni bayat yorum doğdu)                   | `:59` ad 32 karakter, gerekçe `:56-58`'e taşındı — **ama** o yorum silinmiş bir fonksiyona atıfta → **B3 (low)**                                                                                                                                                        |
| low  | `bootstrap-roles.sql:130` `_prisma_migrations` fazla yetki      | **KISMEN**: CI'da kapandı, **yerelde açık**            | `IF EXISTS` korumalı `REVOKE` `:183-191` + 20'nci kural `catalog-lint.ts:498-524` + CI 2. geçiş `action.yml:76-78`. **Belgelenen yerel kurulum sırası düzeltilmedi** → **B1 (medium)**                                                                                  |
| AÇIK | indeks kuralı çelişkisi                                         | **AÇIK (ertelendi)**                                   | `migration-set.ts:632-642` (UNIQUE + `"tenant_id",` → ≥2 kolon) ↔ `catalog-lint.ts:280-289` (herhangi bir indeks, tek kolon yeter). **Aynen duruyor**                                                                                                                   |
| AÇIK | `bootstrap-roles.ts` ↔ `run-guarded-prisma.ts` ~70 satır tekrar | **AÇIK — satır sayısı BÜYÜMEDİ, ama DAVRANIŞ AYRIŞTI** | `bootstrap-roles.ts:62-159` ↔ `run-guarded-prisma.ts:97-207` ≈ **70 satır** (aynı). Yeni ayrışma: `isDirectlyExecuted` yalnızca birine uygulandı → **B9 (low)**                                                                                                         |
| AÇIK | çıplak `throw new Error` yerine `AppError`                      | **AÇIK (ertelendi)**                                   | `bootstrap-roles.ts:91, :103`; `catalog-snapshot.ts:228`; `catalog-lint-live.isolation.test.ts:63`. Architect kararı bekliyor                                                                                                                                           |
| AÇIK | `prisma-with-tenant.test.ts` tip pini `type-pins/` dışında      | **AÇIK (ertelendi)**                                   | `apps/api/src/__tests__/prisma-with-tenant.test.ts:88` değişmedi                                                                                                                                                                                                        |

**Ertelenen dört kalem FAIL aritmetiğine KATILMADI** (tur 2'deki gerekçenin aynısı:
gerekçeli erteleme her turda yeniden FAIL üretirse erteleme mekanizması anlamsızlaşır).
Borç satırları **ayakta**.

---

## 2. Brief'in beş sorusu

**1. Yeni bayat yorum doğdu mu? → EVET, dört tane (hepsi low).**
`action.yml:14` (üç adımlı sıra yazıyor, dosyada **dört** adım var) · `action.yml:57`
(silinmiş `requiresDestructiveTargetGuard`'a atıf) · `bootstrap-roles.sql:170-182`
("düzeltilmedi … devops ister", oysa devops **aynı turda** düzeltti) ·
`catalog-lint-live.isolation.test.ts:248` ("üç probdan SONRA", artık **dört** prob).
**Kural sayısı (20) tutarlı:** `catalog-lint.ts:11/:28/:95`, `catalog-snapshot.ts:213`,
`docs/adr/0007:196`, `docs/development.md:367` — hepsi 20. "19" geçen beş yer
(`catalog-lint.ts:61, :72, :341`, `catalog-lint.test.ts:247, :280`) **tarihsel
anlatım**, doğru. **Tek sapma:** `catalog-lint.ts:320` "(19 → 19)" → **B4 (low)**.

**2. Tip disiplini değişmedi.** `any` **0** · `@ts-ignore` **0** ·
`@ts-expect-error` **2** (`client-options.pin.ts:45`, `prisma-with-tenant.test.ts:88`,
ikisi de negatif tip pini) · `as X` **0** (`as const` hariç; `tenant-isolation-suite.ts:103`
yalnızca **yorum**).

**3. Metin bekçisi örtüşmesi ARTMADI.** `MigrationSetRule` 8 kural
(`migration-set.ts:165-173`) **değişmedi**; 20'nci kural (defter **yetkisi**) metin
bekçisinin hiç okumadığı bir alanda. Tablo aynı: **4 anlamsal kopya + 1 çelişki +
1 ayrıştırıcı-koruması + 1 farklı-özne + 1 yeri doldurulamaz**.
**`DESTRUCTIVE_STATEMENT` kararı hâlâ geçerli:** silinen kolon canlı katalogda
**yoktur**, §10.10/expand-contract denetimi yapısal olarak kataloğa taşınamaz.

**4. Ölü kod yok.** `TenantIsolationTaxonomy` export'u **kapandı**. Yeni dışa açık
yüzey `isDirectlyExecuted` (`run-guarded-prisma.ts:267`) — testten **gerçekten**
tüketiliyor (`run-guarded-prisma.test.ts:23`), gerekçesi `:262-265`'te yazılı.
`index.ts` yüzeyi genişlemedi; `catalog-lint`/`catalog-snapshot` bilinçli olarak
paket-içi.

**5. 20/20 kural tetikleniyor (kod okumasıyla).** `catalog-lint.test.ts:132, 145, 159,
173, 185, 199, 210, 218, 228, 241, 261, 383, 397, 409, 424, 448, 469, 491, 517, 551`.
Ayrıca canlı probla dört kural (`catalog-lint-live.isolation.test.ts:128, 162, 188,
237`). **Ölü kural yok.** (Test **çalıştırılmadı** — araç yok.)

---

## 3. M2 kararının değerlendirmesi — architect'in reddine **KATILIYORUM**

Tur 2'de önerdiğim kalıp zorlamasını (`<kolon> = current_setting('<guc>'` + üst seviye
`or`/çıplak `true` reddi) architect **reddetti**; gerekçe `docs/adr/0007:359-373`.
Üç sebeple **haklı**:

1. **Önerim gerçekten atlatılabilir.** `NOT (tenant_id = current_setting(…))` ve
   `(tenant_id = current_setting(…)) IS NOT TRUE` — kalıp **mevcut**, üst seviye
   `or` **yok**, çıplak `true` **yok**, ama anlam **tersine çevrilmiş**. İkisi de
   `catalog-lint.test.ts:311-320`'de **kalıcı regresyon pini** olarak duruyor.
   Bu, R-D1'in "mekanizma yanlış, eşik değil" dersinin aynısıydı; dördüncü sezgisel
   eşiği ben öneriyordum.
2. **Benim asıl itirazım (deparse kırılganlığı) karşılandı — istediğimden daha iyi.**
   (a) Kırılma **fail-closed** (CI kırmızı, sessiz yeşil değil) · (b) bulgu mesajı
   beklenen/gerçek ifadeyi birebir taşıyor ve "şablonu güncelle, karşılaştırmayı
   **gevşetme**" diyor (`catalog-lint.ts:222-229`) · (c) **kritik olan:** canlı prob
   vakası (d) her `test:isolation` koşumunda, koşan Postgres'in **kendi** deparse
   çıktısının `buildCanonicalPolicyExpression()` şablonuyla eştiğini kanıtlıyor
   (`catalog-lint-live.isolation.test.ts:202-244`, `POLICY_USING_NOT_CANONICAL`'ın
   **yokluğu** iddia ediliyor). Sürüm sapması artık varsayım değil, **ölçülen** bir şey.
3. **Hatanın yönü doğru:** aşırı kısıtlılık (yanlış kırmızı), eksik kısıtlılık
   (yanlış yeşil) değil. Bir güvenlik bekçisi için ev doktrini bu (§10.6).

**Kalan iki not (bulgu değil):**

- **Mimari kısıt genişledi:** "bir tablo, bir kanonik politika" artık platform
  seviyesi bir kısıt (`docs/adr/0007:242-245`). İleride meşru bir ikinci yüklem
  (soft-delete, paylaşılan satır) gerektiğinde gevşetme baskısı doğacak. ADR'ye
  yazılmış olması doğru yer; Orkestratörün bilmesi için **risk** olarak bildiriyorum.
- Çoğulluk (`policies.length > 1`) ayrı bir kural koduyla değil mevcut iki kodla
  raporlanıyor → mesajın **ilk cümlesi** ("BİREBİR eşleşmiyor") ifade kanonikken
  bile yazılıyor. Mesajın `multiplicityNote`'u (`catalog-lint.ts:218-221`) bunu
  **açıkça** düzelttiği için **bulgu yazmıyorum**; K-E5 madde 6'nın bilinçli kararı.

---

## 4. Yeni inceleme yüzeyi — yargılar

### 4.1 `catalog-lint.ts` boyutu ve bölünme

**587 satır** (tur 1: 346 · tur 2: 399). Büyümenin büyük kısmı **yorum**: dosya başı
blok `:1-91` (91 satır) + K-E5 revizyon JSDoc'ları. `lintTenantScopedTable`
**132 → 167 satır** (`:237-403`), 20 kuralın **12'sini** taşıyor. Yeni 20'nci kural
**kendi fonksiyonuna** gitti (`lintMigrationsLedgerPrivilege:498`) — doğru desen, bu
yüzden büyüme yeni kuraldan **değil** açıklama yorumlarından geldi. **20 kural tek
dosyada hâlâ savunulabilir** (hepsi tek soruyu yanıtlıyor: "canlı şema taksonomiyle
tutarlı mı"; girdi tek `CatalogSnapshot`; dosya **saf**). Bölünme gerekirse önce
**fonksiyon** seviyesinde olmalı → **B10 (low)**.

### 4.2 `guard-policy.ts` — `CommandSpec` genişlemesi **zarif**

`reject` dalında `role`/`requiresTargetGuard`'ın **yapısal olarak okunamaması**
discriminated union'ın aşırı yüklenmesi **değil**, tam tersi: "komut eşleşmediyse rol
kararı **yoktur**" bilgisi tipte yaşıyor; çağıran yanlışlıkla varsayılan bir rol
okuyamıyor (`run-guarded-prisma.ts:222-234` erken `fail()`). Ayrıcalık sınırı artık
komut tanımının **yanında** (`:250-262` gerekçe tablosu + `:263-318` veri) —
"karar verisi tek satırda" ilkesinin ders kitabı uygulaması. **Bulgu yok.**

### 4.3 `isDirectlyExecuted()` test edilebilir mi → **evet, ama yarısı**

`false` yolu gerçekten test ediliyor (`run-guarded-prisma.test.ts:36`); `true` yolu ve
`:284`'teki yeniden-fırlatma dalı **test edilmiyor** (ikisi de alt süreç spawn'ı ister).
Yeni test edilemez ada **doğmadı** — asıl karar (`role`/`requiresTargetGuard`)
`guard-policy.ts`'in **saf** motoruna taşındığı için orada, tablo tabanlı pinlenmiş
(`guard-policy.test.ts:192-215`). **Doğru yer bu.** Kalan iki boşluk → **B8 (low)**.

### 4.4 `run-guarded-prisma.test.ts` yeterli mi → **sınırda yeterli**

İki testin **ikinci**si gerçek bir iddia. **Birinci**sinin değeri assertion'ında değil
**import satırında** (`:23`): `main()` yeniden koşulsuz çağrılsa modül yüklenirken
`process.exit(1)` olur ve dosya **çöker** → regresyon gerçekten yakalanır. Yani
davranış pinli; tautolojik `expect(true).toBe(true)` yalnızca **okuyucuya** hiçbir şey
söylemiyor → **B7 (low)**.

### 4.5 `catalog-lint.test.ts` fixture kalitesi → **davranış pinliyor, kopyala-yapıştır değil**

Sekiz atlatma `describe.each` tablosuyla (`:286-334`), üç defter fixture'ı `it.each`
ile (`:502-519`). Her test **tek** sapma uygulayıp **hem** beklenen kuralın düştüğünü
**hem** komşu kuralın düşmediğini iddia ediyor (`:242, :262-263, :274, :353`) — yani
kural **ayrımı** da pinli. Uygulamayı değil davranışı pinliyor: `isCanonicalPolicyExpression`
hiçbir testte doğrudan çağrılmıyor, hepsi `lintCatalog` üzerinden. Mock **yok**.
`:356-374` ikinci politika vakası gerçek bir negatif. **Bulgu yok.**

### 4.6 `catalog-lint-live.isolation.test.ts` vaka (d) → **desene uyuyor**

K-E11 aynen: `CREATE TABLE` → **aynı `tx`** → sentinel `ROLLBACK`, `DROP` yok
(`:205-230`). Yetim tablo kontrolü dört probu da kapsıyor (önek eşleşmesi, `:249-256`).
Vaka (d) bu turun **yük taşıyan** testi (bkz. §3.2c). **Bulgu yok** — ama test adı
"üç prob" diyor (**B6**).

### 4.7 `bootstrap-roles.sql` yorum/kod oranı → **şişme değil, kuyruğu bayat**

Bölüm 6: 34 satır yorum / 9 satır kod. Yorumun **ilk üçte ikisi yük taşıyor**
(`IF EXISTS` **neden zorunlu** — koşulsuz `REVOKE` taze DB'de patlar ve FIX 1'in
kritik düzeltmesini yeniden kırar; bu bilgi olmadan biri `IF EXISTS`'i "gereksiz"
diye siler). **Son üçte biri (`:170-182`) artık yanlış** → **B3**.

### 4.8 `prepare-db/action.yml` ikinci geçişin gerekçesi → **yeterince açık**

`:63-75` ikinci `db:bootstrap`'ın **neden** gerekli olduğunu, **neden** `seed`'den önce
olduğunu ve dosyanın idempotent olduğunu yazıyor. Biri bunu "gereksiz tekrar" sanıp
silemez. **Bulgu yok** (ama `:14` üç adım diyor → **B2**).

### 4.9 ADR-0007 → **hâlâ bir ADR, değişiklik günlüğü değil**

**498 satır.** Yapı korunmuş (Bağlam → Karar (9) → Alternatifler → Olumlu/Olumsuz →
**Reddedilenler** → Geri Alma → Varsayımlar → Riskler → Notlar). Karar 7'deki
"FIX tur 1 + tur 2" anlatımı (`:210-232`) günlük gibi **görünüyor** ama işlevi
**kararın gerekçesi**: reddedilen alternatifi ve **neden** reddedildiğini kaydediyor
— ADR'nin asıl işi bu. "Reddedilenler" bölümünün kendi gerekçesi (`:372`) da bunu
söylüyor: yazılı kayda girmezse v0.0.14'te yeniden önerilir. **Bulgu yok**; iki bozuk
sözcük + bir yanlış teknik iddia → **B11**.

### 4.10 Katman, bağımlılık yönü, soyutlama, hata deseni → **temiz**

- `packages/db` → `packages/config` (`guard-policy.ts:54`); ters yön **yok** → döngü yok.
  `apps/api` → `packages/db` yönü korunuyor; `packages/db`'de `apps/*` import'u **yok**.
- `packages/ui`/`trpc` bu turda dokunulmadı; iş mantığı sunum katmanında **yok**.
- Sağlayıcıya özgü dallanma **yok**; taksonomi **ve** GUC adı hâlâ **parametre**
  (`catalog-lint.ts:141-146`) — AC9/AC4 mekanizması gerçek.
- Yutulan hata **yok**. Tek yeni `catch` (`run-guarded-prisma.ts:274-285`) **tek** bir
  beklenen hata sınıfını (`ENOENT`) anlamlı bir karara çeviriyor, **diğerini yeniden
  fırlatıyor** ve gerekçesi yazılı → §10.16 ihlali değil.
- Gerçek tekrar: yalnızca bilinen `bootstrap-roles.ts` ↔ `run-guarded-prisma.ts`
  ikizliği (ertelendi, **B9**). `tokens`/`spawnArgs`'ın aynı spec içinde benzer
  görünmesi tekrar **değil** (`migrate reset` ikisinin ayrıştığını kanıtlıyor).

---

## 5. BULGULAR

```
BULGULAR:
  - [SEV: medium] docs/development.md:228-233 — belgelenen TAZE kurulum sırası (bootstrap → deploy → seed) B3 düzeltmesini yereldeki geliştiriciye HİÇ uygulamıyor: ilk bootstrap'ta `_prisma_migrations` yok → `IF EXISTS` REVOKE no-op (bootstrap-roles.sql:183-191), `migrate deploy` tabloyu migrator'la yaratınca ALTER DEFAULT PRIVILEGES (bootstrap-roles.sql:136-137) `arkesoft_app`'e INSERT/UPDATE/DELETE veriyor → yeni 20'nci kural (catalog-lint.ts:509) düşüyor → `pnpm test:isolation` (catalog-lint-live.isolation.test.ts:94 `expect(findings).toEqual([])`) belgeyi birebir izleyen geliştiricide KIRMIZI. CI 2. bootstrap geçişiyle kapatıldı (prepare-db/action.yml:76-78), yerel yol kapatılmadı — `db:deploy`'dan SONRA ikinci bir `pnpm db:bootstrap` satırı ekle, gerekçesi action.yml:63-75'te hazır — docs (mekanizma: devops/db'de çözülmüş)
  - [SEV: low] .github/actions/prepare-db/action.yml:14 — başlık "SIRA BAĞLAYICI: bootstrap → deploy → seed" diyor; dosya artık DÖRT adım (ikinci bootstrap :76) — başlığı dört adıma güncelle — devops
  - [SEV: low] .github/actions/prepare-db/action.yml:57 — yorum `requiresDestructiveTargetGuard` istisnasından bahsediyor; o fonksiyon FIX 2'de TAMAMEN SİLİNDİ (guard-policy.ts:48), bugünkü ad `CommandDecision.requiresTargetGuard` — adı düzelt — devops
  - [SEV: low] packages/db/sql/bootstrap-roles.sql:170-182 — kapanış paragrafı "düzeltilmedi: … REVOKE'un deploy'dan SONRA bir KEZ daha koşması gerekir, bu packages/db dışında (devops) bir değişiklik ister … v0.0.14 borcu" diyor; devops bunu AYNI FIX turunda yaptı (action.yml:63-78). Okuyan "boşluk hâlâ açık" sanır — paragrafı "CI'da ikinci geçişle kapatıldı; YEREL kurulum için docs/development.md" olarak güncelle — db
  - [SEV: low] packages/db/src/catalog-lint.ts:320 — "Yeni kural kodu EKLENMEDİ (19 → 19)" ifadesi, kural sayısının 19 → 20 olduğu turda yazıldı; dosya başı (:28-31) ve tip (:95) 20 diyor. Tek sayısal tutarsızlık — "yeni kural KODU eklenmedi; toplam 20" diye yaz — db
  - [SEV: low] packages/db/src/catalog-snapshot.ts:171-182 ↔ packages/db/src/catalog-lint.ts:314-321 ↔ docs/adr/0007-rls-ve-rol-ayrimi.md:242-245 — anlık görüntü `pg_policies.permissive`/`cmd` kolonlarını HİÇ okumuyor; "AS RESTRICTIVE eki ve komut bazlı bölünmüş politika bulgu üretir" iddiası yalnızca `policies.length > 1` iken doğru. TEK bir `AS RESTRICTIVE` veya `FOR UPDATE` politikası kanonik ifadeyle linteri TEMİZ geçer (sonuç varsayılan-RET, yani fail-closed → sızıntı değil, ama belgelenen garanti uygulamadan GENİŞ) — ya iki kolonu oku ve `PERMISSIVE`/`ALL` iddia et, ya iddiayı daralt — db + docs
  - [SEV: low] packages/db/src/__tests__/catalog-lint-live.isolation.test.ts:248 — test adı "üç probdan SONRA" diyor; bu turda dördüncü prob eklendi (describe :97 "dört vaka") — adı dörde çek — db
  - [SEV: low] packages/db/src/__tests__/run-guarded-prisma.test.ts:32 — `expect(true).toBe(true)` tautolojik; davranışı pinleyen şey :23'teki import (main() koşulsuz çağrılsa dosya çökerdi) ama assertion bunu SÖYLEMİYOR — import edilen yüzeye dair anlamlı bir iddiaya çevir (örn. `expect(typeof isDirectlyExecuted).toBe('function')`), açıklama yorumu kalsın — db
  - [SEV: low] packages/db/src/run-guarded-prisma.ts:288-290 (ve :267-286) — `isDirectlyExecuted()` false dönerse CLI HİÇBİR ŞEY YAPMADAN exit 0 verir; pozitif yol (true) ve :284'teki yeniden-fırlatma dalı testsiz (ikisi de alt süreç spawn'ı ister). Sahte-yeşil dedektörü zorunlu kılan bir repoda sessiz exit 0 bir yüzeydir — ya eşleşmeyen dalda stderr'e tek satır uyarı yaz, ya spawn tabanlı tek bir pozitif test ekle — db
  - [SEV: low] packages/db/src/bootstrap-roles.ts:177 (ve :62-159 ↔ run-guarded-prisma.ts:97-207) — ikiz CLI'da `main()` hâlâ modül yüklenirken çağrılıyor; B1'in import güvenliği düzeltmesi ikizlerden YALNIZCA birine uygulandı. Tekrar ~70 satırda kaldı (büyümedi) ama artık DAVRANIŞ olarak ayrışıyor — ertelenmiş `src/prisma-cli.ts` çıkarımı (v0.0.14) `isDirectlyExecuted`'i de taşımalı — db + architect (ertelenmiş borcun kapsam notu)
  - [SEV: low] packages/db/src/catalog-lint.ts:237-403 — `lintTenantScopedTable` 132 → 167 satır, 20 kuralın 12'sini (kolon/indeks/RLS/politika/rol kısıtı) tek fonksiyonda taşıyor; beş ayrı sebeple değişir. Bu turda içine YENİ kural girmedi (20'nci kendi fonksiyonunu aldı, :498) ve büyüme çoğunlukla yorum — bu yüzden low: bir sonraki kural öbeği bu fonksiyona girerse medium olur. `lintTenantIdColumn`/`lintRowSecurity`/`lintPolicies` olarak böl — db (v0.0.14)
  - [SEV: low] docs/adr/0007-rls-ve-rol-ayrimi.md:372, :444, :497-498 — ":372 \"alternatifix\"" ve ":444 \"boş dış'ta\"" bozuk sözcükler (`beforetesi` sınıfının aynısı); ":497-498 \"Prisma v7+ `@db.GeneratedValue('ALWAYS')` ile tetikleme otomatikleştirecek; RLS elle yazılmak zorunda\"" — böyle bir Prisma özniteliği yok ve RLS ile nedensel bağı kurulamıyor; "neden el yazısı SQL" sorusunun gerekçesi yanlış — düzelt veya cümleyi kaldır — docs
  - [SEV: low] docs/development.md:251 — "parolası … bootstrap-roles.sql satır 42'dedir": :42 bir bölüm başlığı yorumu, parola :48 ve :69'da. Satır numarası referansı kırılgan — sabit değeri veya bölüm adını referans ver — docs
ÖLÇÜMLER: incelenen dosya 19 (13 tam, 6 kısmi) · `any` 0 · `@ts-ignore` 0 · `@ts-expect-error` 2 (meşru) · `as X` 0 · 20/20 kural testle tetikleniyor (kod okumasıyla) · en büyük fonksiyon `lintTenantScopedTable` 167 satır (catalog-lint.ts:237-403; tur 2: 132, tur 1: 101), ikincisi `createTenantIsolationSuite` 146 satır (tenant-isolation-suite.ts:136-281, değişmedi) · `catalog-lint.ts` 587 satır (tur 2: 399, tur 1: 346) · `guard-policy.ts` 433 · `run-guarded-prisma.ts` 290 · `catalog-lint.test.ts` 569 · `bootstrap-roles.sql` 191 · `docs/adr/0007` 498 · komut çıktısı: ölçülemedi (araç yok)
```

### Öneriler (ihlal DEĞİL — dayanak yok, stil/okunabilirlik)

- `guard-policy.test.ts:114-166` ↔ `:193-210` — altı komutun `role`/`requiresTargetGuard`
  değeri **iki kez** iddia ediliyor (ilki `toEqual` ile tüm şekli, ikincisi `it.each` ile
  ayrıcalık sınırını). Savunulabilir (farklı sorular) ama rol eşlemesi değişirse iki yer
  güncellenir.
- `isCanonicalPolicyExpression`/`isPublicPolicy`/`isDirectlyExecuted` — tur 2'de kalan
  `is`/`has`/`can` önek eksikliği (eski `expressionReferencesSetting`,
  `requiresDestructiveTargetGuard`) bu turda **kendiliğinden kapandı**; yeni yüklemlerin
  **hepsi** CLAUDE.md §4 tablosuna uyuyor. Kayıt için.

---

## 6. Sonucun aritmetiği (AGENT_BASELINE §4)

0 critical · 0 high · **1 medium** (B1) · 12 low → **1–2 medium = PASS**,
bulgular teknik borca kaydedilir.

Ertelenmiş dört kalem (indeks çelişkisi, ikiz CLI tekrarı, `AppError`, tip pini yeri)
bu aritmetiğe **dahil edilmedi** — gerekçeli erteleme kararı Orkestratöre ait, borç
satırları **silinmemeli**.

**Tur 2'nin iki medium'u (M1, M2) da gerçekten kapandı** ve ikisi de doğru yerde:
M1 karar verisini tanımın yanına taşıyarak (jeton artık üretim kodunda **tek** yerde),
M2 ise mekanizmayı değiştirerek — benim önerdiğim sezgisel kalıp **reddedildi** ve
reddin gerekçesi (iki atlatma vektörü) **kalıcı regresyon pini** olarak teste yazıldı.
Bu turda bulduğum tek medium (B1) **yeni bir kusur değil**, tur 2'nin low bulgusunun
düzeltilmesinin **yarım kalan yarısı**: CI kapandı, belgelenen yerel yol kapanmadı.

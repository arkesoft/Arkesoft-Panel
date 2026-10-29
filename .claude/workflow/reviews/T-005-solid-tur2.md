# T-005 · `solid` gate · Tur 2

Tarih: 2026-10-28 · Sürüm: **v0.0.13** · Dal: `main` (commit atılmadı)

```
GATE: solid
SONUÇ: PASS
```

> **Araç kısıtı:** bu turda `Bash` yoktu. Hiçbir komut çalıştırılmadı; satır/kural
> sayımları `Read`/`Grep` ile elle yapıldı. `lint`/`typecheck`/`test`/`build`
> sayıları Orkestratör ölçümüdür, burada tekrar doğrulanmadı — **ölçülemedi (araç yok)**.

---

## 1. Tur 1'in 13 bulgusunun durumu

| #   | Tur 1 bulgusu                                                                | Durum                                        | Kanıt (dosya:satır)                                                                                                                               |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **[high]** `POLICY_WRONG_SETTING` `\|\|` → `WITH CHECK (true)` temiz geçiyor | **KAPANDI**                                  | `catalog-lint.ts:221-241` iki bağımsız dal; `catalog-lint.ts:64-65` iki ayrı kural kodu; `catalog-lint.test.ts:247-260` tam o politikayı pinliyor |
| 2   | [med] indeks kuralı çelişkisi                                                | **AÇIK (ertelendi)**                         | `migration-set.ts:632-642` (UNIQUE + ≥2 kolon) ↔ `catalog-lint.ts:171-180` (herhangi bir indeks, tek kolon yeter) — **çelişki aynen duruyor**     |
| 3   | [med] `test-client.ts` bayat yorum (`env.ts` okuyucusu)                      | **KAPANDI** (+ yeni yanlış yorum, L2)        | `test-client.ts:66` `readDatabaseMigrationEnv()` çağrılıyor; `:27-32` yorum güncel                                                                |
| 4   | [med] `bootstrap-roles.ts` ↔ `run-guarded-prisma.ts` ~70 satır tekrar        | **AÇIK (ertelendi)** — **büyümedi**          | `bootstrap-roles.ts:62-130` (≈69 satır) ↔ `run-guarded-prisma.ts:87-158` (≈72 satır). FIX 1'in yeni iki yüklemi bootstrap'a **kopyalanmadı**      |
| 5   | [med] `packages/db`'de çıplak `throw new Error`                              | **AÇIK (ertelendi)**                         | `tenant-context.ts:83-86, :90`; yeni dosyada da aynı desen: `catalog-snapshot.ts:226-228`                                                         |
| 6   | [med] `policies.roles` ölü veri                                              | **KAPANDI**                                  | `catalog-lint.ts:248-254` (`POLICY_RESTRICTED_TO_ROLE`), `:124-126` (`isPublicPolicy`), test `catalog-lint.test.ts:273-281`                       |
| 7   | [med] boolean `is`/`has`/`can` öneki                                         | **KISMEN KAPANDI** → kalanı L1 (low)         | Alanlar: `catalog-snapshot.ts:62-63, :83`; yayılım `tenant-isolation-suite.ts:81-85` **uygulandı**. `expressionReferencesSetting` önek **almadı** |
| 8   | [low] `as unknown as` çift zorlama                                           | **KAPANDI**                                  | `tenant-isolation-suite.ts:111-116` — `JSON.stringify` dizi `replacer`'ı, tip zorlaması yok                                                       |
| 9   | [low] `return captured as T`                                                 | **KAPANDI**                                  | `catalog-lint-live.isolation.test.ts:62-67` — runtime `undefined` kontrolü + `throw`                                                              |
| 10  | [low] erişilemez çift-tırnak dalı                                            | **KAPANDI**                                  | `catalog-lint.ts:116-121` — tek kalıp kaldı, gerekçe `:110-114`                                                                                   |
| 11  | [low] bayat yorumlar (3 dosya)                                               | **2/3 KAPANDI**, `prisma.module.ts` **AÇIK** | `tenancy.ts:26-31` ✔ · `bootstrap-roles.sql:11-17` ✔ · `rollback-roles.sql:16-22, :31-36` ✔ · `prisma.module.ts:9-10` **değişmedi** (L4)          |
| 12  | [low] 8 kullanılmayan `export`                                               | **KAPANDI** — ölü kalan yok                  | `catalog-snapshot.ts:41, 94-100` modül içi; sekizinin **tamamı** dosya içinde kullanılıyor; dışa açık tek tip `CatalogSnapshot:106`               |
| 13  | [low] tip pin'i `it()` gövdesinde                                            | **AÇIK (ertelendi)**                         | `prisma-with-tenant.test.ts:78-91` değişmedi                                                                                                      |

**Ertelenen dört kalem (2, 4, 5, 13) FAIL aritmetiğine KATILMADI.** Gerekçe:
Orkestratör onları gerekçeli olarak v0.0.14'e aldı; gerekçeli erteleme bir sonraki
turda yeniden FAIL üretirse erteleme mekanizması anlamsızlaşır. Borç olarak **ayakta**.

---

## 2. Yeni inceleme yüzeyi — yargılar

### 2.1 `requiresDestructiveTargetGuard` tasarımı (brief sorusu)

**Negatif gövdeli yüklem okunabilir** — `requiresDestructiveTargetGuard` adı pozitif,
gövdesi `!(migrate && deploy)` yani "deploy dışındaki herkes korumaya tabi". Varsayılan
**doğru yönde** (yeni bir komut eklenirse koruma **uygulanır**, atlanmaz). Bu bir stil
tercihi; bulgu değil.

**Tek doğruluk kaynağı ihlali VAR** → bulgu **M1** (aşağıda).

### 2.2 `guard-policy.test.ts` çevirme (reject → allow)

**Meşru.** Davranış bilinçli olarak değişti (`migrate deploy` artık allowlist'te,
`guard-policy.ts:242`); testin eski hâli artık yanlış davranışı pinliyordu. Yeni test
`guard-policy.test.ts:153-157` **gerçek** bir şey pinliyor: `deploy` hiçbir ek bayrak
kabul etmiyor → `--schema=/tmp/x.prisma` ile başka bir şemaya yönlendirme kapalı.
Gevşetme değil, **daraltma**. Bulgu yok.

### 2.3 `base.js` ↔ `packages/db/eslint.config.mjs` DRY'si

**Doğru.** `restrictedImportsOptions` tek yerde (`base.js:38-82`), istisna onu
**filtreleyerek** yeniden kullanıyor (`eslint.config.mjs:13-16`) — liste kopyalanmıyor,
üst listedeki yeni bir yasak istisna dosyasında da **otomatik** yürürlükte. Bu tur 1'in
ruhuna uygun bir düzeltme. `base.js` **261 satır**. Kaldırılan JSDoc anotasyonu → **L6**
(öneri, ihlal değil).

### 2.4 Madde 1'in kararı DEĞİŞMEDİ — örtüşme **artmadı**

Kural kural karşılaştırma, **19 kurala göre güncellendi**:

| Metin bekçisi (`migration-set.ts:165-173`) | Canlı linter karşılığı                     | Yargı                                                     |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------------- |
| `EMPTY_MIGRATION_SET`                      | `EMPTY_CATALOG_SNAPSHOT` (**farklı özne**) | fail-closed, ayrı soru → **kalmalı**                      |
| `UNCLASSIFIED_TABLE`                       | `UNCLASSIFIED_TABLE`                       | anlamca **ikinci kopya**                                  |
| `MISSING_TENANT_SCOPED_TABLE`              | `MISSING_TABLE`                            | anlamca **ikinci kopya**                                  |
| `MISSING_TENANT_ID_COLUMN`                 | `MISSING_TENANT_ID_COLUMN`                 | anlamca **ikinci kopya**                                  |
| `TENANT_ID_ON_PLATFORM_TABLE`              | `TENANT_ID_ON_PLATFORM_TABLE`              | anlamca **ikinci kopya**                                  |
| `MISSING_TENANT_ID_LEADING_UNIQUE_INDEX`   | `MISSING_TENANT_ID_LEADING_INDEX`          | **ÇELİŞİYOR** (tur 1 bulgusu #2, hâlâ açık)               |
| `UNPARSABLE_CREATE_TABLE`                  | —                                          | yalnızca **kendi ayrıştırıcısını** korur                  |
| `DESTRUCTIVE_STATEMENT`                    | —                                          | **yeri doldurulamaz** (silinen kolon canlı katalogda yok) |

FIX 1'in eklediği üç kural (`POLICY_USING_WRONG_SETTING`,
`POLICY_WITH_CHECK_WRONG_SETTING`, `POLICY_RESTRICTED_TO_ROLE`) **politika alanında**;
metin bekçisi politika hiç okumuyor (yalnızca `CREATE TABLE` gövdesi + indeks DDL'i).
→ **örtüşme ARTMADI, 4 kopya + 1 çelişki aynen.** Tavsiye **birebir aynı**:
R-D1 turunda tarayıcı `DESTRUCTIVE_STATEMENT` + `EMPTY_MIGRATION_SET`'e daraltılsın,
dört taksonomi kuralı ve onlara hizmet eden gövde ayrıştırma makinesi silinsin.

### 2.5 19 kuralın hepsi tetikleniyor mu → **EVET, 19/19**

`catalog-lint.test.ts` içinde kural başına en az bir `expect`: `:129, :142, :156, :170,
:182, :196, :207, :215, :225, :238, :257, :280, :294, :306, :321, :345, :366/:376, :388,
:406`. **Ölü kural yok.** Ayrıca üç kural canlı DB probuyla da tetikleniyor
(`catalog-lint-live.isolation.test.ts:123, :157, :183`). (Testler **çalıştırılmadı** —
araç yok; kod okumasıyla doğrulandı.)

### 2.6 Yeni ölü kod → **yok** (bir kullanılmayan `export` kaldı, L5)

`catalog-snapshot.ts`'teki sekiz tipin tamamı modül içinde tüketiliyor;
`CatalogQueryClient:41` imzalarda, yedi `CatalogXRow:94-100` hem sorgu dönüşlerinde hem
`CatalogSnapshot:106-114`'te. `isPublicPolicy`, `EXEMPT_TABLES`, `PROBE_TABLE_PREFIX`,
`testPrisma` takma adı (`health.test.ts:14`, `tenant.test.ts:13`) — hepsi canlı.

### 2.7 Katman, bağımlılık yönü, soyutlama → **temiz**

- `PrismaService.withTenant()` (`prisma.service.ts:65-67`) tek satır delegasyon, iş
  mantığı taşımıyor; `.db` imzası korunmuş (`:52-54`).
- `packages/db` → `packages/config` (`eslint.config.mjs:2`, `guard-policy.ts:43`);
  `packages/config` `db`'ye bağımlı değil → **döngü yok**. `apps/api` → `packages/db`
  yönü korunuyor; `packages/db`'de `apps/*` import'u yok.
- Sağlayıcıya özgü dallanma yok; `catalog-lint.ts` taksonomi **ve** GUC adını
  **parametre** olarak alıyor (`:93-98`) — AC9 mekanizması gerçek.
- Mock yok (gerçek Postgres); `catalog-lint.ts` saf kaldı (DB/`vitest` import'u yok).

### 2.8 Tip disiplini (brief sorusu 4)

| Ölçüm                     | Tur 1                    | Tur 2                                                                                            |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `any`                     | 0                        | **0**                                                                                            |
| `@ts-ignore`              | 0                        | **0**                                                                                            |
| `@ts-expect-error`        | 2 (meşru)                | **2** (`client-options.pin.ts:45`, `prisma-with-tenant.test.ts:88`) — ikisi de negatif tip pin'i |
| `as X` (`as const` hariç) | 3 (biri `as unknown as`) | **0** — üçü de kaldırıldı/gerekçelendirildi                                                      |

---

## 3. BULGULAR

```
BULGULAR:
  - [SEV: medium] packages/db/src/run-guarded-prisma.ts:223-240, :254-257 ↔ packages/db/src/guard-policy.ts:212-243 — komut kimliği ÜÇ yerde ayrı ayrı tanımlanıyor — karar verilerini `CommandSpec`'e alan olarak taşı — db
  - [SEV: medium] packages/db/src/catalog-lint.ts:116-121 — politika yüklemi yalnızca ALT DİZE ile doğrulanıyor; karşılaştırılan kolon ve ifade şekli hiç iddia edilmiyor — yüklemi `<tenant kolonu> = current_setting('<guc>'` kalıbına bağla + üst seviye `OR`/`true` reddet — db (+ architect: K-E5 metni)
  - [SEV: low] docs/development.md:264, :285-286 — "guard'sız script'ler" listesi FIX 1'den sonra TERS; dosya kendisiyle çelişiyor — `db:deploy`/`db:migrate` satırlarını sarmalanmış listeye taşı — docs
  - [SEV: low] packages/db/src/__tests__/helpers/test-client.ts:22-26, :76-79 — yorum `arkesoft_migrator`'ın "RLS'e tabi DEĞİL" ve "her satırı görür" olduğunu söylüyor; FORCE RLS altında ikisi de YANLIŞ (security Tur 1 ampirik: migrator → 0 satır) — yorumu düzelt — db
  - [SEV: low] packages/db/src/run-guarded-prisma.ts:48-49, :250-252 — "Diğer DÖRT sarmalanmış komut" diyor, saydığı BEŞ (migrate dev/reset, db push/seed, studio) — sayıyı düzelt — db
  - [SEV: low] apps/api/src/prisma/prisma.module.ts:9-10 — tur 1'in bayat yorum bulgusu kapanmadı (FIX 1'de kimseye atanmamıştı) — tarihsel satırı GÜNCELLEME notuyla birleştir — backend
  - [SEV: low] packages/db/src/catalog-lint.ts:87 — `TenantIsolationTaxonomy` dışa açık ama hiçbir yerden import edilmiyor (tur 1 bulgusu #12'nin aynı sınıfı) — `export` kaldır veya gerekçe yaz — db
  - [SEV: low] .github/actions/prepare-db/action.yml:56 — adım adı 150+ karakter, gerekçe metnini taşıyor; dosyanın kendi deseni (kısa tırnaklı ad + üstte yorum) bozuluyor — db:deploy adını kısalt, gerekçeyi yoruma al — devops
  - [SEV: low] packages/db/sql/bootstrap-roles.sql:130 — `arkesoft_app` `_prisma_migrations` üzerinde de INSERT/UPDATE/DELETE alıyor; handoff'un "FIX 1'de REVOKE eklendi" iddiasının repoda KARŞILIĞI YOK (tüm repoda tek REVOKE `:146`) — öneri: ledger'dan REVOKE; linter'da "fazla yetki" kuralı yok, kimse yakalamaz — db (security doğrulamalı)
ÖLÇÜMLER: incelenen dosya 24 (19 tam, 5 kısmi) · `any` 0 · `@ts-ignore` 0 · `@ts-expect-error` 2 (meşru) · `as X` 0 (tur 1: 3) · 19/19 kural testle tetikleniyor · en büyük fonksiyon `createTenantIsolationSuite` 146 satır (tenant-isolation-suite.ts:136-281), ikincisi `lintTenantScopedTable` 132 satır (catalog-lint.ts:128-259; tur 1: 101) · `catalog-lint.ts` 399 satır (tur 1: 346) · `base.js` 261 satır · komut çıktısı: ölçülemedi (araç yok)
```

### M1 — komut kimliği üç yerde (medium)

`['migrate','deploy']` jeton çifti **üç** ayrı yerde tanımlı:
`guard-policy.ts:242` (`COMMANDS` allowlist'i, kanonik kaynak),
`run-guarded-prisma.ts:226` (rol çözümlemesi), `run-guarded-prisma.ts:256`
(koruma muafiyeti). Yedinci bir komut eklemek **bir sebep**, **üç dosya noktası**
→ DRY/tek-doğruluk-kaynağı ihlali. Doğru tasarım: `CommandSpec`'e
(`guard-policy.ts:177-181`) `role: 'migrator' | 'app'` ve
`requiresTargetGuard: boolean` alanları eklenip `resolvePrismaCommand`'in kararın
**içinde** döndürmesi; iki yüklem tamamen silinir.

**Hafifletici (severity'yi `high`a çıkarmama gerekçesi):** kayma **gürültülü**.
Rol eşleşmezse `resolveDatabaseRole:239` fail-safe `app`'e düşer → yetki hatası;
muafiyet eşleşmezse `true` döner → koruma uygulanır. İkisi de sessiz yanlış davranış
değil, yüksek sesli başarısızlık.

**Ek not (bulgu değil, ölçüm):** bu kararın iki yükleminin **hiçbir birim testi yok**
ve `run-guarded-prisma.ts:289` modül yüklenirken `main()` çağırdığı için dosya
**import edilemez** → test edilemez. Davranışı pinleyen tek şey CI'nın
`prepare-db` → `db:deploy` adımı (`action.yml:56-58`, sıfırdan Postgres). Tur 1'in
KRİTİK bulgusu tam bu sınıftaydı. `src/prisma-cli.ts` çıkarımı (zaten v0.0.14 borcu)
bu iki yüklemi de saf ve test edilebilir hâle getirir.

### M2 — politika yüklemi alt dizeyle doğrulanıyor (medium)

`expressionReferencesSetting` yalnızca `current_setting('<ayar>'` alt dizesini arıyor.
Doğrulanmayan iki şey: **(a)** yüklemin **hangi kolonu** karşılaştırdığı, **(b)**
ifadenin **şekli**. 19 kuralın tamamından temiz geçen örnekler:

```sql
-- (a) plausible kopyala-yapıştır hatası: yanlış kolon
USING ("owner_id" = current_setting('app.tenant_id', true))
-- (b) mantıksal olarak etkisizleştirilmiş yüklem
WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR true)
```

Tur 1'in `[high]` bulgusunun **sınıfı** kapanmadı, yalnızca en olası örneği
(`WITH CHECK (true)`) kapandı. `high` **demiyorum**: (a) genelde boş sonuç üretir
(gürültülü), (b) kasıtlı bir yanlış yazım gerektirir. AGENT_BASELINE §4
"emin değilsen bir alt seviye" → **medium**.

Önerilen düzeltme: `tenantIdColumn` (zaten `'tenant_id'` sabiti,
`catalog-lint.ts:146`) ile `<kolon> = current_setting('<ayar>'` kalıbını zorla **ve**
ifadede üst seviye `or`/çıplak `true` varsa ayrı bir kuralla (örn.
`POLICY_PREDICATE_NOT_CANONICAL`) düş. Tam eşleşme (deparse biçimine bağımlı)
**önerilmiyor** — PG sürümü değişince kırılır.

### Kalan low bulguların gerekçesi

Hepsi `dosya:satır` bazlı ve yukarıdaki `BULGULAR` bloğunda. L3 (`docs/development.md`)
için ek dayanak: `:264` `migrate dev`'i **sarmalı** sayarken `:285` aynı komutu
**guard'sız** sayıyor — dosya kendi içinde çelişiyor; `:286` `db:deploy`'u "guard'sız,
kendi auth mekanizması var" diye tanımlıyor, oysa FIX 1 onu sarmalayıcıya aldı ve
`DATABASE_MIGRATION_URL`'e yönlendirdi. Ayrıca `:264`'te `beforetesi` diye bozuk bir
sözcük var.

### Öneriler (ihlal DEĞİL, dayanağı yok — stil/okunabilirlik)

- `catalog-lint.ts:128-259` — `lintTenantScopedTable` 101 → **132 satır**, beş ayrı
  kural öbeği (kolon / indeks / RLS / politika / rol). Henüz "mega fonksiyon" değil
  ama bir sonraki kural eklemesinde `lintTenantIdColumn` + `lintRowSecurity` +
  `lintPolicies` olarak bölünmesi önerilir.
- `catalog-lint.ts:116` `expressionReferencesSetting`, `run-guarded-prisma.ts:254`
  `requiresDestructiveTargetGuard` — boolean dönen fonksiyonlar, CLAUDE.md §4 tablosu
  `is`/`has`/`can` öneki istiyor; dosyadaki diğer tüm yüklemler (`isValidPort`,
  `hasBinField`, `isEnoent`, `isPublicPolicy`) öneke uyuyor. Fiil-yüklem adlandırması
  okunabilir olduğu için **öneri** seviyesinde bırakıldı (tur 1 bulgusu #7'nin kalanı).
- `packages/config/eslint/base.js:38` — `restrictedImportsOptions` komşu iki sabitin
  (`:89`, `:187`) aksine `@satisfies` taşımıyor; `eslint.config.mjs:15` `.paths.filter`
  ile bu şekle **tipsiz** güveniyor. Kayma yine gürültülü (çalışma anında `TypeError`),
  tip güvenliği kaybı **önemli değil**. İstenirse minimal şekil anotasyonu
  (`@satisfies {{ paths: { name: string }[] }}`) yeterli.
- `test-client.ts:64` — `testPrisma`, `testAppPrisma`'nın takma adı; aynı nesnenin iki
  dışa açık adı uzun vadede tutarsızlık davet eder. v0.0.14'te `tenant.test.ts:13` ve
  `health.test.ts:14` güncellenip takma ad silinebilir.

---

## 4. Sonucun aritmetiği (AGENT_BASELINE §4)

0 critical · 0 high · **2 medium** (M1, M2) · 8 low → **1–2 medium = PASS**,
bulgular teknik borca kaydedilir.

Ertelenmiş dört kalem (tur 1 #2, #4, #5, #13) bu aritmetiğe **dahil edilmedi**;
gerekçeli erteleme kararı Orkestratöre ait, borç satırları **silinmemeli**.
Orkestratör bu kalemleri yeniden "açık bulgu" sayarsa sonuç FAIL'e döner — bu karar
gate'in değil, kapsamın kararıdır.

**Tur 1'in `[high]` bulgusu gerçekten kapandı** ve düzeltme doğru yerde yapıldı:
spesifikasyon hatası (K-E5'in "WITH CHECK NULL olmasın" ifadesi) kural **ikiye
bölünerek** düzeltildi, fixture testiyle pinlendi, kural sayısı dosya başı yorumunda
(`catalog-lint.ts:27-49`) ve testin `describe` adlarında tutarlı biçimde 19'a çekildi.

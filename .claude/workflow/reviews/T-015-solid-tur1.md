# T-015 · `solid` · Gate Tur 1

Tarih: 2026-11-05
Sürüm: ROADMAP v0.0.14.1 (platform `minor`, Prisma migration YOK)
Dal: **`main`** (ölçüldü: `.git/HEAD` → `ref: refs/heads/main`)

## AJAN: solid · TUR: 1 · SONUÇ: PASS

Gerekçe (AGENT_BASELINE §4): `critical` 0 · `high` 0 · `medium` **2** · `low` **6**.
1-2 `medium` → PASS (borca kaydedilir).

⚠ Ayrı kural (karıştırılmaması için açıkça yazıyorum): `medium` bulgu **düzeltme turu
AÇAR** (sayısı kaç olursa olsun). Her iki `medium` da aşağıda ayrıca işaretlendiği gibi
**bu sürümün dosya listesi dışındaki** dosyalara dokunmayı gerektiriyor; kararı
Orkestratöre bırakıyorum (ayrıntı: "Düzeltme turu hakkında not").

---

## ON HEDEFİN SONUCU

| #   | Hedef                                        | Sonuç                     | Kanıt (dosya:satır)                                                                                                                                                                     |
| --- | -------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `catalog-lint.ts` SAFLIĞI                    | **DOĞRULANDI**            | `catalog-lint.ts:91` — dosyadaki TEK import `import type { CatalogSnapshot }`. Çalışma zamanı importu **0**, `zod` yok, `vitest` yok, `$queryRaw` yok, `process`/`fs` yok               |
| 2   | `TENANT_ISOLATION_RULES` tek doğruluk kaynağı | **KISMİ** (bulgu SD-3/SD-4) | `catalog-lint.ts:99-128` → **27** eleman, türetilen birleşim `:131`; `catalog-lint.ts` prose'unda sabit sayı **0** ✔. AMA repo genelinde bayat **"20 kural"** 4 yerde: `tenancy.ts:58`, `docs/development.md:427`, `:439`, `docs/adr/0007-rls-ve-rol-ayrimi.md:196` (+`:218`) |
| 3   | Beklenti tablosu literal sızdırmıyor          | **DOĞRULANDI**            | `grep "'(account\|session\|verification\|app_user\|arkesoft_auth\|arkesoft_app)'" packages/db/src/*.ts` → `catalog-lint.ts` **0**, `catalog-snapshot.ts` **0**. Veri `tenancy.ts:138,160-166`, parametre `catalog-lint.ts:167-183` |
| 4   | Snapshot tipi dışa açılmıyor (A-PO2)          | **DOĞRULANDI + GÜÇLÜ**    | `packages/db/src/index.ts:18-52` — `catalog-lint`/`catalog-snapshot` re-export **yok**; `:35` yalnızca `PLATFORM_LEVEL_TABLES`/`TENANT_SCOPED_TABLES` adlandırıyor (yeni sabitler **adlandırılmıyor** → sızmıyor). **Transitif kapanış ayrıca kapalı:** `packages/db/package.json:7-12` `exports` yalnızca `"."` → derin import Node tarafından **yapısal olarak** engelli |
| 5   | `tenancy.ts` import'suz                       | **DOĞRULANDI**            | `tenancy.ts` tamamı okundu: hiçbir `import` satırı yok (1-167)                                                                                                                           |
| 6   | ST-B expand/contract TAMAMLANDI               | **DOĞRULANDI**            | `catalog-snapshot.ts:182-195` içinde `appRole` alanı **yok**; `grep "appRole([^N]\|$)"` repo genelinde yalnızca **iki test yerel değişkeni** (`auth-role-privileges.isolation.test.ts:144`, `rollback-auth-role.isolation.test.ts:86`) — ölü/yedek alan **yok**                  |
| 7   | ST-G kod tekrarı                              | **İKİSİ BİRDEN**          | Kapsam kararı **doğru** (ST-G'nin dosya listesi `bootstrap-roles.ts`'i içermiyor), tekrar **gerçek ve beyandan büyük** → bulgu **SD-2 [medium]**                                        |
| 8   | Katman ihlali                                 | **YOK**                   | `packages/db` → `@arkesoft/config` (tek yön, ters bağımlılık yok); `packages/config/src/check-env.ts:8-15` yalnızca `./env.js` — **I/O yok, DB bağlantısı yok** (ST-A'nın "bağlantıyı da kuruyor" ifadesi yanlış, aşağıda); `apps/api` → `packages/*` korunuyor; döngü **yok** |
| 9   | `any` / `as` / `@ts-ignore`                   | **TEMİZ**                 | Yeni üretim dosyalarında `any` **0**, `@ts-ignore` **0**, `as` (non-`const`) **0**. Test kodunda `as` **3** (`rollback-auth-role.isolation.test.ts:176,187,282`), üçü de gerekçeli      |
| 10  | Test kalitesi (yapı)                          | **GÜÇLÜ**                 | `expectNoResidue()` **kırılgan DEĞİL** (gerekçe aşağıda); tautolojik assert **0**; `some()` yerine `toEqual`+uzunluk (`rollback-auth-role.isolation.test.ts:228-239`); boş-değil kanıtları gerçek (`...no-fallback-literal.test.ts:105-141`) |

### Hedef 10 — `expectNoResidue()` kırılganlık değerlendirmesi (brief'in uyarısı)

**Kırılgan değil, ölçerek yazıyorum.** `auth-role-privileges.isolation.test.ts:189-195` ve
`rollback-auth-role.isolation.test.ts:125-131` tam snapshot karşılaştırması yapıyor, ama
`baselineSnapshot` **aynı koşumda, `beforeAll` içinde canlı okunuyor**
(`:159`, `:103`) — yani bayatlayan bir referans yok: şemaya yeni tablo/kolon eklendiğinde
taban da onunla birlikte değişir. Tek kırılma yolu **koşum ortasında başka bir dosyadan
gelen katalog mutasyonu**, o da `vitest.isolation.config.ts`'in
`fileParallelism:false` + `sequence.concurrent:false` ayarıyla (ve tüm probların
transaction içinde geri alınmasıyla) zaten kapalı. Güçlü **ve** maliyeti aynı — brief'in
istediğini kapsıyor, kırılganlık bedeli ödenmiyor.

---

## BULGULAR

| ID       | SEV        | Dosya:satır                                                                                      | Açıklama                                                                                                                                                | Sorumlu ajan |
| -------- | ---------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **SD-1** | **medium** | `packages/db/src/env.ts:31-34`, `:63-66`, `:104-107`, `:136-139`                                 | Dört **yapısal olarak BİREBİR AYNI** tip takma adı; dört ayrıcalık seviyesi tip katmanında **ayrışmıyor**. Bu sürümde dördüncü kopya eklendi             | db           |
| **SD-2** | **medium** | `packages/db/src/rollback-roles.ts:60-196` ⇄ `bootstrap-roles.ts:44-159` ⇄ `run-guarded-prisma.ts:104-206` | Prisma CLI spawn iskeletinin **ÜÇÜNCÜ** kopyası (~110/217 satır birebir). Tek sebeple değişen kod, üç yerde                                        | db           |
| **SD-3** | low        | `packages/db/src/tenancy.ts:58`                                                                  | Bayat kural sayısı: _"(`catalog-lint.ts`, 20 kural)"_ — bugün **27**. R-PM7/K-A10'un tam sınıfı, ST-C'nin kendi dokunduğu dosyada                        | db           |
| **SD-4** | low        | `docs/development.md:427`, `:439`, `docs/adr/0007-rls-ve-rol-ayrimi.md:196`, `:218`              | Aynı bayat sayı ("20 kural" / "20 kuralın") dokümantasyonda **dört** yerde                                                                               | docs         |
| **SD-5** | low        | `packages/db/src/catalog-lint.ts:719-721` (çağrı: `:778-781`)                                    | `isColumnOnlyPrivilege`'in TEK çağrı noktasında ikinci argüman **statik olarak `false`** → yardımcı birim fonksiyona (identity) dejenere; 13 satırlık JSDoc aksini anlatıyor | db           |
| **SD-6** | low        | `apps/api/src/__tests__/database-auth-url-no-fallback-literal.test.ts:47-60`                      | Kapı **satır** bazlı, iddiası _"AYNI İFADEDE"_; prettier'ın sardığı iki satırlık bir geri düşüş kapıdan **geçer**                                        | backend      |
| **SD-7** | low        | `packages/db/src/__tests__/type-pins/auth-secret-tables.pin.ts:27-34`                            | Pin, **Prisma model adı** uzayını **DB tablo adı** uzayına eşitliyor; bu iki uzayın ayrı olduğu CLAUDE.md §4'te yazılı ve repoda emsali var (`User` ⇄ `app_user`) | db           |
| **SD-8** | low        | `packages/config/src/check-env.ts:136-196`                                                       | Dördüncü **neredeyse birebir** try/catch bloğu; beşinci şema yine kopyalamayı gerektirecek (bu tur ampirik olarak gösterdi)                              | db           |

### SD-1 — ayrıntı ve kanıt zinciri

Dördü de **kelimesi kelimesine** `{ readonly databaseUrl: string; readonly nodeEnv: NodeEnv }`:
`DatabaseEnv` (`:31`), `DatabaseBootstrapEnv` (`:63`), `DatabaseMigrationEnv` (`:104`),
`DatabaseAuthEnv` (`:136`). TypeScript yapısal tiplidir → dört ad **hiçbir** ayrım
üretmiyor; `readDatabaseBootstrapEnv()` (bootstrap **süper kullanıcısı**) çıktısı,
`readDatabaseAuthEnv()` beklenen her yere **hatasız** atanır.

Riskin somut adresi ölçüldü: `packages/db/src/run-guarded-prisma.ts:218` →
`role === 'migrator' ? readDatabaseMigrationEnv() : readDatabaseEnv()`. İki dalın dönüş
tipi **aynı** olduğu için bu üçlü operatörde yapılacak bir karıştırma ne derleyici ne
çalışma zamanı tarafından yakalanır; yanlış yön **daha fazla** ayrıcalıkla sessizce
bağlanmaktır — bu sürümün kovaladığı "sessiz güvenlik kaybı" sınıfının ta kendisi.

İkinci kalem (aynı bulgunun parçası): `DatabaseAuthEnv` adı artık **iki pakette, iki ayrı
anlamda** yaşıyor — `packages/config/src/env.ts:163` (`{ DATABASE_AUTH_URL: string }`) ve
`packages/db/src/env.ts:136` (`{ databaseUrl, nodeEnv }`). Emsali **yok**: `config`
bilinçli olarak `DatabaseAdminEnv` diye bir tip **açmıyor** (ölçüldü, repo genelinde 0
eşleşme). Çakışma bu turda doğdu.

Önerilen düzeltme (küçük ve paket-içi): tek bir `GuardableDatabaseEnv` tipi — `guard-policy.ts:58-64`
tasarım niyetini **zaten** "yapısal uyum" olarak yazıyor, yani dürüst temsil tek tiptir.
Ayrım **gerçekten** isteniyorsa marka (brand) alanı eklenmeli. Tip adlarının tüketicisi
yalnızca `env.ts` + `__tests__/guard-policy.test.ts:11,13`; diğer tüm çağrı noktaları
`ReturnType<typeof …>` kullanıyor → değişiklik ~6 satır.

### SD-2 — ayrıntı, ve "DRY ihlali mi, haklı kapsam kararı mı" sorusunun yanıtı

**İkisi birden, ve bu çelişki değil.** ST-G'nin kapsam kararı **doğruydu**: `bootstrap-roles.ts`
onun dosya listesinde yok, ona dokunmak CLAUDE.md §10 md 13 ihlali olurdu. Ama tekrarın
**boyutu beyandan büyük**: dosya başı notu (`rollback-roles.ts:45-49`) yalnızca üç küçük
yardımcıdan (`resolvePrismaCliPath`/`handleSpawnResult`/`isEnoent`) söz ediyor; ölçtüm,
birebir yinelenen yüzey şu:

`fail()` · `hasBinField` · `hasPrismaBinEntry` · `resolvePrismaCliPath` (23 satır) ·
`handleSpawnResult` · `hasErrorCode` · `isEnoent` · `runPrismaDbExecute` (22 satır) ·
kök `.env` yükleme bloğu · `PACKAGE_ROOT` türetmesi · `main()`'in env+guard sırası.
Toplam ~110 satır / 217. `grep` ile üçüncü kopya teyit edildi: aynı yardımcılar
`run-guarded-prisma.ts:104`, `:120`, `:145`, `:166`'da da var.

Bu **gerçek** tekrardır, yüzeysel benzerlik değil: üç kopya **tek bir sebeple** değişir
("Prisma CLI'sini güvenle nasıl çağırıyoruz" — `shell:false`, ENOENT yedeği, guard, çocuk
süreç ortamı). Sertleştirme bir kopyaya uygulanırsa diğer **ikisi sessizce korumasız
kalır**; yüzey güvenlikle ilgili olduğu için `low` demiyorum.

⚠ Ek gözlem (ironi, bulgu değil): `rollback-roles.ts:19-22` tek dosyada kalma kararını
_"SAF KOD TEKRARINI önlemek"_ ile gerekçelendiriyor — gerekçe kendi içinde doğru (iki
`.ts` yazmak iskeleti dörde katlardı) ama okuyucuya tekrarın **kapandığı** izlenimini
veriyor; kapanmadı, üçe çıktı.

Önerilen düzeltme: `packages/db/src/prisma-cli-runner.ts` çıkarılması (üç çağıran da aynı
pakette, paket sınırı geçilmiyor). **Bu sürümde değil** — kapsam dışı; ROADMAP teknik
borcuna.

### SD-5 — ayrıntı

`catalog-lint.ts:757-773`'te `isTableLevel` doğruysa döngü `continue` ediyor. Dolayısıyla
`:778-781`'e gelindiğinde `hasTableSelect`/`hasTableInsert`/`hasTableUpdate` üçü de
**zorunlu olarak `false`** → `isColumnOnlyPrivilege(x, false) === x`. Yani
`columnOnly := hasColumn && !hasTable` türetmesi, "tek güvenilir sinyal" diye 13 satır
belgelendiği yerde **hiçbir ayrım yapmıyor**. Davranış **doğru** (tablo seviyesi vaka ayrı
kuralın öznesi), bulgu okunabilirlik/yanıltıcı soyutlama: beş yıl sonraki okuyucu
anti-vacuity çıkarımının burada yapıldığını sanacak. Düzeltme iki yoldan biri: ya ham
boolean'ları kullanıp notu tablo seviyesi dalına taşımak, ya da `columnOnly`'yi daldan
**önce** hesaplayıp iki kararda **birlikte** kullanmak.

### SD-7 — ayrıntı

`AUTH_SECRET_BEARING_MODELS` (`client.ts:68`) bir **Prisma istemci özelliği/model** adı
kümesidir (`Pick<PrismaClient, …>` içinde kullanılıyor); `AUTH_SECRET_BEARING_TABLES`
(`tenancy.ts:138`) bir **DB tablo** adı kümesidir. CLAUDE.md §4 bu ikisini ayrı uzay
sayıyor (`Prisma modeli PascalCase tekil` ⇄ `DB tablo snake_case`, `@@map`) ve ayrışmanın
emsali **aynı repoda** var: model `User` ⇄ tablo `app_user`. Pin bugün **tesadüfen**
doğru (bu üç modelde `@@map` yok). Biri `@@map` kazandığı gün pin **yanlış bir eşitliği
zorlar** ve en düşük dirençli "düzeltme" listelerden birine **yanlış değer** yazmak olur.
Düzeltme: ham ad eşitliği yerine açık model→tablo eşleme tablosu üzerinden pinlemek.

### Borç satırları (`docs` kopyalayabilsin — `low`'lar için)

```
low · packages/db/src/tenancy.ts:58 · bayat kural sayısı "20 kural" (bugün 27); R-PM7/K-A10 sınıfı · db · vade: v0.0.15
low · docs/development.md:427,439 + docs/adr/0007-rls-ve-rol-ayrimi.md:196,218 · aynı bayat "20 kural" dört yerde · docs · vade: BU SÜRÜM (ST-I henüz koşmadı)
low · packages/db/src/catalog-lint.ts:719-721,778-781 · isColumnOnlyPrivilege tek çağrı noktasında identity'ye dejenere; JSDoc yanıltıcı · db · vade: v0.0.15
low · apps/api/src/__tests__/database-auth-url-no-fallback-literal.test.ts:47-60 · kapı satır bazlı, iddiası "aynı ifade"; sarılmış geri düşüş kaçar · backend · vade: v0.0.15
low · packages/db/src/__tests__/type-pins/auth-secret-tables.pin.ts:27-34 · Prisma model adı uzayı ile DB tablo adı uzayı eşitleniyor (User/app_user emsali) · db · vade: v0.0.16
low · packages/config/src/check-env.ts:136-196 · dördüncü birebir try/catch bloğu; betimleyici dizi + döngü ile kapanır · db · vade: v0.0.16
```

### Düzeltme turu hakkında not (karar Orkestratörün)

`SD-2`'nin düzeltmesi **tanım gereği** bu sürümün dosya listesi dışındaki iki dosyaya
(`bootstrap-roles.ts`, `run-guarded-prisma.ts`) dokunur → bu turda uygulanırsa CLAUDE.md
§10 md 13 ihlal edilir. `SD-1` paket-içi ve küçüktür (`env.ts` + `guard-policy.test.ts`),
teknik olarak bu turda kapatılabilir. Önerim: **ikisi de ROADMAP teknik borcuna**, ayrı
düzeltme turu **açılmasın** — ikisi de davranış hatası değil, tasarım borcu; `SD-3`/`SD-4`
ise `docs`(ST-I) ve `db` tarafından **yolu üstünde** kapatılabilir.

---

## ÖNCEKİ GATE BULGULARINA KATKIM

**QA-1 [medium] — TEYİT EDİYORUM, ve minimal yapısal düzeltmeyi veriyorum.**
Üç alanın bağımsız opsiyonelliği (`catalog-lint.ts:173-182`) gerçekten "hep ya da hiç"
değildir ve kapı `lintCatalog:971-975`'teki üçlü `!== undefined` kontrolüdür. ⚠ Önemli
ek: `qa`'nın ölçtüğü risk **T-014'ün discriminated union çözümünü gerektirmiyor** — tek
**iç içe** opsiyonel alan yeterli ve dondurulmuş çağrı noktasını **kırmaz**:

```
readonly authRole?: {
  readonly roleName: string
  readonly secretBearingTables: readonly string[]
  readonly tablePrivilegeExpectations: readonly AuthRoleTablePrivilegeExpectationLike[]
}
```

Bir alan → "hep ya da hiç" **tip seviyesinde** zorlanır, `lintCatalog`'un üçlü kontrolü
tek kontrola iner, `catalog-lint-live.isolation.test.ts`'in beş çağrı noktası **hâlâ
derlenir**. ST-C'nin expand/contract gerekçesi bu varyantta da geçerli kalıyor; yani
QA-1'in kapanması için tur açmak gerekmiyor, tüket (contract) adımıyla birlikte
kapanabilir.

**S-1 [medium] — TEYİT (bağımsız yoldan).** `catalog-snapshot.ts:411-432`'nin tek kolon
ACL kaynağı `pg_attribute.attacl`; `pg_class.relacl` dosyada **hiç** geçmiyor (okudum,
tamamı). Simetrik tablo seviyesi grantee kuralının **zemini bile** yok — bu bir kural
eksikliğinden önce bir **okuyucu** eksikliğidir, yani düzeltme `catalog-snapshot.ts`'e
yeni bir okuyucu eklemeyi gerektirir, `catalog-lint.ts`'e yalnızca kural eklemek yetmez.

**S-4 [low] — TEYİT.** `isGrantable` `columnGrantRowSchema:165`'te parse ediliyor ve
`CatalogSnapshot` üzerinden taşınıyor; `catalog-lint.ts`'te **hiçbir** okuyucusu yok
(okudum, 1005 satır). Bu, kendi başına da bir **ölü veri alanı** (madde 11) — S-1 ile
aynı düzenlemede kapanması doğru çağrı.

**S-5 [low] — GENİŞLETİYORUM, bkz. SD-6.** c3 kapısının ikinci bir yapısal sınırı var:
yalnızca `src/auth/**` taradığı için değil, **satır** bazlı olduğu için de eksik.

**S-2 / S-3 / S-6:** yapısal katkım yok (ölçüm alanları benim mandatımın dışında).

## Orkestratörün/üretim ajanlarının iki iddiasını ÖLÇEREK DÜZELTİYORUM

1. **ST-A raporunun `env:check` iddiası yanlış.** Task dosyası `:853`: _"yalnızca şema
   doğrulamıyor, **bağlantıyı da kuruyor** ve kimlik bilgisini maskeliyor"_. Ölçüm:
   `packages/config/src/check-env.ts` tamamı okundu — tek import `./env.js` (`:8-15`),
   hiçbir ağ/DB çağrısı yok; `:188-189` yalnızca `parseEnv` + maskeli yazdırma, maske
   `presentValue`/`URL_CREDENTIALS_PATTERN` (`:21`, `:39`) ile **dizge** üzerinde yapılıyor.
   `packages/config`'in sorumluluk sınırı (**I/O yok**) **korunmuş** — iddia abartılı, kod
   doğru. Bunu düzeltmemin sebebi: iddia doğru olsaydı bu bir **katman ihlali** olurdu ve
   benim hedef 8'im FAIL verirdi.
2. **ST-H2'nin AC12a mekanizma açıklaması eksik.** _"Gerçek okuma `config.module.ts:26`'da
   `useFactory` içinde … `vitest list` test gövdelerini çalıştırmaz"_ doğru ama yetersiz:
   `apps/api/src/__tests__` altında **26 dosya** `parseEnv(apiEnvSchema)`'yı **modül
   seviyesinde** çağırıyor (ölçtüm; yeni `database-auth-url-anti-fallback.test.ts:70` de
   o desenin 27.'si). Modül gövdeleri `vitest list` sırasında değerlendirilseydi AC12a
   T-015'ten **çok önce** kırmızı olurdu (`BETTER_AUTH_SECRET` de zorunlu). Yani ST-H2'nin
   **sonucu** (AC12a yeşil, taban korundu) tutarlı ve yeni dosya **mevcut deseni izliyor**
   — bulgu yok; ama gerçek mekanizma "yeni alan şema tanımından ibaret" değil, `vitest list`'in
   modül gövdelerini değerlendirmemesi/ortamın dolu olması olmalı. Hangisi olduğu
   **DOĞRULANAMADI** (`Bash` yok).

---

## ÖLÇÜMLER

| Ölçüm                                                       | Değer                                                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| İncelenen dosya                                             | **20** (tam okuma 13, hedefli okuma 7) + 6 mekanik `grep` taraması                                                     |
| `any` (yeni üretim kodu)                                    | **0**                                                                                                                  |
| `any` (yeni test kodu)                                      | **0** (tek geçiş `rollback-auth-role.isolation.test.ts:179` bir **yorumda**, vitest matcher tipini anlatıyor)           |
| `@ts-ignore` / `@ts-expect-error` (yeni kod)                 | **0** / **0** (mevcut `@ts-expect-error`'lar yalnızca önceden var olan `type-pins/auth-model-narrowing.pin.ts`'te)      |
| `as` (non-`const`) — yeni üretim kodu                       | **0**                                                                                                                  |
| `as` (non-`const`) — yeni test kodu                         | **3**, hepsi `rollback-auth-role.isolation.test.ts:176,187,282`, hepsi gerekçe yorumlu                                 |
| En büyük fonksiyon                                          | `catalog-lint.ts:274-439` `lintTenantScopedTable` — **166 satır** (ÖNCEDEN VAR OLAN, bu turda değişmedi)               |
| En büyük **YENİ** fonksiyon                                 | `catalog-lint.ts:736-797` `lintAuthRoleSecretTableColumnPrivileges` — **62 satır**                                     |
| `TENANT_ISOLATION_RULES` eleman sayısı                      | **27** (`:99-128`), türetilen birleşim `:131`                                                                           |
| `catalog-lint.ts` prose'unda sabit kural sayısı             | **0** ✔                                                                                                                |
| Repo genelinde bayat "20 kural"                             | **4** (1 kaynak + 3 doküman) — SD-3/SD-4                                                                                |
| `catalog-lint.ts` import sayısı                             | **1** (`import type`), çalışma zamanı importu **0**                                                                     |
| `tenancy.ts` import sayısı                                  | **0** ✔                                                                                                                 |
| Tablo/rol adı literali (`catalog-lint.ts` + `catalog-snapshot.ts`) | **0** ✔                                                                                                          |
| `packages/db` `exports` giriş noktası                       | **1** (`"."`) → derin import yapısal olarak engelli                                                                     |
| `index.ts`'te yeni sembol                                   | **0** ✔ (A-PO2 korundu)                                                                                                 |
| Yinelenen spawn iskeleti                                    | **3 kopya** × ~110 satır (SD-2)                                                                                         |
| Yapısal olarak aynı env tip takma adı                       | **4** (SD-1)                                                                                                            |
| Döngüsel bağımlılık                                         | **0**                                                                                                                   |

Koşturulan komut: **yok** (`Bash` iznim yok) — tüm ölçümler `Read`/`Grep`/`Glob` ile.

## DOĞRULANAMADI

1. `pnpm lint` / `typecheck` / `test` / `test:isolation` / `build` / `format:check` —
   **koşturulamadı** (`Bash` yok). Üretim ajanlarının raporladığı sayılar (lint 21/21,
   typecheck 21/21, db test 191/191, `test:isolation` 64/8, build 13/13) **bağımsız
   doğrulanmadı** → `qa`'ya havale (tur 1'de zaten ölçtü).
2. `vitest list`'in modül gövdelerini değerlendirip değerlendirmediği (yukarıdaki düzeltme
   2'nin açık ucu) → `devops`/`qa`.
3. `packages/db/sql/bootstrap-roles.sql` §7 ve `sql/rollback-auth-role.sql`'in **SQL**
   içeriği — SOLID mandatımın dışında, `security`/`db` ölçtü; benim incelemem TS yüzeyiyle
   sınırlı.
4. `catalog-lint.test.ts`'in 260-740 aralığı (önceden var olan politika/taksonomi
   fixture'ları) **örnekleme** ile okundu; yeni eklenen bölümler (`:767-1020`) ve taban
   fixture (`:32-230`) **tam** okundu.
5. `afterAll` içindeki kapsama assert'i (`catalog-lint.test.ts:1010-1015`) `vitest -t <ad>`
   gibi **filtreli** bir koşumda yanlış kırmızı verir mi — mekanizma okumadan açık ama
   **koşturulamadı**; bulgu yazmadım, `qa`'nın bilgisine sunuyorum.

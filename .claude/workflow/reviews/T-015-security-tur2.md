# T-015 · GATE: security · TUR 2 · KAPSAM: TAM

**Tarih:** 2026-10-26
**Sürüm:** ROADMAP v0.0.14.1 — `arkesoft_auth` rolü ve kolon bazlı yetki ayrımı
**Dal:** `main` (ölçüldü: `git branch --show-current` → `main`; HEAD `6b6c4b0`)

```
GATE: security
SONUÇ: FAIL
BULGULAR:
  - [SEV: high]   packages/db/src/catalog-snapshot.ts:498 + packages/db/sql/bootstrap-roles.sql:173 — view/matview bağımlı nesne yolu: `arkesoft_app` HİÇBİR GRANT yazılmadan `account.password`'u okuyor, linter 0 bulgu veriyor — `relkind IN ('r','p','v','m','f')` + bağımlı nesne kuralı; default ACL'i daralt — db (+ architect)
  - [SEV: medium] packages/db/src/catalog-snapshot.ts (pg_proc hiç okunmuyor) — SECURITY DEFINER fonksiyon + EXECUTE'un PUBLIC varsayılanı tam kör nokta — `pg_proc` kaynağı + bootstrap'ta `REVOKE EXECUTE ... FROM PUBLIC` — db
  - [SEV: medium] packages/db/src/catalog-snapshot.ts:498 — `relkind='r'` ⇄ `pg_tables` (`'r','p'`) asimetrisi: bölümlenmiş tabloda tablo seviyesi hibe görünmez — `relkind IN ('r','p')` — db
  - [SEV: medium] packages/config/src/check-env.ts:59 — `maskUrlCredentials`'ın `catch { return value }` yolu fail-OPEN; `REDIS_URL` parolası birebir yazdırıldı (S-3'ün AYNI hata sınıfı, yalnızca DATABASE ailesi için kapatılmış) — fail-closed'a çevir — backend
  - [SEV: low]    packages/db/src/catalog-snapshot.ts — `pg_default_acl` + `pg_namespace.nspacl` okunmuyor (kurulmuş tuzak, ateşlendiğinde yakalanıyor) — db, vade v0.0.17
  - [SEV: low]    packages/db/src/catalog-snapshot.ts — `pg_auth_members` okunmuyor; `NOINHERIT` + rol üyeliği kombinasyonu görünmez (INHERIT'li yaygın hâl YAKALANIYOR) — db, vade v0.0.17
  - [SEV: low]    apps/api/src/auth/auth.module.ts:103 — açılış artık DB erişilebilirliğine bağlı; timeout/retry ve readiness/liveness politikası sahiplenilmemiş (güvenlik açısından fail-closed DOĞRU seçim) — devops
  - [SEV: low]    packages/db/sql/rollback-auth-role.sql:79 — kill-switch `arkesoft_app`'e üç sır tablosunda tam DML'i geri verir ve bunun hiçbir çalışma zamanı sinyali yok (derleme zamanı allow-list savunması AYAKTA) — docs (runbook) / db
ÖLÇÜMLER:
  pnpm audit            : 0 kritik · 1 yüksek (multer, geçişli — MEVCUT BORÇ, T-014) · 1 orta (minimatch, yalnızca dev/eslint) · 0 düşük
  incelenen dosya       : 30 değişen (19 izlenen + 11 izlenmeyen, `.claude/**` hariç) + 6 destek dosyası = 36
  canlı mutasyon        : 16 (10 CAUGHT · 1 PARTIAL · 5 SURVIVED) — hepsi transaction + ROLLBACK
  check-env vektörü     : 5 (4 kapalı · 1 SURVIVED → S-10)
  bağlantı hatası kanalı: 5 senaryo — 5/5'inde parola SIZMADI
  taban (bağımsız)      : api 490/62 · db isolation 50/5 (yeniden koşturuldu, handoff'un sayılarıyla birebir)
  §7 karşılanmayan madde: yok (14'ün 14'ü N/A veya doğrulandı) — ancak liste bu değişiklikte gereken kontrolü HİÇ İÇERMİYOR (bkz. S-7)
```

**SONUÇ gerekçesi (AGENT_BASELINE §4):** 1 `high` → FAIL. Ayrıca 3 `medium` → bağımsız
olarak da FAIL. Düzeltme turu açılır (`high` + 3 `medium`); dört `low` borç tablosuna.

---

## 1. Kendi bulgularımın kapanışı

| ID      | Tur 1 SEV | Durum                       | Bağımsız kanıtım                                                                                                                                                                                                                                                                      |
| ------- | --------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S-1** | medium    | **KAPANDI**                 | Kendi mutasyonum M1 (`GRANT SELECT ON public.account TO pg_read_all_data`, tx+ROLLBACK, kendi koşucum): **1 bulgu** `UNEXPECTED_TABLE_LEVEL_GRANTEE`, beklenen alıcılar `"arkesoft_app", "arkesoft_auth", "arkesoft_migrator"` (sahip LİTERAL değil). Taban mutasyonsuz: **0 bulgu**. |
| **S-2** | medium    | **(b) KAPANDI · (a) docs**  | Prob üç GERÇEKÇİ yanlış rolün HEPSİNDE fırlatıyor: `arkesoft_app` → `AuthRoleNotRestrictedError`, `arkesoft_migrator` → aynı, süper kullanıcı → aynı. `has_table_privilege('arkesoft_app','public.tenant','SELECT') = true` / `arkesoft_auth` = `false` ölçüldü. Ayrıntı: §4(b).      |
| **S-3** | medium    | **KAPANDI (DATABASE ailesi)** | Derlenmiş `check-env.js` ile kendi vektörlerim: parolada ham `/`+`%` → `po************ic`; `?password=TOPSECRET123` → `po************23`. Dört `DATABASE_*_URL` da biçimden bağımsız maskeli. ⚠ AYNI hata sınıfı `REDIS_URL`'de AÇIK kaldı → **S-10 (yeni bulgu)**.               |
| **S-4** | low       | **KAPANDI**                 | M4 (`GRANT SELECT (password) … WITH GRANT OPTION`) → `UNEXPECTED_COLUMN_LEVEL_GRANTEE`, *"alıcı DOĞRU ama yeniden hibeleme yetkisi … beklenmiyor"*. Ek olarak kendi M4b'imi kurdum (`GRANT DELETE ON account TO arkesoft_auth WITH GRANT OPTION`) → tablo tarafı da **yakalandı**.    |
| **S-5** | low       | **KAPANDI — sınır SORUN DEĞİL** | `backend`'in `.default()` kaygısını ölçtüm: `.default()` eklenirse `parseEnv` **fırlatmıyor** (`postgresql://fallback/x` döndü) → `database-auth-url-fail-fast.test.ts:41`'in `toThrow(EnvValidationError)` assert'i **KIRMIZIYA** döner. Vektör çalışma zamanı testiyle KAPALI.    |
| **S-6** | —         | BORÇTA (v0.0.17)            | Dokunulmadı. Yeni `onModuleInit` hata yolunun yeni bir sızıntı yüzeyi açmadığı ayrıca ölçüldü (§5, hedef 3).                                                                                                                                                                         |

---

## 2. QA-3'ün güvenlik etkisi — ÖLÇÜLDÜ

**Soru:** FIX 1 bir güvenlik assert'ini sessizce boşalttı mı; şifre sızıntısı kontrolü
gerçekten kayboldu mu?

**Ölçüm (beyana güvenilmedi).** `assertAuthRoleIsRestricted`'ı gerçek `createPrismaClient`
ile beş senaryoda koşturdum ve fırlatılan hatanın `name` + `message` + `stack` +
`JSON.stringify(e, Object.getOwnPropertyNames(e))` birleşiminde parolayı aradım:

| Senaryo                        | Hata                                  | Parola var mı | Tam URL var mı | Kullanıcı adı |
| ------------------------------ | ------------------------------------- | ------------- | -------------- | ------------- |
| Ulaşılamaz port (`127.0.0.1:1`) | `PrismaClientKnownRequestError` P2010 | **hayır**     | hayır          | hayır         |
| Yanlış parola (canlı sunucu)    | P2010, SQLSTATE `28P01`               | **hayır**     | hayır          | evet          |
| Yanlış veritabanı adı           | P2010, SQLSTATE `28P01`               | **hayır**     | hayır          | evet          |
| `DATABASE_URL` (app rolü)       | `AuthRoleNotRestrictedError`          | **hayır**     | hayır          | hayır         |
| Süper kullanıcı                 | `AuthRoleNotRestrictedError`          | **hayır**     | hayır          | hayır         |

Hata metinlerinin tamamı okundu; en çok taşıdıkları şey
`Can't reach database server at 127.0.0.1:1` ve
`password authentication failed for user "arkesoft_auth"`. Rol adı bir sır değil
(`.env.example:73`'te açıkça duruyor).

**Verdict:**

1. **Korunan güvenlik özelliği AYAKTA ve bağımsız olarak doğrulandı** — bağlantı parolası
   Prisma hata nesnesinin hiçbir alanında bulunmuyor. QA-3 **canlı bir sızıntı açığa
   çıkarmıyor**.
2. Buna rağmen `qa`'nın tespiti **doğru**: `consoleErrorSpy` assert'i artık koşulsuz geçiyor
   (request'e hiç ulaşılmıyor). Kaybedilen şey bir sızıntı değil, **regresyon dedektörü** —
   "yarın bir better-call/Prisma sürümü bağlantı dizesini hata metnine gömerse yakalayalım"
   sigortası. O sigorta vakumda.
3. Ama **yeni pino kanalı vakum DEĞİL**: `auth-secret-leak.test.ts:319-321` ve
   `auth-flow.test.ts:638-639` `expect(fullLogText).toContain('açılış durduruluyor')`
   çapasını taşıyor — yani `not.toContain('wrong')` gerçekten bir şeyin üzerinde ölçülüyor.

**Sonuç: ayrı bir güvenlik bulgusu AÇMIYORUM.** QA-3'ü `qa`'nın [medium] test-kapsamı
bulgusu olarak **onaylıyorum**; güvenlik tarafından bakıldığında etkisi `low` (canlı
exposure yok, yalnızca dedektör vakumu). Mükerrer satır yazmak borç tablosunu kirletir.

---

## 3. Mutasyon testleri

Hepsi canlı `arkesoft-postgres` (port 5432, isimle seçildi — `cnc_proje-postgres-1`:55432
DEĞİL) üzerinde, **transaction + `ROLLBACK`** ile. Taban mutasyonsuz koşu: **0 bulgu**
(yanlış pozitif yok). DDL'i, anlık görüntüyü ve lint'i **aynı `tx`** üzerinde çalıştıran
kendi koşucumu yazdım — `db`'nin test süitini çağırmadım.

| ID      | Mutasyon                                                               | Hangi kontrol yakalamalı              | Yakaladı mı                                                |
| ------- | ---------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| M1      | `GRANT SELECT ON account TO pg_read_all_data`                          | `UNEXPECTED_TABLE_LEVEL_GRANTEE`      | **CAUGHT** (1 bulgu)                                       |
| M1b     | `GRANT SELECT ON account TO PUBLIC`                                    | aynı + app/auth kuralları             | **CAUGHT** (3 bulgu; `grantee` = `"-"`)                    |
| M4      | `GRANT SELECT (password) … TO arkesoft_auth WITH GRANT OPTION`         | `UNEXPECTED_COLUMN_LEVEL_GRANTEE`     | **CAUGHT**                                                 |
| M4b     | `GRANT DELETE ON account TO arkesoft_auth WITH GRANT OPTION`           | `UNEXPECTED_TABLE_LEVEL_GRANTEE`      | **CAUGHT**                                                 |
| M15     | `GRANT SELECT (password) ON account TO arkesoft_app`                   | `UNEXPECTED_COLUMN_LEVEL_GRANTEE`     | **CAUGHT**                                                 |
| M16     | `ALTER TABLE account OWNER TO arkesoft_app`                            | `APP_ROLE_OWNS_TABLE`                 | **CAUGHT** (2 bulgu) — anti-vacuity                        |
| M17     | `ALTER ROLE arkesoft_auth BYPASSRLS`                                   | `APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS`  | **CAUGHT** — anti-vacuity                                  |
| M20     | `REVOKE SELECT (password) ON account FROM arkesoft_auth`               | `AUTH_ROLE_MISSING_COLUMN_PRIVILEGE`  | **CAUGHT** — anti-vacuity                                  |
| M10     | `GRANT arkesoft_app TO arkesoft_auth` (rol üyeliği, INHERIT)           | Kaynak A (`has_table_privilege`)      | **CAUGHT** (6 bulgu)                                       |
| M11     | `GRANT arkesoft_migrator TO arkesoft_app`                              | Kaynak A                              | **CAUGHT** (4 bulgu)                                       |
| **M18** | Bölümlenmiş tablo (`relkind='p'`) + `GRANT SELECT TO pg_read_all_data` | `UNEXPECTED_TABLE_LEVEL_GRANTEE`      | **PARTIAL** — grantee kuralı SESSİZ; yalnızca taksonomi kuralları ateşledi → **S-9** |
| **M9**  | `CREATE MATERIALIZED VIEW … AS SELECT password FROM account` + GRANT   | herhangi biri                         | **SURVIVED (0 bulgu)** → **S-7**                           |
| **M14** | `CREATE FUNCTION … SECURITY DEFINER` (account okur) + `GRANT EXECUTE`  | herhangi biri                         | **SURVIVED (0 bulgu)** → **S-8**                           |
| **M13** | `ALTER DEFAULT PRIVILEGES … GRANT SELECT ON TABLES TO pg_read_all_data` | herhangi biri                        | **SURVIVED (0 bulgu)** → **S-11**                          |
| **M12** | `GRANT CREATE ON SCHEMA public TO arkesoft_auth`                       | herhangi biri                         | **SURVIVED (0 bulgu)** → **S-11**                          |
| **M19** | `ALTER ROLE arkesoft_auth NOINHERIT` + `GRANT arkesoft_app TO …`       | herhangi biri                         | **SURVIVED (0 bulgu)** → **S-12**                          |

### check-env vektörleri (derlenmiş `packages/config/dist/check-env.js`)

| ID  | Vektör                                                       | Sonuç                                            |
| --- | ------------------------------------------------------------ | ------------------------------------------------ |
| C1  | `DATABASE_AUTH_URL` parolasında ham `/` ve `%`               | `po************ic` — **maskeli**                 |
| C2  | `DATABASE_AUTH_URL=…?password=TOPSECRET123`                  | `po************23` — **maskeli**                 |
| C4  | `DATABASE_READ_REPLICA_URL` (regex sınırı)                   | **hiç yazdırılmadı** (şemada yok) — sızıntı yok  |
| C5  | `MEILI_HOST=http://admin:MEILIPASS@…`                        | `http://***:***@localhost:7700/` — **maskeli**   |
| **C3** | `REDIS_URL=redis://default:re/dis+P@ss@localhost:6379`    | **BİREBİR yazdırıldı** → **S-10 (SURVIVED)**     |

---

## 4. İki açık soruya yanıt

### (a) `UNEXPECTED_TABLE_LEVEL_GRANTEE` şema-geneli kapsam — kalıcı yanlış pozitif üretir mi?

**Hayır. `db`'nin varsayımı DOĞRU; şema-geneli kapsam KORUNMALI.** Ölçtüm:

- Taban (mutasyonsuz) koşum: **0 bulgu** — bugünün meşru hibeleri kuralı tetiklemiyor.
- Beklenen küme `{appRoleName, authRoleName, table.tableOwner}`'ın her üç üyesi de canlıda
  gerçekten gerekiyor; `arkesoft_migrator` kümeye **`tableOwner` üzerinden** giriyor
  (M1'in mesajı bunu doğruluyor: beklenen alıcılar listesinde `"arkesoft_migrator"` var ama
  kodda o ad LİTERAL yazılı değil). Yani handoff'un sorduğu "meşru bir operatör hibesi"
  senaryosunun en olası aktörü — migrator — zaten muaf.
- Canlı rol envanterini okudum: `arkesoft`, `arkesoft_migrator`, `arkesoft_app`,
  `arkesoft_auth`. `pg_namespace.nspacl` = tam bu dört rol. **Dördüncü bir okuma rolü
  (BI/monitoring) bugün YOK.** Dolayısıyla bugün kalıcı yanlış pozitif üretecek bir hibe
  mevcut değil.
- Önemli tasarım kontrolü: kural `appRoleName`'i HER tablo için beklenen sayıyor — yani
  `GRANT SELECT ON account TO arkesoft_app` bu kuralı tetiklemez. Bu bir boşluk DEĞİL:
  M1b'yi koşturduğumda o yolun `APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE` (Kaynak A)
  tarafından yakalandığını ölçtüm. İki kaynak birbirini örtüyor.

**Tek şartlı uyarı (bulgu değil, `db` için not):** ileride meşru bir okuma rolü
(ör. `arkesoft_readonly`, Grafana/Metabase) eklenirse kural **tüm şemada** kırmızı verir.
O gün doğru hamle kuralı daraltmak değil, beklenen kümeyi `LintCatalogOptions` üzerinden
**opsiyonel ek alıcı listesi** olarak parametreleştirmektir — kapsamı daraltmak S-1'i
geri açar.

### (b) S-2(b) probu ÜRETİMDE işe yarıyor mu?

**Evet — "dev kanıtı üretime transfer olmuyor" tespitim ÇÖZÜLDÜ.** Handoff'un tam olarak
sorduğu senaryoyu ölçtüm: operatör `DATABASE_AUTH_URL`'e `DATABASE_URL`'in **aynısını**
koyarsa (üretimde `arkesoft_auth` rolü/§7 DDL'i hiç koşmamışken en düşük dirençli hata):

| Prob hedefi                     | `has_table_privilege(…,'public.tenant','SELECT')` | `assertAuthRoleIsRestricted` sonucu |
| ------------------------------- | ------------------------------------------------- | ----------------------------------- |
| `arkesoft_auth` (doğru rol)     | `false`                                           | **geçer** (doğru)                   |
| `arkesoft_app` (= `DATABASE_URL`) | **`true`**                                      | **`AuthRoleNotRestrictedError`**    |
| `arkesoft_migrator` (tablo sahibi) | `true` (örtük sahiplik)                        | **`AuthRoleNotRestrictedError`**    |
| süper kullanıcı (`arkesoft`)    | `true`                                            | **`AuthRoleNotRestrictedError`**    |

Yani üç gerçekçi yanlış rolün **hepsi** yakalanıyor ve `apps/api` açılışta düşüyor
(`auth.module.ts:103-113`, `OnModuleInit` → `throw error`). Probun `current_user`'ı
sorgulaması bir zayıflık değil güç kaynağı: "hangi rol olduğu"na değil, "o rolün ne
yapabildiğine" bakıyor — bu yüzden rol adının üretimde ne olduğu önemsiz.

**Kalan artık sınır (bulgu açmıyorum, ölçülmüş bir sınır):** prob TEK bir negatif tabloya
(`tenant`) bakıyor. `tenant`'ta SELECT'i olmayan ama üç sır tablosunda fazla yetkisi olan
hayali bir dördüncü rol probu geçer. Bugün böyle bir rol yok (dört rol ölçüldü) ve o yüzey
`lintCatalog`'un işi. Vade geldiğinde probun pozitif tarafını da (`has_column_privilege`)
assert etmek doğru genişleme olur.

---

## 5. TAM denetim — tur 1'deki altı hedef yeniden

| #     | Hedef                                | Sonuç                     | Kanıt                                                                                                                                                                                                                                                                                 |
| ----- | ------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Anti-fallback (R-PM4/K-A4)           | **ÇÜRÜTÜLEMEDİ**          | `DATABASE_AUTH_URL`'in TÜM kullanım noktalarını taradım: üretim kodunda **tek** tüketici `auth.module.ts:91` (`createPrismaClient({ databaseUrl: env.DATABASE_AUTH_URL })`), ikinci tüketici `packages/db/src/env.ts:150` (test istemcisi). `??`/`||`/`?:` yok. Yeni vektör: `.default()` denedim → `parseEnv` fırlatmıyor, ama c1 testi (`toThrow(EnvValidationError)`) o an KIRMIZIYA döner (ölçüldü). Kapalı. |
| **2** | K-A12 — `DATABASE_AUTH_URL` değer sızıntısı | **SIZINTI YOK**     | Üç kanal tarandı: (i) `check-env` çıktısı — dört DATABASE değişkeni de biçimden bağımsız maskeli (C1/C2); (ii) `parseEnv`/`EnvValidationError` — yalnızca değişken adı + ihlal edilen kural taşıyor, değer taşımıyor (`env.ts:228-231`); (iii) yeni `reportEnvValidationFailure` yardımcısı — `error.issues`'u aktarır, `process.env`'e dokunmaz. Açılış hata yolu: 5/5 senaryoda parola yok (§2 tablosu). |
| **3** | Ham `42501` — yeni `onModuleInit` hata yolu | **YENİ YÜZEY YOK** | Açılış hatası `logger.error(describeErrorCause(error), …)` ile **yalnızca sunucu tarafı pino kaydına** yazılıyor. HTTP yanıtı ÜRETİLEMİYOR — süreç `listen()`'e hiç gelmiyor (testler `createTestApp()`'in reddettiğini gösteriyor). `causeMessage`'da SQLSTATE metni (`Code: 28P01`) görünüyor, ama bu altyapı teşhisi; S-6'nın konusu olan "ham SQLSTATE KULLANICIYA ulaşıyor" yolu burada yapısal olarak yok. `describeErrorCause` ayrıca serbest metin/PII taşımıyor (bu `cause` bir DB bağlantı hatası, kullanıcı girdisi değil — dosyanın kendi uyarısına uygun kullanım). |
| **4** | Üçüncü-rol kör noktası → **DÖRDÜNCÜ var mı** | **EVET — ÜÇ TANE**  | Kolon tarafı tur 1'de, tablo tarafı FIX 1'de kapandı. Yeniden taradığımda **bağımlı nesne** ekseninin hiç kapsanmadığını ölçtüm: (a) view/matview → **S-7 [high]**, (b) `SECURITY DEFINER` fonksiyon → **S-8 [medium]**, (c) `relkind='p'` → **S-9 [medium]**. Tur 1'de M6/M7 ile baktığım `pg_default_acl` / `nspacl` / rol üyeliği eksenleri: ikisi `low` (**S-11**, **S-12**), rol üyeliğinin yaygın (INHERIT'li) hâli ise Kaynak A tarafından **yakalanıyor** (M10/M11). |
| **5** | §7 / §10 kontrol listeleri           | bkz. §7                   | §7'nin 14 maddesinin 14'ü N/A veya doğrulandı; §10'un 20 maddesinden #7 **S-10 ile ihlal**. §7'de bu değişimin gerektirdiği madde HİÇ YOK → öneri §7'de.                                                                                                                              |
| **6** | `assertAuthRoleIsRestricted` + `OnModuleInit` yeni yüzey mi | **güvenlik yüzeyi YOK, availability yüzeyi VAR** | Enjeksiyon: `$queryRaw` etiketli şablon, tablo adı **bağlı parametre** (`${'public.' + PROBE_TABLE_NAME}`) ve zaten modül sabiti; üretim kodunda `$queryRawUnsafe`/`$executeRawUnsafe` **hiç yok** (tarandı). Bilgi sızıntısı: `current_user` sorgusunun çıktısı dışarıya hiç verilmiyor, yalnızca boolean dallanma. Dönüş `z.array(probeRowSchema).parse()` ile Zod'dan geçiyor; boş sonuç fail-closed. **Ama** açılış artık DB'ye bağlı (önceki tasarım bilinçle tembeldi, `auth.module.ts:73-74`) → **S-13 [low]**, devops. |

---

## 6. YENİ BULGULAR

| ID       | SEV        | Dosya:satır                                                                  | Açıklama (saldırı/arıza senaryosu)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Sorumlu           |
| -------- | ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **S-7**  | **high**   | `packages/db/src/catalog-snapshot.ts:498` (`relkind = 'r'`) + `packages/db/sql/bootstrap-roles.sql:173-174` | Bir sonraki sürümde bir geliştirici/migration, `arkesoft_migrator` olarak `public` şemasında `account`/`session`/`verification` üzerine **sıradan bir `CREATE VIEW`** (ör. bir raporlama/teşhis görünümü) yazıyor. Postgres'in `ALTER DEFAULT PRIVILEGES … ON TABLES` kuralı **view ve materialized view'ı da kapsar**, bu yüzden nesne **hiçbir `GRANT` yazılmadan** `arkesoft_app`'e `arwd` ile hibeleniyor; view varsayılan olarak **sahibinin yetkisiyle** çalışır (`security_invoker=false`). Sonuç: bu sürümün `account`'tan REVOKE ettiği rol, view üzerinden tüm parola hash'lerini okuyor. ÖLÇÜLDÜ (tx+ROLLBACK): `arkesoft_app` ile `SELECT count(*) FROM account` → `ERROR: permission denied for table account` (negatif kontrol), `SELECT count(*) FROM acct_leak_v` → **24487 satır**; yeni view'ın `relacl`'i `{arkesoft_migrator=arwdDxtm/…,arkesoft_app=arwd/arkesoft_migrator}` (GRANT yazılmadı); `lintCatalog` → **0 bulgu** (M9). ⚠ `critical` DEĞİL çünkü ölçüldü: `relkind IN ('v','m','f','p')` sayısı bugün **0** — canlı sızıntı yok, kurulu bir tuzak + eksik yetki kontrolü var. **Önerilen düzeltme:** (1) `readTables`/`readTableGrants`'i `relkind IN ('r','p','v','m','f')`'e genişlet; (2) `pg_depend`/`pg_rewrite` üzerinden "sır taşıyan tabloya bağımlı view/matview" kuralı ekle (yeni kural kodu, ör. `SECRET_TABLE_DEPENDENT_OBJECT`); (3) `bootstrap-roles.sql`'in blanket `ALTER DEFAULT PRIVILEGES … TO arkesoft_app`'ini daralt veya en az `ON TABLES`'ın view/matview'ı kapsadığını dosyada yaz. | **db** (+ architect: default ACL kararı) |
| **S-8**  | **medium** | `packages/db/src/catalog-snapshot.ts` (`pg_proc` HİÇ okunmuyor)              | `arkesoft_migrator` olarak `CREATE FUNCTION public.leak_pw() … LANGUAGE sql SECURITY DEFINER AS $$ SELECT password FROM public.account $$` yazılıyor; **hiçbir `GRANT` yazılmıyor**. ÖLÇÜLDÜ: `proacl = NULL` → Postgres'in varsayılanı **EXECUTE to PUBLIC** → `has_function_privilege('arkesoft_app','public.leak_pw()','EXECUTE') = true`; `arkesoft_app` ile `SELECT count(*) FROM leak_pw()` → **24487 satır**; `lintCatalog` → **0 bulgu** (M14). Linter `pg_proc`'u hiç okumuyor, dolayısıyla `prosecdef`/`proacl` ekseni tamamen kör. `high` DEĞİL: `SECURITY DEFINER` yazmak `CREATE VIEW`'in aksine kasıtlı ve kod incelemesinde göze çarpan bir eylem; ayrıca ölçüldü: `public` şemasında bugün **hiç fonksiyon yok**. **Önerilen düzeltme:** `pg_proc` kaynağı (`prosecdef`, `proacl`, `proowner`) + `public` şemasında allow-list dışı `SECURITY DEFINER` fonksiyonu reddeden kural; `bootstrap-roles.sql`'e `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` + `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`. | **db**            |
| **S-9**  | **medium** | `packages/db/src/catalog-snapshot.ts:498`                                    | `readTableGrants` `relkind = 'r'` ile filtreliyor, ama kardeş sorgusu `readTables`'ın dayandığı `pg_tables` **`relkind = ANY (ARRAY['r','p'])`** tanımlı (ölçüldü: `pg_get_viewdef('pg_tables')`). Bir tablo bölümlendiği an Kaynak C onu görmez. Somut senaryo: `audit_log` ileride `PARTITION BY RANGE (created_at)`'e çevriliyor (denetim tabloları için rutin bir ölçeklendirme hamlesi) — tablo taksonomide OLDUĞU için `UNCLASSIFIED_TABLE` sessiz kalır ve o andan sonra o tablodaki **her** tablo seviyesi hibe (S-1'in tam olarak kapattığı sınıf) yeniden görünmez olur. ÖLÇÜLDÜ (M18): bölümlenmiş prob tablosu + `GRANT SELECT TO pg_read_all_data` → `UNEXPECTED_TABLE_LEVEL_GRANTEE` **ateşlemedi**; yalnızca `UNCLASSIFIED_TABLE` + `TENANT_ID_WITHOUT_TAXONOMY_ENTRY` çıktı (ikisi de prob tablosu taksonomi dışı olduğu için). **Önerilen düzeltme:** `relkind IN ('r','p')` — `pg_tables` ile simetri; `catalog-lint.test.ts`'e bölümlenmiş tablo fixture'ı. | **db**            |
| **S-10** | **medium** | `packages/config/src/check-env.ts:59` (`catch { return value }`)             | S-3 düzeltmesi `DATABASE_*_URL`'i **ada göre** maskeleyerek kapattı, ama aynı fonksiyonun jenerik yolu **fail-OPEN** kaldı: `new URL()` ayrıştıramazsa değer **olduğu gibi** dönüyor. ÖLÇÜLDÜ (derlenmiş `check-env.js`): `REDIS_URL='redis://default:re/dis+P@ss@localhost:6379'` → çıktı `REDIS_URL  redis://default:re/dis+P@ss@localhost:6379` — **parola birebir**. Dosyanın kendi başlığı (satır 6) koşulsuz söz veriyor: *"Sır içeren değerler maskelenir; terminale veya CI loguna parola düşmez."* — bu yol için YANLIŞ. Somut senaryo: üretim Redis'i yönetilen bir servis (Upstash/ElastiCache/Azure Cache); bu sağlayıcılar base64 parola üretir ve base64 alfabesi `/` ile `+` içerir. Operatör runbook adımı olarak üretim env'iyle `pnpm env:check` koşup çıktıyı — maskelendiğine güvenerek — bir olay kanalına/PR'a yapıştırıyor; Redis parolası açığa çıkıyor. Redis oturum verisi ve oran sınırlama sayaçlarını tutuyor → eline geçiren oturum okuyabilir/uydurabilir. `critical`/`high` DEĞİL: ölçüldü, CI'nin `repo` işi `env:check`'i **`.env` ve sır OLMADAN** koşuyor (`.github/workflows/ci.yml:329`, `--env-file-if-exists`), ve yerel kanalın muhatabı sırrın zaten sahibi — artan maruziyet scrollback/yapıştırma, uzaktan saldırgan yolu değil; bugünkü `.env`'in `REDIS_URL`'inde hiç kimlik bilgisi yok. **Önerilen düzeltme:** tek satır — `catch` bloğunda `return value` yerine `return maskSecret(value)` (fail-closed). Ayrıca kalıcı olarak açık bırakılacaksa dosya başlığındaki koşulsuz garantiyi daralt. | **backend**       |
| **S-11** | low        | `packages/db/src/catalog-snapshot.ts`                                        | `pg_default_acl` ve `pg_namespace.nspacl` hiç okunmuyor. ÖLÇÜLDÜ: M13 (`ALTER DEFAULT PRIVILEGES FOR ROLE arkesoft_migrator IN SCHEMA public GRANT SELECT ON TABLES TO pg_read_all_data`) → **0 bulgu**; M12 (`GRANT CREATE ON SCHEMA public TO arkesoft_auth`) → **0 bulgu**. `low` çünkü kurulan tuzak **ateşlendiğinde** yakalanıyor: bir sonraki tablonun `relacl`'i `UNEXPECTED_TABLE_LEVEL_GRANTEE`'yi tetikler (M1 ile doğrulandı) — pencere sınırlı. İstisna view/matview yolu, o **S-7**'nin konusu. Borç satırı: `[low] packages/db/src/catalog-snapshot.ts — pg_default_acl + nspacl beklenen kümeye karşı assert edilmiyor — db — vade v0.0.17 (S-6'nın yanına)`. | db (vade v0.0.17) |
| **S-12** | low        | `packages/db/src/catalog-snapshot.ts`                                        | `pg_auth_members` okunmuyor. Yaygın hâl **kapalı**: ölçüldü, canlıda üç `arkesoft_*` rolünün hepsi `rolinherit = t`, bu yüzden M10/M11 (rol üyeliği hibeleri) Kaynak A'nın `has_table_privilege`'i üzerinden **yakalanıyor** (6 ve 4 bulgu). Açık kalan tek kombinasyon M19: `ALTER ROLE arkesoft_auth NOINHERIT` + `GRANT arkesoft_app TO arkesoft_auth` → **0 bulgu**; `has_table_privilege` `false` döner ama rol oturum içinde `SET ROLE arkesoft_app` yapıp her şeyi alabilir. `low` çünkü iki ayrı süper kullanıcı DDL adımı + uygulama kodunda var olmayan bir `SET ROLE` çağrısı gerekiyor. Borç satırı: `[low] packages/db/src/catalog-snapshot.ts — pg_auth_members okunmuyor; NOINHERIT+üyelik kombinasyonu görünmez — db — vade v0.0.17`. | db (vade v0.0.17) |
| **S-13** | low        | `apps/api/src/auth/auth.module.ts:103-113`                                   | Prob açılışı DB erişilebilirliğine **bağladı**: `createPrismaClient` bilinçle tembeldi (satır 73-74: *"Eager `$connect()` YOK"*), `onModuleInit` artık `app.init()` sırasında gerçek bir sorgu koşuyor. ÖLÇÜLDÜ: bağlantı reddinde hızlı düşüyor (`Can't reach database server at 127.0.0.1:1`), yani connection-refused'da sınırsız askıda kalma yok. Yine de Kubernetes'te bir Postgres failover'ı artık "bozulmuş ama dinleyen süreç" yerine **pod crash-loop** üretir. **Güvenlik yargısı: fail-closed burada DOĞRU seçim** — bu bir güvenlik gerilemesi değil, açıkça sahiplenilmesi gereken bir erişilebilirlik takası (readiness ⇄ liveness probu, restart backoff, `connect_timeout`). Borç satırı: `[low] apps/api/src/auth/auth.module.ts:103 — açılış probu için timeout/retry + readiness/liveness politikası sahiplenilmedi — devops — vade v0.0.16`. | devops            |
| **S-14** | low        | `packages/db/sql/rollback-auth-role.sql:79`                                  | Kill-switch `arkesoft_app`'e üç sır tablosunda `SELECT, INSERT, UPDATE, DELETE`'i **geri verir** (tasarım gereği, v0.0.14 davranışına dönüş). Ama ölçüldü: `assertAuthRoleIsRestricted` yalnızca `arkesoft_auth`'un `tenant`'taki yetkisini sorguluyor — geri alma sonrası prob **geçmeye devam eder** ve açılış başarılı olur; ayrıcalık sınırının yeniden açıldığına dair **hiçbir çalışma zamanı sinyali** kalmaz. Kalan savunma ayakta ve doğrulandı: `AppPrismaDatabase = Pick<PrismaDatabase, 'tenant' | 'user' | 'tenantMembership'>` (`packages/db/src/client.ts:200`) allow-list'i üç sır modelini yapısal olarak düşürüyor, yani `apps/api` kodu yine erişemez. Eksik olan gözlemlenebilirlik. Borç satırı: `[low] packages/db/sql/rollback-auth-role.sql:79 — geri alma sonrası ayrıcalık sınırının açıldığına dair çalışma zamanı sinyali yok; runbook'a "bu kademeden sonra pnpm test:isolation KIRMIZI olmalıdır" doğrulama adımı eklenmeli — docs/db — vade v0.0.16`. | docs (runbook) / db |

### Bulgu AÇMADIĞIM, ölçülmüş iki nokta (handoff "Değerlendir" dedi)

1. **S-3'ün teşhis takası (ad bazlı tam maske).** `backend`'in dürüst notu doğru ama etkisi
   ihmal edilebilir — ölçtüm: operatörün gerçekten ihtiyaç duyduğu teşhis bilgisi
   **gerçek arıza kanalından** geliyor, maskeli listeden değil:
   `Can't reach database server at 127.0.0.1:1` (host+port) ve
   `password authentication failed for user "arkesoft_auth"` (kullanıcı adı). Ayrıca
   `parseEnv` hata metni değişken adını ve ihlal edilen kuralı zaten söylüyor. Takas
   **doğru yapılmış**; bulgu yok.
2. **S-5'in pin sınırı (`.default()` tip seviyesinde görünmez).** Ölçtüm: `.default()`
   eklenirse `parseEnv` fırlatmaz, dolayısıyla `database-auth-url-fail-fast.test.ts:41`
   **kırmızıya döner**. Vektör çalışma zamanı testiyle kapalı; pinin tek başına
   yakalamaması **kabul edilebilir sınır**. Bulgu yok.

---

## 7. §7 / §10 kontrol listeleri

### §7 — Tenant izolasyonu (14 madde)

Bu değişiklik **yeni tablo, yeni tRPC prosedürü, yeni kuyruk işi veya yeni endpoint
EKLEMİYOR** (ölçüldü: `git diff --stat` — yalnızca `packages/db`, `packages/config` ve
`apps/api/src/auth` + `src/config` dosyaları).

| # | Madde                                          | Durum                                                                                                                                                                                       |
| - | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | `tenant_id` NOT NULL                           | N/A (yeni tablo yok) — mevcut şema için `lintCatalog` taban koşumu **0 bulgu**                                                                                                              |
| 2 | RLS etkin + `current_setting` politikası       | N/A / taban 0 bulgu (`RLS_NOT_ENABLED`/`RLS_NOT_FORCED`/`POLICY_*` sessiz)                                                                                                                  |
| 3 | `(tenant_id, …)` bileşik indeks                | N/A / taban 0 bulgu                                                                                                                                                                         |
| 4 | `tenantProcedure`/`permissionProcedure`        | N/A — prosedür eklenmedi                                                                                                                                                                    |
| 5 | `withTenant(tenantId)` üzerinden sorgu         | Değişmedi. Yeni `AuthPrismaClientResource` istemcisi yalnızca **platform seviyesi** tablolara dokunuyor (`account`/`session`/`verification`/`app_user` — `tenant_id` taşımıyorlar); mevcut, belgelenmiş R-1/ADR-0008 istisnası, bu sürümde genişletilmedi |
| 6 | Girdideki `id`'ler için sahiplik doğrulaması   | N/A — yeni girdi yüzeyi yok                                                                                                                                                                 |
| 7 | Kuyruk işi payload'ında `tenantId`             | N/A                                                                                                                                                                                         |
| 8 | Dış kaynak (Meili/S3/önbellek) tenant kapsamlı | N/A                                                                                                                                                                                         |
| 9 | Önbellek anahtarı `tenant:{id}:…`              | N/A                                                                                                                                                                                         |
| 10 | Dosya yolu tenant önekiyle doğrulanıyor       | N/A                                                                                                                                                                                         |
| 11 | `createTenantIsolationSuite()` çapraz test     | Yeni kaynak yok; mevcut süit **50/5 yeşil** (bağımsız koşturdum)                                                                                                                            |
| 12 | Hata mesajı başka tenant'ın varlığını sızdırmıyor | N/A — yeni kullanıcıya dönük hata yok. `AuthRoleNotRestrictedError` açılış zamanı **sunucu kaydı**; süreç `listen()`'e hiç ulaşmadığı için hiçbir istemciye ulaşamaz (yapısal)           |
| 13 | Log kayıtlarında `tenantId`                    | Yeni açılış logunda `tenantId` **yok** — doğru: istek öncesi/kiracı öncesi bootstrap kaydı. İhlal değil                                                                                     |
| 14 | Süper admin impersonation + denetim kaydı      | N/A                                                                                                                                                                                         |

**Karşılanmayan madde: yok.** ⚠ Ama asıl bulgu şu: **§7'nin 14 maddesi bu değişikliğin
ihtiyaç duyduğu kontrolü HİÇ İÇERMİYOR.** Liste `GRANT`/`REVOKE`/RLS eksenini kapsıyor,
**bağımlı nesne** eksenini (view / materialized view / `SECURITY DEFINER` fonksiyon) hiç
sormuyor — S-7 ve S-8 tam bu boşlukta yaşıyor.

**§7'ye önerilen 15. madde (`docs` + `architect`):**

> - [ ] Bir tabloya `GRANT`/`REVOKE` ile kurulan ayrıcalık sınırı, o tabloya **bağımlı
>       nesneler** için de doğrulandı: `public` şemasında o tabloyu okuyan view /
>       materialized view / `SECURITY DEFINER` fonksiyon **yok**, ya da varsa aynı
>       sınırı taşıyor. (Gerekçe: `ALTER DEFAULT PRIVILEGES … ON TABLES` view ve
>       matview'ı da kapsar ve view varsayılan olarak **sahibinin** yetkisiyle çalışır —
>       tablo seviyesi `REVOKE` tek başına yetmez.)

### §10 — Asla yapılmayacaklar (ilgili maddeler)

| #  | Madde                                      | Durum                                                                                                                                                       |
| -- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2  | `any` / `@ts-ignore`                       | Temiz — yeni dosyalarda yok; `as` yalnızca Zod parse sonrası (`catalog-snapshot.ts`, `auth-role-guard.ts`)                                                   |
| 3  | `tenant_id` filtresiz sorgu / RLS'siz tablo | Temiz — `lintCatalog` taban **0 bulgu**                                                                                                                      |
| 4  | RLS devre dışı / `BYPASSRLS` uygulama koduna | Temiz — ölçüldü: `arkesoft_app`/`arkesoft_auth`/`arkesoft_migrator` hepsi `rolsuper=f`, `rolbypassrls=f`. Kural anti-vacuity'si M17 ile kanıtlandı          |
| 7  | Kart/şifre/token/API anahtarı/TCKN loglamak | ⚠ **S-10 ile ihlal** (`REDIS_URL` parolası stdout'a birebir). Açılış hata yolu için temiz: 5/5 senaryoda parola yok                                         |
| 8  | Gizli bilgiyi repoya commit etmek          | Temiz — `git diff --cached` **boş**; çalışma ağacı diff'i + 11 izlenmeyen dosya `(password|secret|api[_-]?key|token|BEGIN .*PRIVATE KEY)` ile tarandı: tüm eşleşmeler tanımlayıcı adı/yorum. `.env.example`'a eklenen tek satır `arkesoft_auth_dev_only` yer tutucusu (mevcut üç satırla aynı desen) |
| 12 | Sağlayıcıya özgü dallanma                  | N/A                                                                                                                                                         |
| 14 | Yeni ana bağımlılığı gerekçesiz eklemek    | Temiz — ölçüldü: `package.json` + `packages/db/package.json` diff'i yalnızca **script** ekliyor (`db:rollback-roles`, `db:rollback-auth-role`), bağımlılık eklemiyor |
| 18 | Denetim kaydı bırakmadan süper admin işlemi | N/A                                                                                                                                                         |

### Diğer gate maddeleri (kısa)

- **Enjeksiyon:** üretim kodunda `$queryRawUnsafe`/`$executeRawUnsafe` **yok** (tarandı;
  eşleşmeler yalnızca üretilmiş Prisma tipleri ve bir yorum). `readTableGrants` statik
  etiketli şablon, interpolasyon yok, Zod ile parse. `rollback-auth-role.sql` dinamik SQL'i
  `format('… %I …')` ile identifier-quote'luyor. **Bulgu yok.**
- **Girdi doğrulama:** yeni dış veri okumalarının hepsi Zod'dan geçiyor —
  `probeRowSchema`, `tableGrantRowSchema`, `databaseAuthEnvSchema`,
  `rollback-roles.ts`'in `process.argv` → `RollbackTarget` daraltması. **Bulgu yok.**
- **Oran sınırlama:** bu sürümde dokunulmadı (`rate-limit.*` diff'te yok) — **kapsam dışı**.
- **SSRF / dosya yükleme:** bu sürümde yeni yüzey yok — **kapsam dışı**.
- **Ödeme / PII / KVKK:** bu sürümde yeni veri toplanmıyor; değişiklik **azaltıcı** yönde
  (`arkesoft_app` artık parola hash'lerini okuyamıyor) — **bulgu yok**.
- **Bağımlılık:** `pnpm audit` → **0 kritik**, **1 yüksek** (`multer`, `@nestjs/platform-express`
  üzerinden geçişli — **mevcut borca atıf**, T-014'te açılmış, yeni bulgu DEĞİL),
  **1 orta** (`minimatch`, yalnızca `eslint` üzerinden dev bağımlılığı). Yeni bağımlılık
  eklenmedi.

---

## 8. `docs`'a önerilen cümle (S-2(a) — ADR-0017 "Olumsuz Sonuçlar")

S-2(a)'yı bulgu olarak yeniden açmıyorum. `docs` için önerilen metin (iki cümle):

> `arkesoft_auth`'un kısıtlılığı **üretimde derleme zamanında garanti edilemez**: hem
> `bootstrap-roles.sql` §7'nin hem de `DATABASE_AUTH_URL`'in doğru role işaret etmesi bir
> **operatör sorumluluğudur**, ve `pnpm test:isolation`'ın canlı kanıtı yalnızca o
> veritabanı için geçerlidir — üretime transfer olmaz. Bu boşluğu çalışma zamanında
> `assertAuthRoleIsRestricted()` kapatır (`packages/db/src/auth-role-guard.ts`): `apps/api`
> açılışta bir kez, bağlantının `current_user`'ının `tenant` tablosunda SELECT yetkisi
> **taşımadığını** doğrular ve taşıyorsa süreci fail-closed düşürür — ölçüldü, üç yanlış
> rolün (`arkesoft_app`, `arkesoft_migrator`, süper kullanıcı) hepsi yakalanıyor; bunun
> bedeli, `DATABASE_AUTH_URL` hatalı veya veritabanı ulaşılamazsa hatanın artık istek
> anında değil **açılışta** ortaya çıkmasıdır.

---

## 9. DOĞRULANAMADI

| Konu                                                                     | Neden                                                                                                                                                                                                       | Havale             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `qa`'nın ölçtüğü `consoleErrorSpy.mock.calls.length === 0`               | Doğrudan ölçmek, sahibi olmadığım bir test dosyasını değiştirmeyi (veya `apps/api/src`'e geçici dosya yazmayı) gerektirirdi — AGENT_BASELINE §5. Bunun yerine **altındaki güvenlik özelliğini** bağımsız ölçtüm (§2 tablosu) ve `qa`'nın sayısını olduğu gibi kabul ettim. | `qa` (ölçümü duruyor) |
| `pnpm test` / `lint` / `typecheck` / `build` / `format:check` tam koşumu | Bu tur yalnızca `pnpm --filter @arkesoft/api test` (490/62) ve `pnpm --filter @arkesoft/db test:isolation` (50/5) koşturuldu — handoff'un `qa` tarafından iki kez doğrulanmış tabanıyla birebir uyuştu. Tam kapı koşumu `qa`'nın işi; sayıları tekrar üretmedim. | `qa`               |
| S-7/S-8'in `main`'e girmiş **gerçek** bir nesneyle istismarı            | Ölçüldü: `public` şemasında `relkind IN ('v','m','f','p')` sayısı **0** ve hiç fonksiyon yok — istismar edilecek nesne bugün YOK. Bulgular bu yüzden "kurulu tuzak + eksik kontrol" olarak derecelendirildi, "canlı sızıntı" olarak DEĞİL. | —                  |
| Üretim Postgres kümesinin gerçek durumu (`arkesoft_auth` var mı, §7 DDL'i koştu mu) | Erişimim yok. S-2(b) değerlendirmesi yerel kümede **rol yetenekleri** üzerinden yapıldı; probun mantığı rol adından bağımsız olduğu için sonuç transfer eder, ama üretim kümesinin kendi durumu ölçülmedi. | devops / release   |
| `relkind IN ('r','p')` düzeltmesinin yan etkisi (`readTables` ile çakışma) | Düzeltme önerisi; uygulanmadığı için ölçülemedi. `db` uyguladığında taban 0 bulgu kalmalı.                                                                                                                 | `db`               |

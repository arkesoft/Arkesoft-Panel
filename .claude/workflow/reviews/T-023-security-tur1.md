# T-023 — GATE `security`, tur 1

- **Tarih:** 2026-11-18
- **Sürüm:** ROADMAP v0.0.20.2 (platform 0.10.2)
- **Dal:** `feat/v0.0.20-super-admin-iskeleti`
- **Kapsam:** denetim izi ekle-sal (append-only) sertleştirmesi — `arkesoft_app`
  rolünden `audit_log`/`platform_audit_log` üzerinde `UPDATE, DELETE, TRUNCATE`
  çekilmesi + katalog linter'ının kapalı küme yetki beyanı

```
GATE: security
SONUÇ: FAIL
```

---

## BULGULAR

### [SEV: high] `packages/db/sql/rollback-audit-append-only.sql:55` — geri alma script'i rolün HİÇ sahip olmadığı `TRUNCATE`'i veriyor (taban durumun ÜSTÜNE çıkıyor)

**Ölçüm (canlı, `ROLLBACK` içinde):**

- `bootstrap-roles.sql:167` ve `:174` (bölüm 4 blanket GRANT + `ALTER DEFAULT
PRIVILEGES`) yalnızca **dört** fiil veriyor: `SELECT, INSERT, UPDATE, DELETE`.
  `TRUNCATE` **hiç verilmiyor**.
- Canlı doğrulama: `arkesoft_app` `public` şemasındaki **20 tablonun 0'ında**
  `TRUNCATE` taşıyor (`arkesoft_auth` de 0). Yani §9'un `REVOKE … TRUNCATE`'i
  **zaten var olmayan** bir yetkiyi çekiyor (zararsız, idempotent).
- Geri alma script'i ise `GRANT UPDATE, DELETE, **TRUNCATE**` yazıyor
  (`:54-57`). ⇒ Geri alma, deltayı **terslemiyor**; rolü v0.0.20.2 **öncesinden
  daha yetkili** bırakıyor.
- Bu fazlalık testte de **pinlenmiş**:
  `rollback-audit-append-only.isolation.test.ts:175-178` (DDL semantiği),
  `:232-236` (`restoredFalseVerbs` → `canTruncate` dahil), `:276-284`
  (`canTruncate: true` assert'i). Yani mevcut süit bu fazla yetkiyi **doğru
  davranış olarak sabitliyor**.

**Saldırı senaryosu (somut):** Operatör `pnpm db:rollback-audit-append-only`
çalıştırır (bu sürümün **kendi belgelediği, desteklenen** geri alma yolu; ADR-0017
Ek ve `rollback-roles.ts:12-22` onu resmî kademe olarak tanımlıyor). O andan
itibaren `arkesoft_app` iki denetim tablosunda `TRUNCATE` taşır. `TRUNCATE`
**RLS'e tabi değildir** — ele geçirilmiş bir uygulama kimliği (veya ham SQL'e
ulaşan bir hata/enjeksiyon) **tek bir ifadeyle** `TRUNCATE audit_log` diyerek
**bütün kiracıların** denetim kaydını siler; kendi ihlalinin izi dahil.
v0.0.20.2 **öncesinde bu mümkün değildi**: rol yalnızca `DELETE` taşıyordu ve
`audit_log` FORCE RLS altında olduğu için `DELETE FROM audit_log` yalnızca o anki
`app.tenant_id`'nin satırlarını siliyordu. ⇒ Geri alma script'i, **kiracı
izolasyonunu baypas eden, çapraz kiracı bir veri imha primitifi yaratıyor.**

**Neden `critical` değil:** sömürü iki koşul ister — (1) operatörün bilinçli geri
alması, (2) ayrı bir uygulama rolü ele geçirmesi. Ayrıca geri alma sonrası
katalog linter'ı **altı** `APP_ROLE_UNEXPECTED_PRIVILEGE` bulgusu üretiyor (tespit
var; ama CI'da, çalışma zamanında değil).

**Önerilen düzeltme:** `GRANT UPDATE, DELETE` (yalnızca iki fiil); `TRUNCATE`
**geri verilmez**, çünkü hiç verilmemişti. Dosya başına bunun **bilinçli
asimetri** olduğunu yazan not eklenir (§9'un `REVOKE`'u üç fiil, geri alma iki
fiil). Buna bağlı test güncellemesi: `restoredFalseVerbs` →
`['canUpdate','canDelete']`, `:276-284`'te `canTruncate: false`, beklenen bulgu
sayısı 6 → 4.

**Sorumlu ajan:** `db` (S6 — SQL, S7 — testin pini)

---

### [SEV: medium] `packages/db/prisma/schema.prisma:564` (`audit_log_tenant_id_fkey`, `ON UPDATE CASCADE`) — `REVOKE UPDATE`'i baypas eden, HİÇBİR YERDE YAZILMAYAN ikinci cascade ekseni

**Ölçüm (canlı, `ROLLBACK` içinde, sertleştirme uygulanmış DB'de):**

```
SET SESSION AUTHORIZATION arkesoft_app;
UPDATE audit_log SET subject='x';            -> ERROR 42501 permission denied
UPDATE tenant SET id='…-RENAMED' WHERE id=…; -> UPDATE 1
-- sonuç: audit_log satırının tenant_id'si '…-RENAMED' oldu (satır DEĞİŞTİ)
```

FK `ON UPDATE CASCADE` taşıyor (`\d audit_log` → `ON UPDATE CASCADE ON DELETE
CASCADE`). PostgreSQL'de RI cascade eylemleri referans eden tabloda `UPDATE`
yetkisi de **aramaz** — `DELETE` ekseniyle **birebir aynı sınıf**, ama
dokümantasyonun **hiçbir yerinde geçmiyor**: `CHANGELOG.md:32`, ADR-0017 Ek
("Olumsuz ve kabul edilen maliyet"), `ROADMAP.md:1429`, `:3790` (`D2`) ve
`ROADMAP:2912` (varsayım kaydı) **yalnızca `onDelete: Cascade`** eksenini
anlatıyor. Sürümün dürüst cümlesi — _"uygulamanın çalışma zamanı rolünün
güncelleme, silme ve TRUNCATE yetkisi yoktur"_ — yetki düzeyinde **doğru**, ama
_etki_ düzeyinde `UPDATE` için de bir baypas var ve bu **ölçülmemiş, yazılmamış**.

**Saldırı senaryosu:** `tenant.id` yazan bir kod yolu (bugün **yok** — grep:
`apps/api`'de tek `tenant.update` çağrısı `tenant-security.service.ts:92` ve
yalnızca `requireTwoFactorForOwner` yazıyor) ileride eklenirse ya da ham SQL'e
ulaşan bir hata/enjeksiyon olursa, ele geçirilmiş uygulama rolü `audit_log`
satırlarının `tenant_id`'sini **yeniden yazar** — denetim kayıtları kiracının
görüş alanından çıkar (yetim kalır) ve kiracı kapsamlı denetim okuması onları
göremez. Rol `audit_log` üzerinde `UPDATE` taşımadan denetim kaydını
**değiştirmiş** olur.

**Neden `medium`:** bugün erişilebilir bir üretim kod yolu **yok** (ölçüldü) ⇒
`high` değil; ama `D2`'nin kapsamı eksik ve iddia kısmen yanlış ⇒ `low` da değil.

**Önerilen düzeltme:** `D2` borç satırına ve ADR-0017 Ek'in "Olumsuz" paragrafına
`ON UPDATE CASCADE` ekseni **adıyla** eklenir (aynı kısıt, aynı gelecek düzeltme,
`DROP CONSTRAINT` duvarı da aynı). Kod değişikliği **gerekmiyor**.

**Sorumlu ajan:** `docs` (metin) + `architect` (`D2`'nin kapsam/derece
yeniden değerlendirmesi)

---

### [SEV: medium] `docs/adr/0017-…md` (Ek → "Olumsuz ve kabul edilen maliyet") · `ROADMAP.md:3790` (`D2`) · `CHANGELOG.md:32` — cascade deliğinin patlama yarıçapı EKSİK yazılmış ("o kiracının" ≠ gerçek)

**Ölçüm (canlı, `ROLLBACK` içinde):** `tenant` tablosu **RLS taşımıyor**
(`pg_class.relrowsecurity = f`, `relforcerowsecurity = f` — bilinçli tasarım:
`PLATFORM_LEVEL_TABLES`, `tenancy.ts:132`). Sonuç:

```
SET ROLE arkesoft_app; set_config('app.tenant_id','sec-probe-a');
DELETE FROM tenant WHERE id='sec-probe-b';   -> DELETE 1   (BAŞKA kiracı!)
UPDATE tenant SET id=… WHERE id='sec-probe-b'; -> UPDATE 1 (BAŞKA kiracı!)
```

Üç belge de _"bir kiracı tamamen silindiğinde **o kiracının** denetim kayıtları
da cascade ile gidiyor"_ / _"**o kiracının** tüm `audit_log` kayıtlarını
silebiliyor"_ diyor — bu, okuyucuya **kendi kapsamıyla sınırlı** bir delik
anlatıyor. Gerçek: veritabanı katmanında sınır **yok**; herhangi bir kiracı
bağlamındaki uygulama rolü **herhangi bir kiracının** denetim izini cascade ile
silebilir. Tek bariyer uygulama katmanı yetkilendirmesi — ki denetim izinin
hayatta kalması **tam olarak o katman çöktüğünde** beklenir.

**Saldırı senaryosu:** Ele geçirilmiş bir kiracı oturumu üzerinden uygulama
rolüne ham `DELETE FROM tenant WHERE id = '<kurban>'` ulaştıran bir hata/enjeksiyon
⇒ kurban kiracının **tüm** denetim kaydı (ve `job` kayıtları) silinir; saldırı
ayrıca denetim izinde iz bırakmaz.

**Neden `medium` (ve `critical` değil):** temel yetenek bu sürümün **ürettiği bir
regresyon değil** — `tenant`'ın RLS'siz olması ve rolün orada tam DML taşıması
önceden vardı ve `D6` olarak kayıtlı. Bulgu, bu sürümün **yazdığı sınırlama
metninin** ölçülebilir biçimde eksik olmasıdır ve `D2`'nin `medium` derecesinin
dayandığı varsayımı (kendi kapsamı) çürütür.

**Önerilen düzeltme:** üç yerde de _"o kiracının"_ → _"herhangi bir kiracının
(`tenant` tablosu RLS taşımaz — `PLATFORM_LEVEL_TABLES`)"_; `D2` satırına çapraz
kiracı patlama yarıçapı yazılır ve `D6` ile çapraz atıf verilir.

**Sorumlu ajan:** `docs` + `architect`

---

### [SEV: low] `packages/db/src/catalog-snapshot.ts` / `catalog-lint.ts` — `pg_roles.rolconfig` ve `pg_temp` eksenleri hâlâ görüş alanı dışında; `arkesoft_app` KENDİ rol ayarını değiştirebiliyor

**Ölçüm (canlı, gerçek `SET SESSION AUTHORIZATION arkesoft_app` ile, `ROLLBACK`):**

| Deneme                                          | Sonuç                                        |
| ----------------------------------------------- | -------------------------------------------- |
| `ALTER ROLE arkesoft_app SET search_path …`      | ⚠ **ALTER ROLE (başarılı)**                  |
| `CREATE TEMP TABLE …`                            | ⚠ **CREATE TABLE (başarılı)**                |
| `CREATE FUNCTION pg_temp.… SECURITY DEFINER`     | ⚠ **CREATE FUNCTION (başarılı)**             |
| `SET ROLE arkesoft_migrator`                     | ✅ `ERROR: permission denied to set role`     |
| `CREATE FUNCTION public.…`                       | ✅ `ERROR: permission denied for schema public` |
| `CREATE SCHEMA …`                                | ✅ `ERROR: permission denied for database`    |

Bugün **yükseltme yolu yok**: ayrıcalıklı bir rolün sahip olduğu `SECURITY
DEFINER` fonksiyon **sıfır** (ölçüldü), `public` şemada `CREATE` yok, rol üyeliği
yok. Ama `rolconfig` + `pg_temp` ikilisi CLAUDE.md §7'nin **kendi kör nokta
listesinde adı geçen** iki eksen ve **saldırganın kontrolünde**; ilk ayrıcalıklı
`SECURITY DEFINER` fonksiyonu eklendiği gün klasik `search_path` kaçırma zemini
hazır olur.

**Önerilen düzeltme (borç, düzeltme turu açmaz):** katalog snapshot'ına çalışma
zamanı rolleri için `rolconfig IS NULL` kontrolü (tek satır, mevcut `readRole`
sorgusuna eklenir) ve/veya `REVOKE TEMPORARY ON DATABASE arkesoft FROM PUBLIC`.
**Vade önerisi:** ilk `SECURITY DEFINER` fonksiyon ihtiyacından **önce**; en geç
v0.0.22 (`D2` ile aynı pencere). **Sorumlu ajan:** `db`.

---

### [SEV: low] `apps/api/src/__tests__/production-write-path-grep.qa.test.ts:69` — KAPI 4'ün tarama kökü yalnızca `apps/api/src`

Kapının başlığı _"denetim kaydı **üretimde** GÜNCELLENMİYOR ve SİLİNMİYOR"_ diyor,
ama `AUDIT_WRITE_SCOPE_ROOTS` tek kök taşıyor: `apps/api/src`. `packages/db`
(seed), `apps/superadmin`, `scripts/` taranmıyor. **Bugün ihlal yok** — depo
geneli grep'imde (`apps`, `packages`, `scripts`, test dışı) gerçek çağrı yeri
**sıfır**; tek eşleşmeler Prisma'nın **üretilmiş** dosyalarındaki doküman
yorumları (`packages/db/generated/models/*.ts`). Bulgu, kapının **sonucu** değil
**kapsamı** hakkında.

**Önerilen düzeltme (borç):** kök listesine `packages/db/src` + `scripts` eklenir
(veya başlık kapsamı daraltılacak şekilde düzeltilir). **Vade önerisi:** bir
sonraki `apps/api` dokunuşu. **Sorumlu ajan:** `backend`.

---

## (a) DÖRT MUTASYON — SONUÇLAR

Her mutasyon `python3` ile uygulandı, **`Edit`/dosya-içi geri yazma** ile geri
alındı (`git checkout` **kullanılmadı**); her geri alma `shasum` ile baytı baytına
doğrulandı. Koşumlar **turbo'suz** (`npx vitest run` paket dizininden) — önbellek
sahte yeşili **yapısal olarak imkânsız**.

| #     | Mutasyon                                           | Drift testi (`append-only-tables-sql-consistency`) | `tsc`      | Canlı `test:isolation` (`catalog-lint-live` + 2) | Sonuç             |
| ----- | -------------------------------------------------- | -------------------------------------------------- | ---------- | ------------------------------------------------ | ----------------- |
| —     | **taban**                                           | 🟢 4/4                                              | 🟢         | 🟢 9/9                                            | —                 |
| **1** | beyandan (`tenancy.ts:334-341`) `audit_log` silindi | 🔴 **2/4 düştü**                                    | 🟢         | 🔴 **3/9 düştü**                                  | **YAKALANDI**     |
| **2** | `bootstrap-roles.sql` §9 dizisinden çıkarıldı       | 🔴 **1/4 düştü**                                    | 🟢         | (koşulmadı)                                       | **YAKALANDI**     |
| **3** | `rollback-audit-append-only.sql` dizisinden çıkarıldı | 🔴 **1/4 düştü**                                  | 🟢         | (koşulmadı)                                       | **YAKALANDI**     |
| **4** | ⚠⚠ **ÜÇÜNDEN DE AYNI ANDA**                        | 🟢 **4/4 — SESSİZ**                                 | 🟢 **sessiz** | 🔴 **3/9 düştü**                                 | **YAKALANDI — ama ÜÇ LİSTE DEĞİL, CANLI KATALOG yakaladı** |

**Mutasyon 1'in iddiası doğrulandı:** canlı linter çıktısında tam olarak
`APP_ROLE_MISSING_DML_PRIVILEGE` + `"tableName": "audit_log"` üretildi — **eski
kural gerçekten yeniden silahlanıyor** (architect'in "tamamlayıcı kural"
tasarımı tuttu).

### ⚠⚠ DÖRDÜNCÜ MUTASYONUN GERÇEK CEVABI — "aynı tuzağın kardeşi mi?"

**İki yön ayrılmalı; cevap yöne göre DEĞİŞİYOR:**

1. **SİLME yönü** (zaten sertleştirilmiş bir tabloyu üç listeden de çıkarmak):
   **YAKALANIYOR.** Ama yakalayan şey **üç listenin birbirine bağlanması
   DEĞİL** — drift testi ve `tsc` ikisi de **yeşil** kaldı, yani üç liste
   birbiriyle **tutarlı** görünüyor (CLAUDE.md §7'nin "dört liste" tuzağının
   **birebir aynı şekli**). Yakalayan **dördüncü tanık**: canlı veritabanı.
   `REVOKE` kalıcı olduğu için katalog hâlâ `upd=f, del=f` diyor, beyan artık
   o tabloyu kapsamıyor, eski kural devreye giriyor. ⇒ Güvence **listelerden
   değil, kalıcı DB durumundan** geliyor.

2. **EKLEME yönü** (**yeni** bir append-only tabloyu üç listeden **hiçbirine**
   yazmamak — `D11`'in ve `po`'nun `R-NEW-2`'sinin asıl sorduğu senaryo):
   **YAKALANMIYOR.** Deterministik, kod okumasıyla kanıtlı:
   §9 hiç `REVOKE` etmez → katalog dört DML'i **tam** gösterir →
   `lintAppRoleDmlPrivileges` yalnızca **eksik** fiili bulgu yapar, **tam** DML'de
   susar (`catalog-lint.ts:678-731`) → `lintAppRoleTablePrivilegeExpectations`
   beyanda olmayan tabloyu hiç dolaşmaz (`:764`, döngü `expectations` üzerinde)
   → `TRUNCATE` ekseni eski kural tarafından **hiç okunmaz**. ⇒ **Sıfır bulgu.**
   Bu yön canlı koşulmadı (taze DB / yıkıcı bootstrap gerektirirdi) — ama
   mutasyon 4'ün drift + `tsc` **yeşilliği** aynı mekanizmanın gözlenmiş
   yarısıdır.

**Hüküm:** `D11` **doğru öngörüyor** ve `medium` derecesi yerinde. Tasarım,
"dört liste" tuzağının **kardeşi**dir; farkı, bu sürümün **zaten sertleştirdiği
iki tablo** için canlı kataloğun ek bir tanık sağlamasıdır — bu koruma **yeni
tablolara genişlemez**. (Bu bir **bulgu değil**: `D11` kapsam dışı olarak zaten
yazılı; ölçüm onu **teyit ediyor**.)

---

## (b) `REVOKE`'UN CANLI ETKİNLİĞİ + BAŞKA YOL VAR MI

### Etkinlik — doğrulandı (tamamı geri alınmış transaction içinde)

`SET ROLE arkesoft_app` / `SET SESSION AUTHORIZATION arkesoft_app`:

| İfade                                | Sonuç                                              |
| ------------------------------------ | -------------------------------------------------- |
| `UPDATE audit_log SET subject='x'`   | ✅ `ERROR: 42501: permission denied for table audit_log` |
| `UPDATE audit_log SET ip=NULL`       | ✅ `ERROR: 42501`                                   |
| `DELETE FROM audit_log`              | ✅ `ERROR: 42501`                                   |
| `TRUNCATE audit_log`                 | ✅ `ERROR: 42501`                                   |
| `UPDATE platform_audit_log …`        | ✅ `ERROR: 42501`                                   |
| `DELETE FROM platform_audit_log`     | ✅ `ERROR: 42501`                                   |
| `TRUNCATE platform_audit_log`        | ✅ `ERROR: 42501`                                   |
| `SELECT count(*) FROM audit_log`     | ✅ çalışıyor (yazma yolu kırılmadı)                 |

⚠ **Ölçüm tuzağı (rapora geçsin):** ilk denemede `UPDATE audit_log SET
action='x'` **enum doğrulama hatası** verdi (`invalid input value for enum
audit_action`) — yetki kontrolünden **önce** patladı. Geçerli bir kolonla
tekrarlanmasaydı "42501 gelmedi" diye **yanlış negatif** yazılabilirdi.

### Başka yol var mı — ÖLÇÜLDÜ, **bugün YOK** (bir istisna: FK cascade)

CLAUDE.md §7'nin kendi kör nokta listesi, tek tek:

| Eksen                                   | Ölçüm                                                                                               | Sonuç |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ----- |
| `pg_proc.prosecdef` (`SECURITY DEFINER`) | `public` dışı + `public` şemada kullanıcı fonksiyonu **0 satır**                                     | ✅ yok |
| PUBLIC-dışı `EXECUTE` alıcıları          | hiç fonksiyon yok ⇒ `proacl` konusu yok                                                              | ✅ yok |
| `pg_trigger` (kullanıcı tanımlı)         | **0 satır**; `CREATE TRIGGER` denemesi → `42501`                                                     | ✅ yok |
| `pg_rewrite` (RULE)                      | yalnızca `pg_settings` sistem kuralları; `CREATE RULE` denemesi → `must be owner`                    | ✅ yok |
| `pg_roles.rolconfig` / `pg_db_role_setting` | bugün **boş**; ama rol **kendi** `rolconfig`'ini değiştirebiliyor → **F4 (`low`)**                 | ⚠ bkz. F4 |
| `public` dışı şema                       | yalnızca `public`; `CREATE SCHEMA` → `permission denied for database`; `datacl` NULL (CREATE yok)    | ✅ kapalı |
| view / matview / foreign table           | **0 satır**                                                                                          | ✅ yok |
| rol üyeliği (`pg_auth_members`)          | **0 satır**; `SET ROLE arkesoft_migrator` → `permission denied to set role`                          | ✅ yok |
| kendine yeniden `GRANT`                  | ACL = `arkesoft_app=ar/arkesoft_migrator` (**grant option YOK**, sahip değil); canlı `GRANT UPDATE …` → `WARNING: no privileges were granted`, sonrasında `has_table_privilege(...,'UPDATE') = f` | ✅ yapamıyor |
| `ALTER TABLE … OWNER` / `DISABLE RLS`    | `must be owner of table audit_log`                                                                   | ✅ yapamıyor |
| **FK `ON DELETE CASCADE`**               | ⚠⚠ `DELETE FROM tenant` → `DELETE 1`, `audit_log` kalan = **0** (`REVOKE DELETE`'e RAĞMEN)           | ⚠ **AÇIK** (`D2`) |
| **FK `ON UPDATE CASCADE`**               | ⚠⚠ `UPDATE tenant SET id=…` → audit satırının `tenant_id`'si **DEĞİŞTİ** (`REVOKE UPDATE`'e RAĞMEN)  | ⚠ **AÇIK, YAZILMAMIŞ** → **F2** |
| `platform_audit_log` için cascade        | FK **yok** (`pg_constraint`: bu tabloya/bu tablodan **0 satır**) ⇒ eksen **gerçekten yok**            | ✅ teyit |

**§9'un `DO` bloğunda SQL enjeksiyonu:** yok. Dizi **sabit literal**
(`ARRAY['audit_log','platform_audit_log']`), dışarıdan girdi **yok**, tanımlayıcı
`format('… %I …')` ile **tırnaklanıyor**. Geri alma dosyası aynı desende. ✅

**İnformatif (bulgu değil):** `pg_default_acl` → `arkesoft_migrator`'ın `public`
şemadaki **yeni** tabloları otomatik olarak `arkesoft_app=arwd` ile doğuruyor.
İki denetim tablosu ileride bir migration'la **yeniden yaratılırsa** `REVOKE`
sessizce buharlaşır. Azaltma **zaten var**: `package.json:37-38`
`db:migrate`/`db:deploy` → `&& pnpm db:bootstrap` zinciri, ayrıca
`catalog-lint-live.isolation.test.ts` canlı kataloğu okuduğu için **kırmızı
verir**. Yeni bulgu açılmadı.

---

## (c) İDDİA DÜRÜSTLÜĞÜ GREP'İ — **GEÇTİ** (bir eksikle, F2/F3)

`grep -rniE "değiştirilemez|silinemez|immutable|tamper"` (`.md`, `.ts`, `.sql`,
`.json`; `node_modules` ve `.git` hariç) → **denetim izi bağlamında 0 iddia
satırı**. Eşleşmelerin tamamı ya başka konu (`WORKFLOW.md` sıraları, `po.md`,
`AGENT_BASELINE.md` başlığı, Astro `immutable` cache header'ı, v0.0.14 "son owner
silinemez" iş kuralı) ya da **iddianın açıkça çürütüldüğü** satırlar:

- `ROADMAP.md:1372` — sürüm başlığı: **"Denetim izi ekle-sal (append-only)
  sertleştirmesi"**. ⇒ _"tamper-evidence"_ başlıktan **kaldırılmış**; `R6`
  kapandı.
- `ROADMAP.md:1378-1383` — eski başlığın **yanlış olduğu** ve bütünlük kanıtının
  (`D3`) olmadığı açıkça yazılı.
- `ROADMAP.md:1429` — _"**'silinemez' iddiası `audit_log` için yanlıştır**"_.
- `CHANGELOG.md:32` (⭐ `S9`, kontrol edildi) — _"Bu 'tamper-evident' olduğu
  anlamına gelmez… FK cascade hâlâ dolaylı bir silme yolu bırakıyor"_.
- ADR-0017 Ek, "Olumsuz ve kabul edilen maliyet" — aynı uyarı, `D2` atfıyla.
- `.changeset/` **boş** (yalnızca `config.json`) — changeset `release:version`
  tarafından tüketilmiş; metni CHANGELOG'a geçmiş ve yukarıda denetlendi.

**Kalan eksik (F2/F3):** dürüstlük **yönü** doğru, **kapsamı** eksik — cascade
deliğinin `UPDATE` ekseni hiç yazılmamış ve `DELETE` ekseninin patlama yarıçapı
"o kiracının" diye **dar** yazılmış. Sürüm başlığı artık vaadi **aşmıyor**.

---

## (d) `isPrivilegeDeniedError` — FAIL-CLOSED **TEYİT EDİLDİ**

`packages/db/src/__tests__/helpers/tenant-isolation-suite.ts:129-192` (ve ikizi
`platform-tables.isolation.test.ts:40-70`):

- Beş ayrı erken çıkış, **hepsi `return false`**: (1) nesne/`code` yok,
  (2) `code !== 'P2039'`, (3) `meta` yok, (4) **`safeParse` başarısız**,
  (5) `originalCode !== '42501'`.
- ⇒ Şema uyuşmazlığında **fırlatmıyor** ve **`true` dönmüyor** — **`false`
  dönüyor**. Çağıran taraf `expect(isExpectedMutationRejection(...)).toBe(true)`
  yazdığı için (`:324, :329, :360-373`) bir Prisma şekil kayması süiti
  **GÜRÜLTÜLÜ KIRMIZIYA** çevirir, sessiz yeşile değil. ✅ Doğru fail-closed yönü.
- `S5`'in iki-koşullu tasarımı da doğru: `P2039` tek başına yetki reddine özgü
  **değil** (sözdizimi hatası/deadlock da aynı kodu taşıyor), `originalCode ===
'42501'` ikinci koşulu bunu daraltıyor. Canlı ölçümüm bu SQLSTATE'i **birebir**
  doğruladı (`ERROR: 42501: permission denied for table audit_log`).
- `assertNever` ile exhaustive `switch` var (`:181-191`) ⇒ yeni bir
  `MutationRejectionKind` üyesi derleme zamanında zorlanıyor.
- Senaryo 5 (hata gövdesi yabancı `tenantId`/satır id'si **içermez**) her iki ret
  sınıfı için de korunuyor (`:376-383`) — varlık/yetki oracle'ı kapalı. ✅

⚠ Tek not (bulgu değil): aynı şema + fonksiyon **iki dosyada kopyalandı**
(`tenant-isolation-suite.ts` ve `platform-tables.isolation.test.ts`); gerekçe
dosya sahipliği kısıtı olarak yorumda yazılı. `solid`'in alanı.

---

## (e) VERİTABANININ SERTLEŞTİRİLMİŞ BIRAKILDIĞI İSPATI

Tüm canlı problar **tek transaction + `ROLLBACK`** (veya `SAVEPOINT`/`ROLLBACK
TO`) içinde koştu. `FLUSHDB`/`DROP`/`TRUNCATE` **kullanılmadı**, konteyner
durdurulmadı, `docker context` değiştirilmedi, kök `.env` **okunmadı/yazılmadı**,
3000/5173/5174 portlarına dokunulmadı.

**Kapanış ölçümü (tüm mutasyonlar ve problar bittikten SONRA):**

```
       tablo        | sel | ins | upd | del | trunc
--------------------+-----+-----+-----+-----+-------
 audit_log          | t   | t   | f   | f   | f
 platform_audit_log | t   | t   | f   | f   | f
 tenant_membership  | t   | t   | t   | t   | f      ← kontrol
```

- `SELECT count(*) FROM tenant WHERE id LIKE 'sec-probe%'` → **0** (prob kalıntısı
  yok); `tenant` satır sayısı prob öncesi/sonrası **11 = 11**.
- `packages/db` birim süiti **260/260** 🟢 · `test:isolation` **86/86** 🟢 ·
  `tsc --noEmit` 🟢 — hepsi geri almalardan **sonra**.
- Üç mutasyon dosyasının `shasum`'ları yedeklerle **birebir aynı**:
  `tenancy.ts` `8a06021c…`, `bootstrap-roles.sql` `42dab573…`,
  `rollback-audit-append-only.sql` `2d86cfa4…`.
- `git status --porcelain`'de benim bıraktığım **hiçbir dosya yok** (tek yeni
  untracked girdi paralel koşan `solid` ajanının raporu).

---

## (f) MAKİNE YÜKÜ

| An              | `load averages` (1/5/15 dk) | Konteyner |
| --------------- | --------------------------- | --------- |
| Gate başlangıcı | **2.47 / 3.75 / 4.40**      | 25        |
| Gate bitişi     | **4.58 / 4.56 / 4.42**      | 25        |

Makine **sakin değil** (kullanıcının ~25 konteyneri çalışıyor: `cnc_proje`,
`istoccom`, `moneyprinterturbo` + 5 `arkesoft-*`). Koşumlar **turbo'suz**
(`npx vitest run`, paket dizininden) ⇒ **önbellek sahte yeşili yok**. Tüm
mutasyon ölçümleri **kırmızı/yeşil ikili** olduğu için yük duyarlı değil; flake
gözlenmedi (taban + geri alma koşumları dahil 6 `isolation` koşumunun **6'sı**
aynı sonucu verdi).

---

## (g) DOĞRULANAMADI

1. **"Hiçbirine eklememek" tuzağının EKLEME yönü canlı koşulmadı.** Taze bir
   veritabanı (veya yıkıcı bir `migrate reset`/`bootstrap`) gerektirirdi — ortam
   kısıtı nedeniyle yapılmadı. Sonuç **kod okumasıyla deterministik** olarak
   çıkarıldı (bkz. (a) §2) ve mutasyon 4'ün drift+`tsc` yeşilliğiyle dolaylı
   olarak desteklendi; **canlı kanıt değildir**.
2. **Gerçek `pnpm db:rollback-audit-append-only` script'i koşturulmadı.** F1 (fazla
   `TRUNCATE` hibesi) **statik olarak** (`:55` GRANT metni + §4 blanket GRANT'in
   dört fiili + canlı "0/20 tabloda TRUNCATE" ölçümü) ve **S7 testinin kendi
   assert'iyle** (`:276-284` `canTruncate: true`) kanıtlandı; script'in kendisi
   paylaşılan DB'yi sertleştirmeden çıkaracağı için **bilinçli olarak
   koşturulmadı**.
3. **`arkesoft_app` olarak GERÇEK bir ağ bağlantısı kurulmadı** — problar
   `SET ROLE` / `SET SESSION AUTHORIZATION` ile yapıldı (kök `.env` okunmaması
   kısıtı). ⚠ Bu yöntemin tuzağı **ölçüldü ve rapora geçti**: `SET ROLE` ile
   `SET ROLE arkesoft_migrator` **başarılı** görünüyor, çünkü `SET ROLE` kontrolü
   `session_user`'a (superuser) bakar; `SET SESSION AUTHORIZATION` ile
   tekrarlandığında **doğru şekilde reddedildi**. Tablo yetkisi kontrolleri
   (`42501`) `current_user`'a baktığı için **her iki yöntemde de geçerli**.
4. **`pnpm test` / `pnpm test:e2e` / sekiz kapının tamamı koşturulmadı.** Handoff
   `S9`'un ölçümünü veriyor (e2e 46/46, guards 21/21) ve e2e koşturmak
   **yasaklanmıştı**; ben yalnızca `packages/db`'yi (260 birim + 86 izolasyon) ve
   `tsc`'yi koşturdum.
5. **`apps/api` süiti koşturulmadı** — KAPI 4 değişikliği (`S4`) statik olarak
   okundu ve needle/kök assert'leri doğrulandı, ama testi koşturulmadı (paralel
   `solid` ajanı ve paylaşılan DB gürültüsünden kaçınmak için).

---

## ÖLÇÜMLER

- **`pnpm audit`:** **0 kritik · 2 high · 3 moderate · 1 low** (toplam 6).
  high: `multer` (DoS), `picomatch` (ReDoS); moderate: `minimatch`, `astro`,
  `@astrojs/node`; low: `astro` XSS. ⚠ **Bu değişiklik hiçbirini getirmedi** —
  `pnpm-lock.yaml` **değişmemiş**, yeni bağımlılık **yok** (`package.json`
  diff'leri yalnızca sürüm yükseltmesi + 2 script satırı). Üçü de borç tablosunda
  **kayıtlı** (`ROADMAP:3336`, `:3671`, `:3037`).
- **İncelenen dosya:** değişiklik **59 dosya** (54 değişmiş + 5 yeni); **19
  dosya** derinlemesine okundu (`tenancy.ts`, `catalog-lint.ts`,
  `catalog-snapshot.ts`, `rollback-roles.ts`, `bootstrap-roles.sql`,
  `rollback-audit-append-only.sql`, 4 yeni test + pin, `tenant-isolation-suite.ts`,
  `audit-log.probe.ts`, `platform-tables.isolation.test.ts`,
  `production-write-path-grep.qa.test.ts`, ADR-0017 Ek, CHANGELOG, ROADMAP
  v0.0.20.2 + borç satırları, `schema.prisma` FK).
- **Canlı SQL probu:** 7 oturum, **tamamı `ROLLBACK`**; 30+ ifade.
- **Mutasyon:** 4 (hepsi `Edit`/dosya-içi yazma ile geri alındı, `shasum` ile
  doğrulandı; `git` mutasyonu **sıfır**).
- **Test koşumu:** `packages/db` birim **260/260** 🟢 (15 dosya) ·
  `test:isolation` **86/86** 🟢 (9 dosya, 4.50 s) · `tsc --noEmit` 🟢 ·
  drift testi taban/mutasyon dahil 6 koşum. **Turbo kullanılmadı** (önbellek
  teyidi gereksiz).
- **Tenant izolasyon kontrol listesi (CLAUDE.md §7, 14 madde):**
  karşılanmayan madde **yok** — değişiklik yeni tablo/prosedür/kuyruk işi
  **eklemiyor**; 11. madde (çapraz okuma+yazma testi) `mutationRejection`
  genişletmesiyle **korundu**, 12. madde (varlık/yetki oracle'ı) senaryo 4/5 ile
  **iki ret sınıfı için de** korunuyor, 14. madde (katalog linter'ının görüş
  alanı) bu sürümde **genişletildi** (`canTruncate` + 2 yeni kural).
  ⚠ Kör nokta listesinden **`pg_roles.rolconfig`** ekseni hâlâ görüş alanı
  dışında (**F4**, `low`) ve bu sürümün eklediği geri alma script'i kataloğa göre
  **fazla yetki** veriyor (**F1**, `high`).

---

## FAIL GEREKÇESİ (AGENT_BASELINE §4)

1 × `high` (**F1**) ⇒ **FAIL** · ayrıca 2 × `medium` (F2, F3). `low` bulgular
(F4, F5) düzeltme turu açmaz, doğrudan borç tablosuna yazılır.

**Düzeltme turu açan bulgular:** F1 (`db`), F2 (`docs` + `architect`),
F3 (`docs` + `architect`).

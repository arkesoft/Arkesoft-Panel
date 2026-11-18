# T-023 — GATE `solid`, tur 1

Tarih: 2026-11-18
Sürüm: ROADMAP v0.0.20.2
Dal: `feat/v0.0.20-super-admin-iskeleti`
Yöntem: **statik** inceleme (`Bash` yok — hiçbir komut çalıştırılmadı, hiçbir test koşturulmadı)

```
GATE: solid
SONUÇ: FAIL
```

---

## Özet

Sürümün çekirdek tasarımı (tamamlayıcı iki kural + zorunlu `mutationRejection` +
`as const satisfies` pini) sağlam ve istenen işi **gerçekten** yapıyor; dördü de
bağımsız olarak doğrulandı (aşağıda "Doğrulanan iddialar"). FAIL'in sebebi tek bir
`high`: **geri alma script'i, sertleştirme öncesinde hiç var olmayan bir yetkiyi
(`TRUNCATE`) veriyor** ve bu yanlış davranış S7 testiyle "beklenen" olarak pinlenmiş
durumda. Ayrıca üç `medium` (iki gerçek tekrar + tamamlayıcılık garantisinin
yapısal olmaması) FAIL eşiğini bağımsız olarak da aşıyor.

---

## BULGULAR

### [SEV: high] `packages/db/sql/rollback-audit-append-only.sql:54-57` — geri alma, sertleştirme öncesi duruma DÖNMÜYOR; `arkesoft_app`'e hiç sahip olmadığı `TRUNCATE`'i VERİYOR

Ölçülmüş zincir (üçü de depo içi kanıt, çıkarım değil):

1. `packages/db/sql/bootstrap-roles.sql:167` blanket GRANT **dört** fiil:
   `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO arkesoft_app` —
   `TRUNCATE` **YOK**. Aynısı `:174`'ün `ALTER DEFAULT PRIVILEGES`'ı için de geçerli.
2. `packages/db/src/__tests__/audit-append-only.isolation.test.ts:87-94` — KONTROL
   tablosu (`tenant_membership`, §9'un hedefi **değil**) canlı olarak
   `canTruncate: false` assert ediyor ⇒ app rolü bu depoda **hiçbir** tabloda
   `TRUNCATE` taşımıyor (task `A3`/`M3` ile de tutarlı).
3. `sql/rollback-audit-append-only.sql:54-57` ise
   `GRANT UPDATE, DELETE, TRUNCATE ON public.%I TO arkesoft_app` çalıştırıyor.

Sonuç: `pnpm db:rollback-audit-append-only` koşturulduktan sonra oluşan durum,
v0.0.20.2 **öncesindeki** durum DEĞİLDİR — `audit_log` ve `platform_audit_log`
üzerinde uygulama rolü artık `TRUNCATE` taşır. Bu, dosyanın kendi R3 notunun
("TRUNCATE RLS'i **BAYPAS EDER**") tam olarak uyardığı fiildir ve iki **denetim izi**
tablosunda verilir. Geri alma yolu, sertleştirmeyi geri almak yerine **başlangıçtan
daha zayıf** bir duruma götürüyor.

İki ağırlaştırıcı:

- `sql/rollback-audit-append-only.sql:51-53` yorumu **yanlış**: "`arkesoft_app`in
  v0.0.20.2'den ÖNCEKİ (bölüm 4'ün blanket GRANT'inin verdiği) TAM DML'ini geri ver"
  — bölüm 4'ün blanket GRANT'i `TRUNCATE` **vermiyor**.
- `packages/db/src/__tests__/rollback-audit-append-only.isolation.test.ts:232-236,
  271-285` bu fazlalığı **beklenen davranış olarak pinliyor** (`restoredFalseVerbs`
  üç fiil; `canTruncate: true` assert'i) ⇒ hata artık bir testle korunuyor, sessizce
  düzeltilemez.

**Önerilen düzeltme:** rollback SQL'inde `GRANT UPDATE, DELETE ON ...`
(`TRUNCATE` çıkarılır); `restoredFalseVerbs` → `['canUpdate','canDelete']`;
AC-15 beklenen bulgu kümesi 6 → 4 (`APP_ROLE_UNEXPECTED_PRIVILEGE`, 2 tablo × 2 fiil)
olur, AC-15'in "geri alma gürültülüdür" iddiası **bozulmaz**; `:271-285`'teki canlı
assert `canTruncate: false`a çekilir; `:51-53` yorumu düzeltilir. Bootstrap §9'un
savunmacı `REVOKE ... TRUNCATE`'i **kalır** (no-op ama fail-closed).

**Sorumlu ajan:** `db` (S6 + S7)

---

### [SEV: medium] `packages/db/src/__tests__/platform-tables.isolation.test.ts:51-88` — `isPrivilegeDeniedError` + Zod şeması + SQLSTATE sabiti BİREBİR ikinci kez yazıldı

`packages/db/src/__tests__/helpers/tenant-isolation-suite.ts:140-192`'deki
`driverAdapterErrorMetaSchema` + `POSTGRES_INSUFFICIENT_PRIVILEGE_SQLSTATE` +
`isPrivilegeDeniedError` üçlüsü (≈37 satır), `platform-tables.isolation.test.ts`'e
**bayt düzeyinde** kopyalanmış. Bu yüzeysel benzerlik değil **gerçek tekrar**: iki
kopya **aynı sebeple** değişir — Prisma'nın driver-adapter hata şekli (M5'te bir
kez, statik olarak ölçülmüş `P2039` + `cause.originalCode` sözleşmesi). Prisma
yükseltmesinde biri güncellenip diğeri unutulursa ikinci kopya **fail-closed `false`**
döner ve `platform-tables`'in "app rolü SİLEMİYOR" POZİTİF assert'i (`:180`)
sessizce **yanlış sebeple** kırmızıya döner — ya da daha kötüsü, mesaj yanıltır.

Kopyanın gerekçesi `:58-59`'da yazılı: *"o dosya bu alt görevin dosya listesi
DIŞINDA — DOKUNMA"*. Bu bir **süreç** kısıtı, tasarım kararı değil; üstelik
`tenant-isolation-suite.ts` **aynı Task'ta S5'in dosyasıydı** ve orada tek satırlık
bir `export` yeterdi.

**Önerilen düzeltme:** `isPrivilegeDeniedError`'ı `helpers/tenant-isolation-suite.ts`
içinden (veya yeni `helpers/prisma-errors.ts`'ten) `export` et, ikinci kopyayı sil.

**Sorumlu ajan:** `db` (S6) — dosya sahipliği çakışması için `po`

---

### [SEV: medium] `packages/db/src/__tests__/append-only-tables-sql-consistency.test.ts:55-112` — `FOREACH` ayrıştırıcısı ve iki yönlü karşılaştırıcı, kardeş testten kopyalandı

`extractForeachAppendOnlyTableArray` (`:55-77`), `auth-secret-tables-sql-consistency.test.ts:106-128`'in
`extractForeachSecretTableArray`'inden **yalnızca döngü değişkeni adı** farkıyla
kopyalanmış (regex, 0-eşleşme dalı, >1-eşleşme dalı, `matches[0]?.[1] ?? ''`,
tırnak ayrıştırması — hepsi birebir). `expectSqlArrayMatchesDeclaredExpectations`
(`:86-112`) ile `expectSqlArrayMatchesTenancySource` (`auth-...:140-162`) arasındaki
tek fark **karşılaştırılan küme** ve mesaj metni.

Yine gerçek tekrar: ikisi de **aynı sebeple** değişir — "SQL `FOREACH ARRAY`
literalini metinden çıkarma + fail-closed TAM 1 eşleşme" sözleşmesi. FIX turu 3'ün
"YOL A/YOL B" kararı (`auth-...:49-61`) ileride tekrar gözden geçirilirse iki yerde
gözden geçirilmesi gerekecek ve bunu hatırlatan hiçbir mekanizma yok.

Not: döngü değişkeninin **farklı** olması (F-NEW-3) bu tekrarı gerektirmez —
ayrıştırıcı `loopVariableName` ve karşılaştırıcı `sourceTableNames` + `sourceLabel`
parametresi alan tek bir paylaşılan yardımcı olabilirdi
(`helpers/foreach-array-sql.ts`).

**Önerilen düzeltme:** ortak yardımcıyı `__tests__/helpers/` altına çıkar, iki test
dosyası da onu tüketsin.

**Sorumlu ajan:** `db` (S6)

---

### [SEV: medium] `packages/db/src/catalog-lint.ts:718-723` (+ iddia: `src/tenancy.ts:314-322`, `catalog-lint.ts:273-278`) — tamamlayıcılık garantisi **yapısal değil, VERİYE BAĞLI**; "beşinci liste tuzağı yapısal olarak oluşamaz" iddiası genel olarak YANLIŞ

Mutasyonla (statik, elle) sınandı ve iddia **bugünkü iki satır için DOĞRU**:
beyandan `audit_log` silinirse `lintAppRoleDmlPrivileges` artık o tabloyu atlamaz
(`:703`), katalog `canUpdate/canDelete=false` taşıdığı için `:718-723`
`APP_ROLE_MISSING_DML_PRIVILEGE` üretir. `catalog-lint.test.ts:1461-1485` bunu
doğru kuruyor.

**Ama garanti, beyanın içeriğine bağlı:** eski kural **yalnızca dört DML**'i
kontrol eder — `canTruncate` onun görüş alanında **hiç yoktur** (`:718-723`).
Dolayısıyla beyana ileride şu şekilde bir satır eklenirse:

```
{ tableName: 'X', canSelect: true, canInsert: true, canUpdate: true, canDelete: true, canTruncate: false }
```

(yani tamamen meşru bir "bu tablo TRUNCATE edilemez" beyanı), o satırın **silinmesi
hiçbir kural ateşlemez**: yeni kural devre dışı kalır, eski kural dört fiili de
`true` gördüğü için sessiz kalır ⇒ TRUNCATE ekseni **tamamen korumasız** kalır.
`R-NEW-2`'nin "beşinci liste" riski tam olarak bu kapıdan geri gelir ve
`append-only-tables-sql-consistency.test.ts` de onu yakalamaz (üç yerin üçünden
birden düşen tablo tutarlı görünür — dosyanın kendi `:18-23` notu).

Üç yerdeki iddia metni bu nedenle **fazla iddialı**: `tenancy.ts:314-318`,
`catalog-lint.ts:273-278`, `append-only-tables-sql-consistency.test.ts:5-16`.

**Önerilen düzeltme (iki seçenek):**
(a) `lintAppRoleDmlPrivileges`'in yüklemine `|| privilege.canTruncate` **tersini**
ekleyemeyiz (eski kural "eksik yetki" arıyor) ⇒ bunun yerine beyan **dışındaki**
tablolar için ayrı bir "beklenmeyen TRUNCATE" kuralı ekle (bugün sıfır bulgu
üretir, `lintAppRoleSecretTablePrivileges:988-998`'in emsali);
(b) en azından iddiayı **daralt**: "beyandan **en az bir DML fiilini reddeden** bir
satırın silinmesi eski kuralı yeniden silahlandırır" diye yaz ve kalan boşluğu
ROADMAP borcuna kaydet.

**Sorumlu ajan:** `db` (kural) / `docs` (iddia metni)

---

### [SEV: low] Bayat/artık YANLIŞ yorum kümesi — sürümün kendi değiştirdiği dosyalarda, sürümün tersini söyleyen cümleler

Hepsi T-023'ün dokunduğu dosyalarda; hiçbiri davranış hatası değil ama "BEYAN ≠
GERÇEKLİK" sınıfının ta kendisi:

- `packages/db/src/catalog-lint.ts:689-690` — "Beyan BU alt görevde **BOŞ**
  (`tenancy.ts`) — bu Set BOŞ kalır, hiçbir tablo atlanmaz, davranış DEĞİŞMEZ"
  → S6'dan sonra **yanlış** (iki tablo atlanıyor).
- `packages/db/src/catalog-lint.ts:751-753` — "Bu alt görevde (①) `expectations`
  BOŞ ... bu fonksiyon HİÇ bulgu ÜRETMEZ" → **yanlış**.
- `packages/db/src/catalog-lint.ts:405-406` — "Bu alt görevde (K-A17 adım ①) her
  çağıran `[]` (BOŞ) geçirir" → **yanlış** (canlı çağıranlar gerçek sabiti geçiriyor).
- `packages/db/src/__tests__/helpers/audit-log.probe.ts:36-39` — "Postgres
  seviyesinde `arkesoft_app` **dört DML yetkisinin dördüne de sahiptir** —
  `catalog-lint.ts`'in `lintAppRoleDmlPrivileges` kuralı bunu **ZORUNLU tutar**"
  → bu sürümün **tam tersini** söylüyor; aynı dosyanın `:149-158`'i doğrusunu
  yazıyor ⇒ dosya kendi içinde çelişiyor.
- `apps/api/src/__tests__/production-write-path-grep.qa.test.ts:308-310` — "Bu kapı
  veritabanı seviyesinde bir garanti DEĞİL (uygulama rolü dört DML yetkisinin
  dördüne de sahiptir ve bunu `catalog-lint` ZORUNLU tutuyor)" → S4 bu bloğu
  düzenledi ama cümleyi bıraktı; artık **yanlış**.
- `packages/db/src/__tests__/catalog-lint.test.ts:1319` ("`tenancy.ts`'te HÂLÂ
  BOŞ"), `:1534-1538` ("beyan BOŞ olduğu için döngü SIFIR kez çalışır" **ve** "tip
  pini ... **kendi aynasını** pinler") → ikisi de S6'dan sonra **yanlış**; ayna S6'da
  kaldırıldı (pin dosyası `:14-31` bunu doğru anlatıyor).

**Önerilen düzeltme:** altı noktayı güncelle; `audit-log.probe.ts:36-39` ile
`production-write-path-grep.qa.test.ts:308-310` öncelikli (güvenlik özelliği
hakkında ters iddia). Borç satırı olarak ROADMAP'e yazılabilir.

**Sorumlu ajan:** `db` (dört nokta) · `backend` (KAPI 4 yorumu) · `docs`

---

### [SEV: low] `packages/db/src/__tests__/append-only-tables-sql-consistency.test.ts:148-154` — üçüncü `it` hiçbir yeni sinyal üretmiyor (totolojik)

`it('her iki SQL dosyasında da ... TAM 1 kez geçer')` yalnızca
`expect(() => extract...).not.toThrow()` yapıyor. Ama `:134` ve `:141`'deki iki test
**zaten** aynı fonksiyonu çağırıyor; fırlatma durumunda ikisi de kırmızı olurdu.
Test, "TAM 1" iddiasını bağımsız olarak **ölçmüyor** (örn. eşleşme sayısını
döndüren bir yüzey yok), yalnızca önceki iki testin yan etkisini tekrarlıyor —
yorumundaki "anti-vacuity (DoD madde 3)" gerekçesi bu hâliyle karşılanmıyor.

**Önerilen düzeltme:** ya ayrıştırıcıyı eşleşme sayısını da döndürecek şekilde
ayır ve sayıyı assert et, ya da bu `it`'i sil (iki test zaten kapsıyor).

**Sorumlu ajan:** `db` (S6)

---

### [SEV: low] `packages/db/src/__tests__/audit-append-only.isolation.test.ts:32-40, 52` — `t` kolon/alan adı belirsiz kısaltma (CLAUDE.md §4)

Zod şeması ve `PrivilegeProbeRow` tipi `t: z.string()` taşıyor; `VALUES (...) v(t)`
takma adından geliyor. CLAUDE.md §4 isimlendirme tablosu anlamlı camelCase ister;
`tableName` hem SQL tarafında hem tipte doğrudan kullanılabilirdi
(`catalog-snapshot.ts:517`'nin deseni).

**Sorumlu ajan:** `db` (S6)

---

### [SEV: low] `packages/db/src/catalog-lint.ts:1193-1199` — yeni `|| privilege.canTruncate` dalının `AUTH_ROLE_EXCESS_TABLE_PRIVILEGE` ayağı fixture ile kanıtlanmıyor

`:988-998`'deki ikizinin TRUNCATE ayağı `catalog-lint.test.ts:1506-1523` (AC-17)
ile kapatılmış; `:1198`'in TRUNCATE ayağının **yalnız** tetiklendiği bir fixture
yok. Bu terimi silen bir mutasyon bugün **yeşil kalır** (kural kodu başka
fixture'lardan üretildiği için `TENANT_ISOLATION_RULES` kapsam kapısı da yakalamaz).

**Önerilen düzeltme:** AC-17 fixture'ının ikizi — beklenti tablosunda **olmayan**
bir tabloda `arkesoft_auth` için yalnızca `canTruncate=true`.

**Sorumlu ajan:** `db` (S3)

---

### [SEV: low] `packages/db/src/__tests__/catalog-lint-live.isolation.test.ts:148,183,210,260` — canlı lint'e bilerek YANLIŞ girdi (`[]`) geçiliyor

`:112-119` bunu açıkça gerekçelendiriyor (`.some()` assert'leri etkilenmez,
kapsam büyümesin). Doğru ama bedeli var: dört prob her koşuda `audit_log` ve
`platform_audit_log` için **sahte** `APP_ROLE_MISSING_DML_PRIVILEGE` bulgusu
üretiyor ve dosya, gerçeğiyle çelişen bir girdiyi dört yerde kalıcılaştırıyor.
İleride bu `it`'lerden birine bir `toEqual([])`/sayım assert'i eklenirse hata
kafa karıştırıcı olur. Düzeltme maliyeti: dört jeton
(`APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`, zaten `:120`'de import edilmiş).

**Sorumlu ajan:** `db` (S6)

---

### [SEV: low] `packages/db/src/rollback-roles.ts:81,106,87-91` — yeni hedef **üç** yerde listelenmek zorunda

`RollbackTarget` birleşimi, `resolveTarget`'ın üçlü `||` zinciri ve `SQL_PATHS`
kaydı. `SQL_PATHS` zaten `Record<RollbackTarget, string>` olduğu için
`resolveTarget` `target in SQL_PATHS` ile iki yere indirilebilirdi. Bugün hata
yok; dördüncü hedefte sessiz atlama riski var (tip birleşimine eklenip koşula
eklenmezse CLI "geçersiz argüman" der — gürültülü, ama gereksiz).

**Sorumlu ajan:** `db`

---

## Doğrulanan iddialar (bağımsız, statik)

1. **AC-12(c) tamamlayıcılık — ÇALIŞIYOR** (bugünkü iki satır için). Zincir elle
   izlendi: `catalog-lint.ts:691-693` (beyan → Set) → `:703` (`continue`) →
   `:718-723` (dört-DML yüklemi). `audit_log` `TENANT_SCOPED_TABLES`'ta,
   `platform_audit_log` `PLATFORM_LEVEL_TABLES`'ta ⇒ **ikisi de**
   `classifiedTables`'ta (`:1458-1461`) ⇒ beyan satırı silinince eski kural
   gerçekten yeniden silahlanıyor. Sınırı yukarıdaki `medium`'da.
2. **`as const satisfies` — AYNA KALKMIŞ.** `tenancy.ts:333-350` literal tipleri
   koruyor; `type-pins/app-role-privilege-expectations.pin.ts:50`
   `(typeof APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS)[number]['tableName']` ile
   **gerçek sabiti** tüketiyor, ikinci bir liste yok. (Yalnızca
   `catalog-lint.test.ts:1536-1538`'deki yorum bayat — `low` kümesinde.)
3. **`mutationRejection` — erken soyutlama DEĞİL.** İki üyeli union, bugün
   **gerçekten** iki değer kullanılıyor (`audit-log.probe.ts:158` `privilege-denied`,
   diğer altı prob `record-not-found`), `assertNever` ile exhaustive
   (`tenant-isolation-suite.ts:201-220`), alan **zorunlu** ⇒ sessiz drift derleme
   zamanında kapalı. `isPrivilegeDeniedError`'da **`any` yok, gerekçesiz `as` yok**:
   `in` daraltması + Zod `safeParse` + fail-closed `false`, iki koşul
   (`P2039` **ve** `originalCode === '42501'`) ve gerekçesi `:155-172`'de ölçümle
   yazılı. CLAUDE.md §4'e uygun.
4. **Kural kodu tekrarı (soru 4) — YOK.** `lintAppRoleTablePrivilegeExpectations`
   (`:755-793`) ile `lintAppRoleDmlPrivileges` (`:677-733`) **ayrışık**: biri kapalı
   küme fiil-fiil karşılaştırması, diğeri "dört DML tam mı"; ortak hat yalnızca
   `privileges.find(...)` (3 satır) ve iki kural birbirini `continue` ile
   **dışlıyor**. Tek tipe sıkıştırmamak (ayrı `AppRole...Like` /
   `AuthRole...Like`) doğru karar — farklı sebeplerle değişirler.
5. **`canTruncate` ölü veri DEĞİL (D8 kapandı).** Üç tüketim noktası:
   `catalog-lint.ts:363` (`PRIVILEGE_VERB_LABELS` → `PRIVILEGE_VERB_KEYS` döngüsü),
   `:998`, `:1198`. Snapshot'ta **zorunlu** alan (`catalog-snapshot.ts:209`) ⇒
   fixture'lar derleme zamanında güncellenmek zorunda.
6. **Üç yeni test dosyası — kopya-yapıştır DEĞİL** (farkları gerçek):
   `audit-append-only.isolation.test.ts` canlı `has_table_privilege` + kontrol
   tablosu; `rollback-audit-append-only.isolation.test.ts` sentinel+ROLLBACK ile
   bulgu kümesi; `append-only-tables-sql-consistency.test.ts` DB'siz metin
   ayrıştırması. **Ancak** sonuncusunun iki yardımcı fonksiyonu kardeş dosyadan
   kopya (yukarıdaki `medium`).
7. **Katman/bağımlılık yönü** — ihlal yok. `catalog-lint.ts` iç paket importu
   **sıfır** (beyan `LintCatalogOptions` üzerinden parametre, K-E5 korunmuş);
   `packages/db`'ye iş mantığı sızmamış; `apps/api` değişikliği yalnızca test
   dosyası; döngüsel bağımlılık yok; `index.ts` yüzeyi genişlemedi.
8. **Yasak jeton taraması** — değişen dosyalarda `any` **0**, `@ts-ignore` **0**,
   boş `catch {}` **0**, `console.*` **0**. Tek `as` zorlaması
   (`rollback-audit-append-only.isolation.test.ts:207-209`,
   `expect.objectContaining` → `Record<string, unknown>`) dış veri üzerinde değil,
   vitest matcher API'si üzerinde ve emsali gerekçesiyle yazılı — bulgu değil.

## Kapsam dışı bırakılanlar (handoff talimatı)

`D2` FK cascade · `D3` bütünlük kanıtı · `D11` CLAUDE.md §7 boşluğu · `D12` ·
sekiz ölçüm hatası zinciri — **rapor edilmedi**.

## ÖLÇÜMLER

- İncelenen dosya: **19** (`packages/db/src` 13, `packages/db/sql` 2,
  `packages/db/src/__tests__/helpers` 2, `apps/api` 1, `package.json` ×2 tarandı)
- `any` kullanımı (değişen dosyalarda): **0** · `@ts-ignore`: **0** · boş `catch`: **0**
- En büyük yeni/değişen fonksiyon: `lintCatalog`
  (`catalog-lint.ts:1434-1537`, **104 satır** — bu sürümde +10 satır) ·
  yeni yazılanların en büyüğü: `lintAppRoleTablePrivilegeExpectations`
  (`catalog-lint.ts:755-793`, **39 satır**)
- Bulgu: critical **0** · high **1** · medium **3** · low **6**
- Komut çalıştırılmadı (`Bash` aracı yok) — hiçbir test koşumu/ölçümü bu rapora
  ait değildir. ⚠ `prettier --write` **koşturulamadı**; biçimlendirmeyi Orkestratör
  kapatmalı (AGENT_BASELINE §5).

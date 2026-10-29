# ADR-0007 — Tek Veritabanı, RLS ve Rol Ayrımı

**Tarih:** 2026-10-28  
**Durum:** KABUL EDILDI  
**Etkilenen sürümler:** v0.0.13 (uygulanır), v0.0.14+ (RBAC ve linter borçları)

---

## Bağlam

Arkesoft tek bir Postgres veritabanında binlerce tenant'ı barındırıyor. ADR-0003, bu
mimarinin temelini (`tenant_id NOT NULL`, indeksler, soft delete) tanımladı — ancak
v0.0.3'te **uygulama katmanı izolasyonu tek savunma hattıydı.** Veritabanı seviyesinde
izolasyonun garantisi yoktu.

v0.0.13'le bu değişiyor: **Postgres Row Level Security (RLS) politikaları + rol
ayrımı** ile veritabanı seviyesinde çapraz tenant erişimi imkânsız hale geliyor. Ama iki
sorun var:

1. **Tablo sahibi RLS'i atlar:** Postgres'in varsayılan davranışına göre tablo sahibi
   `ENABLE ROW LEVEL SECURITY`'i görmezden gelir. Uygulama rolü (`arkesoft_app`)
   tablonun sahibi olamaz — aksi takdirde kendini izolasyon dışına çıkarır.

2. **Postgres GUC'u çalışma zamanında ayarlanmalı:** RLS politikaları
   `current_setting('app.tenant_id')` okur. Bu ayarı transaction başında **bağlı
   parametre** ile (dize birleştirme olmadan) set etmek, enjeksiyon sıfıra indiriyor.

Bu karar, tek DB mimarisinde **veritabanı seviyesi izolasyonu** nasıl güvenli ve
ölçeklenebilir hale getireceğini tanımlıyor.

---

## Karar

Çok kiracılı veritabanı izolasyonu aşağıdaki dokuz mekanizmayla sağlanır:

### 1. **Rol Ayrımı: Migrator ve Uygulama**

İki ayrı Postgres rolü:

- **`arkesoft_migrator`** (`CREATEDB`, tabloların sahibi, migration koşturur):
  - `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEROLE` — kısıtlı nitelikler
  - `FORCE ROW LEVEL SECURITY` tablo sahibini de RLS'e tabi kılar → seed ve
    migration'lar politikaya uyar
  - Shadow DB (Prisma `migrate dev`) oluşturabilir

- **`arkesoft_app`** (çalışma zamanı, uygulama sorguları):
  - `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE` — yalnızca DML
  - Hiçbir tablonun sahibi **değil** — `GRANT` ile `SELECT/INSERT/UPDATE/DELETE` alır
  - RLS politikası `arkesoft_app` sorgularını otomatik tenant'a filtreliyor

**Gerekçe:** Postgres'te tablo sahibi DDL yetkisini korur — `DROP POLICY`, `ALTER
TABLE ... DISABLE ROW LEVEL SECURITY`, `... NO FORCE ROW LEVEL SECURITY` çalıştırabilir.
`FORCE` ile sahip çalışma zamanında politikaya uyar, ama izolasyonu tek komutla
kaldırabilir. Sahipliği migrator'a vermek, çalışma zamanı rolünden DDL yetkisini
**yapısal olarak** almaktır — ele geçirilen bir SQL yürütme yolu politikayı
düşüremez.

**Kanıt:** v0.0.13 seed'i (S3) `tenant_membership` yazma işini `withTenant()` içinde
koşmak **zorunda kaldı** (architect riski 10) — çünkü sahip olan `arkesoft_migrator`
bile `FORCE`'tan sonra izolasyon politikasına tabi olduğundan, context'i olmadan
yazamıyor. Sahip RLS'i atladığı takdirde bu bölünmeye hiç gerek olmazdı. Tasarım,
`FORCE`'un sahibini gerçekten bağladığını kanıtlıyor.

### 2. **RLS Politikası: ENABLE + FORCE**

Tenant'a bağlı her tabloda (`tenant_membership` ve v0.0.4+ tüm iş tabloları):

```sql
ALTER TABLE "tenant_membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_membership" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_membership_tenant_isolation" ON "tenant_membership"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));
```

**İki argümanlı `current_setting`:** Tekil argüman, GUC ayarlanmamışsa **hata**
fırlatır. İkili argüman (`missing_ok = true`) biçim, başarısız sorgu değil boş sonuç
(`NULL`) döndürür. Kabul kriteri v0.0.13'te "0 satır (hata değil)" bekler.

**`WITH CHECK` açık yazılır:** Varsayılan (yalnızca `USING` kopyalanması) yerine hem
okuma hem yazma için politika açıkça tanımlanır. Canlı katalog linter'ı hem `polqual`
hem `polwithcheck` kontrolü yapabilir.

**`TO` yan tümcesi yoktur (= `TO PUBLIC`):** Politika her role uygulanır. `TO
arkesoft_app` yazılsaydı, migrator (sahibi) için uygulanabilir politika kalmazdı → seed
INSERT başarısız. Genel politika, migrator ve uygulama rolünü aynı tenant ihtiyacına
tabi kılar.

### 3. **Context Kancası: `withTenant(client, tenantId, callback)`**

Kütüphanesi (`packages/db/src/tenant-context.ts`):

```typescript
export function withTenant<T>(
  client: PrismaDatabase,
  tenantId: string,
  callback: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config(${'app.tenant_id'}, ${tenantId}, true)`
    return callback(tx)
  })
}
```

**Parametrelendirme:** `set_config()` fonksiyon çağrısı; bağlı parametreler `set_config`
hem ayar adını (`'app.tenant_id'`) hem değeri (`tenantId`) alır — dize birleştirme
**olmaz**.

**Transaction bağlama:** Üçüncü argüman `true` (`SET LOCAL` semantiği) — GUC transaction
sonunda düşer. Bağlantı havuzundaki fiziksel bağlantı sonraki tenant'a bu ayarı
**sızdırmaz**.

**WeakMap kayıt:** İstemci örneği `createPrismaClient({ tenantContextSetting:
'app.tenant_id' })` ile kurulmalı; aksi takdirde `withTenant()` fail-closed `throw`
eder.

**İç içe çağrı yapısal olarak imkânsız:** Callback'e verilen `tx` (`TransactionClient`)
`$transaction` metodu taşımaz — derleme zamanında `withTenant(tx, ...)` yazımı
`ts-check` fail'ını oluşturur.

### 4. **Bağlantı URL Ayrımı: Üç Değişken**

`.env`:

```bash
DATABASE_URL="postgresql://arkesoft_app:...@localhost/arkesoft"
DATABASE_MIGRATION_URL="postgresql://arkesoft_migrator:...@localhost/arkesoft"
DATABASE_BOOTSTRAP_URL="postgresql://postgres:...@localhost/arkesoft"
```

- `DATABASE_URL` = uygulama rolü (fail-safe varsayılan)
- `DATABASE_MIGRATION_URL` = migrator rolü (zorunlu)
- `DATABASE_BOOTSTRAP_URL` = süper kullanıcı (opsiyonel, `db:bootstrap` için)

Ayrım nedeni: ayrıcalık sepetini kod kurarken değiştirmek, sızıntı alanını engeller.
Üretimde `DATABASE_URL`'i okuyup migrator kimlik bilgisi içeren bir komut **çalışamaz**
(ortam değişkeninde yok).

### 5. **Provisioning İki Aşamada**

**A. Bootstrap (bir kez, süper kullanıcı):**

```bash
pnpm db:bootstrap  # → packages/db/sql/bootstrap-roles.sql
```

- Roller oluştur / yakınsat
- Sahipliği devir
- `GRANT` ve `ALTER DEFAULT PRIVILEGES`

**B. Migration (her sürümde):**

```bash
pnpm db:migrate    # → migration'lar RLS ENABLE/FORCE + CREATE POLICY
```

- Şema değişiklikleri
- RLS politikaları

**Neden ayrı?** Bootstrap IDEMPOTENTtir: mevcut volume üzerinde koşunca rolleri
oluşturmaz, var olanları yakınsar (parola/nitelik). Diğer taraf, migrator shadow DB'de
çalışırsa `CREATE ROLE` "already exists" ile **başarısız** olur.

### 6. **Seed Uygulama Rolüyle**

`packages/db/src/seed.ts`:

```typescript
// 1. Platform tabloları oluştur (tenant, app_user) — RLS yok, context gereksiz
const tenantRecord = await prisma.tenant.create({ ... })

// 2. Tenant verisi — withTenant() içinde
await withTenant(prisma, tenantRecord.id, async (tx) => {
  await tx.tenantMembership.create({ ... })
})
```

**Gerekçe:** Seed, çalışma zamanı yolunu egzersiz eder (context'siz sorgu, context'li
sorgu). `arkesoft_app` rolüyle koşar; RLS politikasının gerçek davranışını test eder.

### 7. **Canlı Katalog Linter'ı**

Metin tarayıcısı (`migration-set.ts`, T-004'ten) yaşadığı üç sorun:

- `ALTER TABLE … ADD COLUMN "tenant_id"` tespiti ❌ (kolon nerede geldiğini bilmez)
- Politikanın uygulanabilirliği (`TO` yan tümcesi, `USING` etkisi) ❌
- `FORCE RLS`'in canlı durumu ❌

**Çözüm:** Canlı katalog linter'ı (`packages/db/src/catalog-lint.ts`) PostgreSQL
sistem kataloğunu (`pg_class.relrowsecurity`, `pg_policies`, `information_schema`)
doğrudan okur.

**20 kural** (FIX tur 1'de iki kurala bölündü, FIX tur 2'de bir kural eklendi):

- Taksonomi→katalog (13): `MISSING_TABLE`, `MISSING_TENANT_ID_COLUMN`,
  `NULLABLE_TENANT_ID_COLUMN`, `WRONG_TENANT_ID_TYPE`,
  `MISSING_TENANT_ID_LEADING_INDEX`, `RLS_NOT_ENABLED`, `RLS_NOT_FORCED`,
  `MISSING_TENANT_POLICY`, `POLICY_MISSING_WITH_CHECK`,
  `POLICY_USING_NOT_CANONICAL`, `POLICY_WITH_CHECK_NOT_CANONICAL`,
  `POLICY_RESTRICTED_TO_ROLE`, `APP_ROLE_MISSING_DML_PRIVILEGE`
- Katalog→taksonomi (3): `UNCLASSIFIED_TABLE`, `TENANT_ID_ON_PLATFORM_TABLE`,
  `TENANT_ID_WITHOUT_TAXONOMY_ENTRY`
- Rol (2): `APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS`, `APP_ROLE_OWNS_TABLE`
- Platform/defter (1, FIX tur 2 B3): `APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE`
- Fail-closed (1): `EMPTY_CATALOG_SNAPSHOT`

**Kural ayrımı ve kanonik eşitlik (FIX tur 1 + tur 2, T-005).** Eski tek
`POLICY_WRONG_SETTING` kuralı `USING` ve `WITH CHECK`'i **birlikte**
değerlendiriyordu: `USING (doğru GUC) WITH CHECK (true)` yazan bir politika
okumayı kapatıp **yazmayı** açık bırakıyor ve linter'ı geçiyordu (FIX tur 1'de
iki ayrı kurala bölündü). Tur 2'de `solid` ve `security` **bağımsız olarak**
bölünmenin kusurun **semptomunu** kapattığını, **sınıfını** kapatmadığını ölçtü:
alt dize araması "ifade GUC'u **anıyor mu**" sorusunu yanıtlıyor, "ifade
`tenant_id`'yi GUC'a **eşitliyor mu**" sorusunu yanıtlamıyordu.
`USING (current_setting(<guc>, true) IS NOT NULL)` gibi altı varyant 20 kuralın
tamamından temiz geçiyordu.

**Karar (architect K-E5 revizyonu):** linter politika ifadesini **kanonik tam
eşitlikle** denetler. Beklenen dize, tenant kolonu sabiti ve ayar adından
**üretilir** ve `pg_policies.qual`/`with_check` ile byte-birebir karşılaştırılır:

```
(tenant_id = current_setting('<ayar adı>'::text, true))
```

Kural adları `POLICY_USING_NOT_CANONICAL` / `POLICY_WITH_CHECK_NOT_CANONICAL`.
Kalıp/alt dize tabanlı bir ara çözüm **reddedildi**: `NOT (…)` ve `(…) IS NOT TRUE`
ile atlatılabilir olduğu gösterildi ve T-004'ün üç sezgisel eşiğin üst üste
atlatılmış olması bu sınıfı kapalı kılıyor.

**Takas — PostgreSQL sürüm bağımlılığı:** beklenen biçim `pg_get_expr`'in deparse
çıktısıdır; bir major yükseltme biçimi değiştirirse kural kırılır. Bu **bilinçli**
olarak kabul edildi, çünkü kırılma **fail-closed**'dur (CI kırmızı, sessiz yeşil
değil) ve bulgu mesajı beklenen/gerçek ifadeyi birebir göstererek sapmayı kendisi
açıklar. Ayrıca sapma varsayım olarak bırakılmaz: izolasyon hattındaki bir canlı
prob vakası, koşan Postgres'in ürettiği biçimin şablonla eşleştiğini **her koşumda**
doğrular.

**Sonuç — bir tablo, bir politika:** tam eşitlik kural olarak uygulanır. Linter, herhangi bir
tabloda `policies.length > 1` olduğunda (yani birden fazla politika varsa) bulgu üretir.
**Not (v0.0.14 borcu):** komut bazlı bölünmüş politikalar (`FOR SELECT`/`FOR INSERT`) ve
`AS RESTRICTIVE` ekinin spesifik tespiti bu sürümde uygulanmıyor — yalnızca sayı kontrolü yapılıyor.
K-E2'nin "migrator için ikinci permissive politika reddedildi" kararı böylece **tasarım ilkesi**
kalır, mekanizması v0.0.14'te genişletilecektir.

Ayrıca `POLICY_RESTRICTED_TO_ROLE`, K-E2.1 kararını (politikada açık `TO <rol>`
yan tümcesi **olmamalı**; olursa migrator için uygulanabilir politika kalmaz →
seed INSERT başarısız) canlı katalogdan zorlayarak eklendi.

**İki katmanın (yapısal + davranışsal) neden her ikisinin de gerekli olduğu:** Davranışsal
test süiti (`createTenantIsolationSuite()`) uydurduğu veriyle test ediyor, tenant id'leri
rastgele.
Bu yüzden `USING (tenant_id = current_setting(<guc>, true) OR tenant_id = '<sabit kiracı id>')`
gibi bir **arka kapı** yedi davranışsal senaryonun **tamamından** temiz geçer. **Yapısal
denetim (linter) bunu yakalar, davranışsal denetim yakalayamaz.** İki katman, iki ayrı soru:
linter "SQL metni kanonik mu?" denetler, test suite "çalışma zamanında gerçek izolasyon
garantilendi mi?" denetler (K-E1 deseninin aynısı). Kataloğa dayalı yapısal denetim olmadan
arka kapı sızıntıları sessiz kalır.

**Taksonomi parametrik:** `src/tenancy.ts`'teki `TENANT_SCOPED_TABLES` /
`PLATFORM_LEVEL_TABLES` dizileri linter'a geçilir. Yeni tablo ekleme = liste güncelleme
= linter otomatik kontrol eder.

### 8. **Lint Kuralı: Enjeksiyon Yüzeyi**

ESLint kural (`packages/config/eslint/base.js`):

- `no-restricted-imports`: `pg`, `pg-pool`, `@prisma/adapter-pg`, `$executeRawUnsafe`
  / `$queryRawUnsafe` — istisna: `packages/db/src/client.ts` dosya kapsamlı (paket
  geneli kapatma yasak)
- `no-restricted-syntax`: `app.tenant_id` ve `set_config` literal'leri yalnızca
  `tenant-context.ts`'te

**Gerekçe:** GUC adını ve `set_config` çağrısını kod denetiminden geçirip, literal
jetonları bir dosyaya (kayıt kaynağı) kısıtlamak. AC4'ün enjeksiyon testi (`x'; DROP
TABLE ...` payload) otomatik kontrol ile desteklenir — metni okuyan grep'ler kendi
içinde literali barındırmaz.

### 9. **Test: Tenant Isolation Suite**

`createTenantIsolationSuite()` yardımcısı:

```typescript
const suite = createTenantIsolationSuite({
  taxonomy: { tenantScopedTables: ['tenant_membership'], ... },
  tenantContextSetting: TENANT_CONTEXT_SETTING,
  appRoleName: 'arkesoft_app',
})

// İçinde 7 zorunlu senaryo:
// (1) B satırı A context'inde okunamıyor
// (2) B satırı A context'inde yazılamıyor
// (3) Varlık oracle'ı kapalı (var/yok hatası birbirinden ayrılmıyor)
// ... vs.
```

Ayrı Vitest projesi (`vitest.isolation.config.ts`) — `pnpm test:isolation` canlı
Postgres gerektirir.

---

## Alternatifler Değerlendirmesi

| Seçenek                   | Avantaj                              | Dezavantaj                                                         |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| **Seçildi: Tek DB + RLS** | Tek bağlantı havuzu, migration basit | İki rol, GUC yönetim karmaşıklığı                                  |
| Tenant başına schema      | RLS gereksiz                         | N schema = N role = N bağlantı havuzu                              |
| Tenant başına DB          | Tamamen izole                        | Binlerce DB, operasyon kabus                                       |
| Sadece uygulama katmanı   | Kod basit                            | Veritabanı hatası sızıntı → tamamen başarısız                      |
| RLS ama rol ayrımı yok    | Minimal kod                          | Sahip DDL yetkisini korur, politikayı kaldırabilir → garanti boşta |

---

## Olumlu Sonuçlar

1. **Veritabanı seviyesi garanti:** Uygulama hatasında çapraz tenant erişim imkânsız.
   RLS politikası işletim sistemi seviyesinde zorlanıyor.

2. **Operasyon esnekliği:** Binlerce tenant, tek DB, tek migration kümesi, tek
   bağlantı havuzu. Ölçek sorunları kod değil altyapıyla çözülüyor.

3. **Linter otomasyonu:** `TENANT_SCOPED_TABLES`'a tablo eklemek = otomatik RLS
   doğrulama. İnsan hatası, CI'da yakalanıyor.

4. **Güvenli GUC yönetimi:** Transaction-local `set_config`, bağlı parametreler,
   enjeksiyon yüzeyi kapalı.

5. **Seed egzersizi:** `withTenant()` uygulamada var olan yol aynı şekilde seed'e
   giriyor. Test-production gap kapatılıyor.

---

## Olumsuz Sonuçlar

1. **Operatör kırılması:** v0.0.13'e geçen yerel geliştirici:
   - `.env` dosyasına `DATABASE_MIGRATION_URL` eklemeli
   - `pnpm db:bootstrap` çalıştırmalı
   - Bu "minor" versiyon olsa da, operatör adımı zorunlu.

2. **Platform tabloları izolasyonsuz — iki boyut:**
   - **Okuma:** `tenant` ve `app_user` RLS'siz. `tenant.findMany()` tüm kiracıları
     görür. RBAC v0.0.14'te kapatacak (her okumaya yetkilendirme filtresi).
   - **Cascade yazma:** Postgres referans bütünlüğü kontrolleri RLS'i atlar. Örneğin,
     `tenant.delete({ where: { id } })` `ON DELETE CASCADE` ile `tenant_membership`
     satırlarını RLS'e takılmadan siler — bu bugün ulaşılabilir değil (v0.0.13'te
     `apps/api`'de `tenant.delete` çağrısı sıfır) ama gelecek RBAC'ta risk yaratır.
     v0.0.14+ borcudur.

3. **Admin impersonation**: Süper admin bir tenant'ı impersonate etmek isterse,
   `withTenant()` kullanmalı. Bugün yolu açık (AC5 olmadan impersonation güvenilir
   değil).

4. **`createTenantIsolationSuite()` DB bağlaması:** Ayrı test koşturması dakika
   ekliyor. Turbo parallelliği buna göre şekillenmelidir.

---

## Kanonik Tam Eşitlik Yöntemi (K-E5) — Reddedilenler

### Kalıp Zorlaması (Pattern Enforcement)

**Önerilen:** Linter, politika ifadesinde `<kolon> = current_setting('<guc>'` kalıbını
ve üst seviye `or`/çıplak `true`'yu yasaklar — sezgisel bir tuzak listesi. Kural adı,
kalıp tespiti başarılı oldu mu onu söyler.

**Reddedildi:** `solid` (tur 2) bu kalıp yöntemiyle atlatılabilen iki varyantı gösterdi:
`NOT (tenant_id = current_setting(…))` ve `(tenant_id = current_setting(…)) IS NOT TRUE`.
Her ikisinde de kalıp mevcut, üst seviye `or` veya çıplak `true` yok, ama anlam tersine
çevrilmiş. Sezgisel eşiklerin kümülatif daraltması yanılabilir, ve bu iki davada nispeten
yaygın bir SQL şekli (`NOT (…)`, `IS NOT TRUE` yüklem olumsuzlaması). **K-E5 kararı
(tam eşitlik) mekanizmayı sezgiden değiştirir** — alternatifler yazılı kayda girmezse
v0.0.14'te "daha esnek bir kural" olarak yeniden önerilir.

### Otomatik Davranışsal Prob Üretimi (Auto-Generated Test Data)

**Önerilen:** Linter statik, test suite dinamik. `createTenantIsolationSuite()`
katalog ve takonomiyi okuyup **geçerli satırlar üreten** jenerik bir mini veri
üreteci ile probları otomatik oluştur — `tenant_membership` satırı bir `User`
satırı gerektiriyor, FK grafiğini çöz ve önerili testler üret.

**Reddedildi:** Bu, davranışsal test suite'in **en kırılgan yüzeyini** (`seed` ve
veri üretme mantığını) yeniden üretmekten farksız olur. Ayrıca T-004'te
`createTenantIsolationSuite()`'in **uydurduğu veriyle** test etmesi (tenant
id'leri rastgele, çeşitli ortamlar) zaten T-005'in yapısal ve davranışsal
katmanlara ihtiyaç duymasının nedeniydi — katalog linter yoksa, arka kapı
sızıntısı (**bir sabit tenant id'sini OR'lemek**) davranışsal testin
**tamamından** temiz geçer. Jenerik prob üretimi bunu değiştiremez.

---

## Geri Alma (Üç Kademe)

Bir sebepten RLS'i devre dışı bırakmak gerekirse:

### Kademe 1: `FORCE` kaldır

```bash
psql "$DATABASE_MIGRATION_URL" \
  -c 'ALTER TABLE "tenant_membership" NO FORCE ROW LEVEL SECURITY;'
```

Politika `ENABLE` kalır; context'siz sorgu **0 satır** döner.

### Kademe 2: RLS devre dışı

```bash
psql "$DATABASE_MIGRATION_URL" \
  -c 'ALTER TABLE "tenant_membership" DISABLE ROW LEVEL SECURITY;'
```

İzolasyon kapanır; sorgu **tüm satırlar** döner.

### Kademe 3: Provisioning geri al (üretimde Pulumi)

Yerel geliştirmede, `packages/db` dizininden:

```bash
cd packages/db
DATABASE_URL="$DATABASE_BOOTSTRAP_URL" pnpm exec prisma db execute \
  --file sql/rollback-roles.sql
```

**Neden `DATABASE_URL` öneği:** `prisma db execute` bağlantı URL'sini `prisma.config.ts`'den
(`env('DATABASE_URL')`) okur (`--url` bayrağı **yoktur**). SQL sahiplik devri (`ALTER
TABLE … OWNER TO`) ve `REVOKE` yapıyor — bootstrap süper kullanıcısı gerekir. Çevresel
önek, `arkesoft_app` rolü yerine bootstrap URL'sini işleme geçirir.

**`db:rollback-roles` npm script'i yoktur.** Doğrudan `pnpm exec` ile çağırılmalı.

Bu komut bootstrap adımının etkisini tersler: sahipliği `arkesoft` rolüne geri devirir,
`GRANT` ve `ALTER DEFAULT PRIVILEGES`'i geri alır. **`DROP ROLE` YOK** — roller küme
seviyesinde yaşar, silmek bu script'in kapsamının dışındadır. Geri almadan sonra
`arkesoft_migrator` ve `arkesoft_app` nesnelere bağımlı olabilir; bu durumda elle
müdahale gerekir (üretim runbook'u Pulumi/Helm'de tanımlanır).

Her kademe `pnpm test:isolation`'ı **kırmızıya düşürür** — bu bilinçli; kapatma bir
hata değil, izolasyonun indirilmesidir.

---

## Varsayımlar

- **A-E1** `prisma migrate dev --create-only` boş bir dizin üretir (üretmezse elle
  oluştur)
- **A-E2** `arkesoft_migrator` shadow DB oluşturabilir (`CREATEDB` izin)
- **A-E3** `prisma migrate diff` RLS drift **bildirmez** (Prisma bunları introspect
  etmez)
- **A-E4** Prisma `tx.$queryRaw` etiketli şablonu `set_config()` için kabul eder
- **A-E5** RLS politikası FK tetiklemesinden **önce** değerlendirilir (varlık oracle'ı
  kapalı ✓)
- **A-E6** Rol parolaları URL-güvenli (dev: literal, üretim: secret manager)
- **A-E7** Runner'da Node.js var (ileride `psql` gerekmez)

---

## Riskler

1. **[yüksek] OPERATÖR KIRILMASı:** `.env` zorunlu ek + `db:bootstrap` adımı. Düzeltme:
   changeset "Operatör adımları eklendi" açıklamasıyla işaretli.

2. **[orta] Platform tabloları filtresiz:** v0.0.13 `tenant.findMany()` tüm kiracıları
   döner. v0.0.14 RBAC'ı bu kapatır.

3. **[orta] Taksonomi ve linter süresi:** Yeni tabloda elle `TENANT_SCOPED_TABLES`
   ekleme gerekli. Otomatik introspection v0.0.14 borcudur.

4. **[orta] `set_config` transaction timeout:** Prisma 5 sn timeout'u (ifşa
   edilmemiş) — uzun bir `withTenant()` blok bu sınırı aşabilir. v0.0.14 borcu.

5. **[düşük] Seed iki transaction'a bölünme:** Platform verisi (context'siz) + tenant
   verisi (context'li). ADR-0003'ten bilinçli sapma, yorumlandırıldı.

---

## İlişkili Kararlar

- **ADR-0003** madde 7: Prisma migration üretimi + elle RLS DDL'i (dar istisna)
- **T-004 security**: Metin bekçi (`migration-set.ts`) + canlı linter
  (`catalog-lint.ts`) ayrımı
- **CLAUDE.md §7**: Tenant izolasyon kontrol listesi (v0.0.13 ile `withTenant()` ve
  katalog linter'ı eklenmiştir)
- **ROADMAP v0.0.14**: RBAC, `$queryRaw` daraltması, Seed timeout

---

## Notlar

- **Neden `current_setting(..., true)` iki argümanlı?** Tek argüman, GUC
  ayarlanmamışken hata fırlatır. Kabul kriteri "boş sonuç, hata değil" bekler. Yüklem
  ifadesi `NULL` döndürür → satır filtrelenir.
- **Neden `TO PUBLIC` ve `TO arkesoft_app` değil?** Genel politika, migrator ve
  uygulama rolünü aynı tenant kuralına tabi kılar. Dar politika, migrator için
  uygulanabilir kural bırakmaz.
- **Neden "GUC"?** PostgreSQL GUC = Grand Unified Configuration; `current_setting()`
  GUC değerini okur.
- **Neden el yazısı SQL?** RLS politikaları Prisma şemasında temsil edilemiyor — RLS
  PostgreSQL'e özel bir özelliktir ve schema.prisma dosyasında bildirim yok. Politikalar
  elle SQL olarak `prisma/migrations/` içinde yazılmak zorunda.

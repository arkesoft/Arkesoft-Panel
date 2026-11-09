# ADR-0017 — Veritabanı Seviyesi Rol Ayrımı ve Kolon Yetkisi

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-05
- **Karar verenler:** Architect (T-015, gate: qa, security, solid)
- **İlgili versiyon:** `v0.0.14.1` (ROADMAP v0.0.14.1 kapsamında uygulanır)

---

## Bağlam

ADR-0008, parola hash'i / oturum belirteci / doğrulama belirteci taşıyan üç tabloyu
(`account`, `session`, `verification`) **üç katmanlı** bir mekanizmayla (derleme zamanı
`Pick<>` allowlist, lint zamanı `no-restricted-imports`, çalışma zamanı yanıt/log
denetimi) korudu, ama kendi _"Olumsuz Sonuçlar"_ bölümünde bunun **veritabanı seviyesi
bir garanti olmadığını** açıkça yazdı (ADR-0008:117-119): çalışma zamanı uygulama rolü
(`arkesoft_app`) bu üç tabloyu **filtresiz** okuyabiliyordu. Bu açık RLS ile kapatılamaz
— giriş sorgusu bir asıldan (principal) önce hash'i okumak zorundadır, `current_setting('app.tenant_id')`
tabanlı bir `USING` yüklemi tanımlanamaz (ADR-0008 Bağlam, ADR-0008:95 _"Platform
tablolarına RLS"_ reddi).

ADR-0008 bu açığı kapatacak işi `v0.0.14`'e vadeli bıraktı: `arkesoft_auth` rolü + tablo
`REVOKE`/kolon `GRANT` + katalog linter'ına kolon yetkisi kural sınıfı + ikinci Prisma
istemcisi/havuzu (ADR-0008:69-82 tarif). `v0.0.14`'ün kapsamı revize edilirken bu beş
ayaklı teslim **ertelenmedi, sıralandı** ve kullanıcı onayıyla `v0.0.14.1` hotfix
sürümüne taşındı (ROADMAP `v0.0.14` bölümü, _"Üçüncü çıkarma"_). Bu ADR, o teslimin
sonunda alınan mimari kararları kaydeder.

**Tek rolde kolon `REVOKE` zaten ADR-0008:91'de değerlendirilip reddedilmişti** —
reddedilen, giriş sorgusunun belirteç kolonunu kendi `WHERE`'inde taşıdığı için okuma
yetkisinin **aynı rolde** şart olmasıydı. Bu ADR'nin kabul ettiği **rol ayrımıdır**: tablo
`REVOKE` eski rolden (`arkesoft_app`), kolon `GRANT` yeni bir kimlik rolüne
(`arkesoft_auth`). İki karar birbiriyle çelişmez; farklı mekanizmalardır.

---

## Karar

### 1. `arkesoft_auth` rolü ve onaylanan yetki beyanı

Yeni, en az yetkili bir PostgreSQL rolü (`packages/db/sql/bootstrap-roles.sql:61-106`)
oluşturuldu: `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS`. Kapsam
metninin ilk hâli _"yalnızca üç hash/belirteç tablosunu okur, başka hiçbir tabloyu
okumaz"_ diyordu; bu **uygulanamaz** çıktı — Better Auth'un `internal-adapter.mjs:585`'i
`findUserByEmail` için `app_user`'a bakıyor ve Better Auth **tek** Prisma istemcisi
kullandığı için bu erişim başka bir role devredilemez. Kapsam metni kullanıcı onayıyla
düzeltildi (ROADMAP v0.0.14.1, kullanıcı kararı 2026-11-05). Ölçülmüş, gerçekleşen yetki
kümesi (`packages/db/sql/bootstrap-roles.sql` §7, `packages/db/src/tenancy.ts:142,164`
`AUTH_SECRET_BEARING_TABLES`/`AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`):

```
account | session | verification : kolon bazlı SELECT+INSERT+UPDATE (TÜM kolonlar)
                                   + TABLO bazlı DELETE
app_user                         : tablo bazlı SELECT+INSERT+UPDATE, DELETE YOK
diğer tüm tablolar                : hiçbir yetki yok
arkesoft_app, üç sır taşıyan tabloda : HİÇBİR yetki yok (tablo bazlı REVOKE ALL)
nitelikler : LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
şema       : GRANT USAGE ON SCHEMA public (CREATE YOK)
ALTER DEFAULT PRIVILEGES          : arkesoft_auth için AÇILMADI (gelecek tablolar fail-closed)
sekans                            : GRANT YOK (ölçüldü: public şemasında hiç sekans yok — Prisma cuid kullanıyor)
```

`app_user`'a `DELETE` verilmedi: hesap silme ucu (`user.deleteUser`) Better Auth
yapılandırmasında açılmamış (`apps/api/src/auth/auth-instance.ts`, grep → üst seviye
`user:` anahtarı yok) → en az yetki ilkesi; ileride açılırsa beklenti tablosu
güncellenecek ve hata gürültülü (yetki reddi) olacak, sessiz değil.

### 2. Kolon yetkisi kuralı — iki tamamlayıcı katalog kaynağı, `information_schema.column_privileges` KULLANILMADI

`has_column_privilege()` **tablo seviyesi** bir yetki varken de `true` döner (ölçüldü,
`db` ST-A0①: tablo `SELECT` taşıyan bir role karşı her kolon `true`). Bu yüzden kolon
`GRANT`'in alıcısı (`arkesoft_auth`) tabloda **hiçbir** tablo seviyesi yetki
taşımamalıdır — aksi halde kolon kuralı inşa gereği **vacuous** (hiçbir şeyi ölçmeyen)
olurdu. Kural iki bağımsız kaynaktan beslenir:

- **Kaynak A — etkin yetki:** `has_table_privilege` **ve** `has_column_privilege`
  birlikte (`readColumnPrivilegesForRole`, `packages/db/src/catalog-snapshot.ts:523`).
  Türetilen sinyal `columnOnly := hasColumn && !hasTable`.
- **Kaynak B — bildirilmiş hibe:** `pg_attribute.attacl` + `aclexplode`
  (`readColumnGrants`, `catalog-snapshot.ts:570`) — yalnızca **kolon seviyesi**
  hibeleri taşır (tablo seviyesi hibeler `pg_class.relacl`'de yaşar, bu bir ayrı kaynaktır).

`information_schema.column_privileges` **bilinçli olarak kullanılmadı**: bu görünümün
tablo seviyesi `GRANT`'leri kolon başına genişletip göstermesinin semantiği ölçülemedi,
ve belirsiz görünüm semantiği üzerine güvenlik kuralı kurmak bu teslimin tam
kovaladığı kusurdur.

**Ölçülmüş tuzak (kritik, kademe 4'ten önce fark edildi):** PostgreSQL'de kolon
parantezi **yalnızca kendisinden hemen önceki privilege'e** uygulanır.
`GRANT SELECT, INSERT, UPDATE (%I) ON …` yazmak `SELECT` ve `INSERT`'i **tablo
seviyesine sızdırır** ve kolon kuralını vacuous hale getirirdi — bu, bu teslimin
önlemeye çalıştığı başarısızlık modunun ta kendisidir. Doğru biçim
(`packages/db/sql/bootstrap-roles.sql:322`):

```sql
GRANT SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I) ON public.%2$I TO arkesoft_auth
```

`DELETE` kolon bazlı verilemez (PostgreSQL kolon yetkisi yalnızca
SELECT/INSERT/UPDATE/REFERENCES için tanımlı) → tablo bazlı, ayrı kural koduyla
(`AUTH_ROLE_MISSING_TABLE_PRIVILEGE`) iddia edilir.

Gate turlarında bu iki kaynağa üç tane daha eklendi (kapsam genişlemesi değil, aynı
teslimin kör noktalarının kapatılması): **Kaynak C** — `pg_class.relacl` (tablo seviyesi
hibe, `readTableGrants`, `catalog-snapshot.ts:607`, `UNEXPECTED_TABLE_LEVEL_GRANTEE`);
**Kaynak D** — `pg_class`/`pg_namespace` (view/matview/foreign tablo tespiti,
`readUnexpectedRelations`, `:636`, `UNEXPECTED_RELATION_KIND`); **Kaynak E** —
`pg_proc` (fonksiyon EXECUTE + `SECURITY DEFINER`, `readFunctionPrivileges`, `:675`,
`UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE` + `UNEXPECTED_SECURITY_DEFINER_FUNCTION`).
Toplam yeni kural kodu **11** (kanonik sayım `packages/db/src/catalog-lint.ts`'teki
`TENANT_ISOLATION_RULES` dizisinde yaşar, burada tekrar edilmiyor).

### 3. Kademe numarası ≠ kademe sırası — dördüncü kademe sırayla İLK çalışır

Üç kademeli RLS/rol-ayrımı geri alması (ADR-0007, `packages/db/sql/rollback-roles.sql`)
artan yıkıcılıkta bir **kill-switch merdiveni**dir ve kademe 3 `arkesoft_app`'ten **her
şeyi** `REVOKE` eder. Bu teslimin dördüncü kademesi (`packages/db/sql/rollback-auth-role.sql`)
farklı bir şeydir: yalnızca `v0.0.14.1`'in **deltasını** (kolon `GRANT` + tablo `REVOKE`)
tersler ve kataloğu `v0.0.14` durumuna döndürür. Numara eklenme sırasını kaydeder;
**gerçek yürütme sırası `4 → 1 → 2 → 3`'tür.** Kademe 3'ten sonra kademe 4 koşarsa
tutarsız bir ara durum doğar (3'ün aldığı yetkiyi 4 geri verir).

Bu yüzden **ayrı dosya, ayrı script**: `pnpm db:rollback-roles` (kademe 1-3'ün SQL'i,
semantiği değişmedi) ve `pnpm db:rollback-auth-role` (kademe 4, yeni). Tek script
birleştirilseydi, operatör yalnızca bu sürümün deltasını geri almak isterken geliştirme
veritabanını kill-switch'e sokardı.

**"Başlangıç durumuna döndü" ≠ "linter yeşil".** Kademe 4'ten sonra `pnpm test:isolation`
**beklenen biçimde kırmızıdır** (`APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE` +
`AUTH_ROLE_MISSING_COLUMN_PRIVILEGE` + `AUTH_ROLE_MISSING_TABLE_PRIVILEGE`, ölçüldü:
9 başarısız/37 geçti) — kod (kurallar) katalogdan daha yeni olduğu için. Bu bir hata
değil, **kuralların çalıştığının kanıtıdır**. Yeşile dönüşün yolu `pnpm db:bootstrap`'i
yeniden koşturmaktır; gerçek bir platform rollback'i kodu da v0.0.14'e döndüreceği için
kurallar kodla birlikte gider ve linter otomatik yeşile döner — bu,
_"platform rollback'i şema rollback'i gerektirmez"_ vaadiyle tutarlıdır (bu sürümde
Prisma migration'ı yoktur).

### 4. `DATABASE_AUTH_URL` — ayrı şema, koşulsuz fail-fast, anti-fallback

Yeni ortam değişkeni **ayrı** bir şemada tanımlandı (`packages/config/src/env.ts:159`
`databaseAuthEnvSchema`) — ne `infraEnvSchema`'ya (girerse admin/superadmin/storefront
dahil her süreç tüm parola hash'lerine erişen bir kimlik bilgisini zorunlu kılardı, K-E8'in
kapattığı deliğin aynısı) ne `databaseAdminEnvSchema`'ya (o ayrıcalıklı DDL bağlantıları
içindir, bu bir çalışma zamanı kimliğidir). İki tüketici (`apps/api/src/config/api-env.ts`
→ `infraEnvSchema.extend(...)`, `packages/db/src/env.ts` → `readDatabaseAuthEnv()`), tek
tanım.

**Fail-fast koşulsuz-zorunludur** — ROADMAP'in ilk metnindeki _"rol katalogda varsa"_
koşulu **uygulanmadı**: koşullu bir mekanizma "rol yok + env yok" dalında sessizce geçer
(fail-open), ADR-0008:102'nin kendi dersini ("belgelenmiş ama gerçekleşmeyen bir kontrol,
var olmayandan daha tehlikelidir") doğrudan ihlal ederdi.

**Anti-fallback:** `apps/api/src/auth/auth.module.ts:102` tek satır
(`env.DATABASE_URL` → `env.DATABASE_AUTH_URL`); yeni istemci/havuz/yaşam döngüsü
kurulmadı (`AuthPrismaClientResource` zaten ayrıydı). `??`/`||`/`?:` ile
`DATABASE_URL`'e düşmek yasaklandı ve üç katmanla kanıtlandı: **c1** Zod'da koşulsuz
zorunluluk (tek başına boş kanıt — koşulsuz zorunluluk aynı zamanda nullish-fallback'i
dil seviyesinde imkânsız kılar, çünkü değer asla `undefined` olmaz); **c2** tek yük
taşıyan kanıt — yanlış/geniş role işaret eden bir `DATABASE_AUTH_URL` ile açılış, çalışma
zamanı negatif-yetenek probuyla (aşağıda) düşer; **c3** mekanik literal-jeton kapısı.

Açılışta bir kez çalışan negatif-yetenek probu (`assertAuthRoleIsRestricted`,
`packages/db/src/auth-role-guard.ts:88`, `has_table_privilege` ile `current_user`'ın
`tenant` tablosuna erişemediğini doğrular) `apps/api/src/auth/auth.module.ts:116`'da
`OnModuleInit` içinde çağrılır; reddederse (`AuthRoleNotRestrictedError`) hata loglanır
**ve** yeniden fırlatılır — `NestFactory.create()` zinciri düşer (fail-closed).

### 5. AC4 vacuity — sessiz `continue`'un yalanının kaynağı kapatıldı

`catalog-lint.ts`'in platform tablosu `continue`'u, yorumunda _"zaten `MISSING_TABLE`
tarafından yakalanır"_ diyordu ama bu **yanlıştı** — `MISSING_TABLE`'ın öznesi
yalnızca kiracı kapsamlı tabloları kapsıyordu. Sonuç: `PLATFORM_LEVEL_TABLES`'ın bir
üyesi (örn. `session`) katalogdan kaybolsa linter **sessiz** kalırdı — tam AC4'ün
aradığı kısmi sessizlik türü, `EMPTY_CATALOG_SNAPSHOT` yalnızca **tamamen** boşu
yakalar. Düzeltme: `MISSING_TABLE`'ın öznesi `platformLevelTables`'ı da kapsayacak
şekilde genişletildi (yeni kural kodu yok); bir tablo silinmiş fixture ile ampirik
olarak doğrulandı.

### 6. Bootstrap'ın iki geçişli yakınsaması — ayrışma fail-closed testle kapatıldı, üçüncü CI adımı eklenmedi

Yeni DDL (bootstrap-roles.sql §7) `migrate deploy`'dan **önce** ilk bootstrap koştuğunda
hedef tablolar henüz yoktur → `REVOKE`/`GRANT` ilk geçişte no-op'tur (hepsi `IF EXISTS`
korumalı, aksi halde taze bir veritabanında patlardı). CI zaten iki geçişlidir
(`prepare-db/action.yml`: bootstrap → deploy → bootstrap → seed) ve bu yeterlidir — ek
bir CI adımı **eklenmedi**. Tek seferlik yerel `pnpm db:bootstrap` DDL'i uygulamaz ama
bu artık **sessiz değildir**: `test:isolation`'daki canlı prob
(`APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE`) kırmızıya düşer ve bulgu mesajı çözümü
söyler — yazılı prosedüre güvenilmiyor, fail-closed test ayrışmanın zararını sıfırlıyor.

---

### Değerlendirilen Alternatifler

| # | Alternatif | Neden seçilmedi |
| - | ---------- | --------------- |
| 1 | **Aynı rolde kolon `REVOKE`** (ADR-0008:91'in reddettiği, burada teyit edildi) | Giriş sorgusu belirteç kolonunu `WHERE` içinde taşıdığı için aynı role okuma yetkisi şarttır; aynı rolde `REVOKE` giriş akışını kırar |
| 2 | **Tablo bazlı `GRANT`** (kolon bazlı yerine) | `arkesoft_auth` tabloda tablo seviyesi `SELECT` taşırsa `has_column_privilege` **inşa gereği** `true` döner → kolon kuralı vacuous olur; sağlıklı taban hiçbir zaman `columnOnly=true` üretmez |
| 3 | **Üç tabloya RLS** | ADR-0008:95: giriş sorgusu bir asıldan önce hash'i okumak zorundadır; `current_setting('app.tenant_id')` tanımsız → politika `NULL` döner → giriş başarısız. Yapısal olarak imkânsız |
| 4 | **`DATABASE_AUTH_URL`'i `infraEnvSchema`'ya koymak** | Girerse `admin`/`superadmin`/`storefront` dahil onu tüketen her süreç tüm parola hash'lerine erişen bir kimlik bilgisini açılışta zorunlu kılar — K-E8'in kapattığı deliğin birebir aynısı |
| 5 | **Koşullu fail-fast** (ROADMAP'in ilk metnindeki _"rol katalogda varsa"_) | Fail-open: "rol yok + env yok" dalı sessizce geçer; ADR-0008:102'nin kendi dersini ihlal eder; garanti operatörün değiştirebildiği bir katalog durumuna bağlanır |
| 6 | **Ayrı post-deploy adımı** (`sql/post-deploy-grants.sql` + `pnpm db:grant-auth`, koşulsuz yazılan DDL) | Kapsamın duyurduğunun ötesinde üçüncü bir kalıcı operatör adımı doğurur; CI'da zaten kararlaştırılmış iki geçişli emsalden sapar; fail-closed test ayrışmanın zararını zaten sıfırlıyor |
| 7 | **`information_schema.column_privileges`** | Bu görünümün tablo seviyesi `GRANT`'leri kolon başına genişletip gösterip göstermediğinin semantiği ölçülemedi; belirsiz görünüm semantiği üzerine güvenlik kuralı kurmak bu teslimin kovaladığı kusurdur |
| 8 | **`DROP ROLE`** | ADR-0007 K-E2 yasağı: roller küme seviyesinde yaşar, paylaşılan nesnelere (açık bağlantılar, bekleyen `GRANT`'ler) bağımlı olabilir ve bu geri alınamaz |

---

## Sonuçlar

### Olumlu

1. **Veritabanı seviyesi garanti kuruldu.** `arkesoft_app`, üç sır taşıyan tabloda
   **sıfır** yetki taşır (canlı prob: `42501 permission denied`) — ADR-0008'in
   _"veritabanı garantisi değildir"_ olumsuz sonucu bu üç tablo için kapandı.
2. **Kolon yetkisi kuralı vacuous olma riskinden kurtuldu** ve iki bağımsız katalog
   kaynağıyla (Kaynak A + B) doğrulandı; α/β/γ/δ dört yakın-miss senaryosunun hepsi
   canlıda ayırt edilebiliyor.
3. **Koşulsuz fail-fast + anti-fallback üç katmanlı kanıtla (c1/c2/c3) kapandı;**
   `DATABASE_URL`'e sessiz düşüş dil seviyesinde imkânsız (koşulsuz zorunluluk
   nullish-fallback'in sağ tarafını erişilemez kılıyor).
4. **Dördüncü kademe geri alma + runbook netliği**, platformun _"geri alınamaz yetki
   değişikliği yok"_ ilkesini kendi altyapısında tutarlı kılıyor.
5. **Katalog bekçisinin görüş alanı beş yeni kaynakla (A-E) genişledi** ve üç güvenlik
   gate turunda ek kör noktalar (view/matview, tablo seviyesi beklenmeyen alıcı,
   `SECURITY DEFINER` fonksiyon) kapatıldı.

### Olumsuz ve kabul edilen maliyetler

1. **İkinci operatör kırılması kalıcı hale geldi.** `DATABASE_AUTH_URL` zorunlu env +
   mevcut `.env`'lerin elle güncellenmesi + `pnpm db:bootstrap`'in yeniden koşturulması
   gerekiyor. Azaltma: `pnpm env:check`'in dördüncü doğrulama bloğu eksikliği erken
   bildiriyor.
2. **Bakım yükü:** üç tabloya/`app_user`'a yeni kolon eklenirse hibe `DO` döngüsüyle
   otomatik genişler, ama migration sonrası `pnpm db:bootstrap`'in yeniden
   koşturulması gerekir; unutulursa giriş `42501` ile düşer (gürültülü, sessiz değil).
3. **Katalog bekçisinin görüş alanı hâlâ sınırlı.** `pg_default_acl`, `pg_auth_members`,
   `pg_roles.rolconfig`/`pg_db_role_setting` hiçbir okuyucuda yok (borç: S-11, S-12,
   S-16, ROADMAP → Teknik Borç). `SECURITY DEFINER` fonksiyonların PUBLIC-dışı
   `EXECUTE` alıcısı ve `prosecdef` ayrımı ilk turlarda kaçırıldı, sonradan kapatıldı
   (borç: S-15).
4. **Üç ayrı ACL kataloğu üç farklı grantee semantiği taşıyor** (`pg_attribute.attacl`
   tablo sahibini grantee olarak göstermez, `pg_class.relacl`/`pg_proc.proacl`
   gösterir) — gelecekte yeni bir kaynak eklenirken beklenen-grantee kümesinin bir
   kataloktan diğerine kopyalanması kalıcı yanlış pozitif riski taşır
   (`docs/development.md` → Ölçüm disiplini).
5. **Kod tekrarı arttı:** spawn iskeletinin üçüncü kopyası (`rollback-roles.ts` ⇄
   `bootstrap-roles.ts` ⇄ `run-guarded-prisma.ts`, ~110/217 satır birebir) ve dört
   birebir aynı env tipi takma adı — mekanizma doğrulandı ama borç tablosunda kayıtlı
   (SD-1, SD-2).

### Etkilenen sonraki kararlar

- **ADR-0008'in `Durum:` satırı DEĞİŞMEZ.** Bu ADR ADR-0008'in yerini almaz, onun
  v0.0.14'e vadeli borcunu **kapatır** — ADR-0008'in kendisi ADR-0007'ye yaptığının
  aynısı (ADR-0008:157). İkisi beraber okunur.
- v0.0.15'in 2FA/oturum güvenliği kapsamı bu karardaki `AUTH_SECRET_BEARING_TABLES`
  listesine yeni sır taşıyan kolonlar/tablolar eklenmesini gerektirebilir (ör. TOTP
  secret, yedek kod hash'i) — bkz. Gözden geçirme koşulları.

---

## Gözden geçirme koşulları

Bu karar aşağıdaki durumlar gerçekleşirse yeniden değerlendirilir:

1. **Better Auth başka bir sır taşıyan model getirirse** (API anahtarları, OAuth
   token'ları) veya v0.0.15'in 2FA'sı yeni sır taşıyan kolonlar eklerse —
   `AUTH_SECRET_BEARING_TABLES`/`AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`
   (`packages/db/src/tenancy.ts`) genişletilir, kolon `GRANT`'i ve beklenti tablosu
   güncellenir (açık karar + kod incelemesi gerekir).
2. **Meşru bir `SECURITY DEFINER` fonksiyon eklenmesi gerekirse** — bugün koşulsuz
   bulgu üreten `UNEXPECTED_SECURITY_DEFINER_FUNCTION` kuralına bir allowlist
   mekanizması tasarlanmalı; kuralın **gevşetilmesi** değil, **parametreleştirilmesi**
   doğru hamledir (CLAUDE.md §10 madde 6).
3. **`pg_default_acl`, `pg_auth_members` veya `rolconfig`/`pg_db_role_setting`
   eksenlerinden biri somut bir saldırı senaryosuyla sömürülürse** (bugün borç: S-11,
   S-12, S-16) — katalog okuyucularına yeni kaynaklar eklenir.
4. **Üretim rol provisioning'i tasarlandığında** (Pulumi/Helm, ROADMAP v0.18.0) — bu
   karardaki "yalnızca dev-only, `bootstrap-roles.sql` üretimde hiç koşmaz" sınırı
   kalkar ve üretim kimlik bilgisi yönetimi/rotasyonu için ayrı bir karar (bu ADR'nin
   ek maddesi veya yeni bir ADR) gerekir.

---

## İlişkili Kararlar ve Çapraz Referanslar

- **ADR-0008** (v0.0.5): Bu kararın sınırını çizdiği ve borcunu kapattığı karar.
  **Durum satırı değişmedi.**
- **ADR-0007** (v0.0.13): `DROP ROLE` yasağı (K-E2) buradaki kademe 4'e de **birebir**
  uygulanıyor; üç kademeli geri alma runbook'u dördüncü kademeyle genişletildi
  (bkz. `docs/development.md`).
- **CLAUDE.md §7** (Tenant izolasyon kontrol listesi): bu teslimden sonra listeye bir
  madde eklendi — katalog linter'ının görüş alanının sınırını beyan eden madde
  (`SECURITY DEFINER` fonksiyon / bağımlı nesne eklerken ne otomatik yakalanır, ne
  yakalanmaz).
- **ROADMAP v0.0.15** (2FA/oturum güvenliği): bu sürümün sır taşıyan yeni kolonları
  varsa yukarıdaki Gözden geçirme koşulu 1'i tetikler.

---

## Notlar

- **`GRANT`'te kolon parantezi tuzağı.** PostgreSQL'de `GRANT a, b, c (col) ON tbl`
  yazmak kolon kısıtlamasını **yalnızca `c`'ye** uygular; `a` ve `b` tablo seviyesine
  sızar. Doğru biçim her privilege için ayrı parantez: `GRANT a (col), b (col), c (col)`.
  Bu tuzak fark edilmeseydi bu teslimin **asıl ürünü** (kolon yetkisi kuralı) inşa
  gereği hiçbir şey ölçmeyen bir kural olurdu.
- **Üç ACL kataloğu, üç farklı grantee semantiği.** `pg_attribute.attacl`'de tablo
  sahibi grantee olarak **görünmez**; `pg_class.relacl` ve `pg_proc.proacl`'de
  **görünür**. Beklenen-grantee kümesi bir kataloğun semantiğinden diğerine
  kopyalanırsa kalıcı yanlış pozitif doğar — her kaynak için ayrı ölçülmeli.
- **`ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` ÇALIŞMIYOR**
  (ölçüldü, beş bağımsız deneme): PUBLIC'ten önce hiç `GRANT` yazılmamışken bu komut
  `pg_default_acl`'de satır üretmez ve yeni fonksiyonun `proacl`'ı `NULL` kalıp PUBLIC
  EXECUTE'u sürdürür — yaygın anılan deyimin tersi. Mevcut fonksiyonlar için
  `REVOKE EXECUTE ON ALL FUNCTIONS … FROM PUBLIC` çalışıyor; gelecekteki fonksiyonlar
  **tespit** (Kaynak E) ile kapanıyor, **kapatma** mekanizması bu Postgres sürümünde
  yapısal olarak yoktur (`bootstrap-roles.sql` §8'de bağlayıcı not).
- **`ALTER DEFAULT PRIVILEGES … ON TABLES` view ve matview'ı DA kapsar.** Bir tabloya
  yazılan view, hiçbir `GRANT` yazılmadan `arkesoft_app`'e sahibinin yetkisiyle erişim
  verir ve kolon kısıtlamasını baypas eder — bu, Kaynak D (`UNEXPECTED_RELATION_KIND`)
  eklenmesinin gerekçesidir.
- **Prisma'nın SQLSTATE yüzeyi `.code`'da değildir.** `$queryRaw` çağrısında
  `error.code = 'P2010'`, ORM `.create()` gibi çağrılarda `'P2039'` — SQLSTATE (`42501`)
  her ikisinde de `error.meta.driverAdapterError.cause.originalCode`'dadır.
  `.code === '42501'` **asla** doğru olmaz; bu teslimin tüm canlı yetki testleri
  `originalCode` üzerinden assert eder.

---

## Ek (v0.0.15, T-016) — Yeni sır taşıyan tablo eklerken dokunulacak altı nokta

> **Not:** Bu bölüm append-only eklenmiştir. Yukarıdaki madde numaralandırması ve
> metni **değişmemiştir**. Bu ek, ADR-0018'in `two_factor` tablosunu eklerken ölçtüğü
> bir bakım gerçeğini kayda geçirir.

Bu ADR'nin kurduğu mekanizma yeni bir sır taşıyan tablo eklendiğinde **tek bir yerden**
genişlemiyor. Ölçülmüş gerçek: `bootstrap-roles.sql`'in **dış** döngüsü sabit bir
**literal dizi**dir (`:291`) — hangi tabloların kolon bazlı `GRANT` alacağını bu dizi
belirler. **İç** döngü ise `information_schema.columns` üzerinde çalışır — bir tabloya
**yeni kolon** eklendiğinde bu iç döngü sayesinde hibe **otomatik genişler**, ama bir
**yeni tablo** eklendiğinde dış dizi elle güncellenmediği sürece o tablo hiç
görülmez.

**Dokunma noktaları, dört değil altı:**

1. `packages/db/src/tenancy.ts` → `AUTH_SECRET_BEARING_TABLES` dizisi (yeni tablo adı eklenir)
2. `packages/db/src/tenancy.ts` → `PLATFORM_LEVEL_TABLES` dizisi (tablo platform seviyesindeyse)
3. `packages/db/src/tenancy.ts` → `AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS` (yeni tablo için beklenen yetki kümesi)
4. `packages/db/sql/bootstrap-roles.sql:291` → dış döngünün sabit literal dizisi (kolon `GRANT`'i tetikleyen taraf)
5. `packages/db/sql/rollback-auth-role.sql:70` → dördüncü kademe geri almanın aynı tabloyu tersleyen DDL'i
6. `packages/db/src/__tests__/rollback-auth-role.isolation.test.ts` → testin **kendi** DDL taklidi (literal mimari, üretim SQL'inden türetilmiyor)

⚠ **Üç elle yazılmış ayna var ve hiçbiri tek kaynaktan türetilmiyor:** (1) `bootstrap-roles.sql:291`,
(2) `rollback-auth-role.sql:70`, (3) `rollback-auth-role.isolation.test.ts`'in kendi DDL
taklidi. Üçüncüsü T-016'nın S3b alt turunda **gerçekten eskidi** ve `test:isolation`'ı
kırdı (`AssertionError: expected 34 to be 45`) — `two_factor` eklendiğinde taklit
güncellenmemişti. Düzeltme **beklenen sayıyı sabitlemek değildi** (bu, bir sonraki
tabloda aynı regresyonu tekrar üretirdi); taklit üretim SQL'iyle **yeniden hizalandı**.
Bu üç aynanın tek bir kaynaktan (örn. `AUTH_SECRET_BEARING_TABLES` üzerinde döngüyle)
üretilmesi **ayrı bir teknik borç** olarak kayıtlıdır (bkz. ROADMAP → Teknik Borç →
Vadesi v0.1.0).

# T-015 — `security` gate, tur 1

Tarih: 2026-11-05
Sürüm: ROADMAP v0.0.14.1 (`arkesoft_auth` rolü ve kolon bazlı yetki ayrımı)
Dal: **main** (`git branch --show-current` ile ölçüldü)
Ortam: `arkesoft-postgres` (port 5432, `server_version` **17.11**) — ⚠ makinedeki
`cnc_proje-postgres-1` (port 55432) **kullanılmadı**

## GATE: security · TUR: 1 · SONUÇ: **FAIL**

Gerekçe: **3 `medium`** bulgu → AGENT_BASELINE §4 "3 veya daha fazla `medium` → FAIL".
`critical`/`high` bulgu **YOK**. ⚠ FAIL, *"güvenlik sınırı kurulmadı"* anlamına **gelmez** —
aşağıdaki bölüm ölçümle tersini gösteriyor. Üç `medium`'ın tamamı **tespit/beyan**
katmanındadır, yetki sınırının kendisinde değil.

---

## GÜVENLİK SINIRI GERÇEKTEN KURULDU MU — EVET, bağımsız ölçümle

Aşağıdaki her satır bu gate tarafından **yeniden** ölçüldü (`db`/`qa` çıktısı kopyalanmadı).

```
pg_roles (rolname|super|createdb|createrole|bypassrls|canlogin|replication)
  arkesoft           | t | t | t | t | t | t
  arkesoft_app       | f | f | f | f | t | f
  arkesoft_auth      | f | f | f | f | t | f     ← §10 md 4 TEYİT: BYPASSRLS YOK
  arkesoft_migrator  | f | t | f | f | t | f     ← CREATEDB meşru (shadow DB)

relacl (public, relkind='r')
  account      | arkesoft_migrator=arwdDxtm/… ; arkesoft_auth=d/…       ← app DÜŞMÜŞ
  session      | arkesoft_migrator=arwdDxtm/… ; arkesoft_auth=d/…       ← app DÜŞMÜŞ
  verification | arkesoft_migrator=arwdDxtm/… ; arkesoft_auth=d/…       ← app DÜŞMÜŞ
  app_user     | … ; arkesoft_app=arwd/… ; arkesoft_auth=arw/…          ← auth'ta d YOK

has_table_privilege('arkesoft_auth', …) S|I|U|D
  account f|f|f|t    session f|f|f|t    verification f|f|f|t    app_user t|t|t|f
  tenant  f|f|f|f    tenant_membership f|f|f|f    job f|f|f|f    audit_log f|f|f|f
  tenant_invitation f|f|f|f             _prisma_migrations f|f|f|f

account.password kolonu
  has_table_privilege (auth)  = f      has_column_privilege (auth)  = t   ← kolon rejimi
  has_table_privilege (app)   = f      has_column_privilege (app)   = f   ← TAM KESİLMİŞ

şema      : auth → USAGE=t, CREATE=f
pg_default_acl : 2 satır, ikisi de arkesoft_app — `arkesoft_auth` YOK (gelecek tablolar fail-closed)
pg_sequences (public) : 0  → sekans GRANT'i gereksiz, eklenmemiş (doğru)
attacl (public, attacl IS NOT NULL) : 27 kolon · aclexplode → 81 satır (27×3)
attacl grantee kümesi : {arkesoft_auth} — PUBLIC yok, üçüncü rol yok
```

**Yetki kümesi gerekli VE yeterli (ölçüldü):** `apps/api/src/auth/**` içinde `authPrisma`
(auth rolü) **yalnızca** `session`'a dokunuyor (`sessions.service.ts:68,87`);
`app_user` okuması **app** istemcisinden gidiyor (`auth-context.middleware.ts:70`),
`tenantMembership` ise `withTenant` üzerinden (`auth.guard.ts:98`). `src/auth/**` içinde
`audit_log` yazımı **yok** (grep → 0) → auth rolünün `audit_log`'ta yetkisiz olması bir
akışı kırmıyor. Over-grant **yok**, under-grant **yok**.

### ADR-0008:117 satırı kapandı mı, yer mi değiştirdi — ÜÇ PARÇALI DÜRÜST CEVAP

ADR-0008'in olumsuz sonucu şuydu: *"`arkesoft_app` rolü üç tabloyu filtresiz okuyabilir.
Bir kod hatasında, meşru bir `$queryRaw`, dolaylı bir `$extends` yolu, ya da DB kimlik
bilgisini ele geçiren saldırgan tüm hash'leri alır."*

1. **`arkesoft_app` yarısı GERÇEKTEN KAPANDI.** Ölçüldü:
   `has_column_privilege('arkesoft_app','public.account','password','SELECT') = f` ve
   `relacl`'de `arkesoft_app` üç tablonun hiçbirinde yok. Bu rolü taşıyan bir
   `$queryRaw`/`$extends` kazası veya `DATABASE_URL` sızıntısı artık **hash alamaz**.
   `DATABASE_URL`'i `infraEnvSchema` üzerinden gören diğer süreçler (admin/superadmin/
   storefront hattı) de bu yüzden artık sır yüzeyinde **değil** — asıl kazanç buradadır.
2. **"DB kimlik bilgisini ele geçiren saldırgan" yarısı YER DEĞİŞTİRDİ**, kapanmadı:
   hedef artık `DATABASE_AUTH_URL`. İkisi de aynı `.env`'de ve aynı süreçte
   (`ApiEnv`) yaşıyor → `apps/api` sürecini ele geçiren saldırgan için kazanç **yok**.
   Bu bir kusur değil, mekanizmanın sınırı — ama ADR-0017'nin "Olumsuz Sonuçlar"ında
   **yazılı olmak zorunda** (bkz. S-2).
3. **İkinci katman yerinde duruyor:** `env.DATABASE_AUTH_URL` DI ile her modüle ulaşsa da
   onu kullanılabilir kılan import (`createPrismaClient`, `PrismaDatabase`,
   `AuthPrismaDatabase`) `apps/api/eslint.config.mjs:61-76`'da `src/{prisma,auth}/**`
   dışında **yasak**; `@prisma/client` ve `pg` de ayrıca yasak. Yani "env'i oku, kendi
   istemcini kur" kaçış yolu R-1 katman 2 tarafından **kapalı** (okundu, doğrulandı).

---

## ALTI HEDEFİN SONUCU

| # | Hedef | Sonuç | Kanıt |
| - | ----- | ----- | ----- |
| 1 | **R-PM4 / K-A4 anti-fallback** — "yapısal olarak imkânsız" iddiasını çürütmeye çalış | ⚠ **İDDİA AYAKTA, ama dayanağı mekanik olarak PİNLENMİŞ DEĞİL** | Çürütme denemelerim: (a) boş dize → `nonEmptyString.min(1)` reddediyor; (b) `process.env` runtime enjeksiyonu → `parseEnv` tek sefer DI factory'sinde (`config.module.ts:26`) koşuyor, sonradan okuma yok; (c) `config.module.ts` factory'si **tek** kaynaktan besleniyor (`parseEnv(apiEnvSchema)`); (d) `DATABASE_AUTH_URL` alanı `connectionUrl(...)` = `nonEmptyString.refine(prefix)`, **`.optional()` yok, `.default()` yok** → `??`'nin sağ tarafı gerçekten erişilemez. **ST-F/`qa` doğru.** ⚠ AMA: erişilemezliğin **tek** sebebi "koşulsuz zorunluluk"tur ve bunu koruyan mekanik kapı **yok** — c3 şema dosyalarını taramıyor (→ S-5). Ayrıca `connectionUrl` **yalnızca öneki** doğruluyor: `DATABASE_AUTH_URL=postgresql://` Zod'u geçer (gürültülü başarısızlık, güvenlik kaybı değil) |
| 2 | **K-A12 / R-PM10** — `DATABASE_AUTH_URL` **değer olarak** sızıyor mu | **HAYIR** (ölçüldü) — ama `env:check` maskelemesi **tam değil** (→ S-3) | `DATABASE_AUTH_URL`'in üretim referansları **tam 2**: `api-env.ts:60` (şema) + `auth.module.ts:87` (tek okuma). Logger'a env geçiren çağrı **yok**; `...env` / `JSON.stringify(env)` **yok**. **Canlı ölçüm:** üç hatalı bağlantı senaryosunda (`127.0.0.1:1`, yanlış parola, olmayan DB) Prisma hata metni + stack + `meta` → **parola HİÇBİRİNDE yok** (yalnızca rol adı görünüyor). `parseEnv` hata gövdesi `issue.message` taşıyor, değer **taşımıyor**. Mevcut test `auth-secret-leak.test.ts:279-315` `DATABASE_AUTH_URL`'e **doğru şekilde göç etti** ve bağlantı parolasının `console.error` yolunda olmadığını koşulsuz assert ediyor. **Maskeleme sınaması (gerçek regex koşturuldu):** `.env.example` biçimi doğru maskeleniyor, **iki yasal biçim maskelenmiyor** → S-3 |
| 3 | **Ham `42501` log satırı** (ST-F'nin yolda bulduğu sızıntı yolu) | **`low`** (→ S-6) — yanıt yüzeyine **sızmıyor** | Ölçüldü: `anti-fallback.test.ts:170-181` → `response.status = 500`, **`response.body` `toEqual({})`** → istemciye hiçbir şey gitmiyor. Tablo adı **yalnızca sunucu tarafı yapılandırılmış logun `msg` alanında**. CLAUDE.md §4'ün "asla loglanmaz" kümesinde (parola/token/çerez/API anahtarı/kart/TCKN/tam adres/tam e-posta) tablo adı **yok**; §7'nin "başka tenant'ın varlığını sızdırma" maddesi **yanıt** yüzeyine ait ve bu tablolar platform seviyesi. → `critical`/`high` **değil**. Kalan risk bir **sınıf**: pino `redact.paths` `msg` **dizesini** asla redakte edemez ve `auth-instance.ts:285-289`'un `args.length===0` dalı kütüphane serbest metnini **aynen** iletiyor |
| 4 | **`UNEXPECTED_COLUMN_LEVEL_GRANTEE`'nin üçüncü-rol kör noktası** | ⚠ **KOLON tarafı KAPANDI, TABLO tarafı AÇIK** → **S-1 (`medium`)** | Mutasyonla ölçüldü: **M2** (üçüncü role *kolon* GRANT) → kural **ateşledi**. **M1** (üçüncü role *tablo* GRANT) → **0 bulgu, SURVIVED**. Sebep kodda yazılı: `catalog-snapshot.ts:399-401` *"tablo seviyesi `pg_class.relacl`'de yaşar — bu sorgunun KONUSU DEĞİL"* ve `relacl` **hiçbir yerde okunmuyor**; tablo yetkisi yalnızca **iki rol** için `has_table_privilege` ile soruluyor. ST-A0③'ün `{arkesoft_auth}` tekil beklenen kümesi **doğru** (attacl'de sahip grantee olarak görünmüyor — ben de doğruladım) ama bu yalnızca **Kaynak B**'yi kapsıyor |
| 5 | **CLAUDE.md §7 / §10 kontrol listeleri** | **UYGUN** (aşağıdaki bölüm) | `TENANT_SCOPED_TABLES` **dört üyede** (`tenant_membership`, `job`, `audit_log`, `tenant_invitation`) — ölçüldü, değişmedi. Yeni tablo/kolon/prosedür/kuyruk işi/dış kaynak **yok** → §7'nin çoğu N/A, gerekçeleri doğrulandı |
| 6 | **Yeni saldırı yüzeyi: `arkesoft_auth` ele geçirilirse ne olur** | **Net kazanç VAR, ama üretimde BUGÜN sıfır** → **S-2 (`medium`)** | Ele geçirilen `arkesoft_auth` ile saldırganın yapabileceği: üç tablonun **tüm** kolonlarını okuma/yazma (parola hash'i, oturum belirteci, OAuth `access/refresh/id_token`, doğrulama belirteci) + `app_user` okuma/yazma (e-posta, ad, durum) + üç tabloda `DELETE`. Yapamayacağı (ölçüldü): `tenant`/`tenant_membership`/`job`/`audit_log`/`tenant_invitation` okuma, `app_user` silme, DDL, rol oluşturma (`rolcreaterole=f`), RLS atlama (`rolbypassrls=f`), yeni tablolarda otomatik yetki (`pg_default_acl`'de yok). → `arkesoft_app`'in ele geçirilmesiyle kıyas: **auth daha kötü** (hash'leri görür) ama **app daha geniş** (tüm kiracı verisi). İkisi birlikte = eskisi. **Asıl kazanç ayrışmadır** ve o kazanç `DATABASE_AUTH_URL`'in **doğru role işaret etmesine** bağlı; bunu **hiçbir çalışma zamanı kontrolü doğrulamıyor** |

---

## MUTASYON TESTLERİ

Yöntem: `DATABASE_BOOTSTRAP_URL` ile tek bir transaction; mutasyon → `readCatalogSnapshot`
→ `lintCatalog` (ST-E'nin `lintOptions()` ile **birebir** aynı üç opsiyonel alan geçirildi)
→ sentinel ile **`ROLLBACK`**. `DROP ROLE`/`DROP TABLE` **kullanılmadı**. Ölçüm betiği
`packages/db/dist/` altında geçiciydi ve **silindi**; `git status` ölçüm öncesi durumla
**birebir aynı** (25 dosya, kalıntı yok).

| ID | Mutasyon | Hangi kontrol yakalamalı | Yakaladı mı |
| -- | -------- | ------------------------ | ----------- |
| **M0** | yok (taban) | — (vacuity karşıtı taban) | **0 bulgu**, `columnGrants=81`, grantee `{arkesoft_auth}` → taban sağlıklı **ve boş değil** |
| **M1** | `CREATE ROLE sec_probe_t015; GRANT SELECT ON public.account TO sec_probe_t015` | tablo seviyesi beklenmeyen alıcı | ⛔ **SURVIVED — 0 bulgu** → **S-1** |
| **M2** | `GRANT SELECT (password) ON public.account TO sec_probe_t015` | `UNEXPECTED_COLUMN_LEVEL_GRANTEE` | ✅ **YAKALADI** (1 bulgu, `account`), `columnGrants 81→82`, grantee kümesi `{arkesoft_auth, sec_probe_t015}` |
| **M3** | `GRANT SELECT ON public.account TO PUBLIC` | tablo seviyesi sızıntı | ✅ **YAKALADI** (2 bulgu: `APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE` + `AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE`) — **dolaylı**: PUBLIC hibesi iki probe rolünün `has_table_privilege`'ini de `true` yapıyor. ⚠ Bu, M1'in neden kaçtığını açıklıyor: **adlandırılmış** üçüncü rol iki probe rolünü etkilemez |
| **M4** | `GRANT SELECT (password) ON public.account TO arkesoft_auth WITH GRANT OPTION` | yetki devrinin beklenmediği | ⛔ **SURVIVED — 0 bulgu** → **S-6'nın kardeşi, S-4** (`isGrantable` snapshot'ta VAR, hiçbir kural okumuyor) |
| **M5** | `GRANT SELECT ON public.account TO arkesoft_app` (REVOKE'un geri alınması) | `APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE` | ✅ **YAKALADI** (1 bulgu, `account`) — bu teslimin **çekirdek değişmezi izleniyor** |
| **M6** | `ALTER ROLE arkesoft_auth BYPASSRLS` | `APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS` | ✅ **YAKALADI** — §10 md 4 artık **iki rol için** mekanik olarak izlenir (özne genişletmesi gerçekten çalışıyor) |
| **M7** | `GRANT arkesoft_app TO arkesoft_auth` (rol üyeliğiyle dolaylı yetki) | `AUTH_ROLE_EXCESS_TABLE_PRIVILEGE` | ✅ **YAKALADI** (6 bulgu) — `has_table_privilege` üyeliği izlediği için catch-all kural dolaylı yetki devralmayı da görüyor. **İyi haber, ayrıca yazılmamış bir güç** |
| — | **Kalıntı kontrolü** (ROLLBACK sonrası, transaction DIŞINDAN) | — | roller `arkesoft, arkesoft_app, arkesoft_auth, arkesoft_migrator` (probe rolü **sızmadı**) · `attacl` 27 kolon (taban) · `rolbypassrls=false` · auth rol üyeliği **0**. **A-N2 dördüncü kez doğrulandı; `CREATE ROLE`/`ALTER ROLE` de transaction'a tabi** |

**Yan ölçüm (kayda değer):** `arkesoft_migrator` `CREATE ROLE` **yapamıyor**
(`permission denied to create role`, `rolcreaterole=f`) → M1/M2 için bootstrap süper
kullanıcısına geçmek zorunda kaldım. Bu, en az yetki tasarımının **lehine** bir bulgu:
migrator rolü yeni bir yetki alıcısı yaratamaz.

---

## BULGULAR

| ID | SEV | Dosya:satır | Açıklama (saldırı/senaryo) | Önerilen düzeltme | Sorumlu ajan |
| -- | --- | ----------- | -------------------------- | ----------------- | ------------ |
| **S-1** | **medium** | `packages/db/src/catalog-snapshot.ts:396-432` (Kaynak B, *"`relacl` bu sorgunun KONUSU DEĞİL"*) + `packages/db/src/catalog-lint.ts:896-925` (`lintColumnGrantGrantees`) | **TABLO seviyesi hibelerde alıcı sayan hiçbir kural yok.** `pg_class.relacl` hiçbir sorguda okunmuyor; tablo yetkisi yalnızca `arkesoft_app` + `arkesoft_auth` için `has_table_privilege` ile soruluyor. **Mutasyon M1 SURVIVED.** Senaryo: operatör/DBA (veya gelecek bir sürüm) raporlama/yedek için salt-okuma bir rol ekleyip standart `GRANT SELECT ON ALL TABLES IN SCHEMA public TO bi_reader` uygular — bu **tüm parola hash'lerini, oturum belirteçlerini ve OAuth refresh token'larını** o role açar. Bu teslimin **tek tespit kontrolü** olan katalog linter'ı **yeşil kalır**, CI yeşil kalır, hiç kimse fark etmez. Kolon tarafı (M2) kapalı olduğu için asimetri **tesadüfi değil, yapısal** | **Kaynak C ekle:** `pg_class.relacl` + `aclexplode` (tüm `public`, taksonomi parametresi yok — Kaynak B'nin deseni) ve simetrik bir `UNEXPECTED_TABLE_LEVEL_GRANTEE` kuralı. ⚠ **Uygulayıcıya bağlayıcı ölçüm farkı:** `relacl`'de tablo **SAHİBİ `grantee` olarak GÖRÜNÜYOR** (`arkesoft_migrator=arwdDxtm/arkesoft_migrator` — ölçtüm), `attacl`'in tersine. Beklenen küme bu yüzden `{appRoleName, authRoleName, table.tableOwner}` olmalı ve sahip adı **`snapshot.tables[].tableOwner`'dan türetilmeli**, literal yazılmamalı (R-PO6'nın aynı tuzağı) | `db` + `architect` (kural sözleşmesi) |
| **S-2** | **medium** | `packages/db/sql/bootstrap-roles.sql:35-36` · `packages/config/src/env.ts:159-161` · `packages/db/src/catalog-lint.ts:930` (üretim çağrı noktası **0**) | **Beyan/gerçeklik boşluğu — üretimde garanti bugün SIFIR ve bunu hiçbir kontrol fark etmiyor.** Ölçüldü: (a) `lintCatalog`'un üretim çağrı noktası **yok** (yalnızca `__tests__/`); (b) `current_user`/`session_user` **hiçbir üretim dosyasında** assert edilmiyor; `checkDatabaseConnection` rolü kontrol etmiyor; (c) `connectionUrl` yalnızca **öneki** doğruluyor — hangi role işaret ettiğini kimse sormuyor; (d) `bootstrap-roles.sql:35-36` *"Üretimde bu dosya HİÇ koşmaz … v0.18.0"* → üretimde `arkesoft_auth` **yok** ve §7 `REVOKE`/`GRANT` DDL'i **hiç koşmadı**. Senaryo: v0.0.15 üretim dağıtımı. Operatör `DATABASE_AUTH_URL`'i doldurmak **zorunda** (koşulsuz zorunlu) ama elinde yalnızca mevcut roller var → **en düşük dirençli değer `DATABASE_URL`'in aynısı**. Sonuç: kimlik akışı tam yetkili rolle koşar, **tüm kapılar yeşil**, `env:check` yeşil, ADR/CHANGELOG veritabanı seviyesi bir sınır **iddia eder** ve o sınır yoktur. ⚠ Geliştirmede aynı yanlış yapılandırma **gürültülüdür** (`42501`, çünkü REVOKE orada koştu) — yani **dev kanıtı üretime transfer olmuyor**; tam olarak ADR-0008:102'nin yasakladığı şekil: *"belgelenmiş ama gerçekleşmeyen bir kontrol, var olmayandan daha tehlikelidir"* | **(a) Zorunlu, bu tur:** ADR-0017'nin *"Olumsuz Sonuçlar"*ına **iki cümle** — (i) üretim garantisi v0.18.0'a kadar **sıfırdır**, (ii) yanlış yapılandırılmış bir `DATABASE_AUTH_URL`'i **hiçbir kontrol tespit etmez**; aynı not `docs/development.md`'nin operatör adımına. **(b) Ucuz ve ad-bağımsız teknik azaltma (bu tur veya v0.0.15):** auth istemcisinde açılışta/health'te **negatif yetenek probu** — `SELECT has_table_privilege(current_user,'public.tenant','SELECT')` **`false` olmalı** (+ istenirse `has_table_privilege(current_user,'public.account','SELECT') = false`, kolon rejimi teyidi). Tek sorgu, fail-fast, rol adı literali gerektirmez, `pg_roles` sorgusu değil (koşulsuz fail-fast kararını bozmaz) | `docs` (a — bağlayıcı) · `db`/`architect` (b) |
| **S-3** | **medium** | `packages/config/src/check-env.ts:17-39` (`SECRET_KEY_PATTERN`, `URL_CREDENTIALS_PATTERN`, `presentValue`) + yeni dördüncü blok `:174-196` | **Projenin EN HASSAS kimlik bilgisi, eksik bir maskeleyiciden geçerek CI loguna basılıyor.** `pnpm env:check` CI'da koşuyor (`ci.yml:329`) ve ST-A'nın eklediği dördüncü blok `DATABASE_AUTH_URL`'in **değerini** `printEntries`'e veriyor. Gerçek regex'i koşturarak ölçtüm: `.env.example` biçimi doğru maskeleniyor (`//***:***@`), **iki yasal biçim MASKELENMİYOR**: (i) parolada ham `/` → `postgresql://u:p4ss/word@host/db` **aynen basılıyor** (`[^@/]+` sınıfı `/` üzerinden geçemez, regex hiç eşleşmez); (ii) sorgu parametresi biçimi → `postgresql://host/db?user=u&password=s3cr3t` **aynen basılıyor** (`DATABASE_AUTH_URL` adı `SECRET_KEY_PATTERN`'e de uymuyor). Senaryo: operatör kimlik bilgisini sorgu-parametresi biçiminde saklar (birkaç yönetilen Postgres sağlayıcısı bağlantı dizesini **tam bu biçimde** üretir) veya parolada `/` kullanır → `pnpm env:check` parolayı CI build loguna yazar; o parola **tüm parola hash'lerine ve oturum belirteçlerine** okuma/yazma verir. ⚠ Sınıf olarak **önceden var** (v0.0.2, `DATABASE_URL`/`REDIS_URL`), ama T-015 bu yolu **kat kat daha hassas** bir kimlik bilgisine açan ve ST-A raporunda *"kimlik bilgisini maskeliyor"* diye **kanıt olarak gösterilen** teslim | `presentValue`'yu regex yerine **`new URL()` ile parçalayıp yeniden kurarak** maskele (userinfo tamamen `***:***`, sorgu dizisinde **anahtar allowlist'i**, tanınmayan anahtarların değeri maskeli). Fail-closed ikinci katman: ad bazlı maskelemeye `DATABASE_*_URL` ailesini ekle. İki yönlü birim testi: iki patolojik biçim için `expect(presentValue(...)).not.toContain(parola)` | `backend` (`packages/config` sahibi) |
| **S-4** | low | `packages/db/src/catalog-snapshot.ts:159-166` (`isGrantable` şemada) · `:421` (sorguda) · `packages/db/src/catalog-lint.ts:905-922` (okumuyor) | **Mutasyon M4 SURVIVED:** `GRANT SELECT (password) ON public.account TO arkesoft_auth WITH GRANT OPTION` → **0 bulgu**. `isGrantable` alanı snapshot'ta **zaten taşınıyor** ama hiçbir kural onu okumuyor; beyan edilen tasarım `GRANT OPTION` **içermiyor** (ST-A0③ `is_grantable=f` ölçmüştü). Sömürülebilirlik **sınırlı**: auth rolünün yapacağı her ileri hibe `UNEXPECTED_COLUMN_LEVEL_GRANTEE` tarafından yakalanır ve `rolcreaterole=f` olduğu için yeni alıcı yaratamaz → bu bir **sapma tespiti** boşluğu, aktif açık değil | `lintColumnGrantGrantees`'e **tek satır**: `grant.isGrantable === false` assert'i (veya ayrı `UNEXPECTED_GRANT_OPTION` kodu). Veri elde, maliyet ≈ 0 | `db` · vade: S-1 ile **aynı düzenleme** (yolu üstünde kapanır) |
| **S-5** | low | `apps/api/src/__tests__/database-auth-url-no-fallback-literal.test.ts:62` (`AUTH_DIR = src/auth`) | **c3 mekanik kapısının tarama kümesi, adını taşıdığı saldırı yüzeyinden DAHA DAR.** ST-F/`qa` doğru ölçtü: `??` yolu *"yapısal olarak erişilemez"* — **ama yalnızca `DATABASE_AUTH_URL` koşulsuz zorunlu olduğu için**. O koşulsuzluğu koruyan mekanik kapı **yok**: `packages/config/src/env.ts:159-161`'e `.optional()` veya `apps/api/src/config/api-env.ts:60`'a `.default(process.env.DATABASE_URL)` yazılması R-PM4 deliğini **birebir** geri açar ve c3 bu iki dosyayı **hiç taramaz**. Bugün gerçekleşme **sıfır** (ölçüldü: `connectionUrl(...)`, `.optional()` yok, `.default()` yok). c3'ün kendisi literal-jeton kuralına **uygun** yazılmış (jetonlar `join('_')` ile kuruluyor) ve `files.length > 0` + sentetik-kötü-satır testleriyle **boş değil** — yapı doğru, **kapsam** dar | Ya c3'ün tarama kümesine iki env şema dosyasını ekle, ya da daha ucuzu: `databaseAuthEnvSchema.safeParse({}).success === false` **ve** `.safeParse({DATABASE_AUTH_URL: ''}).success === false` assert'i — koşulsuz zorunluluğu **doğrudan** pinler, dosya taramasına gerek bırakmaz | `backend` |
| **S-6** | low | `packages/errors/src/redaction.ts:62-86` · `apps/api/src/auth/auth-instance.ts:285-289` (`args.length===0` dalı) | İki küçük kalem, aynı kök: **pino `redact.paths` nesne YOLLARINI redakte eder, `msg` DİZESİNİ asla edemez.** (i) Better Auth logger köprüsünün argümansız dalı kütüphane serbest metnini **aynen** `msg`'e yazıyor; bugün gözlenen içerik `"Raw query failed. Code: 42501. Message: permission denied for table account"` — tablo adı + yetki topolojisi ipucu. **Yanıt yüzeyine sızmıyor** (ölçüldü: `response.body` `toEqual({})`) ve CLAUDE.md §4'ün "asla loglanmaz" kümesinde değil → `low`. Kalan risk bir **sınıf**: kütüphanenin ileride mesajına bir belirteç/e-posta gömmesi redaction'ı **atlar**; bugün bunu yalnızca AC8 log-yakalama testi (`auth-secret-leak.test.ts:185-207`) dengeliyor. (ii) `PINO_REDACT_PATHS` `accessToken`/`refreshToken` içeriyor ama **`idToken` içermiyor**; `account` tablosu üçünü de taşıyor (`access_token, refresh_token, id_token` — kolon listesi ölçüldü) | (i) `error` dalındaki yapılandırılmış taşımayı **argümansız** dala da uygula (mesajı `{ provider: 'better-auth', rawMessage }` gibi redakte edilebilir bir alana koy) **veya** v0.0.17'nin içerik düzeyi log redaction'ına açıkça devret. (ii) `PINO_REDACT_PATHS`'e `idToken` + `*.idToken` ekle (iki satır, mevcut desen) | `backend` · vade: **v0.0.17** (içerik düzeyi redaction zaten orada planlı) — T-015 bu dosyalara dokunmadı, bu bir devreden borç satırıdır |

**Bulgu sayısı: 0 critical · 0 high · 3 medium · 3 low.**

---

## §7 / §10 KONTROL LİSTELERİ

### §7 — Tenant izolasyonu (14 madde, bu değişiklik için madde madde)

| # | Madde | Sonuç | Kanıt |
| - | ----- | ----- | ----- |
| 1 | `tenant_id` NOT NULL | **N/A** | Yeni tablo yok; `git diff` içinde Prisma şeması/migration **yok** (ölçüldü) |
| 2 | RLS + `current_setting('app.tenant_id')` | **N/A** | Aynı; üç sır tablosu **platform seviyesi** (ADR-0008:95 RLS'in yapısal imkânsızlığını kaydetti, kapsam dışı) |
| 3 | `(tenant_id, …)` bileşik indeks | **N/A** | Yeni sorgulanan kolon yok |
| 4 | Doğru procedure tipi | **N/A** | Yeni tRPC prosedürü yok (`git diff` → `packages/trpc` **0 satır**) |
| 5 | `withTenant()` üzerinden sorgu | **UYGUN** | Yeni ham `prisma.*` yolu açılmadı; `auth.guard.ts:98` hâlâ `withTenant(...).tenantMembership`. `arkesoft_auth` `tenant_membership`'te **f\|f\|f\|f** → kiracı verisine kanal yok |
| 6 | Girdideki `id`'ye güvenilmiyor, sahiplik doğrulanıyor | **UYGUN (değişmedi)** | `sessions.service.ts:87-94`: `findUnique({id})` → `row?.userId !== identity.userId` → `SessionNotFoundError`. Yalnızca **bağlantı rolü** değişti, kontrol aynı |
| 7 | Kuyruk işi payload'ında `tenantId` + worker context | **N/A** | Yeni kuyruk işi yok; `src/queue/**` `git diff`'te **yok** |
| 8 | Dış kaynak (Meili/S3/önbellek) tenant kapsamlı | **N/A** | Dış kaynak dokunulmadı |
| 9 | Önbellek anahtarı `tenant:{id}:…` | **N/A** | Aynı |
| 10 | Dosya yolu tenant önekiyle doğrulanıyor | **N/A** | Dosya yükleme/indirme yüzeyi yok |
| 11 | `createTenantIsolationSuite()` çapraz okuma+yazma | **N/A, tetiklenmedi** | `TENANT_SCOPED_TABLES` **dört üyede** (ölçüldü) → prob tamlığı kapısı açılmadı |
| 12 | Hata mesajı başka tenant'ın varlığını sızdırmıyor | **UYGUN** | md 6 ile aynı kanıt: var olmayan ile başkasının oturumu **aynı 404**. 42501 metni **yanıta çıkmıyor** (`response.body` `{}` ölçüldü) |
| 13 | Log kayıtlarında `tenantId` | **UYGUN (değişmedi)** | `root-logger.ts` tabanı ve interceptor dokunulmadı |
| 14 | Süper admin impersonation + denetim kaydı | **N/A** | Süper admin işlemi yok; `src/auth/**` içinde `audit_log` yazımı **0** (grep) |

**Karşılanmayan madde: YOK.** N/A gerekçeleri `architect`/`qa`'dan **kopyalanmadı**,
bağımsız ölçüldü.

### §10 — Asla yapılmayacaklar (ilgili maddeler)

| # | Madde | Sonuç |
| - | ----- | ----- |
| 3 | `tenant_id` filtresiz sorgu / RLS'siz kiracı tablosu | **İHLAL YOK** — yeni kiracı tablosu/sorgu yok |
| 4 | **`BYPASSRLS` uygulama koduna verilmedi** | **TEYİT** — `pg_roles`: `arkesoft_auth` `rolbypassrls=f`, `rolsuper=f`. Ayrıca mutasyon **M6** gösterdi ki verilse **linter yakalıyor** (artık iki rol için) |
| 7 | Kart verisi/şifre/token/TCKN loglanmıyor/saklanmıyor | **İHLAL YOK** — kart verisi yüzeyi yok; `DATABASE_AUTH_URL` değeri loglanmıyor (ölçüldü, hedef 2). Parola **hash**'leri saklanıyor (zorunlu, ham parola değil). TCKN hiçbir kolonda yok (`app_user`: `id,email,name,status,created_at,updated_at,deleted_at,email_verified,image` — ölçüldü) |
| 8 | Gizli bilgi repoya commit edilmedi | **İHLAL YOK, değerlendirildi.** `.env.example:73`'teki `arkesoft_auth_dev_only`, mevcut `<rol>_dev_only` deseninin **dördüncü** üyesi (`arkesoft_dev_only`, `arkesoft_migrator_dev_only`, `arkesoft_app_dev_only` — üç emsal ölçüldü) ve `bootstrap-roles.sql:35-36` *"Üretimde bu dosya HİÇ koşmaz"* diyor. `.env.example` bir **şablon**; gerçek sır değil. Yüksek güvenli sır taraması (özel anahtar başlığı, `AKIA…`, `ghp_…`, `sk-…`, `xox[baprs]-`) diff + yeni dosyalarda **0 eşleşme** |
| 9 | Para float | **N/A** |
| 10 | Yıkıcı migration | **N/A** — Prisma migration'ı yok; `REVOKE` geri alınabilir (kademe 4 **gerçekten koşturuldu**, ST-G) |
| 18 | Süper admin işlemi denetim kaydı bırakıyor | **N/A** |

---

## OWASP / SIZINTI TARAMASI

| Alan | Sonuç |
| ---- | ----- |
| **Kimlik doğrulama / yetkilendirme** | Atlatma yolu **yok**. Yeni uç yok; `sessions.*` yetkileri değişmedi. `createPrismaClient`/`PrismaDatabase`/`AuthPrismaDatabase` import'ları `src/{prisma,auth}/**` dışında lint ile **yasak** (`eslint.config.mjs:61-76`), `@prisma/client` ve `pg` de yasak → `env.DATABASE_AUTH_URL`'i okuyup kendi istemcisini kuran bir modül **derlenmez/lint'ten geçmez** |
| **Girdi doğrulama (Zod)** | `DATABASE_AUTH_URL` → `connectionUrl()` (⚠ **yalnızca önek**; `postgresql://` tek başına geçer — gürültülü başarısızlık, güvenlik kaybı değil). Katalog sorgularının **her biri** ayrı Zod şemasıyla parse ediliyor (`columnGrantRowSchema`, `columnPrivilegeRowSchema` — `::text` castları yerinde, `name`/`Unknown` deserialize tuzağı kapalı). `meta.driverAdapterError` `z.looseObject` ile parse ediliyor, `as` ile **değil** |
| **Enjeksiyon — SQL** | `bootstrap-roles.sql` §7: kolon/tablo adları **yalnızca** `format('%1$I', …)`/`%I` ile, literal **yok**. `catalog-snapshot.ts`: rol adları `$queryRaw` **parametresi** olarak (`has_table_privilege(${roleName}, …)`), dize birleştirme **yok** |
| **Enjeksiyon — komut** | `rollback-roles.ts`: `spawnSync(..., { shell: false })`, argümanlar sabit dizi, SQL yolu kapalı bir `Record` (`SQL_PATHS`), CLI argümanı `'roles' \| 'auth-role'` birliğine **fail-closed** daraltılıyor. `DATABASE_BOOTSTRAP_URL` yalnızca çocuk sürecin `childEnv` nesnesine yazılıyor — kabuğa/SQL dosyasına geçmiyor. `evaluateTargetDatabase()` koruması uygulanıyor. **Enjeksiyon yüzeyi yok** |
| **Enjeksiyon — yol / XSS / açık yönlendirme** | Yüzey **yok** (SQL + TS + env şeması + CLI; HTML/React/yönlendirme dokunulmadı) |
| **Sır yönetimi** | `DATABASE_AUTH_URL` üretim referansı **2**; loglanmıyor; Prisma hata metinlerinde parola **yok** (3 senaryo ölçüldü). ⚠ `env:check` maskelemesi iki biçimde eksik → **S-3** |
| **Ödeme / PII / kart verisi** | Yüzey **yok** (bu sürümde ödeme kodu dokunulmadı) |
| **Oran sınırlama** | Değişmedi — `RateLimitGuard` (`APP_GUARD`) ve pencere süreleri `api-env.ts`'te aynı; yeni kötüye kullanılabilir uç **açılmadı** |
| **SSRF / dosya yükleme** | Yüzey **yok** — kullanıcı verdiği URL'e istek atan yeni kod yok, dosya yükleme yok |
| **Bağımlılık** | `pnpm audit`: **1 high** (`multer` >=2.0.0 <2.5.0, `@nestjs/platform-express` üzerinden geçişli) + **1 moderate** (`minimatch`, `eslint` üzerinden, **dev-only**). ⚠ **Yeni bulgu DEĞİL, teyit satırı** — T-014'ün mevcut borcuna atıf. **T-015 hiçbir bağımlılık eklemedi** (ölçüldü: `package.json` diff'lerinin tamamı **4 script satırı**, `dependencies`/`devDependencies` **0 satır**) |
| **Gizlilik (KVKK)** | **Fazla veri toplama yok.** Yeni kolon/alan yok. `app_user`'a verilen **tablo** bazlı SELECT ölçülerek değerlendirildi: tablo yalnızca `id,email,name,status,created_at,updated_at,deleted_at,email_verified,image` taşıyor — telefon/TCKN/adres **yok**, yani tablo bazlı hibe orantısız bir PII yüzeyi açmıyor. `deleted_at` kolonu silme talebi akışı için yerinde; `arkesoft_auth`'ta `app_user` için `DELETE` **yok** → silme akışı hâlâ `arkesoft_app` üzerinden gidiyor, **bozulmadı** |

---

## DOĞRULANAMADI

1. **Sıfırdan veritabanında §7 DDL'inin davranışı.** `prisma migrate reset`/`db push
   --force-reset` yasak ve onay jetonu sentezlenemez → yalnızca **zaten converge olmuş**
   bir veritabanında ölçtüm. `devops` (ST-H2) aynı sınırı dürüstçe kaydetti; iki geçişin
   yeterliliği **yapısal okumaya** dayanıyor, tekrar üretilmedi.
2. **Kademe 3 (`pnpm db:rollback-roles`) gerçek koşumu.** Handoff'un açık yasağı
   (geliştirme veritabanını kill-switch'e sokar) → koşturulmadı. Kademe 4'ün koşumu
   `db`:ST-G tarafından yapılmış ve veritabanının **sağlıklı** durumu benim ölçümümle
   doğrulandı (üç tabloda `auth=d`, `app_user`'da `arw`, `attacl` 27 kolon/81 satır).
3. **Postgres sürüm bağımlılığı.** Tüm ACL/`has_*_privilege`/`aclexplode`/`relacl`
   ölçümleri **yalnızca** `postgres 17.11` + `@prisma/client@7.10.1` +
   `@prisma/adapter-pg@7.10.1` üzerinde yapıldı. `db`'nin ST-A0② notuyla aynı sınır.
4. **CI'ın gerçek davranışı.** `ci.yml`'i koşturmadım (yetkim ve kapsamım dışı);
   `env:check`'in CI'da koştuğunu `ci.yml:329`'u **okuyarak** tespit ettim, S-3'ün log
   yüzeyi iddiası bu okumaya dayanıyor — gerçek bir CI koşumunda **gözlenmedi**.
5. **`apps/api` test süiti.** ST-F'nin 488/62 sayısını **yeniden ölçmedim**; bağımsız
   ölçtüğüm tek süit `packages/db test:isolation` → **46 test / 4 dosya YEŞİL** (rapor
   edilen tabanla birebir).
6. **S-5'in mutasyonu koşturulmadı.** Şema dosyasına `.optional()`/`.default()` yazmak
   **üretim dosyası değişikliğidir** ve gate ajanının yetkisi dışındadır → bulgu
   **yapısal okumaya** dayanıyor (`AUTH_DIR = src/auth`, iki env şema dosyası bu kümenin
   dışında), gerçekleşme ölçümü ise olumsuz (bugün `.optional()`/`.default()` **yok**).

---

## ÖLÇÜMLER

- **`pnpm audit`:** kritik **0** · yüksek **1** (`multer`, geçişli, **mevcut borca atıf** —
  yeni bulgu değil) · orta **1** (`minimatch`, `eslint` üzerinden, dev-only) · düşük **0**.
  **T-015'in eklediği bağımlılık: 0** (`package.json` diff'leri = 4 script satırı).
- **İncelenen dosya sayısı:** **25** (17 değişen + 8 yeni; `.claude/**` hariç) — tamamı
  okundu veya ilgili bölümleri okundu.
- **Tenant izolasyon listesinden karşılanmayan madde numaraları:** **YOK** (9 madde N/A,
  5 madde UYGUN — gerekçeleri bağımsız ölçüldü).
- **Canlı veritabanı ölçümü:** 8 mutasyon + 1 taban + kalıntı kontrolü, tamamı
  transaction içinde `ROLLBACK` ile. **Yakalanan 6, SURVIVED 2** (M1 → S-1, M4 → S-4).
- **Kalıntı:** sıfır. `git status` ölçüm öncesi/sonrası **birebir aynı** (25 dosya);
  `pg_roles` dört rol (probe rolü sızmadı); `attacl` 27 kolon (taban);
  `rolbypassrls=false`; auth rol üyeliği 0. Geçici ölçüm betikleri `packages/db/dist/`
  altındaydı (git izlemiyor) ve **silindi**.
- **Bağımsız koşturulan süit:** `pnpm --filter @arkesoft/db test:isolation` →
  **46 passed / 4 files**, 2.62s.
- **Üretim dosyası değişikliği: 0.** `Edit`/`Write` hiçbir üretim/test dosyasında
  kullanılmadı.

---

## SONRAKİ TUR İÇİN ÖNCELİK SIRASI (Orkestratöre not)

Üç `medium` düzeltme turu açıyor (AGENT_BASELINE §4: `medium` **sayısı kaç olursa olsun**
tur açar — bu, "3+ medium → FAIL" kuralından **ayrı** bir kuraldır).

1. **S-2(a)** en ucuz ve en yüksek getirili: `docs`:ST-I zaten bu turda ADR-0017'yi
   yazıyor → iki cümle **aynı düzenlemede** kapanır, yeni tur maliyeti ≈ 0.
2. **S-1 + S-4** aynı dosya çiftinde (`catalog-snapshot.ts` Kaynak C + `catalog-lint.ts`
   iki kural) → **tek `db` oturumu**. ⚠ `relacl`'de sahibin grantee olarak **göründüğü**
   ölçümü bağlayıcı (yukarıdaki düzeltme notu), yoksa kural kalıcı yanlış pozitif verir.
3. **S-3** `packages/config` içinde izole, `backend`.
4. **S-5** S-3 ile aynı ajan, iki satır. **S-6** v0.0.17'ye devreden borç — bu turda
   kapatılmasına gerek yok, `idToken` satırı istenirse yolu üstünde eklenir.

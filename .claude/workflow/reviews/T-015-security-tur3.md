# T-015 — Güvenlik gate raporu · TUR 3 (SON TUR)

- **Tarih:** 2026-11-05
- **Sürüm:** ROADMAP v0.0.14.1
- **Kapsam:** TAM
- **Dal:** `main` (`git branch --show-current` ile ölçüldü)

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] packages/db/src/catalog-snapshot.ts:617-629 — Kaynak E yalnızca PUBLIC
    sözde-rolünü sorar ve `prosecdef`'i HİÇ okumaz; `REVOKE EXECUTE … FROM PUBLIC` +
    `GRANT EXECUTE … TO arkesoft_app` ile kurulan bir `SECURITY DEFINER` fonksiyon
    tespitten TAMAMEN kaçar ve `arkesoft_app`'e `account.password` okuma yolu verir
    — Kaynak E'ye `p.prosecdef` + `aclexplode(p.proacl)` eklenmeli, `prosecdef = true`
    olan her fonksiyon Kaynak D'nin taksonomi-bağımsız deseniyle KOŞULSUZ bulgu
    üretmeli — db
  - [SEV: low] packages/db/src/catalog-snapshot.ts:416-434 — `readRole` yalnızca dört
    rol niteliği okur; `pg_roles.rolconfig`/`pg_db_role_setting` HİÇBİR okuyucuda yok
    → rol/veritabanı bazlı varsayılan kiracı-bağlamı GUC'u ölçülmüş fail-closed
    davranışı sessizce kapatabilir. Ölçülmüş hafifletme: `arkesoft_app` bunu KENDİSİ
    yazamıyor (superuser-only) — db, vade v0.0.15
  - [SEV: low] apps/api/src/__tests__/validation.test.ts:115 — güvenlik iddiası taşıyan
    test tam süit koşusu #1'de BİR KEZ düştü, 3 sonraki koşuda ve 6 tekrarda
    üremedi; sızıntı hipotezi yapısal olarak DIŞLANDI — qa
ÖLÇÜMLER:
  pnpm audit            2 açık: 1 high (multer, geçişli — mevcut borç) · 1 moderate
                        (minimatch, yalnızca dev/eslint) · 0 critical · 0 low
  İncelenen dosya       33 (20 değiştirilmiş + 13 yeni) — 17'si üretim dosyası
  §7 karşılanmayan      yok (uygulanabilir maddelerin tamamı karşılandı;
                        4/6/7/11 bu değişiklik için N/A — yeni uç/prosedür/iş yok)
  pnpm test             18/18 görev · 1301 test / 128 dosya (koşu #2; koşu #1'de 1
                        flake — S-17)
  pnpm test:isolation   10/10 görev · db 55/5 + api 18/4 = 73/9
  lint 21/21 · typecheck 21/21 · build 13/13 · format:check exit 0
```

---

## 1. Kendi bulgularımın kapanışı

| ID       | Durum                 | Bağımsız kanıtım                                                                                                                                                                                                                                                                                                                                              |
| -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S-7**  | **KAPANDI** (high)    | `CREATE VIEW public.acct_leak_v AS SELECT id, password FROM public.account` (txn+ROLLBACK): `relacl = {arkesoft_migrator=arwdDxtm/…, arkesoft_app=arwd/arkesoft_migrator}` — yani `ALTER DEFAULT PRIVILEGES … ON TABLES` view'ı DA kapsıyor, `has_table_privilege(arkesoft_app, …, 'SELECT') = t` SIFIR açık GRANT ile. `readTables()` 0 satır gördü; Kaynak D `acct_leak_v\|v` döndürdü → `UNEXPECTED_RELATION_KIND` ateşlenir. Sağlıklı taban: `public`'te relkind sayımı yalnızca `i`=28, `r`=10 → view/matview/foreign tablo **0** → kural boş dizi üretir (yanlış pozitif yok). |
| **S-8**  | **KAPANDI, kayıtla**  | §8 kapatma yarısı: migrator'a ait `SECURITY DEFINER` fonksiyon → ÖNCE `proacl=NULL`, `public/app/auth = t/t/t`; bootstrap rolü (`arkesoft`, superuser — `DATABASE_BOOTSTRAP_URL` kullanıcısı ölçüldü) `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` → SONRA `proacl={arkesoft_migrator=X/arkesoft_migrator}`, `public/app/auth = f/f/f`. Tespit yarısı: taze fonksiyon `hasPublicExecute = t` → tripwire ateşlenir. `pg_default_acl`'de hâlâ yalnızca 2 satır (`r`, `S`) — fonksiyon satırı **yok**, senin ÖLÇÜMÜN doğrulandı. **Kalan eksiklik → S-15.** |
| **S-9**  | **KAPANDI** (medium)  | Bölümlenmiş tablo + `GRANT SELECT … TO PUBLIC` (txn+ROLLBACK): eski filtre (`relkind='r'`) **0** satır, yeni filtre (`IN ('r','p')`) **13** satır; PUBLIC hibesi `grantee::regrole::text = '-'` olarak görünür → beklenen küme `{app, auth, owner}`'da YOK → `UNEXPECTED_TABLE_LEVEL_GRANTEE` ateşlenir. Yanlış pozitif kontrolü: `pg_tables` relkind `'p'`'yi DE içeriyor (ölçüldü: 1 satır, `tableowner=arkesoft_migrator`) → `lintTableGrantGrantees`'in `snapshot.tables.find()`'ı sahibi BULUYOR, sahip yanlışlıkla bulgu üretmiyor. |
| **S-10** | **KAPANDI** (medium)  | Gerçek derlenmiş ikili (`node packages/config/dist/check-env.js`, `pnpm --filter @arkesoft/config build` sonrası): C3 vektörüm `redis://default:re/dis+P@ss@localhost:6379` → **`re************79`** (ham kimlik bilgisi YOK). Kaynak: `catch { return maskSecret(value) }` (`check-env.ts:65-67`).                                                                                                                                                      |

S-11 / S-12 / S-13 / S-14 — yasak gereği **yeniden açılmadı**, borçta kalır. S-13 için
tur 2'deki yargım değişmedi: fail-closed **doğru** seçim, gerileme değil.

---

## 2. Atlatma anahtarı (`bypassAuthBootProbe`) değerlendirmesi

**Sonuç: güvenlik riski DEĞİL.** Üç soru ayrı ayrı ölçüldü.

### (a) Üretim derlemesine sızabilir mi → HAYIR

- `apps/api/tsconfig.build.json` → `"exclude": ["node_modules", "dist", "src/__tests__"]`.
- `rm -rf apps/api/dist && pnpm --filter @arkesoft/api build` (temiz, önbelleksiz) →
  **131** `.js` dosyası.
- `grep -rn "bypassAuthBootProbe\|BootProbeFixture" apps/api/dist` → **0 eşleşme**.
- `find apps/api/dist -name "*__tests__*" -o -name "*boot-probe*"` → **0 sonuç**.
- (Yan ölçüm: `dist/`'te önceki turlarımdan kalma `sec-probe-a/b.js` artıkları vardı;
  `.gitignore:12` `dist/` → git'e girmemişler, temiz derlemeyle kalktılar.)

### (b) `export` modül yüzeyini genişletti mi → HAYIR (yalnızca repo-içi TS görünürlüğü)

- Nest DI yüzeyi: `AuthModule`'ün `exports: [AUTH_SESSION_READER]` — `AuthPrismaClientResource`
  `exports` dizisine **girmedi**, `providers`'ta kalıyor. Başka hiçbir modülün enjektörü
  onu çözemez.
- Paket yüzeyi: `apps/api/package.json` → `"private": true`, `exports` eşlemesi yalnızca
  `"."` → `dist/index.js`, ve `src/index.ts` **yalnızca** `PACKAGE_NAME` ihraç ediyor.
- Workspace: `grep -rn "@arkesoft/api" --include=package.json` → kendi adı dışında
  **0 tüketici**.
- Alt yol erişilebilirliği ölçüldü:
  `import('@arkesoft/api/dist/auth/auth.module.js')` → **`ERR_MODULE_NOT_FOUND`**
  (`exports` eşlemesi joker taşımıyor → Node alt yolu kapatıyor).

### (c) Bir saldırgan/geliştirici üretimde etkinleştirebilir mi → HAYIR

- Bayrak **ortam değişkeni değil**, `CreateTestAppOptions`'ın derleme zamanı alanı;
  tek okuma noktası `create-test-app.ts:242` (`options.bypassAuthBootProbe === true`).
- `grep -rn bypassAuthBootProbe` → **5 eşleşme, hepsi `src/__tests__/` altında**; tek
  gerçek çağrı `auth-secret-leak.test.ts:360`.
- Üretim açılışı `main.ts:34` → `NestFactory.create(AppModule)`; `createTestApp`'e
  **hiç** uğramıyor.
- Üretim kapısı sağlam: `assertAuthRoleIsRestricted` üretim çağrı noktası **1**
  (`auth.module.ts:116`), `catch` bloğu logluyor **ve** `throw error` ile yeniden
  fırlatıyor (`auth.module.ts:117-124`) → `onModuleInit` reddi `NestFactory.create()`
  zincirini düşürür. Mutasyonla doğrulandı (M5, aşağıda).

**Kalan artık risk (ölçülmedi → bkz. DOĞRULANAMADI):** `apps/api/src/**` altındaki bir
ÜRETİM dosyasının `src/__tests__/helpers/*`'ı içe aktarmasını engelleyen bir ESLint
sınırı yok. Etkisi muhtemelen gürültülü bir derleme hatası, sessiz bir sızıntı değil —
ama üretim dosyası oluşturma iznim olmadığı için ölçemedim.

---

## 3. S-8'in tripwire çözümü kabul edilebilir mi

**EVET — kabul edilebilir, S-15'i tamamlama maddesi olarak taşımak koşuluyla.**

Gerekçe, beş ölçüme dayanıyor:

1. **Veritabanı seviyesinde kapatmak yapısal olarak mümkün değil.** `pg_default_acl`'i
   bağımsız saydım: 2 satır (`r` ve `S`), `'f'` satırı **yok**. Taze bir
   `SECURITY DEFINER` fonksiyon `proacl = NULL` ile doğuyor ve PUBLIC EXECUTE'u
   varsayılan olarak taşıyor (ölçüldü: `has_function_privilege('public', …) = t`).
   `db`'nin beş denemeli ölçümü ve Orkestratörün doğrulaması tutarlı.
2. **§8'in kapattığı yarı gerçekten çalışıyor** (yukarıdaki S-8 satırı: `t/t/t → f/f/f`).
3. **Tripwire'ın arıza modu fail-closed ve GÜRÜLTÜLÜ.** İlk fonksiyon eklendiği an
   `hasPublicExecute = t` olur → `test:isolation` kırmızıya düşer. Bunu bir **trigger
   fonksiyonu** ile de doğruladım (M10): `CREATE FUNCTION … RETURNS trigger` bile
   `pg_proc`'ta `hasPublicExecute = t` ile görünüyor, yani trigger ekseni de kazara
   kapsanıyor.
4. **`db`'nin açık riski (operatörün elle `REVOKE` yazmak zorunda kalması) kabul
   edilebilir.** Düzeltme tek satırlık bir `REVOKE`; hem §8'in metninde hem kuralın
   kendi mesajında yazıyor. Alternatif — sessizce PUBLIC-yürütülebilir fonksiyonlar —
   kesin olarak daha kötü. Bugün `public`'te **0** fonksiyon (ölçüldü) → §8 hiçbir
   mevcut fonksiyonu kırmadı, operatör yükü bugün **sıfır**.
5. **Ama tripwire asıl önemli eksende eksik** — `prosecdef` hiç okunmuyor ve yalnızca
   PUBLIC alıcısı soruluyor → **S-15**. Tripwire kararı yanlış değil; kapsamı eksik.

---

## 4. Tam denetim — altı hedef

| #     | Hedef                   | Sonuç                        | Kanıt                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ----------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Anti-fallback (R-PM4)   | **Yeni vektör YOK**          | (i) `grep -rnE "DATABASE_(AUTH_)?URL.{0,60}(\?\?\|\|\|\|\?[^.])"` üretim kaynağında → tek eşleşme `check-env.ts:33`'teki regex sabiti, fallback değil. (ii) `createPrismaClient` imzası `databaseUrl: string` (zorunlu), gövdesi `new PrismaPg(options.databaseUrl)` — `process.env` **hiç** okunmuyor. (iii) `DATABASE_AUTH_URL` için `optional\|default(\|nullish\|catch(` → **0 eşleşme**. (iv) Canlı: auth URL → `current_user = arkesoft_auth`, `has_table_privilege(…,'public.tenant','SELECT') = false`; ortamda `DATABASE_URL`(=arkesoft_app) VARken bozuk auth URL → **reddedildi** (`28P01`), sessiz düşüş **yok**. |
| **2** | K-A12 — değer sızıntısı | **Sızıntı YOK**              | (i) `check-env` çıktısı: `DATABASE_AUTH_URL  po************ic` (ad bazlı `DATABASE(_[A-Z0-9]+)?_URL` kuralı). (ii) Geçersiz değer + kanarya parola → çıktıda kanarya **0 kez** (yalnızca "şu öneklerden biriyle başlamalı" + değişken adı). `EnvValidationError` yalnızca ad+kural taşıyor (`env.ts:192-207`). (iii) Açılış probu üç arıza vektöründe (yanlış parola / ulaşılamayan host / yanlış DB) çalıştırıldı: `describeErrorCause` + `error.message` + `error.meta` + yığın başı birleşik metinde kanarya **yok**. Sızan: rol adı (`arkesoft_auth`), host, port — sır değil. |
| **3** | Ham `42501` (S-6)       | **Yeni yüzey YOK**           | Kaynak D/E yalnızca katalog yolunda (test süiti) koşuyor; §8 bootstrap SQL'i; fixture test-only. Açılış probu `causeMessage`'da ham SQLSTATE taşıyor (`Raw query failed. Code: \`28P01\``) — S-6 ile **aynı sınıf**, borçta, yeniden açılmadı. `error.code = P2010`, SQLSTATE `meta.driverAdapterError.cause.originalCode`'da (tuzak #4 doğrulandı).                                                                                           |
| **4** | Beşinci kör nokta       | **2 eksen açık, 5'i kapalı** | Ayrıntı §5.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **5** | §7 / §10                | **İhlal YOK**                | Ayrıntı §7-§8. 15. madde metni **güncellendi** (§7).                                                                                                                                                                                                                                                                                                                                                                                       |
| **6** | Yeni saldırı yüzeyi     | **Üretimde YOK**             | Kaynak D/E: `pg_catalog`'a salt-okuma `SELECT`, **sıfır** interpolasyonlu tanımlayıcı, Prisma `$queryRaw` şablonu parametreli (`${roleName}` bağlı parametre). §8: tek, idempotent `REVOKE`, dinamik SQL yok. §7 bloğu: her tanımlayıcı `format('%I')`/`%1$I`, değerler `information_schema`'dan — kullanıcı girdisi değil. `rollback-roles.ts`: mevcut `evaluateTargetDatabase` guard'ını yeniden kullanıyor (`NODE_ENV=production` → reddet; localhost değilse `ARKESOFT_CONFIRM_DESTRUCTIVE=<dbadı>` zorunlu). Kademe 4'ün etkisi `rollback-auth-role.isolation.test.ts`'te transaction içinde uygulanıp `lintCatalog` ile TAM küme eşitliğiyle (`APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE` ×3) assert ediliyor → geri alma **tespit edilebilir**. |

### Taban yetki matrisi (bağımsız ölçüm — ST-D'nin asıl hedefi)

| tablo              | app SELECT | app kolon hibesi | auth SELECT | auth kolon hibesi |
| ------------------ | ---------- | ---------------- | ----------- | ----------------- |
| account            | **f**      | **0**            | f           | 39 (13 kolon × 3) |
| session            | **f**      | **0**            | f           | 24 (8 × 3)        |
| verification       | **f**      | **0**            | f           | 18 (6 × 3)        |
| app_user           | t          | 27               | t           | 27 (9 × 3)        |
| tenant             | t          | 33               | **f**       | **0**             |
| job                | t          | 33               | **f**       | **0**             |
| audit_log          | t          | 27               | **f**       | **0**             |
| tenant_invitation  | t          | 27               | **f**       | **0**             |
| tenant_membership  | t          | 18               | **f**       | **0**             |
| \_prisma_migrations | t         | 8                | **f**       | **0**             |

Canlı doğrulama: `arkesoft_app` → `SELECT … FROM public.account` →
**`ERROR: permission denied for table account`**. `arkesoft_auth` → `account` okuyabiliyor
(25 642 satır), `product`/kiracı tabloları için **sıfır** yetki.
Kolon kapsamı tam (anti-vacuity): üç sır tablosunun ve `app_user`'ın **her** kolonunda
SELECT+INSERT+UPDATE var; `DELETE` yalnızca üç sır tablosunda (`app_user` = `f`,
`AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS` ile birebir). Tuzak #3 (kolon parantezi her
privilege'e ayrı yazılmalı) `%1$I` üçlemesiyle doğru uygulanmış.

**Fail-closed RLS hâlâ sağlam:** `arkesoft_app`, kiracı bağlamı **kurulmadan**:
`tenant_membership`=0, `job`=0, `audit_log`=0, `tenant_invitation`=0.

---

## 5. Beşinci kör nokta araması — yedi eksen

Yasak gereği `pg_default_acl` (S-11) ve `pg_auth_members` (S-12) **aranmadı**.

| Eksen                                      | Durum              | Ölçüm                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public` DIŞI şema                         | **Yapısal kapalı** | TÜM okuyucular `n.nspname = 'public'` filtreliyor — ama `arkesoft_migrator` `CREATE SCHEMA` deneyince **`ERROR: permission denied for database arkesoft`**. `has_database_privilege(…,'CREATE')`: migrator **f**, app **f**, auth **f**, PUBLIC **f**. Yalnızca superuser açabilir. Şemalar: yalnızca `public` + sistem. |
| Fonksiyon — `prosecdef` / PUBLIC-dışı alıcı | **AÇIK → S-15**    | Ölçüm §6, M4.                                                                                                                                                                                         |
| `rolconfig` / `pg_db_role_setting`         | **AÇIK → S-16**    | `grep -rn "rolconfig\|pg_db_role_setting\|setconfig"` `packages/db/src` + `sql` → **0 eşleşme**. `readRole` yalnızca `rolname/rolsuper/rolbypassrls/rolcreatedb`. Taban temiz: dört rolün `rolconfig`'i NULL, `pg_db_role_setting` **0** satır. Hafifletme: `arkesoft_app` kendi varsayılanını yazamıyor → **`ERROR: permission denied to set parameter`**. |
| Trigger (`pg_trigger`)                     | **Dolaylı kapalı** | Hiçbir okuyucuda yok (0 eşleşme), bugün 0 trigger. AMA trigger bir fonksiyon gerektirir ve o fonksiyon Kaynak E'de `hasPublicExecute = t` ile görünüyor (M10 ölçüldü) → tripwire ateşlenir.               |
| RULE (`pg_rewrite`)                        | **Bugün boş**      | Hiçbir okuyucuda yok (0 eşleşme); `public`'te kural sayısı **0**. Taşıyıcısı migrator (app/auth'un CREATE'i yok) → çalışma zamanı saldırgan yolu değil.                                                 |
| Sequence (`relkind='S'`)                   | **Kapsam dışı**    | `public`'te sequence sayısı **0** (Prisma cuid kullanıyor). `pg_default_acl`'in `'S'` satırı S-11 kapsamında — açılmadı.                                                                               |
| Bölümlenmiş tablo (`relkind='p'`)          | **Kapandı (S-9)**  | §1, S-9 satırı.                                                                                                                                                                                       |

---

## 6. Mutasyon testleri

| ID      | Mutasyon                                                                                     | Hangi kontrol yakalamalı                 | Yakaladı mı                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **M1**  | `CREATE VIEW public.acct_leak_v AS SELECT id, password FROM public.account`                   | `UNEXPECTED_RELATION_KIND` (Kaynak D)    | **CAUGHT** — Kaynak D `acct_leak_v\|v`; sıfır GRANT'le app SELECT = **t** (açığın gerçekliği de kanıtlandı)                      |
| **M2**  | Bölümlenmiş tablo + `GRANT SELECT … TO PUBLIC`                                               | `UNEXPECTED_TABLE_LEVEL_GRANTEE`         | **CAUGHT** — eski filtre 0 / yeni filtre 13 satır; PUBLIC `grantee='-'` beklenen kümede yok                                     |
| **M3**  | `SECURITY DEFINER` fonksiyon, HİÇ GRANT yok                                                  | `UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE`  | **CAUGHT** — `hasPublicExecute = t`                                                                                             |
| **M4**  | `SECURITY DEFINER` fn + `REVOKE EXECUTE FROM PUBLIC` + `GRANT EXECUTE TO arkesoft_app`       | `UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE`  | **SURVIVED** → **S-15**. Ölçüm: `sec_probe_leak \| hasPublicExecute=f \| app_can_execute=t \| prosecdef=t`                       |
| **M5**  | `DATABASE_AUTH_URL ?? DATABASE_URL` düşüşünün SONUCU (auth istemcisi app URL'i ile kuruldu)   | `assertAuthRoleIsRestricted` açılış probu | **CAUGHT** — `AuthRoleNotRestrictedError`. Anti-vacuity: sağlıklı auth URL ile prob **geçti** (iki yönlü kanıt)                 |
| **M6**  | Fixture/bayrağın üretim derlemesine sızması                                                  | `tsconfig.build.json` `exclude`          | **CAUGHT** — temiz derleme 131 dosya, 0 eşleşme                                                                                 |
| **M7**  | Bayrağı ortamdan etkinleştirme                                                               | — (böyle bir yol yok)                    | **Yol YOK** — bayrak derleme zamanı, env okuması yok, `main.ts` `createTestApp` kullanmıyor                                      |
| **M8**  | `ALTER ROLE arkesoft_app SET <kiracı GUC'u>` (app rolünün KENDİSİ)                            | Postgres yetki kontrolü                  | **CAUGHT (Postgres)** — `ERROR: permission denied to set parameter`. Superuser yaparsa linter göremez → **S-16**                 |
| **M9**  | `CREATE SCHEMA` (migrator) → `nspname='public'` filtresini atlatma                           | Postgres yetki kontrolü                  | **CAUGHT (Postgres)** — `ERROR: permission denied for database arkesoft`                                                        |
| **M10** | Trigger + trigger fonksiyonu                                                                 | `UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE`  | **CAUGHT** — `sec_probe_tg \| hasPublicExecute=t`; trigger ekseni fonksiyon üzerinden kapsanıyor                                |
| **M11** | §8'in `REVOKE`'u gerçekten kapatıyor mu                                                      | `has_function_privilege` (üç rol)        | **CAUGHT** — `t/t/t` → `f/f/f`                                                                                                  |
| **M12** | `maskUrlCredentials` `catch` yolu (C3 vektörü, derlenmiş ikili)                               | `maskSecret` fallback                    | **CAUGHT** — ham kimlik bilgisi yerine `re************79`                                                                        |

Tüm DDL mutasyonları transaction + `ROLLBACK` içinde koşturuldu; kalıntı yok
(`pg_proc` → 0, view/matview → 0, `rolconfig` → NULL, `pg_db_role_setting` → 0 satır
olarak yeniden doğrulandı).

---

## 7. Yeni bulgular

| ID       | SEV        | Dosya:satır                                 | Açıklama (saldırı senaryosu)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Sorumlu |
| -------- | ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **S-15** | **medium** | `packages/db/src/catalog-snapshot.ts:617-629` (+ `catalog-lint.ts:1144-1156`) | **Kim:** bir geliştirici (gelecek bir migration'da). **Hangi girdiyle:** `CREATE FUNCTION public.verify_pw(...) RETURNS … SECURITY DEFINER AS 'SELECT … FROM public.account …'` + "linter kırmızı verdi" diye en düşük dirençli düzeltme olan `REVOKE EXECUTE … FROM PUBLIC; GRANT EXECUTE … TO arkesoft_app`. **Ne elde eder:** `arkesoft_app`, üç sır tablosundaki SIFIR yetkisine (ST-D'nin tüm amacı) rağmen `account.password`'ü okuyan bir yol kazanır — fonksiyon sahibinin (`arkesoft_migrator`) yetkisiyle çalışır. **Ölçüm:** `hasPublicExecute=f` → kural `.filter(p => p.hasPublicExecute)` yüzünden **ateşlenmez**, ama `has_function_privilege('arkesoft_app', oid, 'EXECUTE')=t` ve `prosecdef=t`. **İkinci kusur:** kuralın mesajı "`SECURITY DEFINER` bir fonksiyonda bu … baypas etmenin bir yolu olabilir" diyor ama yüklem `prosecdef`'i **hiç** okumuyor → hem eksik tespit (PUBLIC-dışı alıcı) hem fazla tespit (varsayılan PUBLIC EXECUTE'lu zararsız `SECURITY INVOKER` fonksiyon). **Önerilen düzeltme:** Kaynak E'ye `p.prosecdef` **ve** `aclexplode(p.proacl)` alıcılarını ekle; `prosecdef = true` olan `public` fonksiyonları için Kaynak D'nin taksonomi-bağımsız deseniyle **koşulsuz** bulgu üret, ek olarak `{owner}` dışındaki her EXECUTE alıcısını bildir. **medium (high değil) gerekçesi:** bugün `public`'te **0** fonksiyon; `arkesoft_app`/`arkesoft_auth`'ın `CREATE ON SCHEMA public`'i **yok** (ölçüldü: `f`) → çalışma zamanı saldırgan yolu yok; kazara/varsayılan yol **kapsanıyor**; açık iki satırlık kasıtlı bir GRANT gözden geçirilen bir migration dosyasında görünür. | `db`    |
| **S-16** | **low**    | `packages/db/src/catalog-snapshot.ts:416-434` | **Kim:** superuser erişimi olan biri veya `bootstrap-roles.sql`'e satır ekleyen bir geliştirici. **Hangi girdiyle:** `ALTER ROLE arkesoft_app SET <kiracı bağlamı GUC'u> = 'tnt_X'` (veya `… IN DATABASE arkesoft SET …`). **Ne elde eder:** `arkesoft_app`'in her YENİ oturumu kiracı bağlamı **önceden kurulmuş** başlar; bugün ölçülen fail-closed davranış (kiracı bağlamı yokken dört kiracı tablosunun tamamında 0 satır) sessizce "kiracı X'in satırlarını oku"ya döner — RLS politikası hâlâ yürürlükte olduğu için hiçbir kural ihlal edilmez ve `lintCatalog` bunu **göremez** (`rolconfig`/`pg_db_role_setting` hiçbir okuyucuda yok, 0 grep eşleşmesi). **Neden low:** `arkesoft_app` bunu **kendisi yazamıyor** (ölçüldü: `permission denied to set parameter`) → kaçak bir çalışma zamanı rolünden erişilemez; taban temiz (rolconfig NULL, 0 satır); yalnızca superuser/bootstrap yolu. **Önerilen düzeltme:** `readRole`'a `rolconfig`, snapshot'a `pg_db_role_setting` ekle; kiracı bağlamı GUC'unun rol/veritabanı varsayılanı olarak **hiç** tanımlı olmamasını bir kuralla assert et. **Vade:** v0.0.15. | `db`    |
| **S-17** | **low**    | `apps/api/src/__tests__/validation.test.ts:115` | Güvenlik iddiası taşıyan `NEGATİF: Zod ham mesaj metni yanıt gövdesinde HİÇ geçmez` testi, tam süit koşusu **#1**'de bir kez düştü (491/492). **Üremedi:** tam süit koşusu #2 → 492/492; iki ayrı izole `apps/api` koşusu → 492/492; tek dosyanın 6 tekrarı → her seferinde 4/4. **Sızıntı hipotezi yapısal olarak DIŞLANDI:** `zod-validation.pipe.ts:53` gövdeye yalnızca `toValidationMessageKey(issue.code)` (i18n anahtarı) yazıyor, ham `issue.message` **yalnızca** `debug` logına gidiyor (`:55-58`); `toErrorBody`/`genericTransportErrorBody`'de `NODE_ENV` kapısı, `.message` veya yığın izi **yok**. **Ölçülmüş muhtemel mekanizma:** paylaşılan tek Redis — aynı Redis'e karşı iki eşzamanlı vitest süreci koşturunca `rate-limit.test.ts`'te 6 başarısızlık **ürettim** (`createTestApp` `platform:auth:*` anahtarlarını topluca siliyor, `authenticatedCookie` 429 alabiliyor). Bu SPESİFİK başarısızlığın mekanizması: **DOĞRULANAMADI**. **Önerilen düzeltme:** auth/rate-limit durumuna dokunan test dosyalarını tek bir vitest "serial" grubuna al veya oran sınırlama anahtar önekini test dosyası başına ayır. | `qa`    |

**Bu değişikliğe atfedilemeyen not (bulgu değil):** `validation.test.ts` T-015'in diff'inde
**yok**; S-17 bu sürümün kapsamına değil, süit altyapısına ait.

---

## 8. §7'nin 15. madde metni — hâlâ gerekli mi?

**Gerekli — ama tur 2'de hazırladığım metin ARTIK YANLIŞ.** O metin "view/matview/
`SECURITY DEFINER` ekle**me**den önce elle incele" diyordu; S-7 ve S-8'in düzeltmesiyle bu
eksenlerin **otomatik tespiti** devreye girdi, dolayısıyla madde artık bir **elle inceleme
hatırlatıcısı** değil, **linter'ın görüş alanının sınırını** beyan eden bir madde olmalı.
Ölçülmüş sınır: Kaynak A–E `public` şemasının tablolarını, view/matview/foreign
tablolarını ve fonksiyonların **PUBLIC** EXECUTE'unu görür; görmediği eksenler
`prosecdef`, PUBLIC-dışı fonksiyon alıcıları, `pg_trigger`, `pg_rewrite`, `rolconfig`.

**`docs`'a taşınacak güncellenmiş metin:**

> - [ ] **Bağımlı/türetilmiş nesne eklemiyorum** — ya da ekliyorsam katalog linter'ının
>       görüş alanını birlikte genişletiyorum. Linter bugün `public` şemasında şunları
>       görür: tablolar (`relkind IN ('r','p')`), view/matview/foreign tablolar
>       (`UNEXPECTED_RELATION_KIND` — koşulsuz bulgu, allowlist henüz YOK) ve
>       fonksiyonların **PUBLIC** EXECUTE hakkı
>       (`UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE`). **Görmediği** eksenler:
>       `pg_proc.prosecdef`, PUBLIC-dışı `EXECUTE` alıcıları, `pg_trigger`,
>       `pg_rewrite` (RULE), `pg_roles.rolconfig`/`pg_db_role_setting`. Bu eksenlerden
>       birine dokunan bir nesne eklemek **otomatik kapı tarafından yakalanmaz** —
>       elle güvenlik incelemesi + linter genişletmesi ZORUNLU.
> - [ ] **`SECURITY DEFINER` fonksiyon eklemiyorum.** Ekliyorsam: sahibi tablo sahibi
>       (`arkesoft_migrator`) olduğu için fonksiyon RLS'i ve kolon bazlı kısıtlamayı
>       BAYPAS EDEBİLİR. Açıkça `REVOKE EXECUTE … FROM PUBLIC` yazılacak, `EXECUTE`
>       **hiçbir** çalışma zamanı rolüne (`arkesoft_app`/`arkesoft_auth`) verilmeyecek
>       (verilmesi gerekiyorsa ADR yazılacak), ve fonksiyon gövdesi kiracı bağlamını
>       KENDİ içinde zorlayacak.
> - [ ] **`public` dışına şema açmıyorum.** (Bugün yapısal olarak kapalı: `arkesoft_migrator`
>       `CREATE ON DATABASE` taşımıyor — ölçüldü. Açılırsa katalog okuyucularının
>       tamamının `nspname = 'public'` filtresi o şemayı KÖR NOKTAYA çevirir.)

---

## 9. §7 / §10 kontrol listeleri

### §7 — tenant izolasyonu (14 madde)

Bu değişiklik **yeni tablo, yeni uç, yeni tRPC prosedürü veya yeni kuyruk işi
EKLEMİYOR**; rol yetkilerini daraltıyor ve katalog bekçisi ekliyor. Buna göre:

| #   | Madde                                    | Durum                                                                                                                                     |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `tenant_id` NOT NULL                     | **Değişmedi** — yeni tablo yok; 4 kiracı tablosu taksonomide                                                                              |
| 2   | RLS etkin + politika GUC karşılaştırması | **Korunuyor** — `tenant_membership/job/audit_log/tenant_invitation` → `relrowsecurity=t`, `relforcerowsecurity=t` (ölçüldü)                |
| 3   | `(tenant_id, …)` bileşik indeks          | **Değişmedi**; `readIndexes` kuralı yürürlükte                                                                                            |
| 4   | `tenantProcedure` kullanımı              | **N/A** — yeni prosedür yok                                                                                                               |
| 5   | `withTenant()` üzerinden sorgu           | **Korunuyor** — fail-closed canlı ölçüm: bağlam yokken 4 tabloda da 0 satır                                                               |
| 6   | Girdideki `id`'ye güvenmeme              | **N/A** — dış girdi alan yeni yol yok. Kaynak D/E girdisi `pg_catalog`; `readRole`'un `${roleName}`'i bağlı parametre                      |
| 7   | Kuyruk payload'ında `tenantId`           | **N/A** — yeni kuyruk işi yok                                                                                                             |
| 8   | Dış kaynak tenant kapsamlı               | **N/A** — Meilisearch/S3/önbellek dokunulmadı                                                                                             |
| 9   | Önbellek anahtarı `tenant:{id}:…`        | **N/A** — dokunulmadı                                                                                                                     |
| 10  | Dosya yolu tenant önekiyle               | **N/A** — dosya yükleme yok                                                                                                               |
| 11  | `createTenantIsolationSuite()` testi     | **N/A** (yeni kaynak yok) — ama 9 izolasyon dosyası / 73 test yeşil; 5'i `packages/db` rol-ayrımı kanıtı                                   |
| 12  | Hata mesajı varlık sızdırmıyor           | **Korunuyor** — `toErrorBody` yalnızca `code` + i18n anahtarı + `publicDetails`; `NODE_ENV` kapısı yok, ham mesaj/yığın yok                |
| 13  | Logda `tenantId`                         | **Korunuyor** — canlı log örneklerinde `tenantId`/`userId`/`requestId` mevcut                                                             |
| 14  | Süper admin impersonation/denetim kaydı  | **N/A** — süper admin yolu bu değişiklikte yok                                                                                            |

**Karşılanmayan madde: yok.**

### §10 — asla yapılmayacaklar

| #   | Yasak                                   | Durum                                                                                                                      |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 2   | `any` / `@ts-ignore`                    | **Temiz** — `typecheck` 21/21, `lint` 21/21                                                                                |
| 3   | `tenant_id` filtresiz sorgu / RLS'siz   | **Temiz** — yeni kiracı tablosu yok; ham `$queryRaw`'lar platform seviyesi `pg_catalog` okumaları (gerekçe yorumlu)        |
| 4   | RLS devre dışı / `BYPASSRLS`            | **Temiz** — `rolbypassrls`: `arkesoft_app` **f**, `arkesoft_auth` **f**, `arkesoft_migrator` **f** (ölçüldü)                |
| 7   | Kart/şifre/token/API anahtarı loglama   | **Temiz** — kanarya testi: boot probu arıza yollarının hiçbirinde parola yok; `check-env` ad bazlı maskeleme + S-10 fallback |
| 8   | Repoya sır commit'i                     | **Temiz** — 9 041 satırlık birleşik değişiklik tarandı; tek literal parola ailesi `*_dev_only` (dev-only, `.env.example` ile birebir, üretimde bu dosya hiç koşmuyor — §1 notu). API anahtarı / `BEGIN … PRIVATE KEY` **0** |
| 18  | Denetim kaydı bırakmadan süper admin    | **N/A**                                                                                                                    |
| —   | SQL / komut / yol / XSS / açık yönlendirme | **Temiz** — dinamik SQL'in tamamı `format('%I')`/`%1$I`; değerler `information_schema`'dan; `$queryRaw` tanımlayıcı interpolasyonu **yok**; yeni HTML/yönlendirme/dosya yolu yüzeyi yok |

---

## 10. Diğer gate konuları

- **Ödeme / PII / KVKK:** bu sürümde ödeme yolu yok. KVKK açısından **iyileşme**:
  `arkesoft_app` artık `account`/`session`/`verification`'da **sıfır** yetki taşıyor
  (parola hash'i + oturum belirteci + doğrulama belirteci erişimi daraltıldı). Fazla
  veri toplanmıyor, üçüncü tarafa veri gitmiyor, silme akışı bozulmuyor
  (`arkesoft_auth` üç sır tablosunda `DELETE` taşıyor; `app_user`'da bilinçli olarak
  taşımıyor — A-N1).
- **Oran sınırlama:** bu değişiklik oran sınırlama politikasına dokunmuyor; mevcut
  `platform:auth:*` sayaçları yürürlükte (S-17'nin mekanizma ölçümünde canlı gözlendi).
- **SSRF / dosya yükleme:** bu değişiklikte yeni yüzey yok.
- **Bağımlılık:** `pnpm audit` → `1 high` (**multer** `>=2.0.0 <2.5.0`, `@nestjs/platform-express`
  üzerinden geçişli, 4 yol — **mevcut borca atıf**, bu sürümün eklemesi değil) +
  `1 moderate` (**minimatch** `<11.0.1`, 63 yol, tamamı `eslint` üzerinden **yalnızca
  dev**). Bu sürümde **yeni ana bağımlılık eklenmedi** (`package.json` farkı: yalnızca 2
  script satırı).

---

## 11. Operatör notu (bulgu değil)

`pnpm env:check` kullanıcının makinesinde **exit 1** veriyor: yerel `.env`'de
`DATABASE_AUTH_URL` **yok** (ölçüldü), `.env.example:73`'te var. Bu **doğru fail-closed
davranış** ve hata metni tam olarak yapılacak şeyi söylüyor (`.env.example` satırını
kopyala → `pnpm db:bootstrap`). Kullanıcının `.env`'ine yazma iznim olmadığı için tüm
ölçümlerimde değişkeni kabuk öneki olarak verdim. `devops`/`docs`'un sürüm notunda
belirtmesi gerekir.

---

## 12. DOĞRULANAMADI

1. **Tur 2 koşusundaki tek flake'in kesin mekanizması** (S-17). Üremedi; sızıntı
   hipotezini yapısal olarak dışladım ve paylaşılan-Redis girişimini ayrı ölçtüm, ama
   o spesifik başarısızlığın yanıt gövdesini **yakalayamadım**.
2. **Üretim dosyasının `src/__tests__/helpers/*`'ı içe aktarmasının derleme/lint
   sonucu.** Bunu ölçmek bir üretim dosyası oluşturmayı gerektiriyordu — iznim yok.
   Bayrağın bugünkü erişilemezliği ölçüldü; **gelecekteki** bir yanlış import'un
   gürültülü mü sessiz mi olacağı ölçülmedi.
3. **Kademe 3/4 geri alma script'lerinin canlı etkisi.** Yasak gereği
   `pnpm db:rollback-roles` koşturulmadı; kademe 4'ü de canlı koşturmadım. Tespit
   edilebilirliği `rollback-auth-role.isolation.test.ts`'in transaction içi
   `lintCatalog` TAM-küme assert'inden **okudum**, kendim canlı uygulamadım.
4. **`UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE` ve `UNEXPECTED_RELATION_KIND` kurallarının
   TypeScript üzerinden uçtan uca ateşlenmesi.** `lintCatalog` saf bir fonksiyon
   olduğu ve girdisi (`hasPublicExecute`, `unexpectedRelations`) tam Kaynak D/E
   sorgularıyla birebir ölçüldüğü için yüklemlerin sonucunu **türettim**; TS süreci
   içinde canlı transaction'la yeniden koşturmadım (o kanıt `db`'nin M9/M14
   reprodüksiyonlarında ve yeşil `test:isolation`'da mevcut).

---

## 13. Sonuç

| Sayım      | Değer |
| ---------- | ----- |
| `critical` | 0     |
| `high`     | 0     |
| `medium`   | **1** |
| `low`      | 2     |

AGENT_BASELINE §4: `critical`/`high` yok, `medium` sayısı 3'ün **altında** (1) →
**SONUÇ: PASS**. S-15 / S-16 / S-17 teknik borç tablosuna kaydedilir; S-15 düzeltme
turu açmaz ama **v0.0.15'e bağlanması önerilir** (katalog bekçisinin tamamlanması).

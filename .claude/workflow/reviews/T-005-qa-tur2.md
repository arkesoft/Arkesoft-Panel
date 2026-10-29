# T-005 — QA Gate, Tur 2

Tarih: 2026-10-28 · ROADMAP sürümü: v0.0.13 · Repo durumu: `main`, commit atılmadı.

GATE: qa
SONUÇ: PASS

---

## Tur 1'deki KRİTİK bulgunun durumu: **KAPANDI** (bağımsız olarak yeniden ispatlandı)

Tur 1'de verdiğim bulgu: `pnpm db:deploy` `DATABASE_URL`'i (`arkesoft_app`, hiçbir
tablonun sahibi değil) okuyordu; v0.0.13'ün RLS migration'ı DDL olduğu için yalnızca
sahip rol (`arkesoft_migrator`) uygulayabilir → taze bir veritabanında `deploy`
`permission denied for schema public` ile patlıyordu (AC1/AC8 kırık).

**Bağımsız yeniden doğrulama (tur 1'deki yöntemle AYNI — atılabilir, izole Postgres,
`db`'nin ölçümüne güvenilmedi, baştan koşuldu):**

```
docker run -d --name qa-tur2-fresh-pg -e POSTGRES_USER=arkesoft \
  -e POSTGRES_PASSWORD=arkesoft_dev_only -e POSTGRES_DB=arkesoft \
  -p 15433:5432 postgres:17.11-alpine

DATABASE_URL=...arkesoft_app...15433...        \
DATABASE_MIGRATION_URL=...arkesoft_migrator... \
DATABASE_BOOTSTRAP_URL=...arkesoft...          \
NODE_ENV=development                           \
node dist/bootstrap-roles.js                   → EXIT 0
node dist/run-guarded-prisma.js migrate deploy → EXIT 0
  "Applying migration `20261026082729_init`"
  "Applying migration `20261028153016_rls_tenant_isolation`"
  "All migrations have been successfully applied."
node dist/run-guarded-prisma.js db seed        → EXIT 0
```

Ardından canlı doğrulama (AYNI taze DB üzerinde, `arkesoft_app` ile):

```
rolsuper=f, rolbypassrls=f, rolcreatedb=f                         (arkesoft_app)
relrowsecurity=t, relforcerowsecurity=t                           (tenant_membership)
select * from tenant_membership (context'siz)  → 0 satır
alter table tenant_membership disable row level security → ERROR: must be owner of table
```

**AC1 ve AC8 artık KAPALI.** `migrate deploy` CI'nin her zaman sıfırdan başlayan
`services: postgres` konteynerinde çalışır; dokümante edilen geliştirici geçişi
(bootstrap→deploy→seed) tek seferde ve hatasız tamamlanır.

**Regresyon kapısı — diğer beş komut ve AYRICALIK SINIRI ampirik olarak test edildi
(aynı taze konteynerde):**

| Komut (NODE_ENV=production, host=localhost) | Beklenen  | Gerçek                                               |
| ------------------------------------------- | --------- | ---------------------------------------------------- |
| `migrate dev`                               | reject    | **reject** — "Üretim ortamında çalıştırılamaz"       |
| `db push`                                   | reject    | **reject** — aynı mesaj                              |
| `db seed`                                   | reject    | **reject** — aynı mesaj                              |
| `migrate deploy`                            | **allow** | **allow** — exit 0, "No pending migrations to apply" |
| `migrate resolve` (bilinmeyen)              | reject    | **reject** — "İzin verilmeyen komut"                 |
| `migrate deploy --accept-data-loss`         | reject    | **reject** — "İzin verilmeyen argüman"               |

`requiresDestructiveTargetGuard`'ın istisnası **yalnızca** `migrate deploy`'u
kapsıyor; diğer beş sarmalanmış komut ve bilinmeyen komutlar hâlâ korunuyor.
`ARKESOFT_CONFIRM_DESTRUCTIVE` kaçış kapısı testleri (`guard-policy.test.ts`,
`evaluateTargetDatabase`'in kendisi değişmedi) dokunulmadan geçiyor.

---

## Test çevirmesi (`guard-policy.test.ts`, "migrate deploy → reject" → "→ allow"): **MEŞRU**

Çevirme testi gevşetme kalıbına **benzemiyor** — yargım: davranış **gerçekten**
değişti (migrate deploy artık allowlist'te, `migrator` rolüne yönleniyor; yukarıdaki
ampirik tabloyla doğrulandı), ve çevirmeyle **birlikte** yeni bir negatif test
eklendi: `'migrate deploy ek bayrak kabul etmez → reject'`
(`['migrate', 'deploy', '--schema=/tmp/x.prisma']` → reject). `COMMANDS` içindeki
`migrate deploy` girdisinin `allowedFlags: []` olduğu okundu — bu negatif test
gerçek bir regresyon yakalama yüzeyi, dekoratif değil. `--accept-data-loss` ile de
elle tekrarlandı (yukarıdaki tablo), aynı ret.

---

## BULGULAR

- **[SEV: medium] `packages/db/src/run-guarded-prisma.ts:223-258`** — `resolveDatabaseRole()`
  ve `requiresDestructiveTargetGuard()` (FIX turu 1'in kalbi — hangi komut hangi role
  gider, hangi komut üretim/host korumasından muaf) **hiçbir unit testle kapsanmıyor**.
  İkisi de `export` edilmiyor; `main()` modül yüklenince koşulsuz çağrılıyor
  (`main()` dosya sonunda), bu yüzden mevcut mimaride tek doğrulama yolu
  **derlenmiş CLI'yi gerçekten spawn etmek** (benim bu turda yaptığım gibi) —
  `packages/db/src/__tests__/` içinde bunu yapan **hiçbir otomatik test yok**
  (`grep -rn "spawnSync\|execSync\|spawn(" packages/db/src/__tests__` → yalnızca
  `guard-policy.test.ts`/`test-client.ts`'in **içe aktarma** satırları, gerçek
  process spawn'ı yok). Bu **tam olarak** tur 1'in kritik bulgusunu gizleyen boşluk
  sınıfı: o bug de yalnızca gerçek bir CLI çalıştırmasıyla ortaya çıktı, mevcut
  (migrasyonlanmış) dev DB'sinde sessizce maskelendi. `resolveDatabaseRole` yarın
  yanlışlıkla `db seed`'i `migrator`'a veya `migrate dev`'i `app`'e yönlendirirse
  `pnpm test`/`pnpm test:isolation` bunu **yakalamaz** — yalnızca CI'nin gerçek
  `prepare-db` koşumunda (veya elle, benim bu turda yaptığım gibi) ortaya çıkar.
  Üç saatlik bir risk penceresi değil ama **yapısal bir kör nokta**.
  **Önerilen düzeltme yönü (üretim kodu değiştirilmedi):** bu iki fonksiyonu
  `export` et ve saf birim testiyle (argv→rol, argv→muafiyet eşlemesi, altı komutun
  tamamı + bilinmeyen/varsayılan dal) kapat — DB'ye bağlanmaz, hızlı, deterministik.
  **Sorumlu ajan:** `db`.

- **[SEV: low] `packages/db/sql/bootstrap-roles.sql` — orkestratör brifinginin
  iddia ettiği `REVOKE INSERT, UPDATE, DELETE ON _prisma_migrations FROM
arkesoft_app` satırı DOSYADA YOK** (`grep -n "_prisma_migrations\|REVOKE"
packages/db/sql/bootstrap-roles.sql` → yalnızca bir yorum satırı ve
  `REVOKE CREATE ON SCHEMA public FROM PUBLIC`; `_prisma_migrations` için özel
  bir REVOKE **hiçbir dosyada** yok). Bu önermeyi **doğrulayamadım** — iddia
  muhtemelen yanlış hatırlanmış. Ampirik olarak **tersini** ölçtüm: §4'teki
  blanket `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO
arkesoft_app` `_prisma_migrations`'ı da kapsıyor — taze konteynerde
  `arkesoft_app` ile `INSERT`/`DELETE` **başarıyla çalıştı**:
  ```
  arkesoft_app: insert into _prisma_migrations (...) values (...) → INSERT 0 1
  arkesoft_app: delete from _prisma_migrations where id='qa-probe' → DELETE 1
  ```
  Bu `migrate deploy`'u **kırmıyor** (deploy artık `arkesoft_migrator`, tablonun
  sahibi, ile koşuyor — yetki sınırı ondan bağımsız) ama çalışma zamanı uygulama
  rolünün Prisma'nın kendi migration defterine yazabilmesi bir en-az-yetki
  sapmasıdır (örn. API katmanında bir SQL enjeksiyonu bu deftere satır
  ekleyip/silebilir). `catalog-lint.ts`'in `EXEMPT_TABLES`/`lintAppRoleDmlPrivileges`
  mekanizması bu tabloyu zaten linte dahil etmiyor (taksonomi dışı), yani bu
  AC9'un/19 kuralın kapsadığı bir yüzey değil — bilinçli bir tasarım boşluğu
  gibi görünüyor (test fixture'ında da `healthySnapshot()` bu grant'i "sağlıklı"
  kabul ediyor), **regresyon değil**, var olan bir tasarım kararı. Tenant
  izolasyonunu etkilemiyor (platform seviyesi, tenant_id taşımıyor).
  **Sorumlu ajan:** `db` (v0.0.14 borcu olarak değerlendirilebilir — `_prisma_migrations`
  için ayrı bir dar `REVOKE`).

---

## 19 kuralın test kapsaması: **19/19** (tur 1'de 17/17 idi)

```
grep -o "findingsOf(findings, '[A-Z_]*')" catalog-lint.test.ts | ... | sort -u
→ 18 farklı kural (APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS, APP_ROLE_MISSING_DML_PRIVILEGE,
  APP_ROLE_OWNS_TABLE, MISSING_TABLE, MISSING_TENANT_ID_COLUMN,
  MISSING_TENANT_ID_LEADING_INDEX, MISSING_TENANT_POLICY, NULLABLE_TENANT_ID_COLUMN,
  POLICY_MISSING_WITH_CHECK, POLICY_RESTRICTED_TO_ROLE, POLICY_USING_WRONG_SETTING,
  POLICY_WITH_CHECK_WRONG_SETTING, RLS_NOT_ENABLED, RLS_NOT_FORCED,
  TENANT_ID_ON_PLATFORM_TABLE, TENANT_ID_WITHOUT_TAXONOMY_ENTRY, UNCLASSIFIED_TABLE,
  WRONG_TENANT_ID_TYPE)
+ EMPTY_CATALOG_SNAPSHOT (satır 406, ayrı assertion biçimiyle test ediliyor)
= 19/19
```

`WITH CHECK (true)` fixture'ı **çift yönlü** doğrulandı
(`catalog-lint.test.ts:247-260`):

- Bozuk politika (`USING` doğru GUC, `WITH CHECK (true)`) → `POLICY_WITH_CHECK_WRONG_SETTING`
  **üretiyor** (tur 1'de bu kaçıyordu, `[]` dönüyordu).
- Taban (sağlıklı, bugünkü gerçek migration'ı modelleyen) anlık görüntü hâlâ
  **hiçbir bulgu üretmiyor** (`catalog-lint.test.ts:116-118`).
- `POLICY_USING_WRONG_SETTING`/`POLICY_WITH_CHECK_WRONG_SETTING`/
  `POLICY_MISSING_WITH_CHECK` birbirini **ikinci kez** tetiklemiyor (gürültü
  kontrolü, satır 258-271 ile ayrıca doğrulandı).

`POLICY_RESTRICTED_TO_ROLE` (yeni kural, `policies.roles` artık tüketiliyor) için
de ayrı pozitif test var (satır 273-281).

---

## AC2–AC10 gerileme taraması (tur 1'de PASS verilenler)

| AC   | Tur 1 | Tur 2    | Not                                                                                                                                                                                                                                                             |
| ---- | ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC2  | PASS  | **PASS** | Üç sorgu taze konteynerde TEKRAR doğrulandı (yukarıda) + `tenant-membership.isolation.test.ts` senaryo 7 (8 test, hepsi geçti)                                                                                                                                  |
| AC3  | PASS  | **PASS** | `catalog-lint-live.isolation.test.ts` artık 5 test (vaka a/b/c + yetim tablo kontrolü) — tur 1'deki 2 vakaya **vaka (c)** (R-C2) eklendi, gerileme yok, genişleme                                                                                               |
| AC4  | PASS  | **PASS** | Mekanik grep (`ci.yml`) + çalışma zamanı testi (`tenant-context-injection.qa.test.ts`, QA tur 1'den korunuyor, 2/2 geçti) + yeni `no-restricted-syntax` ESLint kuralı `computed` erişimle `$queryRawUnsafe` atlatmasını da kapatıyor (elle doğrulandı, aşağıda) |
| AC5  | PASS  | **PASS** | Üç sorgu taze konteynerde tekrar doğrulandı                                                                                                                                                                                                                     |
| AC6  | PASS  | **PASS** | `createTenantIsolationSuite()` 7 senaryo × 1 prob + prob tamlığı testi = 8/8 geçti; senaryo 2 (WITH CHECK ihlali) hâlâ `rejects.toThrow()` ile sağlam                                                                                                           |
| AC7  | PASS  | **PASS** | `errors 35 + db 141 + api 115 = 291` ≥ 262 taban; `skip/only/todo` taraması tek, gerekçeli, platform-koşullu eşleşme (`migration-sql.test.ts:630`) — yeni yok                                                                                                   |
| AC9  | PASS  | **PASS** | `lintCatalog` taksonomiyi parametre olarak alıyor (kod değişmeden), `createTenantIsolationSuite`'in "prob tamlığı" kapısı değişmedi                                                                                                                             |
| AC10 | PASS  | **PASS** | `pnpm db:seed`/`pnpm db:verify` taze konteynerde (bootstrap→deploy→seed sırasıyla) baştan sona başarıyla koşuldu — tur 1'de bu yalnızca ÖNCEDEN migrasyonlanmış DB'de doğrulanmıştı, şimdi gerçek geçiş senaryosunda da doğrulandı                              |
| AC1  | FAIL  | **PASS** | yukarıda — kapandı                                                                                                                                                                                                                                              |
| AC8  | FAIL  | **PASS** | yukarıda — kapandı                                                                                                                                                                                                                                              |

**Gerileme YOK.** AC3 ve AC6 genişledi (yeni senaryolar), diğerleri değişmeden geçti.

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ:** yukarıdaki tablo — **10/10 PASS**.

**TEST SAYILARI (gerçekten koşuldu, `turbo --force`, cache bypass):**

- `pnpm test` (forced): 7/7 görev — `@arkesoft/errors` 35, `@arkesoft/db` 141,
  `@arkesoft/api` 115 → **toplam 291**, 0 başarısız, 0 yeni `skip`.
- `pnpm test:isolation` (forced): 5/5 görev — `@arkesoft/db` 2 dosya, **13 test**,
  0 başarısız.
- İki kez art arda koşturuldu (`packages/db` test + test:isolation) — **flaky
  davranış yok**, sonuçlar birebir aynı.
- `grep -rn "\.skip\|\.todo\|\.only" --include="*.test.ts" packages apps` →
  1 eşleşme, tur 1'den devralınan `migration-sql.test.ts:630`
  (`it.skipIf(platform==='win32')`), dokunulmamış.

**KOŞTURULAN KOMUTLAR:**

| Komut                                                                                 | Exit           | Özet                                                                                                                          |
| ------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npx turbo run lint --force`                                                          | 0              | 15/15                                                                                                                         |
| `npx turbo run typecheck --force`                                                     | 0              | 15/15                                                                                                                         |
| `npx turbo run build --force`                                                         | 0              | 12/12                                                                                                                         |
| `npx turbo run test --force`                                                          | 0              | 7/7 görev, 291 test                                                                                                           |
| `npx turbo run test:isolation --force`                                                | 0              | 5/5 görev, 13 test                                                                                                            |
| `pnpm format:check`                                                                   | 0              | temiz                                                                                                                         |
| Fresh Postgres (port 15433) — `bootstrap-roles.js`                                    | 0              | rol/sahiplik/GRANT kuruldu                                                                                                    |
| Fresh Postgres — `run-guarded-prisma.js migrate deploy`                               | **0**          | RLS migration'ı dahil 2 migration uygulandı — **tur 1'in kritik bulgusu KAPANDI**                                             |
| Fresh Postgres — `run-guarded-prisma.js db seed`                                      | 0              | demo tenant/kullanıcı kuruldu                                                                                                 |
| Fresh Postgres — AC2/AC5 üç sorgu (×2, bootstrap sonrası + seed sonrası)              | n/a            | `f\|f`, `t\|t`, 0 satır — birebir                                                                                             |
| Fresh Postgres — `migrate dev`/`db push`/`db seed` + `NODE_ENV=production`            | 1 (her biri)   | üçü de doğru şekilde reddedildi — regresyon yok                                                                               |
| Fresh Postgres — `migrate deploy` + `NODE_ENV=production`                             | **0**          | doğru şekilde İSTİSNA (muaf) — tasarım amacı doğrulandı                                                                       |
| Fresh Postgres — `migrate resolve` (bilinmeyen komut)                                 | 1              | reddedildi                                                                                                                    |
| Fresh Postgres — `migrate deploy --accept-data-loss`                                  | 1              | reddedildi (allowedFlags: [])                                                                                                 |
| `arkesoft_app` ile `_prisma_migrations` INSERT/DELETE                                 | 0/0 (başarılı) | [low] bulgusunun ampirik kanıtı                                                                                               |
| `arkesoft_app` ile `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`                       | hata           | "must be owner of table" — sahiplik sınırı sağlam                                                                             |
| ESLint scratch dosyası — `client['$queryRawUnsafe'](...)` (computed erişim)           | n/a            | `no-restricted-syntax` KIRMIZI verdi — AC4'ün ESLint genişletmesi doğrulandı; dosya test sonrası SİLİNDİ (`git status` temiz) |
| `pnpm --filter @arkesoft/db exec vitest run` (×2, art arda)                           | 0/0            | 141/141, flaky yok                                                                                                            |
| `pnpm --filter @arkesoft/db exec vitest run --config vitest.isolation.config.ts` (×2) | 0/0            | 13/13, flaky yok                                                                                                              |

**Temizlik:** `docker rm -f qa-tur2-fresh-pg` ile atılabilir konteyner kaldırıldı;
`arkesoft-postgres` (mevcut geliştirme DB'si) hiçbir noktada dokunulmadı. ESLint
scratch dosyası (`apps/api/src/__qa_scratch_unsafe.ts`) test sonrası silindi,
`git status` ile iz kalmadığı doğrulandı. Hiçbir mevcut dosya `checkout`/`restore`
ile geri alınmadı (gerek kalmadı — hiçbir mevcut dosya değiştirilmedi).

---

## KAPSAM DIŞI / DEVAM EDEN TEKNİK BORÇ (bilgi notu, bulgu değil)

- `security` tur 1'in 2 medium + 5 low'u bu turda tekrar listelenmedi (ayrı
  bulgu kümesi, FIX turu 1'in dağıtımında QA'ya değil `db`/`devops`/`docs`'a
  dağıtılmıştı — AGENT_BASELINE'a göre QA kendi gate'inin bulgularını raporlar).
- `migration-sql.test.ts:630` `it.skipIf(win32)` — T-004'ten devralınan,
  dokunulmamış, gerekçeli.

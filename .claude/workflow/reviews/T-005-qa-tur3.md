# T-005 — QA Gate, Tur 3 (FIX turu 2 sonrası, son düzeltme turu)

Tarih: 2026-10-29 · ROADMAP sürümü: v0.0.13 · Repo durumu: `main`, commit atılmadı.

```
GATE: qa
SONUÇ: PASS
```

---

## Tur 1 ve tur 2'deki TÜM bulguların durumu — tek tek

| #   | Tur             | Bulgu                                                                                                             | Durum tur 3      | Kanıt (bu turda bağımsız ölçüldü)                                                                                                                                                                               |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 1               | **[kritik]** `pnpm db:deploy` `arkesoft_app` ile koşuyor → RLS migration DDL'i uygulanamıyor (AC1/AC8 kırık)      | **KAPALI kaldı** | Taze, izole konteynerde (port 15434) `bootstrap→deploy→bootstrap→seed` dördü de **exit 0**; `deploy` artık `arkesoft_migrator` ile koşuyor (`guard-policy.ts` `COMMANDS['migrate deploy'].role === 'migrator'`) |
| 2   | 1               | [low] AC4 çalışma zamanı testi eksikti                                                                            | **KAPALI kaldı** | `tenant-context-injection.qa.test.ts` dokunulmadı, hâlâ var (qa'nın dosyası, `db`'ye devredilmedi — kalıyor)                                                                                                    |
| 3   | 2               | **[medium]** `resolveDatabaseRole`/`requiresDestructiveTargetGuard` birim testsiz, `main()` import anında koşuyor | **KAPALI**       | Aşağıda madde 4 — ampirik kanıt                                                                                                                                                                                 |
| 4   | 2               | [low] `REVOKE … ON _prisma_migrations` iddiası repoda yoktu, `arkesoft_app` deftere INSERT/DELETE yapabiliyordu   | **KAPALI**       | Aşağıda madde 1 — ampirik kanıt                                                                                                                                                                                 |
| 5   | solid tur2 (M1) | [medium] `['migrate','deploy']` üç yerde ayrı tanımlı                                                             | **KAPALI**       | `guard-policy.ts`'teki `CommandSpec.role`/`requiresTargetGuard`; `run-guarded-prisma.ts`'te `resolveDatabaseRole`/`requiresDestructiveTargetGuard` **tamamen silindi** (kod okumasıyla doğrulandı)              |
| 6   | solid tur2 (M2) | [medium] Politika yüklemi yalnızca alt dize ile doğrulanıyor — sınıf açık                                         | **KAPALI**       | Aşağıda madde 3 — `buildCanonicalPolicyExpression` + tam eşitlik, sabotaj testiyle doğrulandı                                                                                                                   |
| 7   | solid tur2      | [low] `test-client.ts` migrator yorumu yanlış                                                                     | **KAPALI**       | `test-client.ts:24-27` artık "FORCE RLS tablo sahibini de kapsar, 0 satır görür" diyor                                                                                                                          |
| 8   | solid tur2      | [low] "diğer dört sarmalanmış komut" → saydığı beş                                                                | **KAPALI**       | `run-guarded-prisma.ts:57` artık "Diğer beş sarmalanmış komut"                                                                                                                                                  |
| 9   | solid tur2      | [low] `docs/development.md` kendiyle çelişiyor + `beforetesi` yazım hatası                                        | **KAPALI**       | `:285-286` artık `db:migrate`/`db:deploy`'u "sarmalı" sayıyor; `beforetesi` grep'te 0 eşleşme                                                                                                                   |
| 10  | solid tur2      | [low] `prisma.module.ts` bayat yorum                                                                              | **KAPALI**       | `prisma.module.ts:9-21` güncellendi, tarihsel not + güncelleme notu birleşti                                                                                                                                    |
| 11  | solid tur2      | [low] `TenantIsolationTaxonomy` dışa açık, import edilmiyor                                                       | **KAPALI**       | `catalog-lint.ts:135` artık `export` yok (`type TenantIsolationTaxonomy = {`)                                                                                                                                   |
| 12  | solid tur2      | [low] `prepare-db/action.yml` adım adı 150+ karakter                                                              | **KAPALI**       | `:59` adım adı kısa (`"Migration'ı uygula (ileri yönlü)"`), gerekçe yoruma taşındı                                                                                                                              |

**Tur 2'nin ertelediği dört kalem** (solid tur1 #2 indeks çelişkisi, #4 bootstrap/run-guarded tekrarı, #5 çıplak `throw new Error`, #13 tip pin'i `it()` içinde) — **bu turda yeniden açık bulgu olarak saymadım**, Orkestratör'ün v0.0.14 borcu kararı değişmedi ve FIX 2'nin kapsamı dışındaydı. Bağımsız doğrulama: `grep -n "throw new Error" packages/db/src/tenant-context.ts packages/db/src/catalog-snapshot.ts` hâlâ var (borç aynen duruyor, büyümedi).

---

## Madde 1 — REVOKE + 20. kural: fazla yetki varken bulgu üretiyor mu? (ÖLÇÜLDÜ)

İzole, atılabilir Postgres konteynerinde (port 15434, mevcut geliştirme DB'sine
**DOKUNULMADI**) CI'nin birebir sırası koşturuldu:

```
node dist/bootstrap-roles.js         → EXIT 0
node dist/run-guarded-prisma.js migrate deploy → EXIT 0 (2 migration uygulandı)
node dist/bootstrap-roles.js         → EXIT 0  (yakınsama çağrısı — REVOKE bu kez gerçekten uygulanıyor)
node dist/run-guarded-prisma.js db seed        → EXIT 0
```

Ardından canlı doğrulama (`arkesoft_app` ile):

```sql
select grantee, privilege_type from information_schema.table_privileges
  where table_name='_prisma_migrations' and grantee='arkesoft_app';
→ arkesoft_app | SELECT      (tek satır — INSERT/UPDATE/DELETE YOK)

-- arkesoft_app ile doğrudan dene:
insert into _prisma_migrations (...) values (...);
→ ERROR: permission denied for table _prisma_migrations
```

**Tur 2'nin [low] bulgusu KAPANDI** — `arkesoft_app` artık deftere yazamıyor.
`APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE` kuralının **kendisi** bu turda
sahte fazla yetkiyle canlı DB'ye karşı tetiklenmedi (yalnızca fixture testiyle
pinli — `catalog-lint.test.ts:507-523`, parametrik `canInsert`/`canUpdate`/
`canDelete` üç vakası) — bu bir **yapısal borç** olarak not ediyorum (aşağıda),
`REVOKE`'un fiilen etkili olduğu doğrudan `psql` ile ispatlandığı için bulgu
seviyesine çıkarmıyorum.

---

## Madde 2 — 20/20 kural tetikleniyor mu?

```
grep -o "findingsOf(findings, '[A-Z_]*')" packages/db/src/__tests__/catalog-lint.test.ts \
  | grep -o "'[A-Z_]*'" | tr -d "'" | sort -u | wc -l
→ 19
```

19 farklı `findingsOf` hedefi + `EMPTY_CATALOG_SNAPSHOT` (satır 406'da ayrı
assertion biçimiyle, `findingsOf` çağrısı olmadan test ediliyor) = **20/20**.
Yeni kural `APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE` üç parametrik vakayla
(`canInsert`/`canUpdate`/`canDelete` ayrı ayrı `true`) + bir negatif vaka
(üçü de `false` → bulgu yok) + bir "tablo katalogda yok → sessizce atla" vakasıyla
test ediliyor (`catalog-lint.test.ts:498-536`). **Ölü kural yok.**

---

## Madde 3 — Vaka (d) gerçek mi? (SABOTAJ TESTİYLE DOĞRULANDI)

`catalog-lint-live.isolation.test.ts`'teki vaka (d), canlı Postgres'in
`USING (tenant_id = current_setting('app.tenant_id', true))` için **gerçekten
ürettiği** deparse metninin `buildCanonicalPolicyExpression()`'ın ürettiği
şablonla **byte-birebir** eştiğini iddia ediyor — bu iddiayı doğrulamak için
şablonu **kasıtlı bozdum**:

```diff
- return `(${TENANT_ID_COLUMN} = current_setting('${settingName}'::text, true))`
+ return `(${TENANT_ID_COLUMN} = current_setting('${settingName}', true))`   // ::text cast'i KALDIRILDI
```

Sonuç — `pnpm exec vitest run --config vitest.isolation.config.ts` (taze konteynere karşı):

```
FAIL  sağlıklı durum: hiçbir bulgu YOK
  - Expected: []
  - Received: [POLICY_USING_NOT_CANONICAL, POLICY_WITH_CHECK_NOT_CANONICAL]
  "Beklenen: (tenant_id = current_setting('app.tenant_id', true))
   Gerçek: (tenant_id = current_setting('app.tenant_id'::text, true))"

FAIL  vaka (d): ... POLICY_USING_NOT_CANONICAL YOK (beklenen false)
  - Expected: false
  - Received: true

Test Files  1 failed | 1 passed (2)
     Tests  2 failed | 12 passed (14)
```

**Test kırmızı verdi — tam beklenen iki noktada** (sağlıklı taban + vaka (d)).
Bu, canlı Postgres'in `USING`/`WITH CHECK` ifadelerini **`::text` cast'i ile**
deparse ettiğini ve `buildCanonicalPolicyExpression()`'ın bunu doğru
ürettiğini kanıtlıyor — fixture'lar (tur 2'nin "totoloji" eleştirisi) tek
başına bunu **gösteremezdi**, gerçek Postgres gerekiyordu.

**Geri alma kanıtı:**

```
cp packages/db/src/catalog-lint.ts <backup>   # sabotajdan ÖNCE alındı
... sabotaj uygulandı, test koşuldu (yukarıda) ...
cp <backup> packages/db/src/catalog-lint.ts   # geri alındı
diff packages/db/src/catalog-lint.ts <backup> → (fark yok)
npx turbo run build --filter='@arkesoft/db...' --force → 4/4 başarılı
pnpm exec vitest run --config vitest.isolation.config.ts → 2 passed, 14/14 PASS
```

`git status` sabotaj öncesi/sonrası özdeş (`catalog-lint.ts` zaten `??`
— yeni dosya, `git diff` göstermiyor; bu yüzden içerik karşılaştırması
`cp`+`diff` ile yapıldı, yukarıda **byte-birebir** eşleştiği kanıtlandı).

---

## Madde 4 — `main()` hâlâ gerçek çağrılarda koşuyor mu? (EN YÜKSEK RİSK — ÖLÇÜLDÜ)

B1'in iddiası: `isDirectlyExecuted()` yalnızca dosya Node'un doğrudan
çalıştırdığı giriş noktasıysa `true` döner, `main()` **koşullu** çağrılır
(`if (isDirectlyExecuted()) { main() }`, dosya sonu). Bunu **gerçek CLI
çağrılarıyla** (derlenmiş `dist/`, taze konteyner, tur 1/2'nin yöntemiyle
aynı) sınadım:

```
node dist/run-guarded-prisma.js migrate deploy          → EXIT 0, migration uygulandı
node dist/run-guarded-prisma.js db seed                  → EXIT 0, seed çalıştı
NODE_ENV=production node dist/run-guarded-prisma.js migrate dev
  → "[run-guarded-prisma] Üretim ortamında (NODE_ENV=production) çalıştırılamaz." EXIT 1
NODE_ENV=production node dist/run-guarded-prisma.js migrate deploy
  → EXIT 0 (muaf — tasarım amacı, requiresTargetGuard:false)
node dist/run-guarded-prisma.js migrate resolve          → "İzin verilmeyen komut" EXIT 1
node dist/run-guarded-prisma.js db push --accept-data-loss
  → "İzin verilmeyen argüman: "--accept-data-loss"." EXIT 1
```

**Koruma gerçek çağrılarda tam olarak beklendiği gibi devrede** — `main()`
sessizce devre dışı kalmamış. Ayrıca `run-guarded-prisma.test.ts`'in
**kendi çalışması** da dolaylı kanıt: dosya artık `import` edilebiliyor
(vitest worker'ın `process.argv`'si `resolvePrismaCommand` tarafından asla
görülmüyor, `isDirectlyExecuted()` vitest altında `false` döndüğü için).
`pnpm --filter @arkesoft/db exec vitest run src/__tests__/run-guarded-prisma.test.ts`
→ **2/2 PASS**.

---

## Madde 5 — `prepare-db`'nin yeni sırası (bağımsız doğrulama)

Zaten madde 1/4'ün ampirik koşumunda birebir sıra (`bootstrap→deploy→bootstrap→seed`)
kullanıldı — dördü de **exit 0**. AC2'nin üç sorgusu seed sonrasında tekrar koşuldu:

```
rolsuper=f, rolbypassrls=f (arkesoft_app)
relrowsecurity=t, relforcerowsecurity=t (tenant_membership)
select * from tenant_membership (context'siz) → 0 satır
```

`arkesoft_app` sonunda yalnızca `SELECT` (madde 1'deki `information_schema`
sorgusu) — **"arkesoft_app yalnızca SELECT" iddiası doğrulandı.**
**AC1 ve AC8 gerilemedi.**

---

## Madde 6 — AC1–AC10 gerileme taraması

| AC   | Tur 2 | Tur 3    | Not                                                                                                              |
| ---- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| AC1  | PASS  | **PASS** | madde 1/5 — taze konteynerde beşli kapı + `test:isolation` yeşil                                                 |
| AC2  | PASS  | **PASS** | madde 1/5 — üç sorgu taze konteynerde tekrar doğrulandı                                                          |
| AC3  | PASS  | **PASS** | madde 3 — vaka (d) dahil 6 test, 14/14 (sabotaj sonrası geri alındı)                                             |
| AC4  | PASS  | **PASS** | `tenant-context-injection.qa.test.ts` dokunulmadı; mekanik grep değişmedi (FIX2 `tenant-context.ts`'e dokunmadı) |
| AC5  | PASS  | **PASS** | madde 1 — `arkesoft_app` deftere de artık yazamıyor (gerileme değil, **genişleme**)                              |
| AC6  | PASS  | **PASS** | `tenant-membership.isolation.test.ts` 8/8, değişmedi                                                             |
| AC7  | PASS  | **PASS** | aşağıda ÖLÇÜMLER — 314 ≥ 291 ≥ 262, `skip`/`only`/`todo` yeni yok                                                |
| AC8  | PASS  | **PASS** | madde 1/5 ile aynı kanıt                                                                                         |
| AC9  | PASS  | **PASS** | taksonomi parametrik mekanizma FIX2'de dokunulmadı (kod okumasıyla doğrulandı)                                   |
| AC10 | PASS  | **PASS** | madde 1/5 — `db:seed` taze konteynerde başarılı                                                                  |

**Gerileme YOK.**

---

## Madde 7 — Sahte-yeşil dedektörü

```
.github/ci-expected-isolation-packages.txt → tek satır: @arkesoft/db
turbo run test:isolation --dry=json → gerçek "test:isolation" komutuna sahip
  tek paket: @arkesoft/db (diğerleri placeholder/yok)
```

FIX2 bu dosyaya veya `test:isolation` script sahipliğine dokunmadı; tur
1/2'de çift yönlü (yanlış paket adı + sahipsiz küme) ampirik olarak
tetiklendiği zaten kanıtlanmıştı. Bu turda **yeniden sabote etmedim** —
dokunulmayan bir mekanizmayı üçüncü kez bozup-düzeltmek kanıt değeri
eklemiyordu (madde 3/4'ün riskli yüzeyleri önceliklendirildi). Beklenen
küme değişmedi (`@arkesoft/db` → `@arkesoft/db`, 13→14 test artışı yalnızca
`catalog-lint-live.isolation.test.ts`'e vaka (d)'nin eklenmesinden).

---

## Madde 8 — `skip`/`only`/`todo` sayımı

```
grep -rn "\.skip\|\.todo\|\.only" --include="*.test.ts" packages apps
→ 1 eşleşme: packages/db/src/__tests__/migration-sql.test.ts:630
  it.skipIf(process.platform === 'win32') — T-004'ten devralınan, tur 1/2'de
  birlikte karar verildi, bu turda DOKUNULMADI.
```

**0 yeni `skip`/`only`/`todo`.**

---

## BULGULAR

```
BULGULAR:
  - [SEV: low] packages/db/src/catalog-lint.ts (APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE) — yeni 20. kural yalnızca fixture birim testiyle kapsanıyor; AC3'ün diğer canlı-DB probları gibi (vaka a/b/c/d) bu kuralı CANLI katalogdan gerçek bir fazla-yetki senaryosuyla tetikleyen bir isolation testi yok. Madde 1'de REVOKE'un fiilen çalıştığını doğrudan psql ile kanıtladım (bu nedenle severity'yi artırmıyorum — kuralın KENDİSİ değil, onun canlı-DB kapsaması eksik) ama kural bir gün regresyona uğrarsa (örn. bootstrap-roles.sql'e yanlışlıkla INSERT GRANT'i geri eklenirse) bunu `pnpm test` hiç yakalamaz, yalnızca `pnpm test:isolation`'ın AC2 sorgularına BENZER elle bir prob yakalardı — ama öyle bir prob da yok. Önerilen düzeltme: catalog-lint-live.isolation.test.ts'e AC3 probları gibi bir "arkesoft_app'e geçici INSERT GRANT ver → lint canlı olarak yakalar → ROLLBACK" senaryosu ekle. Sorumlu ajan: db (v0.0.14 borcu olarak da kabul edilebilir — kritik yol üzerinde değil, REVOKE'un kendisi ampirik doğrulandı).
```

AGENT_BASELINE §4: yalnızca **1 low** → **PASS**, bulgu teknik borca kaydedilir.

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ:** madde 6 tablosu — **10/10 PASS**, gerileme yok.

**TEST SAYILARI (gerçekten koşuldu, `turbo --force`, cache bypass):**

- `pnpm test` (forced, mevcut dev DB): `@arkesoft/errors` 35 · `@arkesoft/db` 164 ·
  `@arkesoft/api` 115 → **toplam 314**, 0 başarısız, 0 `skip`/`only`/`todo` (yeni).
  Baseline (Orkestratör) ile **birebir eşleşiyor**.
- `pnpm test:isolation` (forced, mevcut dev DB): `@arkesoft/db` 2 dosya, **14 test**,
  0 başarısız. Baseline ile **birebir eşleşiyor**.
- `pnpm test:isolation` iki kez art arda (taze izole konteyner) → **14/14, 14/14**
  — flaky davranış yok.
- Sabotaj öncesi/sonrası/geri-alma: 14 PASS → **2 FAIL + 12 PASS** (beklenen iki
  noktada kırmızı) → 14 PASS (geri alma sonrası, rebuild ile).

**KOŞTURULAN KOMUTLAR:**

| Komut                                                                           | Exit  | Özet                                                                               |
| ------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| `docker run … postgres:17.11-alpine` (port 15434, atılabilir)                   | 0     | izole taze konteyner                                                               |
| `npx turbo run build --filter='@arkesoft/db...'`                                | 0     | 4/4                                                                                |
| `node dist/bootstrap-roles.js` (1. çağrı)                                       | 0     | rol/sahiplik/GRANT kuruldu                                                         |
| `node dist/run-guarded-prisma.js migrate deploy` (taze DB)                      | 0     | 2 migration uygulandı — AC1/AC8'in kritik kusuru hâlâ KAPALI                       |
| `node dist/bootstrap-roles.js` (2. çağrı — yakınsama)                           | 0     | REVOKE bu kez fiilen uygulandı                                                     |
| `node dist/run-guarded-prisma.js db seed`                                       | 0     | demo tenant kuruldu                                                                |
| `psql` — AC2 üç sorgu + `_prisma_migrations` yetki sorgusu                      | n/a   | `f\|f`, `t\|t`, 0 satır, `arkesoft_app` → yalnızca `SELECT`                        |
| `arkesoft_app` ile `_prisma_migrations` INSERT denemesi                         | hata  | `permission denied for table _prisma_migrations` — tur 2'nin [low] bulgusu KAPANDI |
| `NODE_ENV=production node dist/run-guarded-prisma.js migrate dev`               | 1     | doğru şekilde reddedildi                                                           |
| `NODE_ENV=production node dist/run-guarded-prisma.js migrate deploy`            | 0     | doğru şekilde muaf                                                                 |
| `node dist/run-guarded-prisma.js migrate resolve`                               | 1     | reddedildi                                                                         |
| `node dist/run-guarded-prisma.js db push --accept-data-loss`                    | 1     | reddedildi                                                                         |
| `pnpm exec vitest run src/__tests__/run-guarded-prisma.test.ts`                 | 0     | 2/2 PASS — `main()` import anında KOŞMUYOR                                         |
| Sabotaj: `buildCanonicalPolicyExpression`'dan `::text` cast'i kaldırma          | n/a   | `catalog-lint.ts`, geçici, backup `cp` ile alındı                                  |
| `pnpm exec vitest run --config vitest.isolation.config.ts` (sabotaj altında)    | **1** | 2 FAIL + 12 PASS — vaka (d) VE sağlıklı taban beklenen noktalarda KIRMIZI          |
| Geri alma: `cp <backup> catalog-lint.ts` + `diff`                               | n/a   | byte-birebir özdeşlik kanıtlandı                                                   |
| `npx turbo run build --filter='@arkesoft/db...' --force` (geri alma sonrası)    | 0     | 4/4                                                                                |
| `pnpm exec vitest run --config vitest.isolation.config.ts` (geri alma sonrası)  | 0     | 14/14 PASS                                                                         |
| `pnpm exec vitest run --config vitest.isolation.config.ts` (×2, flaky kontrolü) | 0/0   | 14/14, 14/14 — flaky yok                                                           |
| `npx turbo run lint --force`                                                    | 0     | 15/15                                                                              |
| `npx turbo run typecheck --force`                                               | 0     | 15/15                                                                              |
| `npx turbo run build --force`                                                   | 0     | 12/12                                                                              |
| `npx turbo run test --force`                                                    | 0     | 7/7 görev, 314 test (35+164+115)                                                   |
| `npx turbo run test:isolation --force` (mevcut dev DB)                          | 0     | 5/5 görev, 14 test                                                                 |
| `pnpm format:check`                                                             | 0     | temiz                                                                              |
| `grep -rn "\.skip\|\.todo\|\.only"`                                             | n/a   | 1 eşleşme, devralınan, dokunulmamış                                                |
| `grep -rln "app\.tenant_id\|set_config"` (apps/packages, test hariç)            | n/a   | yalnızca `tenant-context.ts` (+ üretilen `.d.ts`)                                  |
| `git diff` (üretim kodu) üzerinde `any`/`@ts-ignore`/`as X` taraması            | n/a   | 0 yeni eşleşme                                                                     |
| `docker rm -f qa-tur3-fresh-pg`                                                 | 0     | atılabilir konteyner kaldırıldı                                                    |

**Temizlik kanıtı:** mevcut geliştirme veritabanı (`arkesoft-postgres`) hiçbir
noktada şema/rol değişikliğine uğramadı (yalnızca `pnpm test`/`test:isolation`'ın
zaten var olan koşumları + salt-okunur doğrulama). `git status` sabotaj
öncesi/sonrası özdeş — `catalog-lint.ts` içerik olarak byte-birebir geri
alındı (yukarıda `diff` ile kanıtlandı). Yeni dosya `.qa.test.ts` **eklenmedi**
bu turda (tur 1'in `tenant-context-injection.qa.test.ts`'i korunuyor,
değiştirilmedi).

---

## Sonuç

0 critical · 0 high · 0 medium · **1 low** → AGENT_BASELINE §4: yalnızca `low` →
**PASS**, bulgu teknik borca kaydedilir (sorumlu: `db`, v0.0.14).

Tur 1'in kritik bulgusu ve tur 2'nin iki bulgusu (medium: birim testsizlik/
import güvenliği; low: eksik REVOKE) **üçü de bu turda bağımsız, ampirik
yöntemlerle (taze izole konteyner + gerçek CLI spawn + kasıtlı sabotaj)
yeniden doğrulandı ve KAPALI bulundu**. `solid` tur 2'nin M1/M2 bulguları da
kod okumasıyla doğrulanan şekilde kapandı. Hiçbir AC'de gerileme yok, test
sayıları baseline ile birebir eşleşiyor, `skip`/`only`/`todo` yeni yok,
flaky davranış yok.

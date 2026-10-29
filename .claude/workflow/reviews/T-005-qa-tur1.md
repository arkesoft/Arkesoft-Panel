# T-005 — QA Gate, Tur 1

Tarih: 2026-10-28 · ROADMAP sürümü: v0.0.13 · Repo durumu: `main`, commit atılmadı.

GATE: qa
SONUÇ: FAIL

---

## BULGULAR

- **[SEV: critical] `packages/db/prisma.config.ts:21` + `packages/db/package.json` (`"deploy"` betiği) + `.github/actions/prepare-db/action.yml:56-58`** —
  `pnpm db:deploy` (`prisma migrate deploy`), `DATABASE_URL`'i (`arkesoft_app`, hiçbir tablonun sahibi değil, `NOCREATEDB`, şemada yalnızca `USAGE`) kullanıyor; bu rolle **hiçbir DDL çalıştırılamaz**. v0.0.13'ün RLS migration'ı (`ALTER TABLE … ENABLE/FORCE ROW LEVEL SECURITY`, `CREATE POLICY`) **DDL'dir** ve yalnızca tablo sahibi `arkesoft_migrator` (`DATABASE_MIGRATION_URL`) tarafından çalıştırılabilir. `run-guarded-prisma.ts`'in rol çözümleme mantığı `migrate dev`/`migrate reset`/`db push` için doğru şekilde `migrator`'a yönlendiriyor — ama `deploy` **bilerek bu sarmalayıcının dışında tutulmuş** (dosya başı yorumu: _"migrate deploy — üretimde çalışmak ZORUNDA; deploy script'i ayrı ve AYNEN kalır"_). Bu yorum v0.0.12'deki (rol ayrımı öncesi, tek süper kullanıcı rolü) dünya için doğruydu; v0.0.13'ün `DATABASE_URL`'i artık en az yetkili role işaret ediyor (K-E8 "fail-safe varsayılan") ve kimse `deploy` yolunu buna göre güncellemedi.

  **AMPİRİK KANIT (tek kullanımlık, izole, atılabilir bir Postgres konteynerinde doğrulandı — mevcut geliştirme veritabanına DOKUNULMADI):**

  ```
  docker run -d --name qa-fresh-pg -e POSTGRES_USER=arkesoft \
    -e POSTGRES_PASSWORD=arkesoft_dev_only -e POSTGRES_DB=arkesoft \
    -p 15432:5432 postgres:17.11-alpine

  DATABASE_URL=...arkesoft_app...15432... \
  DATABASE_MIGRATION_URL=...arkesoft_migrator...15432... \
  DATABASE_BOOTSTRAP_URL=...arkesoft...15432... \
  pnpm --filter @arkesoft/db run bootstrap   # ✅ başarılı

  pnpm --filter @arkesoft/db run deploy      # ❌
  # Error: ERROR: permission denied for schema public
  #    0: sql_schema_connector::sql_migration_persistence::initialize
  ```

  Ayrıca doğrudan: `arkesoft_app` ile `ALTER TABLE tenant_membership ENABLE ROW LEVEL SECURITY;` →
  `ERROR: must be owner of table tenant_membership`.

  **Neden mevcut geliştirme ortamında gizli kaldı:** Bu repodaki gerçek Postgres'te migration muhtemelen `pnpm db:migrate` (`migrate dev`, doğru şekilde `migrator` rolüne sarmalanmış) ile uygulandı, `pnpm db:deploy` ile DEĞİL — `db:deploy`'u şimdi (var olan, migration'ı zaten uygulanmış DB'de) koşturmak "No pending migrations to apply" ile sessizce başarılı görünüyor ve kusuru MASKELİYOR.

  **Etki — AC1 ve AC8 ikisi de kırılır:**
  - **AC1**: "`ci.yml`'de job olarak koşuyor ve yeşil" — `ci.yml`'in `prepare-db` composite'i (bootstrap → **deploy** → seed) GERÇEK bir GitHub Actions `services: postgres` konteynerinde (her zaman TAMAMEN BOŞ, migration geçmişi yok) koşar. Bu konteynerde `db:deploy` **birebir bu hatayla patlar** — "api" hattı ve ona bağlı her şey CI'da kırmızı verir. S5'in "altılı kapı tam" / "pnpm test:isolation kökten yeşil" iddiası yalnızca YEREL, zaten-migrasyonlanmış bir veritabanına karşı ölçülmüş; gerçek CI runner'ında hiç doğrulanmamış.
  - **AC8**: "Mevcut geliştirici için geçiş" senaryosunun BİREBİR kendisi (`docs/development.md`: `.env`'e `DATABASE_MIGRATION_URL` ekle → `pnpm db:bootstrap` → `pnpm db:deploy` → `pnpm db:seed`) — bu sıra izlenen HER geliştirici/yeni ortam için `db:deploy` adımında aynı "permission denied" ile patlar. AC8'in "dolu/boş volume" ayrımı bu hatayla ilgisiz; belirleyici olan migration'ın DAHA ÖNCE migrator rolüyle uygulanıp uygulanmadığı.

  **Önerilen düzeltme yönü (QA üretim kodunu değiştirmez, yön bilgisi):** `deploy`'u da `run-guarded-prisma.ts`'in rol çözümlemesine (`migrator`) dahil et YA DA `prisma.config.ts`'in `datasource.url`'ini CLI bağlamında `DATABASE_MIGRATION_URL`'e çevir (runtime istemcisi zaten `prisma.config.ts`'i kullanmıyor, `client.ts` kendi `pg.Pool`'unu kuruyor — bu ayrım yapılabilir).

  **Sorumlu ajan:** `db` (birincil — `prisma.config.ts` + `packages/db/package.json` + `run-guarded-prisma.ts` sahibi). **İkincil:** `devops` (`prepare-db/action.yml`'in `db:deploy`'un gerçek CI'da çalıştığını hiç GERÇEK runner'da doğrulamadan "altılı kapı tam" ilan etmesi).

- **[SEV: low] AC4'ün çalışma zamanı (runtime) yarısı için ayrı bir test yoktu — QA tarafından KAPATILDI.**
  ROADMAP'in AC4 metni birebir iki parçalıdır: (a) mekanik statik grep (`guards` job, K-E12) — **vardı ve çalışıyordu** (aşağıda doğrulandı); (b) çalışma zamanı kanıtı — `withTenant()`'a GERÇEKTEN `x'; DROP TABLE "tenant_membership"; --` geçip 0 satır/tablo-hâlâ-var/sözdizimi-hatası-yok görmek. Bu ikinci yarı için hiçbir test yoktu. QA bunu `packages/db/src/__tests__/tenant-context-injection.qa.test.ts` (yeni dosya, 2 test) ile kapattı — gerçek Postgres'e karşı koşturuldu, ikisi de yeşil. Üretim kodu DEĞİŞMEDİ. Düşük önem: yapısal olarak (`tx.$queryRaw` etiketli şablonu) enjeksiyon zaten imkânsızdı, bu test yalnızca İSPATI ekliyor.
  **Sorumlu ajan:** `db` (gelecek turda bu dosyayı kendi test setine devralabilir) — şimdilik QA'nın eklediği test kalır.

---

## KABUL KRİTERİ EŞLEMESİ

| AC   | İçerik (özet)                                                                          | Test / Doğrulama                                                                                                                                                                                                          | Sonuç                                                                        |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| AC1  | `test:isolation` var, turbo+CI'da tanımlı, beşli kapı yeşil                            | `pnpm lint/typecheck/test/test:isolation/build` yerelde hepsi yeşil (gerçekten koşuldu, aşağıda) — **AMA** CI'nın gerçek `services: postgres` konteynerinde `prepare-db`'nin `db:deploy` adımı kritik bulguyla PATLAR     | **FAIL** (yerelde yeşil, CI'da kırmızı — sahte yeşil)                        |
| AC2  | Üç doğrulama sorgusu (`f                                                               | f`, `t                                                                                                                                                                                                                    | t`, 0 satır)                                                                 | Elle `psql` ile doğrulandı (çıktılar yukarıda) **ve** `tenant-membership.isolation.test.ts` senaryo 7 (Zod-parse, otomatik) | PASS |
| AC3  | Prob: `ENABLE` var/`FORCE` yok → kırmızı; politika yok → kırmızı                       | `catalog-lint-live.isolation.test.ts` vaka (a)/(b), gerçek CREATE TABLE + ROLLBACK, canlı Postgres                                                                                                                        | PASS                                                                         |
| AC4  | Enjeksiyon → 0 satır/tablo var/sözdizimi hatası yok + mekanik grep                     | Mekanik: `ci.yml` "AC4" adımı, QA'nın elle tetiklediği sahte ihlal ile KIRMIZI verdiği doğrulandı. Çalışma zamanı: QA'nın eklediği `tenant-context-injection.qa.test.ts` (2 test, yeşil)                                  | PASS                                                                         |
| AC5  | `arkesoft_app` 0 tablo sahibi, CREATE TABLE yetki hatası; `migrator` CREATEDB          | Elle `psql`: `count(*)=0`, `permission denied for schema public`, `rolcreatedb=t`                                                                                                                                         | PASS                                                                         |
| AC6  | İki tenant, okuma VE yazma çapraz erişim, hata sızıntısız                              | `tenant-membership.isolation.test.ts` senaryo 1 (okuma), 2 (yazma/`WITH CHECK`), 5 (sızıntısız)                                                                                                                           | PASS                                                                         |
| AC7  | `CreatePrismaClientOptions` additive + tip pin + 262 test tabanı korunuyor, `skip` yok | `type-pins/client-options.pin.ts` + gerçek sayım: `errors 35 + db 135(+2 QA) + api 115 = 287` ≥ 262; `skip`/`only`/`todo` grep → 0 (tek `it.skipIf` T-004'ten devralındı, dokunulmadı)                                    | PASS                                                                         |
| AC8  | Dolu volume + `db:deploy` sonrası AC2 geçiyor                                          | AC2 bu repodaki (önceden migrasyonlanmış) DB'de geçiyor — **AMA** `db:deploy`'un KENDİSİ migrator rolü olmadan bir migration'ı İLK kez uygulayamıyor (kritik bulgu) → AC8'in "geçiş" senaryosu birebir bu şekilde kırılır | **FAIL**                                                                     |
| AC9  | İkinci tablo eklenince linter+süit kod değişmeden kırmızı                              | `catalog-lint.test.ts` "AC9 parametriklik" + `tenant-isolation-suite.ts` "prob tamlığı" testi                                                                                                                             | PASS                                                                         |
| AC10 | `db:seed` RLS+rol ayrımı altında çalışıyor, `db:verify` yeşil                          | Elle koşturuldu: `pnpm db:seed` → başarılı (mevcut DB'de), `pnpm db:verify` → "No difference detected"                                                                                                                    | PASS (mevcut DB'de; fresh DB senaryosu AC8 bulgusuyla aynı kökten kırılıyor) |

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ:** yukarıdaki tablo — 8/10 PASS, 2/10 (AC1, AC8) FAIL.

**TEST SAYILARI (gerçekten koşuldu, `turbo --force`, cache bypass):**

- `pnpm test` (forced): 7/7 görev başarılı — `@arkesoft/errors` 35, `@arkesoft/db` 135, `@arkesoft/api` 115 → **toplam 285**, 0 başarısız, 0 `skip`.
- QA'nın eklediği yeni test dosyası sonrası: `@arkesoft/db` 135 → **137** (yeniden koşuldu, doğrulandı); repo toplamı 285 → **287**.
- `pnpm test:isolation` (forced): 5/5 görev başarılı — `@arkesoft/db` 2 test dosyası, **13 test**, 0 başarısız. Gerçek Postgres'e bağlandığı `testAppPrisma`/`testMigrationPrisma`'nın gerçek `DATABASE_URL`/`DATABASE_MIGRATION_URL`'i kullandığı kod okumasıyla doğrulandı (mock YOK).
- `grep -rn "\.skip\|\.todo\|\.only" --include="*.test.ts" packages apps` → 1 eşleşme, `migration-sql.test.ts:630` `it.skipIf(process.platform === 'win32')` — T-004'ten devralınan, bu görevde DOKUNULMAMIŞ, gerekçeli (Windows sembolik bağ ayrıcalığı), kalıcı susturma DEĞİL. Yeni `skip`/`only`/`todo` YOK.

**KOŞTURULAN KOMUTLAR:**

| Komut                                                                                          | Exit kodu                                                 | Özet                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx turbo run lint --force`                                                                   | 0                                                         | 15/15 paket, cache bypass ile gerçekten yeniden çalıştırıldı                                                                                                                                                                                                                                                                                                    |
| `npx turbo run typecheck --force`                                                              | 0                                                         | 15/15                                                                                                                                                                                                                                                                                                                                                           |
| `npx turbo run build --force`                                                                  | 0                                                         | 12/12                                                                                                                                                                                                                                                                                                                                                           |
| `npx turbo run test --force`                                                                   | 0                                                         | 7/7 görev, 285 test (sonra 287)                                                                                                                                                                                                                                                                                                                                 |
| `npx turbo run test:isolation --force`                                                         | 0                                                         | 5/5 görev, 13 test, gerçek Postgres                                                                                                                                                                                                                                                                                                                             |
| `pnpm format:check`                                                                            | 1 (ilk koşum) → 0 (QA kendi dosyasını düzelttikten sonra) | yalnızca `.claude/workflow/tasks/T-005.md` kirli kaldı (QA'nın yazma yetkisi yok, dokunulmadı)                                                                                                                                                                                                                                                                  |
| Elle `psql` — AC2 üç sorgu                                                                     | n/a                                                       | `f\|f`, `t\|t`, 0 satır — ROADMAP'in beklediği çıktıyla birebir                                                                                                                                                                                                                                                                                                 |
| Elle `psql` — AC5 üç sorgu                                                                     | n/a                                                       | `count=0`, `permission denied for schema public`, `rolcreatedb=t`                                                                                                                                                                                                                                                                                               |
| `pnpm --filter @arkesoft/db run deploy` (mevcut DB)                                            | 0                                                         | "No pending migrations to apply" — kusuru MASKELEDİ                                                                                                                                                                                                                                                                                                             |
| `pnpm --filter @arkesoft/db run deploy` (izole TAZE Postgres, port 15432)                      | **1**                                                     | **`permission denied for schema public`** — kritik bulgunun ampirik kanıtı                                                                                                                                                                                                                                                                                      |
| `pnpm --filter @arkesoft/db run bootstrap` (taze Postgres)                                     | 0                                                         | idempotent kurulum başarılı                                                                                                                                                                                                                                                                                                                                     |
| `pnpm --filter @arkesoft/db run seed` (mevcut DB)                                              | 0                                                         | başarılı                                                                                                                                                                                                                                                                                                                                                        |
| `pnpm --filter @arkesoft/db run verify` (mevcut DB)                                            | 0                                                         | "No difference detected"                                                                                                                                                                                                                                                                                                                                        |
| Sahte-yeşil dedektörü (izolasyon) — ÇİFT YÖNLÜ elle tetikleme                                  | n/a                                                       | (1) beklenen listeyi yanlış pakete değiştirince KIRMIZI; (2) `packages/db/package.json`'dan `test:isolation` script'ini geçici SİLİP "sahipsiz küme" (architect riski 6) senaryosunu BİREBİR üretince de KIRMIZI ("Beklenen: @arkesoft/db / Gerçek: (boş)"); İKİ dosya da `cp` ile TEK dosya yedekten geri alındı, `diff` ile BYTE-BİREBİR özdeşliği kanıtlandı |
| AC4 mekanik grep — elle sahte ihlal dosyası                                                    | n/a                                                       | `packages/db/src/__qa_scratch_ac4_violation.ts` içine literal `app.tenant_id` yazıldı → CI'daki grep mantığı birebir koşturulunca KIRMIZI verdi; dosya silindi, `git status`/`git diff --stat` ile iz kalmadığı kanıtlandı                                                                                                                                      |
| `pnpm --filter @arkesoft/db exec vitest run src/__tests__/tenant-context-injection.qa.test.ts` | 0                                                         | QA'nın eklediği yeni test — 2/2 PASS                                                                                                                                                                                                                                                                                                                            |

**Temizlik kanıtı:** `docker rm -f qa-fresh-pg` ile atılabilir konteyner kaldırıldı; mevcut geliştirme veritabanına (`arkesoft-postgres`) hiçbir yazma/şema değişikliği yapılmadı (yalnızca salt-okunur doğrulama sorguları + zaten var olan `db:seed`/`db:verify`/`db:deploy`'un no-op koşumları).

---

## KAPSAM DIŞI BULGU

- `packages/db/src/__tests__/migration-sql.test.ts:630` — `it.skipIf(process.platform === 'win32')`, T-004'ten devralınmış, bu görevde dokunulmamış, gerekçeli. Bulgu değil, bilgi notu.

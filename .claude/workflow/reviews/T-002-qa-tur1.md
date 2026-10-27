# T-002 — qa gate — Tur 1

Tarih: 2026-10-26 · Sürüm: v0.0.4 (platform 0.0.3 → 0.0.4)

GATE: qa
SONUÇ: PASS

## Kabul kriteri → test eşlemesi

| AC   | Kriter (özet)                                                       | Kapsayan test(ler)                                                           | Durum                                                                                                 |
| ---- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| AC1  | `pnpm --filter @arkesoft/api test` 0 failed/0 skipped               | tüm 14 dosya (112 test) + `grep skip/only/todo` → 0                          | **KARŞILANDI**                                                                                        |
| AC2  | `/health` 200, semver var; host yok/geçerli/bilinmeyen de 200       | `bootstrap.test.ts` (temel 200 + version eşitliği)                           | **KARŞILANDI** (bkz. BULGU-1: üç host varyantının AÇIK testi eksik, davranış QA probu ile doğrulandı) |
| AC3  | `/health/ready` 200/503, `details.checks`, asılı bağımlılık ≤3sn    | `health-ready.test.ts` (3 senaryo)                                           | **KARŞILANDI**                                                                                        |
| AC4  | Bilinmeyen host → 404, gövde tam `{code,details,message,requestId}` | `tenant-resolution.test.ts` (AC4)                                            | **KARŞILANDI**                                                                                        |
| AC5  | `demo-magaza.*` → tenant çözülür (DEMO_SEED)                        | `tenant-resolution.test.ts` (AC5)                                            | **KARŞILANDI**                                                                                        |
| AC6  | `x-arkesoft-tenant` sadece non-production (iki test)                | `tenant-resolution.test.ts` + `tenant-resolver.test.ts` (AC6, iki ayrı test) | **KARŞILANDI**                                                                                        |
| AC7  | Fail-closed varsayılan; yapılandırılmamış uç → 404                  | `tenant-resolution.test.ts` (AC7) + `tenant-exempt-paths.test.ts` (boyut=2)  | **KARŞILANDI**                                                                                        |
| AC8  | Soft-delete/bilinmeyen host → bayt bayt aynı gövde                  | `tenant-resolution.test.ts` (AC8, string eşitliği — kod okunarak doğrulandı) | **KARŞILANDI**                                                                                        |
| AC9  | `x-request-id` korelasyonu, `tenantId` var/yok, geçersiz id reddi   | `log-correlation.test.ts` (4 test)                                           | **KARŞILANDI**                                                                                        |
| AC10 | `cookie`/`authorization` loglanmaz, iki katman                      | `log-correlation.test.ts` (2 test)                                           | **KARŞILANDI**                                                                                        |
| AC11 | SIGTERM → exit 0, `pg_stat_activity` 0 satır                        | `shutdown.test.ts` — qa tarafından 2 kez bağımsız koşuldu                    | **KARŞILANDI**                                                                                        |
| AC12 | 5'li kapı exit 0; `test:isolation` yok                              | qa tarafından 5 komut ayrı ayrı koşuldu                                      | **KARŞILANDI**                                                                                        |
| AC13 | `@prisma/client` importu yok, lint zorluyor                         | `manifest.test.ts` + qa negatif probu (lint exit≠0 doğrulandı, silindi)      | **KARŞILANDI**                                                                                        |
| AC14 | `class-validator`/`class-transformer` yok; `details.fields` i18n    | `manifest.test.ts` + `validation.test.ts` (4 test)                           | **KARŞILANDI**                                                                                        |

### PO perf devri (bağlayıcı, iki madde)

- **(a) ST-5 sorgu sayacı** — `tenant-resolver.test.ts` incelendi: çözümlenen istek (slug+primaryDomain dalı) `callCount===1`; 9 saf-reddedilen sebep `callCount===0`; `no_row`/`soft_deleted` (post-query tanım gereği) `callCount===1` ile test ediliyor. **ST-5'in dürüst notu doğru** — Orkestratörün DoD ifadesi hatalıydı, bu bir gevşetme DEĞİL. **TEYİT EDİLDİ, FAIL yazılmadı.**
- **(b) ST-6 ≤3000ms eşiği** — `health-ready.test.ts` + `with-timeout.ts` (`READINESS_CHECK_TIMEOUT_MS=2000`, sabit) okundu; eşik `expect(durationMs).toBeLessThanOrEqual(3000)` — düşürülmemiş. qa'nın kendi koşumunda test geçti (bkz. ÖLÇÜMLER). **TEYİT EDİLDİ.**

### R4 telafisi #6 (concurrency.test.ts)

Gerçekten `Promise.all` ile 20 eşzamanlı istek (8 DEMO_SEED + 8 ek tenant ×2 + 4 bilinmeyen), her yanıt `entries[i]` ile eşleştirilip kendi host'una göre doğrulanıyor. **KARŞILANDI.**

## BULGULAR

- **[SEV: medium]** `apps/api/src/redis/redis.service.ts:30-44` (`onModuleDestroy`) — `quit()` zaman aşımına uğrayıp/reddedip `disconnect()` sert-kapanış dalına düşme senaryosu için **hiçbir test yok** (`grep -rln "RedisService" apps/api/src/__tests__` → 0 sonuç). AC11 sadece Prisma/pg bağlantısını deterministik ölçüyor; Redis'in sert-kapanış dalı tamamen test dışı. Kodu okuyarak davranışın doğru tasarlandığı görüldü (withTimeout + disconnect fallback), ama hiçbir otomatik test bunu kanıtlamıyor. **Önerilen düzeltme:** `RedisService`'i sahte (gecikmeli/reddeden) bir `Redis` istemcisiyle test eden bir birim test eklenmeli. **Sorumlu ajan:** backend (ST-6 sahipliği).

- **[SEV: medium]** `apps/api/src/tenancy/tenant.guard.ts:49-68` (`enforce` — `'failed'`/`'pending'` dalları) ve `apps/api/src/tenancy/tenant-context.middleware.ts:48-59` (`catch` bloğu, resolver'ın beklenmedik hata fırlatması) — bu, R4 telafisinin (RLS yokluğunda tek savunma hattı) merkezi bir dalı olduğu halde **ne birim ne de HTTP seviyesinde** tek bir test onu tetiklemiyor (`grep -rln "kind: 'failed'" apps/api/src/__tests__` → sadece `error-mapping.test.ts`, o da `getTenantContext()` erişim yüzeyini test ediyor, `TenantGuard`/middleware zincirini değil). qa, `TenantGuard.canActivate()`'i doğrudan çağıran geçici bir prob yazıp çalıştırdı: davranış **doğru** (`'failed'` → `TenantResolutionFailedError`, `'pending'` → ham `Error`), prob silindi. Üretim davranışı doğru ama kalıcı test kapsamı yok. **Önerilen düzeltme:** `TenantGuard` için dedike birim test (`'failed'`/`'pending'` dalları) + resolver'ın throw ettiği bir senaryoyu HTTP seviyesinde 500 `TENANT_RESOLUTION_FAILED`'e kadar süren bir entegrasyon testi. **Sorumlu ajan:** backend (ST-5/ST-7 sahipliği).

- **[SEV: low]** AC2'nin "host yok / geçerli / bilinmeyen" üç varyantı tek bir açık HTTP testiyle kanıtlanmıyor (`bootstrap.test.ts` yalnızca varsayılan supertest host'unu kullanıyor). Mimari olarak allowlist kontrolü host çözümlemesinden ÖNCE çalıştığı için risk yok; qa geçici bir probla (3 ayrı host: yok/`demo-magaza.*`/`yok.*`) üçünün de 200 döndüğünü doğruladı, prob silindi. **Önerilen düzeltme:** bu üç varyantı açık bir test olarak `bootstrap.test.ts`'e veya `tenant-resolution.test.ts`'e eklemek. **Sorumlu ajan:** backend (ST-7).

- **[SEV: low]** `apps/api/src/config/platform-version.ts:31-35` (`resolvePlatformVersion`) — bozuk/eksik `version` alanlı bir `package.json` için Zod/`fs` hatasının fırlatıldığını doğrulayan bir test yok. Risk düşük (dosya repo kontrolünde, dış girdi değil). **Sorumlu ajan:** backend (ST-2).

- **[SEV: low]** `apps/api/src/errors/app-exception.filter.ts:38` — `tryGetRequestContext()`'in `undefined` döndüğü (ALS context'in hiç kurulmadığı) savunma dalı test edilmiyor. qa doğrudan `filter.catch()` çağıran bir prob ile davranışın doğru olduğunu (generateRequestId + ROOT_LOGGER fallback, 404 cevabı üretildi) doğruladı, prob silindi. `forRoutes('*path')` her yolu kapsadığı için bu dal pratikte şu an erişilemez; yalnızca savunma amaçlı. **Sorumlu ajan:** backend (ST-4).

- **[SEV: low]** `apps/api/src/request-context/request-id.ts:29-39` (`resolveIncomingRequestId`) — çoklu `x-request-id` başlığı (dizi) ve sınır uzunluk (7/8/64/65 karakter) durumları için dedike birim test yok; yalnızca HTTP seviyesinde tek bir geçersiz/bir geçerli dize senaryosu test ediliyor. **Sorumlu ajan:** backend (ST-4).

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ:** yukarıdaki tablo — 14/14 AC KARŞILANDI (AC2 düşük önemli not ile).

**TEST SAYILARI:**

- `@arkesoft/api`: 14 dosya / **112 test**, 0 failed, 0 skipped (qa'nın kendi koşumu: `pnpm test` kökten + `vitest run` doğrudan paket içinde — iki kez doğrulandı)
- `@arkesoft/errors`: 3 dosya / **35 test**, 0 failed (qa doğrudan koştu, önbellek bypass)
- `@arkesoft/db`: 5 dosya / **65 test**, 0 failed (qa doğrudan koştu, önbellek bypass)
- **Toplam: 212 test, 0 failed, 0 skipped** — ST-7'nin iddiasıyla birebir eşleşiyor
- `grep -rn "\.skip(\|\.only(\|\.todo(" apps/api/src packages/errors/src packages/db/src` → **0 satır**

**KOŞTURULAN KOMUTLAR (qa'nın kendi koşumu, hepsi gerçek, sırayla):**

| Komut                                                                                                                                                           | Exit    | Özet                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `pnpm infra:up`                                                                                                                                                 | 0       | postgres/redis/meilisearch/seaweedfs/mailpit healthy                                           |
| `pnpm lint`                                                                                                                                                     | 0       | 15/15 (cache hit, repo değişmedi)                                                              |
| `pnpm typecheck`                                                                                                                                                | 0       | 15/15 (cache hit)                                                                              |
| `pnpm build`                                                                                                                                                    | 0       | 12/12 (cache hit)                                                                              |
| `pnpm test`                                                                                                                                                     | 0       | 7/7 görev → 212 test, 0 failed/0 skipped                                                       |
| `pnpm --filter @arkesoft/errors test -- --run`                                                                                                                  | 0       | 3 dosya / 35 test (uncached, doğrudan)                                                         |
| `pnpm --filter @arkesoft/db test -- --run`                                                                                                                      | 0       | 5 dosya / 65 test (uncached, doğrudan)                                                         |
| `pnpm format:check`                                                                                                                                             | 0       | "All matched files use Prettier code style!"                                                   |
| `npx vitest run src/__tests__/shutdown.test.ts` (×2, apps/api içinde)                                                                                           | 0, 0    | AC11 — flaky değil, iki koşum da geçti                                                         |
| `npx vitest run src/__tests__/health-ready.test.ts` (dolaylı, `pnpm test` içinde)                                                                               | 0       | AC3 — 503/≤3000ms                                                                              |
| `pnpm db:seed` (×2)                                                                                                                                             | 0, 0    | maskeli `d***@arkesoft.test`, idempotans korunuyor, ham e-posta negatif grep → 0 eşleşme       |
| `docker exec arkesoft-postgres psql … SELECT slug FROM tenant`                                                                                                  | —       | yalnızca `demo-magaza` (fixture temizliği doğrulandı, `DEMO_SEED`'e satır eklenmedi)           |
| `pgrep -fl "dist/main.js"`                                                                                                                                      | 1 (yok) | sarkan süreç yok                                                                               |
| 3 geçici QA probu (AC2 host varyantları, `TenantGuard` dalları, `AppExceptionFilter` context-siz dal) + 2 negatif lint probu (`@prisma/client`, `Body` importu) | —       | hepsi davranışı doğruladı, hepsi `rm` ile silindi, `git status --porcelain apps/api/src` temiz |
| `pnpm test:isolation`                                                                                                                                           | —       | **bu sürümde henüz yok** (script root `package.json`'da tanımlı değil, ROADMAP v0.0.13)        |

**Flaky kontrol:** `shutdown.test.ts` ve kök `pnpm test` birer kez daha koşuldu (tekrar), sonuç değişmedi.

**FAIL kuralı uygulaması:** 0 critical, 0 high, 2 medium, 4 low → "1–2 medium = PASS" kuralı uygulandı. **SONUÇ: PASS.**

## Teknik borca aktarılacak bulgular

Yukarıdaki 2 medium + 4 low bulgu Orkestratör tarafından ROADMAP Teknik Borç tablosuna eklenmeli (sorumlu ajan: backend, vade: önerilen v0.0.5 veya ilk fırsat — hiçbiri v0.0.4'ü bloke etmiyor).

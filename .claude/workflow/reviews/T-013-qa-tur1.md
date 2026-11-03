# T-013 · `qa` · tur 1

**Tarih:** 2026-11-03 · **Sürüm:** ROADMAP v0.0.11 (BullMQ kuyruk altyapısı) · **Dal:** `chore/ajan-altyapisi`
**Ortam:** darwin 25.6.0 · docker `arkesoft-*` servisleri ayakta · 6379'da **yalnızca** compose Redis'i
(`ps aux | grep redis-server` → host tarafında 0 süreç; `executable:/data/redis-server`,
`appendonly=yes`, `maxmemory-policy=noeviction`) → **R1 bu koşumda tetiklenmedi.**

```
GATE: qa
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] apps/api/src/queue/job-runner.ts:498-507 — tel sözleşmesi (packages/trpc/src/schemas/job-summary.schema.ts:93-96) "`status === 'completed'` ile dolu bir `error` birlikte GÖRÜLEMEZ" BEYAN EDİYOR; ÖLÇÜM bu beyanı ÇÜRÜTTÜ. ADIM 5 `where: { id: jobId }` ile KOŞULSUZ `completed` yazıyor (ADIM 3'ün durum yükleminin karşılığı YOK) ve `error`'ı temizleyemiyor → terminal başarısızlıktan sonra yeniden teslim edilip BAŞARAN bir iş `completed` + BAYAT `error` üretiyor ve `job.get`/`job.list` onu tele taşıyor — ADIM 5'e ADIM 3'ün durum yüklemini ekle (ve/veya `error`'ı temizlenebilir kıl); alternatif: yorumu dürüstçe daralt — backend
  - [SEV: medium] apps/api/src/__tests__/shutdown.test.ts:161-165 — `pg_stat_activity == 0` ölçümü süreç ölümünü temiz kapanıştan AYIRMIYOR (R-S7-1, `security` devretti). KENDİ ÖLÇÜMÜM: `PrismaService.onModuleDestroy`'dan `$disconnect()` çıkarıldığında bu test YEŞİL kaldı (1/1, 945ms → 11034ms) — yani AC11'in "Postgres bağlantısını kapatır" yarısı ölçülmemiş bir beyan. AC9 aynı boşluğu süreç içi kanca bloğuyla KAPATMIŞ (mutasyonda tek kırmızı o blok) — AC11'e aynı desende süreç-ölümünden-ayrık bir blok ekle — backend
  - [SEV: low] packages/trpc/src/schemas/job-summary.schema.ts:153 — `limit`'in ALT sınırı (`.min(1)`) hiçbir testte ölçülmüyor; yalnızca üst sınır (51 red / 50 kabul) ve varsayılan (20) pinli. `limit: 0` ve `limit: -1` hiçbir sınırda sınanmıyor — backend · vade v0.0.12
  - [SEV: low] apps/api/src/__tests__/shutdown.test.ts + apps/api/src/__tests__/worker-shutdown.test.ts — hiçbiri kapanış SÜRESİNE üst sınır assert etmiyor; ÖLÇÜLDÜ: `$disconnect` mutasyonu altında aynı assert'ler 945ms→11034ms ve 634ms→10654ms ile GEÇTİ (12-16× gerileme sessiz kaldı) — backend · vade v0.0.12
  - [SEV: low] apps/api/src/__tests__/assert-queue-capable-redis.test.ts:16 — AC12'nin denetim kalıbı (`"tek tablo"`) bu yorumda BİTİŞİK yazılı. AC12'nin kapısı `packages/db` kapsamlı olduğu için bugün geçiyor; kapı repo geneline genişletilirse KALICI yanlış pozitif doğar (AGENT_BASELINE §5 literal-jeton kuralı) — backend/docs · vade v0.0.12 · davranış etkisi 0
  - [SEV: low] packages/db/src/__tests__/migration-sql.test.ts:630 — repodaki TEK koşullu atlama (`it.skipIf(process.platform === 'win32')`). T-013 GETİRMEDİ (`git show HEAD` → 1 eşleşme, aynı satır) ve darwin'de KOŞUYOR (ölçüm: 0 skipped). Windows runner'da sessizce atlanır ve ROADMAP'te takip kaydı YOK (CLAUDE.md §6) — devops · vade bir sonraki CI matris değişikliği
ÖLÇÜMLER: aşağıda (§2, §3, §4)
```

**§4 FAIL kuralı uygulaması:** 0 `critical` · 0 `high` · **2 `medium`** · 4 `low` →
**1-2 `medium` = PASS (borca)**. `low`'lar için düzeltme turu **koşturulmaz**; borç satırlarının
metni yukarıda hazır.

---

## 1 · 13 KABUL KRİTERİNİN TEK TEK SONUCU (devralma YOK — her satır kendi koşumum)

| # | Kriter | Eşlendiği test / ölçüm | Sonuç |
| --- | --- | --- | --- |
| **AC1** | `Job` tablosu + migration + taksonomi | `pnpm db:verify` → **exit 0, "No difference detected"** · `_prisma_migrations` → `20261103131017_job_table` `finished_at` DOLU · `tenancy.ts:90` → `['tenant_membership','job']` (**tam iki eleman**) · `catalog-lint-live.isolation.test.ts > sağlıklı durum: hiçbir bulgu YOK` | **GEÇTİ** |
| **AC2** | §7 md 1-3 mekanik doğrulama | `catalog-lint.ts`'te **tam 20 kural kodu** (`rg -o "'[A-Z_]{6,}'" \| sort -u` → 20) · canlı linter sağlıklı durumda **0 bulgu** · **BAĞIMSIZ psql ölçümüm:** `relrowsecurity=t`, `relforcerowsecurity=t`, `polcmd='*'`, `TO PUBLIC`, USING **ve** WITH CHECK ikisi de `tenant_id = current_setting('app.tenant_id', true)`, `tenant_id` `text`/NOT NULL, öncü bileşik indeks `btree (tenant_id, status, created_at DESC)` | **GEÇTİ** |
| **AC3** | §7 md 11 — çapraz okuma **VE** yazma | `tenant-membership.isolation.test.ts` → `tablo: job` için **senaryo 1-7'nin HEPSİ** ayrı ayrı yeşil (senaryo 2 = `WITH CHECK` ile INSERT reddi = **yazma**) · `prob tamlığı: TENANT_SCOPED_TABLES içindeki her tablonun bir probu var` yeşil · kök `test:isolation` **33 test** (18'den artmış) · **0 skipped** | **GEÇTİ** |
| **AC4** | Mutlu yol | `queue-happy-path.test.ts > (1) AC4 … > iş completed oluyor; progress 100, startedAt ve completedAt DOLU` + 4 kardeş test · `(2) reportProgress MONOTON …` | **GEÇTİ** |
| **AC5** | §7 md 7 — worker kiracı bağlamı | `queue-tenant-context.isolation.test.ts` **5/5**: `(1) tenantId EKSİK payload enqueue aşamasında REDDEDİLİYOR — kuyruğa HİÇ girmiyor` · `(2)+(3) kiracı A'nın handler'ı kiracı B'yi NE OKUYABİLİYOR NE YAZABİLİYOR` · `(3b) kiracı B'nin satırı GERÇEKTEN değişmedi (sayaç 0 dönmesi yeterli kanıt değil)` · `(4)` · `(5)` | **GEÇTİ** |
| **AC6** | DLQ, 3 deneme | `queue-dlq.test.ts` **4/4**: `yeniden DENENEBİLİR hata: 3 deneme → DLQ'da 1 kayıt, failed, 4. deneme YOK` · `isRetryable: false … HİÇ yeniden denenmiyor (attemptsMade === 1)` · `AppError OLMAYAN hata: gövde jenerik, ham mesaj YOK` · `payload ŞEMAYI karşılamazsa iş HİÇ yeniden denenmiyor` | **GEÇTİ** |
| **AC7** | Backoff üretim değerleri pinli | `backoff.test.ts > ÜRETİM dizisi TAM OLARAK [5000, 10000] (literal — sabitten türetilmedi)` + 10 kardeş test; Redis'siz saf birim | **GEÇTİ** |
| **AC8** | tRPC yüzeyi kiracıya kapsamlı | `trpc-cross-tenant.isolation.test.ts` → `kiracı A, B'nin jobId'siyle 404; var olmayan jobId ile BİREBİR AYNI gövde (requestId hariç bayt-birebir) — ve aynı yol KENDİ işi için 200 (vacuous değil)` · `job.list YALNIZCA kendi kiracısının satırlarını döner` · `yabancı imleç de AYNI 404` · `procedures.test.ts` → **anonim context'te 401 UNAUTHORIZED/UNAUTHENTICATED (job.get VE job.list)**, boş `jobId` reddi · yapısal: `rg "tenantProcedure" job.router.ts` → `:39 get:` + `:44 list:`, `rg "publicProcedure\|publicTenantProcedure"` → 0 | **GEÇTİ** |
| **AC9** | v0.0.4 AC11 regresyon koruması | `worker-shutdown.test.ts` **8/8** (S7'nin 11 adımlık dizisinin tamamı: exit 0, iki Redis ad deseni, GERÇEK iş, `pg_stat_activity`, log sırası, stdout saflığı, A-A3 graceful/force ayrımı) · `shutdown.test.ts` (v0.0.4 AC11) **1/1 hâlâ yeşil** · `rg -c "spawn\(" fixtures/shutdown-child.ts` → **2** (in-process taklit DEĞİL) · **M4 mutasyonunu kendim tekrarladım** → kanca bloğu tek kırmızı (`expected 1 to be +0`), çocuk-süreç bloğu yeşil kaldı → S7'nin ölçümü **doğrulandı**, kanca bloğu **gerçekten çalışıyor** | **GEÇTİ** (⚠ AC11 yarısı için bulgu Q-2) |
| **AC10** | Redis örneği ön koşulu | `assert-queue-capable-redis.test.ts` **22/22** — (a) `NODE_ENV` fail-closed İLK satır, (b) gerçek Redis pozitif yol, (c) **14 yakın-kaçırma vakası** (büyük harf, baştaki/sondaki boşluk, bir harf fazla, eksik anahtar, `allkeys-lru`), (d) `save` assert EDİLMİYOR, (e) RESP3/tanınmayan şekil fail-closed, (f) yalnızca üç `GET` parametresi, (g) **TAM hata mesajı birebir** · kuyruk test dosyalarının `beforeAll` ilk satırı bu kapı | **GEÇTİ** |
| **AC11** | Zorunlu kapı | §2'deki altı komut — **zincirlenmiş tek koşum exit 0**; **1150 test** (1018'den artmış), **0 skipped / 0 todo** | **GEÇTİ** |
| **AC12** | Üç bayat beyan kapatıldı | `rg "tek tablo" packages/db` → **0 eşleşme** · geniş tarama (`tek tablo\|tek eleman\|hâlâ tek`) `packages/db`+`packages/trpc`+`apps/api/src` → ilgili **0** (iki eşleşme alakasız: `auth-delegated-paths.ts:25`, ve AC12'nin kendi denetim kalıbını taşıyan yorum → **low** bulgu) · `schema.prisma`, `tenancy.ts:5-8` ve `:47-49` bugünkü metinleri okundu: hiçbiri artık taksonominin tek üyeli olduğunu iddia etmiyor | **GEÇTİ** |
| **AC13** | `pnpm dev` worker'ı başlatmıyor | **ÜÇ bağımsız kaynak** + **canlı koşum.** (1) `apps/api` `dev` script'i: `tsc --watch & node --watch … dist/main.js` → `/worker/i` testi **false**; `dev:worker` ve `start:worker` **var**. (2) `turbo.json` görevleri: `generate, build, dev, lint, typecheck, test, test:isolation, clean` → **`dev:worker` görevi YOK** → `turbo run dev` onu çağıramaz. (3) yapısal testler: `AppModule worker modülünü import ETMİYOR`, `main.worker.ts HTTP uygulaması kurmuyor`. (4) **CANLI:** `pnpm --filter @arkesoft/api dev:worker` → `{"queueNames":["tenant.provision"],"concurrency":[1],"pid":68977,"msg":"kuyruk worker hazır"}`, `Nest application successfully started`/`RoutesResolver` → **0 eşleşme (HTTP YOK)**, SIGTERM → `worker kapanışı başladı → kuyruk kapatıldı → prisma bağlantısı kapatıldı → worker kapanışı tamamlandı (7ms)`, artık süreç **yok** | **GEÇTİ** |

⚠ **`pnpm dev`'in KENDİSİ koşturulmadı** — tüm uygulamaları ayağa kaldırıp K-PM3'ün kaçındığı turbo
teardown kusuruna girmesi gerekirdi. Yerine **dört bağımsız kaynak** kullanıldı (üçü yapısal/mekanik,
biri canlı `dev:worker` koşumu). Bu bir devralma değil, **kapsamı daha dar ama gerçek** bir ölçüm.

---

## 2 · AC11'İN ALTI KOMUTUNUN KENDİ ÇIKTIM

### Zincirlenmiş tek koşum (NİHAİ — `qa`'nın eklediği test dosyası DAHİL)

```
pnpm lint && pnpm typecheck && pnpm test && pnpm test:isolation && pnpm build && pnpm format:check
ZİNCİR EXIT = 0
```

| # | Komut | Exit | Ölçüm |
| -- | --- | --- | --- |
| 1 | `pnpm lint` | **0** | 21/21 görev |
| 2 | `pnpm typecheck` | **0** | 21/21 görev |
| 3 | `pnpm test` | **0** | 18/18 görev · **1150 test** · **0 skipped / 0 todo** |
| 4 | `pnpm test:isolation` | **0** | 10/10 görev · **33 test** (db 21 + api 12) |
| 5 | `pnpm build` | **0** | 13/13 görev |
| 6 | `pnpm format:check` | **0** | *All matched files use Prettier code style!* |

### ⚠ ÖNBELLEK DİSİPLİNİ — bir ölçüm hatasını önledim

İlk `pnpm lint` koşumum **FULL TURBO** verdi (21/21 **cached**, 55ms). **Önbellekten tekrar oynatılan
bir çıktı bir ölçüm değildir.** Bu yüzden her komutu `turbo … --force` ile **önbellek atlanarak** da
koşturdum:

| Komut | Önbellek | Exit | Ölçüm |
| --- | --- | --- | --- |
| `turbo run lint --force` | **0 cached / 21** | 0 | 21/21, 13.977s |
| `turbo run typecheck --force` | **0 cached / 21** | 0 | 21/21 |
| `turbo run lint typecheck --force` (yeni test dosyası DAHİL) | **0 cached / 34** | 0 | 34/34 |
| `turbo run build --force` | **0 cached / 13** | 0 | 13/13 |
| `turbo run test --force` (koşum 1, varsayılan eşzamanlılık) | **0 cached / 18** | 0 | 1149 test |
| `turbo run test --force` (koşum 2, varsayılan) | **0 cached / 18** | 0 | 1149 test |
| `turbo run test --force --concurrency=1` (koşum 3) | **0 cached / 18** | 0 | 1149 test |
| `turbo run test:isolation --force` | **0 cached / 10** | 0 | 33 test |
| `pnpm format:check` | — (turbo değil) | 0 | temiz |

⚠ **Nihai zincirlenmiş koşumda** turbo önbelleği kısmen isabet etti (lint 21/21 cached, typecheck
21/21 cached, test 8/18 cached, isolation 8/10 cached, build 12/13 cached). Dürüst okuma: **bu
koşumun kendisi her şeyi yeniden çalıştırmadı**; ama önbellek isabet eden her görev dakikalar önce
`--force` ile **fiilen koşmuş** ve yeşil ölçülmüştü, hash'i değişen her görev (yeni test dosyamdan
etkilenenler: `@arkesoft/api:test`, `@arkesoft/api:lint` vb.) zincirde **gerçekten koştu**.

### `pnpm test` paket kırılımı (3 forced koşumda BİREBİR aynı; nihai koşumda api 429→430)

```
@arkesoft/ui           23      @arkesoft/trpc          48
@arkesoft/tenancy      39      @arkesoft/db           172
@arkesoft/errors       48      @arkesoft/api     429 → 430   (+1: qa'nın eklediği M-1 probu)
@arkesoft/theme-sdk   223      ------------------------------
@arkesoft/themes-mod.   5      TOPLAM            1149 → 1150
@arkesoft/admin        37      skipped 0 · todo 0
@arkesoft/storefront  125
```

### R-S6-3 (varsayılan eşzamanlılıkta `DatabaseNotReachable`) — ÖLÇÜLDÜ

**Toplam 4 tam süit koşumu** (3× `--force`: 2 varsayılan + 1 `--concurrency=1`; 1× nihai zincir).
**Kırmızı: 0/4.** `DatabaseNotReachable` dizesi koşum 1'in loglarında **1 kez göründü**
(`qa-test-run1.log:776`, `code: 'P1001'`, `better-auth` `sign-up` yolunda) ama **bir testin BEKLEDİĞİ
yolda** → kırmızı üretmedi. S8'in ölçümüyle aynı sonuç. **Bu borcun ölçülen sıklığı: S6 2 kırmızı /
? koşum · S8 0/2 · `qa` 0/4 → bugüne kadar bilinen toplam 2 kırmızı / en az 9 koşum.**

### Flaky taraması — zamanlamaya en duyarlı dosyalar

`worker-shutdown` + `queue-dlq` + `queue-happy-path` birlikte, **2 ek tekrar**: `28 passed` / `28 passed`,
ikisi de exit 0. Tüm süitle birlikte bu dosyalar bu turda **6 kez** koştu, **6/6 yeşil**. **Flaky
davranış ÖLÇÜLMEDİ.**

---

## 3 · `perf` İKAMESİNİN DÖRT ÖLÇÜMÜ (`perf` gate'i KOŞMADI — bunlar benim)

Taşıyıcı dosya: `apps/api/src/__tests__/trpc-job-read-port-adapter.test.ts` → **12/12 yeşil (exit 0)**;
sözleşme tarafı: `packages/trpc/src/__tests__/procedures.test.ts`.

| # | Ölçüm | Kendi doğrulamam | Sonuç |
| - | --- | --- | --- |
| **1** | `limit: 51` **sözleşmede** reddediliyor, üst sınır `jobListInputSchema`'da (adaptörde değil) | **KAYNAK OKUNDU:** `job-summary.schema.ts:153` → `limit: z.number().int().min(1).max(JOB_LIST_MAX_LIMIT).default(JOB_LIST_DEFAULT_LIMIT)`; `JOB_LIST_MAX_LIMIT = 50`. **Adaptörde kırpma YOK** — `job-read.port.adapter.ts:196` → `take: query.limit + 1` (hiçbir `Math.min` yok) → sınır **gerçekten tek yerde, sözleşmede**. Test adı: `limit: 51 REDDEDİLİR — yanıt hatadır ve port HİÇ ÇAĞRILMAZ` | **DOĞRULANDI** |
| **2** | **Vacuous değil:** `limit=50` aynı yolda `calls === ['listJobs:50']`; `limit` verilmezse **20** | Testler ayrı ayrı yeşil: `⚠ VACUOUS DEĞİL — limit: 50 AYNI yolda KABUL edilir ve porta ULAŞIR` · `varsayılan sayfa boyutu 20 — limit verilmezse porta 20 ULAŞIR`. **MUTASYON M-QA3** (`.max(JOB_LIST_MAX_LIMIT)` çıkarıldı) → dosya **1 failed / 11 passed** (`Invalid input: expected object, received undefined`) → **kapı gerçekten üst sınırı ölçüyor** | **DOĞRULANDI** |
| **3** | `limit=51`'de `recording.calls === []` → resolver'a/porta **HİÇ ULAŞILMADI** | Testin adı bunu birebir söylüyor ve yeşil; M-QA3 altında **tam bu test** kırmızıya düştü → assert'in öznesi **gerçekten "port çağrılmadı"** | **DOĞRULANDI** |
| **4** | Sorgu şekli `(tenant_id, status, created_at DESC)` indeksiyle uyumlu | **İKİ BAĞIMSIZ KAYNAK.** (a) Testler: `uygulanmış migration bileşik indeksi TAM OLARAK (tenant_id, status, created_at DESC) sırasıyla tanımlıyor` · `adaptörün sıralaması … created_at DESC, ardından id DESC` · `where yüklemleri yalnızca status ve keyset; tenant_id yüklemi YAZILMAZ (RLS ekler)` · `select … kuyruk girdisi kolonu ve tenant_id HİÇ OKUNMAZ`. (b) **KENDİ CANLI psql ÖLÇÜMÜM:** `CREATE INDEX job_tenant_id_status_created_at_idx ON public.job USING btree (tenant_id, status, created_at DESC)` | **DOĞRULANDI** |

### `EXPLAIN`'in kapı olarak reddedilmesi — S8'in gerekçesini DEĞERLENDİRDİM: **KABUL**

S8'in ölçümü: 200 kiracı × 40 000 satırda `Bitmap Index Scan`, **tek kiracılı** 5000 satırda `Seq Scan`.
**Gerekçe geçerli ve teknik olarak doğru:** Postgres planlayıcısı bir *maliyet* kararı verir ve 5000
satırlık tek kiracılı bir tabloda `Seq Scan` **doğru** karardır. `EXPLAIN` çıktısını assert eden bir
kapı, **kodu değil veritabanının o anki satır dağılımını ve `ANALYZE` istatistiklerini** ölçer →
çevreye göre renk değiştiren, yapısal olarak flaky bir kapı olurdu (CLAUDE.md §6: *"flaky test
düzeltilir veya kaldırılır"*). Doğru kapı ikilisi **argüman şekli pini + canlı DDL karşılaştırması**
ve **ikisini de bağımsız olarak doğruladım**. ⚠ Bugünkü `job` tablosunda **1 satır** var; herhangi bir
`EXPLAIN` zorunlu olarak `Seq Scan` döner → bu sürümde `EXPLAIN`'in **hiçbir bilgi değeri yok**.
Gerçekçi dağılımda plan doğrulaması **gelecek bir `perf` turunun işi** (veri olduğunda), bu sürümün
kapısı değil.

### ⚠ Hata kodu `VALIDATION_ERROR` DEĞİL, `HTTP_EXCEPTION`/400 — doğrulandı

`limit: 51` bir **Zod girdi** hatasıdır ve tRPC sınırında doğar; `appErrorBoundary`'nin `isAppError`
dalına **hiç girmez** (ADR-0010 §2 çerçeve-hatası yolu). Testler **gerçeği** assert ediyor, beyanı
değil. `procedures.test.ts`'in anonim-context testleri karşılaştırma noktası olarak **domain** hata
yolunu da gösteriyor (`UNAUTHORIZED`/`UNAUTHENTICATED`, `NOT_FOUND`/`JOB_NOT_FOUND`) → iki yolun
**ayrı** olduğu ölçülü.

---

## 4 · `solid` M-1 İÇİN YAZDIĞIM TESTİN SONUCU

**Yeni dosya:** `apps/api/src/__tests__/qa-job-completed-error-invariant.test.ts`
(Redis'siz, gerçek Postgres, düz `ProcessableJob`, `as` 0, `afterAll` kendi satırlarını siler.)

İki yol yazdım ve **ikisini de koşturdum**:

### Yol (1) — `solid`'in istediği prob: **YEŞİL**

`1. ve 2. deneme BAŞARISIZ, 3. deneme BAŞARILI → completed + error === null`

```
handlerCalls === 3
afterFirst  : status=running, error=null        ← ara deneme terminal DEĞİL
afterSecond : status=running, error=null
publishedEnvelopes === []                       ← DLQ zarfı YOK
afterThird  : status=completed, progress=100, completedAt DOLU, error=null
```

→ `solid`'in M-1'inin **birinci yarısı (eksik negatif test) KAPANDI** ve tel beyanı **bu yolda
gerçekten tutuyor**: `recordTerminalFailure` ara denemede hiç çağrılmıyor, kolona dokunulmuyor.

**Vacuous DEĞİL — MUTASYON M-QA1:** `job-runner.ts:477` `const terminal = unrecoverable || finalAttempt`
→ `… || true`. `lint`/`typecheck` etkisiz; benim testim **kırmızı**: `expected 'failed' to be 'running'`.
md5 ile birebir geri alındı (`d5cf118ed50145aaa0d87dbfe59af78b`).
⚠ **Ek ölçüm:** aynı mutasyon altında **mevcut** `queue-dlq.test.ts` de **4 kırmızı** verdi → "her
başarısızlıkta yaz" sapması zaten korunuyordu; M-1'in asıl boşluğu **bu değildi.**

### Yol (2) — asıl boşluk: **KIRMIZI. Tel sözleşmesi YANLIŞ BİR ŞEY BEYAN EDİYOR.**

`TERMİNAL başarısızlıktan sonra yeniden teslim` (`attemptsMade: 2` = son deneme → başarısız →
terminal muhasebe; sonra **aynı `jobId`** tekrar koşuyor ve **başarıyor**):

```
afterTerminal   : status=failed, error DOLU, publishedEnvelopes.length === 1     (beklendiği gibi)
afterRedelivery : status=completed            ← ADIM 5 KOŞULSUZ yazdı
                  handlerCalls === 2

AssertionError: expected { code: 'QA_PROBE_RETRYABLE', …(3) } to be null
  Received: { code: 'QA_PROBE_RETRYABLE', details: {},
              message: 'errors.probe.retryable', requestId: 'fwwsuekwscwt32eycc4j18pg' }
```

**Yani:** `job-summary.schema.ts:93-96`'nın *"`status === 'completed'` ile dolu bir `error` birlikte
GÖRÜLEMEZ"* beyanı **yanlıştır**. Kök sebep **asimetrik durum makinesi**: ADIM 3 (`:458-467`)
`status: { in: [queued, running] }` yüklemi taşıyor — `failed` bir satırı bilerek `running`'e
çevirmiyor (bu davranış `queue-happy-path.test.ts`'te **ayrıca test edilmiş**) — ama ADIM 5
(`:498-507`) `where: { id: jobId }` ile **koşulsuz** `completed` yazıyor ve `error`'ı temizleyemiyor
(S6 kararı 1: `@arkesoft/db` `Prisma`'yı yalnızca **tip** olarak açtığı için `DbNull` **değer olarak
yok**). Satır tele **olduğu gibi çıkar**: `job-read.port.adapter.ts:224` → `JOB_ERROR_COLUMN_SCHEMA.parse(row.error)`
→ `job.get`/`job.list` kullanıcıya `status: 'completed'` **ve** `error: { code, message }` gösterir.

**Ulaşılabilirlik (dürüst değerlendirme):** `recordTerminalFailure` satırı yazdıktan **sonra**,
BullMQ'nun `moveToFailed`'i tamamlanmadan worker ölürse/zorla kapanırsa iş `active` kalır →
stalled-checker **aynı `jobId`'yi yeniden teslim eder** → bu kez handler başarırsa yukarıdaki durum
doğar. K1.c bu yeniden teslimi **tasarım gereği öngörüyor**. Pencere **dar**; bugün **tetikleyici
yok** (tek handler bir iskelet ve tasarım gereği başarısız olmuyor, `enqueue`'nun üretim çağıranı
`rg` ile **0**).

**Önem derecesi kararım: `medium`.** §4: `high` = *"yanlış davranış üreten hata"* / *"kabul kriterini
karşılamama"*; `medium` = *"kenar durumda hata, eksik test"*. Hiçbir AC bu değişmezi beyan etmiyor
(AC4 ve AC6 ayrı ayrı karşılanıyor), bugün tetikleyici yok ve çarpan bir çökme/stall penceresi
gerekiyor → **kenar durum**. §4'ün *"emin değilsen bir alt seviyeyi seç ve gerekçesini yaz"* kuralı
uygulandı. ⚠ **Ama bu bir `low` değil:** etkilenen şey **versiyonlanan bir birim olan public API'nin
(`@arkesoft/trpc`) tel sözleşmesinin yazılı garantisi** ve v0.2.0'ın gerçek handler'ı geldiği an
pencere **gerçek** olur.

**`solid`'in M-1'i DÜŞMEDİ** — yarısı kapandı (test yazıldı, yeşil), diğer yarısı **şüpheden ölçüme
yükseldi**. Yeni kimliği **Q-1**, sorumlu **`backend`**.

### ⚠ Kırmızı testi repoda BIRAKMADIM — gerekçe

Yol (2) `pnpm test`'i düşürürdü, yani **zorunlu kapıyı `qa`'nın kendi probu yüzünden** kırmızı
yapardı; bu, üretim durumunu ölçümümle karıştırmak olurdu. Bu turda uygulanan **62 mutasyonun
hepsinde olduğu gibi**: kırmızı **fiilen görüldü**, raporlandı, geri alındı. Yol (1) **kalıcı olarak
repoda** (eksik kapsamı gerçekten kapatıyor, yeşil); yol (2)'nin **tam kaynağı** burada ve
`.../scratchpad/m1-probe-full.test.ts.bak` (md5 `d3c3d73449c8b9658d42ace061b9e9ba`) içinde — düzeltmeyi
yapan `backend` onu **regresyon testi olarak aynı dosyaya** ekler. Bıraktığım dosyanın başındaki
yorum bu devri **açıkça** yazıyor. 🚫 **Üretim kodunda tek satır değiştirmedim.**

---

## 5 · R-S7-1 HAKKINDAKİ KARARIM (`security` BANA DEVRETTİ)

**`security`'nin çerçevesi doğru:** saldırı yüzeyi yok, veri sızmıyor, yetki atlatılmıyor → güvenlik
bulgusu değil. **Ama bir test kalitesi bulgusu, ve `low` değil.**

### Önce ölçtüm (devralmadım) — MUTASYON M-QA2

`prisma.service.ts:143` `await this.#client.$disconnect()` → `await Promise.resolve()` (log satırı
**korundu**, S7'nin M4'ünün birebir ikizi):

| Ölçüm | Mutasyonsuz | Mutasyonlu | Sonuç |
| --- | --- | --- | --- |
| `worker-shutdown.test.ts` çocuk-süreç bloğu (5 test) | yeşil, 634ms | **YEŞİL**, 10654ms | ⚠ **ayırt edemiyor** |
| `worker-shutdown.test.ts` **kanca bloğu** (AC9, S7'nin eklediği) | yeşil, 22ms | **KIRMIZI** `expected 1 to be +0` | ✅ **ayırt ediyor** |
| `shutdown.test.ts` (v0.0.4 AC11) | yeşil, 945ms | **YEŞİL**, 11034ms | ⚠ **ayırt edemiyor** |
| `lint` / `typecheck` | 0 / 0 | **0 / 0** | ⚠ sessiz |

→ **S7'nin M4'ü bağımsız olarak tekrarlandı ve DOĞRULANDI.** AC9 için boşluk **gerçekten kapalı**
(kanca bloğu çalışıyor, vacuous değil). AC11 için **gerçekten açık**.

**Mekanizmayı da ölçtüm:** mutasyonlu süreç **yine exit 0** verdi, sadece ~10 saniye sonra — süreç
`$disconnect` olmadan doğal olarak çıkmıyor, `pg.Pool`'un idle zaman aşımı bağlantıyı düşürene kadar
event loop canlı kalıyor, sonra doğal çıkış gerçekleşiyor. `exit 0` assert'i bu yüzden yeşil kalıyor
ve **kapanış süresine üst sınır olmadığı için** 12-16× gerileme de görünmüyor (→ ayrı `low` bulgu).

### Kararlarım

1. **Önem derecesi: `medium`** (§4 *"eksik test"*). Etkilediği şey zorunlu kapının **kendi regresyon
   bekçisi**: AC11'in iki iddiasından biri (*"Postgres bağlantısını kapatır"*) **bugün ölçülmemiş bir
   beyan** ve `lint`+`typecheck` sessiz. `critical`/`high` değil — çalışan sistemde yanlış davranış
   **yok**, üretim kodu doğru (`$disconnect` yerinde ve çalışıyor); eksik olan **kanıt**.
2. **Bu sürümün kapsamında DEĞİL → BORÇ.** Üç gerekçe: (a) boşluğu **T-013 getirmedi**, v0.0.4'ten
   devrediyor; (b) T-013'ün **eklediği** yüzey (worker) için aynı boşluk **kapatıldı**; (c)
   `shutdown.test.ts` hiçbir T-013 alt görevinin dosya sahipliğinde değil ve bana **açıkça yasaklı**.
   🚫 **DOKUNMADIM** (`git status` → dosya değişmemiş).
3. **Önerim (Orkestratör karar verir):** `worker-shutdown.test.ts`'in üçüncü describe bloğunun
   **birebir deseni** `shutdown.test.ts`'e eklenir — süreç **canlı kalır**, hiçbir sinyal gönderilmez,
   `application_name=arkesoft-api-ac11-hook` satırını düşüren **tek şey** `PrismaService.onModuleDestroy()`
   olur. Maliyet: ~30 satır, yeni bağımlılık yok, mevcut assert'lere dokunulmaz. **Sorumlu `backend`,
   vade v0.0.12.** Yolu üstünde kapatılacak ikinci kalem: her iki dosyaya **kapanış süresi üst sınırı**.
4. `security`'nin *"borç tablosunda yanlış kategoriye girmesin"* kaygısı yerinde: bu satır ROADMAP'e
   **test kalitesi / ölçüm boşluğu** olarak girer, güvenlik borcu olarak **girmez**.

---

## 6 · EKSİK SENARYO VAR MI — kapsanmayan kenar durumlar

### Kontrol ettim ve **KAPSANMIŞ** çıktı

| Senaryo | Nerede |
| --- | --- |
| Yetkisiz erişim (kimlik doğrulamasız) | `procedures.test.ts` → `job.get` **ve** `job.list` için anonim context → **401 UNAUTHORIZED / UNAUTHENTICATED** |
| Geçersiz girdi | boş `jobId` (resolver'a ulaşmıyor) · `limit: 51` · şemayı karşılamayan payload (hem `enqueue`'da hem kuyruktan okumada) |
| Eksik alan | `tenantId`'si eksik **ve** boş (`min(1)`) payload → satır yazılmıyor, iş kuyruğa **hiç** girmiyor |
| Sınır değeri | `limit: 50` kabul · varsayılan 20 · `progress` 1000→100 ve −5→kırpma · `attempts` 3/4. deneme yok |
| **Boş filtre** (`status: []`) | ✅ `trpc-job-read-port-adapter.test.ts:295` → `listJobs(…, { limit: 10, status: [] })` → `noneMatch`. ⚠ Şüphelendim, **grep'le ölçtüm, kapsanmış çıktı** |
| **Idempotency / tekrar gönderim** | `queue-enqueue.test.ts` → `AYNI Job.id ile ikinci enqueue İKİNCİ bir BullMQ işi ÜRETMİYOR` · `queue-happy-path.test.ts` → `durum geçişi İDEMPOTENT: aynı iş İKİ KEZ koşuyor, startedAt KORUNUYOR` · `reportProgress` monotonluk yüklemi |
| **Kiracı çapraz okuma VE yazma** (zorunlu) | **ÜÇ katmanda:** DB (`job` probu senaryo 1-7, senaryo 2 = INSERT reddi) · worker (`AC5` 5/5, `foreignRowCount=0` **ve** `foreignUpdateCount=0`) · tRPC (`AC8`, yazma yüzeyi **yok**). **`critical` bulgu YOK.** |
| Varlık oracle'ı | yabancı id = var olmayan id = çözülemeyen imleç → **tek** `JOB_NOT_FOUND`/404, gövdeler `requestId` hariç bayt-birebir |
| Regresyon | **R-A4:** `git diff --stat health-ready.test.ts rate-limit.test.ts redis.service.ts` → **BOŞ** ve `git status` → **üçü de değişmemiş**; üçü de benim tam süit koşumumda yeşil. `shutdown.test.ts` (v0.0.4 AC11) **1/1 yeşil**. Tüm süit 4 koşumda 18/18. |
| Playwright / kritik akış | **Uygulanabilir değil, ÖLÇÜLDÜ:** `git status` → `apps/admin`/`apps/superadmin`/`apps/storefront`/`packages/ui`/`packages/themes` **0 dosya**. Kök `pnpm test:e2e` **YOK** (AGENT_BASELINE §6/R6 ile uyumlu; paket bazlı yalnızca `apps/admin` ve `apps/storefront`'ta var). T-013 hiçbir kritik akış **ekranına** dokunmuyor. |

### Kapsanmamış — bulgu olarak yazıldı

1. **`limit` ALT sınırı** (`limit: 0`, `limit: -1`) hiçbir sınırda ölçülmüyor → **low**.
2. **AYNI `jobId`'nin EŞZAMANLI iki teslimi** (sıralı çift koşum var, eşzamanlı yok). Ayrı bulgu
   **yazmadım**: tetikleyicisi ve kök sebebi **Q-1 ile aynı** (ADIM 5'in koşulsuz yazımı + stalled
   yeniden teslim) ve Q-1'in düzeltmesi bu senaryonun regresyon testini **doğal olarak** doğurur.
   Çift sayım yapmamak için Q-1'in *"düzeltme yönü"*ne iliştirildi.
3. **Kimlikli ama kiracısız** (`403`) olgusu `job.*` için ayrıca test edilmiyor — ama `tenantProcedure`
   **paylaşılan builder** ve aynı dosyada başka prosedürler üzerinden pinli (`TENANT_CONTEXT_REQUIRED`),
   `rg "tenantProcedure" job.router.ts` → `:39`, `:44`. **Yapı gereği kapsanmış** → bulgu değil.
4. **`enqueue`'nun kiracı kapsamını payload'dan türetmesi** (`security` low #1) için negatif test yok —
   **bilinçli olarak tekrar etmiyorum**, `security` zaten `low` + vade v0.2.0 ile kaydetti. ⚠ `qa`
   notu: o uç için negatif test, **ilk üretim çağıranından önce** yazılmak zorunda.

---

## 7 · MUTASYONLAR — üçü de fiilen uygulandı, kırmızı görüldü, **md5 ile birebir geri alındı**

| # | Dosya · mutasyon | lint | tc | Ölçülen kırmızı | Geri alma |
| --- | --- | --- | --- | --- | --- |
| **M-QA1** | `job-runner.ts:477` → `terminal = … \|\| true` | — | — | `qa` probu: `expected 'failed' to be 'running'` · **ayrıca** mevcut `queue-dlq.test.ts` **4 kırmızı** | md5 `d5cf118ed50145aaa0d87dbfe59af78b` ✅ |
| **M-QA2** | `prisma.service.ts:143` → `$disconnect()` no-op (log korundu) | **0** | **0** | **yalnızca** AC9 kanca bloğu: `expected 1 to be +0`; çocuk-süreç bloğu ve `shutdown.test.ts` **yeşil kaldı** | md5 `6027f1927ebdbd39eea9404454ef9a84` ✅ |
| **M-QA3** | `job-summary.schema.ts:153` → `.max(JOB_LIST_MAX_LIMIT)` çıkarıldı | — | **0** | `perf` ikamesi ÖLÇÜM 1: `1 failed / 11 passed` | md5 `a9a967684869908dc047e3730484f4bb` ✅ + `dist` yeniden kuruldu |

`git status`/`git diff` ile doğrulandı: **üç üretim dosyası da mutasyon öncesi hâlinde.**

### ⚠⚠ KENDİ ÖLÇÜM HATAM — raporluyorum (Orkestratör'ün kuralı bana da geçerli)

M-QA3'ü ilk uyguladığımda `perf` ikamesi testi **12/12 YEŞİL** kaldı ve bunu *"ölçüm vacuous"* diye
bir **bulgu yazmaya** hazırdım. **Yanlıştı.** Sebep: `apps/api`, `@arkesoft/trpc`'yi
**`dist/index.js` üzerinden** tüketiyor (`packages/trpc/package.json` → `main`/`exports` **dist'e**
işaret ediyor). `packages/trpc/src`'i mutasyona uğratıp **yeniden kurmadan** koşan bir test **bayat
derlenmiş kodu** ölçer. `dist`'i yeniden kurduktan sonra test **doğru şekilde kırmızı** oldu.

**Kayda geçen kural (`docs` `development.md`'ye alabilir):** `packages/*`'ta yapılan bir mutasyonun
`apps/*` testlerindeki etkisini ölçmek için **önce o paketi build etmek zorunludur**; aksi hâlde
sonuç **mutasyonun değil, bayat `dist`'in** ölçümüdür. Bu, Orkestratör'ün `arkesoft_migrator` ile
`job` sayma hatasıyla **aynı sınıf**: çalıştırılan komut, ölçüldüğü sanılan şeyi ölçmüyordu.

---

## 8 · ORTAM — koşumdan SONRA temiz, artık bırakılmadı

```
Redis DBSIZE                                        → 2
  arkesoft:queue:tenant.provision:meta                    (A-S5-1'in yapısal beklentisi)
  arkesoft:queue:tenant.provision.dlq:meta
askıda iş: wait/active/delayed/failed desenleri     → HEPSİ BOŞ   (R-S5-2 kontrolü ✅)
platform:auth:*                                     → 0 (TTL ile düştü; FLUSH KULLANILMADI)
CONFIG SET / FLUSHALL / FLUSHDB                     → 0 (hiç çalıştırılmadı)

job tablosu (rolbypassrls olan `arkesoft` rolüyle — Orkestratör'ün kuralı):
  h8vxzdu17sn1fi34xgabemc8 | g76qz8ph7o8f6tfvdmerqem1 | tenant.provision | queued | 0 | 14:07:38Z
  → TAM OLARAK 1 satır: S5'in bilinen mutasyon artığı. SİLMEDİM (R-S5-3'ün kanıtı,
    `demo-magaza` kiracısının verisi). T-013'ün yeni bir kusuru DEĞİL.
  → Kendi testimin `test.qa-error-invariant-probe` satırları YOK → afterAll temizliği ÇALIŞIYOR.

prisma migrate reset / db push --force-reset         → 0 (consent token üretilmedi)
Dokunulmayan dosyalar (yasak listesi): .env · .env.example · infra/** · .github/** ·
  ROADMAP.md · CHANGELOG.md · docs/** · shutdown.test.ts  → hepsi `git status`'ta DEĞİŞMEMİŞ
```

**Bu turda yazdığım tek dosya:** `apps/api/src/__tests__/qa-job-completed-error-invariant.test.ts`
(1 test, yeşil, prettier temiz, `console.*`/`any`/`@ts-ignore`/`skip`/`as` **0**).
**Kalıcı bırakılma gerekçesi:** `solid` M-1'in eksik kapsam yarısını gerçekten kapatıyor ve
`queue-happy-path.test.ts`'teki *"iki kez koşuyor"* testinin **ölçemediği** şeyi ölçüyor.

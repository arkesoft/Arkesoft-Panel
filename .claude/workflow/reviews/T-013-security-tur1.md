# T-013 — security gate, tur 1

Tarih: 2026-11-03 · Sürüm: **v0.0.11** (BullMQ kuyruk altyapısı) · Dal: `chore/ajan-altyapisi`

```
GATE: security
SONUÇ: PASS
```

Gerekçe (AGENT_BASELINE §4): `critical` 0 · `high` 0 · `medium` 0 · `low` 6 →
**PASS**, düzeltme turu açılmaz; altı `low` ROADMAP teknik borç tablosuna gider.

⚠ Bu raporun her iddiası **kendi araçlarımla ölçüldü**. Task belgesinin beyanları
doğrulama olarak kabul edilmedi; her beş bağlayıcı nokta için bağımsız bir ölçüm
koştum (canlı `psql`, `eslint --print-config`, izole `espree` lint koşumu, `node`
ile zod davranışı, üç test dosyası tek tek).

---

## 1. Beş bağlayıcı denetim noktası — sonuç satırları

### DN-1 · R-A2 — `AppPrismaDatabase`'e `'job'` eklenmiş mi → **DOĞRULANDI (eklenmemiş, doğru)**

`packages/db/src/client.ts:183`

```ts
export type AppPrismaDatabase = Pick<PrismaDatabase, 'tenant' | 'user' | 'tenantMembership'>
```

`packages/db/src/client.ts:222`

```ts
export type TenantTransactionClient = Pick<TransactionClient, 'tenantMembership' | 'job'>
```

İki allowlist **zıt yönde** ve `Pick<>` (deny-list değil) olduğu için `job`
`AppPrismaDatabase`'de **yok** → `prisma.db.job.*` `apps/api`'de derlenmez.
`AppPrismaDatabase`'in üç üyesi de `$queryRaw`/`$extends`/`$transaction`
taşımıyor, yani `Pick`'in doğası gereği ikinci bir kaçış kapısı da yok.
`client.ts:163-174` bu kararı yazılı ve bağlayıcı hâle getirmiş.

Yan ölçüm: `packages/db/src/tenancy.ts:90` → `TENANT_SCOPED_TABLES =
['tenant_membership', 'job']`. `packages/db/src/index.ts` `Job` tipini ve
`JobStatus` enum **değerini** additive olarak dışa açıyor (istemci fabrikası
veya ham delege **değil**) — kaçış kapısı üretmiyor.

### DN-2 · K5'in dört katmanı — **her katman ayrı satır**

**Katman 1 (payload tipi) → DOĞRULANDI.**
`apps/api/src/queue/job-payload.base.ts:34-36` `jobPayloadBaseSchema` zorunlu
`tenantId: z.string().min(1)`; `job-definition.ts:88` `JobDefinition<P extends
JobPayloadBase>`. Negatif pinler `apps/api/src/__tests__/type-pins/job-tenant-scope.pin.ts`
içinde `@ts-expect-error` ile (PİN 1/2/4) — direktif bastırdığı hata kaybolursa
`TS2578` ile kırılıyor, yani pin sessizce geçemiyor. PİN 3 yanlış-pozitif
dışlayıcısı mevcut (kiracılı şema **derleniyor**).
**Atlatma denemem:** `JobPayloadBase` `Readonly<z.infer<...>>`; `P` için
`tenantId?: string` taşıyan bir tip `extends` kısıtını geçemez
(`exactOptionalPropertyTypes` altında `string | undefined` ↛ `string`).
Kısıtı gevşetmeden atlatma yolu bulamadım.

**Katman 2 (DB tipi) → DOĞRULANDI.**
`job-definition.ts:62` `withTenantDb: <T>(callback: (tx: TenantTransactionClient)
=> Promise<T>) => Promise<T>` — **`tenantId` parametresi yok**. PİN 5
(`job-tenant-scope.pin.ts:140-146`) fazla argümanı `TS2554` ile pinliyor.
Handler'ın elindeki `tx` `Pick<TransactionClient,'tenantMembership'|'job'>`;
`$queryRaw`/`$transaction` **yok** → handler ham SQL ile RLS'i atlayamaz.
**Atlatma denemem:** `ctx.logger`/`ctx.jobId`/`ctx.tenantId` üzerinden DB'ye
dönen bir yol yok; `JobContext`'in tüm yüzeyi beş alan ve yalnızca `withTenantDb`
+ `reportProgress` I/O yapıyor, ikisi de sarmalayıcının kapanışındaki `tenantId`'ye
bağlı (`job-runner.ts:429`, `:437`).

**Katman 3 (DI yok) → DOĞRULANDI, ama tek savunması çalışma zamanı testi.**
`apps/api/src/queue/jobs/tenant-provision/handler.ts:68` `tenantProvisionHandler`
düz bir `const` fonksiyon, `@Injectable()` **yok** → `PRISMA_CLIENT`/`PrismaService`
token'larına DI ile erişemez. Üretim kablolaması `queue-worker.module.ts:210-219`:

```ts
withTenantDb: (tenantId, callback) => prisma.withTenant(tenantId, callback),
```

⚠ **Handoff'un M6 uyarısını izledim ve bir boşluk arandı:** üç kuyruk testi
(`queue-dlq`, `queue-happy-path`, `queue-tenant-context.isolation`) `dependencies`
nesnesini **kendileri** kuruyor, yani üretimdeki bu satırı ölçmüyorlar.
**Boşluk KAPALI çıktı:** `apps/api/src/__tests__/worker-shutdown.test.ts:210,281,320-336`
derlenmiş `dist/main.worker.js`'i **gerçek bir OS süreci** olarak spawn ediyor,
`queueService.enqueue(TENANT_PROVISION_JOB, { tenantId })` ile gerçek iş atıyor ve
`withTenant(tenantId)` altında `Job.status === completed` olana kadar bekliyor.
Üretim satırı sabit/yanlış bir kiracıya bağlanırsa worker'ın `updateMany`'leri RLS
tarafından 0 satıra iner, satır `queued` kalır ve bu `waitFor` **zaman aşımına
uğrar**. Yani üretim kablolaması gerçekten pinli. **Bu nedenle bulgu yazmıyorum.**

**Katman 4 (lint) → DOĞRULANDI, İKİ BAĞIMSIZ ÖLÇÜMLE.**

Ölçüm A — **etkin yapılandırma introspeksiyonu** (diske hiçbir şey yazmadan):

```
npx eslint --print-config "src/queue/jobs/tenant-provision/handler.ts"
→ no-restricted-imports paths:
  @prisma/client | @nestjs/common[Body,Query,Param] | express |
  @nestjs/platform-express | @types/express | pg | pg-pool | pg-native |
  @prisma/adapter-pg | @arkesoft/db[PrismaDatabase,AuthPrismaDatabase,
  AUTH_SECRET_BEARING_MODELS,createPrismaClient] | @arkesoft/db[withTenant]
→ patterns:
  [["@prisma/client/*",".prisma/client",".prisma/client/*"],
   ["express/*","@nestjs/platform-express/*","@types/express/*"],
   ["pg/*"],
   ["**/prisma/*","**/prisma/**","../../../prisma/*","../../prisma/*"]]
```

⚠ Handoff'un "beşinci blok diğer dört kısıtlamayı yeniden beyan etmezse yasaklar
SESSİZCE kaybolur" uyarısının tam karşılığı: **beşi de orada** (prisma ham import +
Body/Query/Param + express + pg + Prisma istemci yüzeyi) **artı** kuyruk yasağı.
`eslint.config.mjs:271` blok (1)'in `ignores` listesinde `'src/queue/jobs/**'` var
→ kümeler **tam ayrık**, "sonraki blok öncekini tamamen değiştirir" riski bu dizin
için gerçekleşmiyor.

Ölçüm B — **desenlerin fiilen tetiklendiği** (izole `espree` koşumu, scratchpad'de,
repo dosyası değiştirilmedi):

```
1:1  error  '../../../prisma/prisma.service.js' ... pattern.  PATTERN-HIT
2:1  error  '../../prisma/prisma.service.js'    ... pattern.  PATTERN-HIT
3:1  error  '../../../../prisma/prisma.service.js' ... pattern. PATTERN-HIT
4:1  error  '../../../prisma/index.js'          ... pattern.  PATTERN-HIT
5:10 error  'withTenant' import from '@arkesoft/db' is restricted. PATH-HIT
```

Yani `**/prisma/**` kalıbı **her derinlikteki** relatif yolu yakalıyor (handler'ın
gerçek derinliği `../../../prisma/*`, ama 2 ve 4 seviye de kırmızı) ve
`importNames: ['withTenant']` yasağı da ateşliyor. ⚠ `eslint --stdin` ile
`src/queue/jobs/...` sahte dosya adı üzerinden deneme **tip-bilinçli** proje
servisinin dosyayı bulamaması yüzünden parse hatası verdi (`was not found by the
project service`) — bu yüzden iki parçalı ölçüme geçtim; birlikte aynı iddiayı
S6'nın geçici-dosya yönteminden daha dar bir yan etkiyle kanıtlıyorlar.

**Beşinci ayak (ADR-0015 Karar 1'in ötesinde, kendi ölçümüm):** `AppModule`
worker modülünü import etmiyor →
`rg "QueueWorkerModule" apps/api/src/app.module.ts` → **0 eşleşme**; tek referans
`apps/api/src/worker.module.ts:47`. Yani HTTP süreci iş **üretir**, **tüketemez**.

### DN-3 · `payload` ve `error` tele çıkmıyor mu → **DOĞRULANDI, SENTETİK SIR CANLI ÖLÇÜLDÜ**

Grep kapıları (hepsi **import/kod düzeyinde**, literal-jeton kuralı gözetilerek):

| Kapı | Sonuç |
| --- | --- |
| `rg -c "payload" packages/trpc/src/schemas/job-summary.schema.ts` | **0** (exit 1) |
| `rg -n "payload" packages/trpc/src` | yalnızca **2 negatif assert** (`procedures.test.ts:325`, `router-output.test-d.ts:149`) |
| `rg -n "from '@arkesoft/db'" packages/trpc/src` | **0** (handoff'un uyardığı yanlış-pozitif tuzağına düşmeden) |

Yapısal katmanlar:

1. **Veritabanından hiç okunmuyor.** `apps/api/src/trpc/ports/job-read.port.adapter.ts:73-83`
   `JOB_ROW_SELECT` dokuz kolon sayıyor; kuyruk girdisini taşıyan JSONB kolonu **ve**
   `tenant_id` o listede **yok** → "tele yazmayı unutmadık" değil, **elimize hiç
   almadık**.
2. **Tel şeması iki alan.** `job-summary.schema.ts:81-84` `jobErrorSummarySchema =
   z.object({ code, message })` — `details`/`requestId` tele konmuyor.
3. **Yazma kapısı mekanik.** `job-runner.ts:209-211` `toJsonErrorBody` =
   `appErrorBodySchema.parse(body)`. **Kendi ölçümüm** (`packages/errors/dist`
   üzerinden `node`):

   ```
   girdi:  { code, message, details, requestId, sirAnahtar:'SENTETIK-SIR',
             stack:'at foo', context:{ tckn:'12345678901' } }
   çıktı:  keys = code,details,message,requestId
   leak?   false
   ```

   `z.object` fazla anahtarı **düşürüyor** → kolona bir gün eklenen fazladan bir
   alan (PII taşısa bile) sızamaz.
4. **`AppError.context` yapısal olarak girmiyor.** `packages/errors/src/error-body.ts`
   `toErrorBody()` dönüş nesnesini **elle** kuruyor (`error`'dan spread **etmiyor**)
   ve `error.context`/`error.httpHeaders`'ı **hiç okumuyor** (A-V25 + PO riski 8).
   `AppError` olmayan hata → `unknownErrorBody(jobId)`, sabit dört alan, ham
   mesaj/yığın izi **hiç okunmuyor**.
5. **Tip pini.** `trpc-wire-contract.pin.ts:257-281` PİN 6: `keyof JobSummary ⊂
   keyof Job`, `'payload' ∉ keyof JobSummary`, `'tenantId' ∉ keyof JobSummary`.

**Canlı ölçüm (koşturdum):** `vitest run src/__tests__/queue-dlq.test.ts` →
**1 dosya / 4 test geçti**. İçindeki assert'ler sentetik sırrı (`sentetik-sir-asla-
tele-yazilmamali`) `AppError.context`'e koyup hem `Job.error` JSONB'sinde hem DLQ
zarfında **arıyor ve bulamıyor** (`queue-dlq.test.ts:267`, `:291`), artı
`row.error` anahtar kümesinin tam olarak `code,details,message,requestId` olduğunu
ve `details === {}` olduğunu pinliyor.

⚠ Kalan (bulgu değil, derinlemesine savunma notu): `appErrorBodySchema.details` bir
`z.record` torbası ve `Job.error` JSONB'sine **olduğu gibi** yazılıyor. Bugün her
iş hatası için `{}` (hiçbir ilgili hata sınıfı `publicDetails`'i override etmiyor —
DN-4'te ölçüldü) ve `job.get` tele yalnızca `code`+`message` çıkardığı için **tele
ulaşmıyor**. Yani kolona PII yazılması için gelecekte bir hata sınıfının
`publicDetails`'ini PII ile doldurması gerekir; o da tele değil yalnızca JSONB'ye
düşer. Bu `AppError`/ADR-0010 §1'in önceden verilmiş bir tasarım kararı, T-013'ün
ürettiği bir gerileme değil.

### DN-4 · Varlık oracle'ının yapısal kapanışı (AC8) → **DOĞRULANDI, CANLI HTTP İLE**

Yapısal mekanizma, kendi grep'lerimle:

| Kapı | Sonuç |
| --- | --- |
| `rg -n "if ?\(" job.router.ts job-read.port.adapter.ts` | **0** (dallanma yok) |
| `rg -n "input\.tenantId" packages/trpc/src` | **0** (kiracı girdiden hiç okunmuyor) |
| `rg -n "throw" job-read.port.adapter.ts` (kod satırı) | **tek satır**: `:207 throw new JobNotFoundError()` |

- `job.router.ts:42,47` → kiracı **her zaman** `ctx.tenant.tenantId` (host
  çözümünden); `jobGetInputSchema`/`jobListInputSchema` kiracı alanı **taşımıyor**.
- `job-read.port.adapter.ts:241` `where: { id: jobId }` — kiracı yüklemini **RLS
  ekliyor**; `where: { tenantId }` yazılmamış (ikinci doğruluk kaynağı yok).
- İmleç çözümlemesi **koşulsuz**: `:253` `[query.cursor].filter(...)` boş dizi
  üretince `:265` `.map()` sıfır kez koşuyor → "imleç yok" ile "imleç geçersiz"
  farklı **kod yoluna** değil farklı **veriye** ayrılıyor.
- ⚠ **S8 M2'nin gösterdiği tek dayanak:** `apps/api/src/errors/domain/job-not-found.error.ts`
  — `publicDetails` **override EDİLMEMİŞ** (ölçtüm: sınıf gövdesi yalnızca
  `constructor`, `code`/`httpStatus`/`userMessageKey`/`isRetryable` + koşullu
  `context`). `context` de adaptörden **hiç geçirilmiyor** (`raiseJobNotFound()`
  argümansız) → tel gövdesinin `details` alanı `{}` kalıyor.

**Canlı ölçüm (koşturdum):** `vitest run --config vitest.isolation.config.ts
src/__tests__/trpc-cross-tenant.isolation.test.ts` → **1 dosya / 6 test geçti**.
Canlı istek loglarından (NDJSON):

```
req-job-foreign... tenantId=luv8c3... statusCode=404
req-job-absent...  tenantId=luv8c3... statusCode=404
req-job-own...     tenantId=luv8c3... statusCode=200
req-cursor-foreign... tenantId=k2dceg... statusCode=404
req-cursor-absent...  tenantId=k2dceg... statusCode=404
```

Test ayrıca (`:515-522`) iki gövdeyi `requestId` **hariç** birebir eşitliyor
(`requestId` her isteğin kendi değeri), (`:503-509`) vacuous olmadığını
(`JOB_NOT_FOUND` + `errors.job.notFound` + `NOT_FOUND`/404 gerçekten dolu) ve
(`:524-533`) yabancı kiracının `id`/`slug`/`name`'inin **ve** yabancı `jobId`'nin
**ne gövdede ne başlıkta** geçtiğini bayt düzeyinde ölçüyor. Üç olgu (yok /
yabancı / çözülemeyen imleç) tek hata üretiyor.

### DN-5 · DLQ zarfı kiracı taşıyor mu + dört ayaklı telafi → **DOĞRULANDI**

Zarf (`job-runner.ts:130-139`): `jobId · jobName · tenantId · attemptsMade ·
failedAt · payload · error`. `tenantId` **hem üst seviyede hem `payload` içinde**
(`:339-347`) → zarfın kiracısını okumak payload şeklini bilmeyi gerektirmiyor.
`payload` **yalnızca parse edilmiş** veriden (`:418` `parseResult.data`); payload
şemayı karşılamadığında zarf yalnızca kurtarılan `{ tenantId }`'yi taşıyor
(`:408`) — **ham `job.data` zarfa hiç girmiyor**. `queue-dlq.test.ts:276-291`
zarf anahtar kümesini tam olarak pinliyor ve sentetik sırrı arıyor-bulamıyor
(benim koşumumda geçti).

ADR-0015 Karar 1 (`queue-constants.ts:40-62`) — Redis öneki `arkesoft:queue`
kiracıya göre **bölünmüyor**; §7 md 8'den **bilinçli** sapma. Dört ayağı tek tek
ölçtüm:

| Ayak | Ölçüm | Sonuç |
| --- | --- | --- |
| 1 · payload'da zorunlu `tenantId` | `job-payload.base.ts:34` + 5 tip pini | ✅ |
| 2 · handler'ın yapısal `withTenant` kısıtı | DN-1 + DN-2 (iki allowlist zıt yönde) | ✅ |
| 3 · `Job`'un RLS'i | **canlı `psql`** (aşağıda) | ✅ |
| 4 · ham kuyruk içeriğini gösteren yüzey yok | Bull Board ertelendi (K-PM1); `rg "@bull-board"` → 0; DLQ'nun tüketicisi/UI'si yok | ✅ |

**Canlı RLS ölçümü (salt okuma, `docker exec … psql`):**

```
relname | relrowsecurity | relforcerowsecurity | owner
job     | t              | t                   | arkesoft_migrator

polname               polcmd polroles USING / WITH CHECK
job_tenant_isolation  *      {0}      (tenant_id = current_setting('app.tenant_id'::text, true))
                                      (tenant_id = current_setting('app.tenant_id'::text, true))

indexler: job_pkey(id) · job_tenant_id_status_created_at_idx(tenant_id,status,created_at DESC)
          · job_tenant_id_id_key(tenant_id,id)
grant:    arkesoft_app = SELECT/INSERT/UPDATE/DELETE  (TRUNCATE yok)
roller:   arkesoft_app rolsuper=f rolbypassrls=f · arkesoft_migrator f/f
```

`arkesoft_app` rolüyle fail-closed probu (salt okuma):

```
no_ctx_count    = 0   (context YOK → hata değil, 0 satır)
wrong_ctx_count = 0   (yabancı context → 0 satır)
is_superuser=off · rolbypassrls=f
```

`polcmd='*'` (ALL) + `TO PUBLIC` ({0}) + `polqual` **ve** `polwithcheck` ikisi de
NULL değil → çapraz **okuma** ve çapraz **yazma** birlikte kapalı.

**Canlı kod-yolu ölçümü (koşturdum):** `vitest run --config vitest.isolation.config.ts
src/__tests__/queue-tenant-context.isolation.test.ts` → **1 dosya / 5 test geçti**.
Prob handler **üretim sarmalayıcısından** (`createJobProcessor`) geçerek kiracı
B'nin **gerçekten var olan** satırını okumaya ve güncellemeye çalışıyor:
`foreignRowCount=0`, `foreignUpdateCount=0`, `ownRowCount=1`; B'nin satırı
sonradan da `progress=0`/`status=queued`/`startedAt=null` (sayaç 0 dönmesi yeterli
kanıt sayılmamış). Ayrıca `(5)` log kayıtlarının **yalnızca** kiracı A'yı taşıdığını
ölçüyor.
`packages/db` izolasyon süitini de koşturdum: **2 dosya / 21 test geçti**
(`job` probu + canlı katalog linter'ı dahil).

---

## 2. Kendi taramam

### Yetkilendirme / kimlik doğrulama atlatma → bulgu yok

- `job.get`/`job.list` builder'ı `tenantProcedure` = `protectedProcedure.use(requireTenant)`
  (`packages/trpc/src/trpc.ts:244,247`) → **kimlik zorunlu + kiracı zorunlu**.
  `publicProcedure`/`publicTenantProcedure` bu dosyada import **edilmiyor** ve
  adları **anılmıyor** (literal-jeton kuralı gözetilmiş).
- ⚠ **En kritik çapraz-kiracı senaryosunu kovaladım:** "A kiracısında kimliği
  doğrulanmış kullanıcı, B'nin host'una istek atarsa B'nin işlerini okur mu?"
  `requireAuth` yalnızca `ctx.auth.kind === 'authenticated'` kontrol ediyor, üyelik
  kontrol **etmiyor**. Üyelik HTTP katmanındaki global `APP_GUARD`'da:
  `apps/api/src/auth/auth.guard.ts:95-117` → `withTenant(tenantId, tx =>
  tx.tenantMembership.findUnique({ where: { tenantId_userId: ... } }))`, üyelik
  yoksa 403 `TENANT_MEMBERSHIP_REQUIRED` ve gövde `tenantId` **taşımıyor**.
  Önbellekleme yok (A-V26). `/trpc/*path` bu guard'ın kapsamında.
- Muafiyet listeleri ölçüldü: `AUTH_EXEMPT_PATHS`'te tek tRPC yolu
  `/trpc/storefront.currentTenant`; `TENANT_EXEMPT_PATHS`'te `/trpc/session.me`.
  **`job.get`/`job.list` ikisinde de YOK** → ikisi de kimlik + üyelik kapısından
  geçiyor.
- Süper admin erişimi/impersonation bu sürümde yok → §7 md 14 tetiklenmiyor.

### Girdi doğrulama → 1 `low` (S-3)

- Her dış veri Zod'dan geçiyor: `jobGetInputSchema`, `jobListInputSchema`,
  üretici payload (`enqueue`), **worker tarafında tekrar** (`job-runner.ts:380`
  — "araya Redis giriyor" gerekçesiyle iki kez parse), JSONB okuması
  (`JOB_ERROR_COLUMN_SCHEMA.parse`, `safeParse`+yedek **değil** `parse` → hata
  yutulmuyor), `CONFIG GET` yanıtı (`configGetReplySchema`, `as` zorlaması yok).
- `JOB_LIST_MAX_LIMIT = 50` **tel şemasında** zorlanıyor → `limit: 51` resolver'a
  hiç ulaşmıyor. Adaptör sınırı tekrar yazmıyor (ikinci doğruluk kaynağı yok).
- Zod hata mesajları **hiçbir yerde** dışa verilmiyor: `JobPayloadInvalidError`
  yalnızca **alan yollarını** taşıyor (`queue.service.ts:159`,
  `job-runner.ts:387`) — ham Zod mesajı doğrulanan **değeri** içerebilirdi.
- Eksik: `jobListInputSchema.status` dizisinde `.max()` yok → **S-3**.

### Enjeksiyon → bulgu yok

Ham SQL **yok** (`$queryRaw`/`$executeRaw` yeni kodun hiçbir yerinde; adaptör
`TenantTransactionClient` üzerinden gidiyor ve o tip `$queryRaw` **taşımıyor**).
Prisma tüm değerleri parametreleştiriyor. Kullanıcı girdisi dosya yoluna,
komuta, HTML'e veya yönlendirme hedefine **girmiyor** (bu sürümde UI yüzeyi yok).
Komut çalıştırma yok. Redis anahtarları kullanıcı girdisinden **türetilmiyor**
(kuyruk adı `JOB_DEFINITIONS` sabitinden; DLQ `jobId` = sunucu üretimi cuid2).

### Sır sızıntısı → bulgu yok (repoya giren sır yok) + 1 `low` (S-2, ileriye dönük)

- Değişen/yeni 66 TS/MJS/JSON/SQL/YAML dosyasında
  `(password|secret|api[_-]?key|private key|BEGIN .*PRIVATE KEY|bearer|authorization)`
  taraması → **kod satırında 0 eşleşme** (yalnızca yorumlar).
- `.env` dosyasına dokunulmamış; yeni env değişkeni **yok** — kuyruk sabitlerinin
  tamamı modül sabiti (`queue-constants.ts` dosya başı: "HEPSİ MODÜL SABİTİ,
  HİÇBİRİ ENV DEĞİL").
- Log disiplini canlı ölçüldü: her iş kaydında `tenantId` + `jobId` + `jobName`
  (`logger.child` ile **bind**, handler unutamıyor — `job-runner.ts:423`);
  e-posta maskeli (`f***@arkesoft.test`); `console.*` yok (enjekte edilen logger).
- `UNRECOVERABLE_FALLBACK_REASON = 'JOB_UNRECOVERABLE'` → BullMQ'nun Redis'e
  yazdığı `failedReason`'a ham mesaj **yazılmıyor**, yalnızca kararlı hata kodu
  (`job-runner.ts:218-225`).
- Kalan ileriye dönük risk → **S-2**.

### Ödeme / PII / KVKK → kapsam dışı, ihlal yok

Bu sürümde ödeme, webhook, kart verisi veya dosya yükleme yüzeyi **yok**. `Job`
tablosu kişisel veri kolonu taşımıyor (`payload` bugün yalnızca `{ tenantId }`,
`z.object` fazla anahtarı düşürüyor). Silme talebi akışı bozulmuyor — tersine
güçleniyor: `job_tenant_id_fkey … ON DELETE CASCADE` sayesinde kiracı silinince iş
kayıtları da düşüyor (canlı şemada doğrulandı). Üçüncü tarafa veri gitmiyor.

### SSRF / dosya → bulgu yok

Kullanıcı verdiği URL'e istek atan kod **yok**; yeni HTTP istemcisi
eklenmemiş. Dosya yolu/dosya yükleme yüzeyi yok. Tek dış bağlantı `REDIS_URL`
(env şemasından, `packages/config`).

### Oran sınırlama → 1 `low` (S-4)

`rate-limit.policy.ts` yalnızca `POST /auth/sign-in/email` ve
`POST /auth/request-password-reset`'i kapsıyor (`buildPolicy` fail-closed:
`AUTH_DELEGATED_PATHS`'te olmayan bir yol yazım hatası sayılıp fırlatıyor).
**Hiçbir tRPC prosedürü oran sınırlı değil** — yeni iki prosedür dahil → **S-4**.
Canlı Redis'te oran sınırı anahtarları ölçüldü: `platform:auth:<route>:account:<hash>`
ve `:ip:<hash>`, TTL'li, **kiracı verisi taşımıyor** (§7 md 9 ile uyumlu: global
anahtarda kiracı verisi yok).

### Bağımlılık zafiyeti → 1 `low` (S-6)

`pnpm audit`: **critical 0 · high 1 · moderate 1 · low 0 · info 0**

| Sev | Paket | Yol | T-013'te mi geldi? |
| --- | --- | --- | --- |
| high | `multer@2.4.0` (DoS, `>=2.0.0 <2.5.0`) | `@nestjs/platform-express` → multer | **HAYIR** — lockfile diff'inde `multer` satırı **değişmemiş** (bağlam satırı) |
| moderate | `minimatch <11.0.1` (globparts DoS) | `eslint` → minimatch (64 yol, **dev**) | **HAYIR** — aynı şekilde değişmemiş |

`bullmq@6.5.0` + yedi transitif (`cron-parser@5.10.2`, `luxon@3.7.2`,
`msgpackr@2.1.2`, `msgpackr-extract@3.0.6`, `node-abort-controller@3.1.1`,
`node-gyp-build-optional-packages@5.2.2`, ve `tslib`/`semver` mevcut ağaçtan) →
**hiçbirinde advisory yok**. Tedarik zinciri hijyeni iyi ve ölçülmüş:

- `pnpm-workspace.yaml` → `allowBuilds: 'msgpackr-extract': false` — native derleme
  **açıkça reddedilmiş** (izin verilerek değil, reddedilerek kapatılmış); bedeli
  yalnızca performans, kazancı daralmış tedarik zinciri yüzeyi.
- Exact pin (`bullmq: 6.5.0`, `^`/`~` **değil**) — üretici/tüketici arasında sessiz
  anahtar-şeması kayması kabul edilemez olduğu için.
- 7 günlük yayın-yaşı disiplini uygulanmış (6.5.1–6.5.4 eşik altı diye atlanmış,
  `minimumReleaseAgeExclude` muafiyeti **eklenmemiş**).
- `ioredis` peer'ı ölçülmüş: opsiyonel peer, `>=5.0.0` aralığı 6.0.0 pinini
  kapsıyor → ağaçta ikinci bir ioredis sürümü doğmuyor.

### Dayanıklılık / kapanış (AC9 komşuluğu) → bulgu yok

Kuyruk bağlantısı `'queue'` profilinde ayrı bir `ioredis` örneği
(`create-redis-connection.ts`); zorunlu `'error'` dinleyicisi **tek yerde** kayıtlı
(dinleyicisiz `EventEmitter` süreci düşürürdü); `retryStrategy` **üst sınırlı**
(2 sn), kütüphane varsayılanına bırakılmamış. Kapanış iki sorumluluğa ayrılmış ve
çakışmıyor: BullMQ'nun `duplicate()` kopyalarını `worker.close()`, paylaşılan
örneği `QueueLifecycleService` kapatıyor; her adım `withTimeout` bütçeli; hata
**yutulmuyor** ama zincir devam ediyor (yukarı fırlatmak Prisma `$disconnect`
dahil kalan kancaları atlatırdı). `main.worker.ts` watchdog'u `.unref()`'li.
`adım başına transaction` kararı (`job-runner.ts:25-29`) uzun işin bağlantıyı
`idle in transaction` bırakmasını engelliyor.

---

## 3. Bulgular

Hiçbiri `critical`/`high`/`medium` değil. Altı `low` → **düzeltme turu açmaz**,
ROADMAP teknik borç tablosuna gider. Borç satırı metinleri aşağıda hazır.

### S-1 · `low` · `apps/api/src/queue/queue.service.ts:142-176`

**Ne:** `QueueService.enqueue` kiracı kapsamını **payload'dan** türetiyor
(`:172-176` → `createQueuedJob({ tenantId: parsedPayload.tenantId, ... })`), ortamdaki
kimlik/kiracı bağlamından (`TenantContext`/`ctx.tenant.tenantId`) **değil**. Yazıcı
adaptörü (`queue.module.ts:124-136`) RLS GUC'unu o değere kuruyor, dolayısıyla
`WITH CHECK` **geçiyor** — yani `enqueue`, çağıranın seçtiği **herhangi bir**
kiracıya `Job` satırı yazabilen bir ilkel.

**Nasıl istismar edilir (bugün):** **edilemez.** Ölçtüm:
`rg "\.enqueue\(" apps/api packages` → üretim çağıranı **0** (yalnızca beş test
dosyası). `job.get`/`job.list` **salt okunur**, `job.enqueue` diye bir prosedür
yok. Dış dünyadan `enqueue`'a ulaşan hiçbir yol mevcut değil.

**Nasıl istismar edilir (v0.2.0'da, somut):** "Siteyi Kur" mutasyonu
`enqueue(TENANT_PROVISION_JOB, input)` biçiminde yazılırsa — ki imza `payload:
unknown` olduğu için bu **derlenir** — kiracı A'nın oturumuyla `{ tenantId:
"<B'nin kimliği>" }` gönderen bir çağıran, B kiracısı adına bir provisioning işi
kuyruğa alır; iş B'nin bağlamında koşar ve B'nin satırlarına yazar. Bu tam olarak
§7 md 6'nın ("girdideki hiçbir `id` doğrudan güvenilmiyor") kapattığı sınıf, ama
kapı `enqueue`'un **çağıranında** olmak zorunda; `enqueue`'un kendisinde değil.

**Önerilen düzeltme:** v0.2.0'da ilk çağıran yazılırken `enqueue`'a ortam
bağlamından gelen `tenantId`'yi **ayrı bir zorunlu parametre** olarak geçirip
payload'ın `tenantId`'si ile eşitliğini doğrulamak (eşitsizse fırlatmak), veya
payload'dan `tenantId`'yi tamamen çıkarıp sarmalayıcının eklemesini sağlamak.
Bugün kod değişikliği **gerekmiyor**; gereken, kararın v0.2.0 Task'ında bağlayıcı
not olarak taşınması.

**Sorumlu ajan:** `backend` (v0.2.0) · **Vade:** v0.2.0 açılışında, ilk `enqueue`
çağıranından **önce**.

---

### S-2 · `low` · `apps/api/src/queue/job-runner.ts:481` (+ `:333`, `:397`, `:355`) ve `apps/api/src/errors/describe-error-cause.ts:17-24`

**Ne:** Handler hatası `describeErrorCause(error)` ile loglanıyor. O yardımcının
**kendi dosya başı sözleşmesi** birebir şunu yasaklıyor: *"BU HELPER'I kullanıcı
E-POSTASI gibi ÜÇÜNCÜ TARAF/SERBEST METİN içerebilecek bir `cause` için
KULLANMAYIN — `causeMessage` alanı o metni OLDUĞU GİBİ taşır"* (ölçülmüş emsal:
bir SMTP hatasının `.message`'ı alıcının tam e-posta adresini içeriyordu).
`job-runner.ts`'in hata yolu **jenerik** — hangi handler'ın hangi hatayı
fırlattığını bilmiyor. Buna **R-S6-1** ekleniyor: yeniden denenebilir hata
**olduğu gibi** fırlatıldığı için (`:493`) BullMQ `failedReason` + `stacktrace`'i
Redis'e yazıyor ve o kayıt kiracıya kapsamlı **değil**.

**Nasıl istismar edilir (bugün):** **edilemez.** Kayıtlı tek handler
(`jobs/tenant-provision/handler.ts`) bir iskelet; dış servise **hiç** dokunmuyor
(`ctx.withTenantDb` bile çağrılmıyor) ve serbest metinli hata üretmiyor. Bu yola
bugün düşebilen hatalar yalnızca bizim `AppError`'larımız (alan yolları taşıyan
`JobPayloadInvalidError`) ve Prisma/teknik hatalar — helper'ın **güvenli olduğunu
söylediği** sınıf. Bull Board ertelendiği için (K-PM1) BullMQ'nun kaydını
kullanıcıya açan bir yüzey de yok; bizim iki yüzeyimiz (`Job.error`, DLQ zarfı)
DN-3'te ölçüldüğü gibi **redakte**.

**Nasıl istismar edilir (v0.2.0'da, somut):** gerçek kurulum adımları (DNS, SSL,
SMTP, e-fatura, pazaryeri) eklendiğinde; örneğin bir sağlayıcı istemcisinin
`401 Unauthorized: token=sk_live_...` biçimli mesajı veya bir SMTP hatasının tam
alıcı adresi, (a) `JOB_ATTEMPT_FAILED_LOG_EVENT` log satırına `causeMessage` olarak
ve (b) BullMQ'nun Redis `failedReason`/`stacktrace`'ine **tam hâliyle** düşer.
(b) kiracıya kapsamlı olmadığı için Redis'e erişen bir operatör/sızıntı tüm
kiracıların hata metinlerini tek yerde görür. CLAUDE.md §4 "asla loglanmaz"
listesinin (token, tam e-posta, tam adres) ihlali olur.

**Önerilen düzeltme:** v0.2.0'da entegrasyon çağrıları `IntegrationError`'a
çevrilirken serbest metin **adaptör içinde** allowlist'li bir indirgeyiciden
geçirilsin (emsal: `auth-instance.ts`'in `describeBetterAuthLogCause`'u); ve
yeniden denenebilir hata BullMQ'ya iletilirken `UnrecoverableError`'daki desenin
aynısıyla (yalnızca kararlı kod) sarılsın — `job-runner.ts:218-225` bunun nasıl
yapıldığını zaten gösteriyor.

**Sorumlu ajan:** `backend` (v0.2.0) · **Vade:** v0.2.0'da ilk gerçek dış çağrı
eklenmeden önce.

---

### S-3 · `low` · `packages/trpc/src/schemas/job-summary.schema.ts:152`

**Ne:** `status: z.array(jobStatusSchema).optional()` — **üst sınır yok**. Dört
enum değeri doğrulanıyor ama dizi **uzunluğu** sınırsız; yinelenen değerler de
geçerli. Değer doğrudan `status: { in: value }` ile Prisma'ya gidiyor
(`job-read.port.adapter.ts:177-179`).

**Nasıl istismar edilir:** kiracının **kimliği doğrulanmış ve üye** bir
kullanıcısı `job.list`'e `{"status":["queued","queued", … binlerce kez]}` gönderir;
Postgres'e binlerce elemanlı bir `status IN (...)` listesi taşıyan sorgu gider ve
plan/parse maliyeti istek başına büyür. Sınır HTTP tarafından dolaylı: tRPC
`query` GET olduğundan URL, Node'un ~16KB başlık sınırına takılıyor (~1,3k eleman);
POST yolu açıksa Nest'in varsayılan `express.json()` 100KB sınırı (~12k eleman).
Yani **gerçek ama sınırlı** bir CPU amplifikasyonu; veri sızıntısı yok, kimlik
gerekiyor, kiracı dışına çıkmıyor.

**Önerilen düzeltme:** `.max(4)` ekle (sözlük dört değerli; dörtten fazlası
anlamsız). Tercihen `limit`'in yanındaki aynı satırda — şema **sözleşme**
olduğu için sınır adaptöre değil buraya ait. ⚠ Çıktı şemasına değil **girdi**
şemasına ekleniyor, dolayısıyla public API için kırıcı değil (daha önce geçerli
olan 5+ elemanlı bir istek reddedilmeye başlar; bugün böyle bir istemci yok).

**Sorumlu ajan:** `backend` · **Vade:** v0.0.12 veya `job.list`'e ilk gerçek
istemci bağlanmadan önce.

---

### S-4 · `low` · `apps/api/src/auth/rate-limit/rate-limit.policy.ts:36-41` (kapsam) ↔ `packages/trpc/src/routers/job.router.ts:39,44`

**Ne:** Oran sınırlama **yalnızca** iki Better Auth yolunu kapsıyor
(`POST /auth/sign-in/email`, `POST /auth/request-password-reset`). `/trpc/*`
yüzeyinin **hiçbir** prosedürü oran sınırlı değil; v0.0.11'in eklediği iki
prosedür de değil.

**Nasıl istismar edilir:** kiracının üye bir kullanıcısı (veya ele geçmiş bir
oturum) `job.list?limit=50`'yi saniyede yüzlerce kez çağırır; her istek üyelik
doğrulaması (bir `withTenant` transaction'ı + `tenantMembership.findUnique`,
**önbelleksiz** — A-V26) **artı** `limit+1` satırlık bir keyset sorgusu açar.
Gizlilik etkisi **yok** (kullanıcı yalnızca kendi kiracısının verisini görüyor,
sayfa boyutu 50'de tel şemasıyla sabit); etki yalnızca DB/bağlantı havuzu
bütçesinde. ⚠ Bu **T-013'ün ürettiği bir gerileme değil** — `tenant.*`,
`session.me`, `storefront.currentTenant` de aynı durumda; platformun v0.0.6'dan
beri taşıdığı yapısal boşluk. Yeni iki uç o boşluğa **ekleniyor**.

**Önerilen düzeltme:** tRPC yüzeyi için prosedür-bazlı (kiracı + IP) bir oran
sınırı katmanı — `RateLimitService` zaten var ve kiracı taşımayan platform
anahtarları kullanıyor; eksik olan politika tanımı ve `/trpc` yolunu kapsayan
guard. Bu bir **sürüm kapsamı** işi, T-013 içinde yapılmamalı.

**Sorumlu ajan:** `architect` (politika tasarımı) + `backend` (uygulama) ·
**Vade:** panel gerçek trafiğe açılmadan önce (v0.1.0 civarı).

---

### S-5 · `low` · `apps/api/src/queue/queue-worker.module.ts:160-175` + `apps/api/src/queue/queue-constants.ts:40-62`

**Ne:** DLQ'nun **tüketicisi yok** ve **retention seçeneği bilerek verilmiyor**
("bir park yerinin kendi kendini silmesi onu park yeri olmaktan çıkarırdı" — R-A11).
Aynı zamanda AC10 kapısı Redis'in `maxmemory-policy = noeviction` olmasını
**zorunlu** kılıyor (`assert-queue-capable-redis.ts`). İkisi birlikte: DLQ sınırsız
büyüyebilir ve Redis anahtarları **tahliye edilemez**.

**Nasıl istismar edilir:** sistematik olarak başarısız olan bir iş türü (v0.2.0'da
bozuk bir sağlayıcı yapılandırması ya da kuyruğa iş atabilen bir kiracı) her
terminal başarısızlıkta DLQ'ya kalıcı bir zarf yazar. Zarflar birikir, Redis
bellek sınırına ulaşır, `noeviction` yüzünden **yazma reddi** başlar ve kuyruk
**tüm kiracılar için** durur (paylaşılan anahtar alanı — ADR-0015 Karar 1). Yani
tek bir kiracının başarısız işleri platform genelinde bir kullanılabilirlik
olayına dönüşebilir. Bugün dış `enqueue` yüzeyi olmadığı için tetikleyici yok.

**Önerilen düzeltme:** DLQ için bir üst sınır/alarm (kuyruk derinliği metriği
v0.15.0'ın süper admin sağlık panosu kapsamında zaten planlı) ve DLQ'yu boşaltan
bir operatör akışı. "Park yeri kendi kendini silmesin" kararı korunarak, sınır
**alarm** olarak uygulanabilir — silme olarak değil.

**Sorumlu ajan:** `devops` (alarm/metrik) + `architect` (politika) ·
**Vade:** v0.15.0 (sağlık panosu) — ⚠ ama v0.2.0'da kuyruğa gerçek iş akmaya
başladığında yeniden değerlendirilmeli.

---

### S-6 · `low` · `pnpm-lock.yaml` (değiştirilmemiş satırlar) — `multer@2.4.0`, `minimatch<11.0.1`

**Ne:** `pnpm audit` **1 high + 1 moderate** döndürüyor. Checklist maddem
("kritik/yüksek açık yok") **karşılanmıyor**.

**Nasıl istismar edilir:** `multer` advisory'si "request teardown sonrası
bekleyen asenkron `fileFilter` üzerinden DoS". `multer` ağaca
`@nestjs/platform-express`'in transitifi olarak giriyor. **Erişilebilirlik sıfır:**
repoda hiçbir multipart/dosya yükleme rotası yok (`FileInterceptor`/`multipart`
araması boş), yani `fileFilter` kod yolu hiç çalışmıyor. `minimatch` yalnızca
`eslint` üzerinden **dev** ağacında (64 yol) — üretim bundle'ında yok.

**Önem derecesi gerekçesi (AGENT_BASELINE §4: "emin değilsen bir alt seviyeyi seç
ve gerekçesini açıklamaya yaz"):** advisory `high` ama (a) **T-013 bu ikisini
getirmedi** — lockfile diff'inde her iki satır da bağlam satırı, değişmemiş;
(b) somut saldırı senaryosu **kurulamıyor** (çağrılabilir kod yolu yok).
Bu yüzden `low` yazıyorum ve `high`'a çıkarmıyorum. ⚠ Orkestratör bu
değerlendirmeyi reddedip `high` saymak isterse gerekçem burada açık duruyor —
karar kuralı değil, erişilebilirlik ölçümü.

**Önerilen düzeltme:** `@nestjs/platform-express`'i `multer >= 2.5.0` çeken bir
sürüme yükseltmek (veya `pnpm.overrides` ile multer'ı pinlemek); `eslint`
güncellemesiyle `minimatch >= 11.0.1`. İkisi de bağımsız bir bakım PR'ı.

**Sorumlu ajan:** `devops` · **Vade:** bir sonraki bakım penceresi; ⚠ ilk dosya
yükleme ucu (ROADMAP'te medya yönetimi) açılmadan **önce** multer **zorunlu**.

---

## 4. DOĞRULANAMADI

| Ne | Sebep |
| --- | --- |
| `pnpm lint` / `typecheck` / `build` / `format:check`'in tam koşumu | Koşturma yasağı (`solid` paralel, `qa` sonra). Handoff'un AC11 ölçümünü (hepsi exit 0) **devraldım**, kendim ölçmedim. Tip pinlerinin (`job-tenant-scope.pin.ts`, `trpc-wire-contract.pin.ts`) **derlendiğini** bu yüzden bağımsız doğrulamadım — kaynak kodunu okuyarak `@ts-expect-error` yerleşimini ve `TS2578` mekanizmasını inceledim, ama derleyici çıktısını görmedim. |
| `pnpm test` / `pnpm test:isolation` tam süiti (1149 + 33 test) | Aynı yasak. Yerine **güvenlik açısından en kritik dört dosyayı** tek tek koşturdum: `queue-dlq.test.ts` (4/4), `queue-tenant-context.isolation.test.ts` (5/5), `trpc-cross-tenant.isolation.test.ts` (6/6), `packages/db` izolasyon süiti (21/21). |
| `eslint --stdin` ile `src/queue/jobs/**` içinde **gerçek** bir ihlal dosyasının lint'ten geçirilmesi | Tip-bilinçli yapılandırma dosyayı proje servisinde bulamadığı için parse hatası verdi (`was not found by the project service`). Diske dosya yazmak yasak olduğundan iki parçalı ikameye geçtim: (a) `--print-config` ile **etkin kural seti**, (b) izole bir `espree` koşumuyla **desenlerin fiilen ateşlendiği**. Birlikte aynı iddiayı kanıtlıyorlar; tek eksik, ihlalin **o dizindeki gerçek bir dosyada** raporlandığının görülmesi. |
| Üretimde `CONFIG GET` yasaklı yönetilen Redis davranışı | AC10 kapısı `NODE_ENV=test` ile sınırlı; üretim yolu bu sürümde yok (v0.18.0 borcu, `assert-queue-capable-redis.ts` dosya başında yazılı). |
| R-S7-1 (`pg_stat_activity == 0` ölçümünün süreç ölümünü temiz kapanıştan ayırmaması, `shutdown.test.ts:161-165`) | **Güvenlik bulgusu olarak sınıflandırmadım, bilinçli.** Bu bir **test kalitesi** boşluğu: ölçüm yanlış sebeple yeşile düşebilir. Saldırı yüzeyi üretmiyor, veri sızdırmıyor, yetki atlatmıyor. `qa` gate'inin alanı; security olarak `low` bile yazmıyorum ki borç tablosunda yanlış kategoriye girmesin. ⚠ Orkestratöre not: S7 bunu AC9 için kapattı, AC11 için **kapatmadı** ve o dosya S7'nin kapsamı dışıydı — `qa`'ya taşınmalı. |

---

## 5. §7'nin 14 maddesi — madde bazlı sonuç

| # | Madde | Sonuç | Kanıt |
| --- | --- | --- | --- |
| 1 | `tenant_id` NOT NULL | ✅ | canlı şema: `"tenant_id" TEXT NOT NULL` |
| 2 | RLS etkin + `current_setting` politikası | ✅ | canlı: `relrowsecurity=t`, `relforcerowsecurity=t`, kanonik USING+WITH CHECK |
| 3 | `(tenant_id, …)` bileşik indeks | ✅ | canlı: `(tenant_id, status, created_at DESC)` + `(tenant_id, id)` |
| 4 | `tenantProcedure`, `publicProcedure` değil | ✅ | `job.router.ts:39,44`; muafiyet listelerinde yok |
| 5 | `withTenant()` üzerinden, ham `prisma` yok | ✅ | adaptör + yazıcı + sarmalayıcı hepsi `withTenant`; `AppPrismaDatabase`'de `job` yok → ham çağrı **derlenmez** |
| 6 | Girdideki `id`'ye güvenilmiyor, sahiplik doğrulanıyor | ✅ | `jobId` girdiden, sahipliği **RLS** doğruluyor; `where: { tenantId }` yazılmamış (tek kaynak) |
| 7 | Kuyruk payload'ında `tenantId` + worker context kuruyor | ✅ | 4 katman + `queue-tenant-context.isolation.test.ts` 5/5 (koşturdum) |
| 8 | Dış kaynak tenant kapsamlı | ⚠ **bilinçli sapma** | ADR-0015 Karar 1; dört ayaklı telafi DN-5'te **tek tek** doğrulandı |
| 9 | Önbellek anahtarı `tenant:{id}:…`; global anahtarda kiracı verisi yok | ✅ | kuyruk için önbellek yok; canlı Redis'te yalnızca `platform:auth:*` (hash'li, kiracı verisi **yok**) + iki `arkesoft:queue:*:meta` |
| 10 | Dosya yolu tenant önekiyle doğrulanıyor | n/a | bu sürümde dosya yüzeyi yok |
| 11 | `createTenantIsolationSuite()` çapraz **okuma + yazma** | ✅ | `job.probe.ts` + yedi senaryo; `packages/db` süiti 21/21 (koşturdum) |
| 12 | Hata mesajı başka kiracının varlığını sızdırmıyor | ✅ | DN-4; `trpc-cross-tenant.isolation.test.ts` 6/6 (koşturdum) |
| 13 | Log kayıtlarında `tenantId` | ✅ | `logger.child({tenantId, jobId, jobName})`; canlı NDJSON çıktısında doğrulandı |
| 14 | Süper admin erişimi → denetim kaydı | n/a | bu sürümde süper admin/impersonation yüzeyi yok |

**Karşılanmayan madde numarası: yok.** Md 8 **bilinçli, ADR'ye bağlı ve telafisi
dört ayrı mekanizmayla ölçülmüş** bir sapmadır; md 10 ve 14 bu sürümde
tetiklenmiyor.

---

## ÖLÇÜMLER

```
GATE SONUCU               PASS  (critical 0 · high 0 · medium 0 · low 6)

pnpm audit                critical 0 · high 1 · moderate 1 · low 0 · info 0
                          high      → multer@2.4.0   (transitif, ERİŞİLEMEZ, T-013 getirmedi)
                          moderate  → minimatch<11.0.1 (dev/eslint, T-013 getirmedi)
                          bullmq@6.5.0 + 7 transitif → advisory 0

İncelenen dosya           58  (kuyruk çekirdeği 15 · redis 4 · trpc sözleşmesi 7 ·
                               db şema/migration/probe/client 6 · auth/guard/oran sınırı 7 ·
                               test dosyaları 9 · lint/config/manifest 5 · errors 5)
Gözden geçirilen diff     27 değişmiş + 26 yeni dosya (git diff HEAD --stat)

§7 karşılanmayan madde    YOK
  md 8  → bilinçli sapma (ADR-0015 Karar 1), dört ayaklı telafi tek tek doğrulandı
  md 10 → n/a (dosya yüzeyi yok) · md 14 → n/a (süper admin yüzeyi yok)

KENDİ KOŞTURDUĞUM TESTLER (tam süit DEĞİL, dosya bazında)
  queue-dlq.test.ts                            1 dosya /  4 test  PASS
  queue-tenant-context.isolation.test.ts       1 dosya /  5 test  PASS
  trpc-cross-tenant.isolation.test.ts          1 dosya /  6 test  PASS
  packages/db izolasyon süiti                  2 dosya / 21 test  PASS
                                               ---------------------------
                                               5 dosya / 36 test  PASS, 0 skipped

KENDİ KOŞTURDUĞUM DİĞER ÖLÇÜMLER
  canlı psql (salt okuma)   job: RLS t/t · polcmd '*' · TO PUBLIC · USING+WITH CHECK dolu
                            arkesoft_app: rolsuper=f rolbypassrls=f · TRUNCATE grant YOK
                            fail-closed probu: context yok → 0 satır (hata değil)
                                               yabancı context → 0 satır
  eslint --print-config     src/queue/jobs/** → 11 path + 4 pattern grubu; BEŞ kısıtlama
                            yeniden beyan edilmiş + kuyruk yasağı EKLİ
  izole espree lint         `**/prisma/**` 4 farklı derinlikte ateşledi (PATTERN-HIT ×4)
                            `@arkesoft/db`[withTenant] ateşledi (PATH-HIT ×1)
  node + zod                appErrorBodySchema.parse fazla 3 anahtarı DÜŞÜRDÜ, sır sızmadı
  grep kapıları             payload ∉ job-summary.schema.ts (0) · if( ∉ router+adaptör (0)
                            input.tenantId ∉ packages/trpc/src (0)
                            from '@arkesoft/db' ∉ packages/trpc/src (0)
                            QueueWorkerModule ∉ app.module.ts (0)
                            .enqueue( üretim çağıranı (0)
                            sır jetonları, 66 değişmiş dosya, kod satırı (0)

ORTAM NOTU (kendi koşumlarımın yan etkisi, qa için)
  Redis DBSIZE  0 → 7   (5× platform:auth:* oran sınırı sayacı, TTL 865–3565 sn;
                         2× arkesoft:queue:*:meta — Queue kurulumunun doğal artığı)
                        sign-in IP sayacı = 3 / LOGIN_IP_LIMIT 20 → qa için bütçe sorunu YOK
  job tablosu   1 satır (⚠ BENİM DEĞİL: created_at 14:07 UTC, koşumlarım 18:24 UTC;
                         demo-magaza kiracısında bayat `queued` — üretim fazının artığı.
                         Orkestratörün "0 satır" ölçümü artık geçerli DEĞİL.
                         Bayat queued/running tespiti = v0.15.0 borcu, ilk gerçek örneği.)
  Yazma yapmadım: CONFIG SET yok · FLUSHALL/FLUSHDB yok · elle Postgres yazması yok ·
                  kaynak dosya değişikliği yok (git status yeni dosya üretmedi)
```

**Beş bağlayıcı denetim noktası — özet:** DN-1 ✅ · DN-2 katman 1 ✅ / katman 2 ✅ /
katman 3 ✅ (boşluk arandı, `worker-shutdown.test.ts` kapatıyor) / katman 4 ✅
(iki bağımsız ölçüm) · DN-3 ✅ (sentetik sır canlı ölçüldü) · DN-4 ✅ (canlı HTTP,
iki gövde `requestId` hariç birebir) · DN-5 ✅ (dört ayak tek tek).

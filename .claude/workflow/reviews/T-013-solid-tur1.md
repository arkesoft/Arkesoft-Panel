# T-013 · solid gate · tur 1

Tarih: 2026-11-03 · Sürüm: **v0.0.11** · Task: **T-013** · Dal: `main`
Araçlar: **okuma + grep + glob** (Bash yok — test/lint/build KOŞTURULMADI)

```
GATE: solid
SONUÇ: PASS
```

İki `medium` bulgu var → AGENT_BASELINE §4: **1–2 medium → PASS**, bulgular teknik borca
kaydedilir. `critical`/`high` **yok**.

---

## BULGULAR

### M-1 · [SEV: medium] `apps/api/src/queue/job-runner.ts:296-307` + `:498-507`

**Ne:** eksik negatif test + mekanik olarak garanti edilmeyen tel değişmezi.

`Job.error`'ın yalnızca terminal denemede yazılması kararının (S6 kararı 1) **koruduğu
davranış test edilmiyor**: "1.–2. denemede başarısız, 3. denemede BAŞARILI" senaryosu
hiçbir testte yok (`queue-dlq.test.ts` dört vakası: retryable→DLQ · `isRetryable:false`
→1 deneme · `AppError` olmayan · payload geçersiz; `queue-happy-path.test.ts:434`'ün
"iki kez koşuyor" testi **her zaman başarılı** bir handler kullanıyor).

Dahası `packages/trpc/src/schemas/job-summary.schema.ts:93-96` bunu tele **beyan
ediyor**: *"`status === 'completed'` ile dolu bir `error` birlikte GÖRÜLEMEZ."*
Bu beyan mekanik değil: ADIM 5 (`job-runner.ts:498-507`) `where: { id: jobId }` ile
**koşulsuz** `completed` yazıyor (durum yüklemi YOK — ADIM 3'teki yüklemin karşılığı
burada yok) ve `error` kolonunu **temizleyemiyor** (`packages/db/src/index.ts:52`
`export type { Prisma }` → `Prisma.DbNull` değer olarak yok). K1.c'nin zorla kapanış
+ stalled yeniden teslim tasarımı aynı `jobId`'nin tekrar koşmasını **açıkça
öngördüğü** için `failed` + dolu `error` bir satır `completed`'e dönebilir ve `error`
**bayat kalır** — kararın engellemek için var olduğu çelişkinin ta kendisi.

**Neden kusur:** beyan ile gerçeklik boşluğu (bu reponun T-011/T-012'de beş kez
tekrarlanan kusur sınıfı). K5 adım 6'nın **birebir** okumasına dönen bir "düzeltme"
1149 testin hiçbirini kırmaz.

**Önerilen yön:** (a) bir deneme başarısız olup sonrakinde başaran prob handler'ı ile
test: `status === 'completed' && error === null && handlerCalls === 2`; (b) terminal
muhasebe sonrası yeniden teslim yolunu da ölçen bir vaka **veya** `job-summary.schema.ts`
yorumunun değişmezi dürüstçe daraltması. `packages/db`'ye `Prisma` **değer**
namespace'ini açmak ÖNERİLMEZ (`client.ts:163-174` allowlist disiplinini zayıflatır);
gerekirse tek üyeli bir `JSON_NULL` dışa açımı ayrı bir sürüm kararıdır.

**Sorumlu ajan:** `qa` (test), `backend` (yorum/değişmez)

---

### M-2 · [SEV: medium] `apps/api/src/main.worker.ts:73-77` ve `:175-183`

**Ne:** gerçek tekrar (DRY) — süreç çökme politikası iki giriş noktasında kopya.

`main.ts:27-31` ↔ `main.worker.ts:73-77`: `crashLogger` + `toLoggableError` **birebir**.
`main.ts:48-56` ↔ `main.worker.ts:175-183`: `unhandledRejection` + `uncaughtException`
kancaları **birebir**, log mesajı literalleri dahil. Yorumun kendisi *"`main.ts` ile
BİREBİR aynı desen"* diyor — senkron kalmasını sağlayan **hiçbir mekanizma yok**.

Ek kanıt: `queue-worker.module.ts:79` `WORKER_SHUTDOWN_WATCHDOG_MS = 10_000` ve dokümanı
*"`main.ts:63-69`'un BİREBİR değeri"* diyor; `main.ts:67` değeri **ayrıca** `10_000`
olarak sabit yazıyor (bugün doğru, kilitli değil).

**Neden kusur:** tek bir kavramın (süreç seviyesi beklenmeyen hata politikası) iki
kopyası. Politika birinde değişirse (ör. kapanışta log flush) worker **sessizce**
ayrışır ve worker çökmesinin kaydı kaybolur. Aynı kusur sınıfı (kopya kayıt ayrı
evriliyor) `create-redis-connection.ts:17-23` ve `worker.module.ts:25-29`'da **açıkça
reddedilmiş** — burada uygulanmamış.

**Önerilen yön:** `installProcessCrashHandlers(logger)` + paylaşılan watchdog sabitini
küçük bir modüle (`src/process/`) çıkar; iki giriş noktası onu çağırsın.
`toLoggableError` yerine mevcut `describeErrorCause()` kullanılsın (`main.worker.ts:94`
zaten kuyruk kodunun geri kalanından — `job-runner.ts`, `queue-lifecycle.service.ts` —
ayrışıyor). ⚠ Düzeltme `main.ts`'e dokunur; o dosya bu Task'ın kapsamında DEĞİL →
Orkestratör tercih ederse borç satırı olarak kalabilir.

**Sorumlu ajan:** `backend`

---

### L-1 · [SEV: low] `apps/api/src/queue/job-runner.ts:73,81,164,174,179` + `apps/api/src/queue/jobs/tenant-provision/index.ts:22-23`

Tüketicisi OLMAYAN export'lar (ölçüldü, repo geneli grep): `JOB_PROGRESS_MIN`,
`UNRECOVERABLE_FALLBACK_REASON`, `resolveAttemptNumber`, `isFinalAttempt`,
`clampProgressPercent` — hepsi yalnızca kendi dosyasında kullanılıyor, hiçbir test de
import etmiyor. `index.ts:22-23` ise barrel'ın **kendi başlık yorumunun (`:8-12`) yasakladığı**
yolu (şemayı barrel'dan almak) dışa açıyor; `TenantProvisionStep` de kullanılmıyor.
Ayrıca `clampProgressPercent`'in `!Number.isFinite` dalı üretimde ulaşılamaz
(`TENANT_PROVISION_STEPS` literal yüzdeler veriyor).
**Yön:** export'ları kaldır (modül-içi tut); barrel yalnızca `tenantProvisionHandler`
(+ testin kullandığı `TENANT_PROVISION_STEPS`) açsın. **Vade:** v0.0.12. **Sorumlu:** `backend`

### L-2 · [SEV: low] `apps/api/src/trpc/ports/job-read.port.adapter.ts:283`

`peeked.flatMap(() => page.slice(-1).map((row) => row.id))[0] ?? null` — dalsız
kombinatör üslubu, **hiçbir oracle garantisi taşımadığı** yerde. "Sonraki sayfa var mı"
sorusunun varlık oracle'ıyla ilgisi yok; `page.at(-1)?.id ?? null` (üçlü operatörle
korunarak) hem eşdeğer hem `if`siz. `:253` ve `:265-267`'deki aynı üslup **gerekli**
(tek `throw` noktası = ayrımın yazılamazlığı) — bu satır onu taklit ediyor.
**Yön:** yalnızca `:283`'ü okunur hâle getir. **Vade:** v0.0.12. **Sorumlu:** `backend`

### L-3 · [SEV: low] `apps/api/src/queue/job-runner.ts:361-510`

`createJobProcessor`'ın döndürdüğü kapanış **150 satır** (dosya 511, fonksiyon toplam
224). K5'in *"tek yer"* şartı KARŞILANIYOR ve iş türüne özgü dallanma **sıfır**
(ölçüldü: `'tenant.provision'` literali tüm `src/queue/` içinde yalnızca
`job-registry.ts:45`'te). Ancak üç durum geçişi yazımı (`running`+`startedAt` ·
`completed`+`progress`+`completedAt` · `failed`+`error`) adlandırılmamış satır içi
bloklar hâlinde. **Yön:** aynı dosyada `markRunning`/`markCompleted` benzeri modül-içi
fonksiyonlara çıkar (adım başına transaction değişmezi korunur, kapanış ~90 satıra
iner). **Vade:** v0.0.12. **Sorumlu:** `backend`

### L-4 · [SEV: low] `apps/api/src/queue/queue.tokens.ts:20-21` · `apps/api/src/queue/job-definition.ts:8` · `apps/api/src/queue/queue.service.ts:89`

Üç yanlış/aşırı beyan:
1. `queue.tokens.ts:20-21` — *"İş adı → (`Queue`, DLQ `Queue`, **tanım**) eşlemesi"*;
   `JobQueueEntry` (`queue.service.ts:66-69`) **tanım taşımıyor**, iki üyesi var.
2. `job-definition.ts:8` — *"İkinci iş türü eklemek `job-registry.ts`'te BİR SATIRdır"*;
   gerçek maliyet **dört dosyada altı dokunuş**: `jobs/<ad>/{payload.schema,handler,index}.ts`
   · `queue-constants.ts`'te `<AD>_CONCURRENCY` · `job-registry.ts`'te tanım + dizi
   · `queue-worker.module.ts:104`'te `registerJobRunner` satırı. Doğru ve hâlâ güçlü
   olan iddia: *"kuyruk ÇEKİRDEĞİNDE sıfır değişiklik"* (`queue.module.ts:5`,
   `job-runner.ts:8` bunu doğru söylüyor).
3. `queue.service.ts:89` — *"`QueueService` Prisma'yı HİÇ GÖRMEZ"*; `:28` `Prisma`'yı
   **tip olarak** import ediyor. Özsel garanti (istemci erişimi yok ⇒ kiracı filtresiz
   sorgu yazılamaz) geçerli, cümle fazla geniş.
**Yön:** üç cümleyi ölçülmüş hâle getir. **Vade:** v0.0.12. **Sorumlu:** `docs`/`backend`

### L-5 · [SEV: low] `apps/api/src/queue/queue-worker.module.ts:71-74` ve `:87-89`

Sabit/token yerleşiminin gerekçesi *"o dosya bu alt görevin dosya sahipliği dışında"*.
Bu bir **ajan iş akışı artefaktı**, beş yıl sonra okunacak bir tasarım ilkesi değil:
sonuç, kuyruk DI token'larının **iki** dosyaya (`queue.tokens.ts` + modül) ve kuyruk
sabitlerinin **iki** dosyaya dağılması. İkincil gerekçe (*"tüketici kararları tüketici
modülüyle okunur"*) tek başına savunulabilir. **Yön:** gerekçeyi kalıcı olanla değiştir
veya sembolleri tek kaynağa topla. **Vade:** v0.0.12. **Sorumlu:** `backend`

### L-6 · [SEV: low] `apps/api/src/queue/queue-worker.module.ts:54-55`

Aynı modülden **iki ayrı** import satırı (`JOB_DEFINITIONS` ve `TENANT_PROVISION_JOB`,
ikisi de `./job-registry.js`). Lint yakalamıyor (`import/no-duplicates` kapalı).
**Yön:** tek satırda birleştir. **Vade:** fırsat buldukça. **Sorumlu:** `backend`

### L-7 · [SEV: low] `apps/api/src/main.worker.ts:112-118`

Watchdog logu satır içi literal (*"Worker kapanışı zaman aşımına uğradı, süreç zorla
sonlandırılıyor"*) ve `queue-log-events.ts:104`'teki `WORKER_FORCE_CLOSED_LOG_EVENT`
(*"worker kapanışı zaman aşımına uğradı, zorla kapatılıyor"*) ile **neredeyse aynı**.
Operatör logda *"zaman aşımına uğradı"* arayınca iki farklı olay görüyor, biri sabit
biri değil. **Yön:** iki olayı ayırt edilir hâle getir (ya da watchdog'u da sabite al).
**Vade:** v0.0.12. **Sorumlu:** `backend`

### L-8 · [SEV: low] `apps/api/src/__tests__/queue-happy-path.test.ts:297-309` · `apps/api/src/__tests__/trpc-job-read-port-adapter.test.ts:436-442`

İki test **kaynak metni** üzerinde assert ediyor:
(a) handler'ın `.ts` dosyasını okuyup `'withTenantDb'`/`'PrismaService'` dizelerini
arıyor — `//` ile başlamayan bir blok yorumu (`/** */`) yanlış kırmızı verir, ileride
bir yeniden adlandırma yanlış **yeşil** verir; ayrıca `eslint.config.mjs`'in beşinci
kümesi ve `AppPrismaDatabase` allowlist'i bunu zaten **mekanik** olarak zorluyor.
(b) indeks iddiası **diskteki tek migration dosyasının** metnine bakıyor — sonraki bir
migration indeksi değiştirirse test yeşil kalır (canlı katalog ölçümü `packages/db`
linter'ında ama **kolon sırası** oradaki kuralın konusu değil).
**Yön:** (a) kaldırılabilir (üç mekanik katman var); (b) canlı katalogdan
(`pg_indexes`/`pg_index`) oku. **Vade:** v0.0.12. **Sorumlu:** `qa`

---

## SEKİZ İNCELEME NOKTASI — SONUÇLAR

| # | Konu | Sonuç |
| --- | --- | --- |
| 1 | `JobDefinition` ikiye ayrıldı | **GEREKÇE GEÇERLİ · daha iyi alternatif YOK.** Alıntı doğrulandı (`job-definition.ts:28-30`). `handler?`'ın reddi sağlam: opsiyonel handler "tüketicisi olmayan iş" durumunu **tip düzeyinde meşru** kılardı. Üçüncü alternatif (kayıt defterini tüketici tarafına taşımak) ÖLÇEREK reddedilir: üretici (`queue.module.ts:86`) defteri gezmek zorunda → handler modülü HTTP sürecinin grafiğine girerdi (`job-registry.ts:29-33`'ün kaçındığı şey). Kesişim tipi + `registerJobRunner`'ın jeneriği, eşleşmeyi **derleme zamanında** kilitliyor (`type-pins/job-tenant-scope.pin.ts:107-130` bunu negatif olarak pinliyor) |
| 2 | `QueuedJobWriter` portu | **GEREKÇE GEÇERLİ.** `queue.service.ts:95-98` + adaptör `queue.module.ts:124-142` (tek yazma yolu `withTenant`). İkinci kazanç ölçüldü: `queue-enqueue.test.ts` tek fonksiyonluk ikizle sıralamayı ve `jobId` eşlemesini **gerçek** assert'lerle pinliyor. Yapısal takviye: `packages/db/src/client.ts:163-174` — `prisma.db.job.*` **derlenmez**. Tek not: "Prisma'yı HİÇ GÖRMEZ" cümlesi fazla geniş (L-4/3) |
| 3 | `ProcessableJob` dar yapısal tip | **GEREKÇE GEÇERLİ ve ÖLÇÜLDÜ.** Yeni test dosyalarında `as` sayısı **0** (grep) → `as unknown as Job<…>` gerçekten gerekmiyor. İmza uyumu `queue-worker.module.ts:192-194`'te derleme zamanında kanıtlı. `attemptsMade`'in 0 tabanlı olduğu ölçülmüş olgu olarak belgeli (`job-runner.ts:92-97`) ve `queue-dlq.test.ts:243` ile çalışma zamanında teyitli |
| 4 | `Job.error` yalnızca terminal denemede | **GEREKÇE GEÇERLİ (doğrulandı: `packages/db/src/index.ts:52` `export type { Prisma }`) ama BEDELİ KAPATILMADI → M-1.** Sapma kabul edilebilir; **`packages/db`'ye `DbNull` eklemek DAHA DOĞRU OLMAZDI** — `Prisma` değer namespace'ini açmak `client.ts`'in allowlist garantisini zayıflatır. Asıl boşluk `DbNull` değil: ADIM 5'in **koşulsuz** `completed` yazımı + sıfır test |
| 5 | Beş yeni hata sınıfı | **HER BİRİ GEREKÇELİ, HİÇBİRİ GEREKSİZ DEĞİL — hepsinin çağrı yeri var** (`queue.service.ts:149,157` · `queue-worker.module.ts:126,130,153` · `job-runner.ts:372,383` · adaptör `:207`). `ValidationError` kullanmama kararı doğru (`publicDetails` iç sözleşmenin alan yollarını tele yazardı). `JobNotFoundError`'ın kullanılmayan opsiyonel `context` parametresi **iki mevcut emsale** uyuyor (`tenant-not-found.error.ts:13`, `request-context-unavailable.error.ts:15`) → spekülatif genellik değil, repo konvansiyonu. `errors.job.*` anahtarlarının katalogda olmaması bulgu DEĞİL: `packages/i18n` **henüz yok** (ölçüldü), tüm mevcut hata sınıfları aynı durumda |
| 6 | R-S8-3 test için export | **GEREKÇE GEÇERLİ · ama brief'in DAYANAĞI YANLIŞ.** *"Üretim tüketicisi YOK"* iddiası **tutmuyor**: `JOB_ROW_SELECT` `:191`+`:242`, `JOB_LIST_ORDER_BY` `:190`, `buildJobListQueryArgs` `:271`'de üretimde kullanılıyor. Testin hizmetinde olan tek şey `export` anahtar sözcüğü. Adaptörün **gerçekten geçirdiği** nesneyi ölçmek, kopyalanmış bir beklentiden kesin olarak daha iyidir → **BULGU DEĞİL**. (Gerçekten tüketicisiz export'lar başka yerde: L-1) |
| 7 | `?? raiseJobNotFound()` / `flatMap` | **İKİ AYRI CEVAP.** `:245` ve `:265-267`: **okunabilirlik bedeli KABUL EDİLEBİLİR** — tek `throw` noktası, ayrımın *yazılamaz* olmasının sözdizimsel taşıyıcısı; `never` dönüşü bunun idiomatik yolu. `:283`: **KABUL EDİLEBİLİR DEĞİL** — aynı üslup hiçbir garanti taşımadığı yerde taklit edilmiş → **L-2** |
| 8 | R-S7-2 `prisma.service.ts:144` satır içi literal | **GEREKÇE TUTMUYOR → BORÇ SATIRI GEÇERSİZ, DÜŞÜRÜLMELİ.** Literal `:144`'te doğrulandı, ama **ihlal ettiği bir disiplin yok**: `queue-log-events.ts:4-11` sabitlerin **testin gözlem noktası olduğu için** var olduğunu birebir yazıyor. Testin assert etmediği log mesajları bu repoda **her yerde** satır içi — bu sürümde yazılan kod dahil (`create-redis-connection.ts:229`, `main.worker.ts:115`, `main.ts:49/54/65`). Üstelik `prisma.service.ts` bu Task'ın değişen yüzeyinde DEĞİL. Kapatılması gereken şey tersi: **L-7** |

## EK OLARAK İSTENEN ÜÇ ÖLÇÜM

- **Dosya boyu / tek sorumluluk:** `job-runner.ts` 511 satır, `queue-worker.module.ts` 245.
  K5'in *"tek yer"* şartı **karşılanıyor**; iş türüne özgü dallanma **sıfır** (ölçüldü:
  `src/queue/` içinde iş türü literali yalnızca `job-registry.ts:45`). Ayrışması
  **zorunlu** bir sorumluluk yok — adım başına transaction değişmezini (`job-runner.ts:25-29`)
  iki dosyaya yaymak kötüleştirirdi. Tek iyileştirme: durum geçişlerini adlandırmak (L-3).
- **`as` iddiası:** brief *"beş"* / *"`queue.module.ts`'te tek `as`"* diyor; **ÖLÇÜM: üretim
  kodunda bu sürümün eklediği `as` sayısı İKİ** — `queue.service.ts:169` (gerekçe `:164-168`)
  ve `job-runner.ts:210` (gerekçe `:206-208`), **ikisi de Zod `parse`/`safeParse`'ından
  hemen sonra ve ikisinin de gerekçesi YAZILI**. `queue.module.ts`'te **sıfır** `as` var →
  brief'in dosya ataması hatalı. Yeni test dosyalarında da `as` **0**.
- **Ölü kod:** `queue-log-events.ts`'in **15/15** sabitinin tüketicisi var (ölçüldü).
  `createBackoffStrategy` üretimde kullanılıyor (`queue-worker.module.ts:186`);
  `buildBackoffDelaySequence`'in **yalnızca test** tüketicisi var — ama AC7 pinine
  `computeBackoffDelayMs`'in üstüne `JOB_ATTEMPTS`'i de kattığı için **vacuous değil**,
  bulgu saymıyorum. Gerçek tüketicisiz export'lar: L-1.

## ÖLÇÜMLER

```
İncelenen dosya            ~40 (24'ü tam okuma, 16'sı hedefli grep)
`any` sayısı (kod)         0        — tüm eşleşmeler yorum içinde (literal-jeton)
`@ts-ignore`               0        — `@ts-expect-error` yalnızca type-pin dosyalarında, gerekçeli
`as` tip zorlaması (üretim) 2       — queue.service.ts:169, job-runner.ts:210 (ikisi de Zod sonrası)
`console.*` çağrısı        0
En büyük fonksiyon         createJobProcessor 224 satır (288-511); iç kapanış 150 satır (361-510)
En büyük dosya             job-runner.ts 511 satır (yorum yoğunluğu ~%55, kasıtlı)
İş türü literali           1 (job-registry.ts:45) — türe özgü dallanma 0
Kullanılmayan export       7 (job-runner.ts ×5, jobs/.../index.ts ×2)
Döngüsel bağımlılık        0 (paketler arası ve src/queue içi dosya grafiği)
Katman ihlali              0 — packages/trpc/src'de `@arkesoft/db` importu 0; packages/* → apps/* importu 0
test/lint/build            KOŞTURULMADI (Bash yok)
```

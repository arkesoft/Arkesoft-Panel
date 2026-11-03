# ADR-0015 — Kuyruk topolojisi, DLQ ve worker kiracı bağlamı

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-03
- **Karar verenler:** pm, architect, po, db, backend, devops, docs (T-013); gate'ler: qa, security, solid. Bull Board'un ertelenmesi kullanıcı onayıyla (2026-11-03).
- **İlgili versiyon:** `v0.0.11` (bkz. `ROADMAP.md`)

---

## Bağlam

v0.0.11 platforma ilk arka plan iş altyapısını getiriyor: üretici tarafı HTTP sürecinde
(`apps/api`), tüketici tarafı **ayrı** bir süreçte (`apps/api/src/main.worker.ts`), ikisinin
buluşma noktası Redis. Bu, platformun şimdiye kadar yazdığı her şeyden farklı bir şey: bir iş
kaydının doğruluğu artık tek bir istek-yanıt döngüsünün içinde değil, **iki süreç ve bir
veri deposu** arasında paylaşılıyor. Dört soru bu sürümden uzun yaşayacak ve kodun içinde
cevaplanırsa altı ay sonra okuyan kişi gerekçeyi bulamayacak:

1. **Kuyruk anahtar alanı kiracıya göre bölünecek mi?** CLAUDE.md §7'nin 8. maddesi _"dış
   kaynak (Meilisearch indeksi, S3 anahtar öneki, önbellek anahtarı) kiracıya kapsamlı
   olacak"_ diyor. Kuyruk bu tanıma yakın ama aynı şey değil; madde harfiyen uygulanırsa
   kiracı başına kuyruk, kiracı başına worker ve kiracı sayısıyla **doğrusal artan** bir
   anahtar alanı doğuyor.
2. **Başarısız iş nerede park eder?** ROADMAP kabul kriteri _"başarısız iş 3 denemeden sonra
   DLQ'ya düşer"_ diyor ama DLQ'nun ne olduğunu söylemiyor.
3. **§7 madde 7 nasıl zorlanır?** _"Kuyruk işinin payload'ında `tenantId` var ve worker işin
   başında tenant context kuruyor"_ maddesi CLAUDE.md'de v0.0.4'ten beri yazılı, ama bugüne
   kadar uygulanabilir **hiçbir yüzeyi yoktu** — kuyruk yoktu. Bu sürüm maddenin ilk gerçek
   uygulaması. `pm` bu sürümde yanlış yapılabilecek **en pahalı şeyi** burada gördü: tablo
   kusursuz RLS'li olur, **işin kendisi korumasız** kalır.
4. **v0.0.4'ün kapanış garantisi ne olacak?** `pnpm-workspace.yaml`'da yazılı bir karar
   (K-A7) pino'nun Nest/HTTP sarmalayıcılarını **bilinçli olarak** reddediyor, gerekçesi
   birebir şu: o sarmalayıcılar transport/worker iş parçacığı açar ve v0.0.4'ün AC11'inin
   istediği _"SIGTERM sonrası exit 0, açık handle yok"_ garantisini riske atar. Kuyruk
   worker'ı, kalıcı Redis bağlantıları ve BullMQ zamanlayıcıları **tam olarak bu risk
   sınıfı** — ama BullMQ CLAUDE.md §2'nin onaylı yığınında olduğu için reddedilemez. Çare
   riski reddetmek değil, **ölçmek**.

İki kısıt bu kararların tamamını şekillendirdi. Birincisi: bu sürümün **son kullanıcıya dönük
yüzeyi yok**; `job.get`/`job.list` salt okunur iki veri sözleşmesi ve ham kuyruk içeriğini
gösteren hiçbir arayüz yayınlanmıyor (Bull Board kullanıcı onayıyla v0.15.0'a ertelendi).
İkincisi: v0.2.0 ("Siteyi Kur" provisioning hattı) bu sürüme bağımlı, yani kapsamın şişmesi
Faz 1'i bloke ediyor — bu yüzden birçok doğru fikir bilinçli olarak **yazılmadı** ve borç
olarak kaydedildi.

## Karar

### 1 — Redis anahtar öneki kiracıya göre BÖLÜNMEZ; izolasyon dört ayakta taşınır

Tek anahtar öneki kullanılacak: `arkesoft:queue`. Kuyruk adı = iş adı (`tenant.provision`);
kiracı kimliği **ne kuyruk adına ne anahtar önekine** girer. İş türü başına bir `Queue` ve bir
`Worker` vardır (tek çoklanmış kuyruk değil), çünkü BullMQ'da eşzamanlılık `Worker` başına
tanımlanır ve çoklanmış tek kuyrukta ağır iş türü hafif olanı aç bırakır.

**Bu, CLAUDE.md §7 madde 8'den BİLİNÇLİ BİR SAPMADIR.** Sapma gizlenmiyor; gerekçesi ve
telafisi burada yazılı. Gerekçe: kiracı başına kuyruk, kiracı sayısıyla doğrusal artan bir
anahtar alanı **ve** worker sayısı demektir; bu ölçekte **adil zamanlama imkânsızlaşır** (her
kuyruğun kendi tüketicisini beklemesi gerekir, boş kuyruklar worker tutar, yeni kiracı yeni
altyapı ister). Çok kiracılı bir kuyruk için doğru soru _"anahtar alanı bölünmüş mü"_ değil,
_"bölünmemiş anahtar alanında kiracı verisi korunuyor mu"_ sorusudur.

Telafi **dört ayakta** duruyor; dördü de `security` tarafından bağımsız olarak doğrulandı:

1. **Payload'da tip düzeyinde zorunlu `tenantId`.** `JobDefinition<P extends JobPayloadBase>`
   jeneriği, `tenantId` taşımayan bir şemayla iş tanımının **derlenmesini engelliyor**;
   `job-payload.base.ts` tabanı `z.string().min(1)` ile zorunlu. Beş tip pini bunu
   `@ts-expect-error` ile kayda geçiriyor (kapı kaybolursa `TS2578` ile kırmızı döner).
   `security` atlatmayı denedi: `exactOptionalPropertyTypes` altında `tenantId?: string`
   kısıtı **geçemiyor**.
2. **Handler'ın yapısal `withTenant` kısıtı.** Handler'ın veritabanına dönen tek yolu
   `JobContext.withTenantDb`'dir ve bu fonksiyon **kiracı parametresi kabul etmez** — yani
   "handler başka kiracıyı yazamaz, çünkü yazacak yer yok". Ayrıntı: Karar 3.
3. **`Job` satırının FORCE RLS'i.** `security` canlı `psql` ile ölçtü (beyan devralmadı):
   `relrowsecurity=t`, `relforcerowsecurity=t`, politika `polcmd='*'`, `TO PUBLIC` (role
   kısıtlı değil), `USING` ve `WITH CHECK` **ikisi de dolu** ve kanonik,
   `arkesoft_app` için `rolbypassrls=f`. Kiracı bağlamı kurulmamış bir oturum satırı
   **göremiyor** (fail-closed; hata değil, sıfır satır).
4. **Ham kuyruk içeriğini gösteren hiçbir yüzeyin olmaması.** Bu ayak bir tasarım tercihidir,
   tesadüf değil: Bull Board'un v0.15.0'a ertelenmesi (kullanıcı onayı, 2026-11-03) **tam bu
   yüzden** önemli. Bull Board kuyruğu kiracı filtresi olmadan gösterir — tüm kiracıların iş
   payload'ları tek listede, silme/yeniden deneme yetkisiyle. `security` ölçtü: repoda
   `@bull-board` için sıfır eşleşme, DLQ'nun bir arayüzü yok.

**Bağlayıcı sonuç:** dördüncü ayak bu kararın taşıyıcı kısmıdır. Ham kuyruk içeriğini
gösteren **herhangi** bir yüzey yayınlanmak istendiğinde bu ADR yeniden değerlendirilmek
zorundadır — o yüzey eklendiği anda telafi dört ayaktan üçe iner.

### 2 — DLQ ayrı bir BullMQ kuyruğudur (`<jobName>.dlq`), BullMQ'nun `failed` kümesi DEĞİL

Terminal başarısızlıkta zarf `tenant.provision.dlq` kuyruğuna yazılır. Ad elle birleştirilmez,
`buildDlqQueueName(definition.name)` üretir. Zarfın şekli (anahtar kümesi testle sıralı olarak
pinli, `security` doğruladı):

```
{ jobId, jobName, tenantId, attemptsMade, failedAt, payload: { tenantId }, error: AppErrorBody }
```

Üç şey bu zarfta kasıtlıdır:

- **`tenantId` hem üst seviyede hem `payload` içinde.** Tekrar değil, kararın sonucu: kuyruk
  anahtar alanı kiracıya bölünmediği için (Karar 1) bir zarfın kiracısını okumak **payload'ın
  şeklini bilmeyi gerektirmemelidir**. Üst seviyedeki alan, iş türünden bağımsız bir
  okuyucunun (ileride derinlik alarmı, operatör aracı) tek bakışta kiracıyı görmesini sağlar.
- **Ham `job.data` zarfa HİÇ girmiyor.** `payload` yalnızca **parse edilmiş** veriden kurulur;
  payload şemayı karşılamıyorsa zarf yalnızca kurtarılabilen `tenantId`'yi taşır. Böylece
  doğrulanmamış hiçbir veri DLQ'ya sızmaz.
- **`error` alanı `toErrorBody()`/`unknownErrorBody()` çıktısıdır**, ham hata mesajı veya yığın
  izi değil. `appErrorBodySchema.parse()` bir **yazma kapısı** olarak kullanılıyor: `z.object`
  fazla anahtarı düşürdüğü için gövdeye ileride eklenecek (PII taşıyabilecek) bir alan bu
  zarfa ve `Job.error` kolonuna **sızamaz**. `security` kendi ölçümüyle doğruladı: sentetik
  sır, `stack` ve `context.tckn` üçü de düşürüldü.

Zarf `jobId` ile yazıldığı için ikinci bir kayıt doğal olarak oluşamaz. DLQ'nun bu sürümde
**tüketicisi ve retention'ı yoktur** — bilinçli: DLQ bir "park yeri"dir, `Job.status='failed'`
ve `Job.error` ikilisi ise kiracıya kapsamlı **sorgulanabilir görünümdür**. İkisi birbirinin
yerine geçmez.

### 3 — Worker kiracı bağlamı TİP ve LİNT ile zorlanır, uyarı notuyla değil

§7 madde 7, "handler `withTenant` altında koşmalı" diyen bir yorum satırıyla **karşılanmaz**.
Dört **bağımsız** katman var; her biri tek başına delinse diğerleri ayakta kalır:

1. **Payload tipi** (Karar 1, ayak 1): kiracısız şemayla iş tanımı derlenmez.
2. **Veritabanı tipi:** handler'ın elindeki tek DB yolu `withTenantDb` ve o **kiracı
   parametresi almaz**. İşlem istemcisi `TenantTransactionClient`, yani bir `Pick<>`
   allowlist'i — `$queryRaw`/`$transaction`/`$extends` **yapısal olarak dışarıda** kalıyor,
   dolayısıyla ham SQL ile RLS atlanamıyor. `AppPrismaDatabase` allowlist'ine `'job'`
   **bilinçli olarak eklenmedi**: `prisma.db.job.*` yazan kod **derlenmez**. Bu bir uyarı
   değil, ölçülmüş bir derleme hatası (`TS2339: Property 'job' does not exist on type
   'AppPrismaDatabase'`) ve üç ayrı mutasyonda fiilen görüldü. Panikle bu allowlist'e `'job'`
   eklemek **yasak**; iki tip pini anında kırılır.
3. **DI yokluğu:** handler'lar Nest provider'ı değil, kayıt defterindeki düz fonksiyonlardır →
   `PRISMA_CLIENT` token'ına DI ile erişemezler. Bir servise ihtiyaç duyarlarsa o servis
   işlem istemcisini **parametre olarak** almak zorundadır.
4. **Lint:** `apps/api/eslint.config.mjs`'e `src/queue/jobs/**` için beşinci dosya kümesi
   eklendi (`PrismaService`, `withTenant`, `PrismaDatabase` importu yasak). **Bu bloğun diğer
   dört kümenin kısıtlamalarının tamamını yeniden beyan etmesi zorunludur** — yoksa o dizin
   için prisma/express/pg yasakları sessizce kaybolur ve lint bunu yakalamaz. `security` iki
   bağımsız ölçümle doğruladı: (a) `eslint --print-config` çıktısında **11 path + 4 pattern
   grubu**, altı kısıtlamanın hepsi yeniden beyan edilmiş ve birinci bloğun `ignores`'unda
   `'src/queue/jobs/**'` var, yani kümeler tam ayrık; (b) izole bir `espree` koşumunda
   `**/prisma/**` kalıbı **dört farklı derinlikte** ateşledi.

**Katman 3'ün bilinen zayıflığı açıkça kayda geçiyor** (bu ADR'nin kovaladığı kusur sınıfı
tam burada doğuyor): DI yokluğunun tek dinamik savunması `*.isolation.test.ts` dosyalarıdır.
S6 bunu mutasyonla **ölçtü** — `JobContext.withTenantDb` sabit biçimde yanlış kiracıya
bağlandığında `lint` ve `typecheck` **yeşil geçiyor**, mutlu yol testi de yeşil kalıyor;
yalnızca izolasyon testi kırmızı veriyor (handler kendi satırını göremiyor). `security` bu
uyarıyı izleyip boşluk aradı ve kapalı buldu: kuyruk birim testleri bağımlılıkları kendileri
kurduğu için üretimdeki tek bağlama satırını ölçmüyor, ama worker kapanış testi derlenmiş
`dist/main.worker.js`'i **gerçek bir işletim sistemi süreci** olarak başlatıp gerçek bir iş
atıyor — o satır yanlış kiracıya bağlanırsa durum yazımları RLS ile sıfır satıra iner, kayıt
`queued` kalır ve test zaman aşımına uğrar.

### 4 — Worker kapanış sözleşmesi v0.0.4'ün AC11 garantisini korur; sorumluluk ikiye bölünür

Worker **HTTP portu açmaz** (`NestFactory.createApplicationContext`, `create()` + `listen()`
değil): iki süreç aynı portu bağlayamaz ve en küçük yüzey en az açık handle demektir.
`main.worker.ts` Nest'in `enableShutdownHooks()`'unu **kullanmaz**; kapanış sırası açıktır:

```
1. watchdog = setTimeout(exit 1, WORKER_SHUTDOWN_WATCHDOG_MS = 10_000).unref()
2. await withTimeout(worker.close(), WORKER_CLOSE_TIMEOUT_MS = 5_000)
     başarısızsa → worker.close(true)        // zorla; devam eden iş bırakılır
3. await app.close()                          // kuyruk + Prisma + Redis yıkımı
```

İki sayı arasındaki ilişki bağlayıcıdır: `5_000 < 10_000`, yani watchdog **son çaredir**,
normal yolda hiç tetiklenmez. Adım 2'nin adım 3'ten önce ve **açıkça** olmasının gerekçesi:
devam eden handler veritabanına yazıyor olabilir; Prisma'nın bağlantı kapatmasının ondan sonra
koşmasını Nest'in yıkım sırasına bırakmıyoruz — tasarım **sıradan bağımsız** doğru olmak
zorunda.

**`worker.close()`'un bekleyip beklemediği varsayım değil, ölçüm:** 600 ms süren bir prob
handler'ıyla `worker.close()` **+607 ms**'de çözüldü (yani bitmesini **bekledi**),
`worker.close(true)` **+25 ms**'de çözüldü (yani işi **bıraktı**, handler bitmeden 575 ms
önce). Zorla kapanış yolunda iş yarıda kalır, kilit süresi dolunca BullMQ'nun stalled
denetleyicisi işi **yeniden teslim eder**.

**Zorla kapanışta `failed` YAZILMAZ.** Gerekçe: işin başarısız olup olmadığını bilmiyoruz;
`failed` yazmak yanlış bilgi üretir ve yeniden teslim onu tekrar `running`'e çevirirdi (iki
yönlü oynama). Askıda kalan `running` **doğru** durumdur: "bir worker aldı, sonucu henüz yok".
Bunun iki bağlayıcı sonucu var: (a) durum geçişleri **idempotent** olmak zorundadır
(`updateMany` + koşullu `where`, `update` + `throw` değil), (b) bir worker çökerse satır
süresiz `running` kalabilir → **bayat `running`/`queued` tespiti** bir borçtur (v0.15.0) ve bu
sürümde **ilk gerçek örneği ölçüldü** (`job` tablosunda Redis karşılığı olmayan bir `queued`
satır; kanıt olarak silinmedi).

**Kapanış sorumluluğu ikiye bölünür — ölçülmüş olgu, tasarım notu değil.** Worker süreci
Redis'e **iki** bağlantı açıyor:

- `arkesoft-worker-<pid>` — bizim kurduğumuz örnek; `QueueLifecycleService` kapatır.
- `arkesoft:queue:<base64(kuyruk adı)>` — BullMQ'nun **bloke eden komutlar için** açtığı
  kopya; onu **`worker.close()`** kapatır.

Bunun iki pratik sonucu var. Birincisi: adım 2 atlanırsa veya `QueueLifecycleService` kendi
bağlantısını kapatmazsa süreç **exit 0 vermez** (ikisi de mutasyonla ölçüldü). İkincisi:
bağlantıların kapandığını ölçen bir test **ada göre sayım yapmamalıdır** — kopyanın adı pid
taşımaz, yani başka bir sürecin aynı kuyruk için açtığı kopya addan ayırt edilemez. Doğru
ölçüm `CLIENT LIST`'teki **bağlantı kimliği deltası**, ve her iki ad desenine **ayrı ayrı**
bakmak.

**Ölçümün bilinen boşluğu da kayda geçiyor:** `pg_stat_activity`'nin sıfır satır dönmesi
**temiz kapanışı süreç ölümünden ayırmıyor** — süreç ölünce Postgres backend'i zaten düşer.
Mutasyonla kanıtlandı: Prisma'nın bağlantı kapatma çağrısı işlevsizleştirildiğinde çocuk
süreç bloğu **yeşil kaldı**. Bu boşluk AC9 için kapatıldı (ölçüm sürecin **içine** taşındı:
süreç canlı kalır, hiçbir sinyal gönderilmez, satırı düşüren tek şey yıkım kancasının
kendisidir) ama **v0.0.4'ün AC11'inde hâlâ açıktır**, çünkü o test dosyası bu Task'ın
kapsamında değildi. Borç olarak kaydedildi.

### Değerlendirilen alternatifler

**Karar 1 için:**

- _Kiracı başına kuyruk veya kiracıya bölünmüş anahtar öneki._ Anahtar alanı ve worker sayısı
  kiracı sayısıyla doğrusal artar, adil zamanlama imkânsızlaşır, her yeni kiracı altyapı
  değişikliği ister. §7 madde 8'in harfine uyar, ruhuna (kiracı verisinin korunması) dört
  ayaklı telafiden daha iyi hizmet etmez.
- _Kuyruk anahtarlarını bir önbellek anahtarı gibi ele almak._ Kuyruk anahtarı bir önbellek
  anahtarı değildir: önbellekte kiracı başına bölme maliyetsizdir, kuyrukta zamanlama
  adaletini bozar.

**Karar 2 için:**

- _BullMQ'nun `failed` kümesini DLQ saymak._ `removeOnFail` retention'ına tabidir, yeniden
  sürülebilir değildir ve bir **iç veri yapısıdır** — sözleşme olarak kullanılamaz.
- _`Job.status='failed'` + ayrı bir "dead letter" tablosu._ ROADMAP bunu istemiyor ve `Job`
  zaten `status` + `error` taşıyor → **ikinci bir doğruluk kaynağı** doğardı.
- _DLQ'ya retention vermek._ Park yeri kararıyla çelişir: amaç kaybetmemek. Yerine **derinlik
  alarmı** (silme değil) borç olarak kaydedildi.

**Karar 3 için:**

- _Yorum/uyarı notuyla yetinmek ("handler `withTenant` altında koşmalı")._ Bu reponun
  tekrarlayan kusur sınıfı tam olarak budur: beyan ile gerçeklik boşluğu. Mutasyon ölçümleri,
  dört katmandan ikisinin (tip ve lint) atlatma denemelerini **gerçekten** kırdığını gösterdi.
- _Handler'ları Nest provider'ı yapmak._ `PRISMA_CLIENT` token'ına DI erişimi açardı, yani
  katman 3'ü kendi elimizle silerdi.
- _`AppPrismaDatabase` allowlist'ine `'job'` eklemek._ Katman 2'yi sessizce yok eder. Typecheck
  kırmızısının doğru çözümü çağrıyı `withTenant()` içine taşımaktır.
- _`packages/db`'ye `Prisma` değer namespace'ini (ör. `DbNull`) açmak._ `solid` bunu
  **değerlendirip reddetti**: değer namespace'ini açmak `client.ts`'in allowlist garantisini
  zayıflatır. Gerekirse tek üyeli bir dışa açım **ayrı bir sürüm kararıdır**.

**Karar 4 için:**

- _Nest'in `enableShutdownHooks()`'una güvenmek._ Kapanış sırası kütüphanenin yıkım sırasına
  devredilirdi; tasarımın sıradan bağımsız olma şartı karşılanamazdı.
- _Kuyruğa `REDIS_CLIENT` token'ını (sağlık profili) vermek._ `RedisService`'in kapanışı
  kuyruğun altından bağlantıyı çeker; ayrıca bloke eden komutlar o istemcinin ölçülmüş
  `commandTimeout` değeriyle çalışamaz.
- _Zorla kapanışta `failed` yazmak._ Yanlış bilgi üretir ve yeniden teslimle iki yönlü
  oynamaya yol açar.
- _Kuyruk bağlantısını BullMQ'ya seçenek nesnesi olarak vermek._ İki atlanamaz değişmez
  (zorunlu `'error'` dinleyicisi ve üst sınırlı `retryStrategy`) kütüphane varsayılanlarına
  devredilirdi; üstelik ioredis seçenek tipinin indeks imzası yüzünden anahtar yazım hataları
  sessizce geçerdi.

### Ölçülen olgular (kayıt)

Bu olgular bir sonraki okuyucunun aynı ölçümleri yeniden yapmasını gereksiz kılmak için
yazılıyor; her birinin ölçüldüğü yer belirtilmiştir.

- **`attemptsMade` processor içinde 0 TABANLIDIR** (`0 → 1 → 2`), `failed` olayında ise 1
  tabanlı (`1 → 2 → 3`). Tabanı çeviren tek fonksiyon `resolveAttemptNumber`'dır ve kullandığı
  taban, BullMQ'nun kendi yeniden deneme yükleminin tabanıyla **aynıdır** → terminal kararımız
  kütüphanenin fiili davranışıyla kilitli. (T-013/S6, `queue-dlq.test.ts` çalışma zamanında
  teyit etti.)
- **Özel backoff stratejisi gerçekten bizim fonksiyonumuzu çağırıyor** (T-013/S5, gerçek
  Redis'e karşı koşturuldu): `backoffStrategy` çağrı sayısı **2** (= `attempts - 1`, fazlası
  yok), tip birebir `'custom'`, döndürülen gecikmeye uyuluyor (300 ms → 354 ms, 600 ms →
  628 ms; fazlalık BullMQ'nun yoklama aralığı). Yani backoff dizisini pinleyen birim testi bir
  **aynalamayı** değil, üretimde **fiilen koşan kod yolunu** pinliyor.
- **Hazır `{ type: 'exponential' }` stratejisi bu yüzden seçilmedi** (architect K6): hazır
  strateji kullanılsa, testin pinlediği dizi kütüphanenin formülünün bizim **aynalamamız**
  olurdu ve formülü varsaymak zorunda kalırdık.
- **Tek `createRedisConnection` fabrikası, iki profil** (`'health'` ve `'queue'`), ve aynı
  istemcinin paylaşılamamasının gerekçesi (T-013/S3): BullMQ **bloke eden** komutlar kullanır,
  bu komutlar tanımı gereği sağlık profilinin komut zaman aşımını aşar; ayrıca BullMQ
  `maxRetriesPerRequest: null` şart koşar, aksi hâlde bağlantı kesintisinde bekleyen komutlar
  düşer ve kuyruk tutarsız kalır. Tek fabrika kararının sebebi, iki atlanamaz değişmezi
  (zorunlu `'error'` dinleyicisi + üst sınırlı `retryStrategy`) ikinci bir dosyada
  **kopyalamamaktır**.
- **TypeScript ayrıntısı, ölçüldü (T-013/S3):** `exactOptionalPropertyTypes: true` altında
  ioredis'in seçenek tipi kurucuya **doğrudan geçirilemiyor** (`TS2769`). Bu yüzden fabrikanın
  dönüş tipi iki profilin tam şeklinin **dar birleşimidir** ve her dalda ayrıca `satisfies`
  vardır; ek kazanç olarak eksik veya yanlış yazılmış anahtar typecheck'te yakalanır.
- **`Job.error` yalnızca TERMİNAL denemede yazılır** (T-013/S6 kararı 1). Gerekçe ölçüldü:
  `@arkesoft/db` `Prisma`'yı yalnızca **tip** olarak dışa açıyor, dolayısıyla JSON NULL değeri
  bu paketten **erişilemez** ve nullable bir JSONB kolonunu NULL'a geri çekmek imkânsız. Ara
  denemede yazılan hata, iş sonraki denemede başarırsa satırda **bayat** kalırdı. Ara
  denemelerin tam hatası yalnızca **loga** gider. `solid` ek olarak değerlendirdi ve
  `packages/db`'ye JSON NULL değerini eklemenin **daha doğru olmayacağına** karar verdi.
- **`JobDefinition` ikiye ayrıldı** (`JobDefinition` + `RunnableJobDefinition`), çünkü üretici
  tarafındaki kayıt defteri tüketicinin handler dosyasını import etmek zorunda kalmamalı.
  `handler` alanını **opsiyonel yapmak değerlendirildi ve reddedildi**: handler'ı olmayan bir
  işin kuyruğa girmesini **tip düzeyinde meşrulaştırırdı** ve iş sonsuza kadar `queued`
  kalırdı, kimse fark etmezdi. `solid` bu gerekçeyi geçerli buldu; üçüncü alternatifi (kayıt
  defterini tüketici tarafına taşımak) **ölçerek** reddetti — üretici de defteri gezmek
  zorunda olduğu için handler, HTTP sürecinin modül grafiğine girerdi.
- **Terminal satır dokunulmaz** (T-013 FIX 1, iki gate doğruladı): yetkisiz bir geçiş
  denemesinde satır `failed` + dolu `error` + `completedAt: null` olarak **kalır**. Üç
  gerekçe: tek doğruluk kaynağı korunur; terminal muhasebe zaten bildirildi (DLQ zarfı
  yazıldı) ve geç gelen başarıyı sessizce `completed` yazmak o bildirimi yalanlardı; `startedAt`
  zaten aynı yönde ("olgusal kayıt üzerine yazılmaz") davranıyor. Geç başarı yutulmuyor — log
  geçişin reddedildiğini söylüyor. Tel sözleşmesinde **beyan da daraltıldı** ve garanti
  **edilmeyen** durum açıkça yazıldı, böylece karşılanmayan yazılı garanti kalmadı.
- **`EXPLAIN` bir kapı OLAMAZ** (T-013/S8 ölçtü, `qa` gerekçeyi kabul etti): 200 kiracı ×
  40 000 satırlık sentetik dağılımda planlayıcı beklenen indeksi (`Bitmap Index Scan`) seçti,
  ama **tek kiracılı** dağılımda `Seq Scan`'e düştü. Yani `EXPLAIN` sorgu şeklini değil **veri
  dağılımını** ölçüyor. Doğru kapı: adaptörün **ürettiği argüman şeklinin** pinlenmesi +
  canlı katalogdan okunan DDL; `EXPLAIN` yalnızca destekleyici kanıttır.
- **Girdi doğrulama hatasının kodu `VALIDATION_ERROR` değil** (T-013/S8): `job.list`'in
  `limit` üst sınırı aşıldığında yanıt `HTTP_EXCEPTION`/400 oluyor, çünkü Zod **girdi** hatası
  tRPC sınırında doğuyor ve uygulama hata sınırının `AppError` dalına **hiç girmiyor**
  (bkz. ADR-0010 madde 2 çerçeve-hatası yolu). Alan bazlı bir doğrulama gövdesi isteniyorsa bu
  **ayrı bir sürüm kararıdır**.

Bu listenin kendisi bir derse işaret ediyor ve ders bu sürümde **üç farklı aktör** tarafından
yeniden üretildi: kovalanan kusur sınıfı **beyan ile gerçeklik arasındaki boşluktur** ve
statik kapılar (lint, typecheck) onu göremez — bu sürümün 64 mutasyonunun çoğu `lint` ve
`typecheck`'i yeşil geçti. Reçete ADR-0014 Karar 8'de yazılı (tek uygulama + tam çıktı
assert'i + yakın-kaçırma içeren sentetik veri) ve burada teyit edildi; üstüne **yeni bir madde**
eklendi: **bir assert'in vacuous OLMADIĞI da kanıtlanmalıdır.** Ölçüm disiplininin pratik
kuralları `docs/development.md` → "Ölçüm disiplini" bölümünde.

## Sonuçlar

### Olumlu

- Arka plan işi altyapısı, kiracı izolasyonunu **dört bağımsız katmanda** taşıyarak geldi;
  §7 madde 7 artık uygulanabilir bir yüzeye sahip ve atlatma denemeleri ölçülerek kapatıldı.
- `Job` kaydı birinci sınıf, kiracıya kapsamlı ve sorgulanabilir bir olgudur (durum, ilerleme,
  hata, zaman damgaları) — v0.16.0'ın "müşteri güncellemeyi kendisi uygular ve geri alır"
  vaadinin ön koşulu.
- v0.0.4'ün kapanış garantisi ikinci bir uzun soluklu süreç eklenmesine rağmen **sessizce
  kaybolmadı**: regresyon koruması kabul kriterine girdi ve gerçek süreç spawn'ıyla ölçüldü.
- Kuyruk kayıt deseni ikinci iş türünü kuyruk **çekirdeğinde sıfır değişiklikle** kabul
  ediyor; iş türüne özgü dallanma sayısı ölçülerek sıfır.
- Backoff dizisinin üretim değerleri, koşan kod yolunu pinleyen bir testle kilitli — üretim
  gecikmesini düşüren bir değişiklik testi kırar.

### Olumsuz ve kabul edilen maliyetler

- **Anahtar alanı paylaşımlı:** sistematik olarak başarısız olan tek bir iş türü DLQ'yu
  sınırsız büyütürse Redis yazmayı reddeder ve kuyruk **tüm kiracılar için** durur. Karşı
  önlem (derinlik alarmı) v0.15.0 borcu, v0.2.0'da yeniden değerlendirilecek.
- **Askıda `running`/`queued` satırlar:** zorla kapanış ve "önce Postgres, sonra kuyruk"
  sıralaması bu satırları mümkün kılıyor. Bayat satır tespiti v0.15.0 borcu; ilk gerçek örneği
  bu sürümde ölçüldü.
- **DLQ'nun tüketicisi yok:** zarflar bekleme listesinde süresiz durur. Bilinçli (park yeri),
  ama bir operatör aracı gelene kadar kurtarma **elle**dir.
- **İşin hata mesajı kiracıya kapsamlı olmayan bir yere yazılıyor:** yeniden denenebilir
  hatalar olduğu gibi fırlatıldığı için BullMQ hata metnini ve yığın izini Redis'e kaydeder.
  Bugün zararsız (tek handler bir iskelet, dış servise dokunmuyor) ama v0.2.0'ın gerçek
  kurulum adımları hata mesajına sır veya PII koymamalıdır. `Job.error` ve DLQ zarfı
  **redakte**, log tam, Redis kaydı **kapsam dışı** — bu asimetri borç olarak kaydedildi.
- **`enqueue` kiracı kapsamını payload'dan türetiyor:** bugün üretim çağıranı olmadığı için
  istismar edilemez, ama ilk gerçek çağıran yazılmadan **önce** kapatılması gereken bir borç.
- **Kapanış süresine üst sınır yok:** kapanış doğru biterse de 12-16 kat yavaşlayabilir ve bu
  gerileme sessiz geçer (mutasyonda ölçüldü).
- **`pg_stat_activity` ölçümü v0.0.4'ün AC11'inde hâlâ süreç ölümünü temiz kapanıştan
  ayırmıyor** — AC9 için kapatıldı, AC11 için borç.

### Etkilenen sonraki kararlar

- **v0.2.0 (provisioning hattı):** bu ADR'nin Karar 3'ü, gerçek adımların yazılacağı yerin
  sözleşmesidir — adım idempotency'si, telafi (compensation) ve SLO o sürümün işi. İki borcun
  **ilk çağırandan ve ilk dış servis çağrısından önce** kapatılması gerekiyor.
- **v0.15.0 (süper admin sistem sağlığı):** Bull Board veya kuyruk derinliği panosu buraya
  geliyor. Karar 1'in dördüncü telafi ayağı o sürümde **yeniden değerlendirilmek zorunda**;
  kiracı filtresiz bir kuyruk arayüzü bu ADR'yi geçersizleştirir.
- **v0.0.17 (gözlemlenebilirlik) ve iş kaydı retention'ı:** `Job` satırlarının yaşam süresi bu
  sürümde bilinçli olarak tanımsız bırakıldı.
- **v0.18.0 (üretim altyapısı):** kuyruk testlerinin Redis yetenek kapısı yalnızca test
  ortamında koşuyor; üretimde eviction'lı bir Redis BullMQ anahtarlarını sessizce silebilir.
- **v0.0.22 (public API sözleşmesi):** `job` namespace'inin sözleşme snapshot'ı o sürümde
  mekanik kapıya bağlanacak; bu sürümde kontrol **elle analizle** yapıldı.

## Gözden geçirme koşulları

- **Ham kuyruk içeriğini gösteren herhangi bir yüzey yayınlanmak istendiğinde** (Bull Board
  dahil, v0.15.0) → Karar 1'in dördüncü telafi ayağı düşer, karar yeniden değerlendirilir.
- **İkinci bir iş türü veya ikinci bir kuyruk tüketicisi eklendiğinde** → Karar 2'nin kayıt
  deseni ve Karar 3'ün tamlık kapısı yeniden okunmalı; payload şekli farklıysa eşleşmenin tek
  denetlendiği çağrı satırı gözden geçirilmeli.
- **İlk gerçek provisioning adımı yazıldığında (v0.2.0)** → `enqueue`'ün kiracı kapsamını
  payload'dan türetmesi ve hata metninin Redis'e yazılması **o çağrı yazılmadan önce** ele
  alınmalı.
- **Kiracı sayısı veya iş hacmi tek anahtar alanında ölçülebilir bir darboğaz üretirse** (adil
  zamanlama tehdidi) → Karar 1 yeniden değerlendirilir; ölçüm, varsayımdan önce gelir.
- **DLQ derinliği alarm gerektirecek seviyeye geldiğinde** → Karar 2'nin "tüketici yok,
  retention yok" tercihi yeniden değerlendirilir (silme değil, alarm).
- **BullMQ ana sürümü yükseltildiğinde** → `worker.close()` semantiği, stalled yeniden teslim
  davranışı ve özel backoff stratejisi yüzeyi **yeniden ölçülmelidir**; bu ADR'nin dört
  ölçülmüş olgusu doğrudan bu kütüphanenin davranışına dayanıyor.
- **Kapanış ölçümüne süre üst sınırı eklendiğinde veya AC11'in Postgres kapanış ölçümü
  süreç ölümünden ayrıldığında** → Karar 4'ün "bilinen boşluk" paragrafı güncellenir.

---

**Not:** Bu ADR T-013'ün tasarım kararlarını, sekiz üretim alt görevinin ölçümlerini ve bir
düzeltme turunu kapsar. Gate raporları:
`.claude/workflow/reviews/T-013-{solid-tur1,solid-tur2,security-tur1,qa-tur1,qa-tur2}.md`.
Task kaydı: `.claude/workflow/tasks/T-013.md`. Borç satırları: `ROADMAP.md` → Teknik Borç.

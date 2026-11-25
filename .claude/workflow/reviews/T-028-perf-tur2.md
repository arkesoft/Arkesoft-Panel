# T-028 — `perf` gate raporu (tur 2, ilk koşum)

Tarih: 2026-11-24 (ölçüm UTC 16:47–16:56) · Platform 0.12.0 · `@arkesoft/errors` ·
`@arkesoft/api` (gözlemlenebilirlik yüzeyi, v0.0.17)

**Ortam koşulları (ölçüm disiplini, AGENT_BASELINE §4):** `uptime` → load averages
**81.01 / 34.55 / 19.17** (10 çekirdek, ~8× aşırı yüklü) · `docker ps` → 26 konteyner ·
bu, (a)'nın mutlak ms sayılarının gürültülü olacağı anlamına gelir — yorum aşağıda.

GATE: perf
SONUÇ: PASS
BULGULAR:

- [SEV: low] `apps/api/src/observability/instrumentation.ts` (NodeSDK varsayılan
  kaynak dedektörü) — açılışta kısa ömürlü bir `ProcessWrap` (çocuk süreç) + 2 ek
  `Timeout`/`PipeWrap` oluşturuyor; ~1-2 sn içinde kendiliğinden kapanıyor, kalıcı
  değil, soket açmıyor, kapanışı geciktirmiyor. Kaynak: `@opentelemetry/resources`
  paketinin `HostDetector`/`getMachineId-darwin.js`'i (`execFile` ile `ioreg`
  benzeri bir komut çalıştırıyor). Önerilen not: `docs/observability.md`'ye
  "açılışta kısa bir çocuk-süreç maliyeti var, kalıcı handle değil" diye düşülsün.
  Sorumlu ajan: `docs` (v0.18.0 borcu, mevcut borç listesine ek — tur açmaz).
- [SEV: low] (a) ölçümü **load average 81 altında** alınabildi (makine başka bir
  oturumun 26 konteyneriyle paylaşılıyor) — mutlak ms rakamları bu nedenle düşük
  kesinlikli; rapor bunu açıkça işaretliyor, gizlemiyor.

ÖLÇÜMLER:

## (a) Alt süreç açılış süresi deltası

Yöntem: `apps/api/dist/` altına (derleme çıktısı, kaynağa dokunulmadı) iki geçici
betik yazıldı — biri yalnızca `process.exit(0)` (çıplak Node açılışı), diğeri
`import './observability/instrumentation.js'` SONRA `process.exit(0)`. Her biri
1 ısınma + **15 ölçüm** turu, `spawnSync` ile tam süreç açılış+kapanış süresi
(`Date.now()` deltası) ölçüldü. Dist önce `tsc -p tsconfig.build.json` ile
tazelendi (0 fark — kaynak zaten derlenmişti).

| | medyan (ms) | ham örnekler (ms) |
| --- | --- | --- |
| Çıplak Node (`process.exit(0)`) | **62** | 60–65 |
| + `instrumentation.ts` yüklü | **222** | 185–312 |
| **Delta** | **+160 ms (+258%)** | — |

⚠ **Mutlak rakamlar düşük kesinlikli** (load avg 81 altında alındı, varyans
185-312ms arası geniş) — ama **delta'nın yönü ve büyüklük mertebesi gürbüz**:
dört enstrümantasyonun (`@opentelemetry/sdk-node` + `instrumentation-http` +
`instrumentation-ioredis` + `@prisma/instrumentation`) modül yükleme + `sdk.start()`
maliyeti **yapısal bir sabit maliyettir**, gürültüden kaynaklanmıyor — (b)/(c)
bölümünde kök nedeni (kaynak dedektörünün çocuk süreci) ayrıca izole edildi.
**Global p95 hedefi olmadığı için eşik YOK** — mutlak bütçe aşımı iddia edilmiyor,
sayı olduğu gibi raporlanıyor (architect'in daraltma gerekçesi: "mutlak eşik
ÖLÇÜLEMEZ").

**Bağlam:** bu maliyet **süreç başlatma başına bir kez** ödenir (API/worker
boot), **istek başına değil** — HTTP/Redis/Prisma enstrümantasyonlarının
çalışma zamanı ek yükü bu ölçümün kapsamı dışında (architect'in daraltmasıyla
tutarlı: "yük altında p95 v0.20.0'ın işi").

## (b) Sıfır ağ soketi + SIGTERM sonrası sıfır açık handle

Yöntem: kendi geçici betiğim (`http.createServer()` + `startSentry({dsn:undefined})`
+ `import './observability/instrumentation.js'`), GERÇEK bir OS alt sürecinde,
gerçek bir porta bağlı. `lsof -a -nP -p <pid> -iTCP` (⭐ `-a` ZORUNLU — Orkestratörün
bu oturumda ölçtüğü OR-tuzağına düşülmedi, doğrulandı) + `process.getActiveResourcesInfo()`.

| Ölçüm | Sonuç |
| --- | --- |
| TCP soket sayısı (süreç hayattayken, kendi test dinleyicimiz HARİÇ) | **0** |
| SIGTERM sonrası doğal çıkış (⚠ `process.exit()` KASITLI çağrılmadı — handle varlığının kendisi test edildi) | **Evet, exit code 0, `shutdownDurationMs`: 9ms** |
| Kapanış hook'u çalıştı mı (`shutdownObservability()` → `shutdownSentry()`, K-A28-3 sırasıyla) | **Evet** — `activeResourcesAfterShutdownHookRan`: `["PipeWrap","TCPServerWrap","PipeWrap"]` (stdio + kendi test sunucumuz — OTel/Sentry'den **sıfır** kalıntı) |

**Temiz taban karşılaştırması (t=2sn, geçici kaynaklar durulduktan sonra):**

```
Çıplak http.Server (OTel/Sentry YOK):   ["PipeWrap","TCPServerWrap","PipeWrap","Timeout"]
+ instrumentation.ts yüklü:              ["PipeWrap","TCPServerWrap","PipeWrap","Timeout"]
                                          ⇒ BİREBİR AYNI — sıfır fark
```

⭐ Kalıcı `Timeout`, Node'un **kendi** `Server.setupConnectionsTracking`
bağlantı-izleme zamanlayıcısıdır (OTel'den BAĞIMSIZ, `async_hooks` ile stack
izlendi — `node:_http_server:566`); OTel/Sentry'ye atfedilebilir **kalıcı** bir
handle **yok**.

Açılışta (t=0) GEÇİCİ olarak görülen 5 ek kaynak (`ProcessWrap` + 2×`Timeout`/
`PipeWrap`) — `async_hooks` ile stack izlendi, kaynağı
`@opentelemetry/resources`'ın `getMachineId-darwin.js` dedektörüdür (yukarıdaki
`low` bulgu); t=2sn'de tamamen kaybolur.

Mevcut `observability-runtime-contract.test.ts`'in (b)/(d) testleri **bağımsız
olarak tekrar koşturuldu** (değiştirilmedi, salt okunur): 4/4 PASS, `lsof` **0**,
`activeResources` yalnızca `PipeWrap×2` — benim ölçümümle **tutarlı**.

## (c) Sıfır span processor / zamanlayıcı

Yöntem: `@opentelemetry/api`'nin `trace.getTracerProvider()`'ı gerçek
`instrumentation.ts` import edildikten SONRA sorgulandı (kendi betiğim, salt okunur).

```json
{ "topLevelCtorName": "ProxyTracerProvider", "hasGetDelegateMethod": true, "delegateCtorName": "NoopTracerProvider" }
```

⇒ `setGlobalTracerProvider` **hiç çağrılmamış** — delege hâlâ `NoopTracerProvider`.
Bu, `security`'nin kaynak okumasıyla (`sdk.js:217`) iddia ettiği sonucu
**`@opentelemetry/api` seviyesinde, çalışma zamanında, bağımsız olarak** doğrular.
Noop sağlayıcı span/batch işlemediği için **span processor zamanlayıcısı yapısal
olarak var olamaz** — (b)'deki kalıcı tek `Timeout`'un OTel'e ait OLMADIĞI
(Node'un kendi HTTP housekeeping'i) yukarıda ayrıca kanıtlandı.

## Kapsam-içi ek ölçüm — `redactDeep` anahtar başı maliyeti

Yöntem: `packages/errors/dist/redaction.js` (tsc ile tazelendi), `process.hrtime.bigint()`
ile 7 tur × (20.000 / 5.000) yineleme, medyan alındı.

| Girdi | Alan sayısı / derinlik | Çağrı başı medyan |
| --- | --- | --- |
| Tipik `AppError.context` (ör. `productId`/`orderId`/`tenantId`/`attemptCount`) | 4 düz alan | **~0.45 µs** |
| Patolojik (derinlik 6, yaprakta 50 alan) | 6 derinlik, 50 alan | **~14.5 µs** |

**Değerlendirme (gerekçeli, eşik uydurulmadı):** her iki sayı da **mikrosaniye
mertebesinde** — en kötü (patolojik) durumda bile 150ms arama p95 bütçesinin
**~10.000'de biri**. `NORMALIZED_SECRET_FIELD_NAMES` kümesi modül yüklemesinde
**bir kez** kuruluyor (ölçülen: `solid`'in iddiası doğru) — yalnızca **girdi**
anahtarları her çağrıda `normalizeFieldName()` ile normalize ediliyor
(`toLowerCase()` + 2 karakter sınıfı `replace`), bu maliyet ölçülen rakamların
içinde. Bu yol **yalnızca `logLevel: 'error'` olan bir `AppError` yakalandığında**
çalışıyor (mutlu yolda **sıfır** çağrı) — bu, mikrosaniye maliyetini daha da
önemsiz kılıyor. **Bulgu: yok** (performans bütçesi anlamında) — sayı
raporlanıyor, eşik icat edilmiyor.

## Test koşumları (salt okunur, değiştirilmedi)

- `npx vitest run src/__tests__/observability-runtime-contract.test.ts` →
  **4/4 PASS** (6.54s) — (a)/(b)/(c)/(d) alt testleri, `apps/api` içinden
  çalıştırıldı (R-PO6 kuralı: `pnpm --filter` filtre uygulamıyor).
- `npx vitest run` (9 gözlemlenebilirlik/Sentry dosyası: `sentry-invariants`,
  `sentry-console-breadcrumb-leak`, `sentry-dsn-malformed-fail-closed`,
  `sentry-request-data-pipeline-positive-control`, `sentry-bootstrap-initializer`,
  `observability-shutdown-order`, `instrumentation-factory`,
  `queue-trace-propagation`, `app-exception-filter-log-level`) →
  **9/9 dosya, 47/47 test PASS** — `qa`'nın düzeltme turu 2'de bıraktığı
  `sentry-console-breadcrumb-leak.test.ts` pini **artık yeşil** (backend'in
  `beforeBreadcrumb: () => null` düzeltmesi doğrulandı, `dist/observability/
  sentry.js:216`'da teyit edildi).
- `pnpm build` / `pnpm test` / `pnpm test:isolation` **koşturulmadı** —
  Orkestratörün bu oturumda ölçtüğü sonuçlara güvenildi (brief'in talimatı).
- Yalnızca paket-yerel `tsc -p tsconfig.build.json` (`apps/api`, `packages/errors`)
  çalıştırıldı — dist tazeliği için, kök `pnpm build` DEĞİL.

## Temizlik

Tüm geçici ölçüm betikleri `apps/api/dist/__perf_t028_*` (derleme çıktısı,
gitignore'da — `git check-ignore` ile doğrulandı) ve
`$CLAUDE_JOB_DIR/tmp/perf-t028/` altındaydı; ilki `rm` ile silindi, ikincisi
zaten iş dizini dışında. Üretim/test dosyasına **hiçbir yazma** yapılmadı
(`git status` öncesi/sonrası birebir aynı, yalnızca bu rapor dosyası eklendi).

## Kapsam dışı (bilinçli — architect'in daraltmasına uyuldu)

Lighthouse CI, k6, bundle bütçesi denetimi, mutlak API p95 eşiği —
**koşturulmadı/uydurulmadı** (brief'in bağlayıcı kısıtı). Bu Task'ta frontend
dosyası **sıfır** (DOM değişikliği yok) — vitrin/admin Core Web Vitals yüzeyi
**değişmedi**.

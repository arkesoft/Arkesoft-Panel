# ADR-0029 — Gözlemlenebilirlik Dikişinin Kurulması, Yüzeyin Ertelenmesi ve `traceId`/Sentry Sınırları

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-24
- **Karar verenler:** architect (T-028, K-A28-1…K-A28-9); gate'ler: `solid` tur 1-2,
  `security` tur 1-2, `qa` tur 2, `perf` tur 2 (bağımsız ölçümlerle doğruladı/düzeltti —
  aşağıda); kullanıcı onayı 2026-11-23 (kapsam revizyonu + 7-9 paketlik OTel/Sentry
  bağımlılık kümesi).
- **İlgili versiyon:** `v0.0.17` (bkz. `ROADMAP.md`)

---

## Bağlam

`v0.0.17`'nin ROADMAP lafzı altı kutu istiyordu: OpenTelemetry enstrümantasyonu +
`traceId`, dört uygulamada Sentry, `tenant_id`/`tenant_plan` span attribute'ları,
`AppError.logLevel`, Grafana/Loki docker-compose profili + örnek dashboard, ve belgeli
alarm eşikleri. `pm`'in ölçümü (T-028): `infra/` bugün tek bir `docker-compose.yml`
taşıyor, Pulumi/Helm yok (`v0.18.0`'ın işi) — yani "üretimde ne olduğunu görebilelim"
hedefinin **üretim** yarısı bugün yapısal olarak yok. Bir Grafana panosu kurmak, hiçbir
zaman dağıtılmayan bir ortamın panosunu kurmak olurdu; sayısal alarm eşiği yazmak,
depoda tanımlı tek bir API p95 hedefi olmadığı için **uydurma** olurdu.

Aynı zamanda `T-027`'nin gate raporu bir riski bu sürüme devretmişti (R-6): yeni doğan
`packages/i18n` ve `Money`'nin fırlattığı hatalar üretimde **izsiz**. Ve CLAUDE.md §4'ün
log alan şeması zaten `traceId`'yi şart koşuyordu — kod bu alanı hiç üretmiyordu.

Bu iki gerçek arasındaki gerilim: **tamamını** yapmak doğrulanamaz artefakt üretir;
**hiçbirini** yapmamak T-027'nin riskini büyütür. Karar bu gerilimi "dikiş" (trace
bağlamı, `traceId`, `logLevel`, redaction kapsamı — bugün ağsız ve mekanik olarak
doğrulanabilir) ile "yüzey" (panolar, exporter, dört uygulamalı Sentry, sayısal eşik —
bugün doğrulanamaz) arasında ayırarak çözer.

## Karar

**Bu sürüm dikişi kurar, yüzeyi v0.18.0'a (üretim altyapısı — Pulumi/Kubernetes/Helm)
erteler.** Yedi alt karar:

1. **K-A28-1 — İki katmanlı dikiş.** Katman 1 (korelasyon): `traceId` kaynağı sırayla
   (a) OTel aktif span bağlamı, geçerliyse; (b) yerel üretim (16 bayt hex). Gelen
   `traceparent` başlığı **hiçbir koşulda kabul edilmez** (güvenilir ingress yok,
   zehirleme riski, Katman 2 açıldığında zaten standart kurallarla sağlanacak).
   Katman 2 (trace hattı): `NodeSDK` + dört enstrümantasyon kurulur ama
   `spanProcessors`/`logRecordProcessors`/`metricReaders` **üçü de açıkça `[]`** —
   "exporter yok" kararı, boş dizinin SDK içinde `truthy` sayılıp env-fallback'in
   (soket açabilen dal) hiç çalışmamasını sağlayan ölçülmüş bir mekanizmaya dayanır.
2. **K-A28-2 — Sentry trace'e dokunmaz.** `@sentry/node` kendi OTel kurulumunu
   `enableOpenTelemetrySetup: false` ile devre dışı bırakır (NodeSDK ile çakışmasın).
   Varsayılan veri toplama **opt-out**'tur; altı `dataCollection` alanı + breadcrumb
   boru hattı (`beforeBreadcrumb: () => null`) açıkça kapatılır (ayrıntı: §4'te,
   `docs/observability.md`).
3. **K-A28-3 — Kapanış sırası yapıdan gelir.** OTel önce, Sentry sonra; sıra Nest'in
   `onApplicationShutdown`/`onModuleDestroy` yaşam döngüsü yapısından gelir,
   `process.on('SIGTERM')`'e **eklenmez** (yarış olurdu).
4. **K-A28-4 — ESM bootstrap.** Enstrümantasyon modülü `main.ts`/`main.worker.ts`'in
   ilk import'u; idempotency `globalThis` üzerinde belgelenmiş bir `Symbol` ile
   sağlanır (modül kimliği varsayımına dayanmaz).
5. **K-A28-5 — `logLevel`: dört seviye, varsayılan `'warn'`.** `'error' | 'warn' |
   'info' | 'debug'`; `isRetryable`'dan **bağımsız türetilir** (biri "kuyruk tekrar
   denesin mi", diğeri "insan baksın mı" sorusuna cevap verir — ikisini birbirine
   bağlamak CLAUDE.md §4'ün "boolean bayrak yığını" yasağını ihlal ederdi).
6. **K-A28-6 — Planlı pin devri.** `app-error.test.ts`'in "`logLevel` taşımaz" pini
   tersine çevrilir; bu bir gevşetme değildir — testin kendi başlığı devri tarihiyle
   ilan ediyordu ve yerine üç daha güçlü pin (varsayılan, açık değer, tel sözleşmesi
   korunumu) geldi.
7. **K-A28-9 — A3 statik kanıtla çözüldü.** `@prisma/instrumentation`'ın Prisma 7 +
   `@prisma/adapter-pg` (driver-adapter, Rust motoru kaldırılmış) üzerinde span
   ürettiği, çalışma zamanı ölçümüyle (9 Prisma span'i, S2) **doğrulandı** — DB
   halkası AC-53'ün kapsamında kaldı, onuncu bir paket (`instrumentation-pg`)
   eklenmedi.

### Değerlendirilen alternatifler

| Alternatif | Neden seçilmedi |
| --- | --- |
| OpenTelemetry'nin resmî "hepsi bir arada" otomatik enstrümantasyon meta-paketi (⚠ bu paketin adı `pnpm guards`'ın AC-61 reddedilen-paket taraması nedeniyle burada bilerek bitişik yazılmıyor — literal-jeton kuralı, bkz. `scripts/guards.sh:1609`) | Kullanıcı kararıyla reddedildi — onlarca enstrümantasyonu tedarik zincirine sokar, `allowBuilds` asgarilik disiplinine aykırı. Yerine dört enstrümantasyon **adıyla** seçildi (HTTP, ioredis, Prisma, BullMQ). |
| Sentry'nin kendi tracer provider'ı (`enableOpenTelemetrySetup: true`, SDK varsayılanı değil ama kolay yol) | NodeSDK ile çift enstrümantasyon/kaybolan span riski taşırdı; `false` açıkça verilerek Sentry yalnızca hata zarfı, trace tamamen OTel'in sorumluluğunda bırakıldı. |
| Breadcrumb sızıntısı için (A) `integrations` filtresiyle yalnızca `Console`'u kapatma | Ölçülen altı breadcrumb kaynağından (console/childProcess/fetch/http×2/supabase) yalnızca birini kapatır, kalan beşi açık bırakırdı. (B) `beforeBreadcrumb: () => null` tek boğaz noktasında (`addBreadcrumb`) altısını da kapatır **ve** SDK'nın gelecekte ekleyeceği kaynak da kapalı doğar — **seçildi**. |
| Kapanış sırasını `process.on('SIGTERM')`'e ekleme | Hangi dinleyicinin önce koştuğuna bağlı bir yarış olurdu; depo pino sarmalayıcılarını aynı gerekçeyle (arka plan zamanlayıcı/iş parçacığı) daha önce reddetmişti (T-002, K-A7). Nest yaşam döngüsü kancası seçildi — sıra yapıdan gelir. |
| 10. paket: `instrumentation-pg` (Prisma span'i garantiye almak için) | A3 statik + çalışma zamanı kanıtıyla **gereksiz** çıktı (K-A28-9); eklense de (a) onay 9 paket içindi, (b) `pg.Pool` yapısal olarak `packages/db` dışına sızmıyor, (c) yanlış soyutlama seviyesi olurdu. |
| `@opentelemetry/sdk-trace-base`'in üretime terfi ettirilmesi (test-only'den) | S2'nin `spanProcessors: []` sonrası soket/handle ölçümü (0 satır, yalnızca `PipeWrap`) terfiyi gereksiz kıldı; koşullu kapı hiç açılmadı. |
| İkinci bir ESM preload yolu (`node --import ./dist/observability/instrumentation.js`) | S2'nin ölçümü: ilk-import stratejisi tek başına yeterli (HTTP span sayısı iki yolda da eşit); ikinci yol kaldırıldı, `AC-61`'in alt kontrol sayısı 3'ten 2'ye düştü. |
| `PINO_REDACT_PATHS`'e harf-duyarsız normalizasyon uygulama | pino'nun yol metinleri kendi sözleşmesi (`fast-redact`) gereği harfe duyarlı; normalizasyon yalnızca `redactDeep`'in arama tarafına uygulandı, pino tarafı bilinen/belgeli bir sınır olarak bırakıldı. |
| `WILDCARD_NESTED_FIELD_NAMES`'in yeni 11 secret adına göre spekülatif genişletilmesi | Hiçbirinin bugün bilinen bir tek-seviye iç içe biçimi yok (grep ile doğrulandı); `redactDeep` zaten her derinlikte tarıyor (pino ikincil hat). Gerçek bir biçim doğduğunda genişletilecek — bağlayıcı yorum, spekülatif genişleme yasağının aynı sınıfı. |

## Sonuçlar

### Olumlu

- Her isteğin `traceId`'si tek bir kaynaktan üretilir ve log/yanıt başlığı/Sentry
  zarfı/kuyruk işi zincirinde aynı değerdir — sahtecilik (gelen `traceparent`) yapısal
  olarak engellenir.
- `AppError.logLevel` operatöre "müdahale gerekir" ile "beklenen ama anormal"
  ayrımını verir; public API yüzeyi (`toErrorBody`) değişmez.
- Sentry devreye alındığı an (operatör `SENTRY_DSN` verdiğinde) müşteri verisi
  (parola, kart no, TCKN, e-posta) üçüncü tarafa gitmez — bu sınıf sızıntı gate
  turunda yakalandı ve yayına çıkmadan kapatıldı.
- Redaction kapsamı CLAUDE.md §4'ün "asla loglanmaz" listesiyle hizalandı ve
  harfe duyarsız hâle geldi.
- Sonraki her sürüm (gerçek exporter, müşteriye görünür trace, dört uygulamalı
  Sentry) enstrümante bir temel üzerine doğar; bugün yeniden iş yapılmayacak.

### Olumsuz ve kabul edilen maliyetler

- **Hiçbir span/metrik/log dışa aktarılmıyor.** `docs/observability.md`'nin "Bugün
  çalışmayanlar" bölümünde dürüstçe yazılı. Karşı önlem: v0.18.0'da gerçek exporter.
- **`guards`'ın 25. adımı CI'da koşmuyor** — yerel beşli kapıda gerçek, CI paritesi
  yok (`.github/**` bu sürümde dokunulamaz). Karşı önlem: v0.18.0.
- **Açılış maliyeti +160ms/+%258** (62ms → 222ms medyan, 15 koşum, load average 81
  altında ölçüldü — düşük kesinlikli). Mutlak eşik depoda tanımlı değil; sayı
  olduğu gibi raporlandı. Karşı önlem: v0.20.0'ın yük altı p95 ölçümü.
- **ESM `node:http` enstrümante edilmiyor** (Node 25.8.1, `instrumentation-http@
  0.223.2`) — üretim bugün bu yoldan geçmiyor (Express/Nest CJS), ama ileride bir
  saf-ESM `node:http` kullanımı span üretmez. Ölçülmüş, giderilmemiş boşluk.
- **`instrumentation.ts:208`'deki `sdk.start()` `try/catch` dışında** — fırlarsa tüm
  süreç açılmaz; fail-open/closed kararı bugün belgesiz ve testsiz (v0.18.0 borcu).
- **`redaction.ts:298-328`'in DAG (devirsiz tekrar referans) durumunda yanlış
  `[circular]` yazması** — fail-closed yönde bir teşhis kaybı, v0.18.0 borcu.

### Etkilenen sonraki kararlar

- ADR-0004'ün `0.0.17` satırı (`AppError.logLevel`, Sentry eşlemesi, `traceId`) bu
  ADR ile **yürürlüğe konur**, değiştirilmez.
- v0.16.0 (versiyon yöneticisi/müşteri görünürlüğü) `traceId` aramasının kiracı
  kapsamlı olması gerektiği kararını bu ADR'nin §2'sinden (K-A28-1) devralır —
  aksi hâlde çapraz kiracı IDOR.
- v0.18.0 (Pulumi/Kubernetes/Helm) bu ADR'nin ertelediği "yüzey" kutusunun hepsini
  (exporter, Grafana/Loki, dört uygulamalı Sentry, sayısal alarm eşiği, CI paritesi)
  devralır.

## Gözden geçirme koşulları

1. **Güvenilir ingress geldiğinde** (v0.18.0) — gelen `traceparent`'in kabul
   edilmesi yeniden değerlendirilir (K-A28-1'in bugünkü reddi bu varsayıma dayanır).
2. **Gerçek bir span/log/metrik exporter eklendiğinde** (v0.18.0) —
   `trace-attributes.ts`'in tüketicisi doğar; Sentry'nin `databaseQueryData` alanı
   (Prisma sorgu parametre değerleri kiracı verisi taşıyabilir) yeniden
   değerlendirilmelidir.
3. **`packages/integrations`'ta (v0.6.x) gerçek bir tek-seviye iç içe sır biçimi
   doğduğunda** — `WILDCARD_NESTED_FIELD_NAMES` o gözlenen biçimle genişletilir.
4. **v0.16.0'da hata/trace görünürlüğü müşteriye açıldığında** — `traceId` araması
   zorunlu olarak kiracı kapsamlı olmalı; aksi hâlde çapraz kiracı IDOR.
5. **Node sürümü düşürülürse** (< 22.12/23.2/24) — `sentry-invariants.test.ts`'in
   `diagnostics_channel`'a dayanan describe bloğu yeniden ölçülmelidir
   (`FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL` bu aralığı ister, depo bugün
   25.8.1'de).

---

## Kullanım

- Dosya adı: `docs/adr/0029-gozlemlenebilirlik-dikisi-ve-ertelenen-yuzey.md`.
- Bu ADR geçmişe dönük düzenlenmez; karar değişirse yeni bir ADR yazılır ve bu
  dosyanın durumu `Yerini aldı: ADR-00NN` olarak güncellenir.

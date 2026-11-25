# T-028 — `security` gate, tur 2 (TAM yeniden denetim)

Tarih: 2026-11-24 · ROADMAP **v0.0.17** · platform `0.12.0 → 0.13.0`
Ölçüm koşulları: load average **8.55 / 8.92 / 12.60** (yüksek yük), ~26 konteyner çalışır
durumda. ⚠ Ölçümlerin tamamı **bellek içi `node -e`/`node <script>`** (zamanlamaya duyarlı
değil) + **tek vitest dosyası, sırayla** — yüksek yük sonuçları zayıflatmıyor. Playwright,
`pnpm build`, `pnpm test`, `test:isolation` **koşturulmadı** (bağlayıcı kısıt).

```
GATE: security
SONUÇ: PASS
```

---

## 1. Tur 1 bulgularının akıbeti — altısı da KAPANDI

| # | SEV (tur 1) | Konu | Akıbet | Kanıt tipi |
| --- | --- | --- | --- | --- |
| **G1** | critical | Sentry ham gövde/çerez/başlık sızıntısı | ⭐ **KAPANDI** | kontrol gruplu telde ölçüm |
| **G2** | high | K-A28-1'in Sentry ağzı (`traceparent`) | ⭐ **KAPANDI** | dört kollu ölçüm |
| **G3** | medium | `@opentelemetry/sdk-trace-base` | ⭐ **KAPANDI** | `pnpm audit` + advisory dökümü |
| **G4** | medium | `SECRET_FIELD_NAMES` CLAUDE.md §4 altında | ⭐ **KAPANDI** | davranış ölçümü + yanlış pozitif kontrolü |
| **G5** | low | `error-mapping.ts` REST log yolu | ⭐ **KAPANDI** | üç çıkış yolunun tamamı tarandı |
| **G6** | low | `guards.sh` DSN deseni | ⭐ **KAPANDI** | `pnpm guards` 25/25 |

### G1 — kontrol gruplu telde ölçüm (düzeltmenin tek gerçek kanıtı)

Harness: gerçek `node:http` sunucusu (127.0.0.1, port **0**), gerçek Sentry istemcisi,
**sahte taşıyıcı**, DSN `…@o0.ingest.sentry.invalid/0` ⇒ **sıfır ağ isteği**.
Sentinel: `hunter2pass` · `4111111111111111` · `12345678901` · `kurban@example.com`
(çerez · özel başlık · gövde · sorgu dizesi).

```
KONTROL  (SDK varsayılanları)            → SIZAN: çerez + özel başlık + sorgu  (3/4)
                                           event.request = headers,method,url,cookies,query_string,data
TEDAVİ   (sentry.ts:164-186 literali)    → SIZAN: HİÇBİRİ                      (0/4)
                                           event.request = {method, url}  ⭐ sorgu dizesi URL'den SIYRILMIŞ
```

⭐ Kontrol grubu **canlı** (boşa çıkmama kanıtı: `eventZarfiVar=true` her iki kolda).
⇒ Çerez / rastgele özel başlık / sorgu dizesi eksenlerinde **G1 gerçekten kapandı**.

#### ⚠⚠ ÖLÇÜM DİSİPLİNİ DÜZELTMESİ — kendi tur 1 ölçümümde yanlış atıf

İlk tur 2 denemem **hem kontrol hem tedavi** kolunda 4/4 sentinel gösterdi. Kök nedeni
izledim: eşleşmeler `payload.exception.stacktrace` **kaynak bağlam satırlarındaydı** —
sentinel değerleri **harness'ın kendi kaynak dosyasında** literal olarak duruyordu ve
`ContextLines` entegrasyonu (`frameContextLines: 5`) o satırları zarfa koyuyordu.
Sentinelleri `process.env`'e taşıyınca iki kol da 0/4'e düştü; ayrımı ancak ondan sonra
ölçebildim.

⇒ ⚠ **Tur 1'deki "gövde telde bulundu" atfım büyük olasılıkla bu artefakta dayanıyordu.**
⭐ Ama **bulgunun `critical` derecesi yine de doğruydu**: kontrol grubu çerez + **kart
numarası taşıyan özel başlık** + **e-posta taşıyan sorgu dizesi** eksenlerinde gerçek
sızıntıyı kanıtlıyor. Yani bulgu gerçekti, **mekanizması kısmen yanlış atfedilmişti**.
Kayda geçsin diye yazıyorum (AGENT_BASELINE §4 "ölçüm disiplini").

#### Gövde ekseni — `backend`'in dürüst kaydı DOĞRULANDI

Bağımsız probum (`sdkProcessingMetadata` doğrudan okunarak):

```
SENKRON  handler içi : normalizedRequest VAR  (url,method,query_string,headers,cookies,data)
ASENKRON req.on('end'): normalizedRequest YOK  ⇒ izolasyon kapsamı süreklilİĞİ KOPUYOR
normalizedRequest.data = undefined            ⇒ her iki kolda da (gövde henüz okunmamış)
```

⇒ ⭐ `backend`'in *"gövde için E2E denenmedi, çünkü test SAHTE-YEŞİL olacaktı"* gerekçesi
**birebir doğru** — gövdeyi anlamlı ölçmek bu desende **mümkün değil**.
⭐ Yerine **yazma-zamanı kapısını kaynakta doğruladım**
(`@sentry/core@11.12.0/.../integrations/http/server-subscription.js:70`):

```js
const effectiveBodySize = configuredBodySize ??
  (client.getDataCollectionOptions().httpBodies.includes("incomingRequest") ? "medium" : "none");
if (effectiveBodySize !== "none" && …) patchRequestToCaptureBody(…)
```

`httpBodies: []` ⇒ `"none"` ⇒ yamalama **hiç kurulmaz** ⇒ `normalizedRequest.data` **hiç
dolmaz**. ⚠ Not: `@sentry/core`'un `requestdata.js:25` yorumu *"httpBodies gates
write-time, not read-time"* diyor ve `include.data` **her zaman `true`** —
yani koruma **tek başına** okuma tarafında **değil**, yazma kapısında. `httpBodies: []`
doğru kaldıraç. ⚠ `httpBodies` jetonu `@sentry/node` paketinin **tamamında 0 kez** geçiyor
(doğrulandı: dizin var, 74 cjs dosyası, `dataCollection` sanity grep'i eşleşiyor) — kapı
**`@sentry/core`'da**.

### G2 — dört kollu ölçüm (kontrol grubu dahil)

Enjekte edilen başlık: `traceparent: 00-11111111111111111111111111118888-…-01`

| Kol | Yapılandırma | `propagation.fields()` | Sonuç |
| --- | --- | --- | --- |
| **D** | propagator verilmez, Sentry **YOK** | `[traceparent,tracestate,baggage]` | `LOCAL_GENERATED` |
| **A** | propagator verilmez, Sentry **VAR** | `[traceparent,tracestate,baggage]` | ⚠⚠ **SIZDI** → `FROM_ACTIVE_SPAN:1111…8888` |
| **C** | `textMapPropagator: null`, Sentry **YOK** | `[]` | `LOCAL_GENERATED` |
| **B** | `textMapPropagator: null`, Sentry **VAR** | `[]` | ⭐ **`LOCAL_GENERATED`** |

⭐ **ARM A tur 1 bulgusunu birebir yeniden üretti**, ARM B düzeltmeyi kanıtladı.
Handoff'un üç ek sorusunun cevabı:

1. ⭐ Sentry **kendi** propagator'ını kurmuyor — ARM B'de `Sentry.init`'ten **sonra**
   `fields()` hâlâ `[]` (`enableOpenTelemetrySetup: false` ⇒ `initOpenTelemetry` hiç
   çağrılmıyor).
2. ⭐ `W3CBaggagePropagator` ayrı yoldan **gelmiyor** — ARM A/D'de `baggage` alanı
   composite propagator'ın parçası, ARM B/C'de **tamamen yok**.
3. ⭐ `@opentelemetry/api`'nin varsayılanı **gerçekten no-op** — `fields()` boş dizi
   döndürüyor (`NoopTextMapPropagator`).

### G3 — bağımlılık

```
6 vulnerabilities   |  1 low | 3 moderate | 2 high
HIGH      effect           packages__db>@prisma/client>prisma>@prisma/config>effect
HIGH      multer           apps__api>@nestjs/platform-express>multer
MODERATE  minimatch · astro · @astrojs/node          LOW  astro
```

⭐ **Dokuz yeni OTel/Sentry paketinin HİÇBİRİ hiçbir advisory'de geçmiyor** (modül adı
taraması: 0 eşleşme). İki `high` **önceden var olan**, kapsam dışı — yeniden bulgu
yapılmadı (handoff talimatı).

### G4 — iki kararın güvenlik açısından değerlendirmesi

```
SECRET_FIELD_NAMES.size   = 27     PINO_REDACT_PATHS.length = 39   (27 + 6 joker + 6 başlık)
Authorization/API_KEY/api-key/Password/tckn/cvv/cardNumber/email/address → [redacted]
value/code/VALUE/Code/emailMasked                                        → KORUNDU  ⭐ yanlış pozitif YOK
{nested:{deep:{token}}}                                                  → [redacted]
PINO_REDACT_PATHS: 'Authorization' YOK · 'authorization' VAR             ⇒ asimetri teyit
```

**Karar 1 (`WILDCARD_NESTED_FIELD_NAMES` 6'da sabit) — güvenlik açısından DOĞRU.**
`AppError.context`'in **üç** çıkış yolunun **tamamı** `redactDeep`'ten geçiyor:

```
observability/sentry.ts:247   → Sentry zarfı
errors/error-mapping.ts:99    → REST log yolu   (G5'in düzeltmesi)
packages/trpc/src/trpc.ts:200 → tRPC log yolu
```

⭐ `redactDeep`'ten **geçmeyen** dördüncü bir `AppError.context` yolu **yok** (üretim
kodunda `.context` taraması yapıldı). ⇒ pino'nun yüzeysel jokeri gerçekten **ikincil**.

**Karar 2 (pino yollarına normalizasyon uygulanmadı) — bugün SÖMÜRÜLEBİLİR DEĞİL.**
Asimetrinin sömürülmesi için harf varyantlı bir sır anahtarının **yalnızca** pino'dan
geçmesi gerekir. Ölçüm: üretim kodunda **hiçbir** `logger.*` çağrısı ham başlık, istek
gövdesi veya yayılmış (spread) dış nesne almıyor; `RequestLoggingInterceptor` başlıkları
**hiç okumuyor** (K-A7 korunuyor). ⇒ dış veriyi log kaydına taşıyan tek yüzey
`AppError.context` ve o **harf-duyarsız** katmandan geçiyor.

### G5 / G6

- **G5** kapandı — `error-mapping.ts:99` `context: redactDeep(error.context)`.
- **G6** kapandı — `pnpm guards` **25/25 PASS**, `AC-61` alt kontrol 1 (gerçek biçimli DSN
  yok) + alt kontrol 2 (reddedilen meta-paket yok) dahil. ⚠ CI parçası (v0.18.0) **yeniden
  bulgu yapılmadı**, talimat gereği.

---

## 2. Yeni bulgular

```
BULGULAR:
  - [SEV: medium] apps/api/src/observability/sentry.ts:85-106 — Sentry'nin `Console`
    entegrasyonu AKTİF ve `console.*` çıktısını BREADCRUMB olarak zarfa koyuyor; bu kanal
    altı `dataCollection` alanının, `redactDeep`'in ve pino redaction'ının ÜÇÜNÜ DE
    baypas ediyor. ÖLÇÜLDÜ (üretim yapılandırmasıyla): `console.warn('… hunter2pass /
    4111111111111111')` → zarfta İKİ sentinel de BULUNDU, `breadcrumbs` alanı mevcut.
    Senaryo: üçüncü parti bir bağımlılık (Better Auth / Prisma / bir sürücü) kiracı verisi
    veya sır taşıyan bir `console.warn` üretir; o istekte `logLevel:'error'` bir AppError
    oluşursa veri sentry.io'ya breadcrumb olarak çıkar. ⚠ `medium` (critical DEĞİL):
    `no-console: 'error'` (packages/config/eslint/base.js:220) MEKANİK olarak zorlu ve
    birinci parti üretim kodunda `console.*` çağrısı SIFIR ⇒ bugün saldırgan tarafından
    tetiklenebilir somut bir yol KURAMADIM. — Önerilen düzeltme: `Sentry.init`'e
    `integrations: (d) => d.filter((i) => i.name !== 'Console')` ekle (veya
    `beforeBreadcrumb: () => null`), `sentry-invariants.test.ts`'e pin yaz. — backend

  - [SEV: low] apps/api/src/__tests__/sentry-bootstrap-initializer.test.ts:34 — DSN olarak
    GERÇEK host `o0.ingest.sentry.io` kullanılıyor; diğer üç test dosyası `.invalid`
    (RFC 2606) kullanıyor. Bugün zararsız: `startSentry` `vi.mock` ile TAMAMEN sahtelenmiş
    (satır 19-21) ⇒ sıfır ağ. ⚠ Ama `examplePublicKey` 32-hex OLMADIĞI için guards AC-61
    bunu YAKALAMAZ; mock bir gün kaldırılırsa DSN gerçek bir hosta işaret eder. —
    Önerilen düzeltme: `.invalid` hostuna çevir (diğer üçüyle tutarlı). — backend

  - [SEV: low] apps/api/src/observability/sentry.ts:98-106 — dosya başı gerekçesi "bu altı
    alanın hiçbiri BUGÜN HİÇBİR span/attribute'a ULAŞMIYOR" diyor; `frameContextLines` için
    bu FAKTEN YANLIŞ. Ölçüldü: yığın çerçevesi KAYNAK SATIRLARI zarfa GERÇEKTEN gidiyor
    (bu denetimin ilk ölçümünü yanlış yönlendiren artefaktın kök nedeni). Güvenlik etkisi
    YOK (depo PUBLIC, kaynak satırları statik kod, çalışma zamanı kiracı verisi taşımaz) —
    ama yanlış bir güvenlik gerekçesi sonraki denetimciyi yanıltır. ⭐ Diğer BEŞ alan
    (`graphQL`/`genAI`/`mcp`/`databaseQueryData`/`queues`) için gerekçe DOĞRULANDI: aktif
    entegrasyon dökümünde prisma/graphql/genai/mcp/kuyruk entegrasyonu SIFIR. — Önerilen
    düzeltme: yorumu "beşi eylemsiz; `frameContextLines` aktif ama yalnızca statik kaynak
    satırı taşır" diye düzelt. — backend

  - [SEV: low] apps/api/src/request-context/request-context.middleware.ts:112 — `x-trace-id`
    istemciye dönüyor ve `solid` düzeltmesinden sonra Sentry zarfının `trace_id` tag'iyle
    ARTIK AYNI değer. Bugün korelasyon sızıntısı DEĞİL: değer 16 bayt kriptografik rastgele,
    kiracı verisi taşımıyor, Sentry org'u istemciye kapalı. ⚠ İLERİYE DÖNÜK kısıt: v0.16.0
    hata/trace görünürlüğünü MÜŞTERİYE açtığında `traceId` ile arama MUTLAKA kiracı kapsamlı
    olmalı; aksi hâlde çapraz kiracı IDOR doğar. — Önerilen düzeltme: ROADMAP v0.16.0
    teknik borç satırı olarak kaydet. — architect
```

⇒ **1 medium + 3 low** ⇒ AGENT_BASELINE §4: `1-2 medium` = **PASS**, `low` tur açmaz.

---

## 3. Kiracı izolasyonu (CLAUDE.md §7) — tur 1'in iki açığı kapandı

| Madde | Durum |
| --- | --- |
| 1-3 (tablo/RLS/indeks) | **N/A** — yeni tablo/kolon/migration **YOK**; `packages/db/` dokunulmamış (`git status` boş) |
| 4-5 (procedure tipi, `withTenant`) | **N/A** — yeni tRPC prosedürü/endpoint yok |
| **6 (girdideki id'ye güvenilmiyor)** | ⭐ **KAPANDI** (tur 1'de karşılanmıyordu): gelen `traceparent` artık reddediliyor (G2, ARM B); `x-request-id` allowlist regex `^[A-Za-z0-9_-]{8,64}$` + tek-değer şartı (CRLF/başlık enjeksiyonu kapalı); kuyruk `traceId`'si `{...payload, ...correlation}` ile **korelasyon SONDA** ⇒ çağıranın değeri **yapısal olarak** üzerine yazılır (`queue.service.ts:199`) |
| 7 (kuyruk payload `tenantId` + worker context) | ✅ `tenantId: z.string().min(1)` **zorunlu**, `traceId` opsiyonel + `^[0-9a-f]{32}$` pinli; `withTenantDb` kiracı parametresi kabul etmiyor |
| **8 (dış kaynak kiracı kapsamlı)** | ⭐ **KAPANDI** (tur 1'de KISMEN): Sentry zarfı artık yalnızca `tenant_id` tag'i + `redactDeep`'ten geçmiş `context`; ham istek verisi (çerez/başlık/sorgu/gövde) bastırıldı |
| 9-11 (önbellek anahtarı, dosya yolu, izolasyon süiti) | **N/A** — yeni önbellek anahtarı/dosya yolu yok |
| 12 (hata mesajı varlık sızdırmıyor) | ✅ `logLevel` dağıtımı **yalnızca log seviyesini** değiştiriyor, yanıt gövdesine dokunmuyor |
| 13 (loglarda `tenantId`) | ✅ **güçlendi** — `traceId` eklendi, CLAUDE.md §4 şemasının son eksik alanı kapandı |
| 14 (süper admin denetim kaydı) | **N/A** |
| `SECURITY DEFINER` / `public` dışı şema / sır taşıyan tablo / katalog linter | ⭐ **DOKUNULMADI** — `packages/db/` değişikliği **0** ⇒ T-015/T-016 kör nokta eksenleri (`prosecdef`, PUBLIC-dışı `EXECUTE`, `pg_trigger`, `pg_rewrite`, `rolconfig`) etkilenmiyor |

---

## 4. Diğer denetim eksenleri

- **Sır/DSN taraması (depo PUBLIC):** 57 değişen+yeni dosyada sır deseni
  (`password|secret|api_key|token|BEGIN … PRIVATE KEY` + atama) **0 eşleşme**; gerçek biçimli
  DSN (`[0-9a-f]{32}@host/digits`) **0 eşleşme**; `guards` AC-61 bunu bağımsız teyit etti.
- **Yeni 13 test ağa çıkıyor mu:** ⭐ **HAYIR.** Sahte taşıyıcı **gerçekten devrede**
  (`createFakeTransportFactory`, `@sentry/node` import **edilmeden**, duck-typed);
  DSN'ler `.invalid`; `node:http` sunucuları `127.0.0.1` + port **0** (efemer ⇒ 3000/5173/5174
  **çakışması yok**). Tek istisna yukarıdaki `low` (mock'lu, sıfır ağ).
- **Girdi doğrulama:** `SENTRY_DSN: z.url().optional()` (fail-closed, varsayılan kapalı);
  `.env.example` **dokunulmamış**; `pnpm env:check` **yeşil** (çıktıda `DATABASE_AUTH_URL`
  maskeli).
- **Enjeksiyon:** yeni ham SQL **yok**; kullanıcı girdisi dosya yoluna/komuta/HTML'e
  girmiyor; `traceId`/`requestId` yanıt başlıklarına yazılan **tek** istemci-etkili değer ve
  ikisi de allowlist regex'ten geçiyor.
- **Ödeme / oran sınırlama / SSRF / dosya yükleme:** bu sürümde **yeni yüzey yok**
  (yeni endpoint/prosedür/upload/dış URL çağrısı eklenmedi).
- **KVKK:** `tenant_plan` **kesildi** (fazla veri toplanmıyor); `Sentry.setUser` **hiç
  çağrılmıyor**; `dataCollection.userInfo: false` ⇒ istemci IP'si zarfa **gitmiyor**
  (kontrol grubunda `include.ip` davranışı doğrulandı).
- ⚠ **Sonuçsuz kalan ölçüm (dürüst kayıt):** `stackFrameVariables: false`'ın yerel değişken
  **değerlerini** bastırdığını **kanıtlayamadım** — `LocalVariablesAsync` entegrasyonu
  kontrol kolunda da (varsayılan `true`) hiçbir `vars` alanı üretmedi ⇒ **kontrol grubu
  çalışmadı**, sonuç kanıt değeri taşımıyor. Sızıntı **gösterilmedi**; ayar savunma amaçlı
  doğru. (AGENT_BASELINE §5: "komut çıktısızlığı ≠ bulgu yokluğu".)

---

## 5. ÖLÇÜMLER

```
pnpm audit                  6 zafiyet | 0 critical · 2 high · 3 moderate · 1 low
                            ⭐ 9 yeni OTel/Sentry paketi advisory'lerde 0 kez geçiyor
                            2 high ÖNCEDEN VAR OLAN, kapsam dışı: effect (prisma), multer (nestjs)
pnpm guards                 25/25 PASS (AC-61 dahil — gerçek DSN 0, reddedilen meta-paket 0)
pnpm env:check              yeşil
sentry-invariants.test.ts   26/26 PASS   (tur 1: 19 ⇒ +7)
redaction.test.ts           51/51 PASS   (tur 1: 42 ⇒ +9)
SECRET_FIELD_NAMES          27   ·  PINO_REDACT_PATHS  39   ·  WILDCARD  6 (bilerek sabit)
İncelenen dosya             57 değişen/yeni (49 değişen + 8 yeni) + 6 observability üretim dosyası
                            + 4 @sentry/@opentelemetry node_modules kaynak dosyası (kapı doğrulaması)
Bellek içi ölçüm            6 senaryo × 2-4 kol = 16 koşum, HEPSİ kontrol gruplu
Karşılanmayan §7 maddesi    ⭐ YOK (tur 1'in md 6 ve md 8'i KAPANDI)
packages/db değişikliği     0 dosya (Prisma şeması + sql/ dokunulmamış)
```

**Kapatılmayan tur 1 bulgusu: YOK.** Yeni: **1 medium + 3 low** ⇒ **PASS**.

# T-002 — security gate · tur 1

Tarih: 2026-10-26
Sürüm: v0.0.4 (ROADMAP)
Dal: `chore/ajan-altyapisi`
Ajan: security (GATE)

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] pnpm-workspace.yaml:101 (multer@2.4.0, @nestjs/platform-express üzerinden) — `pnpm audit` 1 HIGH: GHSA-q7qp-rjg7-q26m (multer >=2.0.0 <2.5.0, async `fileFilter` istek teardown'ından sonra askıda kalınca DoS). Senaryo: kimliksiz istemci multipart POST atar ve `fileFilter` beklerken bağlantıyı koparır → yakalanmamış reddetme/sızan kaynak → süreç seviyesinde DoS. v0.0.4'te SOMUT DEĞİL (`FileInterceptor`/multipart kullanımı 0 — ampirik grep), ROADMAP v0.0.16 multipart'ı açınca SOMUTLAŞIR; bu yüzden high değil medium — `pnpm audit` bu sürümde bir CI kapısı da değil (.github/workflows yok). Düzeltme: `package.json` → `pnpm.overrides` ile `multer: ">=2.5.0"` (veya multer'ı pinleyen daha yeni platform-express), catalog'a Türkçe gerekçe + `pnpm audit`'in beşli kapıya eklenmesi; en geç v0.0.16 — devops
  - [SEV: low] apps/api/src/health/health.controller.ts:64 + tenant-exempt-paths.ts:23 — `/health/ready` kimlik doğrulamasız VE tenant'tan muaf, her istekte gerçek DB (`SELECT 1`) + Redis (`PING`) I/O yapıyor; oran sınırı ve ağ kısıtı yok. Senaryo: kimliksiz saldırgan yüksek eşzamanlılıkla bu uca istek seli gönderir → her istek tenant trafiğiyle PAYLAŞILAN Prisma havuzundan bir bağlantı tüketir → havuz tükenir, gerçek tenant istekleri kuyruğa girip zaman aşımına uğrar. 503 gövdesi ayrıca altyapı topolojisini (`{database:'up',redis:'down'}`), `/health` ise platform sürümünü anonim çağırana açıyor. v0.0.4'te PUBLIC YÜZEY YOK (ingress/deploy v0.18.0) + her kontrol `withTimeout(2000)` ile sınırlı → bu yüzden low. Düzeltme: ilk public dağıtımdan önce `/health/ready`'yi ingress'ten çıkar (yalnızca k8s probe) veya önüne ucuz IP bazlı sınır koy; ROADMAP Teknik Borç satırı, vade v0.18.0 — devops + architect
  - [SEV: low] apps/api/src/tenancy/tenant-exempt-paths.ts:36-42 — `isTenantExemptPath` yolu WHATWG `new URL()` ile üretiyor; bu ayrıştırıcı nokta-segmentlerini DÜŞÜRÜYOR, Express/Nest yönlendiricisi ise ham istek hedefini eşliyor. Ampirik olarak `/./health`, `/admin/../health`, `/__smoke/.`, `health`, `http://evil.com/health` MUAF sayılıyor → etkin muafiyet yüzeyi, tasarımın dayandığı "tam eşleşme, küme TAM OLARAK iki eleman" garantisinden (R4 telafisi #2) geniş. Senaryo bugün tamamlanmıyor: bu biçimlerin hiçbirinde yönlendirici eşleşmiyor (ampirik: HTTP_EXCEPTION 404) ve tenant'a bağlı bir handler'a ulaşılsa `getTenantContext()` `kind!=='resolved'` için fırlatıyor → sızıntı yok. Düzeltme: yolu yönlendiricinin kullandığı ayrıştırıcıyla üret (veya normalize edilmiş pathname ham önekten farklıysa muafiyeti reddet) + nokta-segment/absolute-form vektörlerini `tenant-exempt-paths.test.ts`'e ekle — backend + qa
  - [SEV: low] apps/api/src/tenancy/tenant.guard.ts:44 (dolaylı) — eşleşmeyen rotada global `APP_GUARD` HİÇ koşmuyor, bu yüzden yanıt `TENANT_NOT_FOUND` yerine `HTTP_EXCEPTION` oluyor. Senaryo: kimliksiz istemci rastgele `Host` ile uç tarar; `/__smoke` → `TENANT_NOT_FOUND`, `//health` → `HTTP_EXCEPTION` ayrımından "bu rota VAR" bilgisini çıkarıp tüm API yüzeyini kimlik doğrulamadan haritalar. Tenant VARLIĞI sızmıyor (AC8 ayrımsızlığı 7 sebep için bayt bayt doğrulandı) — yalnızca rota varlığı. Düzeltme: eşleşmeyen rota 404'ünün `TENANT_NOT_FOUND` ile aynı gövdeye toplanıp toplanmayacağına karar ver; ertelenirse Teknik Borç (vade v0.0.5 auth turu) — architect
  - [SEV: low] apps/api/src/tenancy/tenant-resolver.service.ts:101,145 — `x-arkesoft-tenant` değeri Zod/`SLUG_PATTERN` ile PARSE EDİLMEDEN doğrudan `findUnique({where:{slug}})` argümanı oluyor. Ampirik olarak zararsız: 5000 karakter, `x' OR 1=1 --`, `../../etc/passwd`, `%00` → dördü de 404, çökme yok, sorgu parametreli; yol yalnızca `NODE_ENV!=='production'`'da canlı. Yine de CLAUDE.md §4 "dış dünyadan gelen her veri Zod ile parse edilir" ihlali ve host yolunun `SLUG_PATTERN`'ini uygulayıp bu yolun uygulamaması tek savunma katmanında asimetri. Düzeltme: dev başlığını AYNI `SLUG_PATTERN`'den geçir (kopyalamadan, `resolve-host.ts`'ten paylaş) ve geçmezse `invalid_slug_format` dön — backend
  - [SEV: low] apps/api/src/request-context/request-id.ts:33-43 — istemciden gelen `x-request-id`, desene uyduğunda OLDUĞU GİBİ kabul edilip yanıt başlığına ve isteğin TÜM log satırlarına yazılıyor. CRLF/kontrol karakteri/dizi/uzunluk enjeksiyonu DOĞRU kapatılmış (17 vektör ampirik). Kalan risk: saldırgan bilerek başka bir isteğin (veya sabit bir) id'sini göndererek saldırı anında log korelasyonunu bulanıklaştırır; platformun ürettiği id ile istemciden geleni ayıran bir işaret yok. Düzeltme: log bağlamına `requestIdSource: 'client' | 'generated'` alanı ekle — backend
```

> Bulgu toplamı: **1 medium + 5 low** → AGENT_BASELINE §4: `critical`/`high` yok,
> medium sayısı 3'ten küçük → **PASS**. Bulgular teknik borca kaydedilir.

---

## Odak bazlı durum (1–8)

| #   | Odak                                            | Durum                                     |
| --- | ----------------------------------------------- | ----------------------------------------- |
| 1   | Tenant çözümleme — tek savunma hattı            | **TEMİZ** (41 vektör, hepsi fail-safe)    |
| 2   | Onay #1'in uygulaması (`x-arkesoft-tenant`)     | **TEMİZ** (uçtan uca doğrulandı)          |
| 3   | Fail-closed zinciri + ST-5'in K-A4'ten sapması  | **TEMİZ** (sapma fail-closed'ı bozmuyor)  |
| 4   | AC8 sızdırmazlık                                | **TEMİZ** (7 sebep bayt bayt aynı)        |
| 5   | Log güvenliği (CRLF, cookie/authorization, sır) | **BULGU VAR** (low — request-id kaynağı)  |
| 6   | Yeni yüzeyin riskleri (Redis/filter/manifest)   | **BULGU VAR** (low — `/health/ready` DoS) |
| 7   | `pnpm audit` + `@arkesoft/errors` yüzeyi        | **BULGU VAR** (medium — multer)           |
| 8   | R-P1 teyidi (eslint Prisma yasağı)              | **TEMİZ** (negatif probe lint'i kırıyor)  |

---

## 1 — Tenant çözümleme (`resolve-host.ts`) · TEMİZ

Kod okuması: `h.endsWith('.' + base)` kullanılıyor (`resolve-host.ts:141`),
`h.endsWith(base)` ve `h.includes(base)` **yok**; `h === base` dalı **adım 4'ten önce**
(`:135`). Dizi girdi ilk değere indirilmiyor (`:115`). `X-Forwarded-Host` fonksiyonun
hiçbir parametresinde temsil edilmiyor → **yapısal olarak okunamaz**; `trust proxy`
kodda hiç geçmiyor (A-A7 teyit edildi, bulgu değil).

Derlenmiş `apps/api/dist/tenancy/resolve-host.js` üzerinde **41 vektör** (tek betik):

| Host                                       | Sonuç                                        |
| ------------------------------------------ | -------------------------------------------- |
| `demo-magaza.arkesoft.localhost`           | `subdomain:demo-magaza` ✔                    |
| `demo-magaza.arkesoft.localhost.evil.com`  | `custom-domain` (slug ÜRETMİYOR) ✔           |
| **`notarkesoft.localhost`**                | `custom-domain` (**`not` slug'ı YOK**) ✔     |
| `DEMO-MAGAZA.ARKESOFT.LOCALHOST`           | `subdomain:demo-magaza` ✔                    |
| `arkesoft.localhost` / `:8080` / `.`       | `unresolved:bare_base_domain` ✔              |
| `.arkesoft.localhost`                      | `unresolved:base_domain_mismatch` ✔          |
| `a.demo-magaza.arkesoft.localhost`         | `unresolved:nested_subdomain` ✔              |
| `demo-magaza..arkesoft.localhost`          | `unresolved:nested_subdomain` ✔              |
| `demo-magaza.arkesoft.localhost.`          | `subdomain:demo-magaza` ✔                    |
| `demo-magaza.arkesoft.localhost:3000`      | `subdomain:demo-magaza` ✔                    |
| `[::1]:3000` · `[::]` · `0.0.0.0`          | `custom-domain` (slug yok) ✔                 |
| `lоcalhost` (Kiril o)                      | `custom-domain:xn--lcalhost-nbh` ✔           |
| `localhost@evil.com`                       | `custom-domain:evil.com` ✔                   |
| `127.0.0.1:5432@evil.com`                  | `custom-domain:evil.com` ✔                   |
| `2130706433` · `0x7f000001` · `127.1`      | `custom-domain:127.0.0.1` ✔                  |
| `demo-magaza%00.arkesoft.localhost`        | `unresolved:unparsable_host` ✔               |
| 300 karakterlik host                       | `unresolved:unparsable_host` (255 kapısı) ✔  |
| `www.` / `api.` / `admin.` / `superadmin.` | `unresolved:reserved_subdomain` ✔            |
| `evil.com#demo-magaza.arkesoft.localhost`  | `custom-domain:evil.com` ✔                   |
| boş dize · `undefined`                     | `unresolved:missing_host` ✔                  |
| dizi girdi                                 | `unresolved:multiple_host_headers` ✔         |
| `müşteri.arkesoft.localhost`               | `subdomain:xn--mteri-kva70e` (IDN) ✔         |
| `user:pass@demo-magaza.…`                  | `subdomain:demo-magaza` (userinfo soyulur) ✔ |
| `-demo.` · `demo_magaza.`                  | `unresolved:invalid_slug_format` ✔           |

**Ek vektör seti — rezerve liste / yüzde kodlama baypası (12 vektör, hepsi kapalı):**
`%61dmin` → `reserved_subdomain`, `%77ww` → `reserved_subdomain`,
`%41PI` → `reserved_subdomain`, `%73uperadmin` → `reserved_subdomain`,
`aDmIn`/`WWW`/`ADMIN…localhost.` → `reserved_subdomain`,
`admin%2e`/`demo%2emagaza` → `nested_subdomain`, `api%00` → `unparsable_host`.
Normalizasyon rezerve kontrolünden ÖNCE çalıştığı için yüzde kodlamayla rezerve
etiket geçirilemiyor.

**Tek savunma hattı teyidi:** `TenantContext` değerini yalnızca
`TenantResolverService.toResolution` (`private static`, modül içi) üretiyor; `apps/api`
içinde Prisma'ya giden **tam iki** çağrı var (`tenant-resolver.service.ts:167,180`),
ikisi de platform seviyesi `tenant` tablosunun tekil indeksini okuyor; `$queryRaw`
yalnızca `packages/db/src/health.ts:37`'de sabit `SELECT 1` olarak.

## 2 — Onay #1 (`x-arkesoft-tenant`) · TEMİZ

- `grep -n "process.env" apps/api/src/tenancy/*.ts` → **tek eşleşme ve o bir YORUM**
  (`tenant-resolver.service.ts:13`). `NODE_ENV` ctor'da `env.NODE_ENV`'den, yani
  parse edilmiş `API_ENV` provider'ından okunuyor (`:128`).
- Uçtan uca (`createTestApp({ apiEnv: {...BASE, NODE_ENV:'production'} })`):
  - production + **geçerli** host + başlık → **404** `TENANT_NOT_FOUND`
    → **host'a geri DÜŞÜLMÜYOR** (ST-5'in bilinçli sertleştirmesi doğrulandı).
  - production + geçerli host, başlık yok → **200** (kontrol).
  - production + **boş** başlık → 200 (boş değer "yok" sayılıp host'a düşüyor;
    K-A4 "boş değilse" ifadesiyle uyumlu).
  - development + **çoklu** başlık (dizi) → **404**, **ilk değer SEÇİLMİYOR**.

## 3 — Fail-closed zinciri + ST-5'in sapması · TEMİZ

`TenantGuard.enforce` exhaustive `switch` + `assertNever`; `resolved`/`exempt` → true,
`unresolved` → `TenantNotFoundError` (`reason` yalnızca `context`'e), `failed` →
`TenantResolutionFailedError`, `pending` → `throw`. **"default allow" dalı yok.**

**ST-5'in K-A4'ten sapması fail-closed'ı BOZMUYOR.** Gerekçe ampirik + yapısal:
`exempt` üretmenin TEK yolu `isTenantExemptPath(req.url)`; `TenantContextMiddleware`
bir rota için hiç koşmazsa çözüm `pending` kalır ve guard fırlatır. Guard'ın ayrıca
sorgulaması aynı fonksiyonu çağıracağından yeni bir güvence eklemezdi; iki yerde
tekrarlanan yol eşleştirme mantığının sapma riskini önlemek için sapma **doğru
karar**. (Muafiyet yüzeyinin genişliği ayrı bir low bulgu — yukarıda #3.)

`TENANT_EXEMPT_PATHS` → `{'/health','/health/ready'}`, `size === 2` (ampirik).
26 yol vektörü denendi; istenen "muaf OLMAMALI" listesinin tamamı karşılandı:

| Yol                | exempt         | Yol           | exempt  |
| ------------------ | -------------- | ------------- | ------- |
| `/HEALTH`          | false ✔        | `//health`    | false ✔ |
| `/health/`         | true (tasarım) | `/health%2f`  | false ✔ |
| `/health?x=1`      | true (tasarım) | `/health;x=1` | false ✔ |
| `/health/../admin` | false ✔        | `/%68ealth`   | false ✔ |
| `/HEALTH/READY`    | false ✔        | `/healthz`    | false ✔ |
| `/health//`        | false ✔        | `/health%20`  | false ✔ |

Beklenmedik `true` dönenler (bulgu #3): `/./health`, `/admin/../health`, `/health/.`,
`health`, `http://evil.com/health`, `/health#x`.

## 4 — AC8 sızdırmazlık · TEMİZ

Yedi farklı çözümsüz sebep, aynı app örneği, `requestId` maskelenmiş ham gövde:

```
404 {"code":"TENANT_NOT_FOUND","message":"errors.tenant.notFound","details":{},"requestId":"<RID>"}
```

`bilinmeyen-tenant.example.invalid` (`no_row`/custom-domain) · `www.<base>`
(`reserved_subdomain`) · `-gecersiz.<base>` (`invalid_slug_format`) · `<base>`
(`bare_base_domain`) · `.<base>` (`base_domain_mismatch`) · `a.b.<base>`
(`nested_subdomain`) · `yok-boyle-tenant.<base>` (`no_row`) →
**ayrık gövde sayısı = 1**. `reason` tel üstünde **yok**, `details` her zaman `{}`
(`error-mapping.ts:54-64` `TenantNotFoundError` için `undefined` → `toErrorBody`
varsayılanı). Soft-delete ayrımsızlığı ST-7'nin kendi testinde zaten bayt bayt.

## 5 — Log güvenliği · BULGU VAR (low)

- **CRLF / log injection kapalı.** `INCOMING_REQUEST_ID_PATTERN` 17 vektörle sınandı:
  `req_<CR><LF>FAKE: 1` → yeniden üretildi · `req_%0d%0a` → yeniden üretildi ·
  `req_<LF>FAKE` → yeniden üretildi · 200 karakter → yeniden üretildi · 65 karakter →
  yeniden üretildi · boşluk içeren → yeniden üretildi · `<NUL>` içeren → yeniden
  üretildi · dizi → yeniden üretildi · boş → yeniden üretildi. Geçen tek sınıf
  `/^[A-Za-z0-9_-]{8,64}$/` (bulgu #6'nın konusu).
- **Başlıklar loggera HİÇ verilmiyor** (asıl garanti): `grep` ile `apps/api/src/logging`
  - `request-context` içinde `req.headers` kullanımı **tek satır** ve o da
    `resolveIncomingRequestId(req.headers['x-request-id'])`. `redact`
    (`packages/errors/src/redaction.ts:47-65`, 17 yol) ikinci katman.
- Ampirik: `cookie: session=SUPERSECRETCOOKIE` + `authorization: Bearer
SUPERSECRETTOKEN` taşıyan istek sonrası **1576 baytlık tüm log metninde 0 eşleşme**.
- **Kimlik bilgisi sızıntısı testi:** `DATABASE_URL`'e parola konup bozuk port verildi
  → yanıt 500 `TENANT_RESOLUTION_FAILED` + `details:{}` (istemciye hiçbir detay yok);
  log satırında Prisma'nın mesajı `Can't reach database server at 127.0.0.1:59999`
  var ama **parola YOK** (`all.includes(SECRET_PW) === false`). Prisma kimlik
  bilgisini maskeliyor.
- `parseEnv` hata mesajı yalnızca `key: message` üretiyor (`packages/config/src/env.ts:137-142`)
  → yanlış env değeri (ör. parolalı URL) hata metnine girmiyor.
- `grep -rn "console\." apps/api/src` (test hariç) → **0 çağrı** (2 eşleşme, ikisi de yorum).
- Sır deseni taraması (`password|secret|api[_-]?key|token|BEGIN .*PRIVATE KEY`):
  `apps/api/src` + `packages/errors/src` içindeki tüm `token` eşleşmeleri **DI
  token dosyaları** (`*.tokens.ts`) — repoya gömülü sır yok.
- KVKK: v0.0.4 hiç kişisel veri toplamıyor; `TENANT_SELECT` minimal (`name` alınmıyor),
  context iş verisi taşımıyor. Onay #2 uygulanmış: `seed.ts:100` `maskEmail(...)`,
  `seed.ts:111` `error.stack ?? error.message`.

## 6 — Yeni yüzeyin riskleri · BULGU VAR (low)

- **Redis `'error'` dinleyicisi VAR** (`redis.module.ts:54-61`), throttle'lı `warn`
  (`ERROR_LOG_THROTTLE_MS = 10_000`), `retryStrategy` üst sınırlı (`min(attempt*200, 2000)`).
  Tek bağlantı hatası süreci düşürmüyor.
- **`AppExceptionFilter` context'siz yolda ÇÖKMÜYOR** (ST-4'ün `tryGet…` + `ROOT_LOGGER`
  çözümü teyit edildi): ALS dışında doğrudan çağrıldığında
  `setHeader('x-request-id', req_…)` + `reply(500, {code:'INTERNAL_ERROR',
message:'errors.internal.unknown', details:{}, requestId})` yazıyor; ham mesaj
  yalnızca `logContext.rawMessage`'da.
- `resolvePlatformVersion()` (`platform-version.ts:31`) bozuk/eksik `package.json`'da
  `fs`/Zod hatasını **yutmuyor, çağırana iletiyor** → açılışta fail-fast. Doğru davranış
  (sessiz `undefined` sürümle ilerlemiyor). Bulgu yok.
- `/health` I/O'suz; `/health/ready` DB+Redis I/O yapıyor → bulgu #2.

## 7 — Bağımlılık · BULGU VAR (medium)

```
$ pnpm audit
1 vulnerabilities found
Severity: 1 high
→ critical: 0 · high: 1 · moderate: 0 · low: 0
```

high: `multer@2.4.0` — GHSA-q7qp-rjg7-q26m (`>=2.0.0 <2.5.0`, yama `>=2.5.0`).
Yollar: `apps__api > @nestjs/core > @nestjs/platform-express > multer` (+3 yol daha).
Erişilebilirlik: `grep -rn "FileInterceptor|multipart|multer" apps/api/src packages/*/src`
→ **0**. `pnpm.overrides` **yok**. CI henüz yok (`.github/workflows` dizini yok), bu
yüzden kabul kriteri ihlali değil → bulgu #1'de medium.

`@arkesoft/errors` bağımlılık yüzeyi: runtime `dependencies` **yalnızca `zod`**
(`packages/errors/package.json`) → iç pakete bağımlı değil, döngü imkansız (K-A2 teyit).

## 8 — R-P1 teyidi · TEMİZ

`apps/api/eslint.config.mjs` `no-restricted-imports`'u **üç ayrık blokta** kuruyor
(`src/**/*.ts`, `src/main.ts`, `src/validation/**`) ve `mergeRestrictions(...)` ile
Prisma yasağını her blokta **yeniden beyan ediyor** (`prismaRestriction` üçünde de).

Negatif probe — en çok muafiyeti olan blokta (`src/validation/**`):

```
$ (geçici dosya) src/validation/zz-probe-prisma.ts → import { PrismaClient } from '@prisma/client'
$ pnpm --filter @arkesoft/api exec eslint src/validation/zz-probe-prisma.ts
  1:1  error  '@prisma/client' import is restricted from being used.
              Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3)
              no-restricted-imports
✖ 1 problem (1 error, 0 warnings)   → komut exit != 0
```

Probe **silindi**.

---

## Tenant izolasyon kontrol listesi (CLAUDE.md §7) — bu değişiklik için

| #   | Madde                             | Durum                                                                                                                   |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | `tenant_id` NOT NULL              | **N/A** — yeni tablo/alan yok (veri modeli değişmedi)                                                                   |
| 2   | RLS + politika                    | **KARŞILANMIYOR** — bilinçli, vade v0.0.13, Teknik Borç'ta **üç ayak** olarak kayıtlı (ROADMAP:121, 1225+)              |
| 3   | `(tenant_id, …)` bileşik indeks   | **N/A** — okumalar platform seviyesi `tenant` tablosunun `tenant_slug_key`/`tenant_primary_domain_key` tekil indeksleri |
| 4   | `tenantProcedure`, `public` değil | **N/A** (tRPC v0.0.6) — muadili karşılandı: global `APP_GUARD` + varsayılan reddetme                                    |
| 5   | `withTenant()` üzerinden sorgu    | **N/A** (v0.0.13) — `apps/api`'deki 2 Prisma çağrısı platform tablosunu okuyor, gerekçe yorumlu                         |
| 6   | Girdideki `id`'ye güvenilmiyor    | **KARŞILANDI** — hiçbir yerde girdiden `id` alınmıyor; `TenantContext` modül içi fabrikadan ve tekil indeks okumasından |
| 7   | Kuyruk işi `tenantId` + context   | **N/A** (BullMQ v0.0.11)                                                                                                |
| 8   | Dış kaynak tenant kapsamlı        | **N/A** — Meilisearch/S3 kullanımı yok                                                                                  |
| 9   | Önbellek anahtarı tenant kapsamlı | **N/A** — tenant çözümü **önbelleklenmiyor** (A-V26 teyit: `apps/api` içinde önbellek yok)                              |
| 10  | Dosya yolu tenant öneki           | **N/A** — dosya yükleme/indirme yok                                                                                     |
| 11  | `createTenantIsolationSuite()`    | **KARŞILANMIYOR** — süit v0.0.13, `test:isolation` bu sürümde bilinçli koşulmuyor (AC12)                                |
| 12  | Hata mesajı varlık sızdırmıyor    | **KARŞILANDI** — 7 sebep bayt bayt aynı 404 (ampirik)                                                                   |
| 13  | Logda `tenantId`                  | **KARŞILANDI** — `logger.child({tenantId})` tek yazıcı; `/health` kaydında alan hiç yok                                 |
| 14  | Süper admin denetim kaydı         | **N/A** — süper admin yüzeyi yok                                                                                        |

**Karşılanmayan madde numaraları: 2 ve 11** — ikisi de Task dosyasında ve ROADMAP
Teknik Borç'ta gerekçeli, vade v0.0.13. Yeniden açılmadı.

**v0.0.4'ün getirdiği YENİ gerçek (teyit edildi):** RLS yokluğunda tenant
izolasyonunun tek garantisi artık uygulama katmanı — `resolve-host.ts` +
`TenantContextMiddleware` + `TenantGuard` + `getTenantContext()`'in fail-closed
`throw`'u. Bu zincirin yedi mekanizması (R4 telafisi) ampirik olarak çalışıyor.
**`docs` ajanı bu notu `docs/development.md` ve ROADMAP Teknik Borç'a yazmak
zorunda** (PM'in R4 talebi; bu raporun kaydı o notun yerini tutmaz).

---

## ÖLÇÜMLER

**Koşan komutlar ve gerçek çıktıları**

| Komut                                                                           | Çıktı                                                                                   |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm audit`                                                                    | `1 vulnerabilities found · Severity: 1 high` (critical 0 / high 1 / moderate 0 / low 0) |
| `pnpm --filter @arkesoft/api test`                                              | **14 dosya / 112 test passed, 0 failed, 0 skipped** (9.17 s)                            |
| `pnpm --filter @arkesoft/api exec eslint src/validation/zz-probe-prisma.ts`     | 1 error (`no-restricted-imports`), exit != 0 → R-P1 teyit                               |
| `node` saf fonksiyon vektör betiği (`dist/tenancy/resolve-host.js`)             | 41 host vektörü + 12 kodlama baypas vektörü, **0 hatalı eşleşme**                       |
| `node` yol/id betiği (`dist/tenancy/tenant-exempt-paths.js`, `request-id.js`)   | 26 yol vektörü + 17 request-id vektörü                                                  |
| geçici vitest probe'u (`zz-security-probe*.test.ts`, 2 dosya, 10 test)          | **10/10 passed**, sonra **silindi**                                                     |
| `grep -n "process.env" apps/api/src/tenancy/*.ts`                               | 1 eşleşme, **yorum satırı** (kod yok)                                                   |
| `grep -rni "X-Forwarded-Host\|trust proxy\|findFirst\|insensitive" src/tenancy` | 6 eşleşme, **altısı da yorum** (kod yok)                                                |
| `grep -rn "console\." apps/api/src` (test hariç)                                | 2 eşleşme, **ikisi de yorum** → 0 çağrı                                                 |
| `grep -rn "FileInterceptor\|multipart\|multer" apps/api/src packages/*/src`     | **0**                                                                                   |

**Toplam vektör: 96** (41 host + 12 kodlama + 26 yol + 17 request-id)
**İncelenen dosya: 24** (`apps/api/src`: tenancy 7, request-context 5, errors 3,
logging 2, redis 2, health 2, config 1, http 1, main/app.module 2 + `packages/errors`
2 + `packages/config/src/env.ts` + `packages/db/src/{health,seed}.ts` +
`apps/api/eslint.config.mjs` + `apps/api/vitest.config.ts`)

**Repo durumu:** tüm geçici probe'lar silindi; `git status` denetim öncesi hâliyle
birebir aynı (yalnızca bu rapor dosyası eklendi). Hiçbir üretim dosyası
değiştirilmedi, hiçbir biçimlendirme komutu çalıştırılmadı. `pnpm db:reset`
**çalıştırılmadı**, `DEMO_SEED`'e satır **eklenmedi**.

**Kapsam dışı tutulan bilinçli kararlar (yeniden açılmadı):** RLS yok (v0.0.13, üç
ayak) · `suspended` HTTP'de engellenmiyor (PM notu 5) · `helmet`/`cors` (R-A11,
v0.0.7) · tenant çözümü önbelleklenmiyor (A-V26) · `X-Forwarded-Host` okunmuyor +
`trust proxy` kapalı (A-A7, **teyit edildi**) · `process.stdout/stderr.write` CLI
giriş noktalarında (R-A7).

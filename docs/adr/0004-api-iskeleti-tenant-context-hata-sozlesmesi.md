# ADR-0004 — NestJS API İskeleti, Tenant Context ve Hata Sözleşmesi

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-26
- **Karar verenler:** Architect, PM, Orkestratör
- **İlgili versiyon:** `v0.0.4` ve sonrası
- **Supersedes:** —
- **Superseded by:** — (v0.0.6 tRPC hata eşlemesi, v0.0.13 RLS mekanizması önceden bağlıdır)

---

## Bağlam

Arkesoft v0.0.1–v0.0.3, monorepo iskeleti, yerel altyapı ve veritabanı şemasını tamamladı. v0.0.4, platformun **ilk HTTP yüzeyini** açar — hiçbir ürün özelliği değil, tüm özelliklerin oturacağı HTTP katmanı ve tenant bağlamı.

Karşılaşılan tasarım sorunları:

1. **Tenant izolasyonunun mimarisi:** v0.0.13'e kadar RLS politikaları olmayacağı için, **istek→tenant çözümü→context yayılması** benzersiz biçimde tasarlanmalı — middleware ve guard ayrı ayrı başarısız olabilir; fail-closed davranış kesinlik kazandırır.

2. **Üretim kodunda adaptör adı:** Fastify'a geçiş planlanıyorsa, NestJS adaptörü bir karar olarak dokümante edilmeli. Express seçeneği platform özellikleri (Better Auth, tRPC, Bull Board, multipart) ile ileriye doğru uyum sağlamak gerekçesiyle.

3. **Hata gövdesi sözleşmesi:** Tüm yanıtların biçimi (`code`, `message`, `details`, `requestId`) merkezi bir yerde tanımlanmalı — v0.0.6 tRPC, v0.0.22 snapshot ve API dokümanı bu tanımdan ileriye dönük gelişir.

4. **AppError yeri:** Birimler (packages/integrations, packages/theme-sdk) hata fırlatmak zorunda olacağı, ama uygulama bağımlılıklarını ithal edemeyeceği için, **AppError paylaşılan bir pakette** yaşamalı. `apps/api` içinde tanımlamak v0.0.6'da taşıma maliyeti doğurur.

5. **Zod doğrulama:** NestJS'in `class-validator` + `class-transformer` yaklaşımı ile Zod arasında çift bakım ortaya çıkar — tek yol seçilmeli.

---

## Karar

Bu sürüm aşağıdaki sekiz tasarım kararını yapar:

### 1. **HTTP Adaptörü: Express** (`@nestjs/platform-express`)

**Karar:** NestJS uygulaması **Express** üzerinde çalışır.

**Gerekçe:** Performans değil, **entegrasyon yüzeyi** sayısı. Sonraki beş sürüm şu özellikleri gerektirecek:

| Sürüm  | Özellik     | Express                              | Fastify                           |
| ------ | ----------- | ------------------------------------ | --------------------------------- |
| 0.0.5  | Better Auth | `toNodeHandler()` — belgeli          | Raw body + parser karmaşıklığı    |
| 0.0.6  | tRPC mount  | `createExpressMiddleware()` — yaygın | Undocumented Nest integration     |
| 0.0.11 | Bull Board  | `@bull-board/express` — hazır        | `+ @fastify/static` + view motoru |
| 0.0.16 | Multipart   | Platform-express multer built-in     | `+ @fastify/multipart`            |
| 0.6.x  | Webhook raw | `express.raw()`                      | `+ fastify-raw-body`              |

Express seçimi **adaptör kuplajını minimize eder:** kaynak dosyaları express/fastify adları içermez; çağrı yüzeyi `HttpAdapterHost` ile yapılandırılmış (`res.status().json()` **yasak**); istek okuma yapısal tipler (`express ∩ fastify`) üzerinden; uygulama adaptörü yalnızca `main.ts:16`'da geçer.

**Fastify'a geçiş:** Bir NestJS `new FastifyAdapter()` + iki adet bağımlılık eklenmesi kadar basit olacak.

---

### 2. **AppError Hiyerarşisi: Yeni İç Paket `@arkesoft/errors`**

**Karar:** `packages/errors` oluşturulur ve **tek** uygulama hata hiyerarşisini taşır.

**İçerik:**

- `abstract class AppError` — beş alan: `code` (makine okunur), `httpStatus`, `userMessageKey` (i18n anahtarı), `context` (log-only, asla yanıta yazılmaz), `isRetryable`
- `interface AppErrorBody` + `appErrorBodySchema` (Zod) + `toErrorBody()` — tel sözleşmesi (`{ code, message, details, requestId }`)
- `maskEmail(value)` + `PINO_REDACT_PATHS` — redaction ilkelleri
- `isAppError()` — `instanceof` + yapısal yedek (iki ayrı `AppError` tanımına dayanıklı)

**Bağımlılık:** Yalnızca `zod` → döngü imkansız.

**Gerekçe:**

1. v0.0.6'da `packages/trpc` hata şemasını, v0.0.17'de Sentry eşlemesini görmek zorunda.
2. v0.0.6 `packages/integrations`'taki adaptörler `IntegrationError extends AppError` fırlatacak; adaptör paketi uygulama importu edemez.
3. Taşıma v0.0.4'te mekaniktir; v0.0.6'da kritik tanımlar (**`details` üretimi**) bu pakete bağlı hale gelir.

**Fallback (onay verilmezse):** `apps/api/src/errors/` + `packages/db/src/mask-email.ts` (3 satır kopya); borç ROADMAP v0.0.6'da.

---

### 3. **PrismaModule: `$disconnect()` Yeterli, Teardown Yüzeyi Eklenmez**

**Karar:** Genel (`@Global`) Prisma modülü, `$disconnect()`'in bağlantı havuzunu kapatması yeterli kılar.

**Yapı:**

```
PrismaModule (@Global)
  ├─ PRISMA_CLIENT ← useFactory: (env) => createPrismaClient({ databaseUrl: env.DATABASE_URL })
  └─ PrismaService
      ├─ .db getter (raw client dışa açılır)
      └─ OnModuleDestroy → $disconnect()
```

**Özellikler:**

- **Eager `$connect()` YOK** — veritabanı kapalıyken uygulama ayağa kalkabilir, `/health/ready` 503 döner.
- **Additive tek ek:** `packages/db/src/health.ts` → `checkDatabaseConnection(db)` (`SELECT 1`, fırlatır)
- Env: `API_ENV.DATABASE_URL` enjekte edilir; şema v0.0.3'ten `CreatePrismaClientOptions` `databaseUrl` parametresi ile uyumlu.

**Teknik borç (low, v0.0.17):** `onPoolError` callback'i açılmadığı için idle havuz hataları pino'ya ulaşmıyor.

---

### 4. **Tenant Çözümleme: Fail-Closed Middleware + Guard**

**Karar:** Tenant girişi host adından veya (geliştirme modunda) başlık başlığından çözülür; NestJS middleware'de asla fırlatılmaz, guard'da exhaustive switch çalıştırılır.

**Algoritma (`resolve-host.ts`):**

1. **Kaynak önceliği:**
   - (1) `NODE_ENV !== 'production'` **ve** tek değerli `x-arkesoft-tenant` → slug olarak yorum
   - (2) Aksi halde `Host` başlığından

2. **Host normalizasyonu:**
   - `new URL('http://' + raw)` → port soyma, IPv6, ASCII küçük harf, IDN→punycode
   - Sondaki tek nokta soyulur

3. **Eşleşme (kural sırası kesin):**
   - `h === base` → çözümsüz (`bare_base_domain`)
   - `h.endsWith('.' + base)` → subdomain (`label`)
   - Aksi halde → özel alan adı (`primaryDomain` tam eşleşme)

4. **Sorgu (istek başına EN FAZLA 1):**
   - slug dalı → `findUnique({ where: { slug }, select: { id, slug, status, deletedAt } })`
   - özel alan dalı → `findUnique({ where: { primaryDomain: h } })`
   - Çözümsüz hallerde sorgu yok

5. **Durum kuralları:**
   - Satır yok veya `deletedAt != null` → çözümsüz (404 TENANT_NOT_FOUND)
   - `status === 'suspended'` → çözülmüş sayılır (davranış v0.0.8'in kararı)

6. **Allowlist (fail-closed):**
   - `TENANT_EXEMPT_PATHS = { '/health', '/health/ready' }` — tam eşleşme, prefix yasak

**İlgili karar (Onay #1):** `x-arkesoft-tenant` başlığı **üretimde göz ardı edilir** ve host'a fallback yapılmaz; bunun yerine başlık **`header_rejected_in_production`** sebebiyle reddedilir.

---

### 5. **AsyncLocalStorage Sözleşmesi: Middleware → Guard Fail-Closed Zinciri**

**Karar:** NestJS middleware'de fırlatmayan bir discriminated union yapısı yazılır; guard exhaustive switch ile okur ve fırlatır.

**Tipler:**

```typescript
type RequestContext = {
  readonly requestId: string
  readonly receivedAt: number
  logger: Logger // middleware child ile değiştirir
  tenant: TenantResolution // mutable tek alan
}

type TenantResolution =
  | { kind: 'pending' } // middleware koşmadı → GUARD 500 ATAR
  | { kind: 'exempt' } // allowlist'te
  | { kind: 'resolved'; tenant: TenantContext }
  | { kind: 'unresolved'; reason: string } // 11 sebep
  | { kind: 'failed'; cause: unknown } // DB/network hatası
```

**Okuma yüzeyi — fail-closed:**

- `getTenantContext()` — `kind !== 'resolved'` ise **fırlatır**
- `getTenantId()`, `getLogger()` — fail-closed tanımlı
- `tryGetRequestContext()` — yalnızca filter ve optional bağlamlar

**Middleware sırası kesin:** `RequestContextMiddleware` → `TenantContextMiddleware` (app.module.ts bağlayıcı).

---

### 6. **Zod Doğrulama: Global Pipe + Lint Zorlaması**

**Karar:** Doğrulama **parametre seviyesi `ZodValidationPipe<T>`** ile yapılır; eslint **Body/Query/Param import'unu yasak** kılar.

**İmplementasyon:**

- `ValidatedBody`, `ValidatedQuery`, `ValidatedParams` dekoratörleri
- `apps/api/eslint.config.mjs` override bloğu: `no-restricted-imports` [`@nestjs/common` → `Body/Query/Param` yasak](https://github.com/nestjs/nest/issues/4606)
- Hata eşlemesi: `ValidationError extends AppError` → `details: { fields: { [key]: 'errors.validation.<issueCode>' } }`
- **Zod ham mesajı tel üstüne yazılmaz** — i18n anahtarı → v0.0.18 çözümlemesi

---

### 7. **Strukturlandırılmış Log (Pino) — Elle Bağlanır**

**Karar:** `nestjs-pino` ve `pino-http` eklenmez; `pino` elle yapılandırılır.

**Yapı:**

```typescript
createRootLogger({ level, stream? }) => pino({
  base: { service: 'api', version: PLATFORM_VERSION },
  timestamp: isoTime,
  formatters: { level: label => ({ level: label }) },
  redact: { paths: PINO_REDACT_PATHS, censor: '***' }
})
```

**Özellikler:**

- `requestId` = `'req_' + randomUUID()` — istemci başlığı `/^[A-Za-z0-9_-]{8,64}$/` biçim doğrulamasından geçerse kullanılır, aksi halde yenisi üretilir
- `tenantId` — `TenantContextMiddleware` çözümden sonra `logger.child({ tenantId })` yazılır
- Başlık loggera hiç verilmez (HTTP istekleri kütüphaneler tarafından okunan kaynak olarak değil, HTTP katmanında okunur) — redact ikinci katman
- ALS context'i filter'da fail-soft (yalnızca logger ve requestId için) — context yoksa `ROOT_LOGGER` + `tryGetRequestContext()`

---

### 8. **Health Endpoints: `/health` (Liveness) ve `/health/ready` (Readiness)**

**Karar:** İki ayrı endpoint, ikisi de önceden yapılmıştır; Nest terminusy yok.

**`GET /health`** — **I/O'suz, tenant gerektirmez**

```json
{ "status": "ok", "service": "api", "version": "0.0.4", "uptimeSeconds": 123 }
```

**`GET /health/ready`** — **tenant gerektirmez, db+redis kontrolü, zaman aşımı 2 sn**

```json
{ "status": "ok", "checks": { "database": "up", "redis": "up" } }
```

Başarısızlık: **503**, `details: { checks: { database: 'down' } }`.

Sağlayıcıya özgü dallanma YOK (`if (provider === 'redis')` yasak); `HealthCheck[]` dizisi `Promise.allSettled` + `withTimeout(2000)`.

---

## Olumlu Sonuçlar

1. **İlk HTTP yüzeyi ayağa kalkar.** `/health` ve `/health/ready` operasyonel olur.
2. **Tenant izolasyonu fail-closed.** Middleware hatasında guard 500 atar; hiçbir bilinmeyen tenant veri vermez.
3. **Hata sözleşmesi merkezi.** v0.0.6, v0.0.17, v0.0.22 bu tek tanımdan gelişir.
4. **AppError tekil hiyerarşi.** Gelecek entegrasyonlar ve özellikler ortak hata kodu yazabilir.
5. **Dış sağlayıcı bağımlılığı yok.** `@nestjs/terminus` minimal ve sonda isteğe bağlı.

---

## Olumsuz Sonuçlar ve Riskleri

1. **v0.0.13'e kadar uygulama katmanı tek savunma hattı.** RLS politikaları yokken tenant filtresi unutulmak veya hata yazılması çapraz sızıntı doğrudan sonucudur. Middleware + guard testleri kesinlikle kapsamlı olmalı ve 20+ eşzamanlı istek kapanması sınanmalı.

2. **`details` üretimi merkezi değil (solid medium #2 buluşu).** `resolveAppErrorDetails()` `instanceof` zinciri, her yeni `AppError` türü merkezi mapper'ı düzenlemeyi zorunlu kılar. v0.0.6 `packages/trpc` hata eşlemesi yazılırken bu bağımlılık yanlış yere oturabilir.

3. **`isTenantExemptPath` güvenlik sınırı geniş (security low buluşu).** `new URL()` istemci kontrolündeki `req.url`'e sarılmadığı için `TypeError` atma riski; `try/catch` eksik. Ancak tetiklenebilirlik düşük (allowlist 2 elemanlı).

---

## Etkilenen Sonraki Kararlar

| Sürüm  | Karar                                                                                   |
| ------ | --------------------------------------------------------------------------------------- |
| 0.0.5  | `Better Auth` middleware'in `AppError`'ın dönüş yapısını beklediği                      |
| 0.0.6  | `packages/trpc` → `AppErrorBody` şemasını tüketir ve route hataları eşler               |
| 0.0.11 | `BullMQ` aynı `ioredis` istemcisini paylaşır; v0.0.4'ün Redis timeout'ları bilinmelidir |
| 0.0.13 | `FORCE ROW LEVEL SECURITY` + `SET LOCAL app.tenant_id` → `TenantContext.id` hazır       |
| 0.0.16 | `multer` multipart; express yerleşik davranış kullanılır                                |
| 0.0.17 | AppError.logLevel, Sentry eşlemesi, traceId                                             |
| 0.0.22 | Public API snapshot test `AppErrorBody` şemasını referanslar                            |

---

## Gözden Geçirme Koşulları

Bu ADR'nin açık kalması şu haller tetikler:

1. **v0.0.6 tRPC hata eşlemesi yazılırken `details` üretiminin sahibi taşınmamış olması** — K-A2'nin taşıma gerekçesinin yarısı geri alınmış demektir. ADR yeniden açılmalı ve iki çözümden biri seçilmeli:
   - `AppError.publicDetails()` geri çağrısı (varsayılan `{}`) — eşleme `toErrorBody(error, requestId, error.publicDetails)` ile kapanır
   - Mapper merkezi kalır, v0.0.6 KM'e borç yazılır

2. **v0.0.13 tenant context'i RLS SET LOCAL'e hazırlarken `TenantContext.id` yapısı değişebilir** — AD'ye ufak bir notla kaydedilir.

---

## Kaynaklar

- Task T-002 — Architect tasarımı (K-A1…K-A8)
- Gate raporları — solid #2, security low bulguları
- ROADMAP.md — v0.0.4, v0.0.5, v0.0.13 kararları
- CLAUDE.md §4 — AppError hiyerarşisi, log formatı, tenant izolasyonu

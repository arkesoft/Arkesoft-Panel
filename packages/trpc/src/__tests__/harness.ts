// @arkesoft/trpc — hermetik test koşum hattı (ROADMAP v0.0.6, T-007/ST-3 (S4),
// architect "Test yapılandırması" bölümü)
//
// `createTrpcRequestHandler()` + SAHTE portlar + ELLE kurulmuş `TrpcContext` →
// `localFetch` → `createTrpcClient({ fetch: localFetch })`. AĞ YOK, süreç
// içi — bu dosya hiçbir ağ soketi açmaz ve hiçbir dış depolama/önbellek
// bağımlılığı (ilişkisel veritabanı istemcisi, anahtar-değer önbelleği, ORM
// paketi) İÇERMEZ (AC11 hermetiklik şartı — bu dosyadaki import listesi tek
// kanıttır, yukarıdaki üç satıra bakınız).
//
// Bu dosya SADECE `packages/trpc`'nin KENDİ export yüzeyini (`../server.js`
// üzerinden erişilebilen `createTrpcRequestHandler`/`router`/`publicProcedure`/
// context ve port TİPLERİ) kullanır — S3'ün ÜRETİM kodu OKUNUR, DEĞİŞTİRİLMEZ.
//
// `localFetch` GERÇEK bir fetch ponyfill'idir (`as`/`any` YOK) — tRPC'nin
// `FetchEsque` tipini (`@trpc/client`'ın PUBLIC export etMEDİĞİ dahili tip,
// `create-trpc-client.ts`'in `HttpLinkFetch` İNDEKSLİ ERİŞİMİYLE türettiği
// tipin AYNISI) karşılamak için `init`/`input` parametreleri `unknown` olarak
// ele alınır ve Zod (`toHeaders`) + `instanceof`/`typeof` DARALTMASIYLA
// (narrowing) güvenli bir global `Request`'e çevrilir — global `fetch`in
// (`@types/node`/undici) `RequestInit` tipiyle tRPC'nin `RequestInitEsque`
// tipi arasındaki yapısal fark (S3'ün bildirdiği risk) `as`/`any` GEREKMEDEN
// çözülür; bu dosyanın derlenmesi RİSK'in çözülebilir olduğunun kanıtıdır
// (handoff raporunun "FETCH PONYFILL" bölümü).

import { z } from 'zod'
import { AppError } from '@arkesoft/errors'

import { createTrpcClient } from '../client/create-trpc-client.js'
import type { TrpcClient, TrpcClientOptions } from '../client/create-trpc-client.js'
import { createTrpcRequestHandler } from '../handler/create-trpc-request-handler.js'
import type { TrpcRequestHandler } from '../handler/create-trpc-request-handler.js'
import type {
  TrpcAuthState,
  TrpcContext,
  TrpcLoggerPort,
  TrpcTenantState,
} from '../context/trpc-context.types.js'
import type { JobReadPort } from '../ports/job-read.port.js'
import type { TenantReadPort } from '../ports/tenant-read.port.js'
import type { StorefrontTenantReadPort } from '../ports/storefront-tenant-read.port.js'
import type { TrpcErrorFactoryPort } from '../ports/trpc-error-factory.port.js'
import type { TenantSummary } from '../schemas/tenant-summary.schema.js'
import type { StorefrontTenant } from '../schemas/storefront-tenant.schema.js'
import type { JobListPage, JobSummary } from '../schemas/job-summary.schema.js'

// ---------------------------------------------------------------------------
// Kayıt tutan (recording) sahte logger
// ---------------------------------------------------------------------------

/** `createRecordingLogger()`'ın her çağrıyı kaydettiği tek bir giriş. */
export interface RecordedLog {
  readonly level: 'info' | 'warn' | 'error'
  readonly message: string
  readonly context: Record<string, unknown> | undefined
}

/** Testlerin log çağrılarını gözlemleyebilmesi için `TrpcLoggerPort`'un kayıt tutan uygulaması. */
export interface RecordingLogger extends TrpcLoggerPort {
  readonly entries: readonly RecordedLog[]
}

/**
 * `TrpcLoggerPort`'un sahte uygulaması — her `info`/`warn`/`error` çağrısını
 * `entries`'e ekler. "Bilinmeyen durum → `INTERNAL_SERVER_ERROR` + `warn`
 * loglanır" (durum↔kod haritası testi) ve "cause parse başarısızlığının
 * gözlemlenebilirliği" testleri bu kaydı okur.
 */
export function createRecordingLogger(): RecordingLogger {
  const entries: RecordedLog[] = []

  function record(
    level: RecordedLog['level'],
    message: string,
    context?: Record<string, unknown>,
  ): void {
    entries.push({ level, message, context })
  }

  return {
    entries,
    info(message, context) {
      record('info', message, context)
    },
    warn(message, context) {
      record('warn', message, context)
    },
    error(message, context) {
      record('error', message, context)
    },
  }
}

// ---------------------------------------------------------------------------
// Sahte `AppError` alt sınıfları (test-yerel — gerçek `apps/api` sınıflarının
// TAKLİDİ, mimariyle aynı code/httpStatus; `packages/trpc` hiçbir hata
// sınıfı TANIMLAMAZ, bu yüzden bu sınıflar YALNIZCA bu test dosyasında yaşar)
// ---------------------------------------------------------------------------

/** `apps/api`'nin `UnauthenticatedError`'ının test-yerel taklidi (401). */
export class HarnessUnauthenticatedError extends AppError {
  constructor() {
    super({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
      userMessageKey: 'errors.auth.unauthenticated',
    })
  }
}

/** `apps/api`'nin `TenantContextRequiredError`'ının test-yerel taklidi (401). */
export class HarnessTenantContextRequiredError extends AppError {
  constructor() {
    super({
      code: 'TENANT_CONTEXT_REQUIRED',
      httpStatus: 401,
      userMessageKey: 'errors.tenant.contextRequired',
    })
  }
}

/** `apps/api`'nin `TenantNotFoundError`'ının test-yerel taklidi (404) — `TenantReadPort.findSummary`'nin TOTAL sözleşmesini sınamak için. */
export class HarnessTenantNotFoundError extends AppError {
  constructor(tenantId: string) {
    super({
      code: 'TENANT_NOT_FOUND',
      httpStatus: 404,
      userMessageKey: 'errors.tenant.notFound',
      context: { tenantId },
    })
  }
}

// ---------------------------------------------------------------------------
// Sahte portlar
// ---------------------------------------------------------------------------

/** Harness'in varsayılan `tenant.current` çıktısı — gerçekçi, PII içermez. */
export const HARNESS_TENANT_SUMMARY: TenantSummary = {
  id: 'tenant_harness_01',
  slug: 'harness-tenant',
  name: 'Harness Tenant A.Ş.',
  status: 'active',
  primaryDomain: 'harness-tenant.arkesoft.app',
}

/**
 * `TenantReadPort`'un sahte uygulaması. Port TOTAL'dır (architect K1) —
 * `tenantId` beklenen özetinkiyle eşleşmiyorsa `null` DÖNMEZ,
 * {@link HarnessTenantNotFoundError} fırlatır.
 */
export function createFakeTenantReadPort(summary: TenantSummary): TenantReadPort {
  return {
    findSummary(tenantId) {
      if (tenantId !== summary.id) {
        return Promise.reject(new HarnessTenantNotFoundError(tenantId))
      }

      return Promise.resolve(summary)
    },
  }
}

/**
 * `StorefrontTenantReadPort`'un sahte uygulaması (ROADMAP v0.0.8, T-009/S5,
 * ADR-0012). Port TOTAL'dır (architect K4) — `tenantId` beklenen özetinkiyle
 * eşleşmiyorsa `null` DÖNMEZ, {@link HarnessTenantNotFoundError} fırlatır.
 * Dönüş değeri BİLEREK `summary`'nin TAMAMI değil, `StorefrontTenant`
 * sözleşmesinin üç alanı (`name`/`themeId`/`themeVersion`) — `id`/`slug`/
 * `status`/`primaryDomain` hiçbiri tele TAŞINMAZ, aynı sızdırmazlık burada
 * da korunur. GÜNCELLEME (ROADMAP v0.0.10, T-012/S4, solid tur1 M4 düzeltmesi):
 * `themeId`/`themeVersion` varsayılan olarak `null` döner (`TenantSummary`'de
 * bu alanlar yok, sahte port gerçek veri İCAT ETMEZ) — ama ikinci, OPSİYONEL
 * `themeSelection` parametresi ile ÇAĞIRAN null-OLMAYAN bir seçimi GEÇERSİZ
 * KILABİLİR (mevcut override deseni: `CreateHarnessOptions`'daki `options.x ??
 * default` idiomunun aynısı). Yeni port İCAT edilmedi; tek fabrika iki yolu da
 * (null ve null-olmayan) üretir.
 */
export function createFakeStorefrontTenantReadPort(
  summary: TenantSummary,
  themeSelection?: Pick<StorefrontTenant, 'themeId' | 'themeVersion'>,
): StorefrontTenantReadPort {
  return {
    findPublicTenant(tenantId) {
      if (tenantId !== summary.id) {
        return Promise.reject(new HarnessTenantNotFoundError(tenantId))
      }

      return Promise.resolve({
        name: summary.name,
        themeId: themeSelection?.themeId ?? null,
        themeVersion: themeSelection?.themeVersion ?? null,
      })
    },
  }
}

/** `apps/api`'nin `JobNotFoundError`'ının test-yerel taklidi (404) — `JobReadPort`'un TOTAL sözleşmesini sınamak için. */
export class HarnessJobNotFoundError extends AppError {
  constructor() {
    super({
      code: 'JOB_NOT_FOUND',
      httpStatus: 404,
      userMessageKey: 'errors.job.notFound',
    })
  }
}

/** Harness'in varsayılan `job.get` çıktısı — PII içermez, kuyruk girdisi TAŞIMAZ. */
export const HARNESS_JOB_SUMMARY: JobSummary = {
  id: 'job_harness_01',
  type: 'tenant.provision',
  status: 'queued',
  progress: 0,
  error: null,
  createdAt: '2026-11-03T09:00:00.000Z',
  updatedAt: '2026-11-03T09:00:00.000Z',
  startedAt: null,
  completedAt: null,
}

/**
 * `JobReadPort`'un sahte uygulaması (ROADMAP v0.0.11, T-013/S8). Port
 * TOTAL'dır — istenen `jobId` beklenen özetinkiyle eşleşmiyorsa `null`
 * DÖNMEZ, {@link HarnessJobNotFoundError} fırlatır. ⚠ Sahte port kiracı
 * kimliğine HİÇ bakmaz: gerçek adaptörde de sahiplik uygulama kodunda
 * KARŞILAŞTIRILMIYOR (RLS yapıyor) — sahteyi kiracı karşılaştıracak biçimde
 * yazmak, var olmayan bir uygulama-seviyesi kapıyı test ediyormuş gibi
 * görünürdü.
 */
export function createFakeJobReadPort(summary: JobSummary): JobReadPort {
  return {
    findJob(_tenantId, jobId) {
      return jobId === summary.id
        ? Promise.resolve(summary)
        : Promise.reject(new HarnessJobNotFoundError())
    },
    listJobs(_tenantId, query): Promise<JobListPage> {
      const matching = [summary].filter(
        (item) => query.status === undefined || query.status.includes(item.status),
      )

      return Promise.resolve({ items: matching.slice(0, query.limit), nextCursor: null })
    },
  }
}

/** `TrpcErrorFactoryPort`'un sahte uygulaması. */
export function createFakeErrorFactoryPort(): TrpcErrorFactoryPort {
  return {
    unauthenticated: () => new HarnessUnauthenticatedError(),
    tenantContextRequired: () => new HarnessTenantContextRequiredError(),
  }
}

// ---------------------------------------------------------------------------
// Gerçek bir fetch ponyfill'i (`as`/`any` yok) — `localFetch`
// ---------------------------------------------------------------------------

const HEADERS_RECORD_SCHEMA = z.record(z.string(), z.string())
const HEADERS_TUPLES_SCHEMA = z.array(z.tuple([z.string(), z.string()]))

/**
 * `init.headers`/`RequestInitEsque.headers` → global `Headers`. Üç olası
 * biçimi (bir `Headers` örneği, `[string,string][]`, `Record<string,string>`)
 * `instanceof` + Zod (`safeParse`) ile GÜVENLİ biçimde ayırt eder — ham bir
 * `Object.entries()` çağrısı burada KULLANILMAZ çünkü `object` tipinde dar
 * bir girdi üzerinde bu çağrı `any` değerli bir tuple dizisi üretir
 * (`@typescript-eslint/no-unsafe-assignment`); Zod'un `.safeParse()`'ı
 * `Record<string, unknown>` DEĞİL tam olarak `Record<string, string>`
 * döndürdüğü için bu sızıntı hiç oluşmaz.
 */
function toHeaders(raw: unknown): Headers {
  const headers = new Headers()

  if (raw instanceof Headers) {
    raw.forEach((value, key) => {
      headers.set(key, value)
    })
    return headers
  }

  const tuplesResult = HEADERS_TUPLES_SCHEMA.safeParse(raw)
  if (tuplesResult.success) {
    for (const [key, value] of tuplesResult.data) {
      headers.set(key, value)
    }
    return headers
  }

  const recordResult = HEADERS_RECORD_SCHEMA.safeParse(raw)
  if (recordResult.success) {
    for (const [key, value] of Object.entries(recordResult.data)) {
      headers.set(key, value)
    }
  }

  return headers
}

/** `value`'nun `key` adlı kendi özelliğini taşıyan bir nesne olup olmadığını daraltır — `any`/`as` kullanmadan güvenli okuma sağlar. */
function hasProperty<Key extends string>(value: unknown, key: Key): value is Record<Key, unknown> {
  return typeof value === 'object' && value !== null && key in value
}

/** `RequestInitEsque.body`/`RequestInit.body` için ortak, güvenli alt küme (`BodyInit` global DEĞİL — `lib: ["ES2023"]` DOM taşımaz; global `RequestInit`'in KENDİ `body` alanından indeksli erişimle türetilir). */
function resolveRequestBody(raw: unknown): NonNullable<RequestInit['body']> | undefined {
  if (typeof raw === 'string') {
    return raw
  }
  if (raw instanceof Uint8Array || raw instanceof Blob || raw instanceof FormData) {
    return raw
  }
  return undefined
}

/**
 * tRPC'nin `FetchEsque`'inin `init` parametresi (`RequestInit | RequestInitEsque
 * | undefined`, iki tipin birleşimi — `RequestInitEsque` `@trpc/client`'ın
 * PUBLIC barrel'ından import EDİLEMEZ) `unknown` olarak ele alınır; alanlar
 * `hasProperty` ile GÜVENLİ biçimde okunur. `exactOptionalPropertyTypes`
 * altında opsiyonel alanlara `undefined` AÇIKÇA atanmaz — alan yoksa hiç
 * YAZILMAZ (`create-trpc-client.ts`'teki `resolveHttpLinkOptions` deseninin
 * aynısı).
 */
function resolveRequestInit(raw: unknown): RequestInit {
  const resolved: RequestInit = {
    headers: toHeaders(hasProperty(raw, 'headers') ? raw.headers : undefined),
  }

  if (hasProperty(raw, 'method') && typeof raw.method === 'string') {
    resolved.method = raw.method
  }

  if (hasProperty(raw, 'signal') && raw.signal instanceof AbortSignal) {
    resolved.signal = raw.signal
  }

  const body = hasProperty(raw, 'body') ? resolveRequestBody(raw.body) : undefined
  if (body !== undefined) {
    resolved.body = body
  }

  return resolved
}

/** `FetchEsque`'in ilk parametresi (`RequestInfo | URL | string`) → global `Request`'in kabul ettiği `string | URL`. */
function resolveRequestUrl(raw: unknown): string | URL {
  if (typeof raw === 'string' || raw instanceof URL) {
    return raw
  }
  if (raw instanceof Request) {
    return raw.url
  }
  throw new Error('localFetch: desteklenmeyen istek girdisi (string/URL/Request değil)')
}

/**
 * Süreç-içi bir "ağ" olmadan, verilen `handler`'ı çağıran GERÇEK bir fetch
 * ponyfill'i üretir. `createTrpcClient({ fetch })`'e verilecek fonksiyonun
 * TAM tipiyle (`NonNullable<TrpcClientOptions['fetch']>`) uyumludur — `as`/
 * `any` KULLANILMADAN derlenir.
 */
function createLocalFetch(
  handler: TrpcRequestHandler,
  context: TrpcContext,
): NonNullable<TrpcClientOptions['fetch']> {
  return async (input, init) => {
    const request = new Request(resolveRequestUrl(input), resolveRequestInit(init))
    return handler({ req: request, context })
  }
}

// ---------------------------------------------------------------------------
// Harness factory
// ---------------------------------------------------------------------------

export interface CreateHarnessOptions {
  readonly requestId?: string
  readonly auth?: TrpcAuthState
  readonly tenant?: TrpcTenantState
  readonly tenantSummary?: TenantSummary
  readonly tenantRead?: TenantReadPort
  readonly storefrontTenantRead?: StorefrontTenantReadPort
  // ⚠ İŞ OKUMA PORTU İÇİN PORT-DÜZEYİ OVERRIDE BİLEREK YOK (ROADMAP v0.0.11,
  // T-013/S8): bugün hiçbir test onu geçirmiyor ve KULLANILMAYAN bir override
  // alanı tutmak, o alanın adının `TrpcPorts`'un ZORUNLU üyesinin adıyla
  // birebir çakışmasına yol açıyordu — "sözleşmede opsiyonel bir iş okuma
  // portu var mı" sorusunu grep ile denetleyen kapı (po R-P2) bu çakışma
  // yüzünden kalıcı yanlış pozitif veriyordu (AGENT_BASELINE.md §5). Testler
  // özet üzerinden (`jobSummary`) ayarlama yapar; gerçekten farklı bir port
  // davranışı gerekirse `createFakeJobReadPort` export edilmiş durumda ve
  // çağıran kendi `TrpcContext`'ini (procedures.test.ts'teki desen) kurar.
  readonly jobSummary?: JobSummary
  readonly errors?: TrpcErrorFactoryPort
  readonly logger?: RecordingLogger
}

export interface Harness {
  readonly context: TrpcContext
  readonly client: TrpcClient
  readonly logger: RecordingLogger
  /** Tipli istemcinin ULAŞAMADIĞI senaryolar (bilinmeyen prosedür yolu vb.) için ham istek gönderir. */
  readonly rawRequest: (path: string) => Promise<Response>
}

const DEFAULT_REQUEST_ID = 'req_harness_default'
const HARNESS_BASE_URL = 'http://trpc.test/trpc'

/**
 * Hermetik koşum hattını kurar — `createTrpcRequestHandler()` + sahte
 * portlar + elle kurulmuş `TrpcContext` → `localFetch` → `createTrpcClient()`.
 * Varsayılan context KİMLİKLİ ve TENANT'A ÇÖZÜLMÜŞTÜR (çoğu testin ihtiyacı
 * budur); AC3 gibi testler `options.auth`/`options.tenant` ile GEÇERSİZ
 * KILAR.
 */
export function createHarness(options: CreateHarnessOptions = {}): Harness {
  const logger = options.logger ?? createRecordingLogger()
  const tenantSummary = options.tenantSummary ?? HARNESS_TENANT_SUMMARY

  const context: TrpcContext = {
    requestId: options.requestId ?? DEFAULT_REQUEST_ID,
    logger,
    auth: options.auth ?? {
      kind: 'authenticated',
      userId: 'user_harness_01',
      sessionId: 'session_harness_01',
    },
    tenant: options.tenant ?? {
      kind: 'resolved',
      tenantId: tenantSummary.id,
      slug: tenantSummary.slug,
      status: tenantSummary.status,
    },
    ports: {
      tenantRead: options.tenantRead ?? createFakeTenantReadPort(tenantSummary),
      storefrontTenantRead:
        options.storefrontTenantRead ?? createFakeStorefrontTenantReadPort(tenantSummary),
      // ROADMAP v0.0.11, T-013/S8 — ZORUNLU üye (po R-P2).
      jobRead: createFakeJobReadPort(options.jobSummary ?? HARNESS_JOB_SUMMARY),
    },
    errors: options.errors ?? createFakeErrorFactoryPort(),
  }

  const handler = createTrpcRequestHandler()
  const client = createTrpcClient({
    url: HARNESS_BASE_URL,
    fetch: createLocalFetch(handler, context),
  })

  return {
    context,
    client,
    logger,
    rawRequest: (path: string) =>
      handler({ req: new Request(`${HARNESS_BASE_URL}/${path}`), context }),
  }
}

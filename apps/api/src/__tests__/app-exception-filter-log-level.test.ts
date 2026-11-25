// @arkesoft/api — `AppExceptionFilter` logLevel dağıtımı + Sentry capture
// sınırı (ROADMAP v0.0.17, T-028/S8, architect K-A28-5/K-A28-6)
//
// BİRİM SEVİYESİ — gerçek Postgres/HTTP sunucusu GEREKTİRMEZ: `AppExceptionFilter`
// doğrudan `new` ile kurulur (`rate-limit.test.ts`'in `ExecutionContext` sahteleme
// deseninin `ArgumentsHost`/`HttpAdapterHost` karşılığı), `ArgumentsHost`/
// `HttpAdapterHost` sahte (fake) nesnelerle sağlanır. `RequestContext` ALS'ye
// `requestContextStorage.run()` ile doğrudan yazılır (`rate-limit.test.ts`'in
// AYNI deseni) — middleware zincirine veya gerçek bir HTTP isteğine gerek YOK.
//
// Bu dosya DÖRT şeyi ölçer:
//   1. `mapped.logLevel`'a göre EXHAUSTIVE dağıtım — dört seviyenin HER biri
//      doğru `logger.<seviye>()` metodunu çağırıyor, DİĞER ÜÇÜNÜ ÇAĞIRMIYOR.
//   2. Sentry capture YALNIZCA `logLevel === 'error'` dalında tetikleniyor —
//      diğer üç seviyede SIFIR zarf (dört seviyenin HEPSİ test edilir, DoD şartı).
//   3. AC-54b — hata yanıtında `x-trace-id` başlığı YAZILIYOR ve değeri ALS'deki
//      `RequestContext.traceId` İLE BİREBİR AYNI (S4'ün bağlayıcı şartı:
//      `getCurrentTraceId()` burada YENİDEN ÇAĞRILMAZ, aksi hâlde Katman 2
//      kapalıyken başarı/hata yanıtları FARKLI `traceId` taşırdı — bu test o
//      sapmayı MUTASYONLA da göstermez, ama ALS değerinin OLDUĞU GİBİ aktığını
//      pinler; gerçek HTTP seviyesindeki "başarı/hata AYNI değer" kanıtı
//      `trpc-cross-tenant.isolation.test.ts`'in (S8) supertest ölçümüdür).
//   4. `logLevel` DAĞITIMININ exhaustive olduğu (yeni bir seviye eklenince
//      derleme hatası) BU dosyada test EDİLEMEZ (çalışma zamanı testi
//      derleme zamanı garantisini KANITLAYAMAZ) — bu, geliştirme sırasında
//      MUTASYONLA ayrıca gösterildi (bir dalı sil → `tsc` kırmızı → `Edit`
//      ile geri al); handoff raporunda kayıtlıdır.

import type { ArgumentsHost } from '@nestjs/common'
import type { HttpAdapterHost } from '@nestjs/core'
import { TenantStatus } from '@arkesoft/db'
import { AppError } from '@arkesoft/errors'
import type { AppErrorLogLevel } from '@arkesoft/errors'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { AppExceptionFilter } from '../errors/app-exception.filter.js'
import { shutdownSentry, startSentry } from '../observability/sentry.js'
import type { StartSentryOptions } from '../observability/sentry.js'
import { requestContextStorage } from '../request-context/request-context.storage.js'
import type { RequestContext } from '../request-context/request-context.types.js'

/**
 * Dört test-amaçlı `AppError` alt sınıfı — her biri TEK bir `logLevel`'ı
 * sabitler. Üretim kataloğunun (`errors/domain/*.error.ts`) parçası DEĞİLDİR,
 * bu dosyaya özgüdür (CLAUDE.md §4 "her domain hatası AppError'dan türer"
 * kuralı test-amaçlı sınıflar için de geçerli — çıplak `AppError` fırlatılamaz).
 */
class ProbeLogLevelErrorError extends AppError {
  constructor() {
    super({
      code: 'PROBE_LOG_LEVEL_ERROR',
      httpStatus: 503,
      userMessageKey: 'errors.test.probeLogLevel',
      logLevel: 'error',
    })
  }
}

/** `logLevel` AÇIKÇA verilmez — varsayılan `'warn'` yolunu da kapsar. */
class ProbeLogLevelWarnError extends AppError {
  constructor() {
    super({
      code: 'PROBE_LOG_LEVEL_WARN',
      httpStatus: 400,
      userMessageKey: 'errors.test.probeLogLevel',
    })
  }
}

class ProbeLogLevelInfoError extends AppError {
  constructor() {
    super({
      code: 'PROBE_LOG_LEVEL_INFO',
      httpStatus: 400,
      userMessageKey: 'errors.test.probeLogLevel',
      logLevel: 'info',
    })
  }
}

class ProbeLogLevelDebugError extends AppError {
  constructor() {
    super({
      code: 'PROBE_LOG_LEVEL_DEBUG',
      httpStatus: 400,
      userMessageKey: 'errors.test.probeLogLevel',
      logLevel: 'debug',
    })
  }
}

const EXPECTED_TRACE_ID = 'probe0123456789abcdef0123456789ab'

function buildRequestContext(logger: RequestContext['logger']): RequestContext {
  return {
    requestId: 'req_log_level_probe',
    receivedAt: Date.now(),
    logger,
    tenant: {
      kind: 'resolved',
      tenant: {
        id: 'tnt_log_level_probe',
        slug: 'log-level-probe',
        status: TenantStatus.active,
        source: 'subdomain',
      },
    },
    auth: { kind: 'pending' },
    client: { ip: null, userAgent: null },
    // ⭐ `AppExceptionFilter` bu alanı OLDUĞU GİBİ okur, `getCurrentTraceId()`'yi
    // YENİDEN ÇAĞIRMAZ (K-A28-1/S4 bağlayıcı şartı) — bu test TAM OLARAK bu
    // davranışı pinler (aşağıdaki "x-trace-id" assert'i).
    traceId: EXPECTED_TRACE_ID,
  }
}

type FakeHttpAdapter = {
  readonly setHeader: ReturnType<typeof vi.fn>
  readonly reply: ReturnType<typeof vi.fn>
}

function buildFakeAdapterHost(): {
  readonly host: HttpAdapterHost
  readonly adapter: FakeHttpAdapter
} {
  const adapter: FakeHttpAdapter = { setHeader: vi.fn(), reply: vi.fn() }
  return { host: { httpAdapter: adapter } as unknown as HttpAdapterHost, adapter }
}

function buildFakeArgumentsHost(): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => ({}) }),
  } as unknown as ArgumentsHost
}

// ⚠⚠ ÖLÇÜLMÜŞ (bu alt görevde): `transport.send()` ÇAĞRI SAYISI tek başına
// güvenilir değil — Sentry Node SDK varsayılan olarak zarfları `event`
// İTEMLERİNİN YANINDA periyodik `session`/`sessions` İTEMLERİYLE de
// gönderebilir (oturum izleme), bu da raw `send()` sayacını hatalı şişirip
// "diğer üç seviyede SIFIR" iddiasını YANLIŞ KIRMIZI'ya düşürür. Bu yüzden
// `sentry-invariants.test.ts`'in (S5) AYNI deseni izlenir: zarf AYRIŞTIRILIR,
// yalnızca `type: 'event'` İTEMLERİNİN `contexts.appError.code`'u OKUNUR —
// kod BU DOSYANIN dört probe sınıfına ÖZGÜ (`PROBE_LOG_LEVEL_*`), bu yüzden
// başka bir testin (ör. `it.each` süitinin KENDİ 'error' vakası) ürettiği
// zarfla KARIŞMAZ; her kod AYRI AYRI arandığı için flush SIRALAMASI/zamanlaması
// sonucu ETKİLEMEZ.
const eventItemHeaderSchema = z.object({ type: z.string() })
const appErrorContextSchema = z.object({ code: z.string() })
const eventPayloadSchema = z.object({
  contexts: z.object({ appError: appErrorContextSchema }).partial().optional(),
  // ⚠⚠⚠ DÜZELTME TURU 1/3 (solid BULGU 3) — `tags` AYRICA okunur: aşağıdaki
  // "Sentry capture YALNIZCA 'error' dalında" testi, `trace_id` tag'inin
  // ALS'deki `EXPECTED_TRACE_ID` İLE BİREBİR eşit olduğunu da pinler
  // (`sentry.ts`'in `getCurrentTraceId()`'yi YENİDEN ÇAĞIRMADIĞININ,
  // ÇAĞIRANDAN GELEN `traceId`'yi OLDUĞU GİBİ aktardığının kanıtı).
  tags: z.record(z.string(), z.unknown()).optional(),
})
const envelopeSchema = z.tuple([
  z.unknown(),
  z.array(z.tuple([eventItemHeaderSchema, z.unknown()])),
])

type CapturedAppErrorEvent = { readonly code: string; readonly traceIdTag: unknown }

/**
 * `sentry-invariants.test.ts`'in (S5) AYNI sahte taşıyıcı deseni — `@sentry/node`
 * BURADA DA import EDİLMEZ (yapısal sınırlama, K-A28-2); duck-typed bir
 * fabrika `StartSentryOptions['transport']`'a yapısal olarak uyar. Ham
 * zarflar BİRİKTİRİLİR, AC-62'nin testinin AKSİNE burada sayaç yerine
 * `contexts.appError.code` kümesi okunur (yukarıdaki gerekçe).
 */
function createFakeTransportFactory(): {
  readonly factory: NonNullable<StartSentryOptions['transport']>
  readonly getCapturedAppErrorCodes: () => readonly string[]
  readonly getCapturedAppErrorEvents: () => readonly CapturedAppErrorEvent[]
} {
  const capturedAppErrorCodes: string[] = []
  const capturedAppErrorEvents: CapturedAppErrorEvent[] = []

  const factory: NonNullable<StartSentryOptions['transport']> = () => ({
    send: (envelope: unknown) => {
      const parsedEnvelope = envelopeSchema.safeParse(envelope)
      if (parsedEnvelope.success) {
        for (const [header, payload] of parsedEnvelope.data[1]) {
          if (header.type !== 'event') {
            continue
          }
          const parsedPayload = eventPayloadSchema.safeParse(payload)
          const code = parsedPayload.success
            ? parsedPayload.data.contexts?.appError?.code
            : undefined
          if (code !== undefined) {
            capturedAppErrorCodes.push(code)
            capturedAppErrorEvents.push({
              code,
              traceIdTag: parsedPayload.success ? parsedPayload.data.tags?.['trace_id'] : undefined,
            })
          }
        }
      }
      return Promise.resolve({})
    },
    flush: () => Promise.resolve(true),
  })

  return {
    factory,
    getCapturedAppErrorCodes: () => capturedAppErrorCodes,
    getCapturedAppErrorEvents: () => capturedAppErrorEvents,
  }
}

const FAKE_DSN = 'https://fakepublickey@o0.ingest.sentry.invalid/0'

describe(
  'AppExceptionFilter — logLevel dağıtımı (exhaustive switch) + Sentry capture sınırı ' +
    '(ROADMAP v0.0.17, T-028/S8, K-A28-5/6)',
  () => {
    const fakeTransport = createFakeTransportFactory()

    beforeAll(() => {
      startSentry({ dsn: FAKE_DSN, transport: fakeTransport.factory })
    })

    afterAll(async () => {
      await shutdownSentry()
    })

    type LevelCase = {
      readonly level: AppErrorLogLevel
      readonly error: AppError
    }

    const cases: readonly LevelCase[] = [
      { level: 'error', error: new ProbeLogLevelErrorError() },
      { level: 'warn', error: new ProbeLogLevelWarnError() },
      { level: 'info', error: new ProbeLogLevelInfoError() },
      { level: 'debug', error: new ProbeLogLevelDebugError() },
    ]

    it.each(cases)(
      "logLevel '$level' → logger.$level TAM BİR KEZ çağrılır, diğer ÜÇ seviye SIFIR kez",
      ({ level, error }) => {
        const logger = pino({ level: 'silent' })
        const spies: Record<AppErrorLogLevel, ReturnType<typeof vi.spyOn>> = {
          error: vi.spyOn(logger, 'error'),
          warn: vi.spyOn(logger, 'warn'),
          info: vi.spyOn(logger, 'info'),
          debug: vi.spyOn(logger, 'debug'),
        }

        const { host, adapter } = buildFakeAdapterHost()
        const filter = new AppExceptionFilter(host, logger)

        requestContextStorage.run(buildRequestContext(logger), () => {
          filter.catch(error, buildFakeArgumentsHost())
        })

        for (const candidateLevel of ['error', 'warn', 'info', 'debug'] as const) {
          const expectedCalls = candidateLevel === level ? 1 : 0
          expect(spies[candidateLevel]).toHaveBeenCalledTimes(expectedCalls)
        }

        // AC-54b — hata yanıtında `x-trace-id`, ALS'deki değerle BİREBİR aynı.
        expect(adapter.setHeader).toHaveBeenCalledWith(
          expect.anything(),
          'x-trace-id',
          EXPECTED_TRACE_ID,
        )
        expect(adapter.setHeader).toHaveBeenCalledWith(
          expect.anything(),
          'x-request-id',
          'req_log_level_probe',
        )
        expect(adapter.reply).toHaveBeenCalledTimes(1)
      },
    )

    it(
      "Sentry capture YALNIZCA 'error' dalında tetiklenir — diğer üç seviyede SIFIR zarf " +
        '(dört seviyenin hepsi ölçülür, DoD şartı)',
      async () => {
        // ⭐ Dört vakanın HEPSİ TEK bir Sentry istemcisiyle (ÖNCEki `it.each`
        // süitinin açtığı/`beforeAll`'un kurduğu istemci) çalıştırılır — ara
        // `shutdownSentry()`/`startSentry()` döngüsü YOK. `captureAppError`'ın
        // zarf gönderimi ASENKRON kuyruklanabildiği için SAYIM yerine
        // `contexts.appError.code` KÜMESİ okunur (yukarıdaki `createFakeTransportFactory`
        // yorumu) — bu, flush ZAMANLAMASINA/SIRASINA bağımlı DEĞİLDİR: her
        // test-amaçlı hatanın kodu (`PROBE_LOG_LEVEL_*`) BAŞKA hiçbir testin
        // ürettiği zarfla ÇAKIŞMAZ.
        for (const { error } of cases) {
          const logger = pino({ level: 'silent' })
          const { host } = buildFakeAdapterHost()
          const filter = new AppExceptionFilter(host, logger)

          requestContextStorage.run(buildRequestContext(logger), () => {
            filter.catch(error, buildFakeArgumentsHost())
          })
        }

        // Dördünün de kuyruklamış olabileceği zarfı BOŞALT — bu, dosyadaki
        // SON Sentry etkileşimi (sonraki `afterAll`'un `shutdownSentry()`'si
        // zaten kapalı bir istemci üzerinde NO-OP çalışır, `captureAppError`'ın
        // KENDİ `isInitialized()` fail-closed guard'ı ile AYNI desen).
        await shutdownSentry()

        const capturedCodes = fakeTransport.getCapturedAppErrorCodes()

        expect(capturedCodes).toContain('PROBE_LOG_LEVEL_ERROR')
        expect(capturedCodes).not.toContain('PROBE_LOG_LEVEL_WARN')
        expect(capturedCodes).not.toContain('PROBE_LOG_LEVEL_INFO')
        expect(capturedCodes).not.toContain('PROBE_LOG_LEVEL_DEBUG')

        // ⚠⚠⚠ DÜZELTME TURU 1/3 (solid BULGU 3) — `sentry.ts` artık
        // `getCurrentTraceId()`'yi YENİDEN ÇAĞIRMIYOR, ÇAĞIRANDAN (bu dosyanın
        // `buildRequestContext`'inin sabitlediği `EXPECTED_TRACE_ID`) gelen
        // `traceId`'yi OLDUĞU GİBİ aktarıyor. Eski hâlde (yeniden çağrı) bu
        // assert KIRMIZIYA düşerdi — aktif span HİÇBİR ZAMAN olmadığı için
        // `getCurrentTraceId()` HER çağrıda YENİ bir rastgele 32-hex üretirdi,
        // bu da `EXPECTED_TRACE_ID` İLE ASLA eşleşmezdi.
        const errorEvent = fakeTransport
          .getCapturedAppErrorEvents()
          .find((event) => event.code === 'PROBE_LOG_LEVEL_ERROR')

        if (errorEvent === undefined) {
          throw new Error('PROBE_LOG_LEVEL_ERROR zarfı bulunamadı')
        }

        expect(errorEvent.traceIdTag).toBe(EXPECTED_TRACE_ID)
      },
    )
  },
)

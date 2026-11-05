// @arkesoft/trpc — `appErrorBoundary`'nin YAPILANDIRILMIŞ TEK KAYDI
// (ROADMAP v0.0.14, T-014 düzeltme turu 1 — `solid` M-1 + `security`
// medium #1; iki gate BAĞIMSIZ olarak aynı kusuru buldu)
//
// ⚠⚠ KAPATILAN KUSUR: hata sınırı tanıdığı `AppError`'ı `TRPCError`'a
// çeviriyor ama HİÇBİR LOG YAZMIYORDU. `PERMISSION_DENIED`'ın tel gövdesine
// izin adını/rolü koymama kararının YAZILI TEK gerekçesi "bu iki alan
// yalnızca `AppError.context`'e girer ve hata SINIRI onu LOGLAR"dı — ölçüldü,
// hiçbir halka loglamıyordu. Bu dosya kaydın VARLIĞINI, SEVİYE EŞLEMESİNİ ve
// TEKLİĞİNİ pinler; HTTP yolundaki karşılığı `apps/api`'nin
// `trpc-error-boundary-logging.test.ts`'idir.
//
// ⚠ `trpc.ts`'in TEL ÇIKTISI bu düzeltmeyle DEĞİŞMEDİ ve bu dosya onu da
// ölçer: `details` şekli ve `data` anahtar kümesi assert'lenir — log yolu ile
// tel yolu BAĞIMSIZDIR.

import { AppError, appErrorBodySchema } from '@arkesoft/errors'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createHarness, HarnessTenantNotFoundError, HARNESS_TENANT_SUMMARY } from './harness.js'
import type { RecordedLog } from './harness.js'

/** Hata sınırının yazdığı TEK kaydın olay adı — üretim sabitinden KOPYA (bkz. `trpc.ts`'teki gerekçe). */
const BOUNDARY_LOG_EVENT = 'trpc.error-boundary.app-error'

/** `onError`'ın SINIFLANDIRILAMAYAN hata dalının olay adı — "çifte kayıt yok" iddiasının karşıt tanığı. */
const UNCLASSIFIED_LOG_EVENT = 'trpc.request-handler.unclassified-error'

const ERROR_ENVELOPE_SCHEMA = z.object({
  error: z.object({ code: z.number(), message: z.string(), data: z.unknown() }),
})
const DATA_RECORD_SCHEMA = z.record(z.string(), z.unknown())

/** Kaydın iş alanlarının ÖLÇÜLEN şekli — dört alan, fazlası/eksiği yok. */
const BOUNDARY_PAYLOAD_SCHEMA = z.object({
  code: z.string(),
  httpStatus: z.number(),
  isRetryable: z.boolean(),
  context: z.record(z.string(), z.unknown()),
})

/**
 * 5xx bir `AppError`'ın test-yerel taklidi (503).
 *
 * ⚠ `publicDetails` BİLEREK OVERRIDE EDİLİYOR: böylece aynı test hem "log
 * `error` seviyesine düştü" hem de "TELE YAZILAN `details` log eklemesinden
 * ETKİLENMEDİ" iddialarını BİRLİKTE ölçebiliyor. `packages/trpc` hiçbir hata
 * sınıfı TANIMLAMAZ; bu sınıf yalnızca bu dosyada yaşar (harness'in aynı
 * deseni).
 */
class HarnessDependencyUnavailableError extends AppError {
  constructor() {
    super({
      code: 'DEPENDENCY_UNAVAILABLE',
      httpStatus: 503,
      userMessageKey: 'errors.dependency.unavailable',
      context: { checks: { database: 'down' } },
      isRetryable: true,
    })
  }

  override get publicDetails(): Readonly<Record<string, unknown>> {
    return { checks: { database: 'down' } }
  }
}

/** Sınıflandırılamayan dalın ÖLÇÜLDÜĞÜ sentinel — gövdeye sızmadığı da assert'lenir. */
const NON_APP_ERROR_SENTINEL = 'boundary-logging-non-app-error-sentinel'

/** Verilen olay adına sahip kayıtları süzer. */
function entriesFor(entries: readonly RecordedLog[], message: string): RecordedLog[] {
  return entries.filter((entry) => entry.message === message)
}

describe('appErrorBoundary — tanıdığı her AppError için SINIRDA TEK yapılandırılmış kayıt', () => {
  it('4xx (404) → TEK `warn` kaydı; `AppError.context` `context` altında; TEL GÖVDESİ değişmedi', async () => {
    const harness = createHarness({
      tenantRead: {
        findSummary: (tenantId) => Promise.reject(new HarnessTenantNotFoundError(tenantId)),
      },
    })

    const response = await harness.rawRequest('tenant.current')
    const rawText = await response.text()

    // --- TEL YARISI: gövde şekli BİREBİR korundu -------------------------
    const envelope = ERROR_ENVELOPE_SCHEMA.parse(JSON.parse(rawText))
    const data = DATA_RECORD_SCHEMA.parse(envelope.error.data)
    expect(Object.keys(data).sort()).toEqual(['appError', 'code', 'httpStatus'])
    const appError = appErrorBodySchema.parse(data['appError'])
    expect(appError.code).toBe('TENANT_NOT_FOUND')
    expect(appError.details).toEqual({})
    // `context` TELE SIZMADI — kiracı kimliği gövdenin hiçbir yerinde yok.
    expect(rawText).not.toContain(HARNESS_TENANT_SUMMARY.id)

    // --- LOG YARISI: M-1'in kapanışı -------------------------------------
    const boundaryEntries = entriesFor(harness.logger.entries, BOUNDARY_LOG_EVENT)
    expect(boundaryEntries).toHaveLength(1)
    const [entry] = boundaryEntries
    if (entry === undefined) {
      throw new Error('hata sınırı kaydı bulunamadı')
    }

    expect(entry.level).toBe('warn')
    // ⚠ ANAHTAR KÜMESİ HAM NESNE ÜZERİNDE sayılır: `z.object` bilinmeyen
    // anahtarları DÜŞÜRDÜĞÜ için ayrıştırılmış nesne üzerinde aynı assert
    // VACUOUS olurdu (fazladan bir alanı ASLA göremezdi).
    expect(Object.keys(entry.context ?? {}).sort()).toEqual([
      'code',
      'context',
      'httpStatus',
      'isRetryable',
    ])
    const payload = BOUNDARY_PAYLOAD_SCHEMA.parse(entry.context)
    expect(payload.code).toBe('TENANT_NOT_FOUND')
    expect(payload.httpStatus).toBe(404)
    expect(payload.isRetryable).toBe(false)
    // ⚠ `AppError.context` TEK ANAHTAR ALTINA NESTELENDİ, ÜST SEVİYEYE SPREAD
    // EDİLMEDİ: aşağıdaki iki assert birlikte bunu ölçüyor — değer `context`
    // anahtarının altında, `tenantId` ise kaydın üst seviyesinde YOK. Spread
    // edilse bir hata sınıfının bağlam anahtarı logger'ın bağladığı üst
    // seviye alanı GÖLGELEYEBİLİRDİ.
    expect(payload.context).toEqual({ tenantId: HARNESS_TENANT_SUMMARY.id })
    expect(Object.hasOwn(payload, 'tenantId')).toBe(false)

    // ⚠ ÇİFTE KAYIT YOK: `onError` parse edilebilir `cause`'da erken dönüyor.
    expect(entriesFor(harness.logger.entries, UNCLASSIFIED_LOG_EVENT)).toHaveLength(0)
  })

  it('5xx (503) → kayıt `error` seviyesinde; `isRetryable` taşınıyor; `publicDetails` TELE yazılmaya DEVAM ediyor', async () => {
    const harness = createHarness({
      tenantRead: {
        findSummary: () => Promise.reject(new HarnessDependencyUnavailableError()),
      },
    })

    const response = await harness.rawRequest('tenant.current')
    const rawText = await response.text()

    const envelope = ERROR_ENVELOPE_SCHEMA.parse(JSON.parse(rawText))
    const data = DATA_RECORD_SCHEMA.parse(envelope.error.data)
    const appError = appErrorBodySchema.parse(data['appError'])
    expect(appError.code).toBe('DEPENDENCY_UNAVAILABLE')
    // ⚠ TEL `publicDetails`'ten gelmeye DEVAM EDİYOR — log eklemesi tel
    // yolunu HİÇ etkilemedi (`details` boş DEĞİL, bu assert vacuous değil).
    expect(appError.details).toEqual({ checks: { database: 'down' } })

    const boundaryEntries = entriesFor(harness.logger.entries, BOUNDARY_LOG_EVENT)
    expect(boundaryEntries).toHaveLength(1)
    const [entry] = boundaryEntries
    if (entry === undefined) {
      throw new Error('hata sınırı kaydı bulunamadı')
    }

    // ⚠ AYRIMI VEREN ASSERT: 4xx testi 'warn' ölçtü, bu 'error' ölçüyor →
    // seviye eşlemesi SABİT DEĞİL, `httpStatus`'a GÖRE dallanıyor.
    expect(entry.level).toBe('error')
    const payload = BOUNDARY_PAYLOAD_SCHEMA.parse(entry.context)
    expect(payload.httpStatus).toBe(503)
    expect(payload.isRetryable).toBe(true)
    expect(payload.context).toEqual({ checks: { database: 'down' } })
    // Ham mesaj/yığın izi BU kayda GİRMEZ.
    expect(Object.hasOwn(payload, 'stack')).toBe(false)
  })

  it('AppError OLMAYAN hata → hata sınırı kaydı YOK; sınıflandırılamayan dal TEK başına loglar', async () => {
    const harness = createHarness({
      tenantRead: {
        findSummary: () => Promise.reject(new Error(NON_APP_ERROR_SENTINEL)),
      },
    })

    const response = await harness.rawRequest('tenant.current')
    const rawText = await response.text()
    expect(rawText).not.toContain(NON_APP_ERROR_SENTINEL)

    // ⚠ FİLTRE "HER ŞEYİ" YAKALAMIYOR: `logAppError` yalnızca tanıdığı
    // hatalar için koşuyor.
    expect(entriesFor(harness.logger.entries, BOUNDARY_LOG_EVENT)).toHaveLength(0)
    // Ve bu dal ESKİDEN BERİ loglanıyor — iki yol birbirinin yerini ALMIYOR.
    expect(entriesFor(harness.logger.entries, UNCLASSIFIED_LOG_EVENT)).toHaveLength(1)
  })

  it('vacuous DEĞİL — BAŞARILI bir istek hiç kayıt ÜRETMEZ', async () => {
    const harness = createHarness()

    await expect(harness.client.tenant.current.query()).resolves.toEqual(HARNESS_TENANT_SUMMARY)

    expect(entriesFor(harness.logger.entries, BOUNDARY_LOG_EVENT)).toHaveLength(0)
    expect(entriesFor(harness.logger.entries, UNCLASSIFIED_LOG_EVENT)).toHaveLength(0)
    expect(harness.logger.entries).toHaveLength(0)
  })
})

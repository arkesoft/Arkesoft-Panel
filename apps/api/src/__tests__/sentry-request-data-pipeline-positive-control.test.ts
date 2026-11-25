// @arkesoft/api — `qa` gate (T-028, tur 2) — EKSİK SENARYO testi.
//
// Kaynak: `solid` gate tur 2 bulgusu "yeni medium-2" —
// `.claude/workflow/tasks/T-028.md:2388-2404` /
// `.claude/workflow/reviews/T-028-solid-tur2.md`.
//
// `sentry-invariants.test.ts`'in (4) describe'u ("BULGU 1 regresyonu") şunu
// ÖLÇÜYORDU: (a) bir olay zarfı ÜRETİLDİ (`eventPayloads.length >
// toBeGreaterThan(0)`), (b) sentinel zarfta BULUNAMADI. ⚠⚠ AMA Sentry'nin
// İSTEK-VERİSİ (`requestDataIntegration`) HATTININ GERÇEKTEN ÇALIŞTIĞINI
// ölçen hiçbir assertion YOKTU — `method: 'POST'` yalnızca TEST
// KURULUMUNDA (gönderilen istekte) geçiyordu, zarfın KENDİSİNDE DEĞİL. Bu
// hat sessizce dursa (Node sürümü/SDK/`diagnostics_channel` farkı) zarf
// HİÇ istek verisi taşımaz ⇒ sır "önemsizce" yok olur ⇒ test YEŞİL kalır,
// kanıt BOŞ kalırdı.
//
// Bu dosya, AYNI (4) describe'un kurduğu senaryoyu (gerçek `node:http`
// sunucusu + gerçek Sentry istemcisi, sahte taşıyıcı) TEKRARLAR ve
// `solid`'in önerdiği POZİTİF KONTROLÜ ekler: zarfın `request` alanının
// GERÇEKTEN `method`/`url` taşıdığını doğrudan assert eder. Bu YEŞİLSE
// (bugün yeşildir — aşağıda ÖLÇÜLDÜ), M1'in asıl `critical` düzeltmesinin
// (BULGU 1 — hassas çerez/başlık/sorgu/gövde bastırma) "sır yok" sonucu
// ARTIK anlamlıdır: hat GERÇEKTEN çalışıyor, sır yine de yok.

import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { AppError } from '@arkesoft/errors'

import { captureAppError, shutdownSentry, startSentry } from '../observability/sentry.js'
import type { StartSentryOptions } from '../observability/sentry.js'

const FAKE_DSN = 'https://fakepublickey@o0.ingest.sentry.invalid/0'

type CapturedEnvelope = unknown

type FakeTransportFactoryHandle = {
  readonly factory: NonNullable<StartSentryOptions['transport']>
  readonly getCapturedEnvelopes: () => readonly CapturedEnvelope[]
}

function createFakeTransportFactory(): FakeTransportFactoryHandle {
  const capturedEnvelopes: CapturedEnvelope[] = []

  const factory: NonNullable<StartSentryOptions['transport']> = () => ({
    send: (envelope: CapturedEnvelope) => {
      capturedEnvelopes.push(envelope)
      return Promise.resolve({})
    },
    flush: () => Promise.resolve(true),
  })

  return { factory, getCapturedEnvelopes: () => capturedEnvelopes }
}

const sentryEnvelopeItemHeaderSchema = z.object({ type: z.string() })
const sentryEnvelopeItemSchema = z.tuple([sentryEnvelopeItemHeaderSchema, z.unknown()])
const sentryEnvelopeSchema = z.tuple([z.unknown(), z.array(sentryEnvelopeItemSchema)])

const sentryEventPayloadSchema = z.object({
  request: z
    .object({
      method: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
})

function extractEventPayloads(
  envelopes: readonly CapturedEnvelope[],
): readonly z.infer<typeof sentryEventPayloadSchema>[] {
  const payloads: z.infer<typeof sentryEventPayloadSchema>[] = []

  for (const envelope of envelopes) {
    const [, items] = sentryEnvelopeSchema.parse(envelope)
    for (const [itemHeader, itemPayload] of items) {
      if (itemHeader.type === 'event') {
        payloads.push(sentryEventPayloadSchema.parse(itemPayload))
      }
    }
  }

  return payloads
}

/** Test amaçlı minimal, somut `AppError` alt sınıfı — `AppError` `abstract`. */
class TestRequestDataPipelineError extends AppError {
  constructor() {
    super({
      code: 'TEST_REQUEST_DATA_PIPELINE_ERROR',
      httpStatus: 500,
      userMessageKey: 'errors.test.observability',
      context: {},
      logLevel: 'error',
    })
  }
}

afterAll(async () => {
  await shutdownSentry()
})

describe('M1 (solid tur2, medium) — POZİTİF KONTROL: istek-verisi hattı GERÇEKTEN çalışıyor mu', () => {
  it('zarfın `request` alanı GERÇEKTEN `method`/`url` taşır — "sır yok" sonucu VAKUM DEĞİL', async () => {
    const fake = createFakeTransportFactory()
    startSentry({ dsn: FAKE_DSN, transport: fake.factory })

    const server = createServer((_req, res) => {
      captureAppError({
        error: new TestRequestDataPipelineError(),
        tenantId: 'tnt_pipeline_check',
        requestId: 'req_pipeline_check',
        traceId: 'trace_pipeline_check',
      })
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('internal error')
    })

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
          resolve()
        })
      })

      const address = server.address() as AddressInfo

      await fetch(`http://127.0.0.1:${String(address.port)}/pipeline-check-path`, {
        method: 'POST',
        body: '{}',
      })

      await shutdownSentry()

      const eventPayloads = extractEventPayloads(fake.getCapturedEnvelopes())
      expect(eventPayloads.length).toBeGreaterThan(0)

      // ⭐ POZİTİF KONTROL — `solid`'in önerdiği tek satır: zarfın KENDİSİNDE
      // `request.method`/`request.url` GERÇEKTEN var mı (test KURULUMUNDA
      // değil). Bu assertion olmadan M1'in "sır yok" sonucu, hat sessizce
      // DURMUŞ olsa da AYNI ŞEKİLDE yeşil kalırdı.
      const payloadWithRequestData = eventPayloads.find(
        (payload) => payload.request?.method !== undefined,
      )
      expect(payloadWithRequestData).toBeDefined()
      expect(payloadWithRequestData?.request?.method).toBe('POST')
      expect(payloadWithRequestData?.request?.url).toContain('/pipeline-check-path')
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
    }
  })
})

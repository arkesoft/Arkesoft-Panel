// @arkesoft/trpc — taşıma katmanı negatif senaryoları (ROADMAP v0.0.6, T-007,
// qa tur 1 — EKSİK TEST BULGUSU)
//
// GEREKÇE: `createTrpcRequestHandler()`'ın `allowBatching: false` seçeneği
// ADR-0009 madde 8 tarafından "BAĞLAYICI DEĞİŞMEZLİK" olarak işaretlendi —
// v0.1.0'ın yol-bazlı `publicProcedure` muafiyet mekanizmasının GÜVENLİĞİ
// doğrudan bu seçeneğin GERÇEKTEN bir toplu isteği reddettiğine dayanıyor
// (architect riski 5: "Batching'i açmak bu mekanizmayı SESSİZCE geçersiz
// kılar"). Bu DEĞİŞMEZLİĞİ gerçekten tetikleyen hiçbir test yoktu — S1'in
// spike'ı seçeneğin VARLIĞINI doğruladı, S3 production kodda kullandı, ama
// hiçbir test GERÇEK bir toplu istek göndererek reddedildiğini GÖZLEMLEMEDİ.
// Bu dosya o boşluğu kapatır; `trpc.ts`/`create-trpc-request-handler.ts`'e
// (başka ajanların dosyaları) DOKUNULMADI — yalnızca GERÇEK üretim kodu
// GERÇEK bir istekle çağrılıyor.
//
// İkinci senaryo: `query` prosedürüne `POST` ile erişim — tRPC'nin KENDİ
// `TYPE_ACCEPTED_METHOD_MAP`'i (`query: ['GET']`, `allowMethodOverride`
// KULLANILMIYOR) bunu reddetmek ZORUNDA; bu da hiçbir testte GÖZLENMEMİŞTİ.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { appErrorBodySchema } from '@arkesoft/errors'

import { createTrpcRequestHandler } from '../handler/create-trpc-request-handler.js'
import { createHarness } from './harness.js'

const ERROR_ENVELOPE_SCHEMA = z.object({
  error: z.object({ code: z.number(), message: z.string(), data: z.unknown() }),
})
const DATA_RECORD_SCHEMA = z.record(z.string(), z.unknown())

describe('createTrpcRequestHandler() — allowBatching:false GERÇEKTEN reddediyor (ADR-0009 madde 8)', () => {
  it('?batch=1 ile gönderilen istek BAD_REQUEST/400 ile reddedilir, sızdırmaz', async () => {
    const harness = createHarness()
    const handler = createTrpcRequestHandler()

    const response = await handler({
      req: new Request(
        `http://trpc.test/trpc/session.me?batch=1&input=${encodeURIComponent('{"0":{}}')}`,
      ),
      context: harness.context,
    })

    expect(response.status).toBe(400)

    const rawText = await response.text()
    const envelope = ERROR_ENVELOPE_SCHEMA.parse(JSON.parse(rawText))
    const data = DATA_RECORD_SCHEMA.parse(envelope.error.data)

    // Sızdırmazlık (ADR-0010 §3.1/3.2) — bu yol `appErrorBoundary`'den HİÇ
    // geçmez (tRPC'nin KENDİ `BAD_REQUEST`'i, "Batching is not enabled..."
    // mesajı `shape.message` okunmadığı için tele YAZILMAMALI).
    expect(Object.keys(data).sort()).toEqual(['appError', 'code', 'httpStatus'])
    expect(rawText).not.toContain('Batching is not enabled')
    const appError = appErrorBodySchema.parse(data['appError'])
    expect(appError.code).toBe('HTTP_EXCEPTION')
  })

  it('tek prosedürlü (batch olmayan) GERÇEK bir çağrı YİNE başarıyla çalışır (negatif testin YANLIŞ POZİTİF üretmediğinin kanıtı)', async () => {
    const harness = createHarness()
    const result = await harness.client.session.me.query()
    expect(typeof result.userId).toBe('string')
  })
})

describe('createTrpcRequestHandler() — query prosedürüne POST erişimi reddedilir (tRPC TYPE_ACCEPTED_METHOD_MAP)', () => {
  it('POST /trpc/session.me → 2xx DEĞİL (allowMethodOverride kullanılmıyor, query SADECE GET kabul eder)', async () => {
    const harness = createHarness()
    const handler = createTrpcRequestHandler()

    const response = await handler({
      req: new Request('http://trpc.test/trpc/session.me', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      context: harness.context,
    })

    const isSuccessStatus = response.status >= 200 && response.status < 300
    expect(isSuccessStatus).toBe(false)

    const rawText = await response.text()
    expect(rawText.toLowerCase()).not.toContain('stack')
  })
})

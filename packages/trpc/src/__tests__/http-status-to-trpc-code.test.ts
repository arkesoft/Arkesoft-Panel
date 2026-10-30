// @arkesoft/trpc — `httpStatusToTrpcCode` birim testleri (ROADMAP v0.0.6,
// T-007/ST-3 (S4), architect "Hata eşlemesi" bölümü madde 5, ADR-0010 §3.5)
//
// S1'in ölçtüğü DÖRT BİLGİ'nin ikincisi: `TRPC_ERROR_CODE_KEY` 21 anahtar
// taşıyor ve `JSONRPC2_TO_HTTP_CODE`/`HTTP_CODE_TO_JSONRPC2` tam gidiş-dönüş
// yapıyor (`@trpc/server`'ın kendi iç tablosu — ADR-0010 idiomu: gidiş-dönüşü
// OLMAYAN bir durum bulunursa burada AÇIKÇA listelenir, uydurulmaz). Bu test
// her girdi için `httpStatus → kod → httpStatus` gidiş-dönüşünü `@trpc/server`'ın
// KENDİ `getHTTPStatusCodeFromError`'ı (`@trpc/server/http`, PUBLIC export —
// `unstable-core-do-not-import` DEĞİL) ile DOĞRULAR; `httpStatusToTrpcCode`'un
// kendi tablosunu kopyalayıp kendisiyle karşılaştırmak TOTOLOJİ olurdu.

import { describe, expect, it } from 'vitest'
import { TRPCError } from '@trpc/server'
import { getHTTPStatusCodeFromError } from '@trpc/server/http'
import type { TRPC_ERROR_CODE_KEY } from '@trpc/server'

import { createRecordingLogger } from './harness.js'
import { httpStatusToTrpcCode } from '../error-mapping/http-status-to-trpc-code.js'

/** `getHTTPStatusCodeFromError` gerçek bir `TRPCError` ister (`{code}` düz nesnesi değil) — ters çevirme için tek-amaçlı kurucu. */
function toHttpStatus(code: TRPC_ERROR_CODE_KEY): number {
  return getHTTPStatusCodeFromError(new TRPCError({ code }))
}

// `http-status-to-trpc-code.ts`'in dosya başı yorumunun belgelediği AÇIK TABLO
// — LİTERAL olarak buraya kopyalanır (üretim modülünden TÜRETİLMEZ, totoloji
// karşıtı: tablo üretimde değişirse bu liste ile SAPMA oluşur ve test KIRMIZIYA
// döner, bu BİLİNÇLİ — "AÇIK TABLO değişti, bu testin de güncellenmesi
// gerekiyor" sinyali).
const KNOWN_HTTP_STATUSES = [
  400, 401, 402, 403, 404, 405, 408, 409, 412, 413, 415, 422, 428, 429, 499, 500, 501, 502, 503,
  504,
] as const

describe('httpStatusToTrpcCode', () => {
  it('bilinen her HTTP durumu için bir tRPC kodu üretir ve warn LOGLAMAZ', () => {
    for (const httpStatus of KNOWN_HTTP_STATUSES) {
      const logger = createRecordingLogger()
      const code = httpStatusToTrpcCode(httpStatus, logger)

      expect(typeof code).toBe('string')
      expect(logger.entries).toEqual([])
    }
  })

  it("bilinen durum↔kod eşlemesi @trpc/server'ın KENDİ ters çevirmesiyle (getHTTPStatusCodeFromError) TAM GİDİŞ-DÖNÜŞ yapar", () => {
    const logger = createRecordingLogger()
    const nonRoundTrippingStatuses: { httpStatus: number; code: string; roundTripped: number }[] =
      []

    for (const httpStatus of KNOWN_HTTP_STATUSES) {
      const code = httpStatusToTrpcCode(httpStatus, logger)
      const roundTripped = toHttpStatus(code)

      if (roundTripped !== httpStatus) {
        nonRoundTrippingStatuses.push({ httpStatus, code, roundTripped })
      }
    }

    // ADR-0008 idiomu: gidiş-dönüşü OLMAYAN bir durum varsa burada AÇIKÇA
    // listelenir — boş dizi, S1'in "bu kod için liste BOŞ kalabilir" ölçümünü
    // (503 dahil tam gidiş-dönüş) bu paketin KENDİ koşumunda DOĞRULAR.
    expect(nonRoundTrippingStatuses).toEqual([])
  })

  it("503 özel olarak SERVICE_UNAVAILABLE'a gider ve geri 503'e döner (S1'in A-T3 ölçümü)", () => {
    const logger = createRecordingLogger()
    const code = httpStatusToTrpcCode(503, logger)

    expect(code).toBe('SERVICE_UNAVAILABLE')
    expect(toHttpStatus(code)).toBe(503)
  })

  it("401 → UNAUTHORIZED (AC3'ün dayandığı eşleme)", () => {
    const logger = createRecordingLogger()
    expect(httpStatusToTrpcCode(401, logger)).toBe('UNAUTHORIZED')
  })

  it("bilinmeyen bir HTTP durumu fail-closed olarak INTERNAL_SERVER_ERROR'a düşer VE warn loglar", () => {
    const logger = createRecordingLogger()
    const code = httpStatusToTrpcCode(599, logger)

    expect(code).toBe('INTERNAL_SERVER_ERROR')
    expect(logger.entries).toHaveLength(1)
    expect(logger.entries[0]).toMatchObject({
      level: 'warn',
      message: 'trpc.error-mapping.unmapped-http-status',
      context: { httpStatus: 599 },
    })
  })
})

// @arkesoft/trpc — `appErrorBoundary`'nin "bizim DEĞİL" dalı (ROADMAP v0.0.6,
// T-007, qa tur 1 — EKSİK TEST BULGUSU)
//
// GEREKÇE: S4'ün KRİTİK bulgusunun düzeltmesi (`trpc.ts`'teki `appErrorBoundary`,
// handoff raporu "S3'ün düzeltmesi") şu dalı İÇERİR:
//
//   if (isAppError(result.error.cause)) { throw toTrpcError(...) }
//   throw result.error   // <-- BU SATIR, bizim AppError'IMIZ OLMAYAN bir
//                         //     hatanın ÇİFTE SARILMADAN, OLDUĞU GİBİ
//                         //     yeniden fırlatıldığını garanti eder.
//
// S3 bu dalı bir PROB testiyle ÖLÇTÜ (handoff raporu: "iki şüpheli dalı
// ölçerek doğruladı... prob dosyası SİLİNDİ"). Silinen bir test KALICI bir
// regresyon koruması DEĞİLDİR — bu dosya o boşluğu KAPATIR: bir port'un
// (sözleşmesi TOTAL olsa da, test-yerel bir SAHTE port aracılığıyla) düz
// bir `Error` (AppError OLMAYAN) fırlatmasını simüle eder ve iki şeyi
// kalıcı olarak pinler: (1) ÇİFTE SARMALAMA yok — tek JSON-RPC zarfı,
// `data` anahtar kümesi `errorFormatter`'ın cause-parse-fail dalıyla AYNI
// üç anahtar; (2) ham hata mesajı ("boom-boom-sentinel") gövdenin HİÇBİR
// yerinde YOK.
//
// `trpc.ts`/diğer ÜRETİM dosyalarına DOKUNULMADI — yalnızca `packages/trpc`'nin
// KENDİ export yüzeyi (`createHarness`, S4'ün dosyası, OKUNUR) kullanıldı.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { appErrorBodySchema } from '@arkesoft/errors'

import { createHarness } from './harness.js'

const ERROR_ENVELOPE_SCHEMA = z.object({
  error: z.object({ code: z.number(), message: z.string(), data: z.unknown() }),
})
const DATA_RECORD_SCHEMA = z.record(z.string(), z.unknown())

const NON_APP_ERROR_SENTINEL = 'boom-boom-sentinel-non-app-error'

describe(
  "appErrorBoundary — 'cause' bizim AppError'ımız DEĞİLSE OLDUĞU GİBİ yeniden " +
    'fırlatılır (çifte sarmalama/yanlış sınıflandırma yok)',
  () => {
    it('port düz bir Error fırlatınca: TEK zarf, {code,httpStatus,appError} anahtar kümesi, ham mesaj SIZMAZ', async () => {
      const harness = createHarness({
        tenantRead: {
          findSummary: () => Promise.reject(new Error(NON_APP_ERROR_SENTINEL)),
        },
      })

      const response = await harness.rawRequest('tenant.current')
      const rawText = await response.text()

      // Çifte sarmalama YOK — tek, geçerli bir JSON-RPC2 hata zarfı (ikinci
      // bir iç içe `error.error` veya dizi-içinde-dizi YOK).
      const envelope = ERROR_ENVELOPE_SCHEMA.parse(JSON.parse(rawText))
      const data = DATA_RECORD_SCHEMA.parse(envelope.error.data)
      expect(Object.keys(data).sort()).toEqual(['appError', 'code', 'httpStatus'])

      // Yanlış sınıflandırma YOK — ayırt edilebilir fallback gövdesi
      // (appErrorBoundary'den GEÇTİ ama AppError DEĞİLDİ → errorFormatter'ın
      // cause-parse-fail dalına düştü, AYNI `genericTransportErrorBody`).
      const appError = appErrorBodySchema.parse(data['appError'])
      expect(appError.code).toBe('HTTP_EXCEPTION')

      // Ham mesaj gövdenin HİÇBİR yerinde YOK (sızdırmazlık, ADR-0010 §3.2).
      expect(rawText).not.toContain(NON_APP_ERROR_SENTINEL)
      expect(rawText.toLowerCase()).not.toContain('stack')
    })
  },
)

// @arkesoft/superadmin — normalizePanelError testleri (ROADMAP v0.0.20, T-021/S8)
// Saf fonksiyon testleri — AĞ ÇAĞRISI YOK, `instanceof` kullanılmıyor.
import type { AppErrorBody } from '@arkesoft/errors'
import { describe, expect, it } from 'vitest'

import { normalizePanelError } from '../errors/normalize-panel-error.js'

/** Örnek bir domain hatasının tel gövdesi (zarf a'nın ÇEKİRDEK şekli). */
const sampleAppErrorBody: AppErrorBody = {
  code: 'PLATFORM_ADMIN_REQUIRED',
  message: 'errors.platform.adminRequired',
  details: {},
  requestId: 'req_01J000000000000000000001',
}

describe('normalizePanelError — probe 1 (zarf a, body sarmalayıcı)', () => {
  it("transport-aware-fetch'in fırlattığı Error'ı ({body}) tanır", () => {
    const transportRejection = Object.assign(new Error('transport_rejection'), {
      body: sampleAppErrorBody,
    })

    expect(normalizePanelError(transportRejection)).toEqual({
      kind: 'known',
      code: 'PLATFORM_ADMIN_REQUIRED',
      requestId: 'req_01J000000000000000000001',
    })
  })

  it('input.cause altındaki {body} sarmalayıcısını AZAMİ 2 derinlikte tanır', () => {
    const wrapped = { cause: { body: sampleAppErrorBody } }

    expect(normalizePanelError(wrapped)).toEqual({
      kind: 'known',
      code: 'PLATFORM_ADMIN_REQUIRED',
      requestId: 'req_01J000000000000000000001',
    })
  })

  it('input.cause.cause (3. derinlik) ARTIK tanınmaz — azami 2 derinlik sınırı', () => {
    const tooDeep = { cause: { cause: { body: sampleAppErrorBody } } }

    expect(normalizePanelError(tooDeep)).toEqual({ kind: 'unknown', requestId: null })
  })
})

describe('normalizePanelError — zarf (a) ve (b) aynı PanelError üretir', () => {
  it('zarf (a) [HTTP taşıma reddi] ve zarf (b) [tRPC data.appError] AYNI PanelError üretir', () => {
    const fromEnvelopeA = Object.assign(new Error('transport_rejection'), {
      body: sampleAppErrorBody,
    })
    const fromEnvelopeB = {
      data: { code: 'FORBIDDEN', httpStatus: 403, appError: sampleAppErrorBody },
    }

    const resultA = normalizePanelError(fromEnvelopeA)
    const resultB = normalizePanelError(fromEnvelopeB)

    expect(resultA).toEqual(resultB)
  })
})

describe('normalizePanelError — probe 3 → 4 sırası (AppErrorBody düz vs Better Auth gövdesi)', () => {
  it('appErrorBodySchema şekli DOĞRUDAN gelirse probe 3 eşleşir, requestId KORUNUR', () => {
    expect(normalizePanelError(sampleAppErrorBody)).toEqual({
      kind: 'known',
      code: 'PLATFORM_ADMIN_REQUIRED',
      requestId: 'req_01J000000000000000000001',
    })
  })

  it("Better Auth'un KENDİ gövdesi ({code}) probe 4'e düşer, requestId null olur", () => {
    expect(normalizePanelError({ code: 'INVALID_EMAIL_OR_PASSWORD' })).toEqual({
      kind: 'known',
      code: 'INVALID_EMAIL_OR_PASSWORD',
      requestId: null,
    })
  })
})

describe('normalizePanelError — fail-closed', () => {
  it('hiçbir probe eşleşmezse (null/bozuk gövde) kind: "unknown" döner, FIRLATMAZ', () => {
    expect(normalizePanelError(null)).toEqual({ kind: 'unknown', requestId: null })
    expect(normalizePanelError(undefined)).toEqual({ kind: 'unknown', requestId: null })
    expect(normalizePanelError('bozuk metin')).toEqual({ kind: 'unknown', requestId: null })
  })
})

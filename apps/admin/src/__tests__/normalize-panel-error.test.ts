// @arkesoft/admin — normalizePanelError testleri (ROADMAP v0.0.7, T-008/S4, AC7)
// Saf fonksiyon testleri — AĞ ÇAĞRISI YOK, `instanceof` kullanılmıyor.
import type { AppErrorBody } from '@arkesoft/errors'
import { describe, expect, it } from 'vitest'

import { normalizePanelError } from '../errors/normalize-panel-error.js'

/** Örnek bir domain hatasının tel gövdesi (zarf a'nın ÇEKİRDEK şekli). */
const sampleAppErrorBody: AppErrorBody = {
  code: 'TENANT_NOT_FOUND',
  message: 'errors.tenant.notFound',
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
      code: 'TENANT_NOT_FOUND',
      requestId: 'req_01J000000000000000000001',
    })
  })

  it('input.cause altındaki {body} sarmalayıcısını AZAMİ 2 derinlikte tanır', () => {
    const wrapped = { cause: { body: sampleAppErrorBody } }

    expect(normalizePanelError(wrapped)).toEqual({
      kind: 'known',
      code: 'TENANT_NOT_FOUND',
      requestId: 'req_01J000000000000000000001',
    })
  })

  it('input.cause.cause (3. derinlik) ARTIK tanınmaz — azami 2 derinlik sınırı', () => {
    const tooDeep = { cause: { cause: { body: sampleAppErrorBody } } }

    expect(normalizePanelError(tooDeep)).toEqual({ kind: 'unknown', requestId: null })
  })
})

describe('normalizePanelError — AC7: aynı domain hatası (a) ve (b)dan deepEqual', () => {
  it('zarf (a) [HTTP taşıma reddi] ve zarf (b) [tRPC data.appError] AYNI PanelError üretir', () => {
    const fromEnvelopeA = Object.assign(new Error('transport_rejection'), {
      body: sampleAppErrorBody,
    })
    const fromEnvelopeB = {
      data: {
        code: 'NOT_FOUND',
        httpStatus: 404,
        appError: sampleAppErrorBody,
      },
    }

    const resultA = normalizePanelError(fromEnvelopeA)
    const resultB = normalizePanelError(fromEnvelopeB)

    expect(resultA).toEqual({
      kind: 'known',
      code: 'TENANT_NOT_FOUND',
      requestId: 'req_01J000000000000000000001',
    })
    expect(resultA).toEqual(resultB)
  })
})

describe('normalizePanelError — probe 3 → 4 sırası (AppErrorBody düz vs Better Auth gövdesi)', () => {
  it('appErrorBodySchema şekli DOĞRUDAN gelirse probe 3 eşleşir, requestId KORUNUR', () => {
    // Bu nesne {code: string} şeklini de karşılar (probe 4'e DE uyar) — probe
    // 3 DAHA DAR olduğu için ÖNCE denenmezse requestId KAYBOLURDU (probe 4
    // her zaman requestId: null döner). Bu test o regresyonu YAKALAR.
    expect(normalizePanelError(sampleAppErrorBody)).toEqual({
      kind: 'known',
      code: 'TENANT_NOT_FOUND',
      requestId: 'req_01J000000000000000000001',
    })
  })

  it("Better Auth'un KENDİ gövdesini (zarf c) tanır — requestId YOK → null", () => {
    const betterAuthRejection = {
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    }

    expect(normalizePanelError(betterAuthRejection)).toEqual({
      kind: 'known',
      code: 'INVALID_EMAIL_OR_PASSWORD',
      requestId: null,
    })
  })
})

describe('normalizePanelError — fail-closed (hiçbir probe eşleşmezse FIRLATMAZ)', () => {
  it('null girdi → unknown', () => {
    expect(normalizePanelError(null)).toEqual({ kind: 'unknown', requestId: null })
  })

  it('undefined girdi → unknown', () => {
    expect(normalizePanelError(undefined)).toEqual({ kind: 'unknown', requestId: null })
  })

  it('HTML gövde (ham dize) → unknown', () => {
    const html = '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>'

    expect(normalizePanelError(html)).toEqual({ kind: 'unknown', requestId: null })
  })

  it('ilgisiz şekilli nesne → unknown', () => {
    expect(normalizePanelError({ foo: 'bar', baz: 42 })).toEqual({
      kind: 'unknown',
      requestId: null,
    })
  })

  it('döngüsel (circular) gövde → fırlatmadan unknown', () => {
    const circular: Record<string, unknown> = {}
    circular['cause'] = circular

    expect(() => normalizePanelError(circular)).not.toThrow()
    expect(normalizePanelError(circular)).toEqual({ kind: 'unknown', requestId: null })
  })

  it('boş nesne → unknown', () => {
    expect(normalizePanelError({})).toEqual({ kind: 'unknown', requestId: null })
  })
})

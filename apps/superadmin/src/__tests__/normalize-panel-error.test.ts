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
      messageKey: 'errors.platform.adminRequired',
    })
  })

  it('input.cause altındaki {body} sarmalayıcısını AZAMİ 2 derinlikte tanır', () => {
    const wrapped = { cause: { body: sampleAppErrorBody } }

    expect(normalizePanelError(wrapped)).toEqual({
      kind: 'known',
      code: 'PLATFORM_ADMIN_REQUIRED',
      requestId: 'req_01J000000000000000000001',
      messageKey: 'errors.platform.adminRequired',
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
      messageKey: 'errors.platform.adminRequired',
    })
  })

  it("Better Auth'un KENDİ gövdesi ({code}) probe 4'e düşer, requestId null olur, messageKey HER ZAMAN null", () => {
    expect(normalizePanelError({ code: 'INVALID_EMAIL_OR_PASSWORD' })).toEqual({
      kind: 'known',
      code: 'INVALID_EMAIL_OR_PASSWORD',
      requestId: null,
      messageKey: null,
    })
  })
})

// ROADMAP v0.0.18, T-027/S7 (architect R-1 KARARI) — `messageKey` kanalı:
// KAPALI küme DIŞINDAKİ HER değer `null`'a elenir. `panel-error.ts`'in
// garantisi (hiçbir mesaj alanı HAM olarak taşınmaz) burada KAPALI KÜMEYE
// DEVREDİLİYOR — bu describe bloğu o devri NEGATİF olarak kanıtlar
// (`apps/admin`'in AYNI desenindeki test bloğunun kardeşi).
describe('normalizePanelError — messageKey kanalı (T-027/S7, KAPALI KÜME, NEGATİF TESTLER)', () => {
  it('NEGATİF — ham Türkçe sunucu metni null a elenir', () => {
    const body: AppErrorBody = {
      code: 'PLATFORM_NETWORK_NOT_ALLOWED',
      message: 'Beklenmeyen bir hata',
      details: {},
      requestId: 'req_01J000000000000000000011',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body })

    const result = normalizePanelError(rejection)
    expect(result).toEqual({
      kind: 'known',
      code: 'PLATFORM_NETWORK_NOT_ALLOWED',
      requestId: 'req_01J000000000000000000011',
      messageKey: null,
    })
    expect(JSON.stringify(result).includes('Beklenmeyen bir hata')).toBe(false)
  })

  it('NEGATİF — ham İngilizce sunucu metni null a elenir', () => {
    const body: AppErrorBody = {
      code: 'PLATFORM_NETWORK_NOT_ALLOWED',
      message: 'Something went wrong',
      details: {},
      requestId: 'req_01J000000000000000000012',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body })

    expect(normalizePanelError(rejection)).toEqual({
      kind: 'known',
      code: 'PLATFORM_NETWORK_NOT_ALLOWED',
      requestId: 'req_01J000000000000000000012',
      messageKey: null,
    })
  })

  it("NEGATİF — boş dize ('') null a elenir", () => {
    const body: AppErrorBody = {
      code: 'PLATFORM_NETWORK_NOT_ALLOWED',
      message: '',
      details: {},
      requestId: 'req_01J000000000000000000013',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body })

    expect(normalizePanelError(rejection)).toEqual({
      kind: 'known',
      code: 'PLATFORM_NETWORK_NOT_ALLOWED',
      requestId: 'req_01J000000000000000000013',
      messageKey: null,
    })
  })

  it('NEGATİF — uydurma (küme dışı) bir i18n-benzeri anahtar null a elenir', () => {
    const body: AppErrorBody = {
      code: 'PLATFORM_NETWORK_NOT_ALLOWED',
      message: 'errors.uydurma.kod',
      details: {},
      requestId: 'req_01J000000000000000000014',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body })

    expect(normalizePanelError(rejection)).toEqual({
      kind: 'known',
      code: 'PLATFORM_NETWORK_NOT_ALLOWED',
      requestId: 'req_01J000000000000000000014',
      messageKey: null,
    })
  })

  // `appErrorBodySchema.message` tel ÜZERİNDE her zaman bir `string`'dir —
  // TİP-dışı değerler (sayı/nesne/null/eksik) zarf (a/b)'nin TAMAMINI
  // geçersiz kılar, probe zarf (c)'ye (Better Auth'un KENDİ gövdesi) düşer;
  // o dalda `message` HİÇ PARSE EDİLMEZ, `messageKey` HER ZAMAN `null`.
  it.each([
    ['sayı', { code: 'SOME_PLATFORM_CODE', message: 123 }],
    ['nesne', { code: 'SOME_PLATFORM_CODE', message: { nested: true } }],
    ['null', { code: 'SOME_PLATFORM_CODE', message: null }],
    ['message alanı hiç YOK (undefined)', { code: 'SOME_PLATFORM_CODE' }],
  ])(
    'NEGATİF — message tipi (%s) zarf (a/b)yi geçersiz kılar, zarf (c)ye düşer, messageKey null kalır',
    (_label, betterAuthRejection) => {
      expect(normalizePanelError(betterAuthRejection)).toEqual({
        kind: 'known',
        code: 'SOME_PLATFORM_CODE',
        requestId: null,
        messageKey: null,
      })
    },
  )
})

describe('normalizePanelError — fail-closed', () => {
  it('hiçbir probe eşleşmezse (null/bozuk gövde) kind: "unknown" döner, FIRLATMAZ', () => {
    expect(normalizePanelError(null)).toEqual({ kind: 'unknown', requestId: null })
    expect(normalizePanelError(undefined)).toEqual({ kind: 'unknown', requestId: null })
    expect(normalizePanelError('bozuk metin')).toEqual({ kind: 'unknown', requestId: null })
  })
})

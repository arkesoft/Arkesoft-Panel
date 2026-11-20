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
      messageKey: 'errors.tenant.notFound',
      fields: null,
    })
  })

  it('input.cause altındaki {body} sarmalayıcısını AZAMİ 2 derinlikte tanır', () => {
    const wrapped = { cause: { body: sampleAppErrorBody } }

    expect(normalizePanelError(wrapped)).toEqual({
      kind: 'known',
      code: 'TENANT_NOT_FOUND',
      requestId: 'req_01J000000000000000000001',
      messageKey: 'errors.tenant.notFound',
      fields: null,
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
      messageKey: 'errors.tenant.notFound',
      fields: null,
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
      messageKey: 'errors.tenant.notFound',
      fields: null,
    })
  })

  it("Better Auth'un KENDİ gövdesini (zarf c) tanır — requestId YOK → null, fields YOK → null, messageKey HER ZAMAN null", () => {
    const betterAuthRejection = {
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    }

    expect(normalizePanelError(betterAuthRejection)).toEqual({
      kind: 'known',
      code: 'INVALID_EMAIL_OR_PASSWORD',
      requestId: null,
      messageKey: null,
      fields: null,
    })
  })
})

// T-019/S8 (F13, AC-5) — panelin `fields` kanalı: KAPALI ALLOWLIST.
describe('normalizePanelError — fields kanalı (T-019/S8, AC-5, KAPALI ALLOWLIST)', () => {
  it('kümeye UYAN bir alan hatası anahtarını (`errors.slug.taken`) TAŞIR', () => {
    const bodyWithKnownField: AppErrorBody = {
      code: 'VALIDATION_ERROR',
      message: 'errors.validation.generic',
      details: { fields: { slug: 'errors.slug.taken' } },
      requestId: 'req_01J000000000000000000002',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body: bodyWithKnownField })

    expect(normalizePanelError(rejection)).toEqual({
      kind: 'known',
      code: 'VALIDATION_ERROR',
      requestId: 'req_01J000000000000000000002',
      // `body.message` burada 'errors.validation.generic' — KAPALI kümenin
      // GERÇEK üyesi 'errors.validation.failed'dır, bu yüzden küme dışı ⇒ null.
      messageKey: null,
      fields: { slug: 'errors.slug.taken' },
    })
  })

  // ⚠⚠ NEGATİF TEST 1 (en önemlisi, brief): sunucu `details.fields.slug`'a HAM
  // Türkçe metin gönderirse panel bunu TAŞIMAZ — `fields` o alan için `null`a
  // düşer ve ham metin ÇIKTININ HİÇBİR YERİNDE (JSON.stringify edilmiş tam
  // sonuç dahil) GEÇMEZ. 0 eşleşme ÖLÇÜLEREK doğrulanır.
  it('NEGATİF TEST 1 — ham Türkçe metin ASLA taşınmaz, çıktıda 0 eşleşme', () => {
    const rawServerText = 'Bu alan adı sistem yöneticisi tarafından elle reddedildi.'
    const bodyWithRawText: AppErrorBody = {
      code: 'VALIDATION_ERROR',
      message: 'errors.validation.generic',
      details: { fields: { slug: rawServerText } },
      requestId: 'req_01J000000000000000000003',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body: bodyWithRawText })

    const result = normalizePanelError(rejection)

    expect(result).toEqual({
      kind: 'known',
      code: 'VALIDATION_ERROR',
      requestId: 'req_01J000000000000000000003',
      messageKey: null,
      fields: null,
    })
    const serializedResult = JSON.stringify(result)
    expect(serializedResult.includes(rawServerText)).toBe(false)
    expect((serializedResult.match(new RegExp(rawServerText, 'g')) ?? []).length).toBe(0)
  })

  // NEGATİF TEST 2 — `details.fields` hiç YOKKEN davranış birebir eskisiyle
  // AYNI (regresyon yok): tek fark eklenen `fields: null` alanı, `code`/
  // `requestId` değişmez.
  it('NEGATİF TEST 2 — details.fields YOKKEN davranış birebir eskisi (regresyon yok)', () => {
    const bodyWithoutFields: AppErrorBody = {
      code: 'TENANT_NOT_FOUND',
      message: 'errors.tenant.notFound',
      details: {},
      requestId: 'req_01J000000000000000000004',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body: bodyWithoutFields })

    expect(normalizePanelError(rejection)).toEqual({
      kind: 'known',
      code: 'TENANT_NOT_FOUND',
      requestId: 'req_01J000000000000000000004',
      messageKey: 'errors.tenant.notFound',
      fields: null,
    })
  })

  // NEGATİF TEST 3 — allowlist DIŞI bir anahtar (uydurma kod) `fields`'e
  // GİRMEZ, o alan `null`a düşer.
  it("NEGATİF TEST 3 — allowlist DIŞI anahtar fields'e girmez, null a düşer", () => {
    const bodyWithUnknownKey: AppErrorBody = {
      code: 'VALIDATION_ERROR',
      message: 'errors.validation.generic',
      details: { fields: { slug: 'errors.uydurma.kod' } },
      requestId: 'req_01J000000000000000000005',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body: bodyWithUnknownKey })

    expect(normalizePanelError(rejection)).toEqual({
      kind: 'known',
      code: 'VALIDATION_ERROR',
      requestId: 'req_01J000000000000000000005',
      messageKey: null,
      fields: null,
    })
  })

  it('bir alan allowlist DIŞI, diğeri İÇİNDEYSE yalnızca geçerli alan KALIR (tekil eleme)', () => {
    const bodyWithMixedFields: AppErrorBody = {
      code: 'VALIDATION_ERROR',
      message: 'errors.validation.generic',
      details: {
        fields: {
          slug: 'errors.slug.reserved',
          name: 'errors.uydurma.kod',
        },
      },
      requestId: 'req_01J000000000000000000006',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body: bodyWithMixedFields })

    expect(normalizePanelError(rejection)).toEqual({
      kind: 'known',
      code: 'VALIDATION_ERROR',
      requestId: 'req_01J000000000000000000006',
      messageKey: null,
      fields: { slug: 'errors.slug.reserved' },
    })
  })
})

// ROADMAP v0.0.18, T-027/S7 (architect R-1 KARARI) — `messageKey` kanalı:
// KAPALI küme DIŞINDAKİ HER değer `null`'a elenir. `panel-error.ts:9-11`'in
// garantisi (hiçbir mesaj alanı HAM olarak taşınmaz) burada KAPALI KÜMEYE
// DEVREDİLİYOR — bu describe bloğu o devri NEGATİF olarak kanıtlar.
describe('normalizePanelError — messageKey kanalı (T-027/S7, KAPALI KÜME, NEGATİF TESTLER)', () => {
  it('küme İÇİNDEKİ bir değer messageKey olarak TAŞINIR', () => {
    const body: AppErrorBody = {
      code: 'PLATFORM_ADMIN_REQUIRED',
      message: 'errors.platform.adminRequired',
      details: {},
      requestId: 'req_01J000000000000000000010',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body })

    expect(normalizePanelError(rejection)).toEqual({
      kind: 'known',
      code: 'PLATFORM_ADMIN_REQUIRED',
      requestId: 'req_01J000000000000000000010',
      messageKey: 'errors.platform.adminRequired',
      fields: null,
    })
  })

  it('NEGATİF — ham Türkçe sunucu metni (ör. "Beklenmeyen bir hata") null a elenir', () => {
    const body: AppErrorBody = {
      code: 'TENANT_NOT_FOUND',
      message: 'Beklenmeyen bir hata',
      details: {},
      requestId: 'req_01J000000000000000000011',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body })

    const result = normalizePanelError(rejection)
    expect(result).toEqual({
      kind: 'known',
      code: 'TENANT_NOT_FOUND',
      requestId: 'req_01J000000000000000000011',
      messageKey: null,
      fields: null,
    })
    expect(JSON.stringify(result).includes('Beklenmeyen bir hata')).toBe(false)
  })

  it('NEGATİF — ham İngilizce sunucu metni null a elenir', () => {
    const body: AppErrorBody = {
      code: 'TENANT_NOT_FOUND',
      message: 'Something went wrong',
      details: {},
      requestId: 'req_01J000000000000000000012',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body })

    expect(normalizePanelError(rejection)).toEqual({
      kind: 'known',
      code: 'TENANT_NOT_FOUND',
      requestId: 'req_01J000000000000000000012',
      messageKey: null,
      fields: null,
    })
  })

  it("NEGATİF — boş dize ('') null a elenir", () => {
    const body: AppErrorBody = {
      code: 'TENANT_NOT_FOUND',
      message: '',
      details: {},
      requestId: 'req_01J000000000000000000013',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body })

    expect(normalizePanelError(rejection)).toEqual({
      kind: 'known',
      code: 'TENANT_NOT_FOUND',
      requestId: 'req_01J000000000000000000013',
      messageKey: null,
      fields: null,
    })
  })

  it('NEGATİF — uydurma (küme dışı) bir i18n-benzeri anahtar null a elenir', () => {
    const body: AppErrorBody = {
      code: 'TENANT_NOT_FOUND',
      message: 'errors.uydurma.kod',
      details: {},
      requestId: 'req_01J000000000000000000014',
    }
    const rejection = Object.assign(new Error('transport_rejection'), { body })

    expect(normalizePanelError(rejection)).toEqual({
      kind: 'known',
      code: 'TENANT_NOT_FOUND',
      requestId: 'req_01J000000000000000000014',
      messageKey: null,
      fields: null,
    })
  })

  // `appErrorBodySchema.message` tel ÜZERİNDE her zaman bir `string`'dir
  // (`z.string()`) — `null`/`undefined`/sayı/nesne gibi TİP-dışı değerler o
  // zarfın (a/b) TAMAMINI geçersiz kılar ve probe zarf (c)'ye (Better Auth'un
  // KENDİ gövdesi, `{code: z.string()}`) düşer. O dalda `message` HİÇ
  // PARSE EDİLMEZ — `messageKey` HER ZAMAN `null`, `message` değerinin TİPİ
  // ne olursa olsun (sayı/nesne/eksik). Dört değer burada AYRI AYRI ölçülür.
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
        fields: null,
      })
    },
  )
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

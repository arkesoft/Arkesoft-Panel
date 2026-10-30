// @arkesoft/errors — error-body (tel sözleşmesi) birim testleri
// (ROADMAP v0.0.4, T-002/ST-3b, architect K4/A-V24/A-V25;
// ROADMAP v0.0.6, T-007/ST-1, architect K3 — ADR-0010 §1)

import { describe, expect, it } from 'vitest'

import { AppError } from '../app-error.js'
import {
  appErrorBodySchema,
  genericTransportErrorBody,
  toErrorBody,
  unknownErrorBody,
} from '../error-body.js'

class SampleError extends AppError {
  constructor(context: Record<string, unknown>) {
    super({
      code: 'SAMPLE_ERROR',
      httpStatus: 400,
      userMessageKey: 'errors.sample.failed',
      context,
    })
  }
}

// PO riski 8 (ROADMAP v0.0.5, T-006/S3) — `httpHeaders` (Retry-After, AC7)
// `toErrorBody` çıktısına GİRMEMELİ. `RateLimitExceededError` henüz doğmadı
// (v0.0.5/S8'in işi); taban sözleşmesi burada bağımsız ölçülür.
class SampleErrorWithHttpHeaders extends AppError {
  constructor() {
    super({
      code: 'SAMPLE_RATE_LIMITED',
      httpStatus: 429,
      userMessageKey: 'errors.sample.rateLimited',
      httpHeaders: { 'Retry-After': '60' },
    })
  }
}

// PO riski 1 (ROADMAP v0.0.6, T-007/ST-1) — `toErrorBody`'nin ÜÇÜNCÜ parametresi
// (harici `details`) KALDIRILDI; `details`'in TEK kaynağı artık
// `error.publicDetails`'tir (ADR-0010 §1, architect K3). Bu test MEKANİZMA
// DEĞİŞTİRİLEREK korunuyor: eski "details verildiğinde taşınır" senaryosu artık
// burada tanımlı bir alt sınıfın `override get publicDetails()`'i ile üretiliyor.
// **Bu bir test gevşetmesi DEĞİL** — aynı davranış (bir hata `{fields:...}`
// şeklinde bir detay taşıyorsa bu `body.details`'e birebir yansır) yeni
// mekanizmayla, assert AYNEN bırakılarak ölçülüyor.
class SampleErrorWithPublicDetails extends AppError {
  constructor() {
    super({
      code: 'SAMPLE_ERROR',
      httpStatus: 400,
      userMessageKey: 'errors.sample.failed',
    })
  }

  override get publicDetails(): Readonly<Record<string, unknown>> {
    return { fields: { slug: 'errors.slug.taken' } }
  }
}

// K3 fail-closed senaryosu (ADR-0010 §1 "yapısal dayanıklılık"): `isAppError`'ın
// yapısal yedek yolundan `true` dönen bir nesnede `publicDetails` getter'ı
// OLMAYABİLİR (paket çoğalması). `toErrorBody` bu durumda körü körüne
// yazmaz — `{}` kullanır. `appErrorShapeSchema` (app-error.ts) BÜYÜTÜLMEDİ;
// bu nesne o şemayla hâlâ eşleşiyor (code/httpStatus/userMessageKey), yalnızca
// `publicDetails` eksik.
const structuralAppErrorWithoutPublicDetails = {
  code: 'STRUCTURAL_ERROR',
  httpStatus: 500,
  userMessageKey: 'errors.structural',
  // `userMessageKey` hariç diğer AppError alanları (`toErrorBody` yalnızca
  // bunları okur) — `publicDetails` BİLİNÇLİ OLARAK YOK.
} as unknown as AppError

describe('toErrorBody', () => {
  it('çıktı anahtar kümesi tam olarak code/details/message/requestId olur', () => {
    const error = new SampleError({ userId: 'usr_123' })

    const body = toErrorBody(error, 'req_abc123')

    expect(Object.keys(body).sort()).toEqual(['code', 'details', 'message', 'requestId'])
  })

  it('message alanı userMessageKey (i18n anahtarı) taşır, ham metin değil', () => {
    const error = new SampleError({ userId: 'usr_123' })

    const body = toErrorBody(error, 'req_abc123')

    expect(body.message).toBe('errors.sample.failed')
  })

  it('details verilmediğinde boş nesnedir', () => {
    const error = new SampleError({ userId: 'usr_123' })

    const body = toErrorBody(error, 'req_abc123')

    expect(body.details).toEqual({})
  })

  // PO riski 1 (ROADMAP v0.0.6, T-007/ST-1) — bkz. `SampleErrorWithPublicDetails`
  // yorumu: eski harici üçüncü parametre YERİNE `override get publicDetails()`.
  // Assert AYNEN korunuyor; bu test gevşetmesi DEĞİL, mekanizma değişimi.
  it('publicDetails override edildiğinde taşınır', () => {
    const error = new SampleErrorWithPublicDetails()

    const body = toErrorBody(error, 'req_abc123')

    expect(body.details).toEqual({ fields: { slug: 'errors.slug.taken' } })
  })

  // K3 fail-closed (ADR-0010 §1): yapısal yedek yoldan `true` dönen ama
  // `publicDetails` getter'ı OLMAYAN bir nesne — körü körüne yazılmaz, `{}`.
  it('publicDetails taşımayan yapısal bir AppError için details boş nesnedir (fail-closed)', () => {
    const body = toErrorBody(structuralAppErrorWithoutPublicDetails, 'req_abc123')

    expect(body.details).toEqual({})
  })

  it('context — PII/sır içerebilecek iç bağlam — çıktıya ASLA girmez (A-V25)', () => {
    const error = new SampleError({
      userId: 'usr_123',
      secretToken: 'should-never-leak',
    })

    const body = toErrorBody(error, 'req_abc123')

    expect('context' in body).toBe(false)
    expect(JSON.stringify(body)).not.toContain('should-never-leak')
  })

  it('requestId birebir taşınır', () => {
    const error = new SampleError({})

    const body = toErrorBody(error, 'req_xyz789')

    expect(body.requestId).toBe('req_xyz789')
  })

  it('appErrorBodySchema çıktıyı doğrular', () => {
    const error = new SampleError({})

    const body = toErrorBody(error, 'req_abc123')

    expect(() => appErrorBodySchema.parse(body)).not.toThrow()
  })

  it('httpHeaders (Retry-After) çıktıya ASLA girmez (PO riski 8, AC7 — v0.0.5/T-006/S3)', () => {
    const error = new SampleErrorWithHttpHeaders()

    const body = toErrorBody(error, 'req_abc123')

    expect('httpHeaders' in body).toBe(false)
    expect(Object.keys(body).sort()).toEqual(['code', 'details', 'message', 'requestId'])
    expect(JSON.stringify(body)).not.toContain('Retry-After')
  })
})

// ROADMAP v0.0.6, T-007/ST-1, architect K3 (ADR-0010 §2) — çerçeve/bilinmeyen
// hata için jenerik tel gövdesi fabrikaları. `apps/api`'nin error-mapping'i VE
// v0.0.6'nın `packages/trpc`'si AYNI fonksiyonu çağıracak (AC10, literal
// kopyası yok).
describe('genericTransportErrorBody', () => {
  it('HTTP_EXCEPTION kodu ve errors.http.generic anahtarıyla sabit gövde üretir', () => {
    const body = genericTransportErrorBody('req_abc123')

    expect(body).toEqual({
      code: 'HTTP_EXCEPTION',
      message: 'errors.http.generic',
      details: {},
      requestId: 'req_abc123',
    })
  })

  it('appErrorBodySchema çıktıyı doğrular', () => {
    const body = genericTransportErrorBody('req_abc123')

    expect(() => appErrorBodySchema.parse(body)).not.toThrow()
  })
})

describe('unknownErrorBody', () => {
  it('INTERNAL_ERROR kodu ve errors.internal.unknown anahtarıyla sabit gövde üretir', () => {
    const body = unknownErrorBody('req_abc123')

    expect(body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'errors.internal.unknown',
      details: {},
      requestId: 'req_abc123',
    })
  })

  it('appErrorBodySchema çıktıyı doğrular', () => {
    const body = unknownErrorBody('req_abc123')

    expect(() => appErrorBodySchema.parse(body)).not.toThrow()
  })
})

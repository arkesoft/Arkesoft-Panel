// @arkesoft/errors — error-body (tel sözleşmesi) birim testleri
// (ROADMAP v0.0.4, T-002/ST-3b, architect K4/A-V24/A-V25)

import { describe, expect, it } from 'vitest'

import { AppError } from '../app-error.js'
import { appErrorBodySchema, toErrorBody } from '../error-body.js'

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

  it('details verildiğinde taşınır', () => {
    const error = new SampleError({ userId: 'usr_123' })

    const body = toErrorBody(error, 'req_abc123', { fields: { slug: 'errors.slug.taken' } })

    expect(body.details).toEqual({ fields: { slug: 'errors.slug.taken' } })
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

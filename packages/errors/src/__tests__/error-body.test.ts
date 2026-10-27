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
})

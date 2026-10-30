// @arkesoft/errors — AppError birim testleri (ROADMAP v0.0.4, T-002/ST-3b;
// ROADMAP v0.0.6, T-007/ST-1, architect K3 — ADR-0010 §1, publicDetails)

import { describe, expect, it } from 'vitest'

import { AppError, isAppError } from '../app-error.js'

// Test amaçlı somut alt sınıflar — AppError `abstract`, doğrudan örneklenemez.
// `exactOptionalPropertyTypes` yüzünden context'li/context'siz çağrıyı ayrı
// sınıflarla modelliyoruz (opsiyonel alana açıkça `undefined` yazılmaz).
class SampleError extends AppError {
  constructor(context: Record<string, unknown>) {
    super({
      code: 'SAMPLE_ERROR',
      httpStatus: 418,
      userMessageKey: 'errors.sample.failed',
      context,
    })
  }
}

class SampleErrorWithoutContext extends AppError {
  constructor() {
    super({
      code: 'SAMPLE_ERROR',
      httpStatus: 418,
      userMessageKey: 'errors.sample.failed',
    })
  }
}

class RetryableSampleError extends AppError {
  constructor() {
    super({
      code: 'RETRYABLE_SAMPLE',
      httpStatus: 503,
      userMessageKey: 'errors.sample.retryable',
      isRetryable: true,
    })
  }
}

// `httpHeaders` için — ROADMAP v0.0.5, T-006/S3, architect "HATA SINIFLARI"
// (Retry-After, AC7). `RateLimitExceededError` henüz doğmadı (v0.0.5/S8'in işi);
// taban sınıfın sözleşmesini burada BAĞIMSIZ bir örnek sınıfla ölçüyoruz.
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

// K3 (ADR-0010 §1) — bir alt sınıfın `override get publicDetails()` ile
// tele yazacağı veriyi AÇIKÇA seçtiği durum. `override` anahtar sözcüğü
// eksik olsaydı `noImplicitOverride: true` derleme hatası verirdi (yazım
// hatasına karşı mekanik koruma — bu test derlenmesinin kendisi o korumanın
// kanıtıdır).
class SampleErrorWithPublicDetails extends AppError {
  constructor() {
    super({
      code: 'SAMPLE_WITH_DETAILS',
      httpStatus: 422,
      userMessageKey: 'errors.sample.withDetails',
    })
  }

  override get publicDetails(): Readonly<Record<string, unknown>> {
    return { probe: 'x' }
  }
}

describe('AppError', () => {
  it('beş alanı doğru şekilde taşır', () => {
    const error = new SampleError({ userId: 'usr_123' })

    expect(error.code).toBe('SAMPLE_ERROR')
    expect(error.httpStatus).toBe(418)
    expect(error.userMessageKey).toBe('errors.sample.failed')
    expect(error.context).toEqual({ userId: 'usr_123' })
    expect(error.isRetryable).toBe(false)
  })

  it('context verilmediğinde varsayılan olarak boş nesnedir', () => {
    const error = new SampleErrorWithoutContext()

    expect(error.context).toEqual({})
  })

  it('isRetryable açıkça true verildiğinde taşınır', () => {
    const error = new RetryableSampleError()

    expect(error.isRetryable).toBe(true)
  })

  it('name alanı alt sınıfın adına ayarlanır', () => {
    const error = new SampleErrorWithoutContext()

    expect(error.name).toBe('SampleErrorWithoutContext')
  })

  it('gerçek bir Error örneğidir (Node hata zincirine uyar)', () => {
    const error = new SampleErrorWithoutContext()

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(AppError)
  })

  it('logLevel alanı taşımaz (v0.0.17 öncesi — architect K-A2 bağlayıcı kararı)', () => {
    const error = new SampleErrorWithoutContext()

    expect('logLevel' in error).toBe(false)
  })

  it('httpHeaders verilmediğinde undefined kalır (v0.0.5, T-006/S3)', () => {
    const error = new SampleErrorWithoutContext()

    expect(error.httpHeaders).toBeUndefined()
  })

  it('httpHeaders verildiğinde birebir taşınır (v0.0.5, T-006/S3, AC7 Retry-After)', () => {
    const error = new SampleErrorWithHttpHeaders()

    expect(error.httpHeaders).toEqual({ 'Retry-After': '60' })
  })

  it('publicDetails varsayılan olarak boş nesnedir (ADR-0010 §1, fail-closed)', () => {
    const error = new SampleErrorWithoutContext()

    expect(error.publicDetails).toEqual({})
  })

  it('publicDetails override edildiğinde taşınır (ADR-0010 §1)', () => {
    const error = new SampleErrorWithPublicDetails()

    expect(error.publicDetails).toEqual({ probe: 'x' })
  })
})

describe('isAppError', () => {
  it('instanceof ile gerçek bir AppError örneğini true döner', () => {
    expect(isAppError(new SampleErrorWithoutContext())).toBe(true)
  })

  it('code/httpStatus/userMessageKey alanlarını taşıyan yapısal nesneyi true döner', () => {
    const structural = {
      code: 'STRUCTURAL_ERROR',
      httpStatus: 500,
      userMessageKey: 'errors.structural',
    }

    expect(isAppError(structural)).toBe(true)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string primitive', 'not-an-error'],
    ['number primitive', 42],
    ['boolean primitive', true],
    ['boş nesne', {}],
    ['eksik alan — yalnızca code', { code: 'ONLY_CODE' }],
    [
      'yanlış tipte alan — httpStatus string',
      { code: 'X', httpStatus: '404', userMessageKey: 'errors.x' },
    ],
  ])('%s → false', (_label, value) => {
    expect(isAppError(value)).toBe(false)
  })
})

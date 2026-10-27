// @arkesoft/api — error-mapping + ALS fail-closed okuma yüzeyi testleri
// (ROADMAP v0.0.4, T-002/ST-4)
//
// `getTenantContext()`'in `kind !== 'resolved'` iken fırlatma testi BİLEREK
// bu dosyada — DOKUNULACAK DOSYALAR listesi yalnızca `error-mapping.test.ts`
// ve `zod-validation-pipe.test.ts`'i tanımlıyor; `RequestContextUnavailableError`
// (hem "ALS deposu yok" hem "tenant çözülmemiş" durumunda fırlatılan hata) bu
// dosyanın konusu olan hata eşlemesiyle doğrudan ilişkili.

import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { HttpException } from '@nestjs/common'
import { TenantStatus } from '@arkesoft/db'

import { DependencyUnavailableError } from '../errors/domain/dependency-unavailable.error.js'
import { RequestContextUnavailableError } from '../errors/domain/request-context-unavailable.error.js'
import { TenantNotFoundError } from '../errors/domain/tenant-not-found.error.js'
import { TenantResolutionFailedError } from '../errors/domain/tenant-resolution-failed.error.js'
import { ValidationError } from '../errors/domain/validation.error.js'
import { mapErrorToResponse } from '../errors/error-mapping.js'
import { getTenantContext } from '../request-context/request-context.accessors.js'
import { requestContextStorage } from '../request-context/request-context.storage.js'
import type { RequestContext } from '../request-context/request-context.types.js'

const REQUEST_ID = 'req_test0000000000000000000000'

const EXPECTED_BODY_KEYS = ['code', 'details', 'message', 'requestId']

describe('mapErrorToResponse — AppError alt sınıfları', () => {
  it('TenantNotFoundError → 404, details her zaman {}, context yok', () => {
    const error = new TenantNotFoundError({ reason: 'no_row' })
    const mapped = mapErrorToResponse(error, REQUEST_ID)

    expect(mapped.httpStatus).toBe(404)
    expect(Object.keys(mapped.body).sort()).toEqual(EXPECTED_BODY_KEYS)
    expect(mapped.body.code).toBe('TENANT_NOT_FOUND')
    expect(mapped.body.message).toBe('errors.tenant.notFound')
    expect(mapped.body.details).toEqual({})
    expect(mapped.body.requestId).toBe(REQUEST_ID)
    expect('context' in mapped.body).toBe(false)
    // AC8 sızdırmazlık: ret sebebi (reason) tel üstüne hiçbir biçimde sızmaz.
    expect(JSON.stringify(mapped.body)).not.toContain('no_row')
  })

  it('TenantResolutionFailedError → 500, isRetryable true, details {}', () => {
    const cause = new Error('bağlantı koptu')
    const error = new TenantResolutionFailedError(cause)
    const mapped = mapErrorToResponse(error, REQUEST_ID)

    expect(mapped.httpStatus).toBe(500)
    expect(Object.keys(mapped.body).sort()).toEqual(EXPECTED_BODY_KEYS)
    expect(mapped.body.code).toBe('TENANT_RESOLUTION_FAILED')
    expect(mapped.body.details).toEqual({})
    expect(error.isRetryable).toBe(true)
    expect('context' in mapped.body).toBe(false)
  })

  it('ValidationError → 400, details.fields taşınır, context yok', () => {
    const fields = { slug: 'errors.validation.invalidFormat' }
    const error = new ValidationError(fields)
    const mapped = mapErrorToResponse(error, REQUEST_ID)

    expect(mapped.httpStatus).toBe(400)
    expect(Object.keys(mapped.body).sort()).toEqual(EXPECTED_BODY_KEYS)
    expect(mapped.body.code).toBe('VALIDATION_ERROR')
    expect(mapped.body.details).toEqual({ fields })
    expect('context' in mapped.body).toBe(false)
  })

  it('DependencyUnavailableError → 503, details.checks taşınır, context yok', () => {
    const checks = { database: 'up' as const, redis: 'down' as const }
    const error = new DependencyUnavailableError(checks)
    const mapped = mapErrorToResponse(error, REQUEST_ID)

    expect(mapped.httpStatus).toBe(503)
    expect(Object.keys(mapped.body).sort()).toEqual(EXPECTED_BODY_KEYS)
    expect(mapped.body.code).toBe('DEPENDENCY_UNAVAILABLE')
    expect(mapped.body.details).toEqual({ checks })
    expect('context' in mapped.body).toBe(false)
  })

  it('RequestContextUnavailableError → 500, programlama hatası, details {}', () => {
    const error = new RequestContextUnavailableError({ tenantResolutionKind: 'pending' })
    const mapped = mapErrorToResponse(error, REQUEST_ID)

    expect(mapped.httpStatus).toBe(500)
    expect(Object.keys(mapped.body).sort()).toEqual(EXPECTED_BODY_KEYS)
    expect(mapped.body.code).toBe('REQUEST_CONTEXT_UNAVAILABLE')
    expect(mapped.body.details).toEqual({})
    expect('context' in mapped.body).toBe(false)
  })
})

describe('mapErrorToResponse — HttpException ve bilinmeyen hata', () => {
  it('HttpException → kendi durum kodu + genel i18n anahtarı, ham mesaj tele yazılmaz', () => {
    const error = new HttpException('Cannot GET /yok', 404)
    const mapped = mapErrorToResponse(error, REQUEST_ID)

    expect(mapped.httpStatus).toBe(404)
    expect(Object.keys(mapped.body).sort()).toEqual(EXPECTED_BODY_KEYS)
    expect(mapped.body.code).toBe('HTTP_EXCEPTION')
    expect(mapped.body.message).toBe('errors.http.generic')
    expect(JSON.stringify(mapped.body)).not.toContain('Cannot GET')
    expect(mapped.logContext['nestMessage']).toBe('Cannot GET /yok')
  })

  it('bilinmeyen hata → 500 + genel kod, ham mesaj yalnızca logContext içinde', () => {
    const error = new Error('veritabanı şifresi: gizli-deger')
    const mapped = mapErrorToResponse(error, REQUEST_ID)

    expect(mapped.httpStatus).toBe(500)
    expect(Object.keys(mapped.body).sort()).toEqual(EXPECTED_BODY_KEYS)
    expect(mapped.body.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(mapped.body)).not.toContain('gizli-deger')
    expect(String(mapped.logContext['rawMessage'])).toContain('gizli-deger')
  })

  it('Error olmayan bilinmeyen değer (string) → 500 + genel kod', () => {
    const mapped = mapErrorToResponse('ham bir dize fırlatıldı', REQUEST_ID)

    expect(mapped.httpStatus).toBe(500)
    expect(mapped.body.code).toBe('INTERNAL_ERROR')
    expect(Object.keys(mapped.body).sort()).toEqual(EXPECTED_BODY_KEYS)
  })
})

describe('getTenantContext — fail-closed (R4 telafisi)', () => {
  function runWithTenantState(tenant: RequestContext['tenant'], callback: () => void): void {
    const store: RequestContext = {
      requestId: REQUEST_ID,
      receivedAt: Date.now(),
      logger: pino({ level: 'silent' }),
      tenant,
    }
    requestContextStorage.run(store, callback)
  }

  it("tenant 'pending' iken fırlatır", () => {
    runWithTenantState({ kind: 'pending' }, () => {
      expect(() => getTenantContext()).toThrow(RequestContextUnavailableError)
    })
  })

  it("tenant 'exempt' iken fırlatır", () => {
    runWithTenantState({ kind: 'exempt' }, () => {
      expect(() => getTenantContext()).toThrow(RequestContextUnavailableError)
    })
  })

  it("tenant 'unresolved' iken fırlatır", () => {
    runWithTenantState({ kind: 'unresolved', reason: 'no_row' }, () => {
      expect(() => getTenantContext()).toThrow(RequestContextUnavailableError)
    })
  })

  it("tenant 'failed' iken fırlatır", () => {
    runWithTenantState({ kind: 'failed', cause: new Error('db down') }, () => {
      expect(() => getTenantContext()).toThrow(RequestContextUnavailableError)
    })
  })

  it("tenant 'resolved' iken TenantContext'i döner, fırlatmaz", () => {
    const tenant = {
      id: 'tnt_01',
      slug: 'demo-magaza',
      status: TenantStatus.active,
      source: 'subdomain' as const,
    }
    runWithTenantState({ kind: 'resolved', tenant }, () => {
      expect(getTenantContext()).toEqual(tenant)
    })
  })

  it('ALS deposu hiç kurulmamışken (middleware koşmadan) fırlatır', () => {
    expect(() => getTenantContext()).toThrow(RequestContextUnavailableError)
  })
})

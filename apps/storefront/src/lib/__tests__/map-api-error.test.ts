// @arkesoft/storefront — `mapApiError` testleri (ROADMAP v0.0.8, T-009,
// düzeltme turu 2, architect'in yerleşim kararı)
//
// Saf fonksiyon testi — ağsız, mock YOK. İki zarfın probe sırası ve
// fail-closed (fırlatmaz) davranışı burada doğrulanır.
import { describe, expect, it } from 'vitest'

import { mapApiError } from '../map-api-error.js'

describe('mapApiError', () => {
  describe('zarf (a) — taşıma reddi (storefront-server-fetch.ts yol 2)', () => {
    it('error DOĞRUDAN {status, body} taşıyorsa ve status 404 İSE not-found döner', () => {
      const error = Object.assign(new Error('transport_rejection'), {
        status: 404,
        body: {
          code: 'TENANT_NOT_FOUND',
          message: 'errors.tenant.notFound',
          details: {},
          requestId: 'req_1',
        },
      })

      expect(mapApiError(error)).toEqual({ kind: 'not-found' })
    })

    it('error.cause {status, body} taşıyorsa (AZAMİ 1 seviye) ve status 404 İSE not-found döner', () => {
      const transportRejection = Object.assign(new Error('transport_rejection'), {
        status: 404,
        body: {
          code: 'TENANT_NOT_FOUND',
          message: 'errors.tenant.notFound',
          details: {},
          requestId: 'req_1',
        },
      })
      // tRPC istemcisinin A-A6 ÖLÇÜMÜNDE doğruladığı gerçek şekil:
      // `TRPCClientError.cause` ponyfill'in fırlattığı hatayı taşır.
      const error = new Error('trpc_client_error', { cause: transportRejection })

      expect(mapApiError(error)).toEqual({ kind: 'not-found' })
    })

    it.each([403, 500, 502])('status %i (404 DIŞI) unavailable döner', (status) => {
      const error = Object.assign(new Error('transport_rejection'), {
        status,
        body: {
          code: 'INTERNAL_ERROR',
          message: 'errors.internal',
          details: {},
          requestId: 'req_1',
        },
      })

      expect(mapApiError(error)).toEqual({ kind: 'unavailable' })
    })
  })

  describe('zarf (b) — tRPC zarfı (bugün üretimde tetiklenmiyor, dosya başı yorumu)', () => {
    it('error.data.httpStatus 404 İSE not-found döner', () => {
      const error = {
        data: {
          code: 'NOT_FOUND',
          httpStatus: 404,
          appError: {
            code: 'TENANT_NOT_FOUND',
            message: 'errors.tenant.notFound',
            details: {},
            requestId: 'req_1',
          },
        },
      }

      expect(mapApiError(error)).toEqual({ kind: 'not-found' })
    })

    it('error.data.httpStatus 500 İSE unavailable döner', () => {
      const error = {
        data: {
          code: 'INTERNAL_SERVER_ERROR',
          httpStatus: 500,
          appError: {
            code: 'INTERNAL_ERROR',
            message: 'errors.internal',
            details: {},
            requestId: 'req_1',
          },
        },
      }

      expect(mapApiError(error)).toEqual({ kind: 'unavailable' })
    })
  })

  // ⚠⚠ A-A2 PİN (ROADMAP v0.1.0, T-019/S10) — üretim kodu BU TURDA
  // DEĞİŞMEDİ, sadece bu test EKLENDİ. Dosya başı yorumu zarf (b)'yi
  // "BUGÜN ÜRETİMDE TETİKLENMİYOR" diye işaretlemişti (`TenantGuard` HTTP
  // seviyesinde host çözümlemesini ÖNCE reddediyor) — AMA bu, kiracının
  // VAR OLUP OLMADIĞI içindi, kiracının DURUMU (status) için DEĞİL.
  // `storefront-tenant-read.port.adapter.ts`'in `where: {status:
  // TenantStatus.active}` filtresi `pending`/`provisioning`/`suspended`
  // kiracıları host ÇÖZÜLDÜKTEN SONRA, tRPC PROSEDÜRÜNÜN İÇİNDE eler — bu
  // ret `TenantGuard`'ın HTTP-seviyesi reddinden FARKLI bir katmanda olur
  // ve TRPCClientError'ın `data` alanı (zarf b) üzerinden DÖNER. v0.1.0'dan
  // ÖNCE hiçbir GERÇEK kiracı `pending` durumunda VE canlı trafiğe açık
  // DEĞİLDİ (seed/demo kiracı HER ZAMAN `active`) — `registration.
  // createTenant` artık GERÇEK `pending` kiracılar üretiyor (AC-1) ve bu
  // kiracının `{slug}.{alan-adı}` adresini "Siteyi Kur" (v0.2.0) ÖNCESİ
  // ziyaret eden biri TAM OLARAK bu zarf (b) dalını CANLI olarak tetikler.
  // Bu test o ÖNCEDEN ÖLÇÜLMÜŞ ama şimdi CANLI olan dalın davranışını pinler
  // — `httpStatus: 404` HÂLÂ `{kind: 'not-found'}`'a eşleniyor (kod rejimi
  // asla kırmak İSTEMİYORUZ, bu yüzden pin burada).
  describe('A-A2 — zarf (b), v0.1.0 ile CANLI hâle gelen dal (pending kiracı → 404)', () => {
    it('pending kiracı için TENANT_NOT_FOUND + httpStatus 404 (zarf b) → not-found', () => {
      const error = {
        data: {
          code: 'NOT_FOUND',
          httpStatus: 404,
          appError: {
            code: 'TENANT_NOT_FOUND',
            message: 'errors.tenant.notFound',
            details: {},
            requestId: 'req_pending_tenant',
          },
        },
      }

      expect(mapApiError(error)).toEqual({ kind: 'not-found' })
    })
  })

  describe('fail-closed — hiçbir probe eşleşmez, FIRLATMAZ', () => {
    it.each<[label: string, value: unknown]>([
      ['undefined', undefined],
      ['null', null],
      ['düz Error (ECONNREFUSED benzetimi)', new Error('ECONNREFUSED')],
      ['HTML dizesi', '<html><body>502 Bad Gateway</body></html>'],
      ['boş nesne', {}],
    ])('%s → unavailable, fırlatmaz', (_label, value) => {
      expect(() => mapApiError(value)).not.toThrow()
      expect(mapApiError(value)).toEqual({ kind: 'unavailable' })
    })

    it('döngüsel `cause` zinciri sonsuz özyinelemeye GİRMEZ, unavailable döner', () => {
      const circular: { cause?: unknown } = {}
      circular.cause = circular

      expect(() => mapApiError(circular)).not.toThrow()
      expect(mapApiError(circular)).toEqual({ kind: 'unavailable' })
    })
  })
})

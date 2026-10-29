// @arkesoft/api — TenantGuard birim testi: `pending` → 500 (ROADMAP v0.0.5,
// T-006/S3, architect riski 13 — "İkinci APP_GUARD sıra bağımlılığı")
//
// `assertNever` birleştirmesi (bu alt görev) `TenantGuard`'ın EXHAUSTIVE
// switch'inin `default` dalını (TEORİK OLARAK ulaşılamaz — `TenantResolution`
// zaten kapalı bir birleşim) ortak helper'a yönlendirdi. BU TESTİN konusu
// `default` dalı DEĞİL — `pending` dalı: `TenantContextMiddleware`'in bu rota
// için HİÇ KOŞMADIĞI (ör. `forRoutes` yapılandırması bozulursa) durumda
// guard'ın sessizce "izin ver"E DÜŞMEDİĞİNİ, ham bir `Error` FIRLATTIĞINI
// (→ `AppExceptionFilter`'da 500) kanıtlar. Bugün `app.module.ts`'in
// middleware'i `forRoutes({ path: '*path', method: RequestMethod.ALL })` ile
// TÜM rotalara uyguladığı için bu durum HTTP seviyesinde DOĞAL OLARAK
// tetiklenemez (R-P4 bu yüzden ÇÖZÜLDÜ) — bu yüzden `TenantGuard.canActivate()`
// DOĞRUDAN, ALS deposu `pending` ile elle kurularak çağrılır (aynı desen:
// `error-mapping.test.ts`'in `runWithTenantState` yardımcısı).
//
// `ExecutionContext` parametresi `canActivate`'in gövdesinde HİÇ OKUNMAZ
// (`_context` — bilerek kullanılmayan parametre); bu yüzden test burada
// gerçek bir Nest `ExecutionContext` KURMAZ, framework sözleşmesinin ilgisiz
// kalan kısmını `as unknown as ExecutionContext` ile atlar — üretim kodunda
// DEĞİL, yalnızca framework arayüzünü mock'lamanın standart test deseninde.

import type { ExecutionContext } from '@nestjs/common'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'

import { requestContextStorage } from '../request-context/request-context.storage.js'
import type { RequestContext } from '../request-context/request-context.types.js'
import { TenantGuard } from '../tenancy/tenant.guard.js'

const REQUEST_ID = 'req_test0000000000000000000001'

function runWithPendingTenant(callback: () => void): void {
  const store: RequestContext = {
    requestId: REQUEST_ID,
    receivedAt: Date.now(),
    logger: pino({ level: 'silent' }),
    tenant: { kind: 'pending' },
    // ROADMAP v0.0.5, T-006/S6 EKLEMESİ (additive): `RequestContext.auth`
    // artık ZORUNLU bir alan — bu testin konusu `tenant` dalı olduğu için
    // sabit `'pending'` yeterli.
    auth: { kind: 'pending' },
  }
  requestContextStorage.run(store, callback)
}

describe('TenantGuard — pending → 500 (architect riski 13)', () => {
  it(
    'TenantContextMiddleware hiç koşmamışsa (tenant "pending" kaldıysa) ' +
      'canActivate() ham bir Error fırlatır — "default allow" dalı YOKTUR',
    () => {
      const guard = new TenantGuard()

      runWithPendingTenant(() => {
        expect(() => guard.canActivate({} as unknown as ExecutionContext)).toThrow(
          /TenantContextMiddleware bu rota için koşmadı/,
        )
      })
    },
  )
})

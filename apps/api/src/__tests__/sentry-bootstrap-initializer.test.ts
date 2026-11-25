// @arkesoft/api — birim testi: `SentryBootstrapInitializer` (ROADMAP v0.0.17,
// T-028/S6, architect K-A28-2)
//
// `../observability/sentry.js` `vi.mock` ile SAHTELENİR (`observability-
// shutdown-order.test.ts`'in BİREBİR gerekçesi — `@sentry/node` yapısal
// import sınırlaması, bu dosya onu DOLAYLI OLARAK BİLE import ETMEZ).
// `BASE_ENV` GERÇEK `parseEnv(apiEnvSchema)` çıktısıdır (`auth-instance-
// export-surface.test.ts`'in emsali) — sahte/elle kurulmuş bir `ApiEnv`
// literalİ İCAT EDİLMEZ.

import { Test } from '@nestjs/testing'
import { parseEnv } from '@arkesoft/config/env'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'

vi.mock('../observability/sentry.js', () => ({
  startSentry: vi.fn(),
}))

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

describe('SentryBootstrapInitializer — açılışta BİR KEZ startSentry(dsn) çağırır', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('env.SENTRY_DSN tanımlıysa startSentry AYNI değerle çağrılır', async () => {
    const { SentryBootstrapInitializer } = await import('../observability/observability.module.js')
    const { startSentry } = await import('../observability/sentry.js')

    // ⚠⚠ DÜZELTME TURU 2/3 (security tur 2 BULGU L3) — host ÖNCEDEN GERÇEK
    // `sentry.io` idi (diğer üç dosyadaki `.invalid` ile TUTARSIZ). Bugün
    // zararsız (`startSentry` `vi.mock` ile TAMAMEN sahtelenmiş, sıfır ağ
    // çağrısı) ama tutarlılık için `.invalid`'e çevrildi.
    const dsn = 'https://examplePublicKey@o0.ingest.sentry.invalid/0'
    const moduleRef = await Test.createTestingModule({
      providers: [
        SentryBootstrapInitializer,
        { provide: API_ENV, useValue: { ...BASE_ENV, SENTRY_DSN: dsn } },
      ],
    }).compile()

    const app = moduleRef.createNestApplication()
    await app.init()

    expect(startSentry).toHaveBeenCalledTimes(1)
    expect(startSentry).toHaveBeenCalledWith({ dsn })

    await app.close()
  })

  it("env.SENTRY_DSN tanımsızsa startSentry YİNE DE ÇAĞRILIR — ama `undefined` dsn ile (NO-OP kararı `startSentry()`'nin kendi işi, S5)", async () => {
    const { SentryBootstrapInitializer } = await import('../observability/observability.module.js')
    const { startSentry } = await import('../observability/sentry.js')

    const moduleRef = await Test.createTestingModule({
      providers: [
        SentryBootstrapInitializer,
        { provide: API_ENV, useValue: { ...BASE_ENV, SENTRY_DSN: undefined } },
      ],
    }).compile()

    const app = moduleRef.createNestApplication()
    await app.init()

    expect(startSentry).toHaveBeenCalledTimes(1)
    expect(startSentry).toHaveBeenCalledWith({ dsn: undefined })

    await app.close()
  })
})

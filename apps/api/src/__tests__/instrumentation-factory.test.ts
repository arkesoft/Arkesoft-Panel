// @arkesoft/api — birim testi: `createArkesoftInstrumentations()` +
// idempotency tutamacı (ROADMAP v0.0.17, T-028/S6, architect K-A28-1/K-A28-4)
//
// ⚠ Bu dosyanın import'u `observability/instrumentation.ts`'in YAN ETKİSİNİ
// (üretim `NodeSDK`'sının BİR KEZ başlatılması) TETİKLER — bu `observability-
// runtime-contract.test.ts`'in (b)/(d) testlerinin AYRI OS süreçlerinde
// ÖLÇTÜĞÜ "sıfır soket" garantisi SAYESİNDE zararsızdır (bu test dosyası
// o garantiyi TEKRAR ÖLÇMEZ, yalnızca fabrika fonksiyonunun SAF davranışını
// test eder).

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis'
import { PrismaInstrumentation } from '@prisma/instrumentation'
import { describe, expect, it } from 'vitest'

import {
  createArkesoftInstrumentations,
  OBSERVABILITY_SDK_GLOBAL_SYMBOL,
  shutdownObservability,
} from '../observability/instrumentation.js'

describe('createArkesoftInstrumentations — üretimin TEK enstrümantasyon kaynağı', () => {
  it('ÜÇ FARKLI örnek döner: Http, IORedis, Prisma — bu SIRADA', () => {
    const [http, ioredis, prisma] = createArkesoftInstrumentations()

    expect(http).toBeInstanceOf(HttpInstrumentation)
    expect(ioredis).toBeInstanceOf(IORedisInstrumentation)
    expect(prisma).toBeInstanceOf(PrismaInstrumentation)
  })

  it('her çağrı YENİ, BİRBİRİNDEN FARKLI örnekler döner (paylaşılan singleton DEĞİL)', () => {
    const first = createArkesoftInstrumentations()
    const second = createArkesoftInstrumentations()

    expect(first[0]).not.toBe(second[0])
    expect(first[1]).not.toBe(second[1])
    expect(first[2]).not.toBe(second[2])
  })
})

describe('instrumentation.ts — idempotency tutamacı (K-A28-4, belgelenmiş Symbol)', () => {
  it("bu modülün importu ÜRETİM SDK'sını globalThis üzerinde BİR KEZ kurar", () => {
    // Modül bu dosyanın en üstündeki import İLE ZATEN yüklendi (ESM modül
    // önbelleği — ikinci bir `import` İKİNCİ bir yan etki ÜRETMEZ). Tutamak
    // `globalThis`'te VAR olmalı.
    const globalWithSdk = globalThis as typeof globalThis &
      Record<typeof OBSERVABILITY_SDK_GLOBAL_SYMBOL, unknown>

    expect(globalWithSdk[OBSERVABILITY_SDK_GLOBAL_SYMBOL]).toBeDefined()
  })

  it('shutdownObservability() birden fazla kez çağrılabilir (fırlatmaz)', async () => {
    await expect(shutdownObservability()).resolves.toBeUndefined()
    await expect(shutdownObservability()).resolves.toBeUndefined()
  })
})

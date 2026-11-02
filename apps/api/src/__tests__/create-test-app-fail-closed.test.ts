// @arkesoft/api — `flushRateLimitCounters`'ın İKİ FAIL-CLOSED kapısının
// negatif testleri (ROADMAP v0.0.8, T-009/S8, kullanıcı onayı ③, borç 1468 —
// güncel ROADMAP satırı silindi, bu dosya onun yerini tutar).
//
// Kapılar `apps/api/src/__tests__/helpers/create-test-app.ts`'in
// `flushRateLimitCounters`'ında (dosya başı yorumu): (a) `process.env.
// NODE_ENV !== 'test'` → fırlat, (b) çözülen Redis host'u (`apiEnv.
// REDIS_URL`) loopback allowlist'inde (`127.0.0.1`/`::1`/`localhost`)
// DEĞİLSE → fırlat.
//
// (a) `process.env.NODE_ENV`'İ GEÇİCİ olarak mutasyona uğratıp `finally`'de
// GERİ ALIR — ÖLÇÜLMÜŞ GEREKÇE (create-test-app.ts dosya başı yorumu):
// `apiEnv.NODE_ENV` override'ı İLK denemede kullanıldı ama `auth-flow.
// test.ts`/`tenant-resolution.test.ts` gibi BAŞKA testleri KIRDI — onlar
// KENDİ (bu kapıyla İLGİSİZ) senaryoları için `apiEnv.NODE_ENV`'i override
// ediyor; bu kapı o override'dan BAĞIMSIZ olmak ZORUNDA. `vitest.config.ts`
// ve bu paketin TÜMÜ `fileParallelism: false` + `sequence.concurrent: false`
// taşıdığı için (bkz. `vitest.config.ts`) bu dosya BAŞKA bir test dosyasıyla
// EŞZAMANLI KOŞMAZ — mutasyon sızıntı riski YOK, ve `finally` GERİ ALIR.
// (b) `apiEnv.REDIS_URL` override'ı — global mutasyonsuz, K-A4/AC6 deseni
// (hiçbir test BU alanı KENDİ senaryosu için override ETMİYOR, ÖLÇÜLDÜ).
//
// MUTASYON KANITI (raporun KARARLAR bölümünde ham çıktıyla): ilgili kapı
// satırı `create-test-app.ts`'ten KALDIRILINCA bu İKİ test KIRMIZI olur
// (ham çıktı koşturulup rapora taşındı, dosya GERİ ALINDI).

import { parseEnv } from '@arkesoft/config/env'
import { afterEach, describe, expect, it } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const ORIGINAL_NODE_ENV = process.env['NODE_ENV']

describe('createTestApp — flushRateLimitCounters FAIL-CLOSED kapıları (T-009/S8, borç 1468)', () => {
  afterEach(() => {
    process.env['NODE_ENV'] = ORIGINAL_NODE_ENV
  })

  it('(a) process.env.NODE_ENV !== "test" → fırlatır, Redis\'e HİÇBİR komut gitmeden', async () => {
    process.env['NODE_ENV'] = 'development'

    await expect(createTestApp()).rejects.toThrow(/NODE_ENV=test ortamında koşabilir/)
  })

  it("(b) Redis host loopback allowlist'inde DEĞİLSE → fırlatır", async () => {
    const nonLoopbackRedisUrl = new URL(BASE_ENV.REDIS_URL)
    nonLoopbackRedisUrl.hostname = 'redis.example.com'

    await expect(
      createTestApp({
        apiEnv: { ...BASE_ENV, REDIS_URL: nonLoopbackRedisUrl.toString() },
      }),
    ).rejects.toThrow(/loopback Redis'e/)
  })
})

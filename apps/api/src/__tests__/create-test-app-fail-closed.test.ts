// @arkesoft/api — `flushRateLimitCounters`'ın ÜÇ FAIL-CLOSED kapısının
// negatif testleri (ROADMAP v0.0.8, T-009/S8, kullanıcı onayı ③, borç 1468 —
// güncel ROADMAP satırı silindi, bu dosya onun yerini tutar. ÜÇÜNCÜ kapı
// T-019/S7, K7).
//
// Kapılar `apps/api/src/__tests__/helpers/create-test-app.ts`'in
// `flushRateLimitCounters`'ında (dosya başı yorumu): (a) `process.env.
// NODE_ENV !== 'test'` → fırlat, (b) çözülen Redis host'u (`apiEnv.
// REDIS_URL`) loopback allowlist'inde (`127.0.0.1`/`::1`/`localhost`)
// DEĞİLSE → fırlat, (c) `platform:test-harness:run-owner` marker'ı BAŞKA
// (YAŞAYAN) bir `process.ppid`'e aitse → fırlat.
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
// (c) marker anahtarı HAM `ioredis` ile (createTestApp() ÜZERİNDEN DEĞİL)
// kurulur/temizlenir — aksi hâlde bootstrap çağrısının KENDİSİ önceki
// koşumlardan kalan bir marker'a çarpıp testin setup'ını kırabilir (ÖLÇÜLDÜ,
// K7'nin teşhis turunda).
//
// MUTASYON KANITI (raporun KARARLAR bölümünde ham çıktıyla): ilgili kapı
// satırı `create-test-app.ts`'ten KALDIRILINCA bu testler KIRMIZI olur
// (ham çıktı koşturulup rapora taşındı, dosya GERİ ALINDI).

import { parseEnv } from '@arkesoft/config/env'
import { Redis } from 'ioredis'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

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

// T-019/S7 EKLEMESİ (K7) — ÜÇÜNCÜ kapı: eşzamanlı koşum tespiti. AYRI
// `describe` (`create-test-app.ts`'in kendi deseni) — marker anahtarı diğer
// İKİ kapının testlerinden TAMAMEN BAĞIMSIZ bir Redis anahtarı
// (`platform:test-harness:run-owner`) olduğu için paylaşılan durum YOK.
describe('createTestApp — flushRateLimitCounters ÜÇÜNCÜ FAIL-CLOSED kapısı (T-019/S7, K7)', () => {
  const RUN_OWNER_KEY = 'platform:test-harness:run-owner'
  const rawRedis = new Redis(BASE_ENV.REDIS_URL)

  beforeEach(async () => {
    await rawRedis.del(RUN_OWNER_KEY)
  })

  afterAll(async () => {
    await rawRedis.del(RUN_OWNER_KEY)
    rawRedis.disconnect()
  })

  it('marker YABANCI + CANLI bir ppid taşıyorsa → fırlatır (ÖLÇÜLMÜŞ çapraz-koşum kirlenmesi)', async () => {
    // `process.pid` — BU vitest worker'ının KENDİ süreci: KESİNLİKLE YAŞIYOR
    // ve `process.ppid`'den (koşum kimliği) FARKLI.
    const foreignButAliveMarker = String(process.pid)
    expect(foreignButAliveMarker).not.toBe(String(process.ppid))

    await rawRedis.set(RUN_OWNER_KEY, foreignButAliveMarker, 'EX', 120)

    await expect(createTestApp()).rejects.toThrow(/BAŞKA BİR test koşumu/)
  }, 20_000)

  it("marker YABANCI + ÖLÜ bir ppid taşıyorsa → SESSİZCE devralır (fırlamaz), kendi ppid'ini yazar", async () => {
    const deadForeignMarker = '999999' // gerçek PID aralığının çok üstünde, kesinlikle YOK.
    await rawRedis.set(RUN_OWNER_KEY, deadForeignMarker, 'EX', 120)

    const recoveredApp = await createTestApp()
    await recoveredApp.app.close()

    await expect(rawRedis.get(RUN_OWNER_KEY)).resolves.toBe(String(process.ppid))
  }, 20_000)

  it("marker YOKKEN normal şekilde kurulur ve KENDİ ppid'ini yazar", async () => {
    const app = await createTestApp()
    await app.app.close()

    await expect(rawRedis.get(RUN_OWNER_KEY)).resolves.toBe(String(process.ppid))
  }, 20_000)
})

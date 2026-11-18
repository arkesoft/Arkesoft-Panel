// @arkesoft/api — test harness Redis bağlantısının `commandTimeout` PİNİ
// (ROADMAP v0.1.0, T-019 düzeltme turu 5, `solid` tur 2 M-A)
//
// NEDEN BU DOSYA VAR: `create-test-redis-connection.ts:108`
// (`client.options.commandTimeout = TEST_HARNESS_REDIS_COMMAND_TIMEOUT_MS`)
// `Q-1`'in TÜM çözümünü taşıyan tek satırdı ve SIFIR pini vardı —
// `TEST_HARNESS_REDIS_COMMAND_TIMEOUT_MS` repo kökünde yalnızca KENDİ
// dosyasında iki kez geçiyordu (tanım + atama). O satır silinse `lint`/
// `typecheck`/tüm süit YEŞİL kalırdı; tek belirti flake'in GERİ DÖNMESİ
// olurdu — ve o da ancak yük altında, olasılıksal olarak gözlenir. `Q-1`
// DÖRT düzeltme turu ve BİR kullanıcı kararı (CLAUDE.md §4.5 tetikleyici 4,
// üç-tur sınırı aşıldı) pahasına kapandı; bu dosya o çözümü KORUYOR.
//
// ⭐ İKİ DEĞER, İKİ AYRI PİN, İKİSİ DE GEREKLİ:
//   - Bu dosya: test harness'ının `commandTimeout`'u GERÇEKTEN 4000'e
//     yükselttiğini pinler (`create-test-redis-connection.ts`'in davranışı).
//   - `redis-connection-profiles.test.ts:93-100,254-259`: PRODUCTION'ın
//     `'health'` profilinin 1500'de KALDIĞINI (DEĞİŞMEDİĞİNİ) zaten pinler
//     (R-A4, `solid` tur 2'de doğrulandı) — burada TEKRARLANMIYOR.
//   Harness 4000, production 1500 — ikisi AYRI alanlar (bir istemci örneğinin
//   `options.commandTimeout`'u çalışma zamanında SONRADAN mutasyona
//   uğruyor, `buildRedisConnectionOptions('health')`'in dönüş değeri
//   DEĞİŞMİYOR) ve ikisi de pinli; biri eksik kalsaydı diğeri bu
//   regresyonu YAKALAYAMAZDI.
//
// ⚠ GERÇEK REDIS'E DOKUNULMAZ: `redis-connection-profiles.test.ts`'in
// deseni BİREBİR kopyalanır — `DEAD_REDIS_URL` (dinlenmeyen loopback
// portu), istemci kurulduktan sonra `options` okunur ve hemen
// `disconnect()` edilir.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { Redis } from 'ioredis'

import {
  createTestHarnessRedisConnection,
  TEST_HARNESS_REDIS_COMMAND_TIMEOUT_MS,
} from './helpers/create-test-redis-connection.js'
import type { RedisConnectionLogger } from '../redis/create-redis-connection.js'

/** Hiçbir şeyin dinlemediği loopback portu — bağlantı reddedilir, sunucuya dokunulmaz. */
const DEAD_REDIS_URL = 'redis://127.0.0.1:1'

type LoggerSpy = { readonly warn: Mock<RedisConnectionLogger['warn']> }

function createLoggerSpy(): LoggerSpy {
  return { warn: vi.fn<RedisConnectionLogger['warn']>() }
}

const openedClients: Redis[] = []

afterEach(() => {
  while (openedClients.length > 0) {
    openedClients.pop()?.disconnect()
  }
})

describe('createTestHarnessRedisConnection — commandTimeout PİNİ (solid tur 2 M-A)', () => {
  it("YARATTIĞI istemcinin `commandTimeout`'u ÖLÇÜLEN 4000 sabitiyle TAM eşleşir", () => {
    const client = createTestHarnessRedisConnection(DEAD_REDIS_URL, createLoggerSpy())
    openedClients.push(client)

    // Sabitin KENDİSİ 4000 — regresyon sabit değerin kazara değişmesini de yakalar.
    expect(TEST_HARNESS_REDIS_COMMAND_TIMEOUT_MS).toBe(4000)
    // Yaratılan istemcinin ÇALIŞMA ZAMANI seçeneği gerçekten bu değere mutasyona uğramış.
    expect(client.options.commandTimeout).toBe(4000)
  })

  it("'health' profilinin DİĞER üç seçeneği (maxRetriesPerRequest, connectTimeout, retryStrategy) DOKUNULMADAN kalır", () => {
    // ⚠ Bu test harness'ın DAR değişim yüzeyini (dosya başı yorumu: "Değişim
    // yüzeyi KASITLI OLARAK tek alana (commandTimeout) DAR tutuldu") pinler —
    // bir sonraki ajan `connectTimeout`'u da büyütmeye kalkışırsa bu kırılır.
    const client = createTestHarnessRedisConnection(DEAD_REDIS_URL, createLoggerSpy())
    openedClients.push(client)

    expect(client.options.maxRetriesPerRequest).toBe(1)
    expect(client.options.connectTimeout).toBe(2000)
    expect(client.options.retryStrategy).toBeTypeOf('function')
  })
})

// @arkesoft/api — Redis bağlantı profilleri PİN testi (ROADMAP v0.0.11,
// T-013/S3, architect K1.a)
//
// NE PİNLİYOR: `createRedisConnection`'ın iki profilinin TAM seçenek kümesi.
// Bu test "değer doğru mu" diye değil, "değer kümesi TAM OLARAK bu mu" diye
// sorar — çünkü bu sürümün kusur sınıfı BEYAN ile GERÇEKLİK arasındaki
// boşluktur:
//
//   - `'queue'` profiline bir `commandTimeout` eklenirse BullMQ'nun bloke
//     eden komutları (`BZPOPMIN`/`BRPOPLPUSH`) SİSTEMATİK olarak düşer. Hiçbir
//     tip hatası, hiçbir lint uyarısı bunu yakalamaz — yalnızca bu test.
//   - `'health'` profilinin bir değeri "tutarlılık için" değişirse R-A4 (sıfır
//     davranış değişikliği) sessizce ihlal edilir.
//   - `connectionName` şeması değişirse AC9'un `CLIENT LIST` ölçümü (S7)
//     "0 bağlantı" görür ve YANLIŞ YEŞİL verir.
//
// ⚠ ANAHTAR KÜMESİ assert'i KASITLI: `ioredis`'in `RedisOptions` yüzeyinde
// bir yazım hatası (`comandTimeout`) tipte yakalanmayabilir; `Object.keys`
// karşılaştırması hem FAZLA hem EKSİK anahtarı yakalar.
//
// ⚠ GERÇEK REDIS'E DOKUNULMAZ: fabrika testleri `DEAD_REDIS_URL`
// (dinlenmeyen loopback portu) kullanır ve istemciyi hemen `disconnect()`
// eder. Gerekçe iki yönlü — (a) bu dosya paylaşılan `arkesoft-redis`
// örneğinde hiçbir anahtar oluşturmaz/silmez, (b) ölçülen şey `ioredis`'in
// BİRLEŞTİRDİĞİ seçenek nesnesi, bunun için sunucuya ihtiyaç yok.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { Redis, RedisOptions } from 'ioredis'

import {
  buildQueueConnectionName,
  buildRedisConnectionOptions,
  createRedisConnection,
  redisRetryStrategy,
} from '../redis/create-redis-connection.js'
import { createHealthRedisConnection } from '../redis/redis.module.js'
import type {
  RedisConnectionLogger,
  RedisConnectionProfile,
} from '../redis/create-redis-connection.js'

/** Hiçbir şeyin dinlemediği loopback portu — bağlantı reddedilir, sunucuya dokunulmaz. */
const DEAD_REDIS_URL = 'redis://127.0.0.1:1'

/**
 * Profil seçeneklerini `RedisOptions` okuma yüzeyine GENİŞLETİR. İki amaç:
 * (a) iki profil aynı yüzeyle incelenebilir (dar birleşimde `.commandTimeout`
 * okumak tip hatası olurdu), (b) bu atama TİP DÜZEYİNDE ikinci bir kapıdır —
 * profil anahtarlarının gerçekten `ioredis` alanları olduğunu kanıtlar.
 */
function profileOptions(profile: RedisConnectionProfile): RedisOptions {
  return buildRedisConnectionOptions(profile)
}

/**
 * Fabrikanın throttle'lı `'error'` dinleyicisini ölçmek için logger ikizi.
 * `RedisConnectionLogger['warn']` ile TİPLİ — imza değişirse test derlenmez.
 */
type LoggerSpy = { readonly warn: Mock<RedisConnectionLogger['warn']> }

function createLoggerSpy(): LoggerSpy {
  return { warn: vi.fn<RedisConnectionLogger['warn']>() }
}

const openedClients: Redis[] = []

function openConnection(profile: RedisConnectionProfile, logger: LoggerSpy): Redis {
  const client = createRedisConnection({ url: DEAD_REDIS_URL, profile, logger })
  openedClients.push(client)
  return client
}

afterEach(() => {
  // Önce `Date.now` gibi global casuslar geri alınır, SONRA bağlantılar
  // kapatılır — `disconnect()` sahte bir saatle koşmasın.
  vi.restoreAllMocks()
  while (openedClients.length > 0) {
    openedClients.pop()?.disconnect()
  }
})

describe("buildRedisConnectionOptions — 'health' profili (R-A4: v0.0.4 ile BİREBİR)", () => {
  it('TAM OLARAK dört seçenek taşır, fazlası yok', () => {
    expect(Object.keys(profileOptions('health')).sort()).toEqual([
      'commandTimeout',
      'connectTimeout',
      'maxRetriesPerRequest',
      'retryStrategy',
    ])
  })

  it('dört değeri v0.0.4 `redis.module.ts`’indeki satır içi değerlerin aynısıdır', () => {
    const options = profileOptions('health')

    expect(options.maxRetriesPerRequest).toBe(1)
    expect(options.commandTimeout).toBe(1500)
    expect(options.connectTimeout).toBe(2000)
    expect(options.retryStrategy).toBe(redisRetryStrategy)
  })

  it('`connectionName` TAŞIMAZ — eklemek fazladan CLIENT SETNAME üretirdi (R-A4)', () => {
    expect('connectionName' in profileOptions('health')).toBe(false)
  })

  it('`enableReadyCheck` TAŞIMAZ — `ioredis` varsayılanı (açık) korunur', () => {
    expect('enableReadyCheck' in profileOptions('health')).toBe(false)
  })
})

describe("buildRedisConnectionOptions — 'queue' profili (BullMQ bloke eden komutlar)", () => {
  it('TAM OLARAK dört seçenek taşır, fazlası yok', () => {
    expect(Object.keys(profileOptions('queue')).sort()).toEqual([
      'connectionName',
      'enableReadyCheck',
      'maxRetriesPerRequest',
      'retryStrategy',
    ])
  })

  it('`maxRetriesPerRequest` BullMQ’nun şart koştuğu gibi tam olarak `null`’dır', () => {
    const value = profileOptions('queue').maxRetriesPerRequest

    expect(value).toBeNull()
    // Yakın kaçırmalar: `0` ve `undefined` ikisi de `null` DEĞİL ve BullMQ’yu
    // kırar (`undefined` → `ioredis` varsayılanı 20).
    expect(value).not.toBe(0)
    expect(value).not.toBeUndefined()
  })

  it('`commandTimeout` TANIMSIZDIR — anahtar HİÇ YOK (bloke eden komutlar yaşar)', () => {
    const options = profileOptions('queue')

    expect('commandTimeout' in options).toBe(false)
    expect(options.commandTimeout).toBeUndefined()
  })

  it('`enableReadyCheck` kapalıdır', () => {
    expect(profileOptions('queue').enableReadyCheck).toBe(false)
  })

  it('`connectionName` süreç pid’ini İÇERİR ve S7’nin aradığı şemadadır', () => {
    const connectionName = profileOptions('queue').connectionName

    expect(connectionName).toBe(`arkesoft-worker-${String(process.pid)}`)
    expect(connectionName).toContain(String(process.pid))
  })

  it('`buildQueueConnectionName` sentetik pid için de aynı şemayı üretir', () => {
    // Yakın kaçırmalar: pid’siz (`arkesoft-worker`) veya yanlış önekli
    // (`arkesoft-api-...`) bir ad AC9 ölçümünü sessizce sıfırlar.
    expect(buildQueueConnectionName(4242)).toBe('arkesoft-worker-4242')
    expect(buildQueueConnectionName(1)).toBe('arkesoft-worker-1')
  })
})

describe('redisRetryStrategy — üst SINIRLI backoff, jitter YOK', () => {
  it('deneme sayısına göre tam değerleri döner ve 2000ms’de SATÜRE OLUR', () => {
    const table: readonly (readonly [number, number])[] = [
      [1, 200],
      [5, 1000],
      [9, 1800],
      [10, 2000],
      // Sınırın hemen üstü ve çok üstü: ikisi de ÜST SINIRA kırpılır.
      [11, 2000],
      [100, 2000],
    ]

    for (const [attempt, expectedDelay] of table) {
      expect(redisRetryStrategy(attempt)).toBe(expectedDelay)
    }
  })

  it('deterministiktir — `ioredis` varsayılanının jitter’ı SIZMAMIŞTIR', () => {
    // `ioredis`'in varsayılan stratejisi `+ rastgele(0..199)` ekler ve 5000ms’ye
    // kadar çıkar; aynı girdi iki kez FARKLI sonuç verirdi.
    expect(redisRetryStrategy(3)).toBe(redisRetryStrategy(3))
    expect(redisRetryStrategy(100)).toBeLessThanOrEqual(2000)
  })

  it('`null`/`undefined` DÖNDÜRMEZ — yeniden deneme asla durdurulmaz (K-A8)', () => {
    for (const attempt of [1, 2, 50, 1000]) {
      expect(typeof redisRetryStrategy(attempt)).toBe('number')
    }
  })
})

describe('createRedisConnection — seçenekler istemciye GERÇEKTEN uygulanıyor', () => {
  it("'health' istemcisinin etkin seçenekleri profille birebir eşleşir", () => {
    const client = openConnection('health', createLoggerSpy())

    expect(client.options.maxRetriesPerRequest).toBe(1)
    expect(client.options.commandTimeout).toBe(1500)
    expect(client.options.connectTimeout).toBe(2000)
    // Kimlik karşılaştırması: fabrikanın BİZİM stratejimizi geçirdiğinin
    // kanıtı — `ioredis` varsayılanı farklı bir fonksiyon nesnesidir.
    expect(client.options.retryStrategy).toBe(redisRetryStrategy)
    // `ioredis` varsayılanı: isim verilmemiş bağlantı.
    expect(client.options.connectionName).toBeNull()
  })

  it("'queue' istemcisinin etkin seçenekleri profille birebir eşleşir", () => {
    const client = openConnection('queue', createLoggerSpy())

    expect(client.options.maxRetriesPerRequest).toBeNull()
    expect(client.options.commandTimeout).toBeUndefined()
    expect(client.options.enableReadyCheck).toBe(false)
    expect(client.options.connectionName).toBe(`arkesoft-worker-${String(process.pid)}`)
    expect(client.options.retryStrategy).toBe(redisRetryStrategy)
  })

  it("her iki profil de ZORUNLU 'error' dinleyicisini kaydeder (süreç çökmez)", () => {
    for (const profile of ['health', 'queue'] as const) {
      const client = openConnection(profile, createLoggerSpy())
      expect(client.listenerCount('error')).toBe(1)
    }
  })

  it("'error' logu THROTTLE’lıdır: pencere içinde ikinci olay loglanmaz", () => {
    const logger = createLoggerSpy()
    const client = openConnection('health', logger)
    const nowSpy = vi.spyOn(Date, 'now')

    nowSpy.mockReturnValue(1_000_000)
    client.emit('error', new Error('birinci'))
    nowSpy.mockReturnValue(1_009_999)
    client.emit('error', new Error('ikinci'))

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      { causeCode: undefined, causeMessage: 'birinci' },
      'redis bağlantı hatası',
    )

    // Pencere dolduktan sonra yeniden loglar — susturma KALICI DEĞİL.
    nowSpy.mockReturnValue(1_010_000)
    client.emit('error', new Error('üçüncü'))
    expect(logger.warn).toHaveBeenCalledTimes(2)
  })

  it('boş mesajlı `AggregateError`’da gerçek nedene iner (v0.0.5 S-8 düzeltmesi korunur)', () => {
    const logger = createLoggerSpy()
    const client = openConnection('queue', logger)

    client.emit('error', new AggregateError([new Error('ECONNREFUSED 127.0.0.1:1')], ''))

    expect(logger.warn).toHaveBeenCalledWith(
      { causeCode: undefined, causeMessage: 'ECONNREFUSED 127.0.0.1:1' },
      'redis bağlantı hatası',
    )
  })
})

describe("RedisModule provider fabrikası — 'health' profiline BAĞLI (R-A4)", () => {
  it('v0.0.4 davranışını kuran profili seçer, kuyruk profilini DEĞİL', () => {
    const client = createHealthRedisConnection({ REDIS_URL: DEAD_REDIS_URL }, createLoggerSpy())
    openedClients.push(client)

    expect(client.options.commandTimeout).toBe(1500)
    expect(client.options.maxRetriesPerRequest).toBe(1)
    expect(client.options.connectTimeout).toBe(2000)
    // ⚠ Profil sessizce `'queue'`a kaysa bu üç değer de bozulurdu ve
    // `/health/ready` kapalı Redis'te 503 yerine ASILI kalırdı. `null`
    // (isimsiz bağlantı) `'queue'`un pid'li adından ayırt eden dördüncü işaret.
    expect(client.options.connectionName).toBeNull()
  })
})

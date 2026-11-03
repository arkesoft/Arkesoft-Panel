// @arkesoft/api — AC10 kapısının kendi testi (ROADMAP v0.0.11, T-013/S4)
//
// Kapı: `helpers/assert-queue-capable-redis.ts` (gerekçe ve tasarım orada).
//
// ⚠⚠ CONFIG'in YAZMA alt komutu HİÇ ÇAĞRILMIYOR. Gerçek Redis yapılandırması
// — ne geçici ne kalıcı — DEĞİŞTİRİLMEZ. Gerekçeler: (1) S3 aynı Redis'i
// paylaşıyor, (2) örnek kullanıcının yerel altyapısı. Kapının KIRMIZI yolu bu
// yüzden SAHTE `CONFIG GET` yanıtı veren bir okuyucu enjekte edilerek
// kanıtlanır; kapı zaten yalnızca bir okuyucu yüzeyi
// (`QueueRedisConfigReader`) tüketiyor ve o yüzey alt komutu tip seviyesinde
// `'GET'`'e sabitliyor.
//
// ⚠ LİTERAL-JETON KURALI (AGENT_BASELINE §5): bu iddianın denetimi
// `rg -i "CONFIG" + boşluk + "SET"` ile yapılıyor → jeton çifti bu dosyada
// BİTİŞİK YAZILMAZ; aksi hâlde denetim kendi yorumunu bulup KALICI YANLIŞ
// POZİTİF üretir (T-013/S2'nin "tek tablo" deseninde fiilen yaşandı).
//
// SENTETİK VAKALAR YAKIN-KAÇIRMA İÇERİR (bu sürümün kusur sınıfı reçetesi,
// S2'nin dokuz mutasyonu emsal): `'YES'`, `' yes'`, `'yes '`, `''`, `'yess'`,
// ve anahtarın HİÇ DÖNMEMESİ. Kapı hepsinde KIRMIZI olmak zorunda — özellikle
// son durumda (fail-closed), sessizce GEÇMEMELİ.
//
// POZİTİF YOL GERÇEK REDIS'E KARŞI koşuyor (`REDIS_URL`): kapı yalnızca
// sentetik veriyle sınanırsa "beyan ile gerçeklik arasındaki boşluk" kusurunu
// kapının KENDİSİ taşır. ⚠ Bu test, homebrew Redis örneği 6379'u kaparsa
// KASITLI OLARAK kırmızı verir — hata değil, TASARIM (R-A8).
//
// ⚠ TAM ÇIKTI ASSERT'İ: hata mesajının TAMAMI bir testte birebir
// karşılaştırılıyor ("tam çıktı assert'i" reçetesi) — mesaj metni değişirse
// test kırılır ve değişiklik bilinçli olmak zorunda (`docs`/S9 bu metni
// `development.md`'ye alacak).

import { parseEnv } from '@arkesoft/config/env'
import { Redis } from 'ioredis'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'
import { assertQueueCapableRedis } from './helpers/assert-queue-capable-redis.js'
import type { QueueRedisConfigReader } from './helpers/assert-queue-capable-redis.js'

const ORIGINAL_NODE_ENV = process.env['NODE_ENV']

/** Sahte yanıtın şekli — kapı RESP2 çift dizisini ve RESP3 eşlemesini de tanımalı. */
type FakeReplyShape = 'resp2' | 'resp3' | 'unrecognized'

type FakeConfigReader = {
  readonly reader: QueueRedisConfigReader
  /** Kapının gerçekten İSTEDİĞİ parametreler (sırasıyla) — gözlemlenebilirlik için. */
  readonly requested: readonly string[]
}

/**
 * `CONFIG GET` yanıtını sentetik olarak üretir. `values` içinde BULUNMAYAN bir
 * parametre için Redis'in gerçek davranışı taklit edilir: BOŞ yanıt.
 */
function createFakeConfigReader(
  values: Readonly<Record<string, string>>,
  shape: FakeReplyShape = 'resp2',
): FakeConfigReader {
  const requested: string[] = []

  const reader: QueueRedisConfigReader = {
    config: (_subcommand: 'GET', parameter: string): Promise<unknown> => {
      requested.push(parameter)

      if (shape === 'unrecognized') {
        return Promise.resolve(null)
      }

      const value = values[parameter]

      if (value === undefined) {
        return Promise.resolve(shape === 'resp3' ? {} : [])
      }

      return Promise.resolve(shape === 'resp3' ? { [parameter]: value } : [parameter, value])
    },
  }

  return { reader, requested }
}

/** Kapıyı GEÇEN sentetik taban — tek bir alanı bozarak yakın-kaçırma üretilir. */
const QUEUE_CAPABLE_VALUES: Readonly<Record<string, string>> = {
  appendonly: 'yes',
  'maxmemory-policy': 'noeviction',
  save: '60 1',
}

describe('assertQueueCapableRedis — AC10 kuyruk-yetenekli Redis kapısı (T-013/S4)', () => {
  afterEach(() => {
    process.env['NODE_ENV'] = ORIGINAL_NODE_ENV
  })

  describe('(a) NODE_ENV fail-closed kapısı — İLK satır', () => {
    it('NODE_ENV !== "test" ise fırlatır ve Redis\'e HİÇBİR CONFIG GET gitmez', async () => {
      process.env['NODE_ENV'] = 'production'
      const fake = createFakeConfigReader(QUEUE_CAPABLE_VALUES)

      await expect(assertQueueCapableRedis(fake.reader)).rejects.toThrow(
        /yalnızca NODE_ENV=test ortamında koşabilir/,
      )
      expect(fake.requested).toEqual([])
    })

    it('ölçülen NODE_ENV değerini hata mesajına yazar', async () => {
      process.env['NODE_ENV'] = 'development'
      const fake = createFakeConfigReader(QUEUE_CAPABLE_VALUES)

      await expect(assertQueueCapableRedis(fake.reader)).rejects.toThrow(
        'ölçülen process.env.NODE_ENV: development',
      )
    })
  })

  describe('(b) POZİTİF YOL — GERÇEK Redis (REDIS_URL)', () => {
    const redisUrl = parseEnv(apiEnvSchema).REDIS_URL
    let client: Redis

    beforeAll(() => {
      client = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        commandTimeout: 1500,
        connectTimeout: 2000,
      })
      // ZORUNLU dinleyici (`redis/redis.module.ts` dosya başı yorumu):
      // dinleyicisiz bir `'error'` olayı süreci düşürür. Burada yutulmuyor —
      // bağlantı arızası `CONFIG GET` reddiyle testi KIRMIZI yapar.
      client.on('error', () => undefined)
    })

    afterAll(async () => {
      await client.quit()
    })

    it('canlı Redis kuyruk-yetenekli → geçer ve ölçülen değerleri döner', async () => {
      const measurement = await assertQueueCapableRedis(client)

      expect(measurement.get('appendonly')).toBe('yes')
      expect(measurement.get('maxmemory-policy')).toBe('noeviction')
      // `save` ASSERT EDİLMİYOR — yalnızca ÖLÇÜLDÜĞÜ doğrulanıyor.
      expect(measurement.has('save')).toBe(true)
    })

    it('ioredis istemcisi okuyucu yüzeyini YAPISAL olarak karşılıyor (tip pini)', () => {
      const reader: QueueRedisConfigReader = client
      expect(typeof reader.config).toBe('function')
    })
  })

  describe('(c) YAKIN-KAÇIRMA sentetik vakaları — hepsi KIRMIZI olmak zorunda', () => {
    const nearMissCases: readonly {
      readonly name: string
      readonly values: Readonly<Record<string, string>>
      readonly expectedFragment: string
    }[] = [
      {
        name: "appendonly='no' (homebrew varsayılanı, ÖLÇÜLDÜ)",
        values: { ...QUEUE_CAPABLE_VALUES, appendonly: 'no' },
        expectedFragment: "appendonly: beklenen 'yes', ölçülen 'no'",
      },
      {
        name: "appendonly='YES' (büyük harf — normalizasyon YOK)",
        values: { ...QUEUE_CAPABLE_VALUES, appendonly: 'YES' },
        expectedFragment: "appendonly: beklenen 'yes', ölçülen 'YES'",
      },
      {
        name: "appendonly=' yes' (baştaki boşluk — kırpma YOK)",
        values: { ...QUEUE_CAPABLE_VALUES, appendonly: ' yes' },
        expectedFragment: "appendonly: beklenen 'yes', ölçülen ' yes'",
      },
      {
        name: "appendonly='yes ' (sondaki boşluk — kırpma YOK)",
        values: { ...QUEUE_CAPABLE_VALUES, appendonly: 'yes ' },
        expectedFragment: "appendonly: beklenen 'yes', ölçülen 'yes '",
      },
      {
        name: "appendonly='' (BOŞ dize — eksik anahtardan AYRI gösterilir)",
        values: { ...QUEUE_CAPABLE_VALUES, appendonly: '' },
        expectedFragment: "appendonly: beklenen 'yes', ölçülen ''",
      },
      {
        name: "appendonly='yess' (bir harf fazla)",
        values: { ...QUEUE_CAPABLE_VALUES, appendonly: 'yess' },
        expectedFragment: "appendonly: beklenen 'yes', ölçülen 'yess'",
      },
      {
        name: 'appendonly anahtarı HİÇ DÖNMÜYOR (boş CONFIG GET yanıtı)',
        values: { 'maxmemory-policy': 'noeviction', save: '60 1' },
        expectedFragment:
          "appendonly: beklenen 'yes', ölçülen <CONFIG GET hiçbir değer döndürmedi>",
      },
      {
        name: "maxmemory-policy='allkeys-lru' (eviction AÇIK — anahtarlar silinebilir)",
        values: { ...QUEUE_CAPABLE_VALUES, 'maxmemory-policy': 'allkeys-lru' },
        expectedFragment: "maxmemory-policy: beklenen 'noeviction', ölçülen 'allkeys-lru'",
      },
      {
        name: "maxmemory-policy='NOEVICTION' (büyük harf)",
        values: { ...QUEUE_CAPABLE_VALUES, 'maxmemory-policy': 'NOEVICTION' },
        expectedFragment: "maxmemory-policy: beklenen 'noeviction', ölçülen 'NOEVICTION'",
      },
      {
        name: "maxmemory-policy='noeviction ' (sondaki boşluk)",
        values: { ...QUEUE_CAPABLE_VALUES, 'maxmemory-policy': 'noeviction ' },
        expectedFragment: "maxmemory-policy: beklenen 'noeviction', ölçülen 'noeviction '",
      },
      {
        name: 'maxmemory-policy anahtarı HİÇ DÖNMÜYOR',
        values: { appendonly: 'yes', save: '60 1' },
        expectedFragment:
          "maxmemory-policy: beklenen 'noeviction', ölçülen <CONFIG GET hiçbir değer döndürmedi>",
      },
      {
        name: 'HİÇBİR anahtar dönmüyor (tamamen boş yanıt)',
        values: {},
        expectedFragment:
          "appendonly: beklenen 'yes', ölçülen <CONFIG GET hiçbir değer döndürmedi>",
      },
    ]

    it.each(nearMissCases)('$name → fırlatır', async ({ values, expectedFragment }) => {
      const fake = createFakeConfigReader(values)

      await expect(assertQueueCapableRedis(fake.reader)).rejects.toThrow(expectedFragment)
    })

    it('İKİ zorunlu ayar da bozuksa mesaj İKİSİNİ de listeler', async () => {
      const fake = createFakeConfigReader({
        appendonly: 'no',
        'maxmemory-policy': 'allkeys-lru',
        save: '',
      })

      const error = await assertQueueCapableRedis(fake.reader).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(Error)
      const message = error instanceof Error ? error.message : ''
      expect(message).toContain("appendonly: beklenen 'yes', ölçülen 'no'")
      expect(message).toContain("maxmemory-policy: beklenen 'noeviction', ölçülen 'allkeys-lru'")
    })
  })

  describe("(d) 'save' ASSERT EDİLMİYOR — yalnızca raporlanıyor", () => {
    it('save HİÇ DÖNMESE bile kapı GEÇER (assert edilmiyor)', async () => {
      const fake = createFakeConfigReader({ appendonly: 'yes', 'maxmemory-policy': 'noeviction' })

      const measurement = await assertQueueCapableRedis(fake.reader)

      expect(measurement.get('save')).toBeUndefined()
    })

    it('save DEĞERİ apayrı olsa bile kapı GEÇER (imajlar arasında meşru değişir)', async () => {
      const fake = createFakeConfigReader({
        ...QUEUE_CAPABLE_VALUES,
        save: '3600 1 300 100 60 10000',
      })

      const measurement = await assertQueueCapableRedis(fake.reader)

      expect(measurement.get('save')).toBe('3600 1 300 100 60 10000')
    })

    it('ama BAŞKA bir ayar bozulduğunda save hata mesajında RAPORLANIR', async () => {
      const fake = createFakeConfigReader({ ...QUEUE_CAPABLE_VALUES, appendonly: 'no' })

      await expect(assertQueueCapableRedis(fake.reader)).rejects.toThrow("save='60 1'")
    })
  })

  describe('(e) Yanıt ŞEKLİ — tanınmayan şekil de FAIL-CLOSED', () => {
    it('RESP3 eşlemesi (nesne) tanınıyor ve kapı GEÇİYOR', async () => {
      const fake = createFakeConfigReader(QUEUE_CAPABLE_VALUES, 'resp3')

      const measurement = await assertQueueCapableRedis(fake.reader)

      expect(measurement.get('appendonly')).toBe('yes')
    })

    it('RESP3 eşlemesinde bozuk değer de KIRMIZI veriyor', async () => {
      const fake = createFakeConfigReader({ ...QUEUE_CAPABLE_VALUES, appendonly: 'no' }, 'resp3')

      await expect(assertQueueCapableRedis(fake.reader)).rejects.toThrow(
        "appendonly: beklenen 'yes', ölçülen 'no'",
      )
    })

    it('tanınmayan yanıt (null) sessizce GEÇMİYOR, fırlatıyor', async () => {
      const fake = createFakeConfigReader(QUEUE_CAPABLE_VALUES, 'unrecognized')

      await expect(assertQueueCapableRedis(fake.reader)).rejects.toThrow(
        /CONFIG GET appendonly yanıtının şekli tanınmadı/,
      )
    })
  })

  describe('(f) Kapı YALNIZCA OKUYOR — istenen parametreler pinli', () => {
    it("tam olarak üç parametre isteniyor, sırasıyla; 'GET' dışında alt komut YOK", async () => {
      const fake = createFakeConfigReader(QUEUE_CAPABLE_VALUES)

      await assertQueueCapableRedis(fake.reader)

      expect(fake.requested).toEqual(['appendonly', 'maxmemory-policy', 'save'])
    })
  })

  describe('(g) TAM hata mesajı — birebir', () => {
    it('kanonik kırmızı vakanın mesajı TAMAMEN eşleşiyor', async () => {
      const fake = createFakeConfigReader({ ...QUEUE_CAPABLE_VALUES, appendonly: 'no' })

      const expectedMessage = [
        'assertQueueCapableRedis: kuyruk testleri KUYRUK OLARAK YAPILANDIRILMIŞ bir Redis gerektirir — fail-closed kapı tetiklendi (AC10).',
        '',
        'Karşılanmayan zorunlu ayarlar:',
        "  - appendonly: beklenen 'yes', ölçülen 'no'",
        '',
        "Ölçülen tüm değerler: appendonly='no' · maxmemory-policy='noeviction' · save='60 1'",
        "Not: 'save' ASSERT EDİLMEZ, yalnızca teşhis için raporlanır.",
        '',
        'Olası sebep: REDIS_URL, kuyruk için yapılandırılmamış BAŞKA bir Redis örneğine çözülüyor (homebrew redis-server varsayılanı appendonly=no).',
        "Çözüm: (1) host örneğini durdur — brew services stop redis · (2) compose Redis'ini ayağa kaldır — pnpm infra:up · (3) 6379'da tek dinleyici kaldığını doğrula — lsof -nP -iTCP:6379 -sTCP:LISTEN",
      ].join('\n')

      const error = await assertQueueCapableRedis(fake.reader).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(Error)
      expect(error instanceof Error ? error.message : '').toBe(expectedMessage)
    })
  })
})

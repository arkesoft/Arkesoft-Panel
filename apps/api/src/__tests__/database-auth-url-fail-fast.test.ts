// @arkesoft/api — `DATABASE_AUTH_URL` koşulsuz fail-fast testi (ROADMAP
// v0.0.14.1, T-015/ST-F, architect "KARAR — DATABASE_AUTH_URL: şema,
// fail-fast, anti-fallback", AC3-c1)
//
// ⚠ BU TEST TEK BAŞINA YETERSİZDİR — yük `database-auth-url-anti-fallback
// .test.ts`'teki c2'dedir (architect'in kendi değerlendirmesi, Task dosyası
// T-015, KARAR bloğu, birebir alıntı): "Zod'da zorunlu yapmak 'yoksa düşer'i
// Zod'a devreder ve fallback hakkında hiçbir şey kanıtlamaz; ayrıca 'sıfır
// olmayan çıkış' Postgres kapalıyken de olur." `env.DATABASE_AUTH_URL ??
// env.DATABASE_URL` yazılmış olsaydı da bu test AYNI ŞEKİLDE geçerdi —
// `??`'nin sağ tarafı yalnızca SOL TARAF `undefined` olduğunda devreye
// girer, ama BURADAKİ `undefined`'ı üreten zaten `DATABASE_AUTH_URL`'in
// KENDİSİ eksik olması; `??` koyulsa bile Zod şemasının zorunluluğu
// `apiEnvSchema.extend({ DATABASE_AUTH_URL: ... })` seviyesinde kalır ve
// AYNI fırlatma gerçekleşirdi. Bu yüzden bu dosya YALNIZCA "env yoksa açılış
// sıfır olmayan kodla düşer ve hata metni değişken adını içerir" maddesini
// (AC3) doğrular — anti-fallback kanıtı DEĞİLDİR.
//
// `process.env` MUTASYONU YOK (ve `delete`'e gerek YOK): `parseEnv`'in
// ikinci (opsiyonel) `source` parametresi kullanılır — gerçek ortamdan
// türetilmiş bir KOPYA nesne üzerinde anahtar `{ ...rest }` yıkımıyla
// ÇIKARILIR. Global mutasyon olmadığı için `fileParallelism`/sıralama
// kısıtına bağımlılık YOK, `afterEach` temizliği GEREKMEZ.

import { EnvValidationError, parseEnv } from '@arkesoft/config/env'
import { describe, expect, it } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'

type EnvSource = Record<string, string | undefined>

/** `process.env`'in KOPYASI, `DATABASE_AUTH_URL` ÇIKARILMIŞ (mutasyonsuz). */
function envWithoutDatabaseAuthUrl(): EnvSource {
  const { DATABASE_AUTH_URL: _omitted, ...rest } = process.env
  return rest
}

describe('apiEnvSchema — DATABASE_AUTH_URL koşulsuz zorunlu (AC3-c1)', () => {
  it('tanımsızken parseEnv(apiEnvSchema) EnvValidationError fırlatır (sıfır olmayan çıkış kaynağı)', () => {
    const source = envWithoutDatabaseAuthUrl()

    expect(() => parseEnv(apiEnvSchema, source)).toThrow(EnvValidationError)
  })

  it('hata metni DEĞİŞKEN ADINI içerir — "boş kanıt" ama ÖLÇÜLEBİLİR', () => {
    const source = envWithoutDatabaseAuthUrl()

    expect(() => parseEnv(apiEnvSchema, source)).toThrow(/DATABASE_AUTH_URL/)
  })

  it('beklenen şema öneki taşımayan bir değer de fırlatır (yalnızca "tanımlı" yetmez)', () => {
    const source: EnvSource = {
      ...envWithoutDatabaseAuthUrl(),
      DATABASE_AUTH_URL: 'mysql://yanlis-sema/arkesoft',
    }

    expect(() => parseEnv(apiEnvSchema, source)).toThrow(EnvValidationError)
  })

  it('geçerli bir postgresql:// değeriyle parseEnv BAŞARIYLA çözülür (negatif kontrolün tamamlayıcısı — boş değil)', () => {
    const validUrl = 'postgresql://arkesoft_auth:placeholder@localhost:5432/arkesoft?schema=public'
    const source: EnvSource = { ...envWithoutDatabaseAuthUrl(), DATABASE_AUTH_URL: validUrl }

    const env = parseEnv(apiEnvSchema, source)

    expect(env.DATABASE_AUTH_URL).toBe(validUrl)
  })
})

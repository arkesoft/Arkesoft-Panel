// @arkesoft/api — `DATABASE_AUTH_URL` anti-fallback testi, c2 — TEK YÜK
// TAŞIYAN KANIT (ROADMAP v0.0.14.1, T-015/ST-F, architect "KARAR —
// DATABASE_AUTH_URL: şema, fail-fast, anti-fallback", AC3-c2, R-PM4/K-A4)
//
// `c1` (database-auth-url-fail-fast.test.ts) BOŞTUR — Zod zorunluluğu
// "yoksa fırlatır"ı kanıtlar, fallback'in VAR OLUP OLMADIĞINI kanıtlamaz.
// BU DOSYA yük taşıyan kanıttır.
//
// ⚠ ÖLÇÜLMÜŞ DÜZELTME (ilk varsayım ÇÜRÜTÜLDÜ): `auth.module.ts:79`'u
// GEÇİCİ olarak `env.DATABASE_AUTH_URL ?? env.DATABASE_URL` yapıp bu dosya
// koşturuldu — İKİ TEST DE YEŞİL KALDI. Sebep ölçüldü: `env.DATABASE_AUTH_URL`
// `apiEnvSchema`'da KOŞULSUZ ZORUNLU (`z.string()`, `.optional()` DEĞİL) —
// uygulama bu alan `undefined`/boş OLMADAN hiç AÇILMAZ (c1), bu yüzden
// `??`'nin SAĞ TARAFI yapısal olarak ERİŞİLEMEZ: sol taraf HER ZAMAN
// tanımlı bir string'tir (yanlış role işaret etse de). `??`/`||` burada
// "sessiz güvenlik kaybı" ÜRETEMEZ — tek üretebileceği kod YOLU, bir
// GELİŞTİRİCİNİN bu satırı HİÇ DEĞİŞTİRMEMESİ (yani `auth.module.ts:79`'un
// BUGÜN tam o satırda taşıdığı `env.DATABASE_URL`'İ KORUMASI, R-PM4'ün
// bahsettiği "en düşük dirençli yanlış yol"). BU İKİNCİ senaryo AYRICA
// ÖLÇÜLDÜ: `env.DATABASE_URL`'E GERİ ALINDIĞINDA (yüzeysel düzeltme hiç
// uygulanmamış gibi) (a)'nın kontrolü (healthy bağlantıyla 2xx + 42501 yok)
// KIRMIZI düşüyor — çünkü istemci artık DATABASE_AUTH_URL'İ TAMAMEN
// GÖRMEZDEN GELİP her koşulda `arkesoft_app`'i kullanıyor. Bu dosyanın
// "kırmızı yolu" budur (ST-F raporunda ham çıktı yapıştırıldı) — nullish
// coalescing DEĞİL, SATIRIN HİÇ DEĞİŞTİRİLMEMİŞ OLMASI.
//
// (a) SAĞLIKLI KONTROL (vacuity karşıtı kanıt #1): `DATABASE_AUTH_URL`
//     gerçek `arkesoft_auth` bağlantısına işaret ederken kayıt BAŞARILI olur
//     ve 42501 log satırı ÜRETİLMEZ — assert'in "her URL için zaten
//     başarısız olurdu" gibi anlamsız bir kontrol olmadığının kanıtı.
// (b) SALDIRI SENARYOSU: `DATABASE_AUTH_URL`, üç sır tablosunda HİÇBİR
//     yetkisi olmayan `arkesoft_app`'in bağlantı dizesine işaret eder (ST-D
//     DDL'inin canlı sonucu, ölçüldü: `has_column_privilege('arkesoft_app',
//     'public.account','password','SELECT') = false`). Kayıt akışı
//     BAŞARISIZ olmak ZORUNDADIR.
//
// GÖZLEMLENEN HATA ŞEKLİ (bu dosyanın ölçtüğü, ST-A0②'nin tahmininden
// AYRI): HTTP katmanında `AuthController`'ın `try/catch`'i (→
// `AuthProviderFailedError`, 503) DEVREYE GİRMEZ — `auth-flow.test.ts:579-
// 626`'nın "ulaşılamayan veritabanı" ölçümüyle AYNI sınıf: Better Auth
// (`better-call`'un dispatch seviyesi) hatayı KENDİ İÇİNDE yakalar ve BOŞ
// gövdeli `status: 500` bir `Response` ile çözer — `auth.handler()`
// REDDETMEZ. Asıl nedensel kanıt HTTP durum koduyla SINIRLI DEĞİL: enjekte
// edilen bellek log akışında Better Auth'un KENDİ logger köprüsü
// (`createBetterAuthLogger`, `auth-instance.ts:274-291`, `args.length===0`
// dalı) ham Prisma hatasının METNİNİ `level:'error'` bir satıra yazıyor —
// bu metin SQLSTATE `42501` VE tablo adını (`account`) TAŞIR. Bu TAM OLARAK
// ST-A0②'nin ölçtüğü `meta.driverAdapterError.cause.originalCode` alanının
// (ham `$queryRaw`/ORM çağrılarında aynı) HTTP/log yüzeyindeki izidir.
//
// ⚠ `error.code === '42501'` İDDİASI BURADA YOK (K-A2) — bu test doğrudan
// Prisma hata nesnesini YAKALAMAZ (HTTP sınırının ÖTESİNDE), onun yerine
// Better Auth'un bastığı SERBEST METNİ arıyor; bu METİN bir sözleşme
// DEĞİLDİR (kütüphane sürümüyle değişebilir) — bu yüzden assert REGEX ile
// gevşek tutuldu ve bu kısıt yorumda açıkça not edildi.

import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

const SIGN_UP_PASSWORD = 'arkesoft-st-f-anti-fallback-pw-123'

function uniqueEmail(): string {
  return `st-f-${Date.now().toString()}-${Math.random().toString(36).slice(2, 10)}@arkesoft.test`
}

/** `log-correlation.test.ts`'in AYNI yardımcısı (bilerek yerel kopya). */
function createMemoryLogStream(): { readonly stream: Writable; readonly getLines: () => string[] } {
  const chunks: Buffer[] = []

  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })

  return {
    stream,
    getLines: () =>
      Buffer.concat(chunks)
        .toString('utf-8')
        .split('\n')
        .filter((line) => line.length > 0),
  }
}

const logRecordSchema = z.looseObject({
  level: z.union([z.string(), z.number()]).optional(),
  msg: z.string().optional(),
})

function parseLogLines(lines: readonly string[]): Record<string, unknown>[] {
  return lines.map((line) => logRecordSchema.parse(JSON.parse(line)))
}

/** Herhangi bir log satırının `msg` alanı `42501` VE üç sır tablosundan birinin adını taşıyor mu. */
function hasPermissionDeniedLogLine(lines: readonly Record<string, unknown>[]): boolean {
  return lines.some((record) => {
    const msg = typeof record['msg'] === 'string' ? record['msg'] : ''
    return msg.includes('42501') && /\b(account|session|verification)\b/.test(msg)
  })
}

describe('AuthPrismaClientResource — DATABASE_AUTH_URL anti-fallback (AC3-c2, ST-F)', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  it('(a) SAĞLIKLI KONTROL — arkesoft_auth ile kayıt 2xx, HİÇBİR 42501 log satırı YOK', async () => {
    const { stream, getLines } = createMemoryLogStream()

    const testApp = await createTestApp({
      stream,
      apiEnv: { ...BASE_ENV }, // BASE_ENV.DATABASE_AUTH_URL zaten arkesoft_auth (kabuk öneki)
    })
    app = testApp.app

    const response = await request(app.getHttpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'ST-F Sağlıklı Kontrol', email: uniqueEmail(), password: SIGN_UP_PASSWORD })

    expect(response.status).toBeGreaterThanOrEqual(200)
    expect(response.status).toBeLessThan(300)

    const lines = parseLogLines(getLines())
    expect(hasPermissionDeniedLogLine(lines)).toBe(false)
  }, 15_000)

  // T-015 FIX turu 1, madde 2 (security S-2(b)) GÜNCELLEMESİ — `AuthPrismaClientResource`
  // artık `onModuleInit`'te `assertAuthRoleIsRestricted()`'ı AÇILIŞTA (bootstrap,
  // `tenant` tablosu negatif probu) çalıştırıyor. `arkesoft_app` rolü `tenant`'ı
  // OKUYABİLDİĞİ için (architect KARAR A3, "app→tenant hatasız") bu override artık
  // AÇILIŞTA yakalanır — REQUEST ZAMANINDA (sign-up çağrısında `account` tablosuna
  // yazma denemesiyle üretilen `42501`) DEĞİL. Bu bir REGRESYON DEĞİL, FIX'in
  // AMAÇLANAN, DAHA GÜÇLÜ SONUCU: geniş yetkili bir role işaret eden yanlış
  // yapılandırma artık trafiği HİÇ KABUL ETMİYOR (ÖLÇÜLDÜ: `pnpm --filter
  // @arkesoft/api test` bu override İLE önce AÇILIŞ reddi üretti, test bu yeni
  // sınıra göre YENİDEN yazıldı — eski "42501 + account/session/verification"
  // assert'i artık bu YOLDAN üretilemez, çünkü sign-up isteği HİÇ YAPILAMIYOR).
  it('(b) SALDIRI SENARYOSU — DATABASE_AUTH_URL arkesoft_app rolüne işaret ederse AÇILIŞ reddedilir (fail-closed probu, request HİÇ ulaşmaz)', async () => {
    const { stream, getLines } = createMemoryLogStream()

    await expect(
      createTestApp({
        stream,
        apiEnv: {
          ...BASE_ENV,
          // ⚠ KALICI DEĞİL — bu yalnızca test verisi, üretim kodunda
          // `DATABASE_AUTH_URL`/`DATABASE_URL` arasında BİR satırda `??`/`||`
          // YOKTUR (c3, database-auth-url-no-fallback-literal.test.ts).
          DATABASE_AUTH_URL: BASE_ENV.DATABASE_URL,
        },
      }),
    ).rejects.toThrow(/current_user/)

    // Test VAKUM DEĞİL — hata GERÇEKTEN loglandı (sessizce yutulmadı); bu artık
    // bir Postgres `42501` İZNİ hatası DEĞİL (`tenant` probu `has_table_privilege`
    // ile sorgulanıyor, tablo OKUNMUYOR) — bizim KENDİ fail-closed hatamız.
    const lines = parseLogLines(getLines())
    const offendingLine = lines.find((record) => {
      const msg = typeof record['msg'] === 'string' ? record['msg'] : ''
      return msg.includes('açılış durduruluyor')
    })
    expect(typeof offendingLine?.['msg']).toBe('string')
  }, 15_000)
})

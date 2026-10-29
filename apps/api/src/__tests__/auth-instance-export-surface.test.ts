// @arkesoft/api — `AUTH_INSTANCE` artık `src/auth` DIŞINA AÇILMIYOR (FIX turu
// 1, madde 3 — F1(b), high).
//
// ÖNCEKİ DURUM (security gate, T-006 tur 1): `AuthModule`'ün `exports:
// [AUTH_INSTANCE]` satırı TAM `Auth` yüzeyini (`auth.api.listSessions`/
// `revokeSession`/... HEPSİ) `src/auth` DIŞINDAKİ herhangi bir modüle
// açıyordu — HTTP allowlist'inin (`/list-sessions` 404) KORUMADIĞI bir DI yan
// yolu (`auth.api.listSessions()` ham `session.token` döner). `tsc`/`eslint`
// bunu YAKALAMIYORDU (tip hatası değil, bir TASARIM ihlali).
//
// BU TEST, `src/auth` DIŞINDA (bu dosya `__tests__/` altında, `auth/`
// DEĞİL) `AUTH_INSTANCE`'ı enjekte etmeye ÇALIŞAN bir provider'ın modül
// derlemesini (`Test.createTestingModule(...).compile()`) KIRDIĞINI
// kanıtlar — DI ÇÖZÜLEMEZ (Nest `UnknownDependenciesException`). Gerçek
// Postgres/Redis'e İHTİYAÇ YOK: `compile()` eager provider'ları KURAR ama
// hiçbiri ağ çağrısı YAPMAZ (`PrismaClient`/`nodemailer.createTransport`
// yapısal olarak LAZY — bağlantı ilk sorguda/gönderimde kurulur).

import { randomUUID } from 'node:crypto'

import { Inject, Injectable, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { parseEnv } from '@arkesoft/config/env'
import type { Auth } from 'better-auth'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { AppModule } from '../app.module.js'
import { AUTH_INSTANCE, AUTH_SESSION_READER } from '../auth/auth.tokens.js'
import type { AuthSessionReader } from '../auth/auth.tokens.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

/**
 * `src/auth` DIŞINDAKİ (bu dosyanın dizini) bir servisin `AUTH_INSTANCE`'ı
 * DOĞRUDAN enjekte etmeye ÇALIŞMASI — F1(b)'nin ÖLÇTÜĞÜ TAM senaryo
 * (`auth.api.listSessions()` çağırıp ham `token` okuma). Bu sınıfın
 * KENDİSİ hiçbir zaman çağrılmaz — varlığı/derlenmesi YETERLİ, kurulum
 * (`compile()`) anında DI grafiği çözülmeye ÇALIŞILIR.
 */
@Injectable()
class OutsideAuthModuleProbeService {
  /**
   * `auth` bilerek KULLANILMAZ — alan `private readonly` olarak ATANMIŞ
   * olması bile DI çözümü için YETERLİ (gövde boş kalabilir); `readonly`
   * olduğu için `@typescript-eslint/no-unused-vars`'ın "atanmış ama
   * okunmamış" dalına GİRMEZ (parametre özelliği, erişilebilir KALIR).
   */
  constructor(@Inject(AUTH_INSTANCE) readonly auth: Auth) {}
}

@Module({
  imports: [AppModule],
  providers: [OutsideAuthModuleProbeService],
  // `no-extraneous-class` — bu sınıfın TEK amacı (AppModule'ü değiştirmeden
  // bir provider EKLEMEK) teşhis edilebilir kılan, okunabilir bir işaretleyici.
  exports: [],
})
class OutsideAuthModuleProbeModule {
  readonly purpose = 'FIX turu 1, F1(b) — AppModule DEĞİŞTİRİLMEDEN DI probu'
}

describe('F1(b) — AUTH_INSTANCE src/auth DIŞINA sızmıyor', () => {
  it('src/auth DIŞINDAN AUTH_INSTANCE enjekte eden bir modül DERLENEMEZ (DI çözülemez)', async () => {
    const moduleBuilder = Test.createTestingModule({
      imports: [OutsideAuthModuleProbeModule],
    })
      .overrideProvider(API_ENV)
      .useValue(BASE_ENV)

    await expect(moduleBuilder.compile()).rejects.toThrow()
  })
})

// FIX turu 2, madde 7 (security tur2 S-6, `low`) — F1(b) `AUTH_INSTANCE`'ın
// METOT yüzeyini daraltmıştı; `AUTH_SESSION_READER` (bilerek DI'DAN EXPORT
// EDİLEN TEK yüzey, `AuthContextMiddleware`'in ihtiyacı) ÖNCESİ Better
// Auth'un KENDİ `getSession` sonucunu (`.session.token` DAHİL) DÖNÜYORDU.
// Bu test GERÇEK bir oturum üretir, `AUTH_SESSION_READER`'ı `src/auth`
// DIŞINDAN (bu dosyanın dizini) enjekte eder ve sonucun yapısal olarak
// SADECE `userId`/`sessionId` TAŞIDIĞINI (ham `session`/`token` alanı
// YOK) doğrular — mekanik kanıt, `Object.keys()` tam eşleşme.
describe('S-6 — AUTH_SESSION_READER VERİ yüzeyi de daraltıldı (ham session.token YOK)', () => {
  it("getSession() sonucu YALNIZCA {userId, sessionId} taşır — Better Auth'un ham session/token alanları YOK", async () => {
    const testApp = await createTestApp()

    try {
      const email = `auth-session-reader-surface-${randomUUID().slice(0, 10)}@arkesoft.test`
      const password = 'arkesoft-s6-surface-password-123'
      await deleteAllMailpitMessages()

      await request(testApp.app.getHttpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'S-6 Yüzey Testi', email, password })

      const delivered = await findLatestMailpitMessageTo(email)
      const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
      await request(testApp.app.getHttpServer()).get(
        `/auth/verify-email?token=${encodeURIComponent(token)}`,
      )

      const signInResponse = await request(testApp.app.getHttpServer())
        .post('/auth/sign-in/email')
        .send({ email, password })

      const cookies = z.array(z.string()).min(1).parse(signInResponse.headers['set-cookie'])
      const cookieHeader = cookies.join('; ')

      const reader = testApp.app.get<AuthSessionReader>(AUTH_SESSION_READER)
      const result = await reader.getSession({ headers: new Headers({ cookie: cookieHeader }) })

      expect(result).not.toBeNull()
      // Mekanik kanıt: alan kümesi TAM OLARAK bu ikisidir — `session`/
      // `token`/`expiresAt`/diğer Better Auth alanları YOK.
      expect(Object.keys(result ?? {}).sort()).toEqual(['sessionId', 'userId'])
      expect(typeof result?.userId).toBe('string')
      expect(typeof result?.sessionId).toBe('string')
    } finally {
      await testApp.app.close()
    }
  }, 20_000)
})

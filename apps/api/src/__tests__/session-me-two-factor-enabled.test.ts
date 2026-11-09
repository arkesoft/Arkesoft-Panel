// @arkesoft/api — session.me'nin twoFactorEnabled alanı: İKİ hücre + "yalnızca
// ÇAĞIRANIN KENDİ değeri" (ROADMAP v0.0.15, T-016 FIX turu 2/M-4)
//
// `/trpc/session.me` KİRACI MUAFTİR (`tenant-exempt-paths.ts`'in dördüncü
// grubu) — bu dosya bu yüzden hiçbir tenant/membership KURMAZ, SADECE iki
// bağımsız kimlik doğrulanmış oturum kurar (`createAuthenticatedSession`).
//
// ASSERT (handoff bağlayıcı — TAMAMLANMA TANIMI madde 2 ve 4):
//   HÜCRE A — 2FA AÇIK kullanıcı → `session.me` `twoFactorEnabled: true`.
//   HÜCRE B — 2FA KAPALI kullanıcı → `session.me` `twoFactorEnabled: false`.
//   Bu iki hücre TEK BAŞINA "doğru değer" kanıtlar ama "BAŞKA kullanıcının
//   değerini SIZDIRMIYOR" kanıtı İKİSİNİN BİRLİKTE, AYNI çalıştırmada,
//   SIRAYLA tüketilmesine bağlıdır: A'nın oturumuyla B'nin `true` değeri HİÇ
//   görünmez, B'nin oturumuyla A'nın `false` değeri HİÇ görünmez — eğer
//   `sessionSecurityRead.isTwoFactorEnabled` çağırana BAĞLI OLMAYAN bir
//   girdi (ör. "tenant'taki herhangi bir kullanıcı") kullansaydı, bu iki
//   hücre AYNI sonucu verir ve testler YANLIŞLIKLA yeşil kalabilirdi — bu
//   yüzden üçüncü `it()` ikisini AÇIKÇA tek testte, karşılaştırmalı olarak
//   tekrar çalıştırır (CLAUDE.md §7 "başka kullanıcının sızdırılmaması"
//   maddesinin DAVRANIŞSAL kanıtı).

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { createTrpcClient } from '@arkesoft/trpc'
import type { TrpcClient } from '@arkesoft/trpc'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

async function listen(server: Server): Promise<string> {
  if (!server.listening) {
    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })
  }

  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('listen: beklenmeyen sunucu adresi')
  }

  return `http://127.0.0.1:${String(address.port)}`
}

describe('session.me — twoFactorEnabled (ROADMAP v0.0.15, T-016 FIX turu 2/M-4)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let baseUrl: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    baseUrl = await listen(app.getHttpServer())
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  /** `trpc-http.test.ts`'in AYNI yardımcısı — `app`'in BU NOKTADA kurulu olduğunu garantiler. */
  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  function clientFor(cookieHeader: string): TrpcClient {
    return createTrpcClient({
      url: `${baseUrl}/trpc`,
      headers: () => ({ cookie: cookieHeader }),
    })
  }

  it('HÜCRE A — 2FA AÇIK kullanıcı → session.me.twoFactorEnabled === true', async () => {
    const session = await createAuthenticatedSession(httpServer())
    await prismaService.db.user.update({
      where: { id: session.userId },
      data: { twoFactorEnabled: true },
    })

    const result = await clientFor(session.cookieHeader).session.me.query()

    expect(result.userId).toBe(session.userId)
    expect(result.twoFactorEnabled).toBe(true)
  })

  it('HÜCRE B — 2FA KAPALI kullanıcı → session.me.twoFactorEnabled === false', async () => {
    const session = await createAuthenticatedSession(httpServer())
    await prismaService.db.user.update({
      where: { id: session.userId },
      data: { twoFactorEnabled: false },
    })

    const result = await clientFor(session.cookieHeader).session.me.query()

    expect(result.userId).toBe(session.userId)
    expect(result.twoFactorEnabled).toBe(false)
  })

  it(
    'KARŞILAŞTIRMALI — AYNI çalıştırmada İKİ farklı kullanıcı, İKİ farklı ' +
      'durum: her oturum SADECE KENDİ değerini görür (başka kullanıcının ' +
      'durumu sızmaz)',
    async () => {
      const enabledSession = await createAuthenticatedSession(httpServer())
      const disabledSession = await createAuthenticatedSession(httpServer())

      await prismaService.db.user.update({
        where: { id: enabledSession.userId },
        data: { twoFactorEnabled: true },
      })
      await prismaService.db.user.update({
        where: { id: disabledSession.userId },
        data: { twoFactorEnabled: false },
      })

      const enabledResult = await clientFor(enabledSession.cookieHeader).session.me.query()
      const disabledResult = await clientFor(disabledSession.cookieHeader).session.me.query()

      // ⚠ `enabledSession.userId !== disabledSession.userId` olduğu
      // GARANTİ edilmeden (randomUUID tabanlı e-posta, `auth-fixture.ts`)
      // aşağıdaki iki assert'in ayrımı anlamsız kalırdı — sanity.
      expect(enabledResult.userId).not.toBe(disabledResult.userId)
      expect(enabledResult.twoFactorEnabled).toBe(true)
      expect(disabledResult.twoFactorEnabled).toBe(false)
    },
  )
})

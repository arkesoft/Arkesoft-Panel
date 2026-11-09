// @arkesoft/api — SessionSecurityReadPortAdapter.isTwoFactorEnabled() birim
// testi (ROADMAP v0.0.15, T-016 FIX turu 2/M-4)
//
// `TenantReadPortAdapter`'ın soft-delete yarışı testinin (`trpc-tenant-read-
// port-adapter.test.ts`) AYNI deseni: gerçek DI-kurulu adaptör, gerçek
// Postgres, `createTestApp()` üzerinden. İKİ hücre + BİR "kullanıcı yok"
// hücresi (port TOTAL'dır, FIRLATMAZ — port dosyasının kendi sözleşmesi).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PrismaService } from '../prisma/prisma.service.js'
import { SessionSecurityReadPortAdapter } from '../trpc/ports/session-security-read.port.adapter.js'
import { createTestApp } from './helpers/create-test-app.js'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

describe('SessionSecurityReadPortAdapter.isTwoFactorEnabled() (ROADMAP v0.0.15, T-016 FIX turu 2/M-4)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let adapter: SessionSecurityReadPortAdapter
  const createdUserIds: string[] = []

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    adapter = app.get(SessionSecurityReadPortAdapter)
  })

  afterAll(async () => {
    if (app !== undefined) {
      await Promise.all(createdUserIds.map((id) => prismaService.db.user.delete({ where: { id } })))
      await app.close()
    }
  })

  async function createUser(twoFactorEnabled: boolean): Promise<string> {
    const user = await prismaService.db.user.create({
      data: {
        email: uniqueEmail('m4-session-security'),
        name: 'M-4 Session Security Fixture',
        emailVerified: true,
        twoFactorEnabled,
      },
    })
    createdUserIds.push(user.id)
    return user.id
  }

  it('HÜCRE 1 — app_user.two_factor_enabled = true → true döner', async () => {
    const userId = await createUser(true)
    await expect(adapter.isTwoFactorEnabled(userId)).resolves.toBe(true)
  })

  it('HÜCRE 2 — app_user.two_factor_enabled = false → false döner', async () => {
    const userId = await createUser(false)
    await expect(adapter.isTwoFactorEnabled(userId)).resolves.toBe(false)
  })

  it(
    "PORT TOTAL'dır, FIRLATMAZ — var olmayan kullanıcı kimliği için " +
      'AppError İCAT ETMEDEN false döner',
    async () => {
      await expect(adapter.isTwoFactorEnabled(`nonexistent-${randomUUID()}`)).resolves.toBe(false)
    },
  )
})

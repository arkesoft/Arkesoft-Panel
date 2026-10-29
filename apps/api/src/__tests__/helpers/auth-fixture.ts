// @arkesoft/api — kimlik doğrulama test fixture'ı (ROADMAP v0.0.5, T-006/S6)
//
// ⚠ BU DOSYA YENİ — S6'nın `AuthGuard`'ı GLOBAL (`APP_GUARD`) olduğu için
// `TenancyModule`'ün ÖNCESİNDE yazılmış `/__smoke*` probe testleri (ST-5/ST-7:
// `tenant-resolution.test.ts`, `concurrency.test.ts`, `validation.test.ts`,
// `log-correlation.test.ts`) artık KİMLİK DE gerektiriyor — "varsayılan
// korumalı" (AC9) kuralının doğal, BEKLENEN sonucu. Bu dört dosyanın HİÇBİRİ
// `auth` kavramından ÖNCE yazıldığı için kendi fixture'larını TAŞIMIYORDU; bu
// yardımcı DÖRDÜ ARASINDA TEKRARLANAN "kayıt → doğrulama → giriş" örüntüsünü
// TEK yerde toplar (PO riski 1'in "S3 AYNI alt görevde güncellemek ZORUNDA"
// emsaliyle AYNI gerekçe — yapısal bir değişiklik ÖNCEDEN pinlenmiş testleri
// kırıyorsa düzeltme, gevşetme DEĞİL, O DEĞİŞİKLİĞİ yapan alt görevin işidir).
//
// `createAuthenticatedSession` SADECE kimlik üretir — kiracı ÜYELİĞİ
// ÜRETMEZ (R2); çağıran, ihtiyaç duyduğu her tenant için
// `prismaService.withTenant(tenantId, tx => tx.tenantMembership.create(...))`
// çağırmak ZORUNDADIR (bu dosya o kararı KENDİSİ VERMEZ — hangi tenant'a
// üyelik gerektiği TAMAMEN çağıranın test senaryosuna bağlı).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import request from 'supertest'
import { z } from 'zod'

import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './mailpit-client.js'

const FIXTURE_PASSWORD = 'arkesoft-test-fixture-password-123'

const signInBodySchema = z.object({ user: z.object({ id: z.string() }) })
const setCookieHeaderSchema = z.array(z.string()).min(1)

export type AuthenticatedSession = {
  readonly cookieHeader: string
  readonly userId: string
}

/**
 * Tam e-posta + şifre akışını (kayıt → Mailpit'ten belirteç → doğrulama →
 * giriş) KOŞAR ve geçerli bir oturum çerezi + kullanıcı kimliği döner.
 * Mailpit'i TEMİZLEMEZ (birden fazla fixture AYNI testte PARALEL/ardışık
 * çağrılabilir) — çağıran kendi e-postasına ÖZGÜ en yeni mesajı arar
 * (`findLatestMailpitMessageTo`, alıcıya göre filtreler).
 */
export async function createAuthenticatedSession(
  httpServer: Server,
): Promise<AuthenticatedSession> {
  const email = `fixture-${randomUUID().slice(0, 16)}@arkesoft.test`

  await request(httpServer)
    .post('/auth/sign-up/email')
    .send({ name: 'Test Fixture Kullanıcısı', email, password: FIXTURE_PASSWORD })

  const delivered = await findLatestMailpitMessageTo(email)
  const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
  await request(httpServer).get(`/auth/verify-email?token=${encodeURIComponent(token)}`)

  const signInResponse = await request(httpServer)
    .post('/auth/sign-in/email')
    .send({ email, password: FIXTURE_PASSWORD })

  const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
  const userId = signInBodySchema.parse(signInResponse.body).user.id

  return { cookieHeader: cookies.join('; '), userId }
}

/** `deleteAllMailpitMessages`'ı YENİDEN dışa açar — çağıranlar Mailpit'i kendi testinden ÖNCE temizleyebilsin. */
export { deleteAllMailpitMessages }

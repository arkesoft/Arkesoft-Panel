// @arkesoft/api — AC3: yedek kod TEK KULLANIMLIK (ROADMAP v0.0.15, T-016/S11,
// kabul kriteri testleri)
//
// `enable`'ın (`method: 'totp'`) yanıtı ZATEN `backupCodes` listesini taşır
// (Better Auth kaynağı, `plugins/two-factor/index.mjs` — OKUNDU: TOTP
// kurulumu yedek kodları da AYNI anda üretir) — `generate-backup-codes`'u
// AYRICA çağırmaya GEREK YOK.
//
// ⚠ `viewBackupCodes` `createAuthEndpoint.serverOnly(...)`dür — HTTP
// router'a HİÇ kaydolmaz (handoff'un uyarısı). "Kalan sayı azaldı" bu yüzden
// HTTP'den SAYI OKUNARAK değil, DAVRANIŞLA kanıtlanır: (1) kullanılan kod
// İKİNCİ kez reddedilir (`INVALID_BACKUP_CODE`) — bu TEK BAŞINA "bir kod
// tüketildi"nin davranışsal kanıtıdır; (2) KOMŞU (henüz kullanılmamış) bir
// kod HÂLÂ geçerlidir — yalnızca O TEK kodun çıkarıldığını, LİSTENİN TAMAMEN
// geçersiz kılınmadığını gösterir; (3) `two_factor.backup_codes` sütununun
// şifreli metni DEĞİŞTİ — kalıcı bir yan etkinin VARLIĞININ mekanik kanıtı
// (`arkesoft_auth` rolüyle okunur, T-015 — `arkesoft_app` bu tabloda
// YETKİSİZDİR).
//
// `verify-backup-code` NORMAL (zaten doğrulanmış) bir oturum çerezi ile
// çağrıldığında Better Auth'un KENDİ kaynağı (`verify-two-factor.mjs`,
// `getSessionFromCtx` dolu döner) `isSignIn=false` dalına girer — hesap
// kilitleme/deneme sayacı BU dalda HİÇ işletilmez (sign-in challenge'ı DEĞİL,
// kendi oturumunu doğrulayan kullanıcı) — bu dosya BU YÜZDEN sign-in
// challenge'ı KURMADAN, doğrudan normal oturum çerezini kullanır.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import { createPrismaClient } from '@arkesoft/db'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { generateTotpCode } from '../auth/two-factor/totp-code-generator.port.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-ac3-backup-code-password-123'

const totpUriSchema = z.object({
  method: z.literal('totp'),
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
})
const setCookieHeaderSchema = z.array(z.string()).min(1)
const betterAuthErrorBodySchema = z.object({ code: z.string(), message: z.string() })

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

function extractBase32SecretFromTotpUri(totpURI: string): string {
  return extractQueryParam(totpURI, 'secret')
}

function toCookiePair(setCookieHeader: string): string {
  const firstSegment = setCookieHeader.split(';')[0]
  if (firstSegment === undefined) {
    throw new Error(`beklenmeyen Set-Cookie biçimi: ${setCookieHeader}`)
  }
  return firstSegment.trim()
}

/** `noUncheckedIndexedAccess` altında ilk Set-Cookie girdisini `as`/`!` KULLANMADAN daraltır. */
function firstSetCookie(setCookies: readonly string[]): string {
  const value = setCookies[0]
  if (value === undefined) {
    throw new Error('Set-Cookie listesi boş')
  }
  return value
}

/** Listenin N. elemanını `as`/`!` KULLANMADAN daraltır — index geçersizse FIRLAR. */
function elementAt<T>(list: readonly T[], index: number): T {
  const value = list[index]
  if (value === undefined) {
    throw new Error(`index ${String(index)} listede YOK (uzunluk ${String(list.length)})`)
  }
  return value
}

/** Bir yedek kodun TEK bir karakterini, farklı bir karaktere çevirir (yakın-ışka, ADR-0014). */
function mutateOneCharacter(code: string): string {
  const chars = code.split('')
  const targetIndex = chars.findIndex((char) => /[a-zA-Z0-9]/.test(char))
  if (targetIndex === -1) {
    throw new Error(`mutasyona uğratılacak karakter bulunamadı: ${code}`)
  }
  const original = elementAt(chars, targetIndex)
  const replacement = original === '0' ? '1' : '0'
  chars[targetIndex] = replacement
  return chars.join('')
}

describe('AC3 — yedek kod tek kullanımlık (gerçek Postgres + gerçek HTTP + gerçek Mailpit)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined
  let authRolePrisma: ReturnType<typeof createPrismaClient>

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    authRolePrisma = createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_AUTH_URL })
  }, 60_000)

  afterAll(async () => {
    await authRolePrisma.$disconnect()
    if (app !== undefined) {
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  it(
    'ikinci kullanım INVALID_BACKUP_CODE + KOMŞU kod HÂLÂ geçerli + bir karakter mutasyonu reddedilir + ' +
      'DB sütunu DEĞİŞTİ (davranışsal "tek kullanımlık" kanıtı, viewBackupCodes serverOnly olduğu için)',
    async () => {
      const email = uniqueEmail('ac3-backup')
      await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'AC3 Yedek Kod Testi', email, password: PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
      await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })
      const signInUser = z.object({ user: z.object({ id: z.string() }) }).parse(signInResponse.body)
      const userId = signInUser.user.id
      const sessionCookiePair = toCookiePair(
        firstSetCookie(setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])),
      )

      const enableResponse = await request(httpServer())
        .post('/auth/two-factor/enable')
        .set('Cookie', sessionCookiePair)
        .send({ password: PASSWORD, method: 'totp' })
      const { totpURI, backupCodes } = totpUriSchema.parse(enableResponse.body)
      expect(backupCodes.length).toBeGreaterThanOrEqual(2)
      const base32Secret = extractBase32SecretFromTotpUri(totpURI)
      const confirmCode = await generateTotpCode({ base32Secret })
      const confirmResult = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Cookie', sessionCookiePair)
        .send({ code: confirmCode })
      // ⚠ ÖLÇÜLDÜ: `verify-totp`'un "confirm" dalı (`twoFactor.verified !==
      // true`, Better Auth kaynağı) ESKİ oturumu SİLER ve YENİ bir oturum
      // çerezi döner (`internalAdapter.deleteSession` + `setSessionCookie`) —
      // bu yüzden AŞAĞIDAKİ çağrılar `enable`'DAN ÖNCEKİ `sessionCookiePair`'i
      // DEĞİL, bu YENİ çerezi kullanmak ZORUNDADIR (aksi hâlde silinmiş bir
      // oturumla çağrılır, `getSessionFromCtx` null döner, Better Auth bunu
      // bir 2FA challenge çerezi arayışına düşürür: `INVALID_TWO_FACTOR_COOKIE`).
      const confirmSetCookie = setCookieHeaderSchema.parse(confirmResult.headers['set-cookie'])
      const confirmedSessionCookieEntry = confirmSetCookie.find((entry) =>
        entry.startsWith('better-auth.session_token='),
      )
      if (confirmedSessionCookieEntry === undefined) {
        throw new Error(
          `verify-totp confirm yanıtında oturum çerezi bulunamadı — gözlenen: ${confirmSetCookie.join(' | ')}`,
        )
      }
      const confirmedSessionCookiePair = toCookiePair(confirmedSessionCookieEntry)

      const firstCode = elementAt(backupCodes, 0)
      const secondCode = elementAt(backupCodes, 1)

      const beforeRow = await authRolePrisma.twoFactor.findUniqueOrThrow({
        where: { userId },
        select: { backupCodes: true },
      })

      // İLK kullanım — 200 + oturum.
      const firstUseResult = await request(httpServer())
        .post('/auth/two-factor/verify-backup-code')
        .set('Cookie', confirmedSessionCookiePair)
        .send({ code: firstCode })
      expect(firstUseResult.status).toBe(200)
      const firstUseBody = z.object({ token: z.string() }).parse(firstUseResult.body)
      expect(firstUseBody.token.length).toBeGreaterThan(0)

      // DB sütunu DEĞİŞTİ — kalıcı yan etkinin mekanik kanıtı.
      const afterFirstUseRow = await authRolePrisma.twoFactor.findUniqueOrThrow({
        where: { userId },
        select: { backupCodes: true },
      })
      expect(afterFirstUseRow.backupCodes).not.toBe(beforeRow.backupCodes)

      // İKİNCİ kullanım (AYNI kod) — INVALID_BACKUP_CODE (TEK KULLANIMLIK).
      const secondUseResult = await request(httpServer())
        .post('/auth/two-factor/verify-backup-code')
        .set('Cookie', confirmedSessionCookiePair)
        .send({ code: firstCode })
      expect(secondUseResult.status).toBe(401)
      expect(betterAuthErrorBodySchema.parse(secondUseResult.body).code).toBe('INVALID_BACKUP_CODE')

      // YAKIN-IŞKA — bir karakteri değiştirilmiş KOMŞU kod REDDEDİLİR.
      const mutatedSecondCode = mutateOneCharacter(secondCode)
      expect(mutatedSecondCode).not.toBe(secondCode)
      const mutatedResult = await request(httpServer())
        .post('/auth/two-factor/verify-backup-code')
        .set('Cookie', confirmedSessionCookiePair)
        .send({ code: mutatedSecondCode })
      expect(mutatedResult.status).toBe(401)
      expect(betterAuthErrorBodySchema.parse(mutatedResult.body).code).toBe('INVALID_BACKUP_CODE')

      // KOMŞU kod (gerçek, mutasyona uğramamış hâli) HÂLÂ geçerli — yakın-ışka
      // denemesi onu BOZMADI, VE tüketilen kod yalnızca KENDİSİNİ geçersiz
      // kıldı (listenin TAMAMI DEĞİL).
      const secondCodeResult = await request(httpServer())
        .post('/auth/two-factor/verify-backup-code')
        .set('Cookie', confirmedSessionCookiePair)
        .send({ code: secondCode })
      expect(secondCodeResult.status).toBe(200)
    },
    30_000,
  )
})

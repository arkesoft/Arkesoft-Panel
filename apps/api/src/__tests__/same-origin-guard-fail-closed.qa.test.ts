// @arkesoft/api — SameOriginGuard FAIL-CLOSED davranışsal ölçümü (QA, T-006
// tur 3 — Orkestratör "İLK İŞ" maddesi, tur 2'nin kanıt testinin MUHASEBESİ)
//
// TARİHÇE (muhasebe, kod düzeltmesi DEĞİL): tur 2'de bu dosya
// `same-origin-guard-fail-open.qa.test.ts` adıyla, `Origin`/`Sec-Fetch-Site`
// başlıkları İKİSİ DE yokken `POST /auth/sessions/revoke-all`'ın 200 DÖNDÜĞÜNÜ
// ve mutasyonun GERÇEKLEŞTİĞİNİ (fail-open) ölçüp kanıtlıyordu —
// `expect(revokeAllResponse.status).toBe(200)` + `expect(firstAfter.status).toBe(401)`.
//
// FIX turu 2 bu açığı KAPATTI (`same-origin.guard.ts`, `missing_origin_with_cookie`
// dalı — güvensiz metot + `Cookie` var + `Origin`/`Sec-Fetch-Site`/`Referer`
// hiçbiri yok → 403 `CROSS_SITE_REQUEST_REJECTED`). Bunun sonucunda tur 2'nin
// eski assert'i artık YANLIŞ hâle geldi: `pnpm test` bunu MEKANİK olarak
// kanıtladı (302 geçti / 1 düştü, `expected 403 to be 200`). Bu dosya o eski
// assert'i TERS ÇEVİRİR — zafiyet kanıtından GERİLEME BEKÇİSİNE dönüşür: biri
// ileride bu dalı yeniden fail-open'a çevirirse (ör. `missing_origin_with_cookie`
// dalını silerse veya `SAFE_METHODS` kümesini genişletirse) bu test KIRMIZI
// verir. Hiçbir şey GEVŞETİLMİYOR — tam tersi, yeni kontrol PİNLENİYOR.
//
// Not: `same-origin-guard.test.ts:200-219`'da backend'in KENDİ eklediği test
// BİREBİR aynı senaryoyu zaten kapsıyor (FIX 2'nin bir parçası olarak yazıldı).
// Bu dosya BAĞIMSIZ bir QA pin'i olarak KORUNUYOR — iki dosyanın aynı anda
// kırılması, üretim testinin "testi memnun etmek için" gevşetilmediğinin
// (AGENT_BASELINE §5 "sonuç uydurma" / CLAUDE.md §10.6) ek kanıtıdır.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const PASSWORD = 'arkesoft-qa-fail-closed-password-123'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

const setCookieHeaderSchema = z.array(z.string()).min(1)

describe('SameOriginGuard — FAIL-CLOSED gerileme bekçisi (QA tur 3, muhasebe)', () => {
  let app: INestApplication<Server> | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
  })

  afterAll(async () => {
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

  async function signUpVerifyAndSignIn(email: string): Promise<string> {
    const signUpResponse = await request(httpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'QA Fail-Closed Testi', email, password: PASSWORD })
    expect(signUpResponse.status).toBeGreaterThanOrEqual(200)
    expect(signUpResponse.status).toBeLessThan(300)

    const delivered = await findLatestMailpitMessageTo(email)
    const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
    const verifyResponse = await request(httpServer()).get(
      `/auth/verify-email?token=${encodeURIComponent(token)}`,
    )
    expect(verifyResponse.status).toBeGreaterThanOrEqual(200)
    expect(verifyResponse.status).toBeLessThan(300)

    const signInResponse = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email, password: PASSWORD })

    return setCookieHeaderSchema.parse(signInResponse.headers['set-cookie']).join('; ')
  }

  it(
    'Origin VE Sec-Fetch-Site (VE Referer) başlıkları İKİSİ DE/ÜÇÜ DE YOK → revoke-all ' +
      '403 CROSS_SITE_REQUEST_REJECTED DÖNER ve HİÇBİR oturum iptal EDİLMEZ ' +
      '(FIX 2 öncesi: 200 + gerçek mutasyon — bkz. dosya başı tarihçe)',
    async () => {
      const email = uniqueEmail('qa-fail-closed')
      await deleteAllMailpitMessages()

      const firstCookieHeader = await signUpVerifyAndSignIn(email)

      // AYNI hesapla İKİNCİ giriş — revoke-all'ın "TÜMÜNÜ" iptal ETMEDİĞİNİ
      // ölçmek için en az iki canlı oturum gerekir.
      const secondSignIn = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })
      const secondCookieHeader = setCookieHeaderSchema
        .parse(secondSignIn.headers['set-cookie'])
        .join('; ')

      // Baseline — ÖNCE ikisi de GERÇEKTEN canlı (negatif kontrolün anlamlı
      // olması için).
      const firstBefore = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', firstCookieHeader)
      expect(firstBefore.status).toBe(200)
      const secondBefore = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', secondCookieHeader)
      expect(secondBefore.status).toBe(200)

      // ASIL ÖLÇÜM: Origin/Sec-Fetch-Site/Referer BİLEREK HİÇ GÖNDERİLMİYOR
      // (supertest varsayılanı — gerçek saldırı senaryosuyla AYNI: üçüncü
      // parti bir HTML formu da bu başlıkları kendisi EKLEYEMEZ, tarayıcı
      // ekler ya da hiç eklemez; bu test "başlık yoksa ne olur" sorusunu
      // yanıtlıyor — bkz. same-origin.guard.ts dosya başı yorumu).
      const revokeAllResponse = await request(httpServer())
        .post('/auth/sessions/revoke-all')
        .set('Cookie', secondCookieHeader)

      expect(revokeAllResponse.status).toBe(403)
      expect(revokeAllResponse.body).toMatchObject({ code: 'CROSS_SITE_REQUEST_REJECTED' })

      // GERİLEME BEKÇİSİNİN ASIL İDDİASI: mutasyon GERÇEKLEŞMEDİ — İKİNCİ
      // çerez HÂLÂ geçerli (reddedilen istek bir yan etki bırakmadı).
      const secondAfter = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', secondCookieHeader)
      expect(secondAfter.status).toBe(200)

      // VE üçüncü, BAĞIMSIZ bir çerezle (BİRİNCİ oturum) kontrol: ayrıca
      // HAYATTA — "zaten 401 olurdu" itirazını kapatan, tur 2'den devralınan
      // ayrım.
      const firstAfter = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', firstCookieHeader)
      expect(firstAfter.status).toBe(200)
    },
    20_000,
  )
})

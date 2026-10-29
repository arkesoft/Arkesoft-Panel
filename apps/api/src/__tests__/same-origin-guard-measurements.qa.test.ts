// @arkesoft/api — SameOriginGuard, Orkestratör madde 3 (c)-(e) ölçümleri (QA tur 3)
//
// (a)/(b)/(c) zaten `same-origin-guard.test.ts`/`same-origin-guard-fail-
// closed.qa.test.ts`'te ÖLÇÜLÜ ve pinli (üretim testleri DEĞİŞTİRİLMEDİ,
// burada TEKRARLANMIYOR). Bu dosya SADECE (d) `Referer: evil` → reddediliyor
// mu VE (e) çoğul `Origin` başlığı → ne oluyor (solid tur2 L-4) sorularını,
// GERÇEK HTTP (d) ve HAM SOKET (e — supertest/superagent `.set()` TEK değeri
// ÜZERİNE YAZAR, ikinci bir `Origin` satırı EKLEYEMEZ; literal HTTP/1.1
// çerçevesi gerekir) ile ölçer.
//
// (e) — MUHASEBE: bu test İLK YAZILDIĞINDA solid tur2 L-4'ün varsayımını
// (dizi davranışı varsayarak "İLK değer okunur, saldırgan önce GÜVENİLİR
// orijini koyup İKİNCİ olarak kendi orijinini eklerse bypass OLABİLİR")
// DOĞRULAMAYA çalışıyordu — assert `200` BEKLİYORDU. GERÇEK ÖLÇÜM bunu
// ÇÜRÜTTÜ (`403`, `origin_mismatch`): Node'un HTTP/1.1 ayrıştırıcısı `origin`
// başlığını (ne `set-cookie` listesinde ne "son değeri KULLAN" özel
// listesinde) ASLA dizi olarak TESLİM ETMEZ — yinelenen satırları VİRGÜLLE
// BİRLEŞTİRİR (`"http://panel.arkesoft.localhost:3000, https://evil.example.com"`).
// `singleHeaderValue`'nin `Array.isArray` dalı bu başlık için YAPISAL OLARAK
// ASLA tetiklenmez (ÖLÇÜLDÜ) — birleşik dize `trustedOrigin`'e HİÇBİR ZAMAN
// birebir eşit olamaz (sonunda her zaman ikinci değer asılı kalır) →
// `origin_mismatch` → REDDEDİLİR. Yani bugünkü somut davranış FAIL-CLOSED'tır,
// ama BİLEREK/TASARLANARAK değil, Node'un header-birleştirme yan etkisiyle —
// solid'in önerdiği açık `Array.isArray` kontrolü hâlâ YARARLI (bir gün farklı
// bir HTTP adaptörü/HTTP2 gerçekten dizi teslim edebilir), ama BUGÜN istismar
// edilebilir bir bypass YOK (ölçüldü, aşağıda assert edilmiş).

import type { AddressInfo } from 'node:net'
import { connect } from 'node:net'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

describe('SameOriginGuard — (d)/(e) ölçümleri (QA tur 3, madde 3)', () => {
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

  it('(d) Origin YOK, Referer: https://evil.example.com + Cookie VAR → revoke-all 403 (REDDEDİLİR)', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const revokeAllResponse = await request(httpServer())
      .post('/auth/sessions/revoke-all')
      .set('Cookie', cookieHeader)
      .set('Referer', 'https://evil.example.com/csrf-form')

    expect(revokeAllResponse.status).toBe(403)
    expect(revokeAllResponse.body).toMatchObject({ code: 'CROSS_SITE_REQUEST_REJECTED' })

    const sessionsResponse = await request(httpServer())
      .get('/auth/sessions')
      .set('Cookie', cookieHeader)
    expect(sessionsResponse.status).toBe(200)
  })

  it(
    '(e) ÇOĞUL Origin başlığı (ham soket, iki ayrı "Origin:" satırı, biri GÜVENİLİR ' +
      'biri SALDIRGAN) → GERÇEK ÖLÇÜM: 403 origin_mismatch (Node virgülle birleştirir, ' +
      'asla dizi TESLİM ETMEZ bu başlık için — dosya başı "MUHASEBE" notuna bkz.)',
    async () => {
      const { cookieHeader } = await createAuthenticatedSession(httpServer())
      const server = httpServer()

      // Nest/http.Server henüz dinlemiyorsa (supertest kendi ephemeral portunu
      // kullanır) gerçek bir port'a ihtiyacımız var — `listen(0)` ile KENDİMİZ açıyoruz.
      await new Promise<void>((resolve) => {
        if (server.listening) {
          resolve()
          return
        }
        server.listen(0, resolve)
      })
      const address = server.address() as AddressInfo

      const rawResponse = await new Promise<{ statusLine: string; body: string }>(
        (resolve, reject) => {
          const socket = connect(address.port, '127.0.0.1', () => {
            const requestLines = [
              'POST /auth/sessions/revoke-all HTTP/1.1',
              `Host: 127.0.0.1:${String(address.port)}`,
              `Cookie: ${cookieHeader}`,
              // İKİ AYRI Origin satırı — supertest/superagent BUNU ÜRETEMEZ,
              // ham soket GEREKİR. İlki GÜVENİLİR, ikincisi SALDIRGAN.
              'Origin: http://panel.arkesoft.localhost:3000',
              'Origin: https://evil.example.com',
              'Content-Length: 0',
              'Connection: close',
              '',
              '',
            ]
            socket.write(requestLines.join('\r\n'))
          })

          let data = ''
          socket.on('data', (chunk) => {
            data += chunk.toString('utf-8')
          })
          socket.on('end', () => {
            const [statusLine, ...rest] = data.split('\r\n')
            const bodySeparatorIndex = data.indexOf('\r\n\r\n')
            const body = bodySeparatorIndex === -1 ? '' : data.slice(bodySeparatorIndex + 4)
            resolve({ statusLine: statusLine ?? '', body: body || rest.join('\n') })
          })
          socket.on('error', reject)
        },
      )

      // GERÇEK ÖLÇÜM (dosya başı "MUHASEBE" notu) — 403, 200 DEĞİL.
      expect(rawResponse.statusLine).toContain('403')
      expect(rawResponse.body).toContain('CROSS_SITE_REQUEST_REJECTED')

      // Guard istek REDDETTİYSE revoke-all ÇALIŞMADI — oturum HÂLÂ canlı.
      const sessionsResponse = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', cookieHeader)
      expect(sessionsResponse.status).toBe(200)
    },
  )
})

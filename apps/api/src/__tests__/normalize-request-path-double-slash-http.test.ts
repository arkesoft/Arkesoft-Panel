// @arkesoft/api — `GET //` GERÇEK HTTP gözlemi (T-022/S2 adım②, architect ⓵
// R-3/A-A22-1/A-A22-2)
//
// ⚠⚠ BU DOSYA ÜRETİM KODU DEĞİŞMEDEN YAZILDI VE KOŞTURULDU — mutasyon kanıtı
// (po "Mutasyon kanıtı ŞART KOŞULAN dört alt görev" tablosu, S2 adım②).
// Amaç `normalize-request-path.ts`'in BUGÜNKÜ (henüz düzeltilmemiş) hâliyle
// `GET //`'in GERÇEKTEN ne ürettiğini (status + gövde ŞEKLİ) ÖLÇMEK —
// architect'in §1 zincirinin (M-1..M-5) "`GET //` middleware zincirine
// GİRER" iddiasının VE A-A22-1/A-A22-2 varsayımlarının BAĞIMSIZ, HTTP
// seviyesinde teyidi.
//
// Zincir (architect ⓵): `TenantContextMiddleware.use()` → `isTenantExemptPath(
// '//')`  → `normalizeRequestPath('//')` → `new URL('//', 'http://normalize-
// request-path.invalid')` → BUGÜNKÜ (düzeltilmemiş) kodda bu çağrı try/catch
// DIŞINDADIR (`decodePathnameSafely`'nin try'ı yalnızca `decodeURIComponent`'i
// sarar, `new URL(...)`'in KENDİSİNİ SARMAZ) ⇒ `new URL('//', …)` FIRLAR
// (ölçüldü: `node -e "new URL('//', 'http://x.invalid')"` → `TypeError:
// Invalid URL`) ⇒ `normalizeRequestPath`'in SENKRON fırlatması middleware'in
// `async use()` metodunu REDDEDEN bir Promise'e çevirir.
//
// Bu test o reddin GERÇEKTE nereye düştüğünü (A-A22-2: Nest 12'nin
// `RouterProxy.createProxy` sarmalayıcısı middleware'i AYNEN controller'lar
// gibi `exceptionsHandler.next(e, host)`'a yönlendiriyor mu, yoksa dosya başı
// eski yorumun iddia ettiği gibi filter'a HİÇ ULAŞMIYOR mu) HTTP seviyesinde
// gözlemler — `node_modules/@nestjs/core`'un KENDİ kaynağı (`router-proxy.js`,
// `middleware-module.js:160-163`, `router-exception-filters.js`) BU testten
// BAĞIMSIZ olarak AYNI sonucu işaret ediyor: `APP_FILTER` (varsayılan/
// singleton scope, `logging.module.ts`) middleware'den fırlayan hatalara DA
// uygulanır (yalnızca REQUEST/TRANSIENT scope'lu global filtreler İSTİSNA —
// `RouterExceptionFilters.warnAboutScopedGlobalFilters`'in UYARI METNİ BUNU
// AÇIKÇA söylüyor). Bu test o STATİK OKUMAYI ÇALIŞMA ZAMANINDA doğrular.
//
// ⚠⚠ O KOŞUMDA (DoD, S2 adım②, üretim kodu DEĞİŞMEDEN) KIRMIZI GELMESİ
// ZORUNLU TUTULMUŞTU — bu testin assertion'ı BİLEREK §1.5 FIX'İNİN SONRASINI
// (`status !== 500`) kodluyordu, o anki kırık değeri (500) DEĞİL — aksi
// hâlde test totolojik olurdu (o anki 500'ü "bekle" demek, fix uygulandığında
// SESSİZCE yeşil kalan, hiçbir regresyonu yakalamayan bir "kanıt" üretirdi).
// O koşumda (üretim kodu DEĞİŞMEDEN) GÖZLENEN GERÇEK değer — rapora BİREBİR
// aktarılan — 500 + `{ code: 'INTERNAL_ERROR', ... }`'tı. solid FIX turu
// 1'in L-C bulgusu: §1.5'in fix'i (adım④) AYNI Task'ta indi ve bu test
// ARTIK (bugün) YEŞİL — aşağıdaki `it` başlığı/yorumu bu yüzden GEÇMİŞ
// ZAMANA çevrildi (assertion'a DOKUNULMADI, sadece anlatı — testin KENDİSİ
// hâlâ "500 DÖNMEZ" rejisyonunu KORUR, bakımcı `toBe(500)`'e çevirip kapıyı
// TERSİNE ÇEVİRMEMELİ).

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'

import { createTestApp } from './helpers/create-test-app.js'

describe('GET // — üretim kodu DEĞİŞMEDEN ölçülen BUGÜNKÜ davranış (T-022/S2 adım②)', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  // ⚠⚠ BU TESTİN assertion'ı BİLEREK "düzeltilmiş" davranışı kodluyor (500
  // DEĞİL) — DoD'nin o koşumda istediği "kırmızı" buydu: üretim kodu HENÜZ
  // değişmemişken BU KOŞUMDA kırmızı gelmesi GEREKİYORDU (madde④'ün fix'i
  // AYNI Task'ta indi, bu test ARTIK/bugün YEŞİL — solid FIX turu 1, L-C).
  // Testi "şu anki 500'ü BEKLE" şeklinde yazmak YANLIŞ olurdu — o totolojik
  // bir "kanıt" üretirdi (her koşumda otomatik yeşil, hiçbir şey KANITLAMAZ)
  // ve §1.5 fix'i UYGULANDIĞINDA bu test SESSİZCE yeşil KALIRDI, regresyonu
  // YAKALAMAZDI. ⚠ Bakımcı: assertion'ı `toBe(500)`'e ÇEVİRME — bu, kapıyı
  // TERSİNE çevirip gelecekteki bir regresyonu SESSİZCE geçirir.
  it('500 DÖNMEZ (üretimdeki GERÇEK davranış, §1.5 fix SONRASI) VE gövde AppExceptionFilter tel sözleşmesiyle (requestId + code) UYUMLUDUR — fix ÖNCESİ (üretim kodu değişmeden alınan koşumda) KIRMIZI GELMİŞTİ (A-A22-1 + A-A22-2)', async () => {
    const testApp = await createTestApp()
    app = testApp.app

    // `request(...).get('//')` supertest/superagent tarafından normalize
    // EDİLEBİLİR — ham `//` request-target'ı GARANTİ ETMEK için `http.request`
    // ile AYNI alt yapıyı kullanan `supertest`'in `.get(path)` imzası path'i
    // AYNEN `http.request({ path })`'e geçirir (encodeURI UYGULAMAZ).
    const response = await request(app.getHttpServer()).get('//')

    // `AppExceptionFilter`'ın `mapErrorToResponse` tel sözleşmesi: temiz JSON
    // gövde, en az `code` + `requestId` alanları — Nest'in KENDİ ham HTML hata
    // sayfası DEĞİL. Bu İKİ assertion BU KOŞUMDA DA (fix öncesi) GEÇER —
    // A-A22-2'nin BAĞIMSIZ, HTTP seviyesindeki teyidi: middleware'den
    // (`TenantContextMiddleware.use()`) fırlayan senkron `TypeError`
    // `AppExceptionFilter`'A ULAŞIYOR (filter'a hiç ulaşmasaydı Nest'in
    // varsayılan hata gövdesi `code`/`requestId` TAŞIMAZDI).
    expect(response.headers['x-request-id']).toBeDefined()
    expect(typeof response.body).toBe('object')
    expect(response.body).toHaveProperty('code')
    expect(response.body).toHaveProperty('requestId')

    // ⭐⭐ ASIL KIRMIZI/YEŞİL AYRACI (DoD, adım⑥'nın "500 DEĞİL" şartı):
    // Fix ÖNCESİ (üretim kodu değişmeden alınan koşumda) `normalizeRequestPath(
    // '//')` senkron FIRLIYORDU → `mapUnknownError` → 500 + `code:
    // 'INTERNAL_ERROR'` (ÖLÇÜLDÜ, o koşumun ham logu raporda). Fix SONRASI
    // (§1.5, BUGÜNKÜ/üretimdeki davranış) `'//'` hiçbir ÖNEKLE (`/health`,
    // `/auth`, `/trpc`) eşleşmediği için Nest'in KENDİ `NotFoundException`'ına
    // (`HttpException`, 404) düşer — `mapHttpException` → 404 + `code:
    // 'HTTP_EXCEPTION'` (ÖLÇÜLDÜ, bkz. yukarıdaki test başlığı).
    expect(response.status).not.toBe(500)
  })
})

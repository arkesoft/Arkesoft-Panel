// @arkesoft/api — SameOriginGuard teşhis alanları (ROADMAP v0.0.21.1, T-025/S5,
// AC-28) — YENİ, TEK dosya. `S1`-`S4` bitti; bu dosya `same-origin.guard.ts`,
// `trusted-origins.ts`, `api-env.ts` ÜRETİM dosyalarına TEK SATIR DOKUNMAZ.
//
// AC-28'in İKİ yönlü iddiası (T-025.md:209-212, birebir): reddedilen istek için
// üretilen kayıt isteğin `Origin`/`Referer` **DEĞERİNİ içermiyor** (negatif,
// test ZORUNLU) ama operatörün yapılandırma hatasını saldırıdan **ayırt
// etmesine yeten** teşhis alanlarını (`reason`/`branch`/`trustedOriginCount`/
// `trustedOriginSources`) TAŞIYOR (pozitif). Bu dosya BU dört maddeyi tek bir
// `describe` ailesinde pinler:
//
//   (a) POZİTİF  — kayıt teşhis alanlarını BEKLENEN değerlerle taşıyor
//                  (`branch: 'referer_header'` — `D24` sınıfının TAM imzası,
//                  T-025.md:359).
//   (b) NEGATİF  — AYNI koşumun TÜM NDJSON log metninde orijin DEĞERİ (tam
//                  URL'si, hostname'i, herhangi bir parçası) HİÇ geçmiyor.
//   (c) TEL      — 403 yanıt gövdesi `AppErrorBody`'nin (ÖLÇÜLDÜ, dört alan:
//                  `code`/`message`/`details`/`requestId`, `error-body.ts`)
//                  DIŞINA hiçbir teşhis alanı/orijin DEĞERİ SIZDIRMIYOR;
//                  `details` BOŞ (`{}`) — `trpc-error-boundary-logging.test.ts:249`'un
//                  AYNI "gövde temiz" deseni (`Object.keys(...).sort()` ile
//                  alan listesi KAPALI küme).
//   (d) R11/R12  — kiracı/biçimsel orijin reddinin ŞEMADA DEĞİL TÜRETMEDE
//                  (guard'ın YAPICISI) olduğunun KALICI pini:
//                  `createTestApp({ apiEnv })` `API_ENV` provider'ını TAMAMEN
//                  override ettiği için (`create-test-app.ts:492-494`) şema
//                  doğrulaması (`apiEnvSchema`) o testlerde HİÇ ÇALIŞMAZ —
//                  reddin GERÇEKLEŞTİĞİNİ görmek, reddin TÜRETMEDE olduğunun
//                  TEK kalıcı kanıtıdır (şemada olsaydı override edilmiş
//                  env'de HİÇ koşmazdı, sessizce geçerdi).
//
// ⚠⚠ BOŞLUK (VACUITY) SAVUNMASI — emsal `two-factor-acceptance-ac4-secret-
// redaction-vacuity.test.ts`'in deseni, (a)/(b)/(c) İÇİN BİREBİR uygulanır:
//   1. Güvenilmeyen orijin AYIRT EDİCİ bir jeton (`probe-d24.arkesoft.test`,
//      port `65123`) — tesadüfi bir alt dize İLE çakışıp (b)'yi YALANCI
//      yeşile düşürmesin.
//   2. (a) ve (b) AYNI testte, AYNI koşumda, AYNI istekten İDDİA EDİLİR —
//      "kayıt hiç üretilmedi" durumu (b)'yi BOŞA düşürmesin (kayıt VARLIĞI
//      önce (a) ile PİNLENİR, SONRA içeriği (b) ile taranır).
//   3. Negatif tarama hostname'i de KAPSAR (`probe-d24.arkesoft.test` alt
//      dizesi), yalnızca tam URL'yi DEĞİL.
//
// ⚠ Yerel `createMemoryLogStream` — depo emsali BİLİNÇLİ kopya (20+ dosyada
// AYNI yardımcı, paylaşıma çıkarmak bu alt görevin KAPSAMI DIŞINDA).
// ⚠ `pnpm --filter <paket> <script> -- <desen>` filtre UYGULAMAZ — bu dosya
// `apps/api` dizininden `npx vitest run same-origin-guard-diagnostics` ile
// koşturulur.

import { Writable } from 'node:stream'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import { appErrorBodySchema } from '@arkesoft/errors'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { resolveTrustedOrigins } from '../auth/trusted-origins.js'
import { apiEnvSchema, splitAdditionalTrustedOrigins } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

/** Diğer `same-origin-guard*.test.ts` dosyalarıyla AYNI türetme deseni. */
const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

/**
 * `same-origin.guard.ts`'in `determineTrustedOriginSources`'ının (satır
 * 262-274, DIŞA AKTARILMAZ) test-yerel AYNASI — yalnızca BU dosyanın
 * beklenen değer HESAPLAMASI için, ÜRETİM mantığı İKİNCİ KEZ İCAT EDİLMEZ
 * (aynı üç alan VAR MI/BOŞ MU sorusu). Üretim kodu bu fonksiyonu HİÇ
 * İTHAL ETMEZ — yalnızca `expect(...).toEqual(...)` için beklenen değer
 * üretir, boşluk savunmasının "beklenen DEĞER" yarısını somutlaştırır.
 */
function expectedTrustedOriginSources(env: ApiEnv): readonly string[] {
  const sources: string[] = ['AUTH_BASE_URL']

  if (env.SUPERADMIN_BASE_URL !== undefined) {
    sources.push('SUPERADMIN_BASE_URL')
  }

  if (splitAdditionalTrustedOrigins(env.ADDITIONAL_TRUSTED_ORIGINS).length > 0) {
    sources.push('ADDITIONAL_TRUSTED_ORIGINS')
  }

  return sources
}

const EXPECTED_TRUSTED_ORIGIN_COUNT = resolveTrustedOrigins(BASE_ENV).length
const EXPECTED_TRUSTED_ORIGIN_SOURCES = expectedTrustedOriginSources(BASE_ENV)

/** Guard'ın `warn` logunun olay metni — `same-origin.guard.ts`'teki literalle BİREBİR. */
const VIOLATION_LOG_MESSAGE = 'aynı-orijin olmayan istek reddedildi'

/**
 * ⚠⚠ AYIRT EDİCİ (boşluk savunması madde 1) — hostname VE port, bu depoda
 * başka HİÇBİR sebeple log metninde geçmeyecek kadar BENZERSİZ olmalı.
 * `probe-d24` jetonu D24'e (bu Task'ın kaynak teknik borcu) atıfla seçildi.
 */
const PROBE_ORIGIN = 'http://probe-d24.arkesoft.test:65123'
const PROBE_HOSTNAME = 'probe-d24.arkesoft.test'
const PROBE_PORT = '65123'

const logRecordSchema = z.record(z.string(), z.unknown())

/** `trpc-error-boundary-logging.test.ts`'in AYNI yerel yardımcısı (depo emsali, bilinçli kopya). */
function createMemoryLogStream(): {
  readonly stream: Writable
  readonly getFullText: () => string
  readonly getRecords: () => Record<string, unknown>[]
} {
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })

  const getFullText = (): string => Buffer.concat(chunks).toString('utf-8')

  return {
    stream,
    getFullText,
    getRecords: () =>
      getFullText()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => logRecordSchema.parse(JSON.parse(line))),
  }
}

/**
 * Guard'ın `canActivate`'teki `warn` kaydının ÖLÇÜLEN şekli (ROADMAP
 * v0.0.21.1, T-025/S3, `K3`) — dört teşhis alanı + enjekte edilen logger'ın
 * bağladıkları. `z.looseObject` — `trpc-error-boundary-logging.test.ts:108`'in
 * AYNI gerekçesi (bilinmeyen anahtarları DÜŞÜRMEYEN şema, vacuous assert riski
 * olmadan ek alanları da görünür kılar).
 */
const violationRecordSchema = z.looseObject({
  level: z.string(),
  msg: z.literal(VIOLATION_LOG_MESSAGE),
  reason: z.string(),
  branch: z.string(),
  trustedOriginCount: z.number(),
  trustedOriginSources: z.array(z.string()),
})

describe(
  'AC-28 (a)+(b)+(c) — teşhis alanları VAR + orijin DEĞERİ hiçbir yerde YOK + ' +
    'yanıt gövdesi temiz (TEK koşum, boşluk savunmalı)',
  () => {
    let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined
    let getFullLogText: () => string
    let getLogRecords: () => Record<string, unknown>[]

    beforeAll(async () => {
      const { stream, getFullText, getRecords } = createMemoryLogStream()
      getFullLogText = getFullText
      getLogRecords = getRecords

      const testApp = await createTestApp({ stream })
      app = testApp.app
    }, 60_000)

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

    it(
      '(a) kayıt beklenen teşhis alanlarını taşıyor (branch=referer_header, D24 sınıfı) · ' +
        "(b) AYNI koşumun TÜM log metninde PROBE orijininin değeri/hostname'i/parçası YOK · " +
        '(c) 403 gövdesi AppErrorBody dışına hiçbir teşhis alanı/orijin SIZDIRMIYOR',
      async () => {
        const { cookieHeader } = await createAuthenticatedSession(httpServer())

        // `Origin` YOK, `Referer` GÜVENİLMEYEN PROBE orijininden — guard'ın
        // `Referer`'a düşüş dalı (`branch: 'referer_header'`, D24 sınıfı).
        const response = await request(httpServer())
          .get('/trpc/session.me')
          .set('Cookie', cookieHeader)
          .set('Referer', `${PROBE_ORIGIN}/attacker-form`)

        // --- (c) TEL YARISI: yanıt gövdesi TEMİZ --------------------------
        expect(response.status).toBe(403)
        // ⚠ `response.body` dış kaynaklı (HTTP yanıtı) veridir — `any` ile
        // okunmaz, `appErrorBodySchema` (`@arkesoft/errors`, tel sözleşmesinin
        // TEK tanımı) ile parse edilir (`trpc-error-boundary-logging.test.ts:244`'ün
        // AYNI deseni).
        const appErrorBody = appErrorBodySchema.parse(response.body)
        expect(appErrorBody.code).toBe('CROSS_SITE_REQUEST_REJECTED')
        // ⚠ ÖLÇÜLDÜ: gövde `AppErrorBody`'nin dört sabit alanıdır (code/
        // message/details/requestId, `error-body.ts` — v0.0.22 public API
        // sözleşmesi); teşhis alanları (`branch`/`trustedOriginCount`/
        // `trustedOriginSources`) VE orijin DEĞERİ bu KAPALI kümenin
        // DIŞINDA yaşar, `details` BOŞTUR.
        expect(appErrorBody.details).toEqual({})
        expect(Object.keys(appErrorBody).sort()).toEqual([
          'code',
          'details',
          'message',
          'requestId',
        ])
        const responseBodyText = JSON.stringify(response.body)
        expect(responseBodyText).not.toContain(PROBE_ORIGIN)
        expect(responseBodyText).not.toContain(PROBE_HOSTNAME)
        expect(responseBodyText).not.toContain(PROBE_PORT)
        expect(responseBodyText).not.toContain('branch')
        expect(responseBodyText).not.toContain('trustedOriginCount')
        expect(responseBodyText).not.toContain('trustedOriginSources')

        // --- (a) POZİTİF: kayıt ÜRETİLDİ ve teşhis alanları BEKLENEN -------
        // değerlerle VAR. ⚠⚠ Boşluk savunması madde 2: bu adım (b)'den ÖNCE
        // VE AYNI testte koşar — "kayıt hiç üretilmedi" durumu burada
        // `toHaveLength(1)` ile KAPATILIR, (b)'nin "değer yok" iddiası bu
        // yüzden ANLAMSIZ yeşile düşemez.
        const violationRecords = getLogRecords()
          .filter((record) => record['msg'] === VIOLATION_LOG_MESSAGE)
          .map((record) => violationRecordSchema.parse(record))
        expect(violationRecords).toHaveLength(1)
        const [violationRecord] = violationRecords
        if (violationRecord === undefined) {
          throw new Error('ihlal kaydı bulunamadı')
        }
        expect(violationRecord.reason).toBe('origin_mismatch')
        expect(violationRecord.branch).toBe('referer_header')
        expect(violationRecord.trustedOriginCount).toBe(EXPECTED_TRUSTED_ORIGIN_COUNT)
        expect(violationRecord.trustedOriginSources).toEqual(EXPECTED_TRUSTED_ORIGIN_SOURCES)

        // --- (b) NEGATİF: AYNI koşumun TÜM NDJSON metninde orijin DEĞERİ --
        // hiçbir yerde YOK — tam URL, hostname, port, HERHANGİ bir parçası.
        const fullLogText = getFullLogText()
        expect(fullLogText).not.toContain(PROBE_ORIGIN)
        expect(fullLogText).not.toContain(PROBE_HOSTNAME)
        expect(fullLogText).not.toContain(PROBE_PORT)
        expect(fullLogText).not.toContain('probe-d24')
      },
      30_000,
    )
  },
)

describe(
  'R11/R12 kalıcı pini — kiracı/biçimsel orijin reddi ŞEMADA DEĞİL, AÇILIŞ ZAMANLI ' +
    'türetmede (`resolveTrustedOrigins` — guard YAPICISI `same-origin.guard.ts:291` ' +
    '*VEYA* `auth-instance.ts`nin `trustedOrigins` seçeneği, `createTestApp({ apiEnv })` ' +
    'ile `apiEnvSchema` HİÇ koşmadan) — ⚠ M2 düzeltmesi (solid gate tur1): bu describe ' +
    "GUARD'I İZOLE ETMİYOR, `resolveTrustedOrigins` açılışta İKİ yerden çağrılıyor " +
    '(ÖLÇÜLDÜ: `same-origin.guard.ts:291` ve `auth-instance.ts:693`), bu yüzden hangisinin ' +
    "FIRLADIĞI TESTTEN BELİRSİZ — (d)-1/(d)-2 bu yüzden SADECE `app.init()`'in fırladığını " +
    'DEĞİL, üretim fonksiyonunun (`trusted-origins.ts`) KENDİ, ÖLÇÜLMÜŞ hata desenini pinler.',
  () => {
    const KIRACI_SUBDOMAIN_ORIGIN = `http://kiraci.${BASE_ENV.APP_BASE_DOMAIN}`
    // ⚠ Virgül İÇERMEZ (tek parça) ve `new URL(...)` için ayrıştırılamaz —
    // şema olmadan, boşluklu, biçimsel olarak bozuk (`trusted-origins.ts`'in
    // `isTrustedOrigin`/`resolveTrustedOrigins`'inin `new URL()` adımında FIRLAR).
    const MALFORMED_ADDITIONAL_TRUSTED_ORIGIN = 'bu-bir-url-degil boslukluvesemasiz-d24-probe'
    const RESERVED_SUBDOMAIN_ORIGIN = `http://panel.${BASE_ENV.APP_BASE_DOMAIN}`

    it(
      "(d)-1 kiracı alt alan adı (ADDITIONAL_TRUSTED_ORIGINS='kiraci.<APP_BASE_DOMAIN>') → " +
        'createTestApp({ apiEnv }) app.init() aşamasında `trusted-origins.ts`nin KENDİ ' +
        'kiracı-reddi hatasıyla FIRLAR (⚠ M2 düzeltmesi — argümansız `toThrow()` HERHANGİ ' +
        'init hatasını kabul ederdi; burada üretim literalinin KENDİSİ, ' +
        '`trusted-origins.ts:129-131`, pinlenir)',
      async () => {
        const invalidEnv: ApiEnv = {
          ...BASE_ENV,
          ADDITIONAL_TRUSTED_ORIGINS: KIRACI_SUBDOMAIN_ORIGIN,
        }

        await expect(createTestApp({ apiEnv: invalidEnv })).rejects.toThrow(
          /kiracı alt alan adı içeremez/,
        )
      },
      60_000,
    )

    it(
      '(d)-2 biçimsel olarak bozuk ADDITIONAL_TRUSTED_ORIGINS girdisi → ' +
        'createTestApp({ apiEnv }) app.init() aşamasında `new URL(...)`nin KENDİ ' +
        'ayrıştırma hatasıyla (`TypeError: Invalid URL`) FIRLAR (⚠ M2 düzeltmesi — ÖLÇÜLDÜ, ' +
        '`node -e "new URL(\'bu-bir-url-degil boslukluvesemasiz-d24-probe\')"` AYNI sınıf/' +
        'mesajı üretir)',
      async () => {
        const invalidEnv: ApiEnv = {
          ...BASE_ENV,
          ADDITIONAL_TRUSTED_ORIGINS: MALFORMED_ADDITIONAL_TRUSTED_ORIGIN,
        }

        await expect(createTestApp({ apiEnv: invalidEnv })).rejects.toThrow(/Invalid URL/)
      },
      60_000,
    )

    it(
      "(d)-3 NEGATİF KONTROL — REZERVE alt alan adı ('panel.<APP_BASE_DOMAIN>') → " +
        'FIRLAMAZ (reddin ŞEMADA değil TÜRETMEDE olduğunun ayırt edici kanıtı: bu, ' +
        'tenant reddiyle AYNI koşulda, tek fark rezerve etiket olan bir girdi)',
      async () => {
        const validEnv: ApiEnv = {
          ...BASE_ENV,
          ADDITIONAL_TRUSTED_ORIGINS: RESERVED_SUBDOMAIN_ORIGIN,
        }

        const testApp = await createTestApp({ apiEnv: validEnv })
        await testApp.app.close()
      },
      60_000,
    )

    it(
      "(d)-4 AYNA-TEST TUZAĞININ KAPANMASI (solid gate tur1 M1) — (d)-3'ün AYNI " +
        "geçerli ADDITIONAL_TRUSTED_ORIGINS ('panel.<APP_BASE_DOMAIN>') GERÇEKTEN " +
        "katkıda bulunduğunda kayıt trustedOriginSources=['AUTH_BASE_URL'," +
        "'ADDITIONAL_TRUSTED_ORIGINS'] taşıyor VE trustedOriginCount BASE_ENV'in " +
        '(1) ÜZERİNE çıkıyor — `determineTrustedOriginSources`in İKİNCİ dalı burada ' +
        'GERÇEKTEN KOŞUYOR (M1 öncesi: bu dal hiçbir testte çalışmıyordu, gövde ' +
        'sabite indirgense bile ayna-test yeşil kalırdı)',
      async () => {
        const validEnv: ApiEnv = {
          ...BASE_ENV,
          ADDITIONAL_TRUSTED_ORIGINS: RESERVED_SUBDOMAIN_ORIGIN,
        }

        const { stream, getRecords } = createMemoryLogStream()
        const testApp = await createTestApp({ apiEnv: validEnv, stream })

        try {
          const { cookieHeader } = await createAuthenticatedSession(testApp.app.getHttpServer())

          // (a)+(b)+(c) describe'ındaki AYNI ihlal deseni (`Referer` güvenilmeyen
          // PROBE orijininden, `Origin` YOK) — AMA bu kez `validEnv` ile kurulan,
          // ADDITIONAL_TRUSTED_ORIGINS'in GERÇEKTEN katkıda bulunduğu bir uygulama
          // örneğine karşı.
          const response = await request(testApp.app.getHttpServer())
            .get('/trpc/session.me')
            .set('Cookie', cookieHeader)
            .set('Referer', `${PROBE_ORIGIN}/attacker-form`)

          expect(response.status).toBe(403)

          const violationRecords = getRecords()
            .filter((record) => record['msg'] === VIOLATION_LOG_MESSAGE)
            .map((record) => violationRecordSchema.parse(record))
          expect(violationRecords).toHaveLength(1)
          const [violationRecord] = violationRecords
          if (violationRecord === undefined) {
            throw new Error('ihlal kaydı bulunamadı')
          }

          // ⭐ M1 düzeltmesi — `determineTrustedOriginSources`'ın İKİNCİ dalı
          // (ADDITIONAL_TRUSTED_ORIGINS) burada GERÇEKTEN koştu: liste yalnızca
          // `['AUTH_BASE_URL']` DEĞİL, ikinci kaynağı da TAŞIYOR.
          expect(violationRecord.trustedOriginSources).toEqual([
            'AUTH_BASE_URL',
            'ADDITIONAL_TRUSTED_ORIGINS',
          ])
          // ⭐ Sayaç BASE_ENV'in (1, yalnızca AUTH_BASE_URL) ÜZERİNE çıktı —
          // "gövde sabite indirgense bile yeşil kalır" tuzağı burada KAPANIR.
          expect(violationRecord.trustedOriginCount).toBeGreaterThan(EXPECTED_TRUSTED_ORIGIN_COUNT)
          // Üretim fonksiyonunun (`resolveTrustedOrigins`, bu dosyanın ZATEN
          // ithal ettiği) KENDİSİYLE karşılaştırma — ikinci bir mirror İCAT
          // EDİLMEZ, beklenen sayı GERÇEK türetmeden gelir.
          expect(violationRecord.trustedOriginCount).toBe(resolveTrustedOrigins(validEnv).length)
        } finally {
          await testApp.app.close()
        }
      },
      60_000,
    )
  },
)

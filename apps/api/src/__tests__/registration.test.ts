// @arkesoft/api — kayıt akışının ENTEGRASYON testleri (ROADMAP v0.1.0,
// T-019/S9b, architect ADR-0021, Task "TAMAMLANMA TANIMI — ON BİR KABUL
// KRİTERİ")
//
// ⚠⚠ ÜRETİM KODU BU DOSYADA YAZILMADI — `RegistrationService` S9a'nın işi,
// kapılar yeşildi. Bu dosya SADECE test yazar.
//
// ⚠⚠ ORAN SINIRI BÜTÇESİ (R-PO1, BAĞLAYICI): `EMAIL_IP_LIMIT = 10` (saat/IP,
// `rate-limit.policy.ts:134`), sayaçlar YALNIZCA `createTestApp()` anında
// temizleniyor. Bu dosya TEK doğrulanmış oturumu (`actor`) TÜM testlerde
// YENİDEN KULLANIR — `createAuthenticatedSession()` (yani `/auth/sign-up/email`)
// bu dosyada TOPLAM **1 KEZ** çağrılır (bkz. `beforeAll`). AC-8'in "uzun taban
// alan adı" senaryosu İKİNCİ bir `createTestApp()` açar AMA kimlik doğrulaması
// GEREKTİRMEZ (`checkSlugAvailability` aktörsüz bir metot) — o blokta SIFIR
// ek `sign-up`.
//
// ⚠⚠ ÇOĞU AC, `RegistrationService`'in metotlarını `app.get(RegistrationService)`
// ÜZERİNDEN DOĞRUDAN ÇAĞIRIR — HTTP/`RateLimitGuard` katmanını ATLAR. Gerekçe
// ÖLÇÜLDÜ: `checkSlugAvailability`/`createTenant` `rate-limit.policy.ts`'te
// `LOGIN_ACCOUNT_LIMIT = 5` (15 dk/hesap) ile sınırlı — AC-4'ün 12 rezerve
// üyeyi TEK HTTP oturumuyla sorgulaması 6. istekte 429 ALIRDI (K7'nin
// düzelttiği semptomun AYNISI, başka sebepten). `tenant-resolver.test.ts`
// (T-002/ST-5) AYNI deseni servis metodunu DOĞRUDAN çağırarak kurmuştu —
// emsal YENİ değil. Sadece AC-2/AC-5/AC-15 — "sunucu TARAFINDAN GERÇEKTEN
// doğrulandığını" veya "tel GÖVDESİNİN GERÇEK biçimini" ölçmek GEREKEN üç
// yer — GERÇEK HTTP'den geçer (toplam üç `/trpc/registration.*` HTTP
// isteği + bir `/trpc/storefront.currentTenant` isteği, hiçbiri 5'lik eşiği
// zorlamaz).
//
// ⚠ `packages/db`'nin `AppPrismaDatabase`/`TenantTransactionClient`
// allowlist'leri (`client.ts`) BİLEREK `plan`/`tenantVersionState`
// taşımaz — bu dosya bu İKİ platform/kiracı tablosunu OKUMAK için KENDİ
// bağımsız (admin tarzı) `PrismaDatabase` istemcisini (`rawDb`) kurar
// (`createPrismaClient`, `@arkesoft/db`). `tenant_version_state` RLS `FORCE`
// taşıdığı için okuma `tenant-context.ts`'in AYNI `set_config(…, true)`
// deseniyle GUC'u KENDİ transaction'ında kurar — RLS'i BAYPAS ETMEZ, test
// amaçlı OLARAK YENİDEN UYGULAR (CLAUDE.md §4/§7 istisnası — platform dışı
// bir tabloyu okumak için gerekçeli ham erişim). `app.tenant_id`/`set_config`
// jetonları AC4'ün taramasının KAPSAMI DIŞINDA (`scripts/guards.sh:363`
// `-not -path '*/__tests__/*'`), bu yüzden burada güvenle yazılabilir.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { createPrismaClient, TenantRole, TenantStatus } from '@arkesoft/db'
import type { PrismaDatabase } from '@arkesoft/db'
import { appErrorBodySchema, toErrorBody } from '@arkesoft/errors'
import { normalizeHostname, RESERVED_SUBDOMAINS, resolveHost } from '@arkesoft/tenancy'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { TenantNotFoundError } from '../errors/domain/tenant-not-found.error.js'
import { ValidationError } from '../errors/domain/validation.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { RegistrationService } from '../registration/registration.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import type { AuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 10)}`
}

/** `TENANT_SLUG_PATTERN`'i geçen, TAM 63 karakterlik küçük harf+rakam slug. */
function maxLengthSlug(prefix: string): string {
  const suffix = randomUUID().replaceAll('-', '')
  const candidate = `${prefix}${suffix}`.toLowerCase()
  return candidate.length >= 63 ? candidate.slice(0, 63) : candidate.padEnd(63, '0')
}

const trpcErrorEnvelopeSchema = z.object({
  error: z.object({
    data: z.object({ code: z.string(), httpStatus: z.number(), appError: appErrorBodySchema }),
  }),
})

describe('registration.* — kayıt akışının iş mantığı (gerçek Postgres + gerçek HTTP), ROADMAP v0.1.0', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let registrationService: RegistrationService
  /** Platform tabloları (`plan`) VE `tenant_version_state` için bağımsız okuma istemcisi — dosya başı yorumu. */
  let rawDb: PrismaDatabase
  /** TÜM testlerde YENİDEN KULLANILAN TEK doğrulanmış oturum (bütçe raporu, dosya başı yorumu). */
  let actor: AuthenticatedSession

  const createdTenantIds: string[] = []

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    registrationService = app.get(RegistrationService)
    rawDb = createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_URL })

    // ⚠⚠ BÜTÇE — bu dosyanın TEK `sign-up` çağrısı.
    actor = await createAuthenticatedSession(app.getHttpServer())
  }, 120_000)

  afterAll(async () => {
    if (app !== undefined) {
      for (const tenantId of createdTenantIds) {
        await prismaService.db.tenant.delete({ where: { id: tenantId } }).catch(() => undefined)
      }
      await rawDb.$disconnect()
      await app.close()
    }
  }, 60_000)

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  /** ⚠ GUC `set_config` tam `tenant-context.ts`'in deseni — RLS BAYPAS edilmez, yeniden kurulur (dosya başı yorumu). */
  async function countTenantVersionStateRows(tenantId: string): Promise<number> {
    return rawDb.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      return tx.tenantVersionState.count({ where: { tenantId } })
    })
  }

  /** Yeni oluşturulan kiracıyı `afterAll`'da temizlenecek listeye ekler. */
  function trackTenant(tenantId: string): void {
    createdTenantIds.push(tenantId)
  }

  // -------------------------------------------------------------------------
  // AC-4 — 12 rezerve üyenin TAMAMI reddedilir, KÜME EŞİTLİĞİ (alt küme DEĞİL)
  // -------------------------------------------------------------------------
  describe('AC-4 — rezerve alt alan adları', () => {
    /**
     * ⚠⚠ Üretim listesinden (`RESERVED_SUBDOMAINS`) AYRI, ELLE yazılmış 12
     * literal — bu, "üye çıkarılınca test KIRMIZI dönmeli" şartının mekanik
     * karşılığı: yalnızca `RESERVED_SUBDOMAINS` üzerinde `for...of` yapsaydık,
     * üretim listesi küçülse test SESSİZCE daha az üye kontrol ederdi (alt
     * küme totolojisi). Burada İKİ bağımsız küme KARŞILAŞTIRILIR.
     */
    const EXPECTED_RESERVED_SUBDOMAINS = [
      'www',
      'api',
      'admin',
      'app',
      'panel',
      'cdn',
      'static',
      'assets',
      'mail',
      'superadmin',
      'status',
      'docs',
    ] as const

    it('üretim kümesi TAM OLARAK bu 12 literalden oluşur (küme eşitliği, alt küme DEĞİL)', () => {
      expect(new Set(RESERVED_SUBDOMAINS)).toEqual(new Set(EXPECTED_RESERVED_SUBDOMAINS))
      expect(RESERVED_SUBDOMAINS.size).toBe(12)
    })

    it('12 literalin HER BİRİ checkSlugAvailability tarafından `reserved` ile reddedilir', async () => {
      for (const reserved of EXPECTED_RESERVED_SUBDOMAINS) {
        const result = await registrationService.checkSlugAvailability(reserved)
        expect(result, `"${reserved}" → reserved beklenir`).toEqual({ outcome: 'reserved' })
      }
    })

    it('VACUOUS DEĞİL: rezerve OLMAYAN, var olmayan bir slug `available` döner', async () => {
      const result = await registrationService.checkSlugAvailability(uniqueSlug('ac4-control'))
      expect(result).toEqual({ outcome: 'available' })
    })
  })

  // -------------------------------------------------------------------------
  // AC-8 — kabul oracle'ı round-trip + uzun taban alan adı
  // -------------------------------------------------------------------------
  describe('AC-8 — round-trip (kabul ⊆ çözümlenebilir)', () => {
    it('kayıtta `available` kabul edilen HER slug, resolveHost ile BAĞIMSIZ OLARAK çözülür (kısa, uzun, tireli)', async () => {
      const normalizedBaseDomain = normalizeHostname(BASE_ENV.APP_BASE_DOMAIN)
      if (normalizedBaseDomain === undefined) {
        throw new Error('APP_BASE_DOMAIN normalize edilemedi')
      }

      const candidates = [
        uniqueSlug('a'),
        maxLengthSlug('ac8-long-'),
        `t19-${randomUUID().slice(0, 4)}-ac8-tireli`,
      ]

      for (const slug of candidates) {
        const outcome = await registrationService.checkSlugAvailability(slug)
        expect(outcome, `"${slug}" → available beklenir`).toEqual({ outcome: 'available' })

        // ⭐⭐ BAĞIMSIZ doğrulama — `resolveHost` servisin KENDİ oracle
        // çağrısından AYRI, doğrudan burada ÇALIŞTIRILIR (paylaşılan bir
        // regex'e güvenilmez, R-A3).
        const resolved = resolveHost(`${slug}.${normalizedBaseDomain}`, normalizedBaseDomain)
        expect(resolved, `"${slug}" → resolveHost ile ÇÖZÜLEBİLMELİ`).toEqual({
          kind: 'subdomain',
          slug,
        })
      }
    })

    it('63 karakterlik MEŞRU bir slug + UZUN APP_BASE_DOMAIN ⇒ `unreachable` (host 255 sınırını aşar)', async () => {
      // 4 etiket × 60 karakter + 3 nokta = 243 + taban uzantı ≈ 250+ karakter.
      const longBaseDomain = Array.from({ length: 4 }, () => 'a'.repeat(60)).join('.')
      const slug = 'b'.repeat(63)
      expect(slug.length + 1 + longBaseDomain.length).toBeGreaterThan(255)

      const longDomainTestApp = await createTestApp({
        apiEnv: { ...BASE_ENV, APP_BASE_DOMAIN: longBaseDomain },
      })
      try {
        const longDomainRegistration = longDomainTestApp.app.get(RegistrationService)
        // ⚠ Aktörsüz çağrı — SIFIR ek `sign-up` (dosya başı yorumu).
        const outcome = await longDomainRegistration.checkSlugAvailability(slug)
        expect(outcome).toEqual({ outcome: 'unreachable' })
      } finally {
        await longDomainTestApp.app.close()
      }
    }, 60_000)
  })

  // -------------------------------------------------------------------------
  // AC-5 / AC-6 — 'taken' alan hatası + yarış koşulu
  // -------------------------------------------------------------------------
  describe('AC-5 — "taken" alan bazlı hata', () => {
    it('DOĞRUDAN servis çağrısı: slug zaten var ⇒ ValidationError{ fields: { slug: "errors.slug.taken" } }', async () => {
      const takenSlug = uniqueSlug('ac5-direct')
      const first = await registrationService.createTenant(actor.userId, {
        name: 'AC-5 İlk Mağaza',
        slug: takenSlug,
        siteType: 'ecommerce',
      })
      trackTenant(
        (await prismaService.db.tenant.findUniqueOrThrow({ where: { slug: takenSlug } })).id,
      )
      expect(first).toEqual({ slug: takenSlug, status: TenantStatus.pending })

      let caught: unknown
      try {
        await registrationService.createTenant(actor.userId, {
          name: 'AC-5 İkinci Deneme',
          slug: takenSlug,
          siteType: 'corporate',
        })
      } catch (error) {
        caught = error
      }

      if (!(caught instanceof ValidationError)) {
        throw new Error(`beklenen ValidationError değil: ${String(caught)}`)
      }
      expect(caught.code).toBe('VALIDATION_ERROR')
      expect(caught.fields).toEqual({ slug: 'errors.slug.taken' })
    }, 60_000)

    it('⭐ TEL GÖVDESİ: GERÇEK HTTP üzerinden aynı sonuç — {code:"VALIDATION_ERROR", fields:{slug:"errors.slug.taken"}}', async () => {
      const takenSlug = uniqueSlug('ac5-wire')
      const created = await registrationService.createTenant(actor.userId, {
        name: 'AC-5 Tel Mağazası',
        slug: takenSlug,
        siteType: 'ecommerce',
      })
      trackTenant(
        (await prismaService.db.tenant.findUniqueOrThrow({ where: { slug: created.slug } })).id,
      )

      const response = await request(httpServer())
        .post('/trpc/registration.createTenant')
        .set('Cookie', actor.cookieHeader)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ name: 'AC-5 Tel İkinci', slug: takenSlug, siteType: 'ecommerce' })

      expect(response.status).toBe(400)
      const envelope = trpcErrorEnvelopeSchema.parse(response.body)
      expect(envelope.error.data.appError.code).toBe('VALIDATION_ERROR')
      expect(envelope.error.data.appError.details).toEqual({
        fields: { slug: 'errors.slug.taken' },
      })
    }, 60_000)
  })

  describe('⚠⚠ AC-6 — YARIŞ KOŞULU: eşzamanlı iki createTenant, AYNI slug', () => {
    it('TAM BİRİ başarılı olur, diğeri ValidationError{slug:"errors.slug.taken"} alır — HAM unique ihlali 500e DÖNÜŞMEZ', async () => {
      const raceSlug = uniqueSlug('ac6-race')

      const [resultA, resultB] = await Promise.allSettled([
        registrationService.createTenant(actor.userId, {
          name: 'Yarış A',
          slug: raceSlug,
          siteType: 'ecommerce',
        }),
        registrationService.createTenant(actor.userId, {
          name: 'Yarış B',
          slug: raceSlug,
          siteType: 'ecommerce',
        }),
      ])

      const fulfilled = [resultA, resultB].filter((r) => r.status === 'fulfilled')
      const rejected = [resultA, resultB].filter((r) => r.status === 'rejected')

      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)

      // ⚠⚠ ASIL İDDİA: durum kodu YETMEZ — `code` assert edilir. Kayıp taraf
      // HAM bir Postgres unique-ihlali (500/`INTERNAL_SERVER_ERROR`) DEĞİL,
      // tanınan bir `ValidationError` alır.
      const loser = rejected[0]
      // ⚠ `status` KONTROLÜ YOK: `rejected` dizisi tip düzeyinde zaten
      // `PromiseRejectedResult[]`'a daraltılmış — ikinci bir çalışma zamanı
      // kontrolü ESLint'in `no-unnecessary-condition` kuralını ihlal eder
      // (karşılaştırma HER ZAMAN false). Daraltmanın kaynağı yukarıdaki filtre.
      if (loser === undefined) {
        throw new Error('beklenen kayıp taraf yok')
      }
      if (!(loser.reason instanceof ValidationError)) {
        throw new Error(`beklenen ValidationError değil: ${String(loser.reason)}`)
      }
      expect(loser.reason.code).toBe('VALIDATION_ERROR')
      expect(loser.reason.fields).toEqual({ slug: 'errors.slug.taken' })

      const winner = fulfilled[0]
      // ⚠ `status` kontrolü YOK — yukarıdaki `loser` ile AYNI gerekçe
      // (`fulfilled` tip düzeyinde `PromiseFulfilledResult[]`).
      if (winner === undefined) {
        throw new Error('beklenen kazanan taraf yok')
      }
      trackTenant(
        (await prismaService.db.tenant.findUniqueOrThrow({ where: { slug: winner.value.slug } }))
          .id,
      )

      // DB'de TAM OLARAK 1 satır var — iki INSERT de "başarılı" sayılmadı.
      const rowCount = await prismaService.db.tenant.count({ where: { slug: raceSlug } })
      expect(rowCount).toBe(1)
    }, 60_000)
  })

  // -------------------------------------------------------------------------
  // AC-2 — geçersiz siteType, istemci atlatılarak doğrudan çağrı, sunucuda 400
  // -------------------------------------------------------------------------
  describe('AC-2 — geçersiz siteType sunucu tarafında reddedilir', () => {
    it('istemciyi atlatıp doğrudan HTTP ile geçersiz siteType gönderince 400 alınır, satır AÇILMAZ', async () => {
      const slug = uniqueSlug('ac2-invalid')
      const before = await prismaService.db.tenant.count({ where: { slug } })

      const response = await request(httpServer())
        .post('/trpc/registration.createTenant')
        .set('Cookie', actor.cookieHeader)
        .set('Origin', TRUSTED_ORIGIN)
        // ⚠ İstemci (zod `siteTypeSchema`) ATLATILIYOR — ham, geçersiz değer
        // DOĞRUDAN gövdeye yazılıyor.
        .send({ name: 'AC-2 Geçersiz', slug, siteType: 'not-a-real-site-type' })

      expect(response.status).toBe(400)

      const after = await prismaService.db.tenant.count({ where: { slug } })
      expect(after).toBe(before)
    }, 30_000)
  })

  // -------------------------------------------------------------------------
  // AC-10 / F7 / İKİ NEGATİF DEĞİŞMEZ / PERF — createTenant'ın TEK transaction'ı
  // -------------------------------------------------------------------------
  describe('AC-10, F7, negatif değişmezler, PERF — createTenant tam akış', () => {
    it(
      'AC-10: TAM 1 subscription (planId=trial, limits=plan limitlerinin anlık görüntüsü) · ' +
        'F7: tenant_membership(owner) satırı var · ⚠ İKİ NEGATİF DEĞİŞMEZ: tenant_version_state=0, job=0 · ' +
        'PERF: 1 tekil tenant.findUnique (müsaitlik) + 1 withNewTenant transaction + sınırlı/döngüsüz sorgu sayısı',
      async () => {
        const trialPlan = await rawDb.plan.findUnique({
          where: { id: 'trial' },
          select: { limits: true },
        })
        if (trialPlan === null) {
          throw new Error('seed eksik: "trial" plan satırı bulunamadı')
        }

        const slug = uniqueSlug('ac10-full')

        // --- PERF ① müsaitlik: TAM 1 tekil indeks okuması ------------------
        const findUniqueSpy = vi.spyOn(prismaService.db.tenant, 'findUnique')
        const availability = await registrationService.checkSlugAvailability(slug)
        expect(availability).toEqual({ outcome: 'available' })
        expect(findUniqueSpy).toHaveBeenCalledTimes(1)
        findUniqueSpy.mockRestore()

        // --- PERF ② createTenant: TAM 1 transaction, ③ döngüde sorgu YOK ---
        const originalWithNewTenant = prismaService.withNewTenant.bind(prismaService)
        const withNewTenantSpy = vi.spyOn(prismaService, 'withNewTenant')
        let planFindUniqueCalls = 0
        let tenantCreateCalls = 0
        let membershipCreateCalls = 0
        let subscriptionCreateCalls = 0

        withNewTenantSpy.mockImplementation((insertTenant, callback) =>
          originalWithNewTenant(
            async (tx) => {
              const planSpy = vi.spyOn(tx.plan, 'findUnique')
              const tenantSpy = vi.spyOn(tx.tenant, 'create')
              try {
                return await insertTenant(tx)
              } finally {
                planFindUniqueCalls += planSpy.mock.calls.length
                tenantCreateCalls += tenantSpy.mock.calls.length
              }
            },
            async (tx, tenantId) => {
              const membershipSpy = vi.spyOn(tx.tenantMembership, 'create')
              const subscriptionSpy = vi.spyOn(tx.subscription, 'create')
              try {
                return await callback(tx, tenantId)
              } finally {
                membershipCreateCalls += membershipSpy.mock.calls.length
                subscriptionCreateCalls += subscriptionSpy.mock.calls.length
              }
            },
          ),
        )

        let tenantId: string
        // ⚠ İLKLENDİRME YOK (`= 0` DEĞİL): aşağıdaki `finally` bloğu HER
        // DURUMDA koşar ve okumadan ÖNCE atama yapar, dolayısıyla `= 0` ölü
        // bir atamadır (ESLint `no-useless-assignment`). Tip ek açıklaması
        // kesin-atama analizini korur.
        let withNewTenantCallCount: number
        try {
          const created = await registrationService.createTenant(actor.userId, {
            name: 'AC-10 Tam Akış Mağazası',
            slug,
            siteType: 'ecommerce',
          })
          expect(created).toEqual({ slug, status: TenantStatus.pending })

          tenantId = (await prismaService.db.tenant.findUniqueOrThrow({ where: { slug } })).id
          trackTenant(tenantId)
        } finally {
          // ⚠ Sayım `mockRestore()`'dan ÖNCE alınır — `mockRestore()` hem
          // orijinal implementasyonu GERİ YÜKLER hem de `.mock.calls`
          // geçmişini SIFIRLAR (ölçüldü: sıra ters olsaydı bu assert HER ZAMAN
          // 0 görürdü).
          withNewTenantCallCount = withNewTenantSpy.mock.calls.length
          withNewTenantSpy.mockRestore()
        }

        expect(withNewTenantCallCount).toBe(1)
        expect(planFindUniqueCalls).toBe(1)
        expect(tenantCreateCalls).toBe(1)
        expect(membershipCreateCalls).toBe(1)
        expect(subscriptionCreateCalls).toBe(1)

        // --- AC-10: subscription TAM 1, planId=trial, limits=anlık görüntü -
        const subscriptions = await prismaService.withTenant(tenantId, (tx) =>
          tx.subscription.findMany(),
        )
        expect(subscriptions).toHaveLength(1)
        const subscription = subscriptions[0]
        if (subscription === undefined) {
          throw new Error('subscription satırı yok')
        }
        expect(subscription.planId).toBe('trial')
        expect(subscription.limits).toEqual(trialPlan.limits)
        expect(subscription.tenantId).toBe(tenantId)

        // --- F7: tenant_membership(owner) VAR -------------------------------
        const membership = await prismaService.withTenant(tenantId, (tx) =>
          tx.tenantMembership.findUnique({
            where: { tenantId_userId: { tenantId, userId: actor.userId } },
          }),
        )
        expect(membership?.role).toBe(TenantRole.owner)

        // --- İKİ NEGATİF DEĞİŞMEZ: tenant_version_state=0, job=0 -----------
        const jobCount = await prismaService.withTenant(tenantId, (tx) => tx.job.count())
        expect(jobCount, 'v0.1.0 sınırı: job satırı YAZILMAZ').toBe(0)

        const versionStateCount = await countTenantVersionStateRows(tenantId)
        expect(
          versionStateCount,
          'ADR-0020 Karar 1 takvimi: pending doğan kiracı SATIRSIZ kalır',
        ).toBe(0)
      },
      60_000,
    )
  })

  // -------------------------------------------------------------------------
  // AC-13 — negatif kapsam: limit ENFORCEMENT yok
  // -------------------------------------------------------------------------
  describe('AC-13 — negatif kapsam kriteri: `limits` hiçbir kod yolunda ENGELLEME üretmiyor', () => {
    const PRODUCTION_SOURCE_ROOTS = [
      join('apps', 'api', 'src'),
      join('packages', 'trpc', 'src'),
    ] as const
    const EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
      '__tests__',
      'node_modules',
      'dist',
      'generated',
      '.turbo',
    ])
    /** `registration.service.ts`'in KENDİSİ — `limits`'in TEK yazıcı/okuyucu yolu (dosya başı yorumu). */
    const ALLOWED_LIMITS_FILE = join(
      'apps',
      'api',
      'src',
      'registration',
      'registration.service.ts',
    )
    /** Jeton ÇALIŞMA ANINDA birleştirilir (literal-jeton disiplini). */
    const LIMITS_FIELD_NEEDLE = ['.', 'limits'].join('')

    function collectTypeScriptFiles(rootRelativePath: string): string[] {
      const absoluteRoot = join(REPO_ROOT, rootRelativePath)
      const collected: string[] = []

      const walk = (absoluteDirectory: string): void => {
        for (const entryName of readdirSync(absoluteDirectory)) {
          const absoluteEntry = join(absoluteDirectory, entryName)
          const stats = statSync(absoluteEntry)

          if (stats.isDirectory()) {
            if (EXCLUDED_DIRECTORY_NAMES.has(entryName)) {
              continue
            }
            walk(absoluteEntry)
            continue
          }

          if (entryName.endsWith('.ts')) {
            collected.push(absoluteEntry)
          }
        }
      }

      walk(absoluteRoot)
      return collected
    }

    function findMatches(needle: string): { readonly file: string; readonly text: string }[] {
      const matches: { readonly file: string; readonly text: string }[] = []

      for (const root of PRODUCTION_SOURCE_ROOTS) {
        for (const absoluteFile of collectTypeScriptFiles(root)) {
          const lines = readFileSync(absoluteFile, 'utf-8').split('\n')
          lines.forEach((text) => {
            if (text.includes(needle)) {
              matches.push({ file: relative(REPO_ROOT, absoluteFile), text: text.trim() })
            }
          })
        }
      }

      return matches
    }

    it('"`.limits`" jetonu ÜRETİM kodunda YALNIZCA registration.service.ts içinde geçer (ikinci bir okuyucu/engelleyici YOK)', () => {
      const matches = findMatches(LIMITS_FIELD_NEEDLE)

      expect(matches.length).toBeGreaterThan(0)
      for (const match of matches) {
        expect(match.file, `beklenmeyen ".limits" kullanımı: ${match.file} → ${match.text}`).toBe(
          ALLOWED_LIMITS_FILE,
        )
      }
    })
  })

  // -------------------------------------------------------------------------
  // AC-15 — pending kiracı vitrinde TAM 404 (503 DEĞİL)
  // -------------------------------------------------------------------------
  describe('AC-15 — pending kiracı vitrinde TAM 404 (uçtan uca HTTP, kayıt akışı ile üretilen slug)', () => {
    it('kayıttan çıkan (pending) slug, /trpc/storefront.currentTenant üzerinden TAM 404 alır', async () => {
      const slug = uniqueSlug('ac15-pending')
      const created = await registrationService.createTenant(actor.userId, {
        name: 'AC-15 Vitrin Testi',
        slug,
        siteType: 'ecommerce',
      })
      const tenantId = (await prismaService.db.tenant.findUniqueOrThrow({ where: { slug } })).id
      trackTenant(tenantId)
      expect(created.status).toBe(TenantStatus.pending)

      const response = await request(httpServer()).get('/trpc/storefront.currentTenant').set(
        // Geliştirme ortamı seçici — `TenantResolverService`'in K-A4 öncelik
        // kuralı: `NODE_ENV !== 'production'` iken slug olarak yorumlanır.
        'x-arkesoft-tenant',
        slug,
      )

      expect(response.status).toBe(404)
      const envelope = trpcErrorEnvelopeSchema.parse(response.body)
      expect(envelope.error.data.appError.code).toBe('TENANT_NOT_FOUND')
      expect(envelope.error.data.httpStatus).toBe(404)
    }, 30_000)
  })

  // -------------------------------------------------------------------------
  // AC-19 / ADR-0021 §2 koşul C — dört ret modu, AYNI 404, AYIRT EDİLEMEZ gövde
  // -------------------------------------------------------------------------
  describe('⚠⚠ AC-19 / ADR-0021 §2 koşul C — onboardingChecklist: dört ret modu AYNI 404', () => {
    it(
      'kiracı yok · üye değil · soft-delete edilmiş · biçim bozuk — DÖRDÜ DE TenantNotFoundError, ' +
        'kod/httpStatus/tel gövdesi BİREBİR AYNI (requestId sabitlenerek karşılaştırıldı)',
      async () => {
        // (1) kiracı yok — hiçbir yerde yaratılmamış bir slug.
        const nonExistentSlug = uniqueSlug('ac19-missing')

        // (2) üye değil — gerçek, aktif bir kiracı ama aktör ÜYE DEĞİL
        // (platform seviyesi doğrudan insert, `createTenant`'tan GEÇMEZ —
        // bu yüzden aktör için owner üyeliği HİÇ doğmaz).
        const notMemberSlug = uniqueSlug('ac19-not-member')
        const notMemberTenant = await prismaService.db.tenant.create({
          data: { slug: notMemberSlug, name: 'AC-19 Üye Değil', status: TenantStatus.active },
        })
        trackTenant(notMemberTenant.id)

        // (3) soft-delete edilmiş — `deletedAt` DOLU.
        const softDeletedSlug = uniqueSlug('ac19-soft-deleted')
        const softDeletedTenant = await prismaService.db.tenant.create({
          data: {
            slug: softDeletedSlug,
            name: 'AC-19 Silinmiş',
            status: TenantStatus.active,
            deletedAt: new Date(),
          },
        })
        trackTenant(softDeletedTenant.id)

        // (4) biçim bozuk — `onboardingChecklist` slug GRAMERİNİ doğrulamaz
        // (architect KARAR, `registration.schema.ts` dosya başı yorumu);
        // böyle bir satır HİÇBİR ZAMAN var olamaz, bu yüzden AYNI "kiracı
        // yok" koluna düşer.
        const malformedSlug = 'NOT_a_valid_SLUG!!'

        async function captureRejection(slug: string): Promise<TenantNotFoundError> {
          let caught: unknown
          try {
            await registrationService.onboardingChecklist(actor.userId, slug)
            throw new Error(`beklenen TenantNotFoundError fırlatılmadı (slug: ${slug})`)
          } catch (error) {
            caught = error
          }
          if (!(caught instanceof TenantNotFoundError)) {
            throw new Error(`beklenen TenantNotFoundError değil (slug: ${slug}): ${String(caught)}`)
          }
          return caught
        }

        const rejections = await Promise.all([
          captureRejection(nonExistentSlug),
          captureRejection(notMemberSlug),
          captureRejection(softDeletedSlug),
          captureRejection(malformedSlug),
        ])

        for (const rejection of rejections) {
          expect(rejection.code).toBe('TENANT_NOT_FOUND')
          expect(rejection.httpStatus).toBe(404)
        }

        // ⚠⚠ ASIL İDDİA: dört gövde BİREBİR AYNI (requestId SABİT tutularak —
        // aksi hâlde zaten farklı olurdu, karşılaştırmanın anlamı kalmaz).
        const bodies = rejections.map((rejection) => toErrorBody(rejection, 'ac19-probe'))
        const [firstBody, ...restBodies] = bodies
        for (const body of restBodies) {
          expect(body).toEqual(firstBody)
        }
        expect(firstBody).toEqual({
          code: 'TENANT_NOT_FOUND',
          message: 'errors.tenant.notFound',
          details: {},
          requestId: 'ac19-probe',
        })
      },
      60_000,
    )

    it('VACUOUS DEĞİL: aktörün KENDİ sahip olduğu kiracı için onboardingChecklist BAŞARIYLA döner', async () => {
      const ownSlug = uniqueSlug('ac19-own')
      await registrationService.createTenant(actor.userId, {
        name: 'AC-19 Kendi Mağazam',
        slug: ownSlug,
        siteType: 'corporate',
      })
      const tenantId = (
        await prismaService.db.tenant.findUniqueOrThrow({ where: { slug: ownSlug } })
      ).id
      trackTenant(tenantId)

      const checklist = await registrationService.onboardingChecklist(actor.userId, ownSlug)

      expect(checklist.steps.map((step) => step.key)).toEqual([
        'account',
        'store_identity',
        'site_type',
        'subscription',
        'provisioning',
      ])
      expect(checklist.steps.map((step) => step.status)).toEqual([
        'done',
        'done',
        'done',
        'done',
        'todo',
      ])
    }, 30_000)
  })
})

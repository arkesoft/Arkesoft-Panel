// @arkesoft/api — kayıt akışının iş mantığı (ROADMAP v0.1.0, T-019/S9a,
// architect "TRPC SÖZLEŞMESİ"/"BEŞ KARAR" bölümleri, ADR-0021)
//
// ⚠⚠ YENİ `AppError` SINIFI YOK (architect F3 çürütmesi). CLAUDE.md §4
// kullanıcı girdisi hataları için BİREBİR `{ code: 'VALIDATION_ERROR',
// fields: { slug: 'errors.slug.taken' } }` yazıyor — mekanizma ZATEN var
// (`errors/domain/validation.error.ts`). Bu dosya SADECE bir EŞLEYİCİ yazar:
// {@link SlugAvailabilityOutcome} → {@link RegistrationFieldErrorKey}.
//
// ⭐⭐ KABUL ORACLE'I (R-A3): `checkSlugAvailability`/`createTenant`'ın SON
// doğrulama adımı `TenantResolverService.isSlugReachable()`'dır —
// `resolveHost()`'un KENDİSİ çalıştırılır, paylaşılan bir regex KANIT
// SAYILMAZ (`'unreachable'` çıktısı, tenant-resolver.service.ts'in dosya başı
// yorumuna bkz).
//
// ⚠ `validateTenantSlug()` (`@arkesoft/tenancy`) rezerve kontrolünü KENDİ
// İÇİNDE yapar (`A-S2-1`) — bu dosya İKİNCİ bir `RESERVED_SUBDOMAINS`
// kontrolü AÇMAZ.
//
// ⚠⚠ `withNewTenant()` TEK TRANSACTION (ADR-0021 §4): kiracı satırı +
// `tenant_membership(owner)` + `subscription` AYNI transaction'da yazılır —
// sahipsiz kiracı sınıfı YAPISAL olarak İMKÂNSIZDIR. ⚠ Kayıtta
// `TenantVersionState` YAZILMAZ (schema.prisma'nın bağlayıcı notu — v0.1.0'da
// yeni kiracı `pending` doğduğunda SATIRSIZ kalır, ADR-0020 Karar 1 takvimi)
// ve `job` satırı YAZILMAZ (v0.2.0 sınırı) — bu İKİ NEGATİF değişmez burada
// mekanik olarak PİNLENİR: `insertTenant`/`callback`'in erişebildiği tipler
// (`PlatformTenantWriter`, `TenantTransactionClient`) `tenantVersionState`/
// `job` delegelerini TAŞIMAZ, yani bu dosyadan böyle bir yazım DERLENMEZ.
//
// ⚠⚠ `onboardingChecklist` — ADR-0021 §2 koşul B BAĞLAYICI SIRA: sahiplik
// doğrulaması (adım ②) kiracıya ait HERHANGİ bir veri (adım ③) okunmadan ÖNCE
// yapılır; adım ① yalnızca İÇ KİMLİĞİ çözer (`select: { id: true }`,
// `deletedAt: null` filtresiyle "kiracı yok" ve "soft-delete" modlarını AYNI
// null sonuca indirger) ve bu id çağırana HİÇBİR BİÇİMDE sızdırılmaz. DÖRT ret
// modu (kiracı yok · üye değil · soft-delete · biçim bozuk) AYNI
// `TenantNotFoundError` (404) ile temsil edilir — `member.acceptInvitation`'ın
// `InvitationInvalidError`'ının KİRACI SEÇİCİSİ tabanlı eşdeğeri, YENİ bir
// hata sınıfı İCAT EDİLMEZ.

import { Inject, Injectable } from '@nestjs/common'
import { isUniqueConstraintError, TenantRole, TenantStatus } from '@arkesoft/db'
import type { Prisma } from '@arkesoft/db'
import { validateTenantSlug } from '@arkesoft/tenancy'
import type {
  CreateTenantInput,
  CreateTenantResult,
  OnboardingChecklist,
  OnboardingStep,
  RegistrationFieldErrorKey,
  SiteType,
  SlugAvailability,
  SlugAvailabilityOutcome,
} from '@arkesoft/trpc'

import { assertNever } from '../errors/assert-never.js'
import { TenantNotFoundError } from '../errors/domain/tenant-not-found.error.js'
import { ValidationError } from '../errors/domain/validation.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { TenantResolverService } from '../tenancy/tenant-resolver.service.js'

/**
 * Kayıt akışının BUGÜN TEK planı. `Plan.id` DOĞAL ANAHTARDIR (cuid2 DEĞİL,
 * ADR-0021 VERİ MODELİ bölümü) — `packages/db`'nin seed fixture'ı
 * (`TRIAL_PLAN.id`) BU LİTERALİ taşır ama o sabit dışa AÇILMAZ (`index.ts`
 * yalnızca `DEMO_SEED`'i export eder); iki dosyanın AYNI DEĞERİ elle hizalı
 * tutması `Plan.id`'nin doğal anahtar OLMASININ bilinçli bedelidir (kod/env
 * ikinci bir kaynak İCAT EDİLMEDİ).
 */
const TRIAL_PLAN_ID = 'trial'

/**
 * {@link SlugAvailabilityOutcome}'ın `'available'` DIŞINDAKİ dört değerini
 * {@link RegistrationFieldErrorKey}'e eşler — `registration.schema.ts`'in
 * dosya başı yorumunun uyardığı "iki sözlük elle hizalı, türetilmemiş" riskini
 * KAPATAN taraf: EXHAUSTIVE switch + `assertNever` — outcome kümesine yeni bir
 * reddedici değer eklenip bu switch GÜNCELLENMEZSE `pnpm typecheck` KIRILIR.
 */
function mapSlugOutcomeToFieldErrorKey(
  outcome: Exclude<SlugAvailabilityOutcome, 'available'>,
): RegistrationFieldErrorKey {
  switch (outcome) {
    case 'taken':
      return 'errors.slug.taken'
    case 'reserved':
      return 'errors.slug.reserved'
    case 'invalidFormat':
      return 'errors.slug.invalidFormat'
    case 'unreachable':
      return 'errors.slug.unreachable'
    default:
      return assertNever(outcome, 'registration.service.ts: SlugAvailabilityOutcome')
  }
}

/**
 * Onboarding kontrol listesinin BEŞ adımı, SIRAYLA (`onboardingStepKeySchema`
 * kapalı kümesi). `account`/`store_identity` HER ZAMAN `'done'`dir — bu
 * fonksiyonun çağrıldığı an için bir kiracı satırının VARLIĞI (`name`/`slug`
 * NOT NULL) bu ikisinin zaten tamamlandığının DB SEVİYESİ kanıtıdır.
 * `provisioning` v0.1.0'da HER ZAMAN `'todo'`dur (A-A5 — `tenant.provision`
 * v0.2.0'ın işi); bu fonksiyon bunu ZORLAR (adaptör tarafı, şema değil).
 */
function buildOnboardingSteps(
  siteType: SiteType | null,
  hasSubscription: boolean,
): OnboardingStep[] {
  return [
    { key: 'account', status: 'done' },
    { key: 'store_identity', status: 'done' },
    { key: 'site_type', status: siteType === null ? 'todo' : 'done' },
    { key: 'subscription', status: hasSubscription ? 'done' : 'todo' },
    { key: 'provisioning', status: 'todo' },
  ]
}

@Injectable()
export class RegistrationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantResolverService)
    private readonly tenantResolver: Pick<TenantResolverService, 'isSlugReachable'>,
  ) {}

  /**
   * `registration.checkSlugAvailability`'nin iş mantığı — ADR-0021 §3 koşul
   * E: TAM 1 tekil indeks okuması (biçim/rezerve/erişilebilirlik reddi I/O
   * YAPMADAN SAPTANIR, `tenant.slug` sorgusu yalnızca geçerli/erişilebilir bir
   * slug için ATILIR).
   */
  async checkSlugAvailability(slug: string): Promise<SlugAvailability> {
    return { outcome: await this.resolveSlugOutcome(slug) }
  }

  /**
   * `registration.createTenant`'ın iş mantığı. `actorUserId` yaratılan
   * kiracıda `tenant_membership(owner)` satırının ÖZNESİDİR (F7) — sahiplik
   * bu çağrının YAN ETKİSİDİR, ayrı bir davet/kabul adımı YOKTUR.
   */
  async createTenant(actorUserId: string, input: CreateTenantInput): Promise<CreateTenantResult> {
    const outcome = await this.resolveSlugOutcome(input.slug)

    if (outcome !== 'available') {
      throw new ValidationError({ slug: mapSlugOutcomeToFieldErrorKey(outcome) })
    }

    // `insertTenant` fazının okuduğu `trial` planının limit ŞABLONU —
    // `callback` fazına (GUC kurulduktan SONRA, `subscription` satırını
    // yazarken) KAPANIŞ (closure) ile taşınır: `PlatformTenantWriter`
    // (`tenant`+`plan`) VE `TenantTransactionClient` (`subscription` dahil,
    // `plan` HARİÇ) birbirinin TAM TERSİ allowlist'tir (ADR-0021 VERİ
    // MODELİ) — `plan` İKİ fazda birden OKUNAMAZ, tek okuma yeri burasıdır.
    let trialPlanLimits: Prisma.JsonValue | undefined

    await this.prisma.withNewTenant(
      async (tx) => {
        const plan = await tx.plan.findUnique({
          where: { id: TRIAL_PLAN_ID },
          select: { limits: true },
        })

        if (plan === null) {
          // Seed/migration eksikliği — İŞ KURALI DEĞİL, bir yapılandırma
          // invaryantının ihlali (CLAUDE.md §10 md 16: hata YUTULMAZ, burada
          // da SESSİZCE devam EDİLMEZ).
          throw new Error(
            `registration.service.ts: '${TRIAL_PLAN_ID}' plan satırı bulunamadı — seed/migration eksik olabilir.`,
          )
        }

        trialPlanLimits = plan.limits

        try {
          return await tx.tenant.create({
            data: { slug: input.slug, name: input.name, siteType: input.siteType },
            select: { id: true },
          })
        } catch (error: unknown) {
          // AC-6 — eşzamanlı iki kayıt yarışı: ön-kontrol "available" dese
          // bile INSERT anında benzersizlik ihlali OLUŞABİLİR; bu HAM bir
          // 500'e DÖNÜŞMEZ, aynı alan bazlı `ValidationError`'a ÇEVRİLİR
          // (`member.service.ts`'in `createMembershipForInvitation`'ının
          // BİREBİR deseni — yalnızca TANINAN hata dönüştürülür, kalanı
          // AYNEN yukarı iletilir).
          if (isUniqueConstraintError(error)) {
            throw new ValidationError({ slug: mapSlugOutcomeToFieldErrorKey('taken') })
          }
          throw error
        }
      },
      async (tx, tenantId) => {
        await tx.tenantMembership.create({
          data: { tenantId, userId: actorUserId, role: TenantRole.owner },
        })

        await tx.subscription.create({
          data: {
            tenantId,
            planId: TRIAL_PLAN_ID,
            limits: trialPlanLimits ?? {},
            startedAt: new Date(),
          },
        })
      },
    )

    // Yeni kiracı HER ZAMAN `'pending'` doğar (AC-1) — bu şemanın KENDİSİ
    // zorlar (`Tenant.status @default(pending)`), burada TEKRAR OKUNMAZ.
    return { slug: input.slug, status: TenantStatus.pending }
  }

  /**
   * `registration.onboardingChecklist`'in iş mantığı. ⚠⚠ BAĞLAYICI SIRA
   * (ADR-0021 §2 koşul B): sahiplik doğrulaması (② — `tenant_membership`
   * satırı) kiracıya ait HERHANGİ bir veri (③ — `siteType`/`subscription`)
   * okunmadan ÖNCE tamamlanır.
   */
  async onboardingChecklist(actorUserId: string, slug: string): Promise<OnboardingChecklist> {
    // ⚠ Ham `PrismaService.db.tenant` çağrısı — AYNI gerekçe
    // (`resolveSlugOutcome`'un yukarıdaki yorumu): `tenant` platform
    // seviyesi, `withTenant()` YAPISAL olarak kullanılamaz. ① Platform
    // tablosundan YALNIZCA iç kimlik çözümlenir. `deletedAt: null` filtresi
    // "kiracı yok" ile "soft-delete edilmiş" ret modlarını AYNI null sonuca
    // (ve dolayısıyla AYNI 404'e) indirger. Sonuç (`id`) çağırana HİÇBİR
    // BİÇİMDE sızdırılmaz.
    const tenantRow = await this.prisma.db.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    })

    if (tenantRow === null) {
      throw new TenantNotFoundError()
    }

    const tenantId = tenantRow.id

    // ② SAHİPLİK DOĞRULAMASI — HER ŞEYDEN ÖNCE. `subscription` okuması
    // (③'ün bir yarısı) BİLEREK AYNI kiracı kapsamlı bloğun İÇİNDE, üyelik
    // doğrulamasından HEMEN SONRA yapılır (ikinci bir `withTenant()` turu
    // AÇILMAZ) — ama üyelik satırı okunmadan subscription'a ASLA ulaşılmaz.
    const subscription = await this.prisma.withTenant(tenantId, async (tx) => {
      const membership = await tx.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId: actorUserId } },
        select: { id: true },
      })

      if (membership === null) {
        throw new TenantNotFoundError()
      }

      return tx.subscription.findUnique({ where: { tenantId }, select: { id: true } })
    })

    // ③ Sahiplik doğrulandı — kontrol listesinin platform seviyesi TEK
    // ihtiyacı (`siteType`, kiracının KENDİSİNDE yaşar, `subscription`
    // tablosunda DEĞİL).
    const tenant = await this.prisma.db.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { siteType: true },
    })

    if (tenant === null) {
      // ① ile ③ arasındaki bir yarış (ör. eşzamanlı soft-delete) — AYNI 404.
      throw new TenantNotFoundError()
    }

    return { steps: buildOnboardingSteps(tenant.siteType, subscription !== null) }
  }

  /**
   * ⭐⭐ KABUL ORACLE'I + slug grameri + benzersizlik — ÜÇÜ BİRLİKTE
   * {@link SlugAvailabilityOutcome}'a indirgenir. Sıra BAĞLAYICI (perf —
   * ADR-0021 §3 koşul E): biçim/rezerve/erişilebilirlik reddi I/O yapmadan
   * saptanır; veritabanı sorgusu YALNIZCA geçerli VE erişilebilir bir slug
   * için atılır (TAM 1 tekil indeks okuması).
   */
  private async resolveSlugOutcome(slug: string): Promise<SlugAvailabilityOutcome> {
    // `validateTenantSlug()` (@arkesoft/tenancy) rezerve kontrolünü KENDİ
    // İÇİNDE yapar (A-S2-1) — İKİNCİ bir `RESERVED_SUBDOMAINS` kontrolü
    // BURADA AÇILMAZ.
    const validation = validateTenantSlug(slug)

    if (validation.kind === 'invalid') {
      switch (validation.reason) {
        case 'reserved':
          return 'reserved'
        case 'empty':
        case 'format':
          return 'invalidFormat'
        default:
          return assertNever(
            validation.reason,
            'registration.service.ts: SlugValidationResult.reason',
          )
      }
    }

    // ⭐⭐ KABUL ORACLE'I (R-A3) — `resolveHost()`'un KENDİSİ, paylaşılan bir
    // regex DEĞİL. `normalizedBaseDomain`'in İKİNCİ bir üretimi YOK
    // (`TenantResolverService`'in kurucusunda ZATEN üretilen değer).
    if (!this.tenantResolver.isSlugReachable(slug)) {
      return 'unreachable'
    }

    // ⚠ Ham `PrismaService.db.tenant` çağrısı CLAUDE.md §3/§4 gereği gerekçe
    // ister (`tenant-read.port.adapter.ts`'in BİREBİR gerekçesi): `tenant`
    // PLATFORM SEVİYESİ bir tablodur (`tenant_id` TAŞIMAZ, kiracının
    // KENDİSİDİR), `withTenant()` bu tablo için YAPISAL olarak
    // KULLANILAMAZ. TEK sorgu — tekil `slug` indeksi. Soft-delete edilmiş
    // satırlar DA dikkate alınır (ADR-0021 §3): `deletedAt` filtresi YOK —
    // `slug @unique` soft-delete edilmiş bir satır için de geçerlidir, aksi
    // hâlde kontrol "müsait" derken INSERT benzersizlik ihlaliyle PATLARDI.
    const existing = await this.prisma.db.tenant.findUnique({
      where: { slug },
      select: { id: true },
    })

    return existing === null ? 'available' : 'taken'
  }
}

// @arkesoft/trpc — `registration.*` (ROADMAP v0.1.0, T-019/S3, architect
// "TRPC SÖZLEŞMESİ" bölümü KARAR 5, ADR-0021)
//
// YENİ DOSYA — `tenant.router.ts`'E EKLENMEZ. Gerekçe REPO ZORLUYOR, bir
// tercih DEĞİL: `storefront.router.ts:4-10` dosya başına TEK güven seviyesi
// kuralını yazıyor; `tenant.router.ts:10-12` dosya kapsamında
// "`ctx.tenant.tenantId` HER ZAMAN host çözümünden gelir, GİRDİDEN DEĞİL"
// beyan ediyor. Bu dosyadaki üç prosedürün güven seviyesi FARKLIDIR — kiracı
// host'tan hiç çözülmez (`checkSlugAvailability`/`createTenant` kiracı
// kavramını hiç bilmez; `onboardingChecklist` kiracıyı GİRDİDEN seçer) — bu
// yüzden `tenant.router.ts`'in dosya kapsamlı beyanı burada DOĞRU OLMAZDI.
//
// ⚠⚠ ÜÇÜ DE `protectedProcedure` — `publicProcedure` AÇILMAZ (ADR-0021 §1).
// `pm`'in "slug kontrolü anonim olmalı" önerisi architect tarafından
// ÇÜRÜTÜLDÜ: ROADMAP`:1282`'nin sihirbaz sırası "hesap → mağaza adı → slug
// (müsaitlik kontrolü) → site tipi" — slug adımına yalnızca hesap adımından
// SONRA varılır; `auth-instance.ts:690` `requireEmailVerification: true` +
// `auth-flow.test.ts:266` ("kayıt 2xx, token null → autoSignIn SKIP") birlikte
// kullanıcının slug adımına geldiğinde DOĞRULANMIŞ ve OTURUM AÇMIŞ olduğunu
// gösteriyor. Ölçülebilir kazanımlar: `AUTH_EXEMPT_PATHS` 12'de KALIR ·
// `publicProcedure` HİÇ açılmaz · `procedure-surface.ts`'in `builder`
// birleşimi GENİŞLEMEZ (`'protected'` ZATEN üye).
//
// Resolver gövdesi TEK İFADE (ADR-0009 madde 4, bağlayıcı): `ctx.ports.*`
// üzerinde TEK çağrı, dallanma SIFIR. Portlar TOTAL'dır
// (`../ports/registration-read.port.ts`, `../ports/registration-write.port.ts`)
// — "slug alınmış", "üye değil", "kiracı yok" BURAYA dönüş değeri olarak
// GELMEZ, port `AppError` fırlatır.
//
// HTTP yolları: `/trpc/registration.checkSlugAvailability`,
// `/trpc/registration.createTenant`, `/trpc/registration.onboardingChecklist`
// — ÜÇÜ DE `protectedProcedure` kullandığı için (host'tan çözülen bir kiracı
// ARAMAZ) `AUTH_EXEMPT_PATHS`/`TENANT_EXEMPT_PATHS`'E EKLENMEZ; bu üç yol
// normal kimlik doğrulama muhafızından geçer (`apps/api`, ayrı alt görev).

import {
  checkSlugAvailabilityInputSchema,
  checkSlugAvailabilityOutputSchema,
  createTenantInputSchema,
  createTenantOutputSchema,
  onboardingChecklistInputSchema,
  onboardingChecklistOutputSchema,
} from '../schemas/registration.schema.js'
import { protectedProcedure, router } from '../trpc.js'

export const registrationRouter = router({
  /**
   * `protectedProcedure` — kiracı kavramı GEÇERSİZDİR (ADR-0021 §3 koşul
   * tablosu). Çıktının `taken` değeri bir kiracının VARLIĞINI bildirir ama bu
   * YENİ bir bilgi sınıfı DEĞİLDİR (ADR-0021 §3): `{slug}.{APP_BASE_DOMAIN}`
   * adresinin çözülüp çözülmediği bugün ANONİM olarak gözlemlenebilir.
   * Değişen şey bilginin MALİYETİ ve ORANIDIR — kapı oran sınırı ve
   * doğrulanmış hesap şartıdır, ÇIKTI MASKELEME değildir.
   */
  checkSlugAvailability: protectedProcedure
    .input(checkSlugAvailabilityInputSchema)
    .output(checkSlugAvailabilityOutputSchema)
    .query(({ ctx, input }) => ctx.ports.registrationRead.checkSlugAvailability(input.slug)),

  /**
   * `protectedProcedure` — kiracı YARATAN çağrıdır, DOĞRULAYAN değil
   * (ADR-0021 §2 koşul A). `ctx.auth.userId` yaratılan kiracıda
   * `tenant_membership(owner)` satırının ÖZNESİDİR (F7); bu atama PORTUN
   * (`withNewTenant()` tek transaction'ı, ADR-0021 §4) yan etkisidir —
   * burada görünür bir ikinci çağrı/adım YOKTUR.
   */
  createTenant: protectedProcedure
    .input(createTenantInputSchema)
    .output(createTenantOutputSchema)
    .mutation(({ ctx, input }) => ctx.ports.registrationWrite.createTenant(ctx.auth.userId, input)),

  /**
   * `protectedProcedure` — BU DOSYANIN EN BÜYÜK YAPISAL BULGUSUNUN (panelden
   * kiracı kapsamlı okuma yolunun yokluğu, `ROADMAP.md:3113`) ADR-0021 §3 ile
   * kapatılan karşılığıdır: kiracı bağlamı host'tan DEĞİL, GİRDİDEN
   * (`input.slug`) seçilir. ⚠⚠ Seçici `tenantId` DEĞİL `slug`'dır (ADR-0021
   * §3.1 DÜZELTMESİ, T-019/S3 düzeltme turu — `ux`'in bulduğu boşluk: opak
   * `tenantId` kullanıcının BAŞKA bir cihazdan bilebileceği bir değer
   * DEĞİLDİR; `slug` kullanıcının GENEL adresidir). ⚠⚠ BAĞLAYICI SIRA:
   * sahiplik doğrulaması PORTUN İÇİNDE her şeyden ÖNCE yapılır (ADR-0021 §2
   * koşul B) — bu resolver `ctx.tenant`'a ERİŞMEZ (zaten `protectedProcedure`
   * onu daraltmaz) ve `input.slug`'a GÜVENMEZ; yalnızca hangi bağlamın
   * SORULACAĞINI taşır. Dört ret modu (kiracı yok · üye değil · soft-delete ·
   * biçim bozuk) PORTTA AYNI 404'e indirgenir (`member.acceptInvitation`'ın
   * ADR-0016 madde 6 koşul D'sinin KİRACI SEÇİCİSİ tabanlı eşdeğeri).
   */
  onboardingChecklist: protectedProcedure
    .input(onboardingChecklistInputSchema)
    .output(onboardingChecklistOutputSchema)
    .query(({ ctx, input }) =>
      ctx.ports.registrationRead.onboardingChecklist(ctx.auth.userId, input.slug),
    ),
})

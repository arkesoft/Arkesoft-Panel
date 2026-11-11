// @arkesoft/api — AuthModule (ROADMAP v0.0.5, T-006/S5, architect "Better
// Auth çekirdeği")
//
// MADDE 2 — R-1 KARARI (gerekçe yorumu, CLAUDE.md §3/§4 "ham `prisma.*`
// çağrısı yalnızca platform seviyesi tablolarda, gerekçe yorumuyla"): Better
// Auth kendi Prisma adaptörünü kullanır ve `session`/`account`/
// `verification`/`app_user` tablolarına DOKUNUR — bunlar PLATFORM SEVİYESİ
// (tenant_id TAŞIMAZ), `withTenant()` bu tablolar için YOKTUR ve GEREKMEZ
// (ADR-0008 taslağı, "Madde 2 — YAPISAL TESPİT"). `PrismaService.db`
// (paylaşılan istemci) bu üç modeli `AppPrismaDatabase` daraltmasıyla ZATEN
// DÜŞÜRÜYOR ve `PrismaModule` onu (`PRISMA_CLIENT` ham token'ını) DIŞA
// AÇMIYOR — bu yüzden `AuthModule` KENDİ, AYRI bir ham Prisma istemcisi kurar
// (`@arkesoft/db`'nin `createPrismaClient()`'ı, `apps/api/eslint.config.mjs`
// R-1 katman 2'nin `src/auth/**` istisnası TAM BUNUN İÇİN var). `packages/db`
// ve `apps/api/src/prisma/**` BU ALT GÖREVDE DOKUNULMADI — T-006'nın hiçbir
// dosya sahipliği tablosunda bu dosyalar bir alt göreve VERİLMEDİ.
//
// `MailTransport` DI kablolanması (S4'ün devir notu — S4 bilerek env
// okumadı): `SmtpMailTransportConfig`'i `ApiEnv`'den (`SMTP_HOST`/
// `SMTP_PORT`/`SMTP_SECURE`/`MAIL_FROM_NAME`/`MAIL_FROM_ADDRESS`, zaten
// `infraEnvSchema`'da mevcut) eşleyen TEK yer burasıydı.
//
// GÜNCELLEME (ROADMAP v0.0.14, T-014/S4, po R-PO3): taşıyıcı sağlayıcısı
// `mail/mail.module.ts`'E TAŞINDI ve bu modül onu `imports` ile tüketir.
// Sebep: üye davet akışı bu dizinin DIŞINDA yaşıyor ve aynı taşıyıcıya
// ihtiyaç duyuyor. ⚠ ALTERNATİF — bu modülün `exports` dizisine ikinci bir
// token eklemek — O ZAMAN DEĞERLENDİRİLDİ VE REDDEDİLDİ: aşağıdaki `exports`
// satırının o zamanki yazılı iddiası ("dışa açılan yüzey TEK token'a
// DARALTILDI") BAYATLAMIŞTI. Tam kimlik örneği token'ı (`AUTH_INSTANCE`'ın
// KENDİSİ) HÂLÂ yeniden açılmadı — o red kararı AYAKTA.
//
// GÜNCELLEME (ROADMAP v0.0.15.1, T-017/S8a, po ⭐ KISIT (b)) — BU RED KARARI
// KISMEN GERİ ALINDI: `exports` dizisi şimdi İKİNCİ bir token
// (`SESSION_LIST_READER`) taşıyor. Yukarıdaki "neden eklenmedi" gerekçesi
// (mail taşıyıcısı için) HÂLÂ GEÇERLİ — bu üçüncü token FARKLI, YENİ bir
// ihtiyaçtan doğdu: `packages/trpc`'nin `SessionListReadPort`'unu
// `apps/api`'de uygulayan adaptör (T-017/S9) `apps/api/eslint.config.mjs:
// 61-75`'in `AuthPrismaDatabase` ithalini `src/{prisma,auth}/**` DIŞINDA
// yasaklaması YÜZÜNDEN `SessionsService`'in zaten yaptığı Prisma okumasını
// TEKRARLAYAMAZ — DELEGE ETMEK ZORUNDADIR (po'nun ölçtüğü yapısal engel).
// `SessionsService`'in KENDİSİNİ (sınıf olarak) `exports`'a koymak
// `revokeOwnSession`/`revokeAllOwnSessions`'ı (step-up + sahiplik DAVRANIŞI
// taşıyan YAZMA metotları) da dışa açardı — bu KABUL EDİLMEDİ. Bunun yerine
// `AUTH_SESSION_READER` İLE AYNI daraltma disiplinine uyan YENİ bir token
// (`auth.tokens.ts`'in `SESSION_LIST_READER`'ı) `listOwnSessions`'a
// DARALTILMIŞ bir yüzey açar — YAZMA yüzeyi AÇILMADI, sayı iki token'a
// çıktı ama İKİSİ DE okumaya daraltılmış durumda. ⚠ `security`/`solid` bu
// kararı DENETLEYECEK (po'nun açıkça işaretlediği gözden geçirme noktası).
//
// Yaşam döngüsü: ham Prisma istemcisi KENDİ kaynağını açar; `OnModuleDestroy`
// ile kapanışta serbest bırakılır (`PrismaService`'in AC11 desenine paralel —
// sarkan bağlantı bırakmaz, test teardown'ı temiz kalır). SMTP soketinin aynı
// sözleşmesi artık `MailModule`'ün sorumluluğunda.

import { Inject, Injectable, Module } from '@nestjs/common'
import type { OnModuleDestroy, OnModuleInit, Provider } from '@nestjs/common'
// T-006/S8 EKLEMESİ: `APP_INTERCEPTOR` — `RateLimitAccountResetInterceptor`
// için (`APP_GUARD` ile AYNI "modülün global'liğinden BAĞIMSIZ kaydolur"
// mekanizması, `tenancy.module.ts` dosya başı yorumu). Mevcut `APP_GUARD`
// importu SİLİNMEDİ, yalnızca token EKLENDİ.
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { assertAuthRoleIsRestricted, createPrismaClient } from '@arkesoft/db'
import type { AuthPrismaDatabase } from '@arkesoft/db'
import type { Auth } from 'better-auth'
import type { Logger } from 'pino'

import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import { describeErrorCause } from '../errors/describe-error-cause.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { createAuthInstance } from './auth-instance.js'
import { AuthController } from './auth.controller.js'
import { AuthGuard } from './auth.guard.js'
// T-016 FIX turu 1, madde 3/M-1 EKLEMESİ (solid) — `AuthGuard`'ın ÜÇÜNCÜ
// zorlama kapısı artık DI'DAN alınır (`two-factor-compliance.service.ts`
// dosya başı GÜNCELLEME yorumu).
import { TwoFactorComplianceService } from './two-factor-compliance.service.js'
import { AUTH_INSTANCE, AUTH_SESSION_READER, SESSION_LIST_READER } from './auth.tokens.js'
import type { AuthSessionReader, SessionListReader } from './auth.tokens.js'
import { MAIL_TRANSPORT } from './mail/mail-transport.types.js'
import type { MailTransport } from './mail/mail-transport.types.js'
// T-014/S4 EKLEMESİ (po R-PO3): taşıyıcı sağlayıcısının YENİ evi.
import { MailModule } from './mail/mail.module.js'
// T-006/S8 EKLEMESİ: `RateLimitGuard` (`APP_GUARD`, V-P2) +
// `RateLimitAccountResetInterceptor` (`APP_INTERCEPTOR`, K3 "başarılı giriş
// hesap sayacını sıfırlar") + `RateLimitService` (Redis sayaç deposu).
import { RateLimitAccountResetInterceptor, RateLimitGuard } from './rate-limit/rate-limit.guard.js'
import { RateLimitService } from './rate-limit/rate-limit.service.js'
import { AUTH_PRISMA_CLIENT, SessionsService } from './sessions.service.js'
import { SessionsController } from './sessions.controller.js'
// ROADMAP v0.0.15.1, T-017/S8a: `StepUpService` — `SessionsService`'in
// `revokeOwnSession`/`revokeAllOwnSessions`'ının BAĞIMLISI. S5 bu sınıfı
// yazdı ama HİÇBİR modüle provider olarak KAYDETMEDİ (bilerek, devir notu) —
// kayıt BURADA tamamlanır.
import { StepUpService } from './step-up/step-up.service.js'

/**
 * `AuthModule`'e ÖZEL, ayrı bir Prisma istemcisi (dosya başı yorumu). Eager
 * `$connect()` YOK (K-A3 deseniyle AYNI) — bağlantı ilk sorguda kurulur.
 *
 * T-015 FIX turu 2 (solid'in SRP reçetesi, qa QA-3/QA-4, solid SD-9) — `export`
 * EDİLDİ (yalnızca TS düzeyinde; Nest'in `AuthModule.exports` DİZİSİNE
 * GİRMEDİ, dışarıya açılan modül yüzeyi DEĞİŞMEDİ). Gerekçe: istek-fazı
 * testlerinin üretim açılış kapısına (bu sınıfın GERÇEK `onModuleInit`'i,
 * DB'ye bağımlı) BAĞIMLI KALMAMASI için `__tests__/helpers/
 * auth-prisma-client-resource-boot-probe-fixture.ts` bu sınıfı GENİŞLETİP
 * `Test.overrideProvider(AuthPrismaClientResource)` ile DEĞİŞTİRİR — bunun
 * için TOKEN'IN (sınıfın kendisi) test dosyalarından İÇE AKTARILABİLİR
 * olması gerekir. Üretim davranışı (fail-closed boot probu, aşağıda)
 * BİREBİR KORUNDU — yalnızca görünürlük değişti.
 */
@Injectable()
export class AuthPrismaClientResource implements OnModuleInit, OnModuleDestroy {
  readonly client: AuthPrismaDatabase

  constructor(
    @Inject(API_ENV) env: ApiEnv,
    @Inject(ROOT_LOGGER) private readonly logger: Logger,
  ) {
    // ROADMAP v0.0.14.1, T-015/ST-F — `env.DATABASE_URL` (en az yetkili
    // `arkesoft_app`, artık `account`/`session`/`verification` tablolarında
    // HİÇBİR yetki taşımıyor) → `env.DATABASE_AUTH_URL` (`arkesoft_auth`,
    // yalnızca bu üç tabloya kolon bazlı DML + `app_user`'a tablo bazlı
    // DML). TEK satırlık yönlendirme — yeni istemci/havuz/yaşam döngüsü
    // KURULMADI, `AuthPrismaClientResource` ZATEN ayrı (dosya başı yorumu).
    // `??`/`||`/`?:` ile `DATABASE_URL`'e geri düşüş YASAK (R-PM4/K-A4) —
    // kanıt: `__tests__/database-auth-url-*.test.ts` (c1/c2/c3).
    this.client = createPrismaClient({ databaseUrl: env.DATABASE_AUTH_URL })
  }

  /**
   * ROADMAP v0.0.14.1, T-015 FIX turu 1, madde 2 (security S-2(b)) —
   * `@arkesoft/db`'nin negatif yetenek probunu (`assertAuthRoleIsRestricted`)
   * AÇILIŞTA BİR KEZ çağırır, HER İSTEKTE DEĞİL. Nest bu metodu modül
   * grafiği kurulurken bir kez çalıştırır (`OnModuleInit`); prob reddederse
   * (`AuthRoleNotRestrictedError`) hata loglanır VE yukarı fırlatılır —
   * `catch {}` ile SESSİZCE yutulmaz, `NestFactory.create()` zinciri
   * reddedilir ve süreç açılışta DÜŞER (fail-closed, bağlayıcı kısıt).
   */
  async onModuleInit(): Promise<void> {
    try {
      await assertAuthRoleIsRestricted(this.client)
    } catch (error) {
      this.logger.error(
        describeErrorCause(error),
        'arkesoft_auth bağlantısı kısıtlı değil — açılış durduruluyor (S-2(b) fail-closed probu)',
      )
      throw error
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.client.$disconnect()
  }
}

const authInstanceProvider: Provider = {
  provide: AUTH_INSTANCE,
  useFactory: (
    env: ApiEnv,
    prismaResource: AuthPrismaClientResource,
    mailTransport: MailTransport,
    logger: Logger,
  ): Auth =>
    createAuthInstance({ env, prismaClient: prismaResource.client, mailTransport, logger }),
  inject: [API_ENV, AuthPrismaClientResource, MAIL_TRANSPORT, ROOT_LOGGER],
}

// FIX turu 1, madde 3 (F1(b)) — `AuthModule` DIŞINA (`AuthContextMiddleware`)
// açılan TEK yüzey.
//
// FIX turu 2, madde 7 (security tur2 S-6) — `.bind(auth.api)` ile DOĞRUDAN
// delege ETMEZ artık; sonucu `auth.tokens.ts`'in VERİ düzeyinde daraltılmış
// `AuthSessionReaderResult`'ına EŞLER (`userId`/`sessionId`, ham
// `session.token` BU SARMALAYICIDAN GEÇMEZ). `auth.api.getSession` hâlâ
// `.bind(auth.api)` İLE çağrılır (better-call'un endpoint fonksiyonu `this`'e
// GÜVENMEZ, ama bağlama MALİYETSİZ ve davranışı DEĞİŞTİRMEZ) — ÖNCEKİ
// davranışla AYNI girdi/semantik, yalnızca ÇIKTI daraltılmış.
const authSessionReaderProvider: Provider = {
  provide: AUTH_SESSION_READER,
  useFactory: (auth: Auth): AuthSessionReader => ({
    getSession: async (input) => {
      const result = await auth.api.getSession.bind(auth.api)(input)
      return result === null ? null : { userId: result.user.id, sessionId: result.session.id }
    },
  }),
  inject: [AUTH_INSTANCE],
}

// T-006/S6 EKLEMESİ: `AUTH_PRISMA_CLIENT` — `sessions.service.ts`'in token'ı
// (`auth.tokens.ts` S5'in, DEĞİŞTİRİLMEZ — bu yüzden token orada DEĞİL,
// `sessions.service.ts`'te tanımlı; BURADAN içe aktarılır, TEK yönlü
// bağımlılık). `AuthPrismaClientResource`'un (yukarıda, S5) KENDİ istemcisini
// PAYLAŞIR — üçüncü bir DB bağlantısı AÇILMAZ.
const authPrismaClientProvider: Provider = {
  provide: AUTH_PRISMA_CLIENT,
  useFactory: (resource: AuthPrismaClientResource): AuthPrismaDatabase => resource.client,
  inject: [AuthPrismaClientResource],
}

// T-006/S6 EKLEMESİ: `AuthGuard` — R2 kiracı üyeliği kontrolü, `TenancyModule`'ün
// `tenantGuardProvider`'ıyla AYNI desen (`APP_GUARD`, global).
const authGuardProvider: Provider = {
  provide: APP_GUARD,
  useClass: AuthGuard,
}

// T-006/S8 EKLEMESİ: `RateLimitGuard` — oran sınırlama (K3), `AuthGuard`'ın
// AYNI `APP_GUARD` deseni (V-P2, PO varsayımı TUTTU — `app.module.ts`'E
// DOKUNULMADI). Yalnızca `rate-limit.policy.ts`'in tanıdığı dört rotada
// devreye girer; diğer tüm isteklerde `canActivate` anında `true` döner.
const rateLimitGuardProvider: Provider = {
  provide: APP_GUARD,
  useClass: RateLimitGuard,
}

// T-006/S8 EKLEMESİ: `RateLimitAccountResetInterceptor` — K3 "başarılı giriş
// hesap sayacını SIFIRLAR" (bkz. `rate-limit.guard.ts` dosya başı yorumu,
// `CanActivate`'in TEK BAŞINA gözlemleyemediği bir olay İÇİN gerekli ikinci
// enhancer).
const rateLimitResetInterceptorProvider: Provider = {
  provide: APP_INTERCEPTOR,
  useClass: RateLimitAccountResetInterceptor,
}

// ROADMAP v0.0.15.1, T-017/S8a (po ⭐ kısıt (b), `auth.tokens.ts`'in
// `SESSION_LIST_READER` yorumu) — `SessionsService`'in YALNIZCA okuma
// metodunu (`listOwnSessions`) dışa açan daraltılmış token. `TrpcModule`'ün
// `SessionListReadPort` adaptörü (T-017/S9) bunu enjekte eder; YAZMA
// metotları (`revokeOwnSession`/`revokeAllOwnSessions`) bu yüzeyden
// ERİŞİLEMEZ.
const sessionListReaderProvider: Provider = {
  provide: SESSION_LIST_READER,
  useFactory: (sessionsService: SessionsService): SessionListReader => ({
    listOwnSessions: (identity) => sessionsService.listOwnSessions(identity),
  }),
  inject: [SessionsService],
}

@Module({
  // T-014/S4 EKLEMESİ (po R-PO3): `MAIL_TRANSPORT` token'ı artık `MailModule`
  // tarafından sağlanıyor; `authInstanceProvider` onu BU import üzerinden
  // görür. Sağlayıcı tekildir — ikinci bir SMTP soketi açılmaz.
  imports: [MailModule],
  // T-006/S6 EKLEMESİ: `SessionsController` `AuthController`'DAN ÖNCE
  // listelenir — `AuthController`'ın `@All('auth/*path')` joker rotası KAYIT
  // SIRASINA göre eşleşir (Express özgüllüğe göre ÖNCELİKLENDİRMEZ); ters
  // sırada `/auth/sessions*` istekleri bu controller'a HİÇBİR ZAMAN ulaşmaz
  // (bkz. `sessions.controller.ts` dosya başı yorumu).
  controllers: [SessionsController, AuthController],
  providers: [
    AuthPrismaClientResource,
    authInstanceProvider,
    // FIX turu 1, madde 3 (F1(b)):
    authSessionReaderProvider,
    // T-006/S6 EKLEMESİ:
    authPrismaClientProvider,
    SessionsService,
    // T-016 FIX turu 1, madde 3/M-1 EKLEMESİ (solid) — `AuthGuard`'ın
    // `@Inject(TwoFactorComplianceService)` bağımlılığı için.
    TwoFactorComplianceService,
    authGuardProvider,
    // T-006/S8 EKLEMESİ:
    RateLimitService,
    rateLimitGuardProvider,
    rateLimitResetInterceptorProvider,
    // ROADMAP v0.0.15.1, T-017/S8a — `SessionsService`'in step-up bağımlısı
    // + daraltılmış okuma token'ı (dosya başı yorumu).
    StepUpService,
    sessionListReaderProvider,
  ],
  // FIX turu 1, madde 3 (F1(b)) — DEĞİŞTİRİLDİ: `AUTH_INSTANCE` (TAM `Auth`
  // yüzeyi, `auth.api.listSessions`/`revokeSession`/... HEPSİ) ARTIK DIŞA
  // AÇILMIYOR. `AuthContextMiddleware` `app.module.ts`'in `configure()`'unda
  // `consumer.apply()` ile kaydedilir ve AppModule'ün KENDİ enjektörü
  // üzerinden kurulur; bu enjektör yalnızca DOĞRUDAN import ettiği
  // modüllerin EXPORT'larını görür (`tenancy.module.ts` dosya başı
  // yorumunun AYNI mekanizması) — bu yüzden dışa AÇILAN yüzey artık
  // `AUTH_SESSION_READER` (yalnızca `getSession`) ile DARALTILDI.
  //
  // ROADMAP v0.0.15.1, T-017/S8a — İKİNCİ token EKLENDİ: `SESSION_LIST_READER`
  // (yalnızca `listOwnSessions`). Dosya başı "GÜNCELLEME" yorumu bu kararın
  // GEREKÇESİNİ taşır — YAZMA yüzeyi (`revokeOwnSession`/`revokeAllOwnSessions`)
  // HÂLÂ dışa AÇILMIYOR.
  exports: [AUTH_SESSION_READER, SESSION_LIST_READER],
})
export class AuthModule {}

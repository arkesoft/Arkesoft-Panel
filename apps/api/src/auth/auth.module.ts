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
// `infraEnvSchema`'da mevcut) eşleyen TEK yer burasıdır.
//
// Yaşam döngüsü: hem ham Prisma istemcisi hem SMTP taşıyıcısı KENDİ
// kaynaklarını açar; `OnModuleDestroy` ile kapanışta serbest bırakılır
// (`PrismaService`'in AC11 desenine paralel — sarkan bağlantı/soket
// bırakmaz, test teardown'ı temiz kalır).

import { Inject, Injectable, Module } from '@nestjs/common'
import type { OnModuleDestroy, Provider } from '@nestjs/common'
// T-006/S8 EKLEMESİ: `APP_INTERCEPTOR` — `RateLimitAccountResetInterceptor`
// için (`APP_GUARD` ile AYNI "modülün global'liğinden BAĞIMSIZ kaydolur"
// mekanizması, `tenancy.module.ts` dosya başı yorumu). Mevcut `APP_GUARD`
// importu SİLİNMEDİ, yalnızca token EKLENDİ.
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { createPrismaClient } from '@arkesoft/db'
import type { AuthPrismaDatabase } from '@arkesoft/db'
import type { Auth } from 'better-auth'
import type { Logger } from 'pino'

import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { createAuthInstance } from './auth-instance.js'
import { AuthController } from './auth.controller.js'
import { AuthGuard } from './auth.guard.js'
import { AUTH_INSTANCE, AUTH_SESSION_READER } from './auth.tokens.js'
import type { AuthSessionReader } from './auth.tokens.js'
import { MAIL_TRANSPORT } from './mail/mail-transport.types.js'
import type { MailTransport } from './mail/mail-transport.types.js'
import { SmtpMailTransport } from './mail/smtp-mail-transport.js'
// T-006/S8 EKLEMESİ: `RateLimitGuard` (`APP_GUARD`, V-P2) +
// `RateLimitAccountResetInterceptor` (`APP_INTERCEPTOR`, K3 "başarılı giriş
// hesap sayacını sıfırlar") + `RateLimitService` (Redis sayaç deposu).
import { RateLimitAccountResetInterceptor, RateLimitGuard } from './rate-limit/rate-limit.guard.js'
import { RateLimitService } from './rate-limit/rate-limit.service.js'
import { AUTH_PRISMA_CLIENT, SessionsService } from './sessions.service.js'
import { SessionsController } from './sessions.controller.js'

/**
 * `AuthModule`'e ÖZEL, ayrı bir Prisma istemcisi (dosya başı yorumu). Eager
 * `$connect()` YOK (K-A3 deseniyle AYNI) — bağlantı ilk sorguda kurulur.
 */
@Injectable()
class AuthPrismaClientResource implements OnModuleDestroy {
  readonly client: AuthPrismaDatabase

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.client = createPrismaClient({ databaseUrl: env.DATABASE_URL })
  }

  onModuleDestroy(): Promise<void> {
    return this.client.$disconnect()
  }
}

/** `SmtpMailTransport`'u `ApiEnv`'den kuran ve yaşam döngüsünü yöneten kaynak. */
@Injectable()
class AuthMailTransportResource implements OnModuleDestroy {
  readonly transport: SmtpMailTransport

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.transport = new SmtpMailTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      fromName: env.MAIL_FROM_NAME,
      fromAddress: env.MAIL_FROM_ADDRESS,
    })
  }

  onModuleDestroy(): void {
    this.transport.close()
  }
}

const mailTransportProvider: Provider = {
  provide: MAIL_TRANSPORT,
  useFactory: (resource: AuthMailTransportResource): MailTransport => resource.transport,
  inject: [AuthMailTransportResource],
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

@Module({
  // T-006/S6 EKLEMESİ: `SessionsController` `AuthController`'DAN ÖNCE
  // listelenir — `AuthController`'ın `@All('auth/*path')` joker rotası KAYIT
  // SIRASINA göre eşleşir (Express özgüllüğe göre ÖNCELİKLENDİRMEZ); ters
  // sırada `/auth/sessions*` istekleri bu controller'a HİÇBİR ZAMAN ulaşmaz
  // (bkz. `sessions.controller.ts` dosya başı yorumu).
  controllers: [SessionsController, AuthController],
  providers: [
    AuthPrismaClientResource,
    AuthMailTransportResource,
    mailTransportProvider,
    authInstanceProvider,
    // FIX turu 1, madde 3 (F1(b)):
    authSessionReaderProvider,
    // T-006/S6 EKLEMESİ:
    authPrismaClientProvider,
    SessionsService,
    authGuardProvider,
    // T-006/S8 EKLEMESİ:
    RateLimitService,
    rateLimitGuardProvider,
    rateLimitResetInterceptorProvider,
  ],
  // FIX turu 1, madde 3 (F1(b)) — DEĞİŞTİRİLDİ: `AUTH_INSTANCE` (TAM `Auth`
  // yüzeyi, `auth.api.listSessions`/`revokeSession`/... HEPSİ) ARTIK DIŞA
  // AÇILMIYOR. `AuthContextMiddleware` `app.module.ts`'in `configure()`'unda
  // `consumer.apply()` ile kaydedilir ve AppModule'ün KENDİ enjektörü
  // üzerinden kurulur; bu enjektör yalnızca DOĞRUDAN import ettiği
  // modüllerin EXPORT'larını görür (`tenancy.module.ts` dosya başı
  // yorumunun AYNI mekanizması) — bu yüzden dışa AÇILAN yüzey artık
  // `AUTH_SESSION_READER` (yalnızca `getSession`) ile DARALTILDI.
  exports: [AUTH_SESSION_READER],
})
export class AuthModule {}

// @arkesoft/api — TrpcModule (ROADMAP v0.0.6, T-007/S5, architect "Modül
// yerleşimi" bölümü)
//
// HİÇBİR global enhancer (`APP_GUARD`/`APP_INTERCEPTOR`/`APP_FILTER`)
// KAYDETMEZ — mevcut guard SIRASI (`TenantGuard` → `AuthGuard` →
// `RateLimitGuard`, hepsi başka modüllerin `APP_GUARD` kaydı) DEĞİŞMEZ.
// `TrpcController`'ın `@All('trpc/*path')` rotası olduğu İÇİN bu guard'lar
// `/trpc/*` için zaten KOŞAR (K4 gerekçe 3) — tRPC katmanı üyelik/kimlik
// kontrolünü KOPYALAMAZ.

// GÜNCELLEME (ROADMAP v0.0.11, T-013/S8): `JobReadPortAdapter` sağlayıcı
// olarak EKLENDİ. ⚠ Bu modül `QueueModule`'ü import ETMEZ ve etmemelidir —
// `job.get`/`job.list` SALT OKUNUR bir yüzeydir, iş kaydı tablosunu okur,
// kuyruğa dokunmaz. Buraya `QueueModule` bağlamak API sürecine üretici
// yeteneğinden FAZLASINI vermek olurdu (AC13'ün yapısal ayrımı:
// `QueueWorkerModule` yalnızca `WorkerModule`'de).

// GÜNCELLEME (ROADMAP v0.0.14, T-014/S4): iki port adaptörü EKLENDİ —
// `MembershipReadPortAdapter` (izin kapısının rol okuması) ve
// `MemberWritePortAdapter` (platformun ilk yazma portu). ⚠ İŞ MANTIĞI BU
// MODÜLDE DEĞİL: yazma adaptörü `MemberModule`'ün servisine delege eder ve o
// modül `imports`'a eklendi. Bu modül hâlâ hiçbir global enhancer kaydetmez.

// GÜNCELLEME (ROADMAP v0.0.15, T-016/S7): `TenantSecurityWritePortAdapter`
// EKLENDİ — `tenant.updateSecurityPolicy`'nin iş mantığı adaptörü. İş
// mantığı BU MODÜLDE DEĞİL (`MemberWritePortAdapter`'ın AYNI notu):
// adaptör `TenantSecurityModule`'ün servisine delege eder ve o modül
// `imports`'a eklendi.

// GÜNCELLEME (ROADMAP v0.0.15, T-016 FIX turu 2/M-4): `SessionSecurityReadPortAdapter`
// EKLENDİ — `session.me`'nin `twoFactorEnabled` alanının iş mantığı
// adaptörü. ⚠ `TenantReadPortAdapter`'ın AYNI deseni: adaptör KENDİSİ
// `PrismaService`'i doğrudan kullanır (`TenantSecurityModule`/`MemberModule`
// gibi AYRI bir servis modülüne delege ETMEZ — okuma TEK bir `findUnique`,
// ayrı bir servis katmanı İCAT ETMEK gereksiz dolaylama olurdu), bu yüzden
// `imports`'a YENİ bir modül EKLENMEDİ (`PrismaModule` ZATEN `@Global()`).

// GÜNCELLEME (ROADMAP v0.0.15.1, T-017/S9, po ⭐ KISIT (b)): `SessionListReadPortAdapter`
// EKLENDİ — `session.list`'in iş mantığı adaptörü. ⚠ `SessionSecurityReadPortAdapter`'ın
// AYRI deseni BURADA GEÇERSİZ: `session` sır taşıyan modellerden biri,
// `apps/api/eslint.config.mjs:61-75` `AuthPrismaDatabase` ithalini
// `src/{prisma,auth}/**` DIŞINDA yasaklar — adaptör `AuthModule`'ün dışa
// açtığı `SESSION_LIST_READER` token'ına (`SessionsService.listOwnSessions`'a
// daraltılmış) DELEGE EDER. Bu yüzden `imports`'a `AuthModule` EKLENDİ —
// token ORADAN gelir.

// GÜNCELLEME (ROADMAP v0.1.0, T-019/S9a): `RegistrationReadPortAdapter`/
// `RegistrationWritePortAdapter` EKLENDİ — `registration.*`'ın iş mantığı
// adaptörleri. ⚠ Bu dosya `po`'nun T-019 dosya sahipliği listesinde
// ADLANDIRILMAMIŞTI (S3'ün `trpc-context.types.ts` boşluğuyla AYNI sınıf —
// `TrpcPorts`'un yeni ZORUNLU üyelerini DOLDURMAK bu modülün DI grafiğine
// dokunmadan DERLENEMEZ/ÇALIŞAMAZ); `MemberWritePortAdapter`'ın AYNI
// deseni: iş mantığı BU MODÜLDE DEĞİL, adaptör `RegistrationModule`'ün
// servisine delege eder ve o modül `imports`'a EKLENDİ.

// GÜNCELLEME (ROADMAP v0.0.20, T-021/S7, ADR-0023 Karar 1/2/3):
// `PlatformAdminReadPortAdapter`/`PlatformReadPortAdapter` EKLENDİ —
// `platform.*`'ın iş mantığı adaptörleri. AYNI desen: iş mantığı BU
// MODÜLDE DEĞİL (`ImpersonationService`'te, `PlatformModule` İÇİNDE), bu
// yüzden `PlatformModule` `imports`'a EKLENDİ.
import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module.js'
import { MemberModule } from '../member/member.module.js'
import { PlatformModule } from '../platform/platform.module.js'
import { RegistrationModule } from '../registration/registration.module.js'
import { TenantSecurityModule } from '../tenant/tenant-security.module.js'
import { JobReadPortAdapter } from './ports/job-read.port.adapter.js'
import { MemberWritePortAdapter } from './ports/member-write.port.adapter.js'
import { MembershipReadPortAdapter } from './ports/membership-read.port.adapter.js'
import { RegistrationReadPortAdapter } from './ports/registration-read.port.adapter.js'
import { RegistrationWritePortAdapter } from './ports/registration-write.port.adapter.js'
import { SessionListReadPortAdapter } from './ports/session-list-read.port.adapter.js'
import { SessionSecurityReadPortAdapter } from './ports/session-security-read.port.adapter.js'
import { StorefrontTenantReadPortAdapter } from './ports/storefront-tenant-read.port.adapter.js'
import { TenantReadPortAdapter } from './ports/tenant-read.port.adapter.js'
import { TenantSecurityWritePortAdapter } from './ports/tenant-security-write.port.adapter.js'
import { TrpcController } from './trpc.controller.js'
import { TrpcErrorsPortAdapter } from './trpc-errors.port.adapter.js'

@Module({
  imports: [MemberModule, TenantSecurityModule, AuthModule, RegistrationModule, PlatformModule],
  controllers: [TrpcController],
  providers: [
    TenantReadPortAdapter,
    TenantSecurityWritePortAdapter,
    StorefrontTenantReadPortAdapter,
    JobReadPortAdapter,
    MembershipReadPortAdapter,
    MemberWritePortAdapter,
    SessionSecurityReadPortAdapter,
    SessionListReadPortAdapter,
    RegistrationReadPortAdapter,
    RegistrationWritePortAdapter,
    TrpcErrorsPortAdapter,
  ],
})
export class TrpcModule {}

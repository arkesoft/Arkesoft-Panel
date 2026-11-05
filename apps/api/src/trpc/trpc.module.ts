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

import { Module } from '@nestjs/common'

import { MemberModule } from '../member/member.module.js'
import { JobReadPortAdapter } from './ports/job-read.port.adapter.js'
import { MemberWritePortAdapter } from './ports/member-write.port.adapter.js'
import { MembershipReadPortAdapter } from './ports/membership-read.port.adapter.js'
import { StorefrontTenantReadPortAdapter } from './ports/storefront-tenant-read.port.adapter.js'
import { TenantReadPortAdapter } from './ports/tenant-read.port.adapter.js'
import { TrpcController } from './trpc.controller.js'
import { TrpcErrorsPortAdapter } from './trpc-errors.port.adapter.js'

@Module({
  imports: [MemberModule],
  controllers: [TrpcController],
  providers: [
    TenantReadPortAdapter,
    StorefrontTenantReadPortAdapter,
    JobReadPortAdapter,
    MembershipReadPortAdapter,
    MemberWritePortAdapter,
    TrpcErrorsPortAdapter,
  ],
})
export class TrpcModule {}

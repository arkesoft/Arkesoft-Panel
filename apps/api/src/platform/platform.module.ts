// @arkesoft/api — PlatformModule (ROADMAP v0.0.20, T-021/S7, ADR-0023 Karar
// 1/2/3)
//
// `ImpersonationService`'i VE onun TEK tüketicisi olan iki port adaptörünü
// kaydeder — `TrpcModule`'ün `MemberModule`/`TenantSecurityModule`/
// `RegistrationModule`'ü import etme deseninin AYNISI (iş mantığı TrpcModule
// İÇİNDE DEĞİL, adaptörler bu modülün servisine delege eder).
//
// ⚠ `PlatformAdminIpGuard` BURADA KAYITLI DEĞİLDİR — `SameOriginGuard`'ın
// AYNI deseni (`trpc.controller.ts` dosya başı yorumu): bir `@Injectable()`
// guard, `@UseGuards()` ile referans verildiğinde Nest'in DI konteyneri onu
// `providers` dizisine EKLENMEDEN de kurar (bağımlılığı `ApiEnv` token'ı
// GLOBAL'dir).

import { Module } from '@nestjs/common'

import { ImpersonationService } from './impersonation.service.js'
import { PlatformAdminReadPortAdapter } from './platform-admin-read.port.adapter.js'
import { PlatformReadPortAdapter } from './platform-read.port.adapter.js'

@Module({
  providers: [ImpersonationService, PlatformAdminReadPortAdapter, PlatformReadPortAdapter],
  exports: [ImpersonationService, PlatformAdminReadPortAdapter, PlatformReadPortAdapter],
})
export class PlatformModule {}

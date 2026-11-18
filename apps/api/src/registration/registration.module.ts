// @arkesoft/api — RegistrationModule (ROADMAP v0.1.0, T-019/S9a)
//
// `MemberModule`/`TenantSecurityModule`'ün AYNI gerekçesi (CLAUDE.md §3): iş
// mantığı bir SUNUM/TAŞIMA detayı değildir, kendi modülünde yaşar. HİÇBİR
// global enhancer (`APP_GUARD`/`APP_INTERCEPTOR`/`APP_FILTER`) KAYDETMEZ.
//
// `TenancyModule` import edilir — `RegistrationService` kabul oracle'ı için
// `TenantResolverService`'e bağımlıdır (`TenancyModule` `@Global()` DEĞİL,
// `exports: [TenantResolverService]` üzerinden görülür). `PrismaService`
// `@Global()` olan `PrismaModule`'den gelir — burada LİSTELENMEZ
// (`MemberModule`'ün AYNI notu).

import { Module } from '@nestjs/common'

import { TenancyModule } from '../tenancy/tenancy.module.js'
import { RegistrationService } from './registration.service.js'

@Module({
  imports: [TenancyModule],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}

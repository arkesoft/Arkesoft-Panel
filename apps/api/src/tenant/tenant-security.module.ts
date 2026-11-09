// @arkesoft/api — TenantSecurityModule (ROADMAP v0.0.15, T-016/S7)
//
// `MemberModule`'ün (T-014/S4) AYNI gerekçesi: iş mantığı bir SUNUM/TAŞIMA
// detayı değildir (CLAUDE.md §3), kendi modülünde yaşar. HİÇBİR global
// enhancer (`APP_GUARD`/`APP_INTERCEPTOR`/`APP_FILTER`) KAYDETMEZ.
//
// `PrismaService` `@Global()` olan `PrismaModule`'den gelir — burada
// listelenmez (`MemberModule`'ün AYNI notu).

import { Module } from '@nestjs/common'

import { TenantSecurityService } from './tenant-security.service.js'

@Module({
  providers: [TenantSecurityService],
  exports: [TenantSecurityService],
})
export class TenantSecurityModule {}

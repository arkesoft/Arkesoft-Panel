// @arkesoft/api — TrpcModule (ROADMAP v0.0.6, T-007/S5, architect "Modül
// yerleşimi" bölümü)
//
// HİÇBİR global enhancer (`APP_GUARD`/`APP_INTERCEPTOR`/`APP_FILTER`)
// KAYDETMEZ — mevcut guard SIRASI (`TenantGuard` → `AuthGuard` →
// `RateLimitGuard`, hepsi başka modüllerin `APP_GUARD` kaydı) DEĞİŞMEZ.
// `TrpcController`'ın `@All('trpc/*path')` rotası olduğu İÇİN bu guard'lar
// `/trpc/*` için zaten KOŞAR (K4 gerekçe 3) — tRPC katmanı üyelik/kimlik
// kontrolünü KOPYALAMAZ.

import { Module } from '@nestjs/common'

import { TenantReadPortAdapter } from './ports/tenant-read.port.adapter.js'
import { TrpcController } from './trpc.controller.js'
import { TrpcErrorsPortAdapter } from './trpc-errors.port.adapter.js'

@Module({
  controllers: [TrpcController],
  providers: [TenantReadPortAdapter, TrpcErrorsPortAdapter],
})
export class TrpcModule {}

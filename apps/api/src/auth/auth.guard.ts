// @arkesoft/api — AuthGuard (ROADMAP v0.0.5, T-006/S6, architect R2 — "⚠
// AuthGuard kiracı üyeliğini de kontrol eder", madde 4/5 HTTP eşdeğeri,
// riski 13)
//
// ALS SÖZLEŞMESİNİN "ZORLAYAN" tarafı (AUTH tarafı) — `TenantGuard`'ın
// (`tenancy/tenant.guard.ts`) AYNI deseni, `APP_GUARD` olarak global bağlanır
// (`auth.module.ts`). `AuthContextMiddleware`'in ürettiği `RequestContext.auth`
// burada HAZIR beklenir.
//
// R2 — BU, `withTenant()`'IN BİR ÜRETİM KOD YOLUNDAKİ İLK KULLANIMIDIR:
// kimliği doğrulanmış bir kullanıcının BU kiracıya üye olup olmadığını
// `PrismaService.withTenant(tenantId, tx => tx.tenantMembership.findUnique(...))`
// ile DOĞRULAR. Üyelik YOKSA 403 `TENANT_MEMBERSHIP_REQUIRED` — gövde
// `tenantId` TAŞIMAZ (CLAUDE.md §7 madde 12), yalnızca `context`'e (log) gider.
//
// ÖNBELLEKLEME YOK, BİLİNÇLİ (A-V26): hatalı bir önbellek anahtarı DOĞRUDAN
// çapraz kiracı sızıntısıdır. Perf borcu v0.0.14 (architect riski 10).
//
// İKİ EXHAUSTIVE SWİTCH, İKİ FARKLI birleşim üzerinde (`AuthResolution.kind`,
// sonra — SADECE `authenticated` dalında — `TenantResolution.kind`). "Default
// allow" dalı HİÇBİRİNDE YAPISAL OLARAK YOKTUR — `assertNever` (S3'ün ortak
// helper'ı, DÖRDÜNCÜ kopya YAZILMAZ).
//
// FAIL-CLOSED ZİNCİR (architect riski 13): `auth.kind === 'pending'` →
// `AuthContextMiddleware` bu rota için HİÇ KOŞMADI → 500 (`TenantGuard`'ın
// `pending` dalıyla AYNI gerekçe). `tenant.kind === 'pending'` (SADECE
// `authenticated` dalının İÇİNDE, üyelik kontrolüne girmeden ÖNCE kontrol
// edilir) → `TenantContextMiddleware` bu rota için HİÇ KOŞMADI → 500 — bu,
// `AuthGuard`'ın `TenantGuard`'dan BAĞIMSIZ, KENDİ sıra bağımlılığı
// savunmasıdır (middleware zinciri HER ZAMAN guard aşamasından ÖNCE TAMAMEN
// biter — bu yüzden iki `APP_GUARD`'ın KENDİ ARALARINDAKİ çalışma sırası
// SONUCU ETKİLEMEZ; bu dal yalnızca "middleware HİÇ koşmadı" regresyonunu
// yakalar).
//
// `tenant.kind === 'unresolved' | 'failed'` (authenticated dalının içinde):
// BU GUARD'IN İŞİ DEĞİL — `TenantGuard` (AYRI `APP_GUARD`) bu durumları KENDİ
// uygun hatasına (404 `TenantNotFoundError` / 503 `TenantResolutionFailedError`)
// çevirecek; burada TEKRARLANMAZ (PM R3'ün "tek kaynak" ruhu: bir karar, bir
// zorlayıcı).

import { Inject, Injectable } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { Logger } from 'pino'

import type { CurrentUserIdentity } from './auth-resolution.types.js'
import { assertNever } from '../errors/assert-never.js'
import { AuthProviderFailedError } from '../errors/domain/auth-provider-failed.error.js'
import { TenantMembershipRequiredError } from '../errors/domain/tenant-membership-required.error.js'
import { UnauthenticatedError } from '../errors/domain/unauthenticated.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { getRequestContext } from '../request-context/request-context.accessors.js'
import type { TenantResolution } from '../request-context/request-context.types.js'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const { auth, tenant, logger } = getRequestContext()

    switch (auth.kind) {
      case 'exempt':
        return true
      case 'unauthenticated':
        throw new UnauthenticatedError()
      case 'failed':
        throw new AuthProviderFailedError(auth.cause)
      case 'pending':
        // "Default allow" dalı YOKTUR — middleware zincirinin HİÇ koşmadığı
        // bir rota BİLİNÇSİZCE açılmaz, FIRLATILIR (`TenantGuard`'ın aynı
        // desenin AUTH eşdeğeri).
        throw new Error(
          'AuthGuard: AuthResolution "pending" kaldı — AuthContextMiddleware bu rota için koşmadı (middleware zinciri/forRoutes yapılandırması kontrol edilmeli).',
        )
      case 'authenticated':
        return this.enforceTenantMembership(auth, tenant, logger)
      default:
        return assertNever(auth, 'auth.guard.ts: AuthResolution.kind')
    }
  }

  /** R2 — kimliği doğrulanmış kullanıcının ÇÖZÜLMÜŞ kiracıya üyeliğini zorlar. */
  private async enforceTenantMembership(
    identity: CurrentUserIdentity,
    tenant: TenantResolution,
    logger: Logger,
  ): Promise<boolean> {
    switch (tenant.kind) {
      case 'exempt':
        // Örn. `/auth/sessions*` (kiracıdan muaf, kimlikten muaf DEĞİL) veya
        // panel host'u — tenant kavramı BU uç için HİÇ geçerli değil.
        return true
      case 'resolved': {
        const tenantId = tenant.tenant.id

        // R2 — `withTenant()`'ın BİR ÜRETİM kod yolundaki İLK kullanımı.
        const membership = await this.prismaService.withTenant(tenantId, (tx) =>
          tx.tenantMembership.findUnique({
            where: { tenantId_userId: { tenantId, userId: identity.userId } },
            select: { id: true },
          }),
        )

        if (membership === null) {
          // FIX turu 1, madde 10 (LOW, GÜÇLENDİRİLDİ) — NE `tenantId` NE
          // `userId` BURADA TEKRAR GEÇİRİLİR: bu guard aşamasına
          // ULAŞILDIĞINDA `logger`, `TenantContextMiddleware`'in
          // `child({tenantId})` VE `AuthContextMiddleware`'in (FIX turu 1,
          // madde 5) `child({userId})` ile ZATEN bağladığı örnektir — ikisi
          // de ikinci kez geçirilirse NDJSON satırında İKİ KEZ görünür
          // (ÖLÇÜLDÜ: ilk düzeltmem yalnızca `tenantId`'yi kaldırmıştı,
          // `userId` o anda henüz child'a bağlı DEĞİLDİ — madde 5'in
          // eklenmesiyle BU satır da ikinci bir tekrara DÜŞTÜ, şimdi
          // İKİSİ de kaldırıldı).
          logger.warn('kiracı üyeliği yok')
          throw new TenantMembershipRequiredError(identity.userId, tenantId)
        }

        return true
      }
      case 'unresolved':
      case 'failed':
        // Bu durumları `TenantGuard` (AYRI `APP_GUARD`) KENDİ başına uygun
        // hataya çevirecek — burada TEKRARLANMAZ.
        return true
      case 'pending':
        throw new Error(
          'AuthGuard: TenantResolution "pending" kaldı (sıra ihlali) — TenantContextMiddleware bu rota için koşmadı.',
        )
      default:
        return assertNever(tenant, 'auth.guard.ts: TenantResolution.kind (üyelik kontrolü)')
    }
  }
}

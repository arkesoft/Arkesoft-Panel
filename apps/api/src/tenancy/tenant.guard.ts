// @arkesoft/api — TenantGuard (ROADMAP v0.0.4, T-002/ST-5, architect K-A5)
//
// ALS SÖZLEŞMESİNİN "ZORLAYAN" tarafı — "çözen" taraf `TenantContextMiddleware`
// (yukarıda) ve `RequestContextMiddleware` (ST-4). `APP_GUARD` olarak global
// bağlanır (`tenancy.module.ts`); Nest'in çalışma sırası middleware → GUARD →
// interceptor → pipe → handler'dır, bu yüzden middleware zincirinin ürettiği
// `TenantResolution` burada HAZIR beklenir.
//
// EXHAUSTIVE `switch` + `assertNever` (R4 telafisi #1): "default allow" dalı
// YAPISAL OLARAK YOKTUR — `TenantResolution`'a yeni bir üye eklenirse
// (`switch-exhaustiveness-check` lint kuralı, packages/config/eslint/base.js)
// bu dosya DERLEME ZAMANINDA kırılır, yeni bir durum sessizce "izin ver"
// olarak YORUMLANAMAZ.
//
// `pending` → 500: `RequestContextMiddleware` HER isteğe `{ kind: 'pending' }`
// ile başlar; bu guard'a `pending` ULAŞMASI, `TenantContextMiddleware`'in o
// yol için HİÇ KOŞMADIĞI (ör. bir ileride eklenen uç middleware zincirine
// kayıt edilmeyi UNUTTU) anlamına gelir — R-P4'ün (`forRoutes` sözdizimi)
// yanlış yazılmış bir hâli de bu dalı TETİKLERDİ, bu yüzden bu dal aynı
// zamanda o regresyonu YAKALAYAN bir testtir (AC7).
//
// BU DOSYA `TENANT_EXEMPT_PATHS`'İ AYRICA SORGULAMAZ (K-A4 metninin "hem
// middleware hem guard onu okur" ifadesinin bu guard'daki karşılığı DOLAYLI
// bir okumadır): `TenantContextMiddleware` allowlist'teki bir yol için
// `{ kind: 'exempt' }` YAZAR, bu guard o sonucu `exempt` dalında GEÇİRİR —
// yol eşleştirme mantığının İKİ YERDE TEKRARLANMASI (ve birbirinden
// SAPMASI riski) BİLEREK önlenir; tek kaynak `tenant-exempt-paths.ts`,
// tek aktif okuyucu middleware'dir.

import { Injectable } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'

import { TenantResolutionFailedError } from '../errors/domain/tenant-resolution-failed.error.js'
import { TenantNotFoundError } from '../errors/domain/tenant-not-found.error.js'
import { getRequestContext } from '../request-context/request-context.accessors.js'
import type { TenantResolution } from '../request-context/request-context.types.js'

function assertNeverTenantResolution(value: never): never {
  throw new Error(`tenant.guard.ts: beklenmeyen TenantResolution.kind — ${JSON.stringify(value)}`)
}

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    const { tenant } = getRequestContext()

    return TenantGuard.enforce(tenant)
  }

  /** `TenantResolution`'ı EXHAUSTIVE switch ile zorlar — `static` olması saf test edilebilirlik içindir. */
  private static enforce(tenant: TenantResolution): boolean {
    switch (tenant.kind) {
      case 'resolved':
      case 'exempt':
        return true
      case 'unresolved':
        // CLAUDE.md §12 / AC8: var olmayan vs. yetkisiz kaynak AYNI cevabı
        // döner — bu yüzden `reason` buraya değil, SADECE `context`'e (log)
        // geçer; `toErrorBody` onu ASLA serileştirmez.
        throw new TenantNotFoundError({ reason: tenant.reason })
      case 'failed':
        throw new TenantResolutionFailedError(tenant.cause)
      case 'pending':
        // "Default allow" dalı YOKTUR — middleware zincirinin HİÇ koşmadığı
        // bir rota BİLİNÇSİZCE açılmaz, FIRLATILIR (R4 telafisi #1).
        throw new Error(
          'TenantGuard: TenantResolution "pending" kaldı — TenantContextMiddleware bu rota için koşmadı (middleware zinciri/forRoutes yapılandırması kontrol edilmeli).',
        )
      default:
        return assertNeverTenantResolution(tenant)
    }
  }
}

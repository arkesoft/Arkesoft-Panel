// @arkesoft/api — platform aktör bağlamı (ROADMAP v0.0.20, T-021/S7,
// ADR-0023 Karar 1/3)
//
// `packages/trpc`'nin `PlatformAdminReadPort`/`PlatformReadPort` yöntemleri
// (`listTenants`/`listAuditEntries`) GİRDİ şemasında `actorUserId`/`ip`/
// `userAgent` TAŞIMAZ (`platform.schema.ts`'in tel sözleşmesi, bu alt
// görevin dokunamadığı paket) — bu yüzden denetim satırının "kim, nereden"
// bilgisi ALS'DEN (`getRequestContext()`) okunur, `member.service.ts`'in
// AYNI deseni (`client = getRequestContext().client`). Bu, bir kaçış kapısı
// DEĞİL: `platformAdminProcedure`/`protectedProcedure` zinciri BU adaptör
// metotları çalışırken `auth.kind === 'authenticated'`'ı ZATEN garanti
// etmiştir (`trpc-context.factory.ts`'in `toTrpcAuthState`'i AYNI ALS
// deposunu okur — iki okuma AYNI istek, AYNI async bağlam).

import { RequestContextUnavailableError } from '../errors/domain/request-context-unavailable.error.js'
import { getRequestContext } from '../request-context/request-context.accessors.js'

/** `ImpersonationService`'in yazma/okuma yöntemlerinin ihtiyaç duyduğu TEK aktör şekli. */
export interface PlatformActorContext {
  readonly userId: string
  readonly sessionId: string
  readonly ip: string | null
  readonly userAgent: string | null
}

/**
 * ALS'den aktör bağlamını okur. `auth.kind !== 'authenticated'` İSE
 * FIRLATIR — bu bir REGRESYON sinyalidir (`platformAdminProcedure`/
 * `protectedProcedure` zinciri bu dalı HER ZAMAN ÖNCE tüketmiş olmalıdır),
 * `trpc-context.factory.ts`'in `pending`/`failed` dalları İLE AYNI "default
 * allow yok" ilkesi.
 */
export function requirePlatformActorContext(): PlatformActorContext {
  const { auth, client } = getRequestContext()

  if (auth.kind !== 'authenticated') {
    throw new RequestContextUnavailableError({ authResolutionKind: auth.kind })
  }

  return {
    userId: auth.userId,
    sessionId: auth.sessionId,
    ip: client.ip,
    userAgent: client.userAgent,
  }
}

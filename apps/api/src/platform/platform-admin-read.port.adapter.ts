// @arkesoft/api — PlatformAdminReadPort adaptörü (ROADMAP v0.0.20, T-021/S7,
// ADR-0023 Karar 1/2)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/platform-admin-read.port.ts`),
// burada UYGULANIR. ⚠⚠ DI'DAN YALNIZCA `ImpersonationService` ALINIR —
// `PrismaService` BU DOSYADA ENJEKTE EDİLMEZ (dosya başı yorumuna bkz.,
// `impersonation.service.ts`); mekanik kapı bunu `platform-impersonation-
// write-gate.test.ts`'te zorlar.
//
// İKİ YÖNTEM, İKİ FARKLI TOTALLİK SÖZLEŞMESİ (port'un KENDİ dosya başı
// yorumu, ADR-0023 Karar 2): `requirePlatformAdmin` TOTAL'dır (kayıt yoksa
// `ImpersonationService` KENDİSİ `PlatformAdminRequiredError` fırlatır — bu
// adaptör o dalı KODLAMAZ); `readPlatformSession` ASLA FIRLAMAZ.
//
// ⚠ `requirePlatformAdmin`'in BAŞARILI dönüşü, bu session'ın
// `platformAdminProcedure` kapısından İLK kez geçtiği an olabilir — bu
// yüzden `ensureSignInRecorded`'ı (R-PO4 idempotent "giriş" kaydı) BURADA
// tetikler, `readPlatformSession`'da DEĞİL (o yöntem R-PO4 kararıyla HİÇ
// yazmaz, `platform.session`'ın poll sıklığından TAMAMEN bağımsız kalması
// için).

import { Inject, Injectable } from '@nestjs/common'
import type { PlatformAdminReadPort } from '@arkesoft/trpc/server'
import type { PlatformSession } from '@arkesoft/trpc'

import { ImpersonationService } from './impersonation.service.js'
import { requirePlatformActorContext } from './platform-request-context.js'

@Injectable()
export class PlatformAdminReadPortAdapter implements PlatformAdminReadPort {
  constructor(@Inject(ImpersonationService) private readonly impersonation: ImpersonationService) {}

  async requirePlatformAdmin(userId: string): Promise<{ readonly twoFactorEnabled: boolean }> {
    const result = await this.impersonation.requirePlatformAdmin(userId)

    const actor = requirePlatformActorContext()
    await this.impersonation.ensureSignInRecorded({
      actorUserId: actor.userId,
      sessionId: actor.sessionId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    })

    return result
  }

  readPlatformSession(userId: string): Promise<PlatformSession> {
    return this.impersonation.readPlatformSession(userId)
  }
}

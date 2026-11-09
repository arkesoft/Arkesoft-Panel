// @arkesoft/api — SessionSecurityReadPort adaptörü (ROADMAP v0.0.15, T-016
// FIX turu 2/M-4)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/session-security-read.port.ts`),
// burada UYGULANIR. `TenantReadPortAdapter`'ın AYNI deseni: ham
// `PrismaService.db` çağrısı (CLAUDE.md §3/§7 gereği gerekçe ister) —
// `app_user` KİRACIYA BAĞLI bir tablo DEĞİLDİR (`TwoFactorComplianceService.
// evaluateOwnerStatus`'un AYNI gerekçesi, `auth/two-factor-compliance.service.ts`):
// `withTenant()` bu tabloyu YAPISAL OLARAK kapsamıyor
// (`TenantTransactionClient`'ın allowlist'inde YOK), erişim yetkisi bu
// adaptörden gelmez — çağıranın KENDİ kimliği `protectedProcedure`'ün ZATEN
// doğruladığı oturumdur.
//
// ⚠ PORT TOTAL'dır ve FIRLATMAZ (port dosyasının kendi sözleşmesi,
// `session-security-read.port.ts`) — kullanıcı bulunamazsa (teorik, hard
// delete yarışı; `session.me` zaten `protectedProcedure` olduğu için bu
// yol üretimde pratik olarak İŞLEMEZ) `false` döner, `AppError` İCAT
// EDİLMEZ. `TenantReadPortAdapter`'ın "bulunamadı → AppError" deseninden
// BİLİNÇLİ SAPMA: bu alanın TEK tüketicisi `session.me`'dir ve burada
// ikinci bir anomali sınıfı yaratmak hiçbir çağıranın tüketmediği bir hata
// dalı eklemek olurdu.

import { Inject, Injectable } from '@nestjs/common'
import type { SessionSecurityReadPort } from '@arkesoft/trpc/server'

import { PrismaService } from '../../prisma/prisma.service.js'

@Injectable()
export class SessionSecurityReadPortAdapter implements SessionSecurityReadPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async isTwoFactorEnabled(userId: string): Promise<boolean> {
    const row = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    })

    return row?.twoFactorEnabled === true
  }
}

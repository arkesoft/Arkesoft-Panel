// @arkesoft/api — SessionListReadPort adaptörü (ROADMAP v0.0.15.1, T-017/S9,
// architect "TASARIM" bölümü, po ⭐ KISIT (b))
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/session-list-read.port.ts`),
// burada UYGULANIR. ⚠⚠ `SessionSecurityReadPortAdapter`'ın (T-016 FIX turu
// 2/M-4) "adaptör KENDİSİ tam veritabanı istemci yüzeyini doğrudan kullanır"
// deseni BU KAYNAK İÇİN GEÇERSİZDİR: `session` sır taşıyan modellerden
// biridir (sır taşıyan modeller sabiti, `@arkesoft/db`) ve
// `apps/api/eslint.config.mjs:61-75` o tam istemci yüzeyinin ithalini
// `src/{prisma,auth}/**` DIŞINDA yasaklar (R-1 katman 2, ADR-0008). Bu
// adaptör (`src/trpc/**`) bu yüzden veritabanı istemcisine DOKUNMAZ —
// `AuthModule`'ün dışa açtığı `SESSION_LIST_READER` token'ına
// (`auth.tokens.ts`'in `SessionListReader`'ı, YALNIZCA `listOwnSessions`'a
// daraltılmış) DELEGE EDER. `SessionsService`'in KENDİSİ (yazma metotları —
// `revokeOwnSession`/`revokeAllOwnSessions` DAHİL) bu adaptörden
// ERİŞİLEMEZ.
//
// DÖNÜŞÜM (S8a'nın devir notu, bağlayıcı):
//   - `isCurrent`/`browserFamily`/`osFamily`/`ipAddress` — `SessionsService.
//     listOwnSessions`'ın ZATEN doğru biçimde ürettiği alanlar, OLDUĞU GİBİ
//     taşınır.
//   - `updatedAt` → `lastSeenAt` (ad değişimi — `ActiveSessionWire`'ın tel
//     sözleşmesi).
//   - `createdAt`/`expiresAt`/`updatedAt` (`Date`) → ISO-8601 dize
//     (`trpc.ts`'in "transformer YOK" değişmezi, K5 kuralı 2).
//
// ⚠⚠ BOŞ DİZE SENTİNEL'İNİN `null`'A EŞLENMESİ BURADA TEKRARLANMAZ —
// `SessionsService.listOwnSessions` bu eşlemeyi ZATEN yaptı (dosya başı
// yorumu, `sessions.service.ts:22-30`). İkinci bir dönüşüm ÇİFT DÖNÜŞÜM
// olurdu; `ipAddress` bu adaptörde SADECE olduğu gibi taşınır (aşağıdaki
// `toActiveSessionWire`'da `summary.ipAddress` üzerinde HİÇBİR koşul/eşleme
// YOK — doğrudan atama).
//
// ⚠ PORT TOTAL'dır (ADR-0009 madde 3, `SessionListReadPort`'un kendi
// sözleşmesi) — "oturum yok" durumu bir hata DEĞİL, boş dizidir; bu adaptör
// hiçbir girdi için FIRLATMAZ, `SessionListReader.listOwnSessions`'ın
// döndürdüğü diziyi sıfır dallanma ile eşler.

import { Inject, Injectable } from '@nestjs/common'
import type { SessionListReadPort } from '@arkesoft/trpc/server'
import type { ActiveSessionWire } from '@arkesoft/trpc'

import type { SessionSummary } from '../../auth/sessions.service.js'
import { SESSION_LIST_READER } from '../../auth/auth.tokens.js'
import type { SessionListReader } from '../../auth/auth.tokens.js'

/** {@link SessionSummary}'yi tel sözleşmesine ({@link ActiveSessionWire}) eşler. */
function toActiveSessionWire(summary: SessionSummary): ActiveSessionWire {
  return {
    id: summary.id,
    isCurrent: summary.isCurrent,
    browserFamily: summary.browserFamily,
    osFamily: summary.osFamily,
    ipAddress: summary.ipAddress,
    lastSeenAt: summary.updatedAt.toISOString(),
    createdAt: summary.createdAt.toISOString(),
    expiresAt: summary.expiresAt.toISOString(),
  }
}

@Injectable()
export class SessionListReadPortAdapter implements SessionListReadPort {
  constructor(@Inject(SESSION_LIST_READER) private readonly sessionListReader: SessionListReader) {}

  async listOwnSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<readonly ActiveSessionWire[]> {
    const summaries = await this.sessionListReader.listOwnSessions({
      userId,
      sessionId: currentSessionId,
    })

    return summaries.map(toActiveSessionWire)
  }
}

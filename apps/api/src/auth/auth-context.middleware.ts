// @arkesoft/api — AuthContextMiddleware (ROADMAP v0.0.5, T-006/S6, architect
// "TENANT İZOLASYONU" → madde 4 HTTP eşdeğeri)
//
// ALS SÖZLEŞMESİNİN "ÇÖZEN" tarafı (AUTH tarafı) — "zorlayan" taraf
// `AuthGuard`'dır. `TenantContextMiddleware` (ST-5) İLE AYNI gerekçeyle ASLA
// FIRLATMAZ: middleware içinde fırlatılan hata global exception filter'a
// ULAŞMAZ. Bu yüzden `auth.api.getSession()`'ın fırlatabileceği HER
// beklenmedik hata burada YAKALANIR ve `{ kind: 'failed', cause }` olarak
// store'a yazılır — `AuthGuard` bunu okuyup `AuthProviderFailedError`'a
// çevirir (DÖRDÜNCÜ bir hata sınıfı İCAT EDİLMEZ — S5'in sınıfı TÜKETİLİR).
//
// SIRA (bağlayıcı, `app.module.ts`): `TenantContextMiddleware` HER ZAMAN bu
// middleware'DEN ÖNCE koşar — tenant bağlamı (üyelik kontrolü için) `AuthGuard`
// aşamasında HAZIR olmalı; bu middleware'in KENDİSİ tenant'a dokunmaz, yalnızca
// `auth` alanını YAZAR (TEK yazıcı).
//
// R-1 KATMAN 2 İSTİSNASI (ADR-0008): `auth.api.getSession()`'ın döndürdüğü
// `user` nesnesi Better Auth'un KENDİ çıktı şemasından geçtiği için
// `status`/`deletedAt` (bizim özel kolonlarımız, Better Auth'a
// `additionalFields` olarak TANITILMADI) İÇERMEZ — bu yüzden `user-eligibility`
// kontrolü AYRI bir `PrismaService.db.user.findUnique()` okuması GEREKTİRİR.
// `user` PLATFORM SEVİYESİ bir tablodur (`AUTH_SECRET_BEARING_MODELS`'TE YOK) —
// bu okuma `PrismaService.db` (daraltılmış `AppPrismaDatabase`) üzerinden
// GİDER, `AuthModule`'ün AYRI/ham istemcisi (`AUTH_PRISMA_CLIENT`) GEREKMEZ.

import { Inject, Injectable } from '@nestjs/common'
import type { NestMiddleware } from '@nestjs/common'

import { isEligibleUser } from './user-eligibility.js'
import { isAuthExemptPath } from './auth-exempt-paths.js'
import { AUTH_SESSION_READER } from './auth.tokens.js'
import type { AuthSessionReader } from './auth.tokens.js'
import { describeErrorCause } from '../errors/describe-error-cause.js'
import type { HttpRequestLike, HttpResponseLike } from '../http/http-request.types.js'
import { toWebHeaders } from '../http/to-web-headers.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { getRequestContext } from '../request-context/request-context.accessors.js'

@Injectable()
export class AuthContextMiddleware implements NestMiddleware<HttpRequestLike, HttpResponseLike> {
  constructor(
    // FIX turu 1, madde 3 (F1(b)) — DARALTILMIŞ yüzey (`getSession`
    // yalnızca), TAM `Auth` DEĞİL (bkz. `auth.tokens.ts` dosya başı yorumu).
    @Inject(AUTH_SESSION_READER) private readonly authSessionReader: AuthSessionReader,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  async use(req: HttpRequestLike, _res: HttpResponseLike, next: () => void): Promise<void> {
    // `TenantContextMiddleware` HER ZAMAN BİZDEN ÖNCE koştuğu için ALS
    // deposu burada ZATEN kurulu.
    const context = getRequestContext()

    if (isAuthExemptPath(req.url)) {
      context.auth = { kind: 'exempt' }
      next()
      return
    }

    try {
      const result = await this.authSessionReader.getSession({
        headers: toWebHeaders(req.headers),
      })

      if (result === null) {
        context.auth = { kind: 'unauthenticated' }
        next()
        return
      }

      const userRow = await this.prismaService.db.user.findUnique({
        where: { id: result.userId },
        select: { status: true, deletedAt: true },
      })

      // `userRow === null`: FK bütünlüğüne göre OLMAMASI gerekir (oturum
      // `onDelete: Cascade` ile kullanıcıya bağlı) — savunma amaçlı fail-closed,
      // "uygun değil" ile AYNI dala düşer.
      if (userRow === null || !isEligibleUser(userRow)) {
        context.auth = { kind: 'unauthenticated' }
        // K5'in ruhu: hesap durumu İSTEMCİYE sızdırılmaz (401, aynı gövde) —
        // ama bu anomali İÇERİDE (log) gözlemlenebilir kalır.
        context.logger.warn(
          { userId: result.userId },
          'geçerli oturum ama kullanıcı uygun değil (soft-delete/suspended)',
        )
        next()
        return
      }

      context.auth = {
        kind: 'authenticated',
        userId: result.userId,
        sessionId: result.sessionId,
      }
      // FIX turu 1, madde 5 (M-5/F6) — architect'in LOG DESENİ'nin bağlayıcı
      // kararı: `tenantId` child'ının AYNI deseni, `userId` İLE. `tenant-
      // context.middleware.ts:53`'ün BİREBİR karşılığı — bu satırdan SONRA
      // bu istek için üretilen HER log kaydında `userId` VARDIR (CLAUDE.md §4
      // "Her kayıtta şunlar bulunur: … userId …").
      context.logger = context.logger.child({ userId: result.userId })
    } catch (cause) {
      context.auth = { kind: 'failed', cause }
      // FIX turu 2, madde 6 (solid tur2 M-2) — ortak `describeErrorCause()`
      // (`AggregateError`-farkında) İTHAL EDİLİR; naif `cause.message` okuması
      // DB/Redis bağlantı arızalarında (happy-eyeballs `AggregateError`)
      // operatöre `errorMessage: ""` gösterirdi (ÖLÇÜLDÜ, security tur2 S-8).
      context.logger.error(
        describeErrorCause(cause),
        'kimlik doğrulama bağlamı beklenmedik şekilde başarısız oldu',
      )
    }

    next()
  }
}

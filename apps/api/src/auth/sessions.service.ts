// @arkesoft/api — SessionsService (ROADMAP v0.0.5, T-006/S6, architect "tRPC
// SÖZLEŞMESİ" → HTTP sözleşmesi bölüm B, K5/K6)
//
// K6 — ASGARİ API yeteneği: kendi oturumlarını listele, birini/tümünü
// sonlandır. Zenginleştirilmiş meta veri (cihaz/IP/son görülme) YOK (v0.0.15).
//
// AC6'nın "liste yanıtı ham token/hash TAŞIMAZ" maddesi burada AÇIK `select`
// İLE MEKANİK olarak zorlanır — Better Auth'un KENDİ `listSessions()` API'sinin
// çıktı filtrelemesine GÜVENİLMEZ (kütüphane içi davranış, sürüme bağlı
// olabilir); biz HANGİ ALANLARI okuduğumuzu KENDİMİZ kontrol ederiz.
//
// `AUTH_PRISMA_CLIENT` — R-1 katman 2'nin İKİNCİ DI token'ı (`auth.tokens.ts`
// S5'in, DEĞİŞTİRİLMEZ — bu yüzden token BURADA, bu dosyada tanımlanır;
// `auth.module.ts` onu BURADAN import eder, TEK yönlü bağımlılık). `session`
// tablosu sır taşıyan modellerden biri (`AUTH_SECRET_BEARING_MODELS`) —
// `AuthPrismaClientResource`'un (auth.module.ts, S5) KENDİ istemcisi
// PAYLAŞILIR (yeni bir ÜÇÜNCÜ DB bağlantısı AÇILMAZ); erişim bu dosyanın
// `src/auth/**` altında olması nedeniyle `eslint.config.mjs`'in R-1 katman 2
// istisnasına GİRER.
//
// SONLANDIRMA — `auth.api.revokeSession()`/`auth.api.revokeSessions()`
// ÜZERİNDEN (architect, bağlayıcı): bu uçlar `requireHeaders: true` taşır
// (Better Auth KENDİ içinde `ctx.context.session.user.id`'yi ÇAĞIRANIN
// cookie'sinden yeniden türetir) — bu yüzden ORİJİNAL istek başlıkları
// (`headers`) buraya KADAR taşınır. `token` SUNUCU TARAFINDA, sahiplik
// doğrulandıktan SONRA okunur, İSTEMCİYE ASLA verilmez.

import { Inject, Injectable } from '@nestjs/common'
import type { Auth } from 'better-auth'
import type { AuthPrismaDatabase } from '@arkesoft/db'

import type { CurrentUserIdentity } from './auth-resolution.types.js'
import { AUTH_INSTANCE } from './auth.tokens.js'
import { AuthProviderFailedError } from '../errors/domain/auth-provider-failed.error.js'
import { SessionNotFoundError } from '../errors/domain/session-not-found.error.js'
import type { HttpRequestHeaders } from '../http/http-request.types.js'
import { toWebHeaders } from '../http/to-web-headers.js'

/** `AuthPrismaClientResource`'un (auth.module.ts) paylaştığı ham istemciyi sağlayan token. */
export const AUTH_PRISMA_CLIENT = Symbol('AUTH_PRISMA_CLIENT')

/** `GET /auth/sessions` yanıtının TEK satırı — ham `token`/hash YOK. */
export type SessionSummary = {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly expiresAt: Date
  /** Bu satır, isteği yapan çerezin TAŞIDIĞI oturum mu — TÜRETİLMİŞ alan. */
  readonly isCurrent: boolean
}

const SESSION_SUMMARY_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
} as const

@Injectable()
export class SessionsService {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: Auth,
    @Inject(AUTH_PRISMA_CLIENT) private readonly authPrisma: AuthPrismaDatabase,
  ) {}

  /** Çağıranın KENDİ oturumlarını, en yeni önce, listeler. */
  async listOwnSessions(identity: CurrentUserIdentity): Promise<readonly SessionSummary[]> {
    const rows = await this.authPrisma.session.findMany({
      where: { userId: identity.userId },
      select: SESSION_SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
    })

    return rows.map((row) => ({ ...row, isCurrent: row.id === identity.sessionId }))
  }

  /**
   * Verilen `sessionId`'yi sonlandırır. Sahiplik (satırın `userId`'si
   * çağıranın `userId`'si DEĞİLSE) `SessionNotFoundError` (404) — K5: var
   * olmayan İLE başkasının oturumu AYNI cevabı döner.
   */
  async revokeOwnSession(
    identity: CurrentUserIdentity,
    sessionId: string,
    headers: HttpRequestHeaders,
  ): Promise<void> {
    const row = await this.authPrisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, token: true },
    })

    if (row?.userId !== identity.userId) {
      throw new SessionNotFoundError()
    }

    const result = await this.auth.api.revokeSession({
      body: { token: row.token },
      headers: toWebHeaders(headers),
    })

    if (!result.status) {
      throw new AuthProviderFailedError(
        new Error('revokeSession beklenmedik şekilde status:false döndü'),
      )
    }
  }

  /** Çağıranın TÜM oturumlarını sonlandırır (kendi geçerli oturumu dahil). */
  async revokeAllOwnSessions(headers: HttpRequestHeaders): Promise<void> {
    const result = await this.auth.api.revokeSessions({ headers: toWebHeaders(headers) })

    if (!result.status) {
      throw new AuthProviderFailedError(
        new Error('revokeSessions beklenmedik şekilde status:false döndü'),
      )
    }
  }
}

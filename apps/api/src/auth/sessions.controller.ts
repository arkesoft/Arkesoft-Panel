// @arkesoft/api — SessionsController (ROADMAP v0.0.5, T-006/S6, architect
// "tRPC SÖZLEŞMESİ" → HTTP sözleşmesi bölüm B, AUTH_OWN_PATHS; ROADMAP
// v0.0.15.1, T-017/S8a, ADR-0019 §Karar 4/5 — step-up gövdesi)
//
// `password` İKİ gövdede de `z.string().optional()` — ZORUNLU YAPILMAZ
// (ADR-0019 §Karar 4/5, bağlayıcı): zorunlu olsaydı eksik parola
// `ValidatedBody` aşamasında `VALIDATION_ERROR` (400) verirdi — "eksik" ile
// "yanlış" İKİ AYRI kod dönerdi ve tek-biçimlilik (`INVALID_PASSWORD`)
// kırılırdı. Karar BİLEREK transport şemasında DEĞİL, `StepUpService.
// assertVerified()` İÇİNDE (`password === undefined` → AYNI `InvalidPasswordError`).
//
// Üç SABİT yol, `AUTH_OWN_PATHS`'teki (`auth-own-paths.ts`) literallerle
// BİREBİR: `GET /auth/sessions` · `POST /auth/sessions/revoke` · `POST
// /auth/sessions/revoke-all` — üçü de global `AuthGuard`/`TenantGuard`
// zincirinden GEÇER (oturum ZORUNLU, kiracı MUAF — `TENANT_EXEMPT_PATHS`'te
// bu üç yol VAR).
//
// ⚠ KAYIT SIRASI BAĞLAYICI (`auth.module.ts`'in `controllers` dizisi):
// `SessionsController` `AuthController`'DAN ÖNCE listelenmek ZORUNDADIR.
// `AuthController`'ın `@All('auth/*path')` joker rotası KAYIT SIRASINA göre
// eşleşir (Express, aynı/örtüşen yol için İLK KAYDEDİLEN handler'ı çalıştırır,
// özgüllüğe göre ÖNCELİKLENDİRMEZ) — `AuthController` ÖNCE gelseydi
// `/auth/sessions*` istekleri HİÇBİR ZAMAN bu controller'a ULAŞMAZ, hepsi
// `isAuthDelegatedPath()`'in `false` dönüşüyle 404'e düşerdi (bu üç yol
// `AUTH_DELEGATED_PATHS`'te YOK). Bu dosyanın KENDİSİ sırayı ZORLAYAMAZ —
// kanıt `auth.module.ts`'in `controllers` dizisinde VE
// `auth-sessions.test.ts`'in gerçek HTTP testlerinde.
//
// `@Req()` — `Body`/`Query`/`Param` YASAĞI (K-A6) `Req`'i KAPSAMAZ;
// `AuthController` (S5) de AYNI deseni kullanır. Yalnızca ORİJİNAL istek
// başlıklarını (`headers`) `SessionsService`'e taşımak İÇİN okunur — gövdeye
// HİÇBİR ZAMAN doğrudan erişilmez (`revoke`'un gövdesi `ValidatedBody` ile
// Zod'dan geçer).

import { Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'

import type { CurrentUserIdentity } from './auth-resolution.types.js'
import { CurrentUser } from './current-user.decorator.js'
import { SameOriginGuard } from './same-origin.guard.js'
import type { SessionSummary } from './sessions.service.js'
import { SessionsService } from './sessions.service.js'
import type { HttpRequestLike } from '../http/http-request.types.js'
import { ValidatedBody } from '../validation/validated-params.decorators.js'

/**
 * `POST /auth/sessions/revoke` gövdesi — `sessionId` (path parametresi
 * DEĞİL, AC9) + `password` (step-up, dosya başı yorumu — opsiyonel).
 */
const revokeSessionBodySchema = z.object({
  sessionId: z.string().min(1, 'boş olamaz'),
  password: z.string().optional(),
})

type RevokeSessionBody = z.infer<typeof revokeSessionBodySchema>

/** `POST /auth/sessions/revoke-all` gövdesi — `password` (step-up, dosya başı yorumu — opsiyonel). */
const revokeAllSessionsBodySchema = z.object({
  password: z.string().optional(),
})

type RevokeAllSessionsBody = z.infer<typeof revokeAllSessionsBodySchema>

// FIX turu 1, madde 6 (F5) — `SameOriginGuard` ÜÇÜNÜ de kapsar (controller
// seviyesinde `@UseGuards`, `@Get`/`@Post` METOT dekoratörlerinden ÖNCE
// çalışır). `AuthGuard`/`TenantGuard` (global `APP_GUARD`) HER ZAMAN
// ÖNCE koşar (Nest'in çalışma sırası: global guard → controller guard) —
// bu yüzden kimliksiz/yetkisiz istek ZATEN 401/403 ile biter; bu guard
// kimliği doğrulanmış AMA GÜVENİLMEYEN KAYNAKTAN gelen isteği YAKALAR.
@UseGuards(SameOriginGuard)
@Controller()
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly sessionsService: SessionsService) {}

  @Get('auth/sessions')
  listSessions(@CurrentUser() identity: CurrentUserIdentity): Promise<readonly SessionSummary[]> {
    return this.sessionsService.listOwnSessions(identity)
  }

  // `@HttpCode(200)` — Nest'in POST varsayılanı 201 (Created) YANLIŞTIR; bu
  // uç bir KAYNAK OLUŞTURMAZ, mevcut bir oturumu SONLANDIRIR (K6).
  @Post('auth/sessions/revoke')
  @HttpCode(200)
  async revokeSession(
    @CurrentUser() identity: CurrentUserIdentity,
    @ValidatedBody(revokeSessionBodySchema) body: RevokeSessionBody,
    @Req() req: HttpRequestLike,
  ): Promise<{ readonly status: true }> {
    await this.sessionsService.revokeOwnSession(
      identity,
      body.sessionId,
      body.password,
      req.headers,
    )
    return { status: true }
  }

  // `@CurrentUser()` BİLEREK YOK — kimlik `AuthGuard` tarafından ZATEN
  // zorlandı (401'siz buraya ulaşılamaz), bu handler kimliğin KENDİSİNİ
  // kullanmaz, yalnızca `password`/başlıkları `SessionsService`'e taşır.
  @Post('auth/sessions/revoke-all')
  @HttpCode(200)
  async revokeAllSessions(
    @ValidatedBody(revokeAllSessionsBodySchema) body: RevokeAllSessionsBody,
    @Req() req: HttpRequestLike,
  ): Promise<{ readonly status: true }> {
    await this.sessionsService.revokeAllOwnSessions(body.password, req.headers)
    return { status: true }
  }
}

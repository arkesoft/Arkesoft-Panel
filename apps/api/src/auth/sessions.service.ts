// @arkesoft/api — SessionsService (ROADMAP v0.0.5, T-006/S6, architect "tRPC
// SÖZLEŞMESİ" → HTTP sözleşmesi bölüm B, K5/K6; ROADMAP v0.0.15.1, T-017/S8a,
// ADR-0019 §Karar 1/4/8/9 — zengin `select` + step-up kapısı)
//
// K6 — ASGARİ API yeteneği: kendi oturumlarını listele, birini/tümünü
// sonlandır. v0.0.15.1'den İTİBAREN liste zenginleştirilmiş meta veri
// (cihaz ailesi × IP × son görülme) TAŞIR.
//
// AC6'nın "liste yanıtı ham token/hash TAŞIMAZ" maddesi burada AÇIK `select`
// İLE MEKANİK olarak zorlanır — Better Auth'un KENDİ `listSessions()` API'sinin
// çıktı filtrelemesine GÜVENİLMEZ (kütüphane içi davranış, sürüme bağlı
// olabilir); biz HANGİ ALANLARI okuduğumuzu KENDİMİZ kontrol ederiz.
//
// ⚠⚠ HAM `userAgent` BU DOSYADAN DIŞARI SIZMAZ (S7'nin `device-label.ts`
// güvencesi, ADR-0019 §Karar 8 — bağlayıcı): `row.userAgent` TEK kullanım
// yeri `resolveDeviceFamilies(...)`'e GİRDİ olmaktır; dönen `SessionSummary`
// nesnesi ham dizeyi ALAN OLARAK TAŞIMAZ — yalnızca iki kapalı-dünya
// tanımlayıcı (`browserFamily`/`osFamily`). `rows.map` BİLEREK `{...row, …}`
// YAYMASI KULLANMAZ (önceki sürümün yaptığı gibi) — yayma `userAgent`'ı
// SESSİZCE taşırdı; bunun yerine HER alan TEK TEK adıyla seçilir.
//
// ⚠⚠ `''` → `null` SENTİNEL EŞLEMESİ `toSessionSummary()`'DE YAPILIR
// (`session-summary.mapper.ts`), ADAPTÖRDE DEĞİL (architect'in "sentinel
// eşlemesi" adlandırması, S3/S6'nın ölçtüğü `ipAddress` davranışı; solid
// gate'in M-2 bulgusu — FIX turu 1'de `rows.map` gövdesinden SAF bir
// fonksiyona TAŞINDI): ESKİ satırlar (S6 öncesi) `ipAddress = ''` taşır,
// YENİ satırlar `resolveSessionIpAddressForCreateHook` (auth-instance.ts)
// sayesinde GERÇEK IP veya `null` taşır — İKİ farklı "yok" temsili (`''` VE
// `null`) OKUMA tarafında TEK bir temsile (`null`) indirilir. Bu eşleme
// YALNIZCA `toSessionSummary()`'de yapılır; `packages/trpc` port adaptörü
// (S9) bu alanı OLDUĞU GİBİ taşır — İKİNCİ bir `'' → null` dönüşümü YAPMAZ
// (çift dönüşüm olurdu, S9'un brief'ine bağlayıcı not olarak geçer).
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
//
// ⚠⚠ STEP-UP SIRASI BAĞLAYICI (ADR-0019 §Karar 4, S5'in devrettiği kritik
// not: "bu sıra BENİM kodumda ZORLANMIYOR — ÇAĞIRANIN sorumluluğu"):
// `revokeOwnSession`/`revokeAllOwnSessions` `StepUpService.assertVerified()`'i
// SAHİPLİK doğrulamasından VE herhangi bir DB okumasından ÖNCE çağırır.
// Tersi olsaydı parolasız çağıran, verilen `sessionId`'nin VAR OLUP
// OLMADIĞINI öğrenen bir VARLIK ORACLE'I kazanırdı (404 — var/yetkisiz AYNI
// cevap — vs 400 — parola eksik/yanlış AYNI cevap — ayrımı SIZDIRIRDI).
// Kanıt: `auth-sessions.test.ts`'in sıra testi (AC5 + "sıra kanıtı").

import { Inject, Injectable } from '@nestjs/common'
import type { DeviceBrowserWire, DeviceOsWire } from '@arkesoft/trpc'
import type { Auth } from 'better-auth'
import type { AuthPrismaDatabase } from '@arkesoft/db'

import type { CurrentUserIdentity } from './auth-resolution.types.js'
import { AUTH_INSTANCE } from './auth.tokens.js'
import { toSessionSummary } from './session-summary.mapper.js'
import { StepUpService } from './step-up/step-up.service.js'
import { AuthProviderFailedError } from '../errors/domain/auth-provider-failed.error.js'
import { SessionNotFoundError } from '../errors/domain/session-not-found.error.js'
import type { HttpRequestHeaders } from '../http/http-request.types.js'
import { toWebHeaders } from '../http/to-web-headers.js'

/** `AuthPrismaClientResource`'un (auth.module.ts) paylaştığı ham istemciyi sağlayan token. */
export const AUTH_PRISMA_CLIENT = Symbol('AUTH_PRISMA_CLIENT')

/**
 * `GET /auth/sessions` yanıtının TEK satırı — ham `token`/hash/`userAgent`
 * YOK. `ipAddress` ZATEN `null`'a eşlenmiş sentinel'dir (dosya başı yorumu);
 * `lastSeenAt` AYRI bir alan DEĞİL — `updatedAt`'in KENDİSİ "son görülme"
 * anlamına gelir (ADR-0019 §Karar 3, `Session.updatedAt` zaten budur).
 */
export type SessionSummary = {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly expiresAt: Date
  readonly ipAddress: string | null
  readonly browserFamily: DeviceBrowserWire
  readonly osFamily: DeviceOsWire
  /** Bu satır, isteği yapan çerezin TAŞIDIĞI oturum mu — TÜRETİLMİŞ alan. */
  readonly isCurrent: boolean
}

const SESSION_SUMMARY_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  ipAddress: true,
  userAgent: true,
} as const

@Injectable()
export class SessionsService {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: Auth,
    @Inject(AUTH_PRISMA_CLIENT) private readonly authPrisma: AuthPrismaDatabase,
    @Inject(StepUpService) private readonly stepUpService: StepUpService,
  ) {}

  /** Çağıranın KENDİ oturumlarını, en yeni önce, listeler. */
  async listOwnSessions(identity: CurrentUserIdentity): Promise<readonly SessionSummary[]> {
    const rows = await this.authPrisma.session.findMany({
      where: { userId: identity.userId },
      select: SESSION_SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
    })

    // Satır→DTO eşlemesi `toSessionSummary()`'ye (saf fonksiyon,
    // `session-summary.mapper.ts`) DEVREDİLİR — solid gate'in M-2 bulgusu,
    // FIX turu 1. Eşleme disiplini (`{...row}` yaymasının BİLEREK
    // KULLANILMAMASI, `'' → null` sentinel'i) o dosyanın başlık yorumunda.
    return rows.map((row) => toSessionSummary(row, identity.sessionId))
  }

  /**
   * Verilen `sessionId`'yi sonlandırır. Sahiplik (satırın `userId`'si
   * çağıranın `userId`'si DEĞİLSE) `SessionNotFoundError` (404) — K5: var
   * olmayan İLE başkasının oturumu AYNI cevabı döner.
   *
   * ⚠⚠ SIRA BAĞLAYICI: step-up (①) SAHİPLİK doğrulamasından (②) ÖNCE —
   * dosya başı yorumu.
   */
  async revokeOwnSession(
    identity: CurrentUserIdentity,
    sessionId: string,
    password: string | undefined,
    headers: HttpRequestHeaders,
  ): Promise<void> {
    // ① — step-up, SAHİPLİKTEN ÖNCE (ADR-0019 §Karar 4, bağlayıcı sıra).
    await this.stepUpService.assertVerified('session.revoke', password, headers)

    // ② — sahiplik: var olmayan İLE başkasının oturumu AYNI cevabı döner.
    const row = await this.authPrisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, token: true },
    })

    if (row?.userId !== identity.userId) {
      throw new SessionNotFoundError()
    }

    // ③ — sonlandırma.
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

  /**
   * Çağıranın TÜM oturumlarını sonlandırır (kendi geçerli oturumu dahil).
   * Step-up (ADR-0019 §Karar 4) bu uçta da ZORUNLU — `SENSITIVE_OPERATIONS`'ın
   * `'session.revokeAll'` girdisi (sahiplik kavramı burada YOK, tüm satırlar
   * ZATEN çağıranın kendi oturumları).
   */
  async revokeAllOwnSessions(
    password: string | undefined,
    headers: HttpRequestHeaders,
  ): Promise<void> {
    await this.stepUpService.assertVerified('session.revokeAll', password, headers)

    const result = await this.auth.api.revokeSessions({ headers: toWebHeaders(headers) })

    if (!result.status) {
      throw new AuthProviderFailedError(
        new Error('revokeSessions beklenmedik şekilde status:false döndü'),
      )
    }
  }
}

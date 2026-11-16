// @arkesoft/api — PlatformAdminIpGuard (ROADMAP v0.0.20, T-021/S7, ADR-0023
// §5)
//
// `SUPERADMIN_IP_ALLOWLIST` ham dizesini AYRIŞTIRAN ve ZORLAYAN Nest guard'ı
// — S6 yalnızca env TANIMINI taşıdı (`config/api-env.ts`'in dosya başı
// yorumu: "ayrıştırma ve zorlama S7'nin platform/ modülündedir"); bu dosya
// o işi yapar.
//
// ⚠⚠ KAPSAM: YALNIZCA `platform.*` tRPC yolları (Orkestratör kararı,
// 2026-11-15) — `/auth/*` uçları `apps/admin` İLE PAYLAŞILIYOR, IP ile
// kısıtlamak kiracı yöneticilerinin panelini KIRARDI. `TrpcController.
// handle()` TEK rota olduğu için (`@All('trpc/*path')`) bu guard HER tRPC
// isteğinde ÇALIŞIR ama yol `platform.*` DEĞİLSE ANINDA `true` döner
// (`RateLimitGuard`'ın "politika yoksa anında true" deseniyle AYNI).
//
// ⚠⚠ ÜÇ FAIL-CLOSED DAL (ADR-0023 §5, birebir):
//   1. Allowlist BOŞ → 403 (`'yapılandırılmamış = kapalı'`).
//   2. Çözülen istemci IP'si listede YOK → 403.
//   3. Çözülen IP `UNKNOWN_IP` sentinel'i İSE → 403 ("bir değer gibi görünen
//      yokluk yetkilendirmeye girdi olamaz").
//
// ⚠⚠ BU KAPI BİRİNCİL YETKİLENDİRME DEĞİLDİR (ADR-0023 §5'in bağlayıcı
// sınırı): birincil yetkilendirme oturum + `platform_admin` kaydı + 2FA'dır
// (`platformAdminProcedure`); bu guard ÜÇÜNCÜ bir katmandır. Kendi `AppError`
// sınıfını taşır (`PlatformNetworkNotAllowedError`, A-PO21-2 — `SameOriginGuard`
// ↔ `CrossSiteRequestRejectedError` emsali); allowlist'in İÇERİĞİ hata
// gövdesine/loga SIZMAZ (üç kapalı sebepten biri taşınır, IP/liste DEĞİL).

import { Inject, Injectable } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'

import { resolveClientIp, UNKNOWN_IP } from '../auth/rate-limit/client-ip.js'
import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import { PlatformNetworkNotAllowedError } from '../errors/domain/platform-network-not-allowed.error.js'
import { matchesPrefixOrUnparsablePercentEncoding } from '../http/normalize-request-path.js'

/** `RateLimitGuard`'ın `RateLimitedRequest`'iyle AYNI yerel genişletme — `HttpRequestLike`'a EKLENMEZ. */
type PlatformAdminIpGuardedRequest = {
  readonly headers: Record<string, string | string[] | undefined>
  readonly method: string
  readonly url: string
  readonly socket?: { readonly remoteAddress?: string }
}

/** Guard'ın kapsadığı namespace öneki — `/trpc/platform.*`'in TÜM uçları (bugün üç: `session`/`tenantList`/`auditLog`). */
const PLATFORM_NAMESPACE_PREFIX = '/trpc/platform.'

/**
 * `/trpc/platform.*` yolu mu — tam öneki (`startsWith`) kullanılır çünkü
 * `platform` NAMESPACE'İNİN TÜM uçları bu kapsamdadır; `TENANT_EXEMPT_PATHS`'in
 * TAM EŞLEŞME disiplini BURADA GEÇERLİ DEĞİL (o küme TEK uçları muaf tutar,
 * bu guard BİR NAMESPACE'İ kapsar — ikisi farklı birer karar).
 *
 * GÜNCELLEME (T-021 FIX turu 1, madde F1, security tur1 `high`) — ÖNCEDEN
 * `normalizeRequestPath(rawUrl).startsWith(...)` kullanıyordu; o fonksiyon
 * yüzde-kodlamayı ÇÖZMEDİĞİ için `/trpc/platform%2EtenantList` bu testi
 * GEÇEMİYORDU (guard anında `true` dönüyordu, üç fail-closed dalın HİÇBİRİ
 * ÇALIŞMIYORDU) ama tRPC AYNI isteği `decodeURIComponent` ile çözüp
 * `platform.tenantList` olarak ÇALIŞTIRIYORDU (`http/normalize-request-
 * path.ts`'in dosya başı GÜNCELLEME yorumu). Artık `matchesPrefixOrUnparsable
 * PercentEncoding` tüketilir: (a) GEÇERLİ yüzde-kodlamayı tRPC ile BİREBİR
 * aynı şekilde ÇÖZER (`%2E`/`%2e` artık TANINIR), (b) BOZUK bir kodlama
 * (`%ZZ`) decode'u FIRLATIRSA GÜVENLİ VARSAYILAN olarak `true` (kapsamda
 * SAY) döner — security tur1'in AÇIK şartı.
 */
export function isPlatformAdminGuardedPath(rawUrl: string): boolean {
  return matchesPrefixOrUnparsablePercentEncoding(rawUrl, PLATFORM_NAMESPACE_PREFIX)
}

/**
 * `SUPERADMIN_IP_ALLOWLIST`'in ham dizesini ayrıştırır: virgülle ayır, her
 * parçayı TRIM et, BOŞ parçaları DÜŞÜR. Girdi boşsa (varsayılan `''`) boş
 * dizi döner — guard bunu "yapılandırılmamış = kapalı" olarak OKUR.
 */
export function parseSuperadminIpAllowlist(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

@Injectable()
export class PlatformAdminIpGuard implements CanActivate {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<PlatformAdminIpGuardedRequest>()

    if (!isPlatformAdminGuardedPath(req.url)) {
      return true
    }

    const allowlist = parseSuperadminIpAllowlist(this.env.SUPERADMIN_IP_ALLOWLIST)

    if (allowlist.length === 0) {
      throw new PlatformNetworkNotAllowedError('empty_allowlist')
    }

    const clientIp = resolveClientIp(req, this.env.AUTH_TRUSTED_PROXY_COUNT)

    if (clientIp === UNKNOWN_IP) {
      throw new PlatformNetworkNotAllowedError('unknown_ip')
    }

    if (!allowlist.includes(clientIp)) {
      throw new PlatformNetworkNotAllowedError('ip_not_allowed')
    }

    return true
  }
}

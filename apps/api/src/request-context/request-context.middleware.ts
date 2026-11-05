// @arkesoft/api — RequestContextMiddleware (ROADMAP v0.0.4, T-002/ST-4, architect K-A5)
//
// ALS SÖZLEŞMESİNİN "ÇÖZEN" tarafı — zorlayan taraf `TenantGuard`'dır (ST-5,
// `APP_GUARD`). Bu middleware **ASLA FIRLATMAZ**: NestJS'te middleware içinde
// fırlatılan hata global exception filter'a ULAŞMAZ (platformun kendi hata
// yoluna düşer, AC4'ün istediği birebir JSON yerine 500 HTML üretir) — bu
// yüzden burada atılabilecek TEK adım (`als.run`) hiçbir zaman reddetmeyen bir
// akıştır; tenant çözümü (`unresolved`/`failed` olabilir) ayrı bir middleware'in
// (ST-5 `TenantContextMiddleware`) işi, burada yalnızca `pending` ile başlatılır.
//
// SIRA (K-A5, bağlayıcı): `app.module.ts`'te `RequestContextMiddleware` HER
// ZAMAN `TenantContextMiddleware`'DEN ÖNCE koşar — ALS depo nesnesi burada
// kurulur, sonraki middleware onu MUTE EDER (yalnızca `tenant` ve `logger`
// alanlarını).
//
// GÜNCELLEME (ROADMAP v0.0.14, T-014/S4, architect K-A2 · po R-PO2): bu ara
// yazılım artık `RequestContext.client`'ı da yazar ve o alanın TEK YAZICISIDIR.
// ⚠ ÜYELİK/KİMLİK MUHAFIZI YAZICIYA DÖNÜŞTÜRÜLMEDİ (architect K-A5 madde 2,
// bağlayıcı): istemci kimliklerini oradan taşımak ALS'ye DÖRDÜNCÜ bir yazıcı
// ve ilk kez bir MUHAFIZ yazıcısı eklemek olurdu; o dosya platformun en çok
// denetlenmiş güvenlik dosyasıdır ve bu sürümde DOKUNULMUYOR.
// ⚠ Bu ara yazılım `ip`/`userAgent`'ı HİÇBİR log çağrısına geçirmez
// (CLAUDE.md §4) — yalnızca ALS deposuna yazar; tek tüketici denetim kaydı
// yazma kapısıdır.

import { Inject, Injectable } from '@nestjs/common'
import type { NestMiddleware } from '@nestjs/common'
import type { Logger } from 'pino'

import { resolveClientIp, UNKNOWN_IP } from '../auth/rate-limit/client-ip.js'
import type { ClientIpSourceRequest } from '../auth/rate-limit/client-ip.js'
import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import type { HttpRequestLike, HttpResponseLike } from '../http/http-request.types.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { requestContextStorage } from './request-context.storage.js'
import type { RequestClientContext, RequestContext } from './request-context.types.js'
import { resolveIncomingRequestId } from './request-id.js'

/**
 * `HttpRequestLike` soket adresini TAŞIMAZ (paylaşılan tip, DEĞİŞTİRİLMEZ) —
 * `client-ip.ts`'in `ClientIpSourceRequest` deseniyle AYNI yerel genişletme
 * (`auth.controller.ts`/`trpc.controller.ts`'in aynı idiomu).
 */
type ClientAwareRequest = HttpRequestLike & Pick<ClientIpSourceRequest, 'socket'>

/** Tek değerli başlık okuması — `X-Forwarded-For` dışındaki başlıklar dizi olarak da gelebilir. */
function readSingleHeader(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value
  return single === undefined || single.length === 0 ? null : single
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware<HttpRequestLike, HttpResponseLike> {
  constructor(
    @Inject(ROOT_LOGGER) private readonly rootLogger: Logger,
    // ROADMAP v0.0.14, T-014/S4 EKLEMESİ (po R-PO2): `AUTH_TRUSTED_PROXY_COUNT`
    // için. ⚠ `resolveClientIp` BİLEREK `process.env`/`ApiEnv` okumayan SAF bir
    // fonksiyondur (dosya başı yorumu) — güvenilir vekil sayısını ÇAĞIRAN
    // geçirir, yani bu ara yazılım onu DI üzerinden almak ZORUNDADIR.
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  use(req: ClientAwareRequest, res: HttpResponseLike, next: () => void): void {
    const requestId = resolveIncomingRequestId(req.headers['x-request-id'])
    const client: RequestClientContext = this.resolveClientContext(req)

    const store: RequestContext = {
      requestId,
      receivedAt: Date.now(),
      // İLK değer: yalnızca `requestId` bağlamalı child logger. Tenant
      // çözülünce `TenantContextMiddleware` (ST-5) bu alanı `tenantId`
      // bağlamalı bir child ile DEĞİŞTİRİR (tek yazıcı, K-A7).
      logger: this.rootLogger.child({ requestId }),
      tenant: { kind: 'pending' },
      // ROADMAP v0.0.5, T-006/S6 EKLEMESİ (additive): `tenant` İLE AYNI
      // desen — `AuthContextMiddleware` (`TenantContextMiddleware`'den
      // SONRA) bu alanı DEĞİŞTİRİR, TEK yazıcı.
      auth: { kind: 'pending' },
      // ROADMAP v0.0.14, T-014/S4 EKLEMESİ (additive): `tenant`/`auth`'un
      // AKSİNE `readonly` — TEK yazıcı BURASI ve yazma İSTEĞİN BAŞINDA,
      // bir kez. Sonradan güncellenecek bir "pending" hâli YOK (bkz. tip
      // dosyasının gerekçesi).
      client,
    }

    // AC9: yanıt başlığı handler'dan ÖNCE yazılır — hata yanıtları dahil HER
    // yanıt bu başlığı taşır (`AppExceptionFilter` ikinci savunma olarak
    // yeniden yazsa da aynı değeri yazdığı için zararsızdır).
    res.setHeader('x-request-id', requestId)

    requestContextStorage.run(store, next)
  }

  /**
   * İstemci kimliklerini HAM istekten okur. ⚠ Bu metot hiçbir şey LOGLAMAZ
   * ve döndürdüğü değer bu dosyada bir log çağrısına GEÇMEZ — tek tüketici
   * denetim kaydı yazma kapısıdır (CLAUDE.md §4).
   */
  private resolveClientContext(req: ClientAwareRequest): RequestClientContext {
    const resolvedIp = resolveClientIp(req, this.env.AUTH_TRUSTED_PROXY_COUNT)

    return {
      // Sentinel bir DEĞER değildir, "tespit edilemedi"nin kodudur — denetim
      // kaydına bir IP gibi yazılmaması için burada `null`'a eşlenir.
      ip: resolvedIp === UNKNOWN_IP ? null : resolvedIp,
      userAgent: readSingleHeader(req.headers['user-agent']),
    }
  }
}

// @arkesoft/api — ALS sözleşmesi: fail-closed okuma yüzeyi (ROADMAP v0.0.4,
// T-002/ST-4, architect K-A5)
//
// Bu dosya DI'SIZ saf fonksiyonlardan oluşur — `requestContextStorage`'ın
// modül seviyesi tek örnek olmasının SEBEBİ bu: `resolve-host.ts` gibi saf
// fonksiyonlar (ST-5) veya DI dışında kurulan `ZodValidationPipe` (ST-4)
// Nest konteynerine ihtiyaç duymadan okuyabilir.
//
// `TenantContext` DEĞERİNİ üretecek fabrika BURADA YOK — `TenantResolverService`
// (ST-5, modül içi) üretir; bu dosya yalnızca OKUR, hiçbir okuyucu kendi
// `TenantContext`'ini uyduramaz.

import type { Logger } from 'pino'

import { RequestContextUnavailableError } from '../errors/domain/request-context-unavailable.error.js'
import { requestContextStorage } from './request-context.storage.js'
import type { RequestContext, TenantContext } from './request-context.types.js'

/**
 * ALS deposunu okur; yoksa **FIRLATIR** (`undefined` dönmez). Middleware
 * zincirinin dışında (ör. süreç açılışı, bir zamanlayıcı geri çağırması)
 * çağrılırsa bu bir PROGRAMLAMA hatasıdır — sessizce `undefined` ile devam
 * etmek yerine hemen görünür olur.
 */
export function getRequestContext(): RequestContext {
  const store = requestContextStorage.getStore()

  if (store === undefined) {
    throw new RequestContextUnavailableError()
  }

  return store
}

/**
 * ALS deposunu okur; yoksa `undefined` döner. **YALNIZCA** `AppExceptionFilter`
 * ve logger erişimi gibi, context'in gerçekten var OLMAYABİLECEĞİ savunma
 * amaçlı yerlerde kullanılır (ör. middleware zincirinin kendisi çökerse bile
 * filter hâlâ anlamlı bir yanıt üretebilmeli). Diğer HER yerde {@link getRequestContext}
 * kullanılır.
 */
export function tryGetRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore()
}

/**
 * Çözülmüş tenant'ı döner; `tenant.kind !== 'resolved'` ise **FIRLATIR**.
 *
 * Bu, R4 telafisinin (RLS yokluğunda yedi mekanizmadan biri) kalbidir:
 * v0.0.13'e kadar RLS yok, yani veritabanı seviyesinde "bu sorgu yanlış
 * tenant'ın verisini döndürebilir" durumuna karşı HİÇBİR arkalık yok. Eğer bu
 * fonksiyon `tenant` çözülmemişken sessizce `undefined` ya da uydurma bir
 * değer dönseydi, bir geliştiricinin `TenantGuard`'ı atlayıp (veya guard'ın
 * henüz koşmadığı bir kod yolunda) doğrudan tenant verisi sorgulaması
 * MÜMKÜN olurdu — çapraz tenant veri sızıntısı sessizce üretilirdi. Fırlatarak
 * bu sınıf hata derleme zamanında değil ama ÇALIŞMA ZAMANINDA DA imkansız
 * kılınır: ya doğru tenant'la ilerlenir ya hiç ilerlenmez.
 */
export function getTenantContext(): TenantContext {
  const context = getRequestContext()

  if (context.tenant.kind !== 'resolved') {
    throw new RequestContextUnavailableError({ tenantResolutionKind: context.tenant.kind })
  }

  return context.tenant.tenant
}

/** {@link getTenantContext}'in `id` alanına kısayol. */
export function getTenantId(): string {
  return getTenantContext().id
}

/** İsteğe özel (tenant çözülmüşse `tenantId` bağlamalı) pino logger'ı döner. */
export function getLogger(): Logger {
  return getRequestContext().logger
}

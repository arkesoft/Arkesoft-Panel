// @arkesoft/api — TENANT_CONTEXT_REQUIRED (ROADMAP v0.0.6, T-007/S5, architect
// "Modül yerleşimi" bölümü, ADR-0010)
//
// `TrpcErrorFactoryPort.tenantContextRequired()`'ın (packages/trpc, K1)
// fırlattığı sınıf — `requireTenant` middleware'i (`packages/trpc/src/trpc.ts`)
// `ctx.tenant.kind !== 'resolved'` olduğunda çağırır. Hata SINIFININ KENDİSİ
// `apps/api`'de kalır (AC9(a) — `packages/trpc`'de hiçbir hata kodu LİTERALİ
// yok); port yalnızca BU sınıfın bir örneğini fırlatır.
//
// **Yalnızca HTTP-DIŞI çağıranlara GÖRÜNÜR.** HTTP yolunda `TenantGuard`
// kiracısız isteği `/trpc`'ye hiç BIRAKMADAN ÖNCE 404 `TENANT_NOT_FOUND`
// döner (K2 ile ÇELİŞMEZ — bu sınıf HTTP yanıtı olarak asla üretilmez,
// yalnızca ileride bir worker gibi HTTP-dışı bir çağıranın tRPC context'i
// eksik kiracıyla kurması durumunda anlamlıdır).
//
// `publicDetails` BİLİNÇLİ OLARAK override EDİLMEZ — taban sınıfın
// varsayılanı (`{}`) kalır (ADR-0010 fail-closed): bu hatanın tele
// taşıyacağı hiçbir ek bilgi yok, override etmemek yanlışlıkla PII/sır
// sızdırma riskini de yapısal olarak ortadan kaldırır.

import { AppError } from '@arkesoft/errors'

export class TenantContextRequiredError extends AppError {
  constructor() {
    super({
      code: 'TENANT_CONTEXT_REQUIRED',
      httpStatus: 401,
      userMessageKey: 'errors.tenant.contextRequired',
      context: {},
      isRetryable: false,
    })
  }
}

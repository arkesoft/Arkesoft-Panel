// @arkesoft/api — teste özel "duman" probe controller'ı (ROADMAP v0.0.4,
// T-002/ST-7, architect K-A5/K-A6, AC5/AC7/AC14)
//
// ÜRETİM KODUNA UÇ EKLENMEZ: bu dosya `src/__tests__/helpers/**` altında
// yaşar ve `AppModule`'ün `controllers`'ına HİÇBİR ZAMAN eklenmez. ST-5'in
// kendi duman testinde DOĞRULADIĞI desen tekrarlanıyor — `createTestApp`
// (`helpers/create-test-app.ts`, additive `smokeControllers` seçeneği)
// `AppModule`'ü İTHAL EDEN geçici bir test modülüne bu controller'ı ekler;
// `AppModule`'ün satırları hiç değişmez.
//
// Üç uç:
//   - `GET /__smoke`              → AC5: `getTenantContext()`'i (ALS'den)
//     döner. Tenant çözülmemişse `TenantGuard` handler'a hiç ULAŞMADAN 404
//     fırlatır — bu handler'ın GÖVDESİ yalnızca tenant ÇÖZÜLDÜĞÜNDE çalışır.
//   - `GET /__smoke/unconfigured`  → AC7: SIFIR yapılandırma (allowlist'e
//     eklenmemiş, hiçbir özel dekoratör almamış) bir uç — fail-closed
//     varsayılanın (K5) kanıtı. Handler'ın KENDİSİ hiçbir tenant erişimi
//     YAPMAZ; 404'ü üreten `TenantGuard`'dır, handler'a hiç girilmez.
//   - `POST /__smoke/validate`    → AC14: `ValidatedBody` + Zod şemasıyla
//     gövde doğrulaması. Geçerli gövdeyi OLDUĞU GİBİ yansıtır.

import { Controller, Get, Post } from '@nestjs/common'
import { z } from 'zod'

import { getTenantContext } from '../../request-context/request-context.accessors.js'
import type { TenantContext } from '../../request-context/request-context.types.js'
import { ValidatedBody } from '../../validation/validated-params.decorators.js'

/** AC14'ün doğrulama testinin (`validation.test.ts`) kullandığı asgari şema. */
export const smokeValidationSchema = z.object({
  name: z.string().min(1),
})

export type SmokeValidationInput = z.infer<typeof smokeValidationSchema>

@Controller('__smoke')
export class ProbeController {
  /** AC5/AC7/AC8 — ALS'deki çözülmüş tenant'ı (varsa) döner. */
  @Get()
  getTenant(): TenantContext {
    return getTenantContext()
  }

  /**
   * AC7 — hiçbir allowlist/dekoratör almadan eklenen bir uç. Handler'ın
   * KENDİSİ tenant'a dokunmaz; fail-closed varsayılanın kanıtı `TenantGuard`'ın
   * bu handler'a hiç ULAŞMAMASIDIR (tenant çözülemeyen istekte 404 guard
   * katmanında üretilir).
   */
  @Get('unconfigured')
  getUnconfigured(): { readonly ok: true } {
    return { ok: true }
  }

  /** AC14 — Zod tabanlı gövde doğrulaması; geçerli girdiyi olduğu gibi yansıtır. */
  @Post('validate')
  validate(@ValidatedBody(smokeValidationSchema) body: SmokeValidationInput): SmokeValidationInput {
    return body
  }
}

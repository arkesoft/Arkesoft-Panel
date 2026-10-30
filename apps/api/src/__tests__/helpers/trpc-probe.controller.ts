// @arkesoft/api — AC9(b)+AC10 fixture'ı: tek test-özel `AppError` alt sınıfı,
// iki yüzey (ROADMAP v0.0.6, T-007/S6, architect K3/"AC10 ölçümü")
//
// `smokeControllers` ile verilir (`create-test-app.ts:93`, DEĞİŞTİRİLMEDİ) —
// `AuthProbeController`/`test-probe.controller.ts`'in AYNI deseni: ÜRETİM
// KODUNA uç EKLENMEZ, `src/__tests__/helpers/**` altında yaşar.
//
// `ProbeDetailsError` **yalnızca burada** tanımlıdır — `apps/api/src/errors/
// domain/**`'e HİÇ dokunulmadı (AC9(b)'nin "tek doğruluk kaynağı" iddiasının
// kanıtı: `toErrorBody`/`error-mapping.ts`/`packages/trpc` bu sınıfın
// VARLIĞINDAN bile haberdar değil, yalnızca `AppError.publicDetails`
// getter'ını okur). `override` zorunluluğu `noImplicitOverride` tarafından
// mekanik olarak dayatılır.
//
// İKİ yüzey: (1) bu controller'ın `GET /__trpc_probe/http` ucu — `AppExceptionFilter`
// üzerinden HTTP gövdesi üretir; (2) `trpc-http.test.ts`'in AYNI sınıfı bir
// test-kapsamlı `TenantReadPort` içinde fırlatıp `createTrpcRequestHandler()`
// (gerçek `appRouter`/`errorFormatter`/`appErrorBoundary`, S3'ün ÜRETİM kodu)
// üzerinden geçirdiği yol. İki yüzey de `@arkesoft/errors`'un AYNI
// `toErrorBody`/fabrikalarını çağırır — literal kopyası yok.

import { Controller, Get } from '@nestjs/common'
import { AppError } from '@arkesoft/errors'

/**
 * HTTP durumu 422 **kasıtlı olarak** seçildi — `packages/trpc`'nin
 * kapalı-dünya durum↔kod haritasında (`http-status-to-trpc-code.ts`)
 * `422 → UNPROCESSABLE_CONTENT` net bir karşılığı var; başka hiçbir
 * production hata sınıfı bu durumu kullanmıyor (karışıklık riski yok).
 */
export class ProbeDetailsError extends AppError {
  constructor() {
    super({
      code: 'PROBE_DETAILS',
      httpStatus: 422,
      userMessageKey: 'errors.test.probeDetails',
      isRetryable: false,
    })
  }

  /** AC9(b)'nin asıl fixture'ı — tele yazılacak tek ek alan. */
  override get publicDetails(): Readonly<Record<string, unknown>> {
    return { probe: 'x' }
  }
}

@Controller('__trpc_probe')
export class TrpcProbeController {
  /** AC9(b)+AC10'un HTTP yüzeyi — `AppExceptionFilter` bu hatayı tele çevirir. */
  @Get('http')
  getProbe(): never {
    throw new ProbeDetailsError()
  }
}

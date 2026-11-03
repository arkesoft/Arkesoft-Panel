// @arkesoft/api — JOB_NOT_FOUND (ROADMAP v0.0.11, T-013/S8, architect
// "tRPC SÖZLEŞMESİ" — AC8)
//
// ⚠⚠ ÜÇ ayrı olgu BU TEK hatayı üretir ve tel üstünde AYIRT EDİLEMEZ:
//   (a) böyle bir iş kaydı HİÇ YOK,
//   (b) kayıt VAR ama BAŞKA kiracıya ait,
//   (c) `job.list` imleci (cursor) bu kiracıda çözülemedi — ki o da (a) veya
//       (b)'nin ta kendisidir.
// CLAUDE.md §7 md 12: "var olmayan vs. yetkisiz ayrımı yapılmıyor → her ikisi
// de 404". `TenantNotFoundError`'ın (T-002/ST-4) AYNI tasarımı.
//
// Ayrımın YAZILAMAZ olması bu sınıfın değil ADAPTÖRÜN garantisidir
// (`trpc/ports/job-read.port.adapter.ts`): sorgu kiracı kapsamlı istemci
// içinde koşar, RLS her iki durumda da SIFIR satır döndürür ve adaptörde tek
// bir `throw` noktası vardır. Bu sınıf o garantinin tel karşılığıdır.
//
// `publicDetails` OVERRIDE EDİLMEZ → tel gövdesinin `details` alanı `{}`
// kalır (`AppError.publicDetails` varsayılanı). Bu, AC8'in "iki gövde BİREBİR
// aynı" iddiasının mekanik yarısıdır: gövdeye kimlik taşıyacak bir alan
// YOKTUR, dolayısıyla (a) ile (b) arasında fark ÜRETİLEMEZ.
//
// `context` ise YALNIZCA LOGA gider (`AppError`'ın yön ayrımı, A-V25) ve tele
// ASLA serileşmez — bu yüzden teşhis için isteğe bağlı olarak alınabilir.
// Adaptör onu kullanmaz: iki olguyu ayırt etmeyen bir hatanın log bağlamında
// bile fazladan kimlik taşımasına ihtiyaç yok, istenen `jobId` zaten istek
// loguna girer. Parametre ileride (ör. imleç çözümlemesinde) gerekirse
// ARAYÜZ HAZIR; `TenantNotFoundError` ile birebir aynı imza.

import { AppError } from '@arkesoft/errors'

export class JobNotFoundError extends AppError {
  constructor(context?: Record<string, unknown>) {
    super({
      code: 'JOB_NOT_FOUND',
      httpStatus: 404,
      userMessageKey: 'errors.job.notFound',
      // `exactOptionalPropertyTypes` (CLAUDE.md §4): `context` yalnızca
      // GERÇEKTEN verildiğinde eklenir — `context: undefined` yazmak optional
      // alanı açıkça `undefined`'a eşitler, bu derleme hatası verir.
      ...(context !== undefined ? { context } : {}),
      // Satır yokluğu yeniden denemekle değişmez.
      isRetryable: false,
    })
  }
}

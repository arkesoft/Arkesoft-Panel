// @arkesoft/api — JOB_PAYLOAD_INVALID (ROADMAP v0.0.11, T-013/S5, AC5)
//
// `QueueService.enqueue`'nun payload doğrulaması BAŞARISIZ olduğunda
// fırlatılır. ⚠ AC5'in ikinci yarısı: `tenantId`'si eksik payload Zod ile
// REDDEDİLİR ve iş HİÇ KUYRUĞA GİRMEZ — `Job` satırı da yazılmaz (doğrulama
// her iki yan etkiden ÖNCE koşar).
//
// NEDEN `ValidationError` DEĞİL: `ValidationError` HTTP girdi doğrulamasının
// hatasıdır — `publicDetails` ile alan bazlı geri bildirimi TELE YAZAR
// (`errors.validation.<issueCode>` anahtarlarıyla). Kuyruk payload'ı ise
// kullanıcı formu değil, İÇ ÇAĞRI sözleşmesidir; alan bazlı geri bildirimi
// tele yazmak hiçbir kullanıcıya yardım etmez, karşılığında iş türünün iç
// payload şeklini sızdırır. Bu yüzden ayrı bir kod ve `publicDetails`
// override'ı YOK.
//
// ⚠ `context` YALNIZCA ALAN YOLLARINI taşır, DEĞERLERİ TAŞIMAZ (CLAUDE.md
// §4/§10 md 7): payload bir kiracı kimliği, ileride sağlayıcı
// yapılandırmasına komşu veri taşıyabilir. Zod'un ham `issue.message`'ı da
// doğrulanan DEĞERİ içerebildiği için loglanmaz.

import { AppError } from '@arkesoft/errors'

export class JobPayloadInvalidError extends AppError {
  constructor(jobName: string, invalidFieldPaths: readonly string[]) {
    super({
      code: 'JOB_PAYLOAD_INVALID',
      httpStatus: 400,
      userMessageKey: 'errors.job.payloadInvalid',
      context: { jobName, invalidFieldPaths },
      // Aynı payload tekrar gönderilse AYNI şekilde reddedilir — yeniden
      // denemek anlamsız (kuyruk bu bayrağa göre karar verir,
      // `app-error.ts:16`).
      isRetryable: false,
    })
  }
}

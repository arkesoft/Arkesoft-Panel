// @arkesoft/api — JOB_IDENTIFIER_MISSING (ROADMAP v0.0.11, T-013/S6)
//
// Handler sarmalayıcısı bir işi kimliği OLMADAN aldığında fırlatılır. BullMQ'nun
// tip tanımında `Job.id` OPSİYONELDİR (`id?: string`) — bizim üreticimiz onu
// HER ZAMAN verir (`QueueService.enqueue` → `jobId: <Job.id>`), ama tip
// düzeyindeki bu opsiyonellik bir dalı zorunlu kılıyor ve o dal SESSİZCE
// geçilemez:
//
//   `Job.id` = Postgres `Job.id` eşlemesi bu sürümün TAŞIYICI değişmezidir
//   (ikinci bir eşleme tablosu yok). Kimlik yoksa güncellenecek satır
//   BULUNAMAZ → iş koşsa bile sonucu HİÇBİR YERE yazılamaz, yani
//   "çalıştı ama kimse göremedi" durumu doğar.
//
// Bu yüzden sarmalayıcı işi ÇALIŞTIRMADAN reddeder ve `UnrecoverableError`
// ile sarar (yeniden denemek aynı sonucu verir — `isRetryable: false`).
//
// `httpStatus: 500` — kullanıcı girdisi hatası değil, altyapı değişmezinin
// ihlali. `context` yalnızca iş adını taşır (PII yok; payload OKUNMAZ).

import { AppError } from '@arkesoft/errors'

export class JobIdentifierMissingError extends AppError {
  constructor(jobName: string) {
    super({
      code: 'JOB_IDENTIFIER_MISSING',
      httpStatus: 500,
      userMessageKey: 'errors.job.identifierMissing',
      context: { jobName },
      isRetryable: false,
    })
  }
}

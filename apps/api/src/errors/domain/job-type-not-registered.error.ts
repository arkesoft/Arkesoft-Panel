// @arkesoft/api — JOB_TYPE_NOT_REGISTERED (ROADMAP v0.0.11, T-013/S5)
//
// `QueueService.enqueue` kayıt defterinde (`JOB_QUEUE_REGISTRY`) karşılığı
// OLMAYAN bir iş tanımıyla çağrıldığında fırlatılır. Normal yolda İMKÂNSIZ:
// kayıt defteri `JOB_DEFINITIONS` gezilerek kurulur, yani dizideki her tanım
// için bir girdi vardır. Buraya düşmek YALNIZCA şu durumda mümkündür: bir
// çağıran, kayıt defterine EKLENMEMİŞ bir tanım nesnesi geçirir.
//
// NEDEN SESSİZCE GEÇMİYOR (ve neden düz `Error` değil): sessizce geçmek,
// hiçbir worker'ın almayacağı bir işi "kuyruğa alındı" diye raporlamak
// olurdu — `Job` satırı sonsuza kadar `queued` kalır, kimse fark etmez. Bu
// reponun tekrarlayan kusur sınıfı (beyan ile gerçeklik boşluğu) tam olarak
// budur. `AppError` hiyerarşisinde durması, hatanın tel sözleşmesine ve
// loglamaya mevcut tek yoldan (`toErrorBody`/`AppExceptionFilter`)
// bağlanmasını sağlar (CLAUDE.md §4: "tek hiyerarşi").
//
// `httpStatus: 500` — bu bir KULLANICI girdisi hatası değil, yapılandırma/
// programlama hatasıdır. `context` yalnızca iş adını taşır (PII yok).

import { AppError } from '@arkesoft/errors'

export class JobTypeNotRegisteredError extends AppError {
  constructor(jobName: string) {
    super({
      code: 'JOB_TYPE_NOT_REGISTERED',
      httpStatus: 500,
      userMessageKey: 'errors.job.enqueueFailed',
      context: { jobName },
      // Kayıt defteri süreç ömrü boyunca sabittir → yeniden denemek aynı
      // sonucu verir.
      isRetryable: false,
    })
  }
}

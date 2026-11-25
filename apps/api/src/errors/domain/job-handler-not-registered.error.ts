// @arkesoft/api — JOB_HANDLER_NOT_REGISTERED (ROADMAP v0.0.11, T-013/S6)
//
// Worker AÇILIŞINDA fırlatılır: `JOB_DEFINITIONS`'ta (üretici tarafı kayıt
// defteri) duran bir iş türünün worker tarafında KAYITLI BİR HANDLER'I yok,
// ya da kayıtlı runner'ın topolojisi kayıt defterindeki tanımın KENDİSİ
// değil (bir KOPYASI).
//
// NEDEN BU KAPI VAR (ve neden açılışta, iş gelince değil): handler'ı olmayan
// bir iş türü kuyruğa GİRER (üretici onu tanır), ama hiçbir worker onu ALMAZ
// → `Job` satırı sonsuza kadar `queued` kalır ve KİMSE FARK ETMEZ. Bu, bu
// reponun tekrarlayan kusur sınıfıdır (beyan ile gerçeklik boşluğu). Emsal:
// `packages/db`'nin prob tamlığı kapısı (`tenant-isolation-suite.ts`) —
// taksonomiye eklenen ama probu yazılmayan tablo GERÇEK bir başarısızlık
// üretir, sessiz geçiş değil.
//
// ⚠ TOPOLOJİ KİMLİĞİ (`reason: 'topology-mismatch'`) de ayrı bir kusurdur:
// worker, kayıt defterindeki tanımın bir KOPYASIYLA kurulsaydı (ör. elle
// yazılmış `attempts`/`concurrency`), üretici ile tüketici AYRI AYRI
// evrilebilirdi. Kapı nesne KİMLİĞİ (`===`) karşılaştırır — kopya geçmez.
//
// `httpStatus: 500` — kullanıcı girdisi hatası değil, yapılandırma/programlama
// hatası. `context` yalnızca iş adını ve sebebi taşır (PII yok).
//
// `logLevel: 'error'` (ROADMAP v0.0.17, T-028/S9, R-PO3 devrinin bulduğu
// davranış kayması — `architect`/S8 bu sınıfı DEĞERLENDİRMEMİŞTİ, S8 yalnızca
// dört 503 adayını ekledi): `trpc.ts`'in ÖNCEKİ `httpStatus >= 500 → error`
// türetmesi bu sınıf için `error` YAZIYORDU; `appError.logLevel`'a devredilen
// TEK doğruluk kaynağı AÇIKÇA beyan EDİLMEZSE varsayılan `'warn'`a düşer ve bu
// SESSİZ bir seviye DÜŞÜŞÜ olurdu. Bu kabul EDİLEMEZ: bu hata WORKER
// AÇILIŞINDA bir kayıt defteri/topoloji tutarsızlığını (üretici ↔ tüketici
// evrimi birbirinden koptu) işaret eder — tanım gereği bir DEPLOY/PROGRAMLAMA
// hatasıdır, "beklenen ama anormal" (`warn`) DEĞİLDİR; operatörün ANINDA
// müdahale etmesi gerekir (CLAUDE.md §4 "müdahale gerekir" = `error`).
// Varsayılanda bırakmak, bu dosyanın başındaki "KİMSE FARK ETMEZ" uyarısının
// AYNISINI log seviyesinde TEKRARLARDI.

import { AppError, ERROR_MESSAGE_KEYS } from '@arkesoft/errors'

/** Kapının hangi değişmezin kırıldığını ayırt etmesi için (loga gider). */
export type JobHandlerRegistrationFailureReason = 'missing-handler' | 'topology-mismatch'

export class JobHandlerNotRegisteredError extends AppError {
  constructor(jobName: string, reason: JobHandlerRegistrationFailureReason) {
    super({
      code: 'JOB_HANDLER_NOT_REGISTERED',
      httpStatus: 500,
      userMessageKey: ERROR_MESSAGE_KEYS.JOB_HANDLER_NOT_REGISTERED,
      context: { jobName, reason },
      // Worker kayıt defteri süreç ömrü boyunca sabittir → yeniden denemek
      // aynı sonucu verir (`app-error.ts:16`).
      isRetryable: false,
      logLevel: 'error',
    })
  }
}

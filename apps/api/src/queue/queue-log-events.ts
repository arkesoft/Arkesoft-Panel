// @arkesoft/api — kuyruk log olayı sabitleri (ROADMAP v0.0.11, T-013/S5,
// architect K1.d)
//
// NEDEN SABİT, NEDEN TEK DOSYA: `WORKER_READY_LOG_EVENT` bir TEST
// SÖZLEŞMESİdir. AC9 (T-013/S7) worker çocuk sürecinin hazır olmasını HTTP
// ile ÖLÇEMEZ (worker port AÇMAZ, K1.e) → fixture `child.stdout`'u satır
// satır ayrıştırıp bu sabiti taşıyan `msg` alanını bekler. Mesaj metni
// `main.worker.ts` içinde SATIR İÇİ yazılsaydı, metni değiştiren biri AC9
// testini SESSİZCE sonsuz beklemeye düşürürdü (zaman aşımı → "flaky test"
// teşhisi, gerçek sebep görünmez). Hem üretici (`main.worker.ts`) hem ölçen
// taraf (fixture) BU dosyadan import eder.
//
// MESAJLAR TÜRKÇE (CLAUDE.md §4 — log mesajı operatöre dönük metindir);
// ALANLAR (`tenantId`, `jobId`, ...) İngilizce. Bu sabitler pino'nun `msg`
// alanına yazılır, i18n kataloğuna GİRMEZ: kullanıcıya dönük metin DEĞİL,
// operatöre dönük log satırıdır (kullanıcıya dönük metin `AppError.
// userMessageKey` üzerinden gider).

/**
 * Üretici bir işi başarıyla kuyruğa aldı. Gövdede `tenantId` + `jobId` +
 * `jobName` ZORUNLU (CLAUDE.md §7 md 13).
 */
export const JOB_ENQUEUED_LOG_EVENT = 'iş kuyruğa alındı'

/**
 * Kuyruk yaşam döngüsü kapandı (tüm `Queue` örnekleri + Redis bağlantısı).
 * AC9'un kapanış zincirinin gözlemlenebilir ucu.
 */
export const QUEUE_CLOSED_LOG_EVENT = 'kuyruk kapatıldı'

/**
 * Kapanış sırasında bir adım zaman aşımına uğradı veya reddetti → sert
 * kapanışa (`disconnect()`) düşüldü. `redis.service.ts`'in aynı durumdaki
 * `warn` deseniyle hizalı; hata YUTULMAZ, loglanır ve sert yol uygulanır.
 */
export const QUEUE_SHUTDOWN_DEGRADED_LOG_EVENT =
  'kuyruk kapanışı zaman aşımına uğradı, sert kapanış uygulanıyor'

/**
 * ⚠ TEST SÖZLEŞMESİ (K1.d, AC9 — T-013/S7): worker süreci işleri almaya
 * hazır. `main.worker.ts` (T-013/S6) bunu `stdout`'a yazar, AC9 fixture'ı
 * BUNU BEKLER. Metni değiştirmek iki tarafı birlikte değiştirmek demektir.
 */
export const WORKER_READY_LOG_EVENT = 'kuyruk worker hazır'

// ---------------------------------------------------------------------------
// T-013/S6 EKLEMESİ (yalnızca EKLEME — yukarıdaki dört sabit DEĞİŞMEDİ):
// iş yaşam döngüsü ve worker kapanışı olayları. Gerekçe aynı: bu metinler
// testlerin (AC4/AC5/AC6) GÖZLEM NOKTASIdır; satır içi yazılsalardı metni
// değiştiren biri assert'i sessizce beklemeye/kaçırmaya düşürürdü.
//
// HEPSİNİN GÖVDESİNDE `tenantId` + `jobId` ZORUNLU (CLAUDE.md §7 md 13) —
// sarmalayıcı bunu `logger.child({ tenantId, jobId, jobName })` ile YAPISAL
// olarak garanti eder, çağıran alan eklemeyi UNUTAMAZ. İstisna: süreç
// seviyesi olaylar (`WORKER_*`, `QUEUE_*`) bir kiracıya ait DEĞİLDİR —
// onlarda kiracı alanı yoktur, `QUEUE_CLOSED_LOG_EVENT` emsali (S5).
// ---------------------------------------------------------------------------

/** Sarmalayıcı işi aldı, handler'ı çağırmak üzere (gövdede `attemptNumber`). */
export const JOB_STARTED_LOG_EVENT = 'iş işleniyor'

/** Handler döndü, `Job` satırı `completed` + `progress: 100` yazıldı (AC4). */
export const JOB_COMPLETED_LOG_EVENT = 'iş tamamlandı'

/**
 * TEK bir denemenin başarısızlığı. ⚠ Hatanın TAM hâli (kod + indirgenmiş
 * mesaj) YALNIZCA BURAYA gider; `Job.error` kolonuna `toErrorBody()`'nin
 * REDAKTE edilmiş dört alanlı gövdesi yazılır (S2'nin R-S2-3 uyarısı).
 */
export const JOB_ATTEMPT_FAILED_LOG_EVENT = 'iş denemesi başarısız'

/** Son deneme de başarısız oldu → DLQ zarfı yazıldı, iş `failed` (AC6). */
export const JOB_DEAD_LETTERED_LOG_EVENT = 'iş ölü harf kuyruğuna taşındı'

/**
 * Payload kuyruktan OKUNDUĞUNDA şemayı karşılamadı → iş YENİDEN DENENMEZ.
 * (Üretici de parse ediyor; araya Redis girdiği için worker TEKRAR parse eder.)
 */
export const JOB_PAYLOAD_REJECTED_LOG_EVENT = 'iş payload’ı reddedildi, yeniden denenmeyecek'

/** BullMQ işi kimliksiz geldi → satır eşlemesi kurulamıyor, iş çalıştırılmıyor. */
export const JOB_IDENTIFIER_MISSING_LOG_EVENT = 'iş kimliği yok, iş çalıştırılmıyor'

/**
 * Terminal muhasebe (satır güncellemesi veya DLQ yazımı) başarısız oldu.
 * ⚠ Hata YUTULMUYOR: `error` seviyesinde loglanıyor ve ORİJİNAL iş hatası
 * BullMQ'ya olduğu gibi iletiliyor — muhasebe hatasının orijinal hatayı
 * MASKELEMESİ yeniden deneme/terminal kararını bozardı.
 */
export const JOB_TERMINAL_BOOKKEEPING_FAILED_LOG_EVENT =
  'iş terminal kaydı yazılamadı, orijinal hata iletiliyor'

/** Kiracı kurulum iskeletinin TEK adımı (gövdede `step` + `progressPercent`). */
export const TENANT_PROVISION_STEP_LOG_EVENT = 'kiracı kurulum adımı'

/** Worker SIGTERM/SIGINT aldı, kapanış zinciri başladı (K1.b). */
export const WORKER_SHUTDOWN_STARTED_LOG_EVENT = 'worker kapanışı başladı'

/**
 * `worker.close()` bütçesi doldu → `close(true)` ile ZORLA kapatılıyor
 * (devam eden iş yarıda kalır, `Job.status` `running` KALIR — K1.c: `failed`
 * YAZILMAZ, çünkü işin başarısız olup olmadığını BİLMİYORUZ).
 */
export const WORKER_FORCE_CLOSED_LOG_EVENT =
  'worker kapanışı zaman aşımına uğradı, zorla kapatılıyor'

/** Kapanış zinciri tamamlandı; süreç event loop boşalınca exit 0 ile çıkar. */
export const WORKER_SHUTDOWN_COMPLETED_LOG_EVENT = 'worker kapanışı tamamlandı'

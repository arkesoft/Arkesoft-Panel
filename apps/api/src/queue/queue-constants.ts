// @arkesoft/api — kuyruk MODÜL SABİTLERİ (ROADMAP v0.0.11, T-013/S5,
// architect K4 + K6)
//
// HEPSİ MODÜL SABİTİ, HİÇBİRİ ENV DEĞİL (K-A8'in "env yüzeyi büyümesin"
// kısıtı). Gerekçe: bu değerler işletim parametresi değil, ÜRÜN KARARI —
// env'den gevşetilebilir olsalardı AC7'nin pinlediği üretim davranışı
// dağıtım başına farklılaşabilirdi ve pin ANLAMINI yitirirdi.
//
// ⚠ BU DOSYADA İŞ TÜRÜ ADI (nokta ayraçlı tam ad) BİLEREK YAZILMAZ — iş
// türüne özgü TEK literal `job-registry.ts`'te durur (K4: "hiçbir yerde
// türe özgü dallanma YOK"). Burada yalnızca o işin EŞZAMANLILIK DEĞERİ
// yaşar, çünkü değer bir topoloji kararıdır ve kayıt defteri onu referansla
// tüketir (literal sayı YAZMAZ).

/**
 * BullMQ'nun TÜM Redis anahtarlarını kapsayan önek (BullMQ varsayılanı
 * `bull` yerine). Paylaşılan Redis anahtar alanında platformun kuyruk
 * verisini ayırır.
 *
 * ⚠ KİRACIYA GÖRE BÖLÜNMEZ (ADR-0015 Karar 1 — CLAUDE.md §7 md 8'den
 * BİLİNÇLİ SAPMA, atlanmış bir madde DEĞİL). Gerekçe: kiracı başına kuyruk,
 * kiracı sayısıyla DOĞRUSAL ARTAN bir anahtar alanı ve worker sayısı demek;
 * adil zamanlama imkânsızlaşır. İzolasyon bunun yerine DÖRT AYAKTA durur:
 *   1. payload şemasında ZORUNLU `tenantId` (`job-payload.base.ts`)
 *   2. handler'ın YAPISAL `withTenant` kısıtı (K5 katman 2 — `AppPrismaDatabase`
 *      `job` delegesini TAŞIMAZ, `withTenant` dışından `Job`'a dokunan kod
 *      DERLENMEZ)
 *   3. `Job` tablosunun RLS'i (`ENABLE` + `FORCE`, T-013/S2)
 *   4. ⚠ HAM KUYRUK İÇERİĞİNİ GÖSTEREN HİÇBİR YÜZEYİN OLMAMASI — Bull
 *      Board'un v0.15.0'a ertelenmesi (K-PM1) tam bu yüzden önemli.
 */
export const QUEUE_KEY_PREFIX = 'arkesoft:queue'

/**
 * Ölü harf kuyruğunun (DLQ) adı = `<iş adı>` + bu sonek. İş türü başına AYRI
 * bir BullMQ kuyruğu; BullMQ'nun kendi `failed` KÜMESİ DEĞİL (K4): o küme
 * `removeOnFail` retention'ına tabidir ve yeniden sürülebilir bir yapı
 * değildir.
 */
export const DLQ_QUEUE_NAME_SUFFIX = '.dlq'

/**
 * Bir işin TOPLAM deneme sayısı (ilk koşum + 2 yeniden deneme). ⚠ AC6'nın
 * ("3 denemeden sonra DLQ'ya düşer") ve AC7'nin (backoff dizisinin UZUNLUĞU)
 * birlikte pinlediği değer — düşürmek/yükseltmek `backoff.test.ts`'i KIRAR.
 */
export const JOB_ATTEMPTS = 3

/**
 * Üretim backoff'unun taban gecikmesi (ms). Dizi: 1. yeniden deneme +5 sn,
 * 2. yeniden deneme +10 sn → toplam ~15 sn.
 *
 * ⚠ AC7 bu değeri `PRODUCTION_BACKOFF_PROFILE` üzerinden pinler; DÜŞÜRMEK
 * testi KIRAR (ölçüldü — S5 raporundaki mutasyon M1).
 */
export const BACKOFF_BASE_DELAY_MS = 5_000

/**
 * İş seçeneklerindeki `backoff.type` değeri. ⚠ Hazır `'exponential'` DEĞİL
 * (K6): hazır strateji seçilse AC7'nin pinlediği dizi BizİM AYNALAMAMIZ
 * olurdu — BullMQ'nun iç formülünü VARSAYMAK zorunda kalırdık. Özel strateji
 * ile AC7 üretimde FİİLEN KOŞAN kod yolunu (`computeBackoffDelayMs`) pinler.
 *
 * Eşlenik taraf: worker'ın `settings.backoffStrategy`'si (T-013/S6) —
 * `createBackoffStrategy(PRODUCTION_BACKOFF_PROFILE)` oraya verilir.
 */
export const CUSTOM_BACKOFF_TYPE = 'custom'

/**
 * Kiracı kurulum (provisioning) işinin worker eşzamanlılığı. ⚠ ÖRTÜK BullMQ
 * VARSAYILANINA BIRAKILMADI (kapsam md 12 — AC'nin istediği AÇIKLIKTIR,
 * değerin büyüklüğü değil).
 *
 * Değer gerekçesi: kurulum adımları v0.0.11'de İDEMPOTENT DEĞİL (gerçek
 * adımlar v0.2.0'da gelecek) → paralelliği ilk gerçek iş eklenirken
 * yükseltmek doğru sıra.
 */
export const TENANT_PROVISION_CONCURRENCY = 1

/**
 * Başarısız BullMQ işinden Redis'te tutulacak en fazla kayıt sayısı.
 *
 * ⚠ SIFIR DEĞİL, bilerek: A-A5 (`failed` olayının temizlikten ÖNCE koştuğu)
 * ÖLÇÜLEMEDİ. Sınırlı tutmak, varsayım yanlışsa bile VERİ KAYBINI önler. Bu
 * bir "retention politikası" DEĞİL (v0.0.17 ile çatışmaz) — yalnızca üst
 * sınır.
 */
export const JOB_REMOVE_ON_FAIL_COUNT = 100

/**
 * Başarıyla tamamlanan iş Redis'te TUTULMAZ: doğruluk kaynağı Postgres'teki
 * `Job` satırıdır (`status`/`progress`/`completedAt`), BullMQ'nun `completed`
 * kümesi değil. İkinci bir doğruluk kaynağı ÜRETMİYORUZ.
 */
export const JOB_REMOVE_ON_COMPLETE = true

/**
 * Tek bir `queue.close()` çağrısının bütçesi (ms). `redis.service.ts`'in
 * `QUIT_TIMEOUT_MS` disipliniyle aynı gerekçe: AC9'un "SIGTERM sonrası açık
 * handle kalmaz" garantisi için SINIRSIZ beklemek exit 0'ı riske atar.
 */
export const QUEUE_CLOSE_TIMEOUT_MS = 2000

/**
 * Kuyruk Redis bağlantısının `quit()` bütçesi (ms) — `redis.service.ts:
 * QUIT_TIMEOUT_MS` ile AYNI değer ve AYNI desen (zaman aşımında
 * `disconnect()`).
 */
export const QUEUE_QUIT_TIMEOUT_MS = 1000

/**
 * Bir iş adından DLQ kuyruk adını üretir. TEK KAYNAK: üretici (bu sürüm) ve
 * tüketici (T-013/S6'nın DLQ zarfını yazan sarmalayıcısı) AYNI fonksiyondan
 * geçer — iki tarafın adı ayrı ayrı türetmesi bu reponun tekrarlayan kusur
 * sınıfıdır.
 */
export function buildDlqQueueName(jobName: string): string {
  return `${jobName}${DLQ_QUEUE_NAME_SUFFIX}`
}

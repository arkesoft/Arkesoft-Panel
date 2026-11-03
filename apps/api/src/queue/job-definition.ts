// @arkesoft/api — iş tanımı SÖZLEŞMESİ (ROADMAP v0.0.11, T-013/S5,
// architect K4 + K5)
//
// NE YAPIYOR: iş türüne özgü HER ŞEYİ veriye çeviriyor. `QueueModule` ve
// `QueueService` bu sözleşmeyi GEZER; hiçbir yerde iş TÜRÜNE GÖRE DALLANMA
// (iş türü alanını bir literal ile karşılaştıran koşul) YOKTUR (CLAUDE.md
// §10 md 12'nin ruhu: çekirdek sağlayıcı/tür adı bilmez). İkinci iş türü
// eklemek `job-registry.ts`'te BİR SATIRdır.
//
// ⚠ LİTERAL-JETON KURALI (AGENT_BASELINE §5): bu yasağı DENETLEYEN kontrol
// `rg "if \(.*type ===" apps/api/src/queue/` — yani o koşul kalıbı bu
// dizindeki hiçbir dosyada, YORUM İÇİNDE BİLE bitişik yazılamaz; yazılsa
// denetim kendi açıklamamızı bulup KALICI YANLIŞ POZİTİF üretirdi. Kalıp bu
// yüzden Türkçe tarif ediliyor.
//
// ⚠ TANIM İKİ PARÇAYA AYRILDI — gerekçe ve sonuçları:
//
//   `JobDefinition<P>`         → ÜRETİCİNİN (kuyruk topolojisi + enqueue)
//                                ihtiyaç duyduğu TAM yüzey: ad, payload
//                                şeması, eşzamanlılık, deneme sayısı.
//   `RunnableJobDefinition<P>` → yukarısı + `handler`. TÜKETİCİ (worker,
//                                T-013/S6) bunu kurar ve koşturur.
//
// architect K4 tek bir nesne (`{name, payloadSchema, handler, concurrency,
// attempts}`) tarif ediyordu. Alt görev sınırı (S5 = ÜRETİCİ, S6 = TÜKETİCİ)
// tek nesneyi İMKÂNSIZ kılıyor: tek nesne, kayıt defterinin handler'ı
// IMPORT ETMESİNİ gerektirir, handler ise S6'nın dosyası. `handler`'ı
// OPSİYONEL yapmak (`handler?`) alternatifti ve REDDEDİLDİ — opsiyonel
// handler, handler'ı OLMAYAN bir işin kuyruğa girmesini tip düzeyinde
// MEŞRULAŞTIRIRDI (iş sonsuza kadar `queued` kalır, kimse fark etmez).
// Kesişim tipi ise K5 katman 1'i (payload'ın `tenantId` taşıma zorunluluğu)
// HER İKİ parçada da korur.
//
// ⚠ T-013/S6 İÇİN BAĞLAYICI: worker kayıt defteri `JOB_DEFINITIONS`'ı
// GEZEREK her tanıma handler'ını bağlar; iş adı (kuyruk adı) TEK KAYNAK
// olarak `job-registry.ts`'te kalır, S6 ikinci bir ad literali YAZMAZ.

import type { Logger } from 'pino'
import type { TenantTransactionClient } from '@arkesoft/db'
import type { z } from 'zod'

import type { JobPayloadBase } from './job-payload.base.js'

/**
 * Handler'a verilen YAPISAL kiracı bağlamı (architect K5).
 *
 * ⚠ `withTenantDb` BİLEREK `tenantId` PARAMETRESİ KABUL ETMEZ: "handler
 * başka kiracıyı yazamaz, çünkü yazacak YER YOK". Kiracı, parse edilmiş
 * payload'ın `tenantId`'sinden sarmalayıcı tarafından kurulur (T-013/S6).
 *
 * ⚠ `withTenantDb` ADIM BAŞINA çağrılır, işin TAMAMINI sarmalamaz
 * (`withTenant` TEK transaction açar — uzun işi tek transaction'da tutmak
 * bağlantıyı `idle in transaction` bırakır, kilit tutar ve AC9'un handle
 * disiplinini bozar). Bu KISIT bağlayıcıdır.
 */
export type JobContext = {
  /** BullMQ iş kimliği = Postgres `Job.id` (eşleme `QueueService.enqueue`'da kurulur). */
  readonly jobId: string
  /** Yalnızca OKUMA/log için — yazma yolu `withTenantDb` üzerinden gider. */
  readonly tenantId: string
  /** `{ tenantId, jobId }` bind'li logger (CLAUDE.md §7 md 13 — her kayıtta `tenantId`). */
  readonly logger: Logger
  /** Kiracı kapsamlı TEK transaction. Adım başına çağrılır. */
  readonly withTenantDb: <T>(callback: (tx: TenantTransactionClient) => Promise<T>) => Promise<T>
  /** `Job.progress`'i MONOTON ilerletir (geri gitmek mekanik olarak imkânsız, T-013/S6). */
  readonly reportProgress: (percent: number) => Promise<void>
}

/**
 * İşin gerçek gövdesi. Dönüş `void`: sonucu Postgres'teki `Job` satırı
 * taşır (`status`/`progress`/`error`), handler'ın dönüş değeri DEĞİL —
 * ikinci bir doğruluk kaynağı üretmiyoruz.
 */
export type JobHandler<P extends JobPayloadBase> = (payload: P, ctx: JobContext) => Promise<void>

/**
 * Kuyruk topolojisinin ve üreticinin tüm ihtiyacı.
 *
 * `P extends JobPayloadBase` ⚠ K5 KATMAN 1: `tenantId` taşımayan bir şemayla
 * iş tanımlamak DERLENMEZ.
 */
export type JobDefinition<P extends JobPayloadBase> = {
  /** Kuyruk adı = iş adı. CLAUDE.md §4 isimlendirme: `domain.action`. */
  readonly name: string
  /** Payload kuyruğa GİRMEDEN ÖNCE bununla parse edilir (AC5). */
  readonly payloadSchema: z.ZodType<P>
  /**
   * Worker eşzamanlılığı. ⚠ ÖRTÜK BullMQ varsayılanına bırakılmaz — değer
   * `queue-constants.ts`'te AÇIK bir modül sabitidir (kapsam md 12).
   *
   * ⚠ KUYRUK BAŞINA İŞ TÜRÜ (tek çoklanmış kuyruk DEĞİL) kararının sebebi
   * tam burada: BullMQ'da eşzamanlılık `Worker` başınadır → çoklanmış tek
   * kuyrukta AĞIR iş türü HAFİF olanı aç bırakır.
   */
  readonly concurrency: number
  /** Toplam deneme sayısı (ilk koşum dahil). AC6 bunu ölçer. */
  readonly attempts: number
}

/**
 * Tüketici (worker, T-013/S6) tarafının tanımı: topoloji + handler.
 * `QueueModule` bu tipi GÖRMEZ — üretici handler'a hiç ihtiyaç duymaz.
 */
export type RunnableJobDefinition<P extends JobPayloadBase> = JobDefinition<P> & {
  readonly handler: JobHandler<P>
}

// @arkesoft/trpc — JobReadPort (ROADMAP v0.0.11, T-013/S8, architect
// "tRPC SÖZLEŞMESİ")
//
// Port BİLDİRİLİR (burada), `apps/api`'de UYGULANIR
// (`apps/api/src/trpc/ports/job-read.port.adapter.ts`). ADR-0009 madde 3:
// port TOTAL'dır — "bulunamadı" durumu çağırana `null` olarak GEÇMEZ, port
// `AppError` fırlatır (`apps/api`'nin kendi hata sınıfı,
// `JobNotFoundError`). Sözleşme katmanı yokluğun ne anlama geldiğine ASLA
// karar vermez — bu yüzden `job.router.ts`'teki resolver'lar `null` kontrolü
// YAPMAZ, dallanma SIFIR.
//
// ⚠⚠ VARLIK ORACLE'I YAPISAL OLARAK KAPALI (AC8, CLAUDE.md §7 md 12):
// adaptör YALNIZCA kiracı kapsamlı istemci içinde arar, RLS hem YABANCI hem
// VAR OLMAYAN kimliği AYNI şekilde (sıfır satır) döndürür → tek bir `throw`
// noktası kalır. Bu arayüzün BİÇİMİ o garantiyi taşır: "bulundu ama senin
// değil" ifade edilebilecek bir dönüş değeri YOKTUR (`null` yok, `Result`
// birleşimi yok) → çağıran o ayrımı YAZAMAZ bile.

import type { JobListPage, JobListQuery, JobSummary } from '../schemas/job-summary.schema.js'

export interface JobReadPort {
  /**
   * `tenantId` HER ZAMAN host çözümünden gelen `TrpcTenantState.tenantId`
   * değeridir — prosedür girdisinden ASLA gelmez (CLAUDE.md §7, ADR-0009
   * madde 7). `jobId` girdiden GELİR ama sahiplik uygulama kodunda
   * KARŞILAŞTIRILMAZ: sorgu kiracı bağlamında koşar ve sahipliği
   * VERİTABANI (RLS) doğrular.
   *
   * Satır bulunamazsa — ya hiç yoksa ya da BAŞKA kiracınınsa — port AYNI
   * `AppError`'ı fırlatır; bu fonksiyon `null`/`undefined` DÖNMEZ.
   */
  findJob(tenantId: string, jobId: string): Promise<JobSummary>

  /**
   * Kiracının işlerini `(createdAt DESC, id DESC)` sırasıyla, keyset
   * sayfalamayla döndürür. `query.limit` tel şemasında ZATEN üst sınıra
   * (`JOB_LIST_MAX_LIMIT`) bağlanmıştır; adaptör bu sınırı TEKRAR zorlamaz,
   * ÇÜNKÜ zorlayamaz — şemayı geçmemiş bir değer resolver'a hiç ulaşmaz.
   *
   * `query.cursor` verildiyse ve o kimlik bu kiracıya ait DEĞİLSE (veya hiç
   * yoksa) {@link findJob} ile AYNI `AppError` fırlatılır — imleç bir
   * varlık oracle'ı DEĞİLDİR.
   */
  listJobs(tenantId: string, query: JobListQuery): Promise<JobListPage>
}

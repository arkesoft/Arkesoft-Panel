// @arkesoft/trpc — `job.get` / `job.list` (ROADMAP v0.0.11, T-013/S8,
// architect "tRPC SÖZLEŞMESİ")
//
// AYRI DOSYA, `tenant.router.ts`'e EKLENMEZ (`storefront.router.ts`'in AYNI
// gerekçesi: dosya başına TEK güven seviyesi, namespace tüketiciyi adıyla
// duyurur).
//
// İKİ PROSEDÜRÜN DE BUILDER'I `tenantProcedure`'DÜR — kimlik ZORUNLU, kiracı
// ZORUNLU. Bu dosya KASITLI OLARAK `trpc.ts`'in kimlik GEREKTİRMEYEN iki
// builder'ından HİÇBİRİNİ import etmez ve adlarını ANMAZ (literal-jeton
// kuralı, AGENT_BASELINE.md §5: "bu dosyada anonim builder yok" iddiasını
// denetleyen grep, adı bir yorumda bulursa kendi kapısını kalıcı yanlış
// pozitife düşürür). Gerekçe (architect, §7 md 4): bir iş kaydı vitrin
// ziyaretçisine açık veri DEĞİLDİR — kuyruğa alınmış işlerin türü, zamanı ve
// başarısızlık kodu bir kiracının İÇ operasyonel durumudur.
//
// Resolver gövdeleri TEK İFADE (ADR-0009 madde 4, bağlayıcı): `ctx.ports.*`
// üzerinde TEK çağrı, dallanma SIFIR. Portlar TOTAL'dır
// (`ports/job-read.port.ts`) — "bulunamadı" BURAYA `null` olarak GELMEZ, port
// `AppError` fırlatır; bu resolver'lar `null` kontrolü YAPMAZ.
//
// ⚠⚠ AC8 — VARLIK ORACLE'I YAPISAL OLARAK KAPALI: kiracı kimliği HER ZAMAN
// `ctx.tenant.tenantId`'den (host çözümünden) okunur, prosedür girdisinden
// ASLA (ADR-0009 madde 7). `jobId` ise girdiden gelir — ama bu dosyada o
// kimliği kiracıyla KARŞILAŞTIRAN bir satır YOKTUR ve YAZILAMAZ: port iki
// parametreyi ayrı ayrı alır, karşılaştırmayı veritabanı (RLS) yapar ve
// "yabancı" ile "yok" AYNI hatayı üretir. Bu dosyada koşullu ifade (`if`)
// bulunmaması tasarımın ölçülebilir yüzeyidir, üslup tercihi değil.

import {
  jobGetInputSchema,
  jobListInputSchema,
  jobListPageSchema,
  jobSummarySchema,
} from '../schemas/job-summary.schema.js'
import { router, tenantProcedure } from '../trpc.js'

export const jobRouter = router({
  get: tenantProcedure
    .input(jobGetInputSchema)
    .output(jobSummarySchema)
    .query(({ ctx, input }) => ctx.ports.jobRead.findJob(ctx.tenant.tenantId, input.jobId)),

  list: tenantProcedure
    .input(jobListInputSchema)
    .output(jobListPageSchema)
    .query(({ ctx, input }) => ctx.ports.jobRead.listJobs(ctx.tenant.tenantId, input)),
})

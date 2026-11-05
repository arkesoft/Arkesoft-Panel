// @arkesoft/trpc — `job.get` / `job.list` (ROADMAP v0.0.11, T-013/S8,
// architect "tRPC SÖZLEŞMESİ")
//
// AYRI DOSYA, `tenant.router.ts`'e EKLENMEZ (`storefront.router.ts`'in AYNI
// gerekçesi: dosya başına TEK güven seviyesi, namespace tüketiciyi adıyla
// duyurur).
//
// GÜNCELLEME (ROADMAP v0.0.14, T-014/S2, architect K-A13 / S5 teyidi):
// İKİ PROSEDÜRÜN DE BUILDER'I ARTIK `permissionProcedure('job:read')`'DİR —
// kimlik ZORUNLU, kiracı ZORUNLU (izinli builder kiracı kapsamlı builder'ın
// ÜZERİNE kurulur, iki daraltmayı da DEVRALIR), ÜSTÜNE izin kontrolü.
// ⚠ DAVRANIŞ BİREBİR KORUNDU: `job:read` izni BEŞ ROLÜN BEŞİNE de verilidir
// (`../authz/permissions.ts`) → dün bu uçları çağırabilen her asıl bugün de
// çağırabiliyor. Hiçbir yetenek KALDIRILMADI, bu yüzden sürüm etkisi MINOR
// kaldı (bir rolden `job:read`'i çıkarmak ileride AYRI bir MAJOR karardır).
// ⚠ Taşınmamış olsaydı kapalı dünya tutarlılık kapısı (AC3 ayak (c)) İLK
// GÜNDEN bir muafiyet satırıyla doğacaktı.
// ⚠ Bu dosya artık ÖNCEKİ builder'ının adını da ANMAZ: "bu dosyanın builder'ı
// hangisi" sorusunu grep ile denetleyen kapı, eski adı bir yorumda bulursa
// "beyan ≠ gerçeklik" sanırdı (literal-jeton kuralı, AGENT_BASELINE.md §5 —
// aynı kural kimlik GEREKTİRMEYEN iki builder için de geçerli: adları bu
// dosyada HİÇ geçmez). Gerekçe (architect, §7 md 4): bir iş kaydı vitrin
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

import { permissionProcedure } from '../authz/permission-procedure.js'
import {
  jobGetInputSchema,
  jobListInputSchema,
  jobListPageSchema,
  jobSummarySchema,
} from '../schemas/job-summary.schema.js'
import { router } from '../trpc.js'

export const jobRouter = router({
  get: permissionProcedure('job:read')
    .input(jobGetInputSchema)
    .output(jobSummarySchema)
    .query(({ ctx, input }) => ctx.ports.jobRead.findJob(ctx.tenant.tenantId, input.jobId)),

  list: permissionProcedure('job:read')
    .input(jobListInputSchema)
    .output(jobListPageSchema)
    .query(({ ctx, input }) => ctx.ports.jobRead.listJobs(ctx.tenant.tenantId, input)),
})

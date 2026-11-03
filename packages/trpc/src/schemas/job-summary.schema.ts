// @arkesoft/trpc — `job.get` / `job.list` tel sözleşmesi (ROADMAP v0.0.11,
// T-013/S8, architect "tRPC SÖZLEŞMESİ" + K7)
//
// ADR-0009 madde 5 EMSALİ (`tenant-summary.schema.ts`'in dosya başı
// gerekçesi, birebir aynı mekanizma): bu paket TARAYICI tüketicisi olan bir
// pakettir; veritabanı paketine bağımlılık Prisma tiplerini admin SPA'sının
// modül grafiğine sokar. Bu yüzden iş durumu sözlüğü BURADA YEREL olarak
// bildirilir — Prisma'nın ürettiği durum sözlüğü ne TİP ne DEĞER olarak
// import EDİLMEZ (bu dosya veritabanı paketinin adını hiç ANMAZ; bkz.
// AGENT_BASELINE.md §5 literal-jeton kuralı). Sapma riski `apps/api`'deki bir
// TİP PİNİ + ÇALIŞMA ZAMANI pini ile yakalanır
// (`apps/api/src/__tests__/type-pins/trpc-wire-contract.pin.ts`, PİN 5 —
// `TenantStatusWire` için yazılmış PİN 1'in birebir ikizi); bu paketin görevi
// yalnızca o pinin karşılaştırdığı "gerçeğin" kaynağı olmaktır.
//
// K5 bağlayıcı kurallar (ADR-0009 madde 7, `tenant-summary.schema.ts` ile
// AYNI):
//   1. Opsiyonel ÇIKTI alanı YOK — yokluk `null` ile ifade edilir.
//   2. Yalnızca JSON ilkelleri — `Date` YOK, transformer gerekmiyor. Zaman
//      alanları ISO-8601 dizesidir (`trpc.ts`'in "transformer YOK" değişmezi
//      bağlayıcı). ⚠ `z.iso.datetime()` KULLANILIR, `z.string().datetime()`
//      DEĞİL: ikincisi zod 4.6.7'de `@deprecated` ve bu repoda
//      `@typescript-eslint/no-deprecated` (strictTypeChecked) ONU LINT HATASI
//      YAPIYOR — S8 bunu ÖLÇTÜ (probe çıktısı handoff raporunda). Anlam
//      BİREBİR aynı: tele `Date` değil ISO dizesi çıkar.
//   3. Çıktı şeması İŞ KURALI taşımaz. `.int()` bir iş kuralı değil, kolonun
//      TİP olgusudur (`Int`); `.min(0)`/`.max(100)` gibi aralık kuralları
//      BİLEREK YAZILMADI — ilerleme aralığının zorlanması yazma yolunun
//      (`job-runner.ts`'in monotonluk yüklemi) işidir, tel şemasının değil.
//
// ⚠⚠ TELE ÇIKMAYAN İKİ ŞEY (architect K7 + CLAUDE.md §7 md 12, BAĞLAYICI):
//
//   (1) İşin kuyruk GİRDİSİ — kuyruk zarfının taşıdığı JSONB kolonu — bu
//       şemada YOKTUR ve bu dosyada adı HİÇ GEÇMEZ (literal-jeton kuralı:
//       "o kolon bu dosyada yok" iddiasını denetleyen grep, kolonun adını bu
//       dosyanın yorumunda bulursa kendi kapısını kalıcı yanlış pozitife
//       düşürür). Gerekçe: `ROADMAP.md:514` "iş durumunu okuyan" bir uç
//       istiyor, girdisini okuyan değil; o kolon operasyonel ayrıntı taşır ve
//       gelecekte sağlayıcı yapılandırmasına KOMŞU veri taşıyabilir → tele
//       HİÇ koymamak, sonradan redaction yazmaktan güvenlidir. Bugün bu kolon
//       yalnızca `{ tenantId }` taşıyor olsa bile (T-013/S5 strip etti) karar
//       İLERİYE dönüktür.
//
//   (2) Hata gövdesinin DÖRT alanından yalnızca İKİSİ ({@link
//       jobErrorSummarySchema}: `code` + `message`). `details` ve `requestId`
//       tele KOYULMAZ (T-013/S6 bu kararı zaten yazdı): `requestId` işi
//       KUYRUĞA ALAN isteğin değil, işi İŞLEYEN worker denemesinin
//       korelasyon kimliğidir — paneldeki okuyucuya hiçbir şey anlatmaz,
//       operatörün iç korelasyon anahtarını dışa açar. `details` ise
//       hata sınıfına göre değişken şekilli bir torba; tele açmak onu
//       sözleşme yüzeyi yapardı.
//
// ⚠ `tenantId` de tele ÇIKMAZ — okuyucu kendi kiracısının işlerini okuyor,
// kimliği ona geri söylemek bilgi EKLEMEZ (ve kiracı kimliğini yanıt
// gövdesinde çoğaltmamak `trpc-cross-tenant.isolation.test.ts`'in bayt
// düzeyli "yanıtta kiracı kimliği geçmez" assert'lerini korur).

import { z } from 'zod'

/**
 * İş durumu sözlüğü — veritabanı katmanındaki durum enum'unun YEREL,
 * tele-özgü karşılığı. Değer kümesi sapınca `apps/api`'deki tip pini VE
 * çalışma zamanı pini kırılır; bu dosya SESSİZCE sapamaz.
 *
 * `cancelled` YOK — iptal yüzeyi (`job.cancel`) bu sürümün kapsamı dışında
 * (architect K3). Sonradan eklenmesi tel sözleşmesi için EKLEMEdir (MINOR).
 */
export const jobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed'])

/** {@link jobStatusSchema}'nın çıkarılan tip karşılığı. */
export type JobStatusWire = z.infer<typeof jobStatusSchema>

/**
 * Başarısız bir işin tele çıkan hata özeti — dosya başı yorumunun (2)
 * maddesi. `z.object()`'in bilinmeyen anahtarları SOYMASI burada bir YEDEK
 * savunmadır, BİRİNCİL savunma değil: birincil savunma portun dönüş tipinin
 * (`JobReadPort`) bu şemanın çıkardığı tipi taşımasıdır
 * (`storefront-tenant.schema.ts`'in AYNI gerekçesi — serileştirme yoluna
 * güvenilmez).
 */
export const jobErrorSummarySchema = z.object({
  code: z.string(),
  message: z.string(),
})

/** {@link jobErrorSummarySchema}'nın çıkarılan tip karşılığı. */
export type JobErrorSummary = z.infer<typeof jobErrorSummarySchema>

/**
 * `job.get`'in çıktısı ve `job.list`'in öğe şekli. İş kaydı satırıyla BİREBİR
 * AYNI DEĞİL — dosya başı yorumundaki iki alan bilerek YOKTUR.
 *
 * `error` ARA denemelerde `null` KALIR (T-013/S6 kararı 1): bu alanın
 * kaynağına yalnızca işin TERMİNAL sonucu yazılır, ara denemenin hatası
 * yalnızca loga gider.
 *
 * ⚠ BU SÜRÜMDE GARANTİ EDİLEN TAM OLARAK ŞU: `status === 'completed'` ile
 * dolu bir `error` birlikte GÖRÜLEMEZ. Bu şema bir şey ZORLAMAZ (K5 kuralı 3);
 * garantinin iki MEKANİK dayanağı da yazma yolundadır (T-013 FIX 1,
 * `apps/api`'nin handler sarmalayıcısı):
 *   (1) hata yazan tek yol TERMİNAL denemedir ve AYNI yazmada `status`
 *       `'failed'` olur;
 *   (2) `'completed'` yazımı YALNIZCA `'queued'`/`'running'` bir kayıtta
 *       gerçekleşir → terminal bir kayıt `'completed'`'e DÖNMEZ, yani dolu bir
 *       `error`'ın üzerine `'completed'` YAZILAMAZ.
 *
 * ⚠ GARANTİ EDİLMEYEN — bilerek YAZILI (karşılanmayan garanti bırakmamak
 * için): terminal muhasebeden SONRA yeniden teslim edilip BAŞARAN bir iş
 * `'failed'` + dolu `error` olarak KALIR. Yani `status` son denemenin
 * sonucunu değil, KAYDEDİLMİŞ TERMİNAL sonucu söyler. Alternatif —
 * `'completed'` + bayat `error` — okuyucuyu iki doğruluk kaynağı arasında
 * bırakırdı; terminal kaydı dokunulmaz tutmak SEÇİLDİ.
 */
export const jobSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  status: jobStatusSchema,
  progress: z.number().int(),
  error: jobErrorSummarySchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
})

/** {@link jobSummarySchema}'nın çıkarılan tip karşılığı. */
export type JobSummary = z.infer<typeof jobSummarySchema>

/**
 * `job.get` girdisi. ⚠ `jobId` DIŞ DÜNYADAN gelir ve bu şemayla parse edilir
 * — ama kiracı kimliği girdiden ASLA okunmaz (ADR-0009 madde 7): bu şemada
 * kiracı alanı YOKTUR ve EKLENMEZ.
 */
export const jobGetInputSchema = z.object({
  jobId: z.string().min(1),
})

/** {@link jobGetInputSchema}'nın çıkarılan tip karşılığı. */
export type JobGetInput = z.infer<typeof jobGetInputSchema>

/**
 * Sayfa boyutu ÜST SINIRI — `perf` ikamesinin birinci ölçümü (architect
 * `perf` gate'i bu sürümde koşmuyor, bu kapıyı S8 devraldı). Sınır
 * SÖZLEŞMEDEDİR, adaptörün iyi niyetinde değil: `limit: 51` bir Zod girdi
 * doğrulama hatasıyla REDDEDİLİR, resolver'a HİÇ ULAŞMAZ → kötü niyetli bir
 * çağıran tek istekte sınırsız satır çekemez.
 */
export const JOB_LIST_MAX_LIMIT = 50

/** Girdide `limit` verilmediğinde kullanılan sayfa boyutu. */
export const JOB_LIST_DEFAULT_LIMIT = 20

/**
 * `job.list` girdisi. Üç alan, hiçbiri kiracı taşımaz.
 *
 * `status` bir DİZİ (tek değer değil): panelin tipik sorusu "biten/başarısız
 * olanları gizle" biçiminde ÇOKLU durum filtresi ister. Boş dizi GEÇERLİDİR
 * ve "hiçbir durum" demektir (sıfır satır) — `.min(1)` bir İŞ KURALI olurdu
 * ve girdi şemasında da gereksizdir, çünkü boş filtre tutarlı ve zararsız bir
 * sonuç verir.
 *
 * `cursor` = önceki sayfanın SON öğesinin `id`'si (keyset sayfalama,
 * `(createdAt DESC, id DESC)`). Çözümlemesi KİRACI BAĞLAMI İÇİNDE yapılır →
 * yabancı veya var olmayan bir imleç `job.get` ile AYNI 404 sınıfını üretir
 * (adaptörün tek `throw` noktası).
 */
export const jobListInputSchema = z.object({
  status: z.array(jobStatusSchema).optional(),
  limit: z.number().int().min(1).max(JOB_LIST_MAX_LIMIT).default(JOB_LIST_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
})

/**
 * {@link jobListInputSchema}'nın çıkarılan tip karşılığı — aynı zamanda
 * {@link import('../ports/job-read.port.js').JobReadPort}'un sorgu
 * parametresi tipidir. Resolver parse edilmiş girdiyi OLDUĞU GİBİ porta
 * geçirir (tek ifade, sıfır dallanma — ADR-0009 madde 4); bu yüzden iki
 * tipin AYNI olması tasarımın parçasıdır, tesadüf değil.
 */
export type JobListQuery = z.infer<typeof jobListInputSchema>

/**
 * `job.list` çıktısı. `nextCursor` `null` ise sayfa son sayfadır — opsiyonel
 * alan DEĞİL (K5 kuralı 1).
 */
export const jobListPageSchema = z.object({
  items: z.array(jobSummarySchema),
  nextCursor: z.string().nullable(),
})

/** {@link jobListPageSchema}'nın çıkarılan tip karşılığı. */
export type JobListPage = z.infer<typeof jobListPageSchema>

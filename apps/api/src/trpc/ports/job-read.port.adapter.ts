// @arkesoft/api — JobReadPort adaptörü (ROADMAP v0.0.11, T-013/S8, architect
// "tRPC SÖZLEŞMESİ" — AC8 + `perf` ikamesi)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/job-read.port.ts`), burada
// UYGULANIR. Port TOTAL'dır (ADR-0009 madde 3) — "bulunamadı" durumu çağırana
// `null` olarak GEÇMEZ, bu adaptör `AppError` (`JobNotFoundError`) fırlatır;
// `job.router.ts`'teki resolver'lar bu yüzden `null` kontrolü YAPMAZ.
//
// ⚠⚠ DİĞER İKİ PORT ADAPTÖRÜNDEN (`tenant-read`/`storefront-tenant-read`)
// TEMEL FARK: onlar PLATFORM SEVİYESİ `tenant` tablosunu okuduğu için ham
// `prisma.db.*` çağrısı yapmak ZORUNDAYDI (ve gerekçe yorumu yazdı). Bu
// adaptör KİRACIYA BAĞLI bir tabloyu okur → `withTenant()` KULLANIR, ham
// çağrı YAPMAZ. Bu bir tercih değil, DERLEME ZORUNLULUĞU: `AppPrismaDatabase`
// allowlist'i (`packages/db/src/client.ts`, T-013/S2) iş kaydı delegesini
// TAŞIMAZ → `prisma.db.job.findFirst(...)` DERLENMEZ (K5 katman 2).
//
// ⚠⚠ AC8 — VARLIK ORACLE'I YAPISAL OLARAK KAPALI (CLAUDE.md §7 md 12):
// her iki metot da sorgularını YALNIZCA `withTenant(tenantId)` içinde koşar.
// RLS politikası yüklemi her sorguya `tenant_id = current_setting('app.
// tenant_id')` ekler → BAŞKA kiracının kimliği ile VAR OLMAYAN kimlik
// VERİTABANI SEVİYESİNDE ayırt EDİLEMEZ, ikisi de SIFIR satır döner. Bu
// dosyada kiracı kimliğini satırla KARŞILAŞTIRAN bir yüklem YOKTUR
// (`where: { tenantId }` YAZILMAZ — RLS onu ZATEN ekliyor; yazmak ikinci bir
// doğruluk kaynağı olurdu) ve KOŞULLU İFADE (`if`) YOKTUR:
//   - `job.get` yolunda tek `throw` noktası `row ?? raiseJobNotFound()`,
//   - `job.list` imleç yolunda tek `throw` noktası `anchorById.get(id) ??
//     raiseJobNotFound()`.
// İkisi de "yabancı" ile "yok" arasında dal AÇMAZ; ayrım YAZILAMAZ.
//
// ⚠ `job.list`'in imleç çözümlemesi KOŞULSUZDUR ve bu, `if`siz yazımın
// numarası DEĞİL mekanizmanın kendisidir: `[query.cursor].filter(...)` imleç
// verilmediğinde BOŞ bir dizi üretir → `.map()` SIFIR kez koşar → hiçbir
// `throw` olmaz ve keyset yüklemi hiç eklenmez. İmleç verildiğinde dizi TEK
// elemanlıdır → arama SONUCU yoksa yukarıdaki tek `throw` noktasına düşer.
// "İmleç yok" ile "imleç geçersiz" böylece FARKLI kod yollarına değil FARKLI
// VERİYE ayrılır.
//
// ⚠ `perf` İKAMESİ, ÖLÇÜM 2 (architect devretti, `perf` gate'i bu sürümde
// koşmuyor): `job.list`'in sorgu şekli `(tenant_id, status, created_at DESC)`
// bileşik indeksiyle (`packages/db` şeması, T-013/S2) UYUMLU tasarlandı —
// RLS'in eklediği `tenant_id` eşitliği ÖNDE, girdinin `status IN (...)`
// filtresi ORTADA, sıralama `created_at DESC` (+ `id DESC` deterministik
// bağ çözücü) SONDA. Bu uyum `__tests__/trpc-job-read-port-adapter.test.ts`
// içinde HEM sorgu argümanlarının şekli HEM canlı Postgres'teki indeks
// tanımı okunarak ölçülür.
//
// ⚠ `perf` İKAMESİ, ÖLÇÜM 1 sorumluluğu BU DOSYADA DEĞİL: sayfa boyutu üst
// sınırı tel şemasında (`jobListInputSchema`) zorlanır; adaptör `query.limit`
// değerini TEKRAR sınırlamaz çünkü sınırlayamaz — şemayı geçmemiş bir değer
// resolver'a hiç ulaşmaz. İki yerde sınır yazmak ikinci bir doğruluk kaynağı
// olurdu.

import { Inject, Injectable } from '@nestjs/common'
import type { JobStatus, Prisma } from '@arkesoft/db'
import { jobErrorSummarySchema } from '@arkesoft/trpc'
import type { JobListPage, JobListQuery, JobStatusWire, JobSummary } from '@arkesoft/trpc'
import type { JobReadPort } from '@arkesoft/trpc/server'

import { JobNotFoundError } from '../../errors/domain/job-not-found.error.js'
import { PrismaService } from '../../prisma/prisma.service.js'

/**
 * Tele çıkan alanların TAM listesi. ⚠ Kuyruk girdisini taşıyan JSONB kolonu
 * bu seçimde YOKTUR — yani o kolon tele çıkmadığı gibi veritabanından HİÇ
 * OKUNMAZ (derinlemesine savunma: "tele yazmayı unutmadık" değil, "elimize
 * hiç almadık"). `tenant_id` de seçilmez: okuyucu kendi kiracısını zaten
 * biliyor.
 *
 * `as const` bir TİP ZORLAMASI (type assertion) değil const assertion'dır —
 * Prisma'nın `select` çıkarımı alan değerlerinin LİTERAL `true` olmasını
 * ister, `boolean`'a genişlerse dönüş tipi tüm kolonlara açılır.
 */
export const JOB_ROW_SELECT = {
  id: true,
  type: true,
  status: true,
  progress: true,
  error: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  completedAt: true,
} as const satisfies Prisma.JobSelect

/** İmleç (cursor) çözümlemesi için okunan minimal satır şekli. */
const JOB_ANCHOR_SELECT = { id: true, createdAt: true } as const satisfies Prisma.JobSelect

/**
 * Keyset sayfalamanın BAĞLAYICI sıralaması. `created_at DESC` indeksin
 * sıralama yönüyle, `id DESC` ise eşit zaman damgalarında deterministik bağ
 * çözümüyle eşleşir (`created_at` `Timestamptz(3)` — milisaniye çözünürlükte
 * çakışma gerçekçidir, aynı milisaniyede iki iş kuyruğa alınabilir).
 *
 * ⚠ `export`: `perf` ikamesinin ÖLÇÜM 2'si bu sabiti ve {@link
 * JOB_ROW_SELECT}'i TESTTEN okur — testin kendi beyanını değil, adaptörün
 * GERÇEKTEN kullandığı nesneyi ölçer (kopyalanmış bir beklenti vacuous
 * olurdu).
 */
export const JOB_LIST_ORDER_BY = [
  { createdAt: 'desc' },
  { id: 'desc' },
] as const satisfies Prisma.JobOrderByWithRelationInput[]

/**
 * Hata kolonunun tel şeması — `nullable`. JSONB okuması DIŞ DÜNYADAN gelen
 * veridir ve CLAUDE.md §4 gereği parse EDİLİR, tip VERİLMEZ.
 *
 * ⚠ `safeParse` + yedek değer DEĞİL, `parse`: hata YUTULMAZ. Kolona yazma
 * yolunun KENDİSİ bir şema kapısıdır (`job-runner.ts`'in `toJsonErrorBody`'si
 * `appErrorBodySchema.parse` ile yazıyor) → şekli bozuk bir satır yalnızca
 * veritabanına ELLE müdahale ile doğabilir. Böyle bir satırı sessizce `null`'a
 * indirmek gerçeği maskeler; `parse`'ın fırlatması operatöre görünür bir
 * sinyal üretir (`AppExceptionFilter` loglar).
 *
 * `z.object()`'in bilinmeyen anahtarları SOYMASI burada tel sözleşmesinin
 * dört alanlı gövdesini iki alana İNDİREN mekanizmadır (`details`/`requestId`
 * düşer) — ama birincil garanti bu değil, portun DÖNÜŞ TİPİdir.
 */
const JOB_ERROR_COLUMN_SCHEMA = jobErrorSummarySchema.nullable()

/**
 * Tele çıkacak satırın yerel şekli. Prisma'nın ürettiği payload tipine
 * BAĞLANMAZ — `error` burada `unknown`'dur, çünkü o kolon JSONB'dir ve tip
 * verilmeden parse edilmek ZORUNDADIR (CLAUDE.md §4). Prisma'nın
 * `JsonValue | null` değeri `unknown`'a atanabilir; ters yön mümkün değildir,
 * yani bu şekil kolonu yanlışlıkla tiplemiş olamaz.
 */
type JobRow = {
  readonly id: string
  readonly type: string
  readonly status: JobStatus
  readonly progress: number
  readonly error: unknown
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly startedAt: Date | null
  readonly completedAt: Date | null
}

/** İmleç çözümlemesinden dönen minimal satır. */
export type JobAnchorRow = {
  readonly id: string
  readonly createdAt: Date
}

/**
 * `job.list`'in Prisma'ya GEÇİRDİĞİ argümanların TAM şekli. Ayrı bir SAF
 * fonksiyon olarak dışa açılır (aşağıda) — `perf` ikamesinin ÖLÇÜM 2'si bu
 * fonksiyonun ÜRETTİĞİ nesneyi doğrudan inceler. Böylece "sorgu şekli
 * indeksle uyumlu" iddiası bir yorum değil, karşılaştırılan bir DEĞER olur.
 */
export type JobListQueryArgs = {
  readonly where: Prisma.JobWhereInput
  readonly orderBy: typeof JOB_LIST_ORDER_BY
  readonly select: typeof JOB_ROW_SELECT
  readonly take: number
}

/**
 * ⚠ SAF fonksiyon — I/O yapmaz, `throw` ETMEZ, dallanma İÇERMEZ. İmleç
 * çözümlemesi (ve dolayısıyla tek `throw` noktası) BİLEREK dışarıda, çağıran
 * metodun içinde bırakıldı: bu fonksiyon yalnızca ÇÖZÜLMÜŞ demirleri
 * (anchors) alır.
 *
 * Üretilen `where` üç katmandan oluşur ve `(tenant_id, status, created_at
 * DESC)` indeksinin kolon SIRASINI izler:
 *   1. `tenant_id` eşitliği — BURADA YAZILMAZ, RLS politikası her sorguya
 *      kendisi ekler (indeksin ÖNDEKİ kolonu yine de kullanılır).
 *   2. `status IN (...)` — yalnızca girdide varsa.
 *   3. keyset yüklemi — yalnızca imleç varsa; `created_at`/`id` üzerinde.
 * Sıralama her durumda `created_at DESC, id DESC`'tir.
 */
export function buildJobListQueryArgs(
  query: JobListQuery,
  anchors: readonly JobAnchorRow[],
): JobListQueryArgs {
  const statusFilters: Prisma.JobWhereInput[] = [query.status]
    .filter((value): value is JobStatusWire[] => value !== undefined)
    .map((value) => ({ status: { in: value } }))

  const keysetFilters: Prisma.JobWhereInput[] = anchors.map((anchor) => ({
    OR: [
      { createdAt: { lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ],
  }))

  return {
    where: { AND: [...statusFilters, ...keysetFilters] },
    orderBy: JOB_LIST_ORDER_BY,
    select: JOB_ROW_SELECT,
    // `limit + 1` okunur: fazladan satırın VARLIĞI "devam eden sayfa var"
    // bilgisinin TEK kaynağıdır (ikinci bir `count` sorgusu YOK — `count`
    // hem fazladan tarama hem de kiracının toplam iş sayısını sızdırabilecek
    // bir alan olurdu).
    take: query.limit + 1,
  }
}

/**
 * AC8'in TEK `throw` noktası — "yabancı" ve "yok" olgularının BİRLEŞTİĞİ yer.
 * `never` döndüğü için `??` sağ tarafında ifade olarak kullanılabilir; bu,
 * bir `if` bloğu açmadan hatayı fırlatmayı sağlar ve "ayrım yazılamaz"
 * garantisini SÖZDİZİMSEL olarak da korur.
 */
function raiseJobNotFound(): never {
  throw new JobNotFoundError()
}

/**
 * `status` ALANI: Prisma'nın ürettiği durum birleşimi düz string
 * literallerinden oluşur (`enums.ts` → `as const` nesnesi), tel birleşimiyle
 * YAPISAL olarak aynıdır. İkisinin sapmaması
 * `__tests__/type-pins/trpc-wire-contract.pin.ts` PİN 5 ile derleme
 * zamanında, değer düzeyinde ise `trpc-http.test.ts`'in çalışma zamanı
 * piniyle zorlanır — bu yüzden burada bir eşleme TABLOSU yazılmaz.
 */
function toJobSummary(row: JobRow): JobSummary {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    error: JOB_ERROR_COLUMN_SCHEMA.parse(row.error),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  }
}

@Injectable()
export class JobReadPortAdapter implements JobReadPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findJob(tenantId: string, jobId: string): Promise<JobSummary> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // `where` YALNIZCA `id` taşır — kiracı yüklemini RLS ekler (dosya başı
      // yorumu). `findFirst` + `select`: tele çıkmayan kolonlar OKUNMAZ.
      const row: JobRow | null = await tx.job.findFirst({
        where: { id: jobId },
        select: JOB_ROW_SELECT,
      })

      return toJobSummary(row ?? raiseJobNotFound())
    })
  }

  listJobs(tenantId: string, query: JobListQuery): Promise<JobListPage> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // --- ADIM 1 — imleç. Dizi UZUNLUĞU "imleç var mı" sorusunun TEK
      // taşıyıcısıdır; aşağıdaki `.map()` sıfır veya bir kez koşar.
      const cursorIds = [query.cursor].filter((value): value is string => value !== undefined)

      const anchorRows: readonly JobAnchorRow[] = await tx.job.findMany({
        where: { id: { in: cursorIds } },
        select: JOB_ANCHOR_SELECT,
      })

      const anchorById = new Map(anchorRows.map((anchor) => [anchor.id, anchor]))

      // Yabancı/var olmayan imleç → `job.get` ile AYNI 404 (tek `throw`
      // noktası). İmleç verilmemişse bu `.map()` SIFIR kez koşar ve demir
      // listesi boş kalır.
      const anchors: readonly JobAnchorRow[] = cursorIds.map(
        (cursorId) => anchorById.get(cursorId) ?? raiseJobNotFound(),
      )

      // --- ADIM 2 — sorgu argümanları. Şekil SAF bir fonksiyonda üretilir
      // (`buildJobListQueryArgs`) ki `perf` ikamesi onu doğrudan ölçebilsin.
      const rows: readonly JobRow[] = await tx.job.findMany(buildJobListQueryArgs(query, anchors))

      // --- ADIM 3 — sayfa. `peeked` 0 veya 1 elemanlıdır; 1 ise "devam eden
      // sayfa var" demektir. İmleç SON DÖNDÜRÜLEN öğenin id'sidir, peek
      // edilen satırın DEĞİL — o satır SONRAKİ sayfanın ilk öğesidir ve
      // keyset yüklemi "imleçten KESİNLİKLE sonra" dediği için onu imleç
      // yapmak o satırı ATLARDI. `flatMap` sıfır veya bir kez koşar.
      const page = rows.slice(0, query.limit)
      const peeked = rows.slice(query.limit)

      return {
        items: page.map((row) => toJobSummary(row)),
        nextCursor: peeked.flatMap(() => page.slice(-1).map((row) => row.id))[0] ?? null,
      }
    })
  }
}

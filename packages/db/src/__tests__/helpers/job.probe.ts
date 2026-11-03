// @arkesoft/db — `job` tablosunun `TenantScopedProbe` uygulaması
// (ROADMAP v0.0.11, T-013/S2, architect K3 + po R-P1)
//
// NEDEN AYRI DOSYA, AMA AYRI ÇAĞRI NOKTASI DEĞİL (po R-P1, BAĞLAYICI):
// `createTenantIsolationSuite()`'in prob tamlığı kapısı
// (`tenant-isolation-suite.ts`) ÇAĞRI BAŞINA kendi taksonomisini kendi
// problarıyla karşılaştırır. Dolayısıyla repoda `TENANT_SCOPED_TABLES`'ın
// TAMAMINI tek bir `probes` dizisiyle besleyen TEK bir çağrı noktası olmak
// ZORUNDA (`__tests__/tenant-membership.isolation.test.ts`). İkinci bir
// `job.isolation.test.ts` açmak İKİ dosyayı da kırardı: membership dosyasında
// `job` probu, job dosyasında `tenant_membership` probu eksik sayılırdı.
// Bu dosya bu yüzden bir TEST DOSYASI DEĞİL, yalnızca tabloya özel bilgiyi
// (model adı, zorunlu kolonlar, FK bağımlılığı) taşıyan bir yardımcıdır —
// `describe`/`it` İÇERMEZ, kaydı çağrı noktası yapar.
//
// JENERİK SÜİT BU DOSYAYI BİLMEZ: yedi zorunlu senaryonun tamamı
// (`tenant-isolation-suite.ts` dosya başı) aşağıdaki sekiz fonksiyon üzerinden
// koşar; süit `Job`'un alan adlarını veya enum'unu HİÇ görmez.

import { JobStatus } from '../../index.js'
import type { PrismaDatabase, TransactionClient } from '../../index.js'
import type { TenantScopedProbe } from './tenant-isolation-suite.js'

/**
 * Probun yarattığı satırların `type` değeri. GERÇEK bir iş türü DEĞİLDİR
 * bilerek: iş türlerinin kayıt defteri `apps/api`'nin kuyruk modülünde yaşar
 * (`JOB_DEFINITIONS`); `packages/db` iş türü adlarını BİLMEZ ve bilmemelidir
 * (CLAUDE.md §3 — `packages/db` iş mantığı taşımaz). `type` bu katmanda yalnızca
 * serbest metin bir kolondur.
 */
const PROBE_JOB_TYPE = 'isolation.probe'

/**
 * Probun yazdığı `payload`. ⚠ KASITLI OLARAK hiçbir kiracı kimliği TAŞIMAZ:
 * jenerik süitin 5. senaryosu hata gövdesinin yabancı `tenantId`'yi
 * içermediğini iddia ediyor; payload'a kiracı kimliği koymak o iddiayı
 * sürücüsü kodun kendisi olan bir yanlış pozitife açık hâle getirirdi.
 * (Üretimdeki payload şeması `tenantId`'yi ZORUNLU tutar — o şema
 * `apps/api/src/queue/job-payload.base.ts`'te yaşar, burada değil.)
 */
const PROBE_JOB_PAYLOAD = { step: 'izolasyon-probu' } as const

/** Context içinde (`tx`), verilen kiracı için bir `Job` satırı kurar ve id'sini döner. */
async function createJobRow(tx: TransactionClient, tenantId: string): Promise<string> {
  const job = await tx.job.create({
    data: {
      tenantId,
      type: PROBE_JOB_TYPE,
      status: JobStatus.queued,
      payload: PROBE_JOB_PAYLOAD,
    },
  })
  return job.id
}

/**
 * `job` tablosunun izolasyon probu. `TenantMembership`'ten FARKI: bu tablonun
 * `User` gibi bir yardımcı FK bağımlılığı YOKTUR (tek FK'si `tenant_id`), bu
 * yüzden `cleanupTenant` yalnızca kiracıyı siler — `ON DELETE CASCADE` iş
 * satırlarını birlikte temizler (cascade RLS'e TABİ DEĞİLDİR; `membership`
 * probunun aynı ampirik gözlemi).
 */
export const jobProbe: TenantScopedProbe = {
  tableName: 'job',

  insertRow: (tx, tenantId) => createJobRow(tx, tenantId),

  findRowById: async (tx, rowId) => {
    const row = await tx.job.findUnique({ where: { id: rowId }, select: { id: true } })
    return row
  },

  insertRowWithForeignTenant: async (tx, foreignTenantId) => {
    await createJobRow(tx, foreignTenantId)
  },

  updateRowById: async (tx, rowId) => {
    // `progress` seçildi: monoton ilerleme alanı, enum/FK kısıtı yok —
    // reddedilmenin TEK sebebi RLS olabilir (başka bir kısıt ihlali senaryo
    // 3/4'ün "bulunamadı" iddiasını yanlış sebeple yeşile çeviremez).
    await tx.job.update({ where: { id: rowId }, data: { progress: 1 } })
  },

  deleteRowById: async (tx, rowId) => {
    await tx.job.delete({ where: { id: rowId } })
  },

  countAllRowsWithoutContext: async (client: PrismaDatabase) => client.job.count(),

  cleanupTenant: async (client: PrismaDatabase, tenantId: string) => {
    // ⚠ İş satırları RLS'e tabi — context'siz bir `job.deleteMany` 0 satır
    // etkiler ve SESSİZCE başarılı olurdu. Temizlik bu yüzden kiracının
    // KENDİSİNİ silerek (FK cascade) yapılır; süit her tablo için KENDİ
    // benzersiz kiracılarını kurduğu (slug'da `randomUUID`) için bu çağrı
    // başka bir testin verisine dokunamaz.
    await client.tenant.delete({ where: { id: tenantId } })
  },
}

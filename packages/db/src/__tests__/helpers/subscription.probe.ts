// @arkesoft/db — `subscription` tablosunun `TenantScopedProbe` uygulaması
// (ROADMAP v0.1.0, T-019/S5, architect VERİ MODELİ + po R-PO3)
//
// NEDEN AYRI DOSYA, AMA AYRI ÇAĞRI NOKTASI DEĞİL (`job.probe.ts:4-14`'ün
// BİREBİR aynı gerekçesi): `createTenantIsolationSuite()`'in prob tamlığı
// kapısı (`tenant-isolation-suite.ts`) ÇAĞRI BAŞINA kendi taksonomisini kendi
// problarıyla karşılaştırır. Dolayısıyla repoda `TENANT_SCOPED_TABLES`'ın
// TAMAMINI tek bir `probes` dizisiyle besleyen TEK bir çağrı noktası olmak
// ZORUNDA (`__tests__/tenant-membership.isolation.test.ts`). Bu dosya bu
// yüzden bir TEST DOSYASI DEĞİL, yalnızca tabloya özel bilgiyi (model adı,
// zorunlu kolonlar, FK bağımlılığı) taşıyan bir yardımcıdır — `describe`/`it`
// İÇERMEZ, kaydı çağrı noktası yapar.
//
// JENERİK SÜİT BU DOSYAYI BİLMEZ: yedi zorunlu senaryonun tamamı
// (`tenant-isolation-suite.ts` dosya başı) aşağıdaki sekiz fonksiyon üzerinden
// koşar; süit `Subscription`'ın alan adlarını veya enum'unu HİÇ görmez.
//
// ⚠⚠ R-PO3 ÖLÇÜMÜ (bağlayıcı, SONUÇ BURAYA YAZILDI, canlı Postgres'te
// `arkesoft_app` rolüyle ÖLÇÜLDÜ): `subscription`'da senaryo 2'nin ("A
// context'inde B'nin tenant_id'siyle INSERT reddedilir") `rejects.toThrow()`
// iddiası ÜÇ olası SQLSTATE'ten BİRİYLE yeşile dönebilirdi — BEKLENEN/DOĞRU
// `42501` (RLS `WITH CHECK`) DIŞINDA kalan İKİ "yanlış sebep" yolu: `23505`
// (`@@unique([tenantId])` ihlali, B'nin `beforeAll` satırı zaten var) ve
// `23503` (`planId` NOT NULL FK `RESTRICT` ihlali, geçersiz `planId`).
// Bu dosyanın `insertRowWithForeignTenant`'ı İKİSİNİ de (geçerli bir `planId`
// + B'nin zaten var olan satırıyla ÇAKIŞAN bir ikinci satır denemesi) aynı
// anda tetikleyecek şekilde kurulduğu için ÖLÇÜM EN KÖTÜ DURUMU kapsar.
// SONUÇ: **SQLSTATE 42501** (`new row violates row-level security policy for
// table "subscription"`) — `23505`/`23503` DEĞİL. RLS `WITH CHECK`, hem
// UNIQUE hem FK kısıtından ÖNCE devreye giriyor ve INSERT'i o aşamada
// reddediyor (`tenant-version-state.probe.ts`'in R-PO1 notuyla AYNI mekanizma
// — S1'in "NOT NULL canlı reddi" ölçümüyle de AYNI üç-değerli mantık:
// `WITH CHECK` satırın `tenant_id`'si `current_setting(...)`e eşit olmadığı
// anda reddeder, sıradaki kısıtlar hiç DEĞERLENDİRİLMEZ). Senaryo 2 bu tablo
// için VACUOUS DEĞİL — probu yeniden kurmaya GEREK YOK.
//
// `plan` FIXTURE (po'nun uyarısı — `cleanupTenant` PLATFORM `plan` satırını
// `tenant.delete` cascade'iyle TEMİZLEMEZ): bu probun kullandığı plan satırı
// seed'in `TRIAL_PLAN`ıyla KASITLI OLARAK AYNI DEĞİL — ayrı bir yer tutucu
// doğal anahtar (`PROBE_PLAN_ID`) kullanılır (`job.probe.ts`'in PROBE_JOB_TYPE
// deseni: gerçek bir iş kararı/üretim verisi DEĞİL). Böylece bu prob seed'in
// `trial` planına veya demo kiracının aboneliğine HİÇ dokunmaz — ikisi
// arasında bir bağımlılık/çakışma doğmaz. Satır `ensureProbePlanExists()`
// içinde İDEMPOTENT bir `upsert` ile kurulur ve `cleanupTenant` onu BİLEREK
// SİLMEZ: `ON DELETE RESTRICT` yüzünden (varsayımsal) eşzamanlı bir ikinci
// çalışma onu kullanıyorken silmeye çalışmak `23503` üretirdi; satır RLS'siz,
// sahipsiz veri TAŞIMAYAN (yalnızca yer tutucu ad/limit) kalıcı bir PLATFORM
// fixture'ı olarak bırakılır — `Plan.id`'nin kendisinin doğal anahtar olması
// (`Theme.id` emsali) bu kalıcılığı zaten meşrulaştırıyor. ⚠ Bu, probun
// `arkesoft_app`'in `plan` tablosundaki BLANKET DML (INSERT/UPDATE/SELECT)
// yetkisine dayandığı anlamına gelir — canlı ölçüldü (`arkesoft_app` ile
// doğrudan `INSERT`/`UPDATE` başarılı) — `security` bu yetkiyi daraltırsa bu
// prob KIRILIR (R-A6, RİSKLER'de de bildirildi).

import type { PrismaDatabase, TransactionClient } from '../../index.js'
import type { TenantScopedProbe } from './tenant-isolation-suite.js'

/**
 * Probun kullandığı `plan` satırının doğal anahtarı. GERÇEK bir iş planı
 * DEĞİLDİR (`job.probe.ts:24-31`'in BİREBİR gerekçesi) — seed'in `trial`
 * planından BİLEREK AYRI tutulur (dosya başı notu).
 */
const PROBE_PLAN_ID = 'izolasyon-probu-plan'
const PROBE_PLAN_NAME = 'İzolasyon Probu Planı'

/**
 * Probun yazdığı `limits`. `job.probe.ts:33-41`'in AYNI deseni — kiracı
 * kimliği TAŞIMAZ, gerçek bir ticari limit şablonu/anlık görüntüsü DEĞİLDİR.
 */
const PROBE_LIMITS = { step: 'izolasyon-probu' } as const
const PROBE_LIMITS_AFTER_UPDATE = { step: 'izolasyon-probu-guncellendi' } as const

/** Probun yazdığı `startedAt`. Clock'tan BAĞIMSIZ sabit — `tenant-update-history.probe.ts`'in aynı gerekçesi. */
const PROBE_STARTED_AT = new Date('2026-01-01T00:00:00.000Z')

/**
 * `subscription.planId` FK'sinin karşılığı olan yer tutucu `plan` satırını
 * İDEMPOTENT kurar (`seed.ts:188-199`'un BİREBİR izlediği `upsert` deseni).
 * `plan` RLS TAŞIMAZ (platform tablosu) — context kurulu olsun olmasın bu
 * çağrı güvenle çalışır (`tx`, `withTenant()`'ın AÇTIĞI tam yetkili
 * `TransactionClient`, `TenantTransactionClient`'ın KISITLI allowlist'i
 * DEĞİL — `tenant-context.ts:105-108` imzası).
 */
async function ensureProbePlanExists(tx: TransactionClient): Promise<void> {
  await tx.plan.upsert({
    where: { id: PROBE_PLAN_ID },
    create: { id: PROBE_PLAN_ID, name: PROBE_PLAN_NAME, limits: PROBE_LIMITS },
    update: { name: PROBE_PLAN_NAME, limits: PROBE_LIMITS },
  })
}

/** Context içinde (`tx`), verilen kiracı için bir `Subscription` satırı kurar ve id'sini döner. */
async function createSubscriptionRow(tx: TransactionClient, tenantId: string): Promise<string> {
  await ensureProbePlanExists(tx)
  const row = await tx.subscription.create({
    data: {
      tenantId,
      planId: PROBE_PLAN_ID,
      limits: PROBE_LIMITS,
      startedAt: PROBE_STARTED_AT,
    },
  })
  return row.id
}

/**
 * `subscription` tablosunun izolasyon probu. `TenantVersionState`'ten FARKI:
 * bu tablonun bir PLATFORM FK bağımlılığı VAR (`planId` → `plan`, `RESTRICT`)
 * — `cleanupTenant` bu yüzden `tenant-version-state.probe.ts`'in SADE
 * deseninden bir adım FARKLI: platform `plan` satırını BİLEREK SİLMEZ (dosya
 * başı notu).
 */
export const subscriptionProbe: TenantScopedProbe = {
  tableName: 'subscription',

  // ⚠ T-023/S5 — `mutationRejection` ZORUNLU alan. `subscription` `REVOKE`
  // kapsamı DIŞINDA (K2: yalnızca `audit_log`/`platform_audit_log`) →
  // her zaman `'record-not-found'`.
  mutationRejection: 'record-not-found',

  insertRow: (tx, tenantId) => createSubscriptionRow(tx, tenantId),

  findRowById: async (tx, rowId) => {
    const row = await tx.subscription.findUnique({ where: { id: rowId }, select: { id: true } })
    return row
  },

  insertRowWithForeignTenant: async (tx, foreignTenantId) => {
    await createSubscriptionRow(tx, foreignTenantId)
  },

  updateRowById: async (tx, rowId) => {
    // `limits` seçildi: enum/FK kısıtı TAŞIMAZ (`status` enum TEK değer
    // taşıdığı için ayırt edici değil, `planId` FK güncellemesi gereksiz bir
    // ikinci kısıt yüzeyi açardı) — reddedilmenin TEK sebebi RLS olabilir
    // (başka bir kısıt ihlali senaryo 3/4'ün "bulunamadı" iddiasını YANLIŞ
    // SEBEPLE yeşile çeviremez, `job.probe.ts:78-82`'nin AYNI gerekçesi).
    await tx.subscription.update({
      where: { id: rowId },
      data: { limits: PROBE_LIMITS_AFTER_UPDATE },
    })
  },

  deleteRowById: async (tx, rowId) => {
    await tx.subscription.delete({ where: { id: rowId } })
  },

  countAllRowsWithoutContext: async (client: PrismaDatabase) => client.subscription.count(),

  cleanupTenant: async (client: PrismaDatabase, tenantId: string) => {
    // ⚠ `tenant_version_state`/`tenant_update_history` probunun AYNI ampirik
    // gözlemi: abonelik satırları RLS'e tabi, context'siz bir `deleteMany` 0
    // satır etkiler ve SESSİZCE başarılı olurdu. Temizlik bu yüzden kiracının
    // KENDİSİNİ silerek (FK `CASCADE`) yapılır. Platform `plan` satırı
    // (`PROBE_PLAN_ID`) BİLEREK SİLİNMEZ — dosya başı notu.
    await client.tenant.delete({ where: { id: tenantId } })
  },
}

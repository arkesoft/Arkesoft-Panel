// @arkesoft/db — `tenant_update_history` tablosunun `TenantScopedProbe`
// uygulaması (ROADMAP v0.0.21, T-018/S4, architect ADR-0020 Karar 1 + po
// R-PO1/K8)
//
// NEDEN AYRI DOSYA, AMA AYRI ÇAĞRI NOKTASI DEĞİL — `job.probe.ts:4-14`'ün
// BİREBİR aynı gerekçesi: `createTenantIsolationSuite()`'in prob tamlığı
// kapısı (`tenant-isolation-suite.ts`) ÇAĞRI BAŞINA kendi taksonomisini kendi
// problarıyla karşılaştırır; repoda `TENANT_SCOPED_TABLES`'ın TAMAMINI tek bir
// `probes` dizisiyle besleyen TEK çağrı noktası `__tests__/tenant-membership.isolation.test.ts`'tir.
// Bu dosya bir TEST DOSYASI DEĞİL, yalnızca tabloya özel bilgiyi taşıyan bir
// yardımcıdır — `describe`/`it` İÇERMEZ.
//
// JENERİK SÜİT BU DOSYAYI BİLMEZ: yedi zorunlu senaryonun tamamı
// (`tenant-isolation-suite.ts` dosya başı) aşağıdaki sekiz fonksiyon üzerinden
// koşar; süit `TenantUpdateHistory`'nin alan adlarını veya `UpdateTrigger`/
// `UpdateStatus` enum'larını HİÇ görmez.
//
// ⚠⚠ R-PO1 ÖLÇÜMÜ (bağlayıcı, SONUÇ BURAYA YAZILDI): `tenant-version-state.probe.ts`'in
// taşıdığı risk (`tenantId @unique`'in UNIQUE ihlaliyle senaryo 2'yi VACUOUS
// kılması) BU TABLODA YAPISAL OLARAK YOK — `@@unique([tenantId, id])` doğal
// bir 1:1 değişmezi İFADE ETMEZ, yalnızca migration linter'ının `tenant_id`
// öncü bileşik indeks şartını (`MISSING_TENANT_ID_LEADING_UNIQUE_INDEX`)
// karşılayan YAPAY bir bileşiktir; `id` cuid(2) ile ÜRETİLDİĞİ için bu kısıt
// pratikte HİÇBİR INSERT tarafından ihlal edilemez. Yine de GÖZLEM atlanmadı
// (ölçüm aynı canlı Postgres oturumunda, `arkesoft_app` rolüyle yapıldı):
// A context'inde B'nin `tenant_id`'siyle INSERT **SQLSTATE 42501**
// (`new row violates row-level security policy for table
// "tenant_update_history"`, `ExecWithCheckOptions`) ile reddedildi — `23505`
// DEĞİL. Senaryo 2 bu tabloda da VACUOUS DEĞİL.
//
// Prob DEĞERLERİ gerçek sürüm numarası OLMAZ VE kiracı kimliği TAŞIMAZ (po,
// bağlayıcı — `job.probe.ts:24-41`'in İKİ gerekçesi birden geçerli): (1)
// "ikinci bir doğruluk kaynağı doğmasın" — bu Task'ın varlık sebebi tam
// olarak bu çift doğruluk kaynağını kapatmak; (2) jenerik süitin 5. senaryosu
// hata gövdesinin yabancı `tenantId` İÇERMEDİĞİNİ iddia ediyor, `fromState`/
// `toState`'e kiracı kimliği koymak o iddiayı sürücüsü kendi kodu olan bir
// yanlış pozitife açardı.

import { UpdateTrigger } from '../../index.js'
import type { PrismaDatabase, TransactionClient } from '../../index.js'
import type { TenantScopedProbe } from './tenant-isolation-suite.js'

/**
 * Probun yazdığı `toState` (JSONB, NOT NULL). `job.probe.ts:33-41`'in AYNI
 * deseni — kiracı kimliği TAŞIMAZ, gerçek bir sürüm anlık görüntüsü DEĞİLDİR
 * (`Sürüm Politikası §5.1-5.2`'nin gerçek anlık görüntü şekli `packages/versioning`'in
 * `snapshot.ts`'inde doğrulanır, burada DEĞİL).
 */
const PROBE_TO_STATE = { step: 'izolasyon-probu' } as const

/**
 * Probun yazdığı `startedAt`/`finishedAt` yer tutucuları. SABİT (clock'tan
 * BAĞIMSIZ) seçildi: `updateRowById` `finishedAt`'i `startedAt` ile AYNI
 * sabite yazar — CHECK #2 (`finished_at IS NULL OR finished_at >= started_at`)
 * eşitlik durumunda GEÇERLİDİR (po tavsiyesi) ve bu alan enum/FK kısıtı
 * TAŞIMAZ, dolayısıyla reddedilmenin TEK sebebi RLS olabilir — başka bir
 * kısıt ihlali senaryo 3/4'ün "bulunamadı" iddiasını YANLIŞ SEBEPLE yeşile
 * çeviremez.
 */
const PROBE_STARTED_AT = new Date('2026-01-01T00:00:00.000Z')

/** Context içinde (`tx`), verilen kiracı için bir `TenantUpdateHistory` satırı kurar ve id'sini döner. */
async function createTenantUpdateHistoryRow(
  tx: TransactionClient,
  tenantId: string,
): Promise<string> {
  const row = await tx.tenantUpdateHistory.create({
    data: {
      tenantId,
      toState: PROBE_TO_STATE,
      triggeredBy: UpdateTrigger.platform_auto,
      startedAt: PROBE_STARTED_AT,
    },
  })
  return row.id
}

/**
 * `tenant_update_history` tablosunun izolasyon probu. `tenant_version_state`
 * probundan FARKI: doğal bir 1:1 değişmezi YOK (bkz. dosya başı R-PO1 notu),
 * ama `cleanupTenant` AYNI SADE şekilde kalır — bileşik FK YOK, platform
 * fixture'ı (Theme/ThemeRelease) KURULMAZ (ADR-0020 Karar 3).
 */
export const tenantUpdateHistoryProbe: TenantScopedProbe = {
  tableName: 'tenant_update_history',

  insertRow: (tx, tenantId) => createTenantUpdateHistoryRow(tx, tenantId),

  findRowById: async (tx, rowId) => {
    const row = await tx.tenantUpdateHistory.findUnique({
      where: { id: rowId },
      select: { id: true },
    })
    return row
  },

  insertRowWithForeignTenant: async (tx, foreignTenantId) => {
    await createTenantUpdateHistoryRow(tx, foreignTenantId)
  },

  updateRowById: async (tx, rowId) => {
    // `finishedAt = startedAt` (po tavsiyesi) — CHECK #2'yi İHLAL ETMEZ
    // (`>=` eşitlikte geçerli), enum/FK kısıtı yok.
    await tx.tenantUpdateHistory.update({
      where: { id: rowId },
      data: { finishedAt: PROBE_STARTED_AT },
    })
  },

  deleteRowById: async (tx, rowId) => {
    await tx.tenantUpdateHistory.delete({ where: { id: rowId } })
  },

  countAllRowsWithoutContext: async (client: PrismaDatabase) => client.tenantUpdateHistory.count(),

  cleanupTenant: async (client: PrismaDatabase, tenantId: string) => {
    // ⚠ `job`/`auditLog`/`tenantVersionState` probunun aynı ampirik gözlemi:
    // satırlar RLS'e tabi, context'siz bir `deleteMany` 0 satır etkiler ve
    // SESSİZCE başarılı olurdu. Temizlik bu yüzden kiracının KENDİSİNİ
    // silerek (FK cascade) yapılır — bileşik FK YOK, platform fixture'ı
    // KURULMADI.
    await client.tenant.delete({ where: { id: tenantId } })
  },
}

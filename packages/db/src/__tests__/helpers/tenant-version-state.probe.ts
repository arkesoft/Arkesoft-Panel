// @arkesoft/db — `tenant_version_state` tablosunun `TenantScopedProbe`
// uygulaması (ROADMAP v0.0.21, T-018/S4, architect ADR-0020 Karar 1 + po
// R-PO1/K8)
//
// NEDEN AYRI DOSYA, AMA AYRI ÇAĞRI NOKTASI DEĞİL (po R-P1 emsali,
// `job.probe.ts:4-14`'ün BİREBİR aynı gerekçesi): `createTenantIsolationSuite()`'in
// prob tamlığı kapısı (`tenant-isolation-suite.ts`) ÇAĞRI BAŞINA kendi
// taksonomisini kendi problarıyla karşılaştırır. Dolayısıyla repoda
// `TENANT_SCOPED_TABLES`'ın TAMAMINI tek bir `probes` dizisiyle besleyen TEK
// bir çağrı noktası olmak ZORUNDA (`__tests__/tenant-membership.isolation.test.ts`).
// Bu dosya bu yüzden bir TEST DOSYASI DEĞİL, yalnızca tabloya özel bilgiyi
// taşıyan bir yardımcıdır — `describe`/`it` İÇERMEZ, kaydı çağrı noktası yapar.
//
// JENERİK SÜİT BU DOSYAYI BİLMEZ: yedi zorunlu senaryonun tamamı
// (`tenant-isolation-suite.ts` dosya başı) aşağıdaki sekiz fonksiyon üzerinden
// koşar; süit `TenantVersionState`'in alan adlarını HİÇ görmez.
//
// ⚠⚠ R-PO1 ÖLÇÜMÜ (bağlayıcı, SONUÇ BURAYA YAZILDI): bu tablo `tenantId @unique`
// taşıdığı için (GERÇEK 1:1 değişmezi) senaryo 2'nin "A context'inde B'nin
// `tenant_id`'siyle INSERT reddedilir" iddiası YANLIŞ SEBEPLE (unique_violation,
// 23505) yeşile dönebilirdi — test bu durumda VACUOUS olurdu. ÖLÇÜLDÜ (canlı
// Postgres'te `arkesoft_app` rolüyle, B'nin kendi satırı zaten varken A
// bağlamında B'nin tenant_id'siyle INSERT denendi): **SQLSTATE 42501**
// (`new row violates row-level security policy for table
// "tenant_version_state"`, `ExecWithCheckOptions`) — yani RLS `WITH CHECK`,
// UNIQUE kısıtından ÖNCE devreye giriyor ve INSERT'i o aşamada reddediyor.
// Senaryo 2 bu tablo için VACUOUS DEĞİL. (Karşılaştır: `tenant-update-history.probe.ts`
// — orada `@@unique([tenantId, id])` yapay bileşik olduğu için bu risk hiç
// YOK, ama aynı ölçüm oradaki dosyada da ayrıca yapıldı.)
//
// Prob DEĞERLERİ gerçek sürüm numarası OLMAZ (po, bağlayıcı — `job.probe.ts:24-41`
// emsali): "ikinci bir doğruluk kaynağı doğmasın" — bu Task'ın varlık sebebi
// tam olarak bu çift doğruluk kaynağını kapatmak (ADR-0020 Karar 1); probun
// içine gerçek `0.8.0`/`modern`/`0.1.0` yazmak aynı hatayı test katmanında
// tekrarlardı.

import type { PrismaDatabase, TransactionClient } from '../../index.js'
import type { TenantScopedProbe } from './tenant-isolation-suite.js'

/**
 * Probun yazdığı sürüm alanları. ⚠ GERÇEK bir platform/tema/API sürümü
 * DEĞİLDİR — yalnızca NOT NULL kısıtını karşılayan yer tutucu metinlerdir.
 * `themeId`'ye `ThemeRelease`'den BİLEŞİK FK YOKTUR (ADR-0020 Karar 3), bu
 * yüzden gerçek bir `Theme` satırı GEREKMEZ.
 */
const PROBE_VERSION_PLACEHOLDER = 'izolasyon-probu-yer-tutucu'
const PROBE_THEME_ID_PLACEHOLDER = 'izolasyon-probu-tema-yer-tutucu'

/** `updateRowById`'ın yazacağı, başlangıçtan FARKLI ikinci bir yer tutucu an. */
const PROBE_LAST_UPDATED_AT = new Date('2026-01-01T00:00:00.000Z')
const PROBE_LAST_UPDATED_AT_AFTER_UPDATE = new Date('2026-01-02T00:00:00.000Z')

/** Context içinde (`tx`), verilen kiracı için bir `TenantVersionState` satırı kurar ve id'sini döner. */
async function createTenantVersionStateRow(
  tx: TransactionClient,
  tenantId: string,
): Promise<string> {
  const row = await tx.tenantVersionState.create({
    data: {
      tenantId,
      platformVersion: PROBE_VERSION_PLACEHOLDER,
      themeId: PROBE_THEME_ID_PLACEHOLDER,
      themeVersion: PROBE_VERSION_PLACEHOLDER,
      apiVersion: PROBE_VERSION_PLACEHOLDER,
      lastUpdatedAt: PROBE_LAST_UPDATED_AT,
    },
  })
  return row.id
}

/**
 * `tenant_version_state` tablosunun izolasyon probu. `Job`/`AuditLog`
 * probundan FARKI: tablonun doğal bir 1:1 değişmezi var (`tenantId @unique`)
 * — bu değişmez `insertRowWithForeignTenant`'ın davranışını DEĞİŞTİRMEZ
 * (RLS `WITH CHECK` zaten UNIQUE'den önce reddediyor, yukarıdaki R-PO1 notu),
 * ama `cleanupTenant`'ın SADE kalabilmesinin nedenidir: bileşik FK YOK,
 * `Theme`/`ThemeRelease` platform fixture'ı KURULMAZ (ADR-0020 Karar 3).
 */
export const tenantVersionStateProbe: TenantScopedProbe = {
  tableName: 'tenant_version_state',

  // ⚠ T-023/S5 — `mutationRejection` ZORUNLU alan. `tenant_version_state`
  // `REVOKE` kapsamı DIŞINDA (K2: yalnızca `audit_log`/`platform_audit_log`)
  // → her zaman `'record-not-found'`.
  mutationRejection: 'record-not-found',

  insertRow: (tx, tenantId) => createTenantVersionStateRow(tx, tenantId),

  findRowById: async (tx, rowId) => {
    const row = await tx.tenantVersionState.findUnique({
      where: { id: rowId },
      select: { id: true },
    })
    return row
  },

  insertRowWithForeignTenant: async (tx, foreignTenantId) => {
    await createTenantVersionStateRow(tx, foreignTenantId)
  },

  updateRowById: async (tx, rowId) => {
    // `lastUpdatedAt` seçildi (po tavsiyesi): bu tablonun tek "monoton
    // ilerleme" benzeri alanı — enum/FK/UNIQUE kısıtı TAŞIMAZ, dolayısıyla
    // reddedilmenin TEK sebebi RLS olabilir (başka bir kısıt ihlali
    // senaryo 3/4'ün "bulunamadı" iddiasını YANLIŞ SEBEPLE yeşile çeviremez).
    await tx.tenantVersionState.update({
      where: { id: rowId },
      data: { lastUpdatedAt: PROBE_LAST_UPDATED_AT_AFTER_UPDATE },
    })
  },

  deleteRowById: async (tx, rowId) => {
    await tx.tenantVersionState.delete({ where: { id: rowId } })
  },

  countAllRowsWithoutContext: async (client: PrismaDatabase) => client.tenantVersionState.count(),

  cleanupTenant: async (client: PrismaDatabase, tenantId: string) => {
    // ⚠ `job`/`auditLog` probunun aynı ampirik gözlemi: satırlar RLS'e
    // tabi, context'siz bir `deleteMany` 0 satır etkiler ve SESSİZCE
    // başarılı olurdu. Temizlik bu yüzden kiracının KENDİSİNİ silerek (FK
    // cascade) yapılır — bileşik FK YOK, platform fixture'ı (Theme/
    // ThemeRelease) KURULMADI, dolayısıyla ek bir temizlik adımı YOK.
    await client.tenant.delete({ where: { id: tenantId } })
  },
}

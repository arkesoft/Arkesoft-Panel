// @arkesoft/db — `createTenantIsolationSuite()` (ROADMAP v0.0.13, T-005/S4,
// architect K-E10)
//
// GENEL/PARAMETRİK: bu dosya HİÇBİR tabloya özel bilgi TAŞIMAZ — `tenantId`
// alan adını, modelin kendisini vb. bilmez. Tablo'ya özel CRUD çağrıları
// `TenantScopedProbe` arayüzü üzerinden ÇAĞIRANDAN (örn.
// `tenant-membership.isolation.test.ts`) gelir. Bu ayrım AC9'un süit
// tarafındaki kaldıracıdır: `TENANT_SCOPED_TABLES`'a yeni bir tablo
// eklendiğinde BU DOSYA DEĞİŞMEDEN, yalnızca yeni bir prob `probes`
// dizisine EKLENİR — eklenmezse aşağıdaki "prob tamlığı" testi KIRMIZI verir
// (`skip` DEĞİL, gerçek bir `expect` başarısızlığı).
//
// YEDİ ZORUNLU SENARYO (tablo başına, K-E10):
//   1. A context'inde B'nin satırı okunamaz
//   2. A context'inde B'nin tenant_id'siyle INSERT reddedilir (WITH CHECK)
//   3. A context'inde B'nin satır id'siyle UPDATE/DELETE "bulunamadı" semantiği üretir
//   4. (A-E5, TESTLE PİNLENİR) var olan yabancı satır İLE hiç var olmayan satır
//      AYNI hata sınıfını üretir — varlık/yetki oracle'ı KAPALI
//   5. Hata gövdesi yabancı tenantId/satır id'si İÇERMEZ
//   6. (havuz sızıntısı, KRİTİK) `withTenant` sonrası context'siz sorgu → 0 satır
//   7. AC2'nin üç sorgusu (uygulama bağlantısıyla, Zod-parse edilmiş)
//
// Senaryo 3/4'ün "bulunamadı" sınıfı Prisma'nın P2025 ("Record to update/delete
// not found") hata koduyla tespit edilir — bu RLS'in filtrelediği bir satırla
// (var ama görünmez) hiç var olmayan bir satırı AYNI ŞEKİLDE ele alır (CLAUDE.md
// §7: "var olmayan vs. yetkisiz ayrımı yapılmıyor → her ikisi de 404" ilkesinin
// veritabanı seviyesindeki karşılığı).

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { TenantStatus, withTenant } from '../../index.js'
import type { PrismaDatabase, TransactionClient } from '../../index.js'

/**
 * Bir tenant'a bağlı tablonun süitin ihtiyaç duyduğu minimum CRUD yüzeyi.
 * Tablo'ya özel bilgi (model adı, zorunlu kolonlar, FK bağımlılıkları) BU
 * ARAYÜZÜN ARKASINDA kalır — süitin kendisi bunları BİLMEZ.
 */
export type TenantScopedProbe = {
  /** `src/tenancy.ts` → `TENANT_SCOPED_TABLES` ile BİREBİR eşleşen tablo adı. */
  readonly tableName: string
  /** Context içinde (`tx`), verilen `tenantId`'ye ait YENİ bir satır oluşturur; satırın id'sini döner. */
  readonly insertRow: (tx: TransactionClient, tenantId: string) => Promise<string>
  /** Context içinde (`tx`), verilen id'yi okur; RLS filtrelerse/yoksa `null`. */
  readonly findRowById: (
    tx: TransactionClient,
    rowId: string,
  ) => Promise<{ readonly id: string } | null>
  /**
   * Context'teki tenant'tan FARKLI bir `foreignTenantId` ile satır oluşturmayı
   * DENER (`WITH CHECK` ihlalini tetiklemek için) — çağıranın bunun
   * REDDEDİLMESİNİ (`throw`) BEKLEMESİ gerekir.
   */
  readonly insertRowWithForeignTenant: (
    tx: TransactionClient,
    foreignTenantId: string,
  ) => Promise<void>
  /** Context içinde verilen id'deki satırı güncellemeyi DENER; görünmezse Prisma P2025 fırlatır. */
  readonly updateRowById: (tx: TransactionClient, rowId: string) => Promise<void>
  /** Context içinde verilen id'deki satırı silmeyi DENER; görünmezse Prisma P2025 fırlatır. */
  readonly deleteRowById: (tx: TransactionClient, rowId: string) => Promise<void>
  /** Context KURMADAN (ham istemci), tablodaki TOPLAM görünür satır sayısını döner. */
  readonly countAllRowsWithoutContext: (client: PrismaDatabase) => Promise<number>
  /** Probun bir tenant için yarattığı TÜM bağımlı veriyi (satır + varsa FK bağımlılıkları) temizler. */
  readonly cleanupTenant: (client: PrismaDatabase, tenantId: string) => Promise<void>
}

export type TenantIsolationSuiteOptions = {
  readonly client: PrismaDatabase
  /** `src/tenancy.ts` → `TENANT_SCOPED_TABLES`. Modülden import EDİLMEZ, parametre olarak GEÇİRİLİR (AC9). */
  readonly taxonomy: { readonly tenantScopedTables: readonly string[] }
  readonly probes: readonly TenantScopedProbe[]
}

// FIX turu 1 (solid [medium] bulgusu — CLAUDE.md §4 is/has/can öneki):
// `catalog-snapshot.ts`'teki yeniden adlandırmayla (`isRowSecurityEnabled`/
// `isRowSecurityForced`/`canBypassRls`) TUTARLI tutulur.
const roleCheckRowSchema = z.object({ isSuperuser: z.boolean(), canBypassRls: z.boolean() })
const rlsCheckRowSchema = z.object({
  isRowSecurityEnabled: z.boolean(),
  isRowSecurityForced: z.boolean(),
})

/**
 * Hatanın Prisma'nın "bulunamadı" (P2025) kodunu taşıyıp taşımadığını daraltır.
 *
 * FIX turu 1 (solid [low] bulgusu): `'code' in error` zaten `error`'ı
 * (TypeScript 4.9+ `in` daraltması) `code` alanı taşıyan bir nesneye daraltır —
 * ayrı bir `as { readonly code: unknown }` zorlaması GEREKSİZDİ, kaldırıldı.
 */
function isRecordNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025'
}

/**
 * Hatayı (mesaj + Prisma `meta` dahil) tek bir metne serileştirir — sızıntı
 * taraması için.
 *
 * FIX turu 1 (solid [low] bulgusu, çift zorlama kaldırıldı): eskiden
 * `(error as unknown as Record<string, unknown>)[key]` ile runtime
 * doğrulaması OLMADAN çift `as` kullanılıyordu (CLAUDE.md §4 ihlali).
 * `JSON.stringify`'ın dizi `replacer` parametresi TAM OLARAK bu ihtiyacı
 * (bilinen + bilinmeyen özel alanları serileştirme) HİÇBİR tip zorlaması
 * gerektirmeden karşılar — `name` `Error.prototype`'ta (own property DEĞİL)
 * yaşadığı için listeye AÇIKÇA eklenir, geri kalan tüm ÖZ (own) alanlar
 * `Object.getOwnPropertyNames` ile toplanır.
 */
function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify(error, ['name', 'message', ...Object.getOwnPropertyNames(error)])
  }
  return JSON.stringify(error)
}

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action()
    return undefined
  } catch (error) {
    return error
  }
}

/**
 * `taxonomy.tenantScopedTables`'ın TAMAMI için `probes` dizisinde bir prob
 * olduğunu iddia eder ve her tablo için yedi senaryoyu kaydeder.
 *
 * PROB TAMLIĞI KAPISI (K-E10, AC9'un asıl kaldıracı): eksik prob `skip`
 * DEĞİL, gerçek bir `expect` BAŞARISIZLIĞIDIR — `TENANT_SCOPED_TABLES`'a
 * karşılık gelen probu olmayan bir tablo eklendiğinde bu fonksiyonun
 * KAYNAK KODU DEĞİŞMEDEN test dosyası kırmızıya döner.
 */
export function createTenantIsolationSuite(options: TenantIsolationSuiteOptions): void {
  describe('tenant izolasyon süiti (createTenantIsolationSuite)', () => {
    const probeByTable = new Map(options.probes.map((probe) => [probe.tableName, probe] as const))
    const missingProbes = options.taxonomy.tenantScopedTables.filter(
      (tableName) => !probeByTable.has(tableName),
    )

    it('prob tamlığı: TENANT_SCOPED_TABLES içindeki her tablonun bir probu var', () => {
      expect(
        missingProbes,
        `eksik prob (TENANT_SCOPED_TABLES'a eklendi ama probes'ta yok): ${missingProbes.join(', ') || 'yok'}`,
      ).toEqual([])
    })

    for (const probe of options.probes) {
      describe(`tablo: ${probe.tableName}`, () => {
        let tenantAId: string
        let tenantBId: string
        let rowIdInB: string

        beforeAll(async () => {
          const tenantA = await options.client.tenant.create({
            data: {
              slug: `iso-a-${probe.tableName}-${randomUUID()}`,
              name: 'İzolasyon Süiti — Tenant A',
              status: TenantStatus.active,
            },
          })
          const tenantB = await options.client.tenant.create({
            data: {
              slug: `iso-b-${probe.tableName}-${randomUUID()}`,
              name: 'İzolasyon Süiti — Tenant B',
              status: TenantStatus.active,
            },
          })
          tenantAId = tenantA.id
          tenantBId = tenantB.id

          rowIdInB = await withTenant(options.client, tenantBId, (tx) =>
            probe.insertRow(tx, tenantBId),
          )
        })

        afterAll(async () => {
          await probe.cleanupTenant(options.client, tenantAId)
          await probe.cleanupTenant(options.client, tenantBId)
          await options.client.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } })
        })

        it("senaryo 1: A context'inde B'nin satırı okunamaz (0 yabancı satır)", async () => {
          const found = await withTenant(options.client, tenantAId, (tx) =>
            probe.findRowById(tx, rowIdInB),
          )
          expect(found).toBeNull()
        })

        it("senaryo 2: A context'inde B'nin tenant_id'siyle INSERT reddedilir (WITH CHECK)", async () => {
          await expect(
            withTenant(options.client, tenantAId, (tx) =>
              probe.insertRowWithForeignTenant(tx, tenantBId),
            ),
          ).rejects.toThrow()
        })

        it("senaryo 3: A context'inde B'nin satır id'siyle UPDATE/DELETE \"bulunamadı\" semantiği üretir (yetkisiz DEĞİL)", async () => {
          const updateError = await captureError(() =>
            withTenant(options.client, tenantAId, (tx) => probe.updateRowById(tx, rowIdInB)),
          )
          expect(isRecordNotFoundError(updateError)).toBe(true)

          const deleteError = await captureError(() =>
            withTenant(options.client, tenantAId, (tx) => probe.deleteRowById(tx, rowIdInB)),
          )
          expect(isRecordNotFoundError(deleteError)).toBe(true)

          // Delete RLS tarafından filtrelendiği için satır GERÇEKTEN silinmedi —
          // sonraki senaryolar (4, 5) aynı satırı güvenle yeniden kullanabilir.
          const stillExists = await withTenant(options.client, tenantBId, (tx) =>
            probe.findRowById(tx, rowIdInB),
          )
          expect(stillExists).not.toBeNull()
        })

        it('senaryo 4 (A-E5, TESTLE PİNLENİR): var olan yabancı satır İLE hiç var olmayan satır AYNI hata sınıfını üretir', async () => {
          const foreignRowError = await captureError(() =>
            withTenant(options.client, tenantAId, (tx) => probe.updateRowById(tx, rowIdInB)),
          )
          const nonExistentRowId = `nonexistent-${randomUUID()}`
          const nonExistentRowError = await captureError(() =>
            withTenant(options.client, tenantAId, (tx) =>
              probe.updateRowById(tx, nonExistentRowId),
            ),
          )

          const foreignIsNotFound = isRecordNotFoundError(foreignRowError)
          const nonExistentIsNotFound = isRecordNotFoundError(nonExistentRowError)

          // İDDİA (A-E5) BURADA PİNLENİR — tutmazsa bu `expect` GÜRÜLTÜLÜ kırmızı
          // verir; testi gevşetmek YASAK (§10.6).
          expect({ foreignIsNotFound, nonExistentIsNotFound }).toEqual({
            foreignIsNotFound: true,
            nonExistentIsNotFound: true,
          })
        })

        it("senaryo 5: hata gövdesi yabancı tenantId/satır id'si İÇERMEZ", async () => {
          const error = await captureError(() =>
            withTenant(options.client, tenantAId, (tx) => probe.updateRowById(tx, rowIdInB)),
          )
          const serialized = serializeError(error)
          expect(serialized.includes(rowIdInB)).toBe(false)
          expect(serialized.includes(tenantBId)).toBe(false)
        })

        it("senaryo 6 (HAVUZ SIZINTISI, KRİTİK): withTenant'tan SONRA, AYNI istemcide context'siz sorgu 0 satır döner", async () => {
          await withTenant(options.client, tenantAId, (tx) => probe.insertRow(tx, tenantAId))
          const visibleWithoutContext = await probe.countAllRowsWithoutContext(options.client)
          expect(visibleWithoutContext).toBe(0)
        })

        it("senaryo 7 (AC2'nin üç sorgusu, Zod-parse): rol f|f, RLS t|t, context'siz 0 satır", async () => {
          const roleRows = z.array(roleCheckRowSchema).parse(
            await options.client.$queryRaw`
              SELECT rolsuper AS "isSuperuser", rolbypassrls AS "canBypassRls"
              FROM pg_roles
              WHERE rolname = current_user
            `,
          )
          expect(roleRows).toEqual([{ isSuperuser: false, canBypassRls: false }])

          const rlsRows = z.array(rlsCheckRowSchema).parse(
            await options.client.$queryRaw`
              SELECT relrowsecurity AS "isRowSecurityEnabled", relforcerowsecurity AS "isRowSecurityForced"
              FROM pg_class
              WHERE relname = ${probe.tableName}
            `,
          )
          expect(rlsRows).toEqual([{ isRowSecurityEnabled: true, isRowSecurityForced: true }])

          const contextLessCount = await probe.countAllRowsWithoutContext(options.client)
          expect(contextLessCount).toBe(0)
        })
      })
    }
  })
}

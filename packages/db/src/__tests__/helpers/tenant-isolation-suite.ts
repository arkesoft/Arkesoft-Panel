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
// Senaryo 3/4'ün reddi, çoğu prob için "bulunamadı" sınıfıdır — Prisma'nın
// P2025 ("Record to update/delete not found") hata koduyla tespit edilir; bu
// RLS'in filtrelediği bir satırla (var ama görünmez) hiç var olmayan bir
// satırı AYNI ŞEKİLDE ele alır (CLAUDE.md §7: "var olmayan vs. yetkisiz
// ayrımı yapılmıyor → her ikisi de 404" ilkesinin veritabanı seviyesindeki
// karşılığı). DÜZELTME (FIX turu 2, `solid` tur 2 [low] — bu paragraf TEK
// sınıf varmış gibi okunuyordu): T-023/S6'dan (DDL uygulandı) İTİBAREN
// `audit_log`/`platform_audit_log` probları BAŞKA bir sınıf (`'privilege-
// denied'`, P2039) döner — ikisinin ayrımı `MutationRejectionKind`
// (aşağıda) ile her prob kendi beklediğini BEYAN eder.

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { TenantStatus, withTenant } from '../../index.js'
import type { PrismaDatabase, TransactionClient } from '../../index.js'

/**
 * Senaryo 3/4'ün UPDATE/DELETE denemesi RLS tarafından reddedildiğinde
 * Prisma'nın fırlattığı hatanın BEKLENEN sınıfı (T-023/S5, architect M5 +
 * Orkestratör düzeltmesi):
 *   - `'record-not-found'` — RLS `USING` filtrelediği için satır Prisma'ya
 *     hiç GÖRÜNMEZ; Postgres sorguyu normal şekilde ÇALIŞTIRIR ve "0 satır
 *     etkilendi" sonucu Prisma'nın P2025 ("Record to update/delete not
 *     found") koduna dönüşür.
 *   - `'privilege-denied'` — çalışma zamanı rolünün tablo üzerinde `UPDATE`/
 *     `DELETE` yetkisi YOKTUR (`REVOKE` sonrası); Postgres sorguyu RLS'e HİÇ
 *     GETİRMEDEN `42501` ("permission denied") ile reddeder; bu Prisma 7'nin
 *     driver-adapter katmanında **P2039** ("Database error") olarak YÜZEYE
 *     ÇIKAR — DÜZELTME (FIX turu 2, `solid` tur 2 [low] — bu paragraf GEÇİCİ
 *     bir "henüz değil" durumunu kalıcı zamanla anlatıyordu): T-023/S6'nın
 *     `audit_log`/`platform_audit_log`'dan `UPDATE, DELETE, TRUNCATE`
 *     yetkisini çekmesi UYGULANDI (bkz. `sql/bootstrap-roles.sql` §9) — bu
 *     iki prob (`audit-log.probe.ts`) bu sınıfı `mutationRejection:
 *     'privilege-denied'` olarak BEYAN eder; diğer altı prob
 *     `'record-not-found'`de kalır (davranışları DEĞİŞMEDİ).
 *
 * ⚠⚠ ZORUNLU (opsiyonel DEĞİL) — F-NEW-4 (architect): alan opsiyonel
 * olsaydı, S6'nın DDL'si uygulandığında `audit_log`/`platform_audit_log`
 * probu sessizce eski (`'record-not-found'`) varsayımda KALIR ve senaryo
 * 3/4 YANLIŞ SEBEPLE kırmızı verir — hata "neden" kırıldığını ANLATMAZ.
 * Zorunlu alan bu sınıfı derleme zamanında KAPATIR: yeni bir prob veya bu
 * alanı SİLİNEN bir prob `tsc`'yi kırar, sessiz drift OLUŞAMAZ.
 */
export type MutationRejectionKind = 'record-not-found' | 'privilege-denied'

/**
 * Bir tenant'a bağlı tablonun süitin ihtiyaç duyduğu minimum CRUD yüzeyi.
 * Tablo'ya özel bilgi (model adı, zorunlu kolonlar, FK bağımlılıkları) BU
 * ARAYÜZÜN ARKASINDA kalır — süitin kendisi bunları BİLMEZ.
 */
export type TenantScopedProbe = {
  /** `src/tenancy.ts` → `TENANT_SCOPED_TABLES` ile BİREBİR eşleşen tablo adı. */
  readonly tableName: string
  /**
   * Senaryo 3/4'ün UPDATE/DELETE reddinin BEKLENEN sınıfı — yukarıdaki
   * `MutationRejectionKind` dosya başı yorumuna bak. ⚠⚠ ZORUNLU alan.
   */
  readonly mutationRejection: MutationRejectionKind
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
  /**
   * Context içinde verilen id'deki satırı güncellemeyi DENER; probun beyan
   * ettiği `mutationRejection`e göre `'record-not-found'` (Prisma P2025) veya
   * `'privilege-denied'` (P2039) fırlatır (DÜZELTME, FIX turu 2 — bu yorum
   * eskiden KOŞULSUZ "P2025" diyordu).
   */
  readonly updateRowById: (tx: TransactionClient, rowId: string) => Promise<void>
  /** Aynı davranış `updateRowById` ile — bkz. yukarıdaki yorum. */
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
 * Prisma 7 driver-adapter'ının bir Postgres sürücü hatasının `meta` gövdesinde
 * taşıdığı `driverAdapterError.cause.originalCode` alanını Zod ile doğrular.
 *
 * ⚠ `meta` BİLİNMEYEN veriden gelir (Prisma'nın kendi `meta: Record<string,
 * unknown>` sözleşmesi) — bu yüzden runtime doğrulaması olmadan daraltma
 * YAPILMAZ (CLAUDE.md §4: dış veri Zod ile parse edilir, `as` yasak).
 * Bilinmeyen/beklenmeyen şekil → `safeParse` başarısız → aşağıdaki
 * `isPrivilegeDeniedError` **fail-closed** `false` döner (gerçek bir hatayı
 * sessizce maskelemez).
 */
const driverAdapterErrorMetaSchema = z.object({
  driverAdapterError: z.object({
    cause: z.object({
      originalCode: z.string(),
    }),
  }),
})

/** Postgres'in "yetersiz yetki" SQLSTATE'i. */
const POSTGRES_INSUFFICIENT_PRIVILEGE_SQLSTATE = '42501'

/**
 * Hatanın Postgres'in yetki reddi (`42501`, "permission denied") kodundan
 * kaynaklanıp kaynaklanmadığını daraltır.
 *
 * ⚠⚠ ORKESTRATÖR DÜZELTMESİ (T-023/S5) — NEDEN İKİ KOŞUL BİRDEN GEREKİR:
 * `node_modules/@prisma/client/runtime/client.js` (sürüm 7.10.1) STATİK
 * OLARAK okundu ve ÖLÇÜLDÜ: driver-adapter hata eşleyicisi (`Cp`), bir
 * sürücü hatasının `cause.kind`'ini biliniyorsa (`UniqueConstraintViolation`
 * → P2002, `ForeignKeyConstraintViolation`/`RestrictViolation` → P2003,
 * `NullConstraintViolation` → P2011, vb.) ÖZEL bir Prisma koduna çevirir;
 * `cause.kind` yalnızca `'postgres'|'mysql'|'sqlite'|'mssql'` (yani sürücü
 * hatayı KENDİSİ sınıflandıramadı) olduğunda `Cp` `undefined` döner ve
 * çağıran (`Be`) bunu **P2039** ("Database error") GENEL ÇÖP KUTUSUNA
 * düşürür. ⇒ **P2039 yetki reddine ÖZGÜ DEĞİLDİR** — sözdizimi hatası,
 * `relation does not exist`, deadlock, serileştirme hatası gibi
 * SINIFLANDIRILAMAYAN her Postgres hatası da AYNI kodu taşır.
 * ⇒ `error.code === 'P2039'` **TEK BAŞINA** yetersizdir: yalnızca ona
 * dayanmak her sınıflandırılamayan veritabanı hatasını "yetki reddi" sayar
 * ve gerçek bir hatayı MASKELER. Bu yüzden ikinci koşul — sürücünün ham
 * `originalCode`'unun Postgres'in yetki reddi SQLSTATE'i (`42501`) OLMASI —
 * ZORUNLUDUR; bu, S1'in canlı ölçümünde (`audit-log.probe.ts`'in `update`
 * çağrısı `REVOKE` sonrası) gözlenen GERÇEK hata gövdesiyle BİREBİR eşleşir.
 */
// FIX turu 1 (M2, `solid` [medium] bulgusu): `export` EKLENDİ —
// `platform-tables.isolation.test.ts` bu fonksiyonu (+ yukarıdaki
// `driverAdapterErrorMetaSchema`/`POSTGRES_INSUFFICIENT_PRIVILEGE_SQLSTATE`)
// BAYT DÜZEYİNDE KOPYALAMIŞTI — "dosya listesi dışında, DOKUNMA" eskiden bir
// SÜREÇ kısıtıydı (S6'nın alt görev sınırı), bir TASARIM kararı DEĞİLDİ. İki
// kopya AYNI sebeple (Prisma driver-adapter hata şekli) değişir; tek kaynak
// burada.
export function isPrivilegeDeniedError(error: unknown): boolean {
  if (!(typeof error === 'object' && error !== null && 'code' in error)) {
    return false
  }
  if (error.code !== 'P2039') {
    return false
  }
  if (!('meta' in error)) {
    return false
  }
  const parsedMeta = driverAdapterErrorMetaSchema.safeParse(error.meta)
  if (!parsedMeta.success) {
    return false
  }
  return (
    parsedMeta.data.driverAdapterError.cause.originalCode ===
    POSTGRES_INSUFFICIENT_PRIVILEGE_SQLSTATE
  )
}

/**
 * `MutationRejectionKind`'ı ilgili doğrulayıcıya yönlendirir.
 *
 * Discriminated union + exhaustive `switch` (CLAUDE.md §4) — yeni bir
 * `MutationRejectionKind` üyesi eklenip burada ele alınmazsa `assertNever`
 * dalı `tsc`'yi KIRAR (boolean bayrak yığını yerine).
 */
function isExpectedMutationRejection(error: unknown, expected: MutationRejectionKind): boolean {
  switch (expected) {
    case 'record-not-found':
      return isRecordNotFoundError(error)
    case 'privilege-denied':
      return isPrivilegeDeniedError(error)
    default:
      return assertNever(expected, 'tenant-isolation-suite.ts: MutationRejectionKind')
  }
}

/**
 * Paket-yerel `assertNever` — `packages/db`'nin bugün bir kopyası YOK ve bu
 * dosya `AGENT_BASELINE.md`'nin dosya listesi DIŞINDAKİ bir yardımcı paket
 * eklemeye İZİNLİ DEĞİL; `packages/versioning/src/range.ts:204`'ün aynı
 * paket-yerel desenini TEKRARLAR (`@arkesoft/errors`'a bağımlılık gerektirmez).
 */
function assertNever(value: never, context: string): never {
  throw new Error(`beklenmeyen değer (${context}): ${JSON.stringify(value)}`)
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

        it("senaryo 3: A context'inde B'nin satır id'siyle UPDATE/DELETE probun beyan ettiği ret sınıfını üretir", async () => {
          const updateError = await captureError(() =>
            withTenant(options.client, tenantAId, (tx) => probe.updateRowById(tx, rowIdInB)),
          )
          expect(isExpectedMutationRejection(updateError, probe.mutationRejection)).toBe(true)

          const deleteError = await captureError(() =>
            withTenant(options.client, tenantAId, (tx) => probe.deleteRowById(tx, rowIdInB)),
          )
          expect(isExpectedMutationRejection(deleteError, probe.mutationRejection)).toBe(true)

          // DÜZELTME (FIX turu 2, `solid` tur 2 [low] — "RLS tarafından
          // filtrelendi" iddiası `mutationRejection: 'privilege-denied'`
          // probları için YANLIŞ SEBEP verirdi: o sınıfta istek RLS'e HİÇ
          // ULAŞMAZ, `42501` ile daha ÖNCE reddedilir): satır HER İKİ sınıfta
          // da GERÇEKTEN silinmedi (RLS filtresi veya yetki reddi, probun
          // beyan ettiği `mutationRejection`'a bağlı) — sonraki senaryolar
          // (4, 5) aynı satırı güvenle yeniden kullanabilir.
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

          const foreignRowMatchesExpectation = isExpectedMutationRejection(
            foreignRowError,
            probe.mutationRejection,
          )
          const nonExistentRowMatchesExpectation = isExpectedMutationRejection(
            nonExistentRowError,
            probe.mutationRejection,
          )

          // İDDİA (A-E5) BURADA PİNLENİR — tutmazsa bu `expect` GÜRÜLTÜLÜ kırmızı
          // verir; testi gevşetmek YASAK (§10.6). ⚠ T-023/S5: iddia artık
          // mutlak `isRecordNotFoundError` DEĞİL, probun beyan ettiği
          // `mutationRejection` sınıfı — varlık/yetki oracle'ı HER İKİ sınıf
          // için de KAPALI kalır (hem RLS'in "bulunamadı" hem `REVOKE`'un
          // "yetki reddi" yolu, var olan yabancı satırla var olmayan satırı
          // AYNI şekilde ele alır).
          expect({ foreignRowMatchesExpectation, nonExistentRowMatchesExpectation }).toEqual({
            foreignRowMatchesExpectation: true,
            nonExistentRowMatchesExpectation: true,
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

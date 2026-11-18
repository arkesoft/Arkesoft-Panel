// @arkesoft/db — `platform_admin`/`platform_audit_log` PLATFORM SEVİYESİ
// kanıtı (ROADMAP v0.0.20, T-021/S3, architect VERİ MODELİ + ADR-0023 Karar
// 1/3).
//
// Bu dosya `createTenantIsolationSuite()`'in çağrı noktası DEĞİLDİR — iki
// yeni tablo `TENANT_SCOPED_TABLES`'A EKLENMEDİ (architect "Tenant
// izolasyonu" madde 11 istisnası): yeni bir kiracı tablosu yok, bu yüzden
// `tenant-membership.isolation.test.ts`'e YENİ bir prob EKLENMEZ (po R-P1'in
// "tek çağrı noktası" kuralı burada İHLAL EDİLMEZ, çünkü koşul hiç
// doğmuyor). Bu dosya `version-registry-state.isolation.test.ts`/
// `auth-role-guard.isolation.test.ts` emsali: tek bir OLGUYU doğrulayan,
// BAĞIMSIZ, basit bir `*.isolation.test.ts` dosyası.
//
// CANLI VERİTABANI GEREKTİRİR — `*.isolation.test.ts` deseni
// (`vitest.isolation.config.ts`), `pnpm test` hattında KOŞMAZ (V4).
//
// ÜÇ İDDİA:
//   1. Taksonomi — iki tablo `PLATFORM_LEVEL_TABLES` içinde, `TENANT_SCOPED_
//      TABLES` YEDİDE kaldı (DoD'un 3. maddesinin canlı/mekanik kanıtı).
//   2. POZİTİF — `platform_admin`/`platform_audit_log` satırları tenant GUC'U
//      HİÇ KURULMADAN (yani `withTenant()` DIŞINDA, ham `testAppPrisma` ile)
//      yazılabilir VE okunabilir. Bu RLS'in YOKLUĞUNUN canlı kanıtıdır —
//      ADR-0023 Karar 1/3'ün "yeni veritabanı rolü/GUC/RLS politikası YOK"
//      iddiasının ampirik karşılığı.
//   3. KARŞIT KANIT (RLS'in CANLI kanıtı, aynı dosyada, aynı istemciyle) —
//      kiracıya bağlı `subscription` tablosu AYNI ham istemciyle (context
//      KURULMADAN) okunduğunda SESSİZCE SIFIR satır döner (hata FIRLATMAZ).
//      Bu, 2. maddenin "platform seviyesi olduğu için" davranışının
//      KEYFİ olmadığını, FORCE RLS'in gerçekten çalıştığını kanıtlar — iki
//      tablo sınıfı arasındaki fark TESADÜF değil, mekanizma farkıdır.
//
// GÜNCELLEME (ROADMAP v0.0.20.2, T-023/S6, architect F-NEW-2): `sql/
// bootstrap-roles.sql`'in §9'u `arkesoft_app`'ten `platform_audit_log`
// tablosunda `UPDATE, DELETE, TRUNCATE` yetkisini çektiği için bu dosyanın
// `platform_audit_log` probunun temizliği artık `testAppPrisma` İLE
// ÇALIŞAMAZ (42501 — "permission denied"). Düzeltme: temizlik
// `testMigrationPrisma` (tabloların sahibi, bu REVOKE'tan ETKİLENMEZ) ile
// yapılır VE bu kırılma "app rolü SİLEMİYOR" POZİTİF bir assert'e çevrilir
// (aşağıdaki dördüncü `it`) — kırılmayı sessizce atlamak yerine KANITA
// dönüştürüyoruz.
//
// FIX turu 1 (M2, `solid` [medium] bulgusu): `isPrivilegeDeniedError`
// (+ `driverAdapterErrorMetaSchema`/`POSTGRES_INSUFFICIENT_PRIVILEGE_
// SQLSTATE`) ARTIK BURADA YENİDEN BİLDİRİLMİYOR — `tenant-isolation-
// suite.ts`'ten `export`landı ve İTHAL EDİLİYOR. Eski gerekçe ("o dosya bu
// alt görevin dosya listesi dışında — DOKUNMA") bir SÜREÇ kısıtıydı, TASARIM
// kararı DEĞİLDİ — iki kopya AYNI sebeple değişir (Prisma driver-adapter hata
// şekli, T-023/S5'te BİR KEZ ölçülmüş).

import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { PlatformAuditAction, UserStatus } from '../index.js'
import { PLATFORM_LEVEL_TABLES, TENANT_SCOPED_TABLES } from '../tenancy.js'
import { isPrivilegeDeniedError } from './helpers/tenant-isolation-suite.js'
import { testAppPrisma, testMigrationPrisma } from './helpers/test-client.js'

describe('platform_admin / platform_audit_log — PLATFORM SEVİYESİ kanıtı (ADR-0023 Karar 1/3)', () => {
  it('taksonomi: iki yeni tablo PLATFORM_LEVEL_TABLES içinde (12), TENANT_SCOPED_TABLES YEDİDE kaldı', () => {
    expect(PLATFORM_LEVEL_TABLES).toContain('platform_admin')
    expect(PLATFORM_LEVEL_TABLES).toContain('platform_audit_log')
    expect(PLATFORM_LEVEL_TABLES.length).toBe(12)
    // ⭐ Bu satır DoD'un 3. maddesinin (prob kapısı kırılmadı) canlı kanıtıdır.
    expect(TENANT_SCOPED_TABLES.length).toBe(7)
    expect(TENANT_SCOPED_TABLES).not.toContain('platform_admin')
    expect(TENANT_SCOPED_TABLES).not.toContain('platform_audit_log')
  })

  it("platform_admin satırı tenant GUC'u HİÇ KURULMADAN yazılabilir ve okunabilir", async () => {
    const user = await testAppPrisma.user.create({
      data: {
        email: `platform-admin-probe-${randomUUID()}@arkesoft.test`,
        name: 'Platform Admin Probu',
        status: UserStatus.active,
      },
    })

    try {
      // ⚠⚠ `withTenant()` BİLEREK KULLANILMAZ — tenant context HİÇ KURULMAZ.
      // İddia tam olarak bu satırın GUC'suz erişilebilir olduğudur (platform
      // seviyesi tablo, RLS politikası taşımaz).
      const admin = await testAppPrisma.platformAdmin.create({
        data: { userId: user.id },
      })

      const found = await testAppPrisma.platformAdmin.findUnique({
        where: { id: admin.id },
      })
      expect(found?.userId).toBe(user.id)
    } finally {
      // `user_id` → `app_user`'a `ON DELETE CASCADE` FK (architect VERİ
      // MODELİ): kullanıcıyı silmek platform_admin satırını da düşürür —
      // probun tek temizlik adımı budur.
      await testAppPrisma.user.delete({ where: { id: user.id } })
    }
  })

  it("platform_audit_log satırı tenant GUC'u HİÇ KURULMADAN yazılabilir ve okunabilir, detail.tenantIds TAŞIYABİLİR", async () => {
    const entry = await testAppPrisma.platformAuditLog.create({
      data: {
        actorUserId: `probe-actor-${randomUUID()}`,
        action: PlatformAuditAction.tenant_impersonation_started,
        subject: 'tenant_list',
        // ADR-0023 Karar 3: denetim birimi ERİŞİM OPERASYONU'dur, kiracı
        // değil — `detail.tenantIds` erişilen kiracı kümesinin TAMAMINI
        // adlandırır (bu probda gerçek bir kiracıya BAĞLANMAZ, yalnızca
        // kolonun biçimini sınar).
        detail: { tenantIds: ['probe-tenant-a', 'probe-tenant-b'] },
      },
    })

    try {
      const found = await testAppPrisma.platformAuditLog.findUnique({
        where: { id: entry.id },
      })
      expect(found?.action).toBe(PlatformAuditAction.tenant_impersonation_started)
      expect(found?.subject).toBe('tenant_list')
    } finally {
      // F-NEW-2 (architect): `arkesoft_app` bu tabloda DELETE taşımıyor
      // (`sql/bootstrap-roles.sql` §9) — temizlik tabloların SAHİBİ
      // (`testMigrationPrisma`) ile yapılır, bu REVOKE'tan ETKİLENMEZ.
      await testMigrationPrisma.platformAuditLog.delete({ where: { id: entry.id } })
    }
  })

  it("F-NEW-2 POZİTİF: arkesoft_app platform_audit_log'u SİLEMİYOR (REVOKE DELETE'in canlı kanıtı)", async () => {
    const entry = await testAppPrisma.platformAuditLog.create({
      data: {
        actorUserId: `probe-actor-${randomUUID()}`,
        action: PlatformAuditAction.tenant_impersonation_started,
        subject: 'tenant_list',
        detail: { tenantIds: ['probe-tenant-a'] },
      },
    })

    try {
      let caughtError: unknown
      try {
        await testAppPrisma.platformAuditLog.delete({ where: { id: entry.id } })
      } catch (error) {
        caughtError = error
      }

      expect(
        caughtError,
        'arkesoft_app ile platformAuditLog.delete HATA FIRLATMADI — §9 REVOKE DELETE etkisiz mi?',
      ).toBeDefined()
      expect(isPrivilegeDeniedError(caughtError)).toBe(true)

      // Satır GERÇEKTEN silinmedi — delete reddedildi, "bulunamadı" DEĞİL.
      const stillExists = await testMigrationPrisma.platformAuditLog.findUnique({
        where: { id: entry.id },
      })
      expect(stillExists?.id).toBe(entry.id)
    } finally {
      await testMigrationPrisma.platformAuditLog.delete({ where: { id: entry.id } })
    }
  })

  it("KARŞIT KANIT — aynı ham istemciyle kiracıya bağlı subscription context'siz okunduğunda SESSİZCE SIFIR satır döner (RLS canlı kanıtı)", async () => {
    // `withTenant()` DIŞINDA, context KURULMADAN doğrudan `testAppPrisma` ile
    // okunur — FORCE RLS altındaki `subscription` context'siz HİÇBİR satırı
    // GÖSTERMEZ (hata FIRLATMAZ, sessizce boş döner). Demo seed en az bir
    // `subscription` satırı yazdığı için (`DEMO_SEED`), bu [] sonucu
    // "veri yok" değil "RLS filtreledi" anlamına gelir — yukarıdaki iki
    // testin "platform seviyesi olduğu için GUC'suz görünür" iddiasının
    // TESADÜF olmadığını, gerçek bir mekanizma farkına dayandığını kanıtlar.
    const rows = await testAppPrisma.subscription.findMany({ take: 1 })
    expect(rows).toEqual([])
  })
})

// @arkesoft/api — ImpersonationService (ROADMAP v0.0.20, T-021/S7, ADR-0023
// Karar 1/3)
//
// ⚠⚠ BU DOSYA `apps/api/src/platform/**`'İN VERİ KATMANINA DOKUNAN TEK
// DOSYASIDIR. Diğer her dosya (iki port adaptörü, IP guard) DI'dan YALNIZCA
// bu servisi alır — `PrismaService` BAŞKA HİÇBİR YERDE enjekte EDİLMEZ
// (mekanik kapı: `platform-impersonation-write-gate.test.ts`, `-r` ile
// tarar). Kayıtsız (denetimsiz) kiracı erişimi bu yüzden bu modülde
// YAZILAMAZ — tenant verisine giden TEK yol {@link ImpersonationService.runImpersonated}'dır.
//
// `audit-log.writer.ts`'in (kiracı denetim kaydı) iki ayaklı desenini
// ÇOĞALTIR (ADR-0023 §3, birebir):
//   (1) YAPISAL — {@link ImpersonationService.runImpersonated}'ın imzası
//       denetim girdisini ({@link PlatformAuditEntry}) ZORUNLU BİRİNCİ
//       parametre alır ⇒ kayıtsız erişim DERLENMEZ.
//   (2) MEKANİK KAPI — bu yöntemin `apps/api/src/platform/**` içindeki
//       ÇAĞRI YERİ TAM BİR'dir (`platform-read.port.adapter.ts`), ikinci
//       bir çağrı yeri eklenirse `platform-impersonation-write-gate.test.ts`
//       KIRMIZI olur.
//
// ⭐ DENETİM BİRİMİ = ERİŞİM OPERASYONU, kiracı DEĞİL: bir `runImpersonated()`
// çağrısı TAM BİR `platform_audit_log` satırı yazar; satırın `detail.
// tenantIds`'i erişilen kiracı kümesinin TAMAMINI adlandırır, ardından HER
// kiracı için AYRI `withTenant()` açılır (po R-A2'nin "kiracı başına kayıt
// DEĞİL" uyarısı).
//
// ⚠⚠ AC-7 BAĞLAYICI (R-A2) — {@link resolvePlanNames} `plan.name`'i
// `runImpersonated()`'ın ÜRETTİĞİ `planId` kümesi üzerinden okur: `plan`
// kolonunun okuma yolu bu yöntemden GEÇER. `plan`'ı GUC'suz okumaya
// düşürmek veya tenantList'ten çıkarmak impersonation'ın TEK tüketicisini
// düşürür (ADR-0023 §3 "doğan kırılganlık" + gözden geçirme koşulu 5).
//
// ⚠ R-PO4 KARARI (S7) — `platform.session` HİÇBİR audit satırı YAZMAZ (saf
// okuma, `readPlatformSession` ASLA fırlamaz VE ASLA yazmaz). `platform_
// admin_signed_in` satırı {@link ensureSignInRecorded} ile, bir session'ın
// `platformAdminProcedure` kapısından GEÇTİĞİ İLK anda, SÜREÇ-İÇİ (process-
// local) bir `sessionId` kümesiyle İDEMPOTENT olarak yazılır — TanStack
// Query'nin `platform.session`'ı ne sıklıkla poll'ladığından TAMAMEN
// BAĞIMSIZ (o uç hiç yazmadığı için), AYNI session'ın tekrarlanan
// `tenantList`/`auditLog` çağrıları da TEKRAR yazdırmaz. ⚠ Kabul edilen
// bedel (yazılı): süreç yeniden başlarsa veya birden fazla API örneği
// varsa AYNI session için EN FAZLA bir EK satır yazılabilir — şemaya
// (`platform_audit_log`'a bir `sessionId` kolonu) dokunmadan ulaşılabilecek
// en güçlü garanti budur; TAM kalıcı idempotency v0.15.0'ın (impersonation
// kontrolleri) kapsamına not düşülür.

import { Inject, Injectable } from '@nestjs/common'
import type { PlatformAuditAction, TenantStatus, TenantTransactionClient } from '@arkesoft/db'

import { PlatformAdminRequiredError } from '../errors/domain/platform-admin-required.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  PLATFORM_AUDIT_DETAIL_SCHEMA_BY_ACTION,
  PLATFORM_AUDIT_USER_AGENT_MAX_LENGTH,
} from './platform-audit-detail.schemas.js'
import type { PlatformAuditEntry } from './platform-audit-entry.types.js'

/** `platform.session`/`platformAdminProcedure`'ün TEK veri kaynağının dönüş şekli. */
export type PlatformAdminLookup = {
  readonly isPlatformAdmin: boolean
  readonly twoFactorEnabled: boolean
}

/** `platform.tenantList`'in platform seviyesi (GUC'suz) üç kolonu — `plan` BAĞI HARİÇ. */
export type PlatformTenantBasicRow = {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly status: TenantStatus
  readonly createdAt: Date
}

/** `platform.auditLog`'un platform seviyesi (GUC'suz) satırı. */
export type PlatformAuditLogRow = {
  readonly id: string
  readonly actorUserId: string
  readonly action: PlatformAuditAction
  readonly subject: string
  readonly createdAt: Date
}

/** Yazma kapısının kabul ettiği TEK giriş şekli — `writeAuditLog`'un (kiracı denetimi) AYNI deseni. */
type PlatformAuditRowInput = {
  readonly actorUserId: string
  readonly action: PlatformAuditAction
  readonly subject: string
  readonly detail: Record<string, unknown>
  readonly ip: string | null
  readonly userAgent: string | null
}

@Injectable()
export class ImpersonationService {
  /**
   * R-PO4 idempotency deposu — süreç-içi, kalıcı DEĞİL (yukarıdaki dosya
   * başı yorumunun "kabul edilen bedel"i). `Set<sessionId>` seçildi:
   * `WeakMap`/TTL GEREKMEZ — süreç ömrü boyunca büyümesi platformun
   * gerçek, eşzamanlı platform-yöneticisi oturum sayısıyla sınırlıdır
   * (binlerce değil, onlarca).
   */
  readonly #recordedSignInSessionIds = new Set<string>()

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * `platformAdminProcedure`'ün İLK adımının TEK veri kaynağı — TOTAL
   * (`membershipRead.requireRole`'ün AYNI deseni, ADR-0009 madde 3):
   * `platform_admin` kaydı YOKSA BU YÖNTEM `PlatformAdminRequiredError`
   * FIRLATIR, "yönetici değil" bir dönüş değeri olarak İFADE EDİLEMEZ.
   */
  async requirePlatformAdmin(userId: string): Promise<{ readonly twoFactorEnabled: boolean }> {
    const admin = await this.prisma.platform.platformAdmin.findUnique({
      where: { userId },
      select: { id: true },
    })

    if (admin === null) {
      throw new PlatformAdminRequiredError(userId)
    }

    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    })

    return { twoFactorEnabled: user?.twoFactorEnabled === true }
  }

  /**
   * `platform.session`'ın TEK veri kaynağı — ASLA FIRLAMAZ, ASLA YAZMAZ
   * (dosya başı R-PO4 kararı). Platform yöneticisi OLMAYAN veya 2FA'sı
   * OLMAYAN bir aktör için de başarıyla çözülür.
   */
  async readPlatformSession(userId: string): Promise<PlatformAdminLookup> {
    const admin = await this.prisma.platform.platformAdmin.findUnique({
      where: { userId },
      select: { id: true },
    })
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    })

    return {
      isPlatformAdmin: admin !== null,
      twoFactorEnabled: user?.twoFactorEnabled === true,
    }
  }

  /**
   * `platform_admin_signed_in` satırını, verilen `sessionId` için SÜREÇ
   * ömründe TAM BİR KEZ yazar (R-PO4 idempotency deposu). İkinci çağrı
   * SESSİZCE no-op'tur — bu bir hata YUTMA DEĞİLDİR, beklenen tekrar-
   * çağrı davranışıdır (aynı session'ın ikinci `tenantList`/`auditLog`
   * isteği).
   */
  async ensureSignInRecorded(
    entry: PlatformAuditEntry & { readonly sessionId: string },
  ): Promise<void> {
    if (this.#recordedSignInSessionIds.has(entry.sessionId)) {
      return
    }

    // FIX turu 1, madde M1 (solid, `medium`) — `add()` ÖNCEDEN
    // `writeAuditRow()`'u `await` ETMEDEN ÖNCE çağrılıyordu: `platform_
    // admin_signed_in` yazması ÜÇÜNCÜ bir (geçici) hatayla BAŞARISIZ
    // olursa `sessionId` yine de kümeye EKLENMİŞ oluyordu ⇒
    // süreç ömrü boyunca bu session için `platform_admin_signed_in`
    // satırı BİR DAHA YAZILAMIYORDU (AC-8'in "öncesi+2" değişmezini
    // `+1`'e düşüren senaryo — handoff'un ölçtüğü vaka). Düzeltme: `add()`
    // ARTIK yazma BAŞARIYLA tamamlandıktan SONRA çalışır — yazma FIRLARSA
    // kümeye HİÇ GİRMEZ, bir SONRAKİ çağrı (kullanıcının yenilemesi)
    // TEKRAR DENER. ⚠ Kabul edilen bedel: aynı session'dan EŞZAMANLI iki
    // istek gelirse (ikisi de `has()`'i `false` görüp `writeAuditRow`'a
    // girer) İKİ satır yazılabilir — bu, dosya başı R-PO4 yorumunun ZATEN
    // yazılı kabul ettiği "süreç restart/çoklu instance'ta en fazla bir ek
    // satır" bedeliyle AYNI SINIFTIR (idempotency'nin GARANTİ ETTİĞİ şey
    // "asla ikinci satır yok" DEĞİL, "başarılı bir yazmadan SONRA tekrar
    // DENENMEZ"tir); kalıcı, DB tabanlı (`sessionId` kolonlu) idempotency
    // v0.15.0'ın kapsamına not düşülür (dosya başı yorumu, AYNI bedel).
    await this.writeAuditRow({
      actorUserId: entry.actorUserId,
      action: 'platform_admin_signed_in',
      subject: entry.actorUserId,
      detail: {},
      ip: entry.ip,
      userAgent: entry.userAgent,
    })

    this.#recordedSignInSessionIds.add(entry.sessionId)
  }

  /** `platform.tenantList`'in platform seviyesi (GUC'suz) ÜÇ kolonu — AC-7'nin sırası deterministik (`createdAt desc, id desc`). */
  async listTenantsBasic(limit: number): Promise<readonly PlatformTenantBasicRow[]> {
    return this.prisma.db.tenant.findMany({
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, slug: true, name: true, status: true, createdAt: true },
    })
  }

  /** `platform.auditLog`'un TEK veri kaynağı — impersonation GEREKTİRMEZ (platform seviyesi tablo). */
  async listAuditEntries(limit: number): Promise<readonly PlatformAuditLogRow[]> {
    return this.prisma.platform.platformAuditLog.findMany({
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, actorUserId: true, action: true, subject: true, createdAt: true },
    })
  }

  /**
   * ⚠⚠ ADR-0023 §3 Karar 3'ün YAPISAL AYAĞI — birinci parametre ZORUNLUDUR.
   * BİR çağrı TAM BİR `tenant_impersonation_started` satırı yazar
   * (`detail.tenantIds` = `tenantIds`'in TAMAMI), ARDINDAN her kiracı için
   * AYRI `withTenant()` açar. Satır sayısı = çağrı sayısı (kiracı sayısı
   * DEĞİL) — AC-9(3)'ün ölçtüğü iddia.
   */
  async runImpersonated<T>(
    entry: PlatformAuditEntry,
    tenantIds: readonly string[],
    read: (tx: TenantTransactionClient, tenantId: string) => Promise<T>,
  ): Promise<ReadonlyMap<string, T>> {
    await this.writeAuditRow({
      actorUserId: entry.actorUserId,
      action: 'tenant_impersonation_started',
      subject: [...tenantIds].sort().join(','),
      detail: { tenantIds: [...tenantIds] },
      ip: entry.ip,
      userAgent: entry.userAgent,
    })

    const results = new Map<string, T>()

    // Sıralı yürütme BİLİNÇLİ: her kiracı AYRI bir `withTenant()`
    // transaction'ı açar; döngünün İÇİNDE İKİNCİ bir yazma YOKTUR (tek
    // yazma zaten yukarıda, döngüden ÖNCE oldu) — AC-9(3)'ün "N çağrı = N
    // satır" ölçümü bu yüzden paralelleştirmeden bağımsızdır. Sıra R-A5'in
    // sayfa boyutu üst sınırıyla (≤50) zaten dar bir maliyete oturur.
    for (const tenantId of tenantIds) {
      const value = await this.prisma.withTenant(tenantId, (tx) => read(tx, tenantId))
      results.set(tenantId, value)
    }

    return results
  }

  /** `tenantList`'in `plan` BAĞININ platform seviyesi (GUC'suz) ikinci yarısı — AC-7 R-A2. */
  async resolvePlanNames(planIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (planIds.length === 0) {
      return new Map()
    }

    const uniquePlanIds = [...new Set(planIds)]
    const plans = await this.prisma.platform.plan.findMany({
      where: { id: { in: uniquePlanIds } },
      select: { id: true, name: true },
    })

    return new Map(plans.map((plan) => [plan.id, plan.name]))
  }

  /**
   * Denetim kaydı satırı yazar — `writeAuditLog`'un (kiracı denetimi) AYNI
   * iki garantisi: `detail` eylemin şemasından GEÇİRİLİR (`parse`,
   * `safeParse` DEĞİL) ve `userAgent` KAPIDA kırpılır (sınır çağıranda
   * DEĞİL). Bu platform tablosu RLS TAŞIMAZ (`PLATFORM_LEVEL_TABLES`
   * üyesi) — `withTenant()` İÇİNDE çağrılmaz, `.platform` (GUC'suz)
   * üzerinden gider.
   */
  private async writeAuditRow(row: PlatformAuditRowInput): Promise<void> {
    const schema = PLATFORM_AUDIT_DETAIL_SCHEMA_BY_ACTION[row.action]
    const detail = schema.parse(row.detail)

    await this.prisma.platform.platformAuditLog.create({
      data: {
        actorUserId: row.actorUserId,
        action: row.action,
        subject: row.subject,
        detail,
        ip: row.ip,
        userAgent: row.userAgent?.slice(0, PLATFORM_AUDIT_USER_AGENT_MAX_LENGTH) ?? null,
      },
    })
  }
}

// @arkesoft/api — kiracı güvenlik politikası yazma iş mantığı (ROADMAP
// v0.0.15, T-016/S7, architect md 2 — owner 2FA zorunluluğu, ADR-0018)
//
// `MemberService`'in (T-014/S4) AYNI üç bağlayıcı değişmezi — bkz. o dosyanın
// başı — burada da geçerlidir. ⚠⚠ TEK FARK: `Tenant` PLATFORM SEVİYESİ bir
// tablodur (`tenant_id` TAŞIMAZ, KENDİSİ kiracıdır — `tenancy.ts`'in
// `PLATFORM_LEVEL_TABLES`'ı) ve RLS'İ YOKTUR; veri katmanının kiracı-kapsamlı
// istemci allowlist'i (`TenantTransactionClient`) bu yüzden `tenant`
// delegesini TAŞIMAZ (`packages/db/src/client.ts:261-264` — yalnızca
// `tenantMembership`/`job`/`auditLog`/`tenantInvitation`).
//
// ⚠⚠ BU YÜZDEN "AYNI TRANSACTION" GARANTİSİ KISMİDİR — AÇIKÇA YAZILI RİSK:
// `tenant` satırının yazması (`this.prisma.db.tenant.update`, platform
// seviyesi, RLS YOK) ve denetim kaydının yazması (`withTenant()`, kiracı
// kapsamlı) AYRI İKİ Postgres transaction'ıdır — `TenantTransactionClient`
// `tenant` delegesini taşımadığı için ikisini TEK `$transaction`'a
// SIĞDIRMAK bu sürümde DERLENMEZ (`packages/db` bu alt görevin DOKUNMA
// YASAĞI listesinde; gerçek çözüm o pakete `tenant` eklemek olurdu, ADR-0018
// gözden geçirme koşuluna NOT düşüldü). Sıra BİLEREK şu şekildedir: önce
// GERÇEK durum değişikliği (`tenant.update`), SONRA denetim kaydı — ikisi
// arasında bir çökme "politika değişti ama denetim izi yok" üretir (kabul
// edilebilir, SESSİZCE YANLIŞ bir denetim izinden daha iyi); TERS sıra
// "hiç gerçekleşmemiş bir değişikliğin" denetim izini üretebilirdi.

import { Inject, Injectable } from '@nestjs/common'
import type { TenantSecurityPolicy, TenantSecurityPolicyUpdateInput } from '@arkesoft/trpc'

import { writeAuditLog } from '../audit/audit-log.writer.js'
import { TenantNotFoundError } from '../errors/domain/tenant-not-found.error.js'
import { TwoFactorSetupRequiredError } from '../errors/domain/two-factor-setup-required.error.js'
import { getRequestContext } from '../request-context/request-context.accessors.js'
import { PrismaService } from '../prisma/prisma.service.js'

/** `tenant_security_policy_changed` denetim kaydının `diff` alanı — boolean'ın dize karşılığı. */
type SecurityPolicyBooleanWire = 'true' | 'false'

function toBooleanWire(value: boolean): SecurityPolicyBooleanWire {
  return value ? 'true' : 'false'
}

@Injectable()
export class TenantSecurityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Kiracının owner 2FA zorunluluğu ayarını günceller.
   *
   * ⚠⚠ SIRA BAĞLAYICI (bkz. dosya başı yorumu): [platform seviyesi okuma →
   * idempotent no-op kısayolu → kendini kilitlememe (a) kontrolü → `tenant`
   * yazması → denetim kaydı]. Son iki adım AYRI transaction'dır.
   *
   * ⚠⚠ KENDİNİ KİLİTLEMEME, AYAK (a): zorunluluğu KAPALIDAN AÇIĞA çeviren
   * çağıran KENDİSİ 2FA kurmuş olmalı, aksi halde {@link TwoFactorSetupRequiredError}
   * (409) FIRLAR. YALNIZCA ÇAĞIRAN denetlenir — kiracının BAŞKA owner'ları
   * SORGULANMAZ (o sorgu başka kullanıcıların güvenlik durumunu SIZDIRIR).
   */
  async updateSecurityPolicy(
    tenantId: string,
    actorUserId: string,
    input: TenantSecurityPolicyUpdateInput,
  ): Promise<TenantSecurityPolicy> {
    const desired = input.requireTwoFactorForOwner

    // ⚠ PLATFORM SEVİYESİ OKUMA — ham istemci, gerekçe yorumu zorunlu
    // (CLAUDE.md §3): `tenant` KİRACIYA BAĞLI değil, KİRACININ KENDİSİDİR ve
    // RLS'i yoktur (`tenant-read.port.adapter.ts`'in BİREBİR aynı deseni).
    const tenant = await this.prisma.db.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { requireTwoFactorForOwner: true },
    })

    if (tenant === null) {
      throw new TenantNotFoundError()
    }

    if (tenant.requireTwoFactorForOwner === desired) {
      // İDEMPOTENT NO-OP (`MemberService.updateRole`'ün "zaten o rolde"
      // emsali): durum zaten istenen hâlde — yazma YOK, denetim kaydı YOK,
      // kendini kilitlememe kontrolü de bu yüzden GEREKMEZ (hiçbir şey
      // değişmiyor).
      return { requireTwoFactorForOwner: desired }
    }

    if (desired) {
      await this.assertActorHasTwoFactorEnabled(actorUserId)
    }

    const client = getRequestContext().client
    const from = toBooleanWire(tenant.requireTwoFactorForOwner)
    const to = toBooleanWire(desired)

    await this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: { requireTwoFactorForOwner: desired },
    })

    await this.prisma.withTenant(tenantId, (tx) =>
      writeAuditLog(tx, {
        tenantId,
        action: 'tenant_security_policy_changed',
        actorUserId,
        ip: client.ip,
        userAgent: client.userAgent,
        diff: { from, to },
      }),
    )

    // ⚠ Loglanan tek şey boolean sonuç. PII/sır YOK; `tenantId` child
    // logger'a ZATEN bağlı (ikinci kez geçirilmez, `MemberService`'in AYNI
    // deseni).
    getRequestContext().logger.info(
      { requireTwoFactorForOwner: desired },
      'kiracı güvenlik politikası güncellendi',
    )

    return { requireTwoFactorForOwner: desired }
  }

  /**
   * Çağıranın KENDİ 2FA durumunu okur ve kurulu değilse reddeder.
   *
   * ⚠ PLATFORM SEVİYESİ OKUMA (`MemberService.invite`'ın AYNI deseni):
   * `app_user` kiracıya bağlı DEĞİLDİR. ⚠ Satır bulunamazsa (teorik —
   * oturum geçerliyken hesabın silinmiş olması) KORUMACI davranılır: kurulu
   * SAYILMAZ, reddedilir.
   */
  private async assertActorHasTwoFactorEnabled(actorUserId: string): Promise<void> {
    const actor = await this.prisma.db.user.findUnique({
      where: { id: actorUserId },
      select: { twoFactorEnabled: true },
    })

    if (actor?.twoFactorEnabled !== true) {
      throw new TwoFactorSetupRequiredError()
    }
  }
}

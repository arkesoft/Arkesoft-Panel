// @arkesoft/api — MembershipReadPort adaptörü (ROADMAP v0.0.14, T-014/S4,
// architect K-A5)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/membership-read.port.ts`),
// burada UYGULANIR. `permissionProcedure`'ün rol okuduğu TEK yol budur.
//
// ⚠⚠ PORT TOTAL'DIR VE BU İKİNCİ BİR SAVUNMA HATTIDIR (ADR-0009 madde 3 +
// architect K-A5 gerekçe 3): üyelik satırı yoksa bu adaptör, HTTP yolundaki
// kimlik/üyelik muhafızının fırlattığı hatanın AYNISINI fırlatır. "Üye değil"
// ifade edilebilecek bir dönüş değeri YOKTUR (`null` yok, `Result` birleşimi
// yok) → çağıran o ayrımı YAZAMAZ. HTTP yolunda muhafız üyeliği zaten
// doğrulamıştır; HTTP-DIŞI bir çağıran (ileride bir worker) o katmanı
// atlarsa izin katmanı TEK BAŞINA durdurur — ADR-0012'nin "kiracı iki
// katmanda zorlanır" deseninin YETKİ karşılığı.
//
// ⚠⚠ VARLIK ORACLE'I YAPISAL OLARAK KAPALI (CLAUDE.md §7 md 12): sorgu
// YALNIZCA `withTenant(tenantId)` içinde koşar; RLS politikası yüklemi her
// sorguya kiracı eşitliğini EKLER → "hiç üyelik yok" ile "üyelik BAŞKA
// kiracının" veritabanı seviyesinde AYIRT EDİLEMEZ, ikisi de SIFIR satır
// döner. Bu dosyada kiracıyı satırla KARŞILAŞTIRAN bir yüklem ve bir `if`
// YOKTUR — tek `throw` noktası `??` operatörünün sağ tarafındadır
// (`job-read.port.adapter.ts`'in birebir aynı deseni).
//
// ⚠ ROL ÖNBELLEKLENMEZ ve bu AÇIKÇA KABUL EDİLMİŞ BİR MALİYETTİR (architect
// K-A5): oturum kiracı taşımıyor (bağlayıcı v0.0.5 kararı) → rol oturumda
// önbelleklenemez. Reddedilen optimizasyon: muhafızın okumasını istek
// bağlamında paylaşmak → rol için istek içinde İKİ doğruluk kaynağı VE
// muhafızın bir yazıcıya dönüşmesi. v0.0.17 ölçümle yeniden değerlendirir.
//
// ⚠ `perf` İKAMESİ, ÖLÇÜM 1'İN `apps/api` YARISI: bu adaptör izinli bir
// çağrıda TAM BİR KEZ çağrılır (sözleşme katmanı bunu kendi süitinde ölçtü);
// muhafızın okumasıyla birlikte istek başına toplam İKİ nokta-okuması olur,
// ÜÇÜNCÜ bir okuma YOKTUR. Bu dosyada tek bir sorgu vardır — iddianın yapısal
// yarısı budur.

import { Inject, Injectable } from '@nestjs/common'
import type { TenantRoleWire } from '@arkesoft/trpc'
import type { MembershipReadPort } from '@arkesoft/trpc/server'

import { TenantMembershipRequiredError } from '../../errors/domain/tenant-membership-required.error.js'
import { PrismaService } from '../../prisma/prisma.service.js'

/**
 * Portun TOTAL dalının TEK `throw` noktası. `never` döndüğü için `??` sağ
 * tarafında ifade olarak kullanılabilir; bu, bir `if` bloğu açmadan
 * fırlatmayı sağlar ve "ayrım yazılamaz" garantisini SÖZDİZİMSEL olarak da
 * korur.
 */
function raiseMembershipRequired(userId: string, tenantId: string): never {
  throw new TenantMembershipRequiredError(userId, tenantId)
}

@Injectable()
export class MembershipReadPortAdapter implements MembershipReadPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  requireRole(tenantId: string, userId: string): Promise<TenantRoleWire> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // `select` yalnızca rolü okur — üyelik satırının başka hiçbir kolonu
      // (kimlik, zaman damgaları) elimize ALINMAZ.
      const membership = await tx.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        select: { role: true },
      })

      // ⚠ Veri katmanının rol sözlüğü ile tel sözlüğü arasında bir EŞLEME
      // TABLOSU YAZILMAZ: ikisi yapısal olarak aynı dize birleşimidir ve
      // sapmamaları `__tests__/type-pins/trpc-wire-contract.pin.ts` PİN 8 ile
      // derleme zamanında zorlanır (AC4).
      return (membership ?? raiseMembershipRequired(userId, tenantId)).role
    })
  }
}

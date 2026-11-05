// @arkesoft/api — MemberWritePort adaptörü (ROADMAP v0.0.14, T-014/S4,
// architect K-A9)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/member-write.port.ts`), burada
// UYGULANIR. ⚠ PLATFORMUN İLK YAZMA PORTUNUN ADAPTÖRÜ.
//
// ⚠⚠ BU DOSYA İŞ MANTIĞI TAŞIMAZ VE BU BİLİNÇLİDİR. Dört metot da tek bir
// delegasyondur; "zaten üye mi", "bekleyen davet üst sınırı", "yeniden
// gönderme bekleme süresi", INV-OWNER karşılaştır-ve-değiştir'i, denetim
// kaydı ve e-posta gönderimi `member/member.service.ts`'te yaşar. Gerekçe:
// adaptör bir SINIR nesnesidir — sözleşme katmanının port arayüzünü uygulama
// katmanının servisine bağlar. İş kuralını buraya koymak onu tRPC'ye
// bağlardı; servis bugün HTTP-dışı bir çağırandan (ileride bir kuyruk işi)
// da çağrılabilir durumda kalıyor.
//
// ⚠ `ip`/`userAgent` BU İMZALARDA YOKTUR (port sözleşmesinin yazılı kararı)
// ve bu adaptör onları OKUMAZ DA: istemci alanlarını istek bağlamından okuyan
// yer servistir (architect K-A2). Buraya koymak her metodu iki parametre
// daha taşımaya zorlardı.
//
// ⚠ PORT TOTAL'DIR (ADR-0009 madde 3): başarısızlık `AppError` ile bildirilir,
// dönüş tipi bir `Result` birleşimi veya `null` DEĞİLDİR. Bu dosyada bir
// `try`/`catch` YOKTUR — hata dönüştürmesi (ör. benzersizlik ihlali →
// domain hatası) servisin içinde, yazmanın gerçekleştiği yerde yapılır.

import { Inject, Injectable } from '@nestjs/common'
import type {
  MemberAcceptInvitationInput,
  MemberInvitation,
  MemberInvitationAccepted,
  MemberInviteInput,
  MemberRemoveInput,
  MemberRemoved,
  MemberRole,
  MemberUpdateRoleInput,
} from '@arkesoft/trpc'
import type { MemberWritePort } from '@arkesoft/trpc/server'

import { MemberService } from '../../member/member.service.js'

@Injectable()
export class MemberWritePortAdapter implements MemberWritePort {
  constructor(@Inject(MemberService) private readonly members: MemberService) {}

  invite(
    tenantId: string,
    actorUserId: string,
    input: MemberInviteInput,
  ): Promise<MemberInvitation> {
    return this.members.invite(tenantId, actorUserId, input)
  }

  /**
   * ⚠ İMZADA `tenantId` YOKTUR ve BU KASITLIDIR (ADR-0016 madde 6, YETENEK
   * tabanlı DAR istisna): kabul eden kişi TANIM GEREĞİ henüz üye değildir, bu
   * yüzden kiracı bağlamını host'tan ALAMAZ. Kiracı kimliği YALNIZCA davet
   * belirtecinden türetilir ve o türetme servisin içindedir — bu adaptör bir
   * kiracı kimliği GÖRMEZ, dolayısıyla yanlış bir kiracıya GEÇİREMEZ.
   */
  acceptInvitation(
    userId: string,
    input: MemberAcceptInvitationInput,
  ): Promise<MemberInvitationAccepted> {
    return this.members.acceptInvitation(userId, input)
  }

  updateRole(
    tenantId: string,
    actorUserId: string,
    input: MemberUpdateRoleInput,
  ): Promise<MemberRole> {
    return this.members.updateRole(tenantId, actorUserId, input)
  }

  remove(tenantId: string, actorUserId: string, input: MemberRemoveInput): Promise<MemberRemoved> {
    return this.members.remove(tenantId, actorUserId, input)
  }
}

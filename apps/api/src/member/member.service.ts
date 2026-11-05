// @arkesoft/api — üyelik yazma iş mantığı (ROADMAP v0.0.14, T-014/S4,
// architect K-A9/K-A11/K-A12, ADR-0016)
//
// ⚠⚠ PLATFORMUN İLK YAZMA İŞ MANTIĞI. Sözleşme katmanındaki dört mutation'ın
// resolver'ları TEK İFADEDİR (ADR-0009 madde 4) — "zaten üye mi", "bekleyen
// davet üst sınırı", "yeniden gönderme bekleme süresi", INV-OWNER, "yükselme
// yasağı", denetim kaydı ve e-posta gönderimi: HEPSİ BURADA.
//
// ÜÇ BAĞLAYICI DEĞİŞMEZ:
//
// 1. ⚠⚠ KİRACI KAPSAMI. Üyelik/davet/denetim yazmalarının TAMAMI
//    `withTenant()` içinde koşar ve bu bir tercih DEĞİL, bir DERLEME
//    KISITIDIR: veri katmanının kiracı-SIZ istemci allowlist'i davet ve
//    denetim delegelerini TAŞIMAZ (architect K-A3) → o tablolara kiracı
//    bağlamı dışında dokunmak DERLENMEZ.
//    ⚠ Sorgular `where: { tenantId }` yüklemini TEKRARLAMAZ — RLS politikası
//    onu zaten EKLİYOR; yazmak ikinci bir doğruluk kaynağı olurdu. İSTİSNA:
//    Prisma'nın bileşik benzersizlik ARAMALARI (`tenantId_userId` vb.) ve
//    INSERT'in `tenant_id` kolonu — ikisi de kolonu DEĞER olarak ister,
//    yüklem olarak değil; doğrulayıcıları politikanın `USING`/`WITH CHECK`
//    yarılarıdır.
//
// 2. ⚠⚠ VARLIK ORACLE'I KAPALI (CLAUDE.md §7 md 12). Hedef üyelik bu
//    kiracıda yoksa VEYA başka bir kiracıya aitse sorgu kiracı bağlamında
//    koştuğu için İKİ DURUMDA DA sıfır satır döner — ayrım bu dosyada
//    YAZILAMAZ. Kabul akışında ise YEDİ ayrı başarısızlık modu TEK hata
//    sınıfına indirgenir (ADR-0016 madde 6 koşul D).
//
// 3. ⚠⚠ LOG HİJYENİ (CLAUDE.md §4). Bu dosyadaki hiçbir log çağrısı
//    E-POSTA, HAM BELİRTEÇ, İSTEMCİ IP'Sİ, İSTEMCİ TANITICISI veya denetim
//    farkı TAŞIMAZ. İstemci alanları yalnızca denetim kaydı yazma kapısına
//    geçer (`audit/audit-log.writer.ts`, logger'ı HİÇ import etmez); e-posta
//    hiçbir yere. Loglanan tek kimlikler opak cuid'lerdir ve `tenantId`
//    isteğin child logger'ına ZATEN bağlıdır (ikinci kez geçirilmez).

import { Inject, Injectable } from '@nestjs/common'
import { isUniqueConstraintError } from '@arkesoft/db'
import type { TenantTransactionClient } from '@arkesoft/db'
import type {
  MemberAcceptInvitationInput,
  MemberInvitation,
  MemberInvitationAccepted,
  MemberInviteInput,
  MemberRemoveInput,
  MemberRemoved,
  MemberRole,
  MemberUpdateRoleInput,
  TenantRoleWire,
} from '@arkesoft/trpc'

import { writeAuditLog } from '../audit/audit-log.writer.js'
import { MAIL_TRANSPORT } from '../auth/mail/mail-transport.types.js'
import type { MailTransport } from '../auth/mail/mail-transport.types.js'
import { renderMailMessage } from '../auth/mail/messages.js'
import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import { AlreadyMemberError } from '../errors/domain/already-member.error.js'
import { InvitationInvalidError } from '../errors/domain/invitation-invalid.error.js'
import { InvitationResendTooSoonError } from '../errors/domain/invitation-resend-too-soon.error.js'
import { OwnerMembershipProtectedError } from '../errors/domain/owner-membership-protected.error.js'
import { PendingInvitationLimitReachedError } from '../errors/domain/pending-invitation-limit-reached.error.js'
import { TenantMembershipRequiredError } from '../errors/domain/tenant-membership-required.error.js'
import { getRequestContext } from '../request-context/request-context.accessors.js'
import type { RequestClientContext } from '../request-context/request-context.types.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { issueInvitationToken, parseInvitationToken } from './invitation-token.js'
import { normalizeMemberEmail } from './member-email.js'
import {
  INVITATION_ACCEPT_PATH,
  INVITATION_RESEND_COOLDOWN_MS,
  INVITATION_TTL_MS,
  PENDING_INVITATION_LIMIT,
} from './member.constants.js'

/** Sahiplik devrinde mevcut sahibin indirildiği rol — devir TEK adımda olmaz. */
const OWNER_SUCCESSOR_ROLE = 'admin' satisfies TenantRoleWire

/** `owner` rolünün literal karşılığı; kapalı sözlüğe karşı derleme zamanında denetlenir. */
const OWNER_ROLE = 'owner' satisfies TenantRoleWire

/**
 * Girdiden gelen kullanıcı kimliğinin KARAKTER SINIFI.
 *
 * ⚠⚠ BU DESEN BİR GÜVENLİK KAPISIDIR, bir biçim süsü değil (ROADMAP v0.0.14,
 * T-014 düzeltme turu 1 — `security` medium #2'nin İKİNCİ erişim yolu).
 * ÖLÇÜLDÜ: `updateRole`/`remove`'un `userId` girdisine bir NUL baytı (U+0000)
 * koymak, değeri Prisma'nın bileşik benzersizlik aramasına bağlı parametre
 * olarak taşıyordu ve PostgreSQL onu `22021 invalid byte sequence for
 * encoding "UTF8": 0x00` ile REDDEDİYORDU → `AppError` DEĞİL, jenerik bir
 * HTTP 500 + istek başına bir `error` seviyeli HAM kayıt (log şişirme).
 * Oturum sahibi olan herkes bunu tek istekle üretebiliyordu.
 *
 * ⚠ SINIF ÖLÇÜLEREK SEÇİLDİ, VARSAYILMADI: geliştirme veritabanındaki 21 063
 * hesabın TAMAMI `^[A-Za-z0-9]+$` ile eşleşiyor (kimlik sağlayıcısının
 * ürettiği 32 karakterlik karışık-kıvrımlı kimlikler + veri katmanının
 * ürettiği 24 karakterlik küçük harfli kimlikler). Desen bilinçli olarak bir
 * ÜST KÜME (`-`/`_` dahil): tek işi, hiçbir kimlik üreticisinden ÇIKAMAYACAK
 * baytları (NUL, boşluk, kontrol karakterleri) veri katmanına ULAŞMADAN
 * kesmektir — kimlik üreticisinin biçimini PİNLEMEK değil.
 */
const USER_ID_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * Hedef üyelik bu kiracıda bulunamadığında fırlatılır.
 *
 * ⚠ MEVCUT hata sınıfı YENİDEN KULLANILIR, yedinci bir sınıf İCAT EDİLMEZ:
 * anlamı birebir aynıdır ("bu kimlik bu kiracının üyesi değil") ve tek farkı
 * ÖZNESİDİR (aktör yerine hedef). Varlık oracle'ı açılmaz — sorgu kiracı
 * bağlamında koştuğu için "hiç yok" ile "başka kiracının" AYNI yanıtı verir.
 *
 * ⚠ ÖZNE AÇIKÇA `'target'` GEÇİRİLİR (T-014 düzeltme turu 1, `security`
 * medium #1'in zorunlu ikinci yarısı): hedefin kimliği hata bağlamında
 * `targetUserId` alanına yazılır, `userId`'ye DEĞİL. İstek child logger'ı
 * `userId`'yi AKTÖRE bağlıyor; hedefi aynı anahtara koymak hata sınırı
 * loglamaya başladığı an denetim izini aktöre YANLIŞ ATFEDERDİ.
 *
 * `never` döndüğü için `??` sağ tarafında ifade olarak kullanılabilir; bu,
 * bir `if` bloğu açmadan fırlatmayı sağlar.
 */
function raiseMemberNotInTenant(userId: string, tenantId: string): never {
  throw new TenantMembershipRequiredError(userId, tenantId, 'target')
}

/**
 * Girdiden gelen hedef kimliğini {@link USER_ID_PATTERN}'e karşı doğrular ve
 * sapmayı "bu kimlik bu kiracının üyesi değil" reddinin AYNISINA indirger.
 *
 * ⚠⚠ AYNI HATAYA İNDİRGEME BİLİNÇLİ: biçimsel olarak imkânsız bir kimlik,
 * tanım gereği hiçbir üyelik satırına karşılık GELEMEZ — ayrı bir hata sınıfı
 * üretmek "böyle bir kimlik biçimi var/yok" ayrımını tele taşır ve yeni bir
 * ayırt edilebilirlik kanalı açardı (CLAUDE.md §7 madde 12 ile aynı sınıf
 * gerekçe).
 *
 * ⚠⚠ DÜZELTME ÇAĞIRAN TARAFTADIR, VERİ KATMANINDA DEĞİL: kiracı kapsamlı
 * istemcinin boşluk kapısını sertleştirmek DEĞERLENDİRİLDİ ve REDDEDİLDİ
 * (ADR-0003 madde 1 — o kapı veri katmanının sözleşmesidir, uygulama
 * girdisinin doğrulayıcısı değil; sertleştirmek girdi doğrulamasını yanlış
 * katmana taşırdı ve o dosyanın diff'i BOŞ kalmak zorundadır).
 */
function assertUserIdShape(userId: string, tenantId: string): void {
  if (!USER_ID_PATTERN.test(userId)) {
    raiseMemberNotInTenant(userId, tenantId)
  }
}

@Injectable()
export class MemberService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /**
   * Kiracıya üye davet eder.
   *
   * ⚠⚠ SIRA BAĞLAYICI (architect K-A9): Zod (sözleşme katmanı, `owner`
   * YAPISAL olarak reddedilir) → tek transaction içinde [zaten üye mi ·
   * bekleyen davet üst sınırı · yeniden gönderme bekleme süresi · davet
   * satırı · denetim kaydı] → **COMMIT** → e-posta.
   *
   * ⚠⚠ E-POSTA NEDEN COMMIT'TEN SONRA VE TRANSACTION DIŞINDA — iki bağımsız
   * gerekçe:
   *   (a) SMTP çağrısı transaction İÇİNDE yapılsaydı veritabanı bağlantısı
   *       bir AĞ GECİKMESİ boyunca tutulurdu (havuz tüketimi, kilit süresi).
   *   (b) ⚠ TERS SIRA (gönder → commit) ÖLÜ BELİRTEÇ üretirdi: commit
   *       başarısız olursa alıcının elinde hiçbir satıra karşılık GELMEYEN
   *       bir bağlantı kalırdı. Bu sırada ise gönderim başarısız olursa
   *       davet DURUR, hata `isRetryable: true` ile yukarı gider ve tekrar
   *       davet aynı satırı tazeleyerek (idempotent) kurtarır.
   */
  async invite(
    tenantId: string,
    actorUserId: string,
    input: MemberInviteInput,
  ): Promise<MemberInvitation> {
    const email = normalizeMemberEmail(input.email)
    const client = readClientContext()
    const issued = issueInvitationToken(tenantId)
    const now = Date.now()
    const expiresAt = new Date(now + INVITATION_TTL_MS)

    // ⚠ PLATFORM SEVİYESİ OKUMA — ham istemci, gerekçe yorumu zorunlu
    // (CLAUDE.md §3): kullanıcı tablosu `tenant_id` TAŞIMAZ (bir hesap birden
    // fazla kiracıya üye olabilir) → `withTenant()` o tablo için YOKTUR ve
    // gerekmez. Okuma SIFIR kiracı verisi döndürür: yalnızca "bu adrese ait
    // bir hesap var mı" sorusunun cevabı, `select` ile tek alana daraltılmış.
    // ÜYELİK kontrolü aşağıda, kiracı bağlamı İÇİNDE yapılır.
    //
    // ⚠ BÜYÜK/KÜÇÜK HARF DUYARSIZ ARAMA bilinçli: normalizasyon DAVET
    // tablosunun sözleşmesidir, kullanıcı tablosunun DEĞİL (oradaki adresler
    // kimlik sağlayıcısının yazdığı biçimde durur). Duyarlı arasaydık
    // `A@x.com` ile kayıtlı bir üyeye `a@x.com` daveti gönderilebilirdi.
    const invitedUser = await this.prisma.db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    })

    const invitation = await this.prisma.withTenant(tenantId, async (tx) => {
      await assertNotAlreadyMember(tx, tenantId, invitedUser?.id)

      const existing = await tx.tenantInvitation.findUnique({
        where: { tenantId_email: { tenantId, email } },
        select: { updatedAt: true },
      })

      await assertPendingInvitationCapacity(tx, existing === null, now)
      assertResendCooldownElapsed(existing?.updatedAt, now)

      // Tekrar davet AYNI satırı tazeler (yeni belirteç + yeni son kullanma):
      // önceki belirteç böylece GEÇERSİZLEŞİR (özeti üzerine yazıldı) ve
      // bekleyen davet sayısı ARTMAZ. `(tenant_id, email)` benzersizliği bu
      // davranışın taşıyıcısıdır — normalize edilmiş adres olmadan DELİNİR.
      const row = await tx.tenantInvitation.upsert({
        where: { tenantId_email: { tenantId, email } },
        create: {
          tenantId,
          email,
          role: input.role,
          tokenHash: issued.tokenHash,
          invitedByUserId: actorUserId,
          expiresAt,
        },
        update: {
          role: input.role,
          tokenHash: issued.tokenHash,
          invitedByUserId: actorUserId,
          expiresAt,
        },
        select: { id: true, expiresAt: true },
      })

      await writeAuditLog(tx, {
        tenantId,
        action: 'member_invited',
        actorUserId,
        invitationId: row.id,
        ip: client.ip,
        userAgent: client.userAgent,
        // ⚠ E-POSTA BURAYA GİRMEZ (veri modelinin yazılı kararı): beklemedeki
        // adres davet satırında yaşar, denetim kaydında DEĞİL.
        diff: { role: input.role },
      })

      return row
    })

    // --- COMMIT GERÇEKLEŞTİ. Bu satırdan sonrası transaction DIŞINDADIR.
    await this.sendInvitationMail(email, issued.token)

    // ⚠ Loglanan tek şey opak davet kimliği. E-posta, belirteç, istemci
    // alanları ve rol YOK; `tenantId` child logger'a zaten bağlı.
    getRequestContext().logger.info({ invitationId: invitation.id }, 'üye daveti gönderildi')

    return {
      invitationId: invitation.id,
      expiresAt: invitation.expiresAt.toISOString(),
    }
  }

  /**
   * Davet belirtecini kabul eder ve üyeliği yaratır.
   *
   * ⚠⚠ ADR-0016 MADDE 6'NIN DÖRT KOŞULU BU METODUN GÖVDESİNDE KARŞILANIR:
   *   A. Tek dayanak 256 bit entropili, diskte yalnızca ÖZETİ saklanan,
   *      süresi DOLAN, TEK KULLANIMLIK bir belirteçtir (satır kabul anında
   *      SİLİNİR → ikinci kullanım aynı tek hatayı alır).
   *   B. Belirteçten türeyen kiracı bağlamı TEK bir `withTenant()` bloğunda
   *      kullanılır ve o blokta BAŞKA kiracı verisi OKUNMAZ — bloktaki üç
   *      işlem yalnızca bu davetin satırına, yeni üyeliğe ve denetim kaydına
   *      dokunur. ⚠ Oturum sahibinin e-postası bloğun DIŞINDA ve PLATFORM
   *      seviyesinde okunur; kiracı verisi değildir.
   *   C. Çıktı kiracıya ait HİÇBİR alan taşımaz (tek `accepted` alanı) ve bu
   *      metot çağıranına kiracı kimliğini DÖNDÜRMEZ.
   *   D. YEDİ başarısızlık modunun TAMAMI tek hata sınıfına indirgenir.
   *      ⚠ Sayı T-014 düzeltme turu 1'de ALTI'dan YEDİ'ye çıktı: kiracı
   *      yarısında kimlik karakter sınıfı dışı bayt (NUL dahil) YEDİNCİ
   *      moddu ve o tarihe kadar 404 değil ham bir 500 üretiyordu
   *      (`security` medium #2). Kanonik liste `invitation-invalid.error.ts`'te.
   *
   * ⚠ `emailVerified` ŞART KOŞULMAZ (A-A3): belirtecin elde edilmiş olması
   * posta kutusu kontrolünü ZATEN kanıtlıyor. Şart koşmak, doğrulama
   * ekranı bu sürümde olmadığı için UI'sız bir çıkmaz sokak üretirdi.
   */
  async acceptInvitation(
    userId: string,
    input: MemberAcceptInvitationInput,
  ): Promise<MemberInvitationAccepted> {
    const parsed = parseInvitationToken(input.token)
    const client = readClientContext()

    // ⚠ PLATFORM SEVİYESİ OKUMA — ham istemci, gerekçe yorumu zorunlu
    // (CLAUDE.md §3): oturum sahibinin KENDİ e-postası. Kullanıcı tablosu
    // kiracıya bağlı değildir; ayrıca bu okuma bilinçli olarak kiracı
    // bloğunun DIŞINDADIR (ADR-0016 madde 6 koşul B: blok içinde başka veri
    // okunmaz). Hesap yoksa — oturum geçerliyken teorik, ama satır silinmiş
    // olabilir — kabul akışının TEK hatası döner.
    const actor = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })

    const actorEmail = normalizeMemberEmail(actor?.email ?? raiseInvitationInvalid())

    await this.prisma.withTenant(parsed.tenantId, async (tx) => {
      const invitation = await tx.tenantInvitation.findUnique({
        where: {
          tenantId_tokenHash: { tenantId: parsed.tenantId, tokenHash: parsed.tokenHash },
        },
        select: { id: true, email: true, role: true, expiresAt: true },
      })

      // ⚠ ÜÇ RET TEK İFADEDE ve AYNI hatayı üretir: satır yok · süresi geçmiş
      // · oturum e-postası davet adresiyle eşleşmiyor. Ayrı dallara bölmek
      // koşul D'yi delerdi — "davet var ama senin değil" ile "davet yok"
      // arasındaki fark, belirteci bir varlık oracle'ına çevirirdi.
      const accepted =
        invitation !== null &&
        invitation.expiresAt.getTime() > Date.now() &&
        normalizeMemberEmail(invitation.email) === actorEmail
          ? invitation
          : raiseInvitationInvalid()

      await createMembershipForInvitation(tx, {
        tenantId: parsed.tenantId,
        userId,
        role: accepted.role,
      })

      // Belirteç TEK KULLANIMLIK: satır silinir, ikinci kabul denemesi
      // yukarıdaki "satır yok" dalına düşer.
      await tx.tenantInvitation.delete({ where: { id: accepted.id } })

      await writeAuditLog(tx, {
        tenantId: parsed.tenantId,
        action: 'member_invitation_accepted',
        actorUserId: userId,
        userId,
        ip: client.ip,
        userAgent: client.userAgent,
        diff: { role: accepted.role, invitationId: accepted.id },
      })
    })

    // ⚠ Kiracı kimliği LOGLANMAZ: bu isteğin child logger'ında `tenantId`
    // YOKTUR (uç kiracı bağlamından muaf) ve belirteçten türeyen, henüz hiçbir
    // üyelikle doğrulanmamış bir kimliği log satırına yazmak onu "doğrulanmış"
    // gibi gösterirdi.
    getRequestContext().logger.info('üyelik daveti kabul edildi')

    return { accepted: true }
  }

  /**
   * Bir üyenin rolünü değiştirir. ⚠ SAHİPLİK DEVRİ DE BU YOLDAN GEÇER
   * (`role: 'owner'`) — ayrı bir devir prosedürü YOKTUR (architect K-A11).
   *
   * ⚠⚠ INV-OWNER: HER KİRACININ TAM OLARAK BİR `owner`'I VAR. "En az bir"
   * yerine "tam bir" seçilmesinin gerekçesi MEKANİKTİR: "en az bir" klasik
   * write-skew'e açıktır (iki eşzamanlı çıkarma, her biri "diğeri var" görür)
   * ve kapatmak satır kilidi için ham SQL isterdi — o yüzey kiracı kapsamlı
   * istemciden BİLEREK dışarıda. "Tam bir"de her devir TEK owner satırını
   * GÜNCELLEMEK zorundadır → satır kilidi işi SERİLEŞTİRİR.
   */
  async updateRole(
    tenantId: string,
    actorUserId: string,
    input: MemberUpdateRoleInput,
  ): Promise<MemberRole> {
    // ⚠ TRANSACTION AÇILMADAN ÖNCE: biçimsel olarak imkânsız bir kimlik için
    // bir veritabanı transaction'ı açmak gereksiz yük ve (NUL baytında) ham
    // bir 500 üretirdi (T-014 düzeltme turu 1, `security` medium #2).
    assertUserIdShape(input.userId, tenantId)

    const client = readClientContext()

    const role = await this.prisma.withTenant(tenantId, async (tx) => {
      const target = await tx.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId: input.userId } },
        select: { role: true },
      })

      const currentRole: TenantRoleWire = (target ?? raiseMemberNotInTenant(input.userId, tenantId))
        .role

      if (currentRole === input.role) {
        // İDEMPOTENT NO-OP: durum zaten istenen hâlde. Denetim kaydı
        // YAZILMAZ — `from === to` olan bir satır denetim izini gürültüyle
        // doldurur ve hiçbir yetki değişikliğini anlatmaz.
        return currentRole
      }

      if (input.role === OWNER_ROLE) {
        await this.transferOwnership(tx, {
          tenantId,
          actorUserId,
          targetUserId: input.userId,
          targetCurrentRole: currentRole,
          client,
        })

        return input.role
      }

      if (currentRole === OWNER_ROLE) {
        // Sahibi başka bir role indirmek kiracıyı SAHİPSİZ bırakırdı.
        // Doğru yol: önce devir (`role: 'owner'` ile yeni sahibi atamak),
        // devir mevcut sahibi zaten indirir.
        throw new OwnerMembershipProtectedError('demote_owner')
      }

      await tx.tenantMembership.update({
        where: { tenantId_userId: { tenantId, userId: input.userId } },
        data: { role: input.role },
      })

      await writeAuditLog(tx, {
        tenantId,
        action: 'member_role_changed',
        actorUserId,
        userId: input.userId,
        ip: client.ip,
        userAgent: client.userAgent,
        diff: { from: currentRole, to: input.role },
      })

      return input.role
    })

    getRequestContext().logger.info({ memberUserId: input.userId }, 'üye rolü güncellendi')

    return { userId: input.userId, role }
  }

  /**
   * Bir üyeyi kiracıdan çıkarır.
   *
   * ⚠ `owner` üyeliği ÇIKARILAMAZ (INV-OWNER) — bu, kiracıyı sahipsiz
   * bırakacak İKİNCİ yoldur ve `updateRole`'ün indirgeme yasağıyla aynı
   * değişmezi korur. Bir `admin`'in başka bir `admin`'i veya KENDİNİ
   * çıkarması SERBESTTİR: sahip her zaman yerinde durur.
   */
  async remove(
    tenantId: string,
    actorUserId: string,
    input: MemberRemoveInput,
  ): Promise<MemberRemoved> {
    // ⚠ TRANSACTION AÇILMADAN ÖNCE — `updateRole`'ün aynı gerekçesi
    // (T-014 düzeltme turu 1, `security` medium #2).
    assertUserIdShape(input.userId, tenantId)

    const client = readClientContext()

    await this.prisma.withTenant(tenantId, async (tx) => {
      const target = await tx.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId: input.userId } },
        select: { role: true },
      })

      const currentRole: TenantRoleWire = (target ?? raiseMemberNotInTenant(input.userId, tenantId))
        .role

      if (currentRole === OWNER_ROLE) {
        throw new OwnerMembershipProtectedError('remove_owner')
      }

      await tx.tenantMembership.delete({
        where: { tenantId_userId: { tenantId, userId: input.userId } },
      })

      await writeAuditLog(tx, {
        tenantId,
        action: 'member_removed',
        actorUserId,
        userId: input.userId,
        ip: client.ip,
        userAgent: client.userAgent,
        diff: { role: currentRole },
      })
    })

    getRequestContext().logger.info({ memberUserId: input.userId }, 'üye kiracıdan çıkarıldı')

    return { userId: input.userId }
  }

  /**
   * SAHİPLİK DEVRİ — INV-OWNER'ın KARŞILAŞTIR-VE-DEĞİŞTİR (CAS) zorlaması.
   *
   * ⚠⚠ BİRİNCİ ADIM BİR OKUMA DEĞİL, KOŞULLU BİR YAZMADIR ve mekanizmanın
   * tamamı budur: `role: 'owner'` yüklemi `where`'in İÇİNDEDİR, yani
   * veritabanı satırı AYNI ifadede hem kontrol eder hem günceller. Etkilenen
   * satır sayısı SIFIR ise iki olgudan biri gerçekleşmiştir — aktör zaten
   * sahip değildi, VEYA eşzamanlı bir devir yarışı kaybedildi (ilk
   * transaction satırı kilitledi ve rolü değiştirdi; ikincisi kilidi
   * bekledikten sonra yüklemi artık sağlamayan bir satır gördü). İki olgu da
   * AYNI reddi hak eder.
   *
   * ⚠ Bu yüzden ek bir kilit mekanizması (`SELECT … FOR UPDATE`) GEREKMEZ:
   * her devir TEK owner satırını güncellemek zorunda olduğu için satır
   * kilidi işi doğal olarak serileştirir. Ham SQL yüzeyi kiracı kapsamlı
   * istemcide zaten YOKTUR.
   *
   * ⚠ İKİ denetim satırı TEK transaction'da yazılır — devrin "iki adımı"
   * budur: eski sahibin indirilmesi ve yenisinin yükseltilmesi ayrı
   * olgulardır ve denetim izi ikisini de göstermek zorundadır.
   */
  private async transferOwnership(
    tx: TenantTransactionClient,
    params: {
      readonly tenantId: string
      readonly actorUserId: string
      readonly targetUserId: string
      readonly targetCurrentRole: TenantRoleWire
      readonly client: RequestClientContext
    },
  ): Promise<void> {
    const demoted = await tx.tenantMembership.updateMany({
      where: { tenantId: params.tenantId, userId: params.actorUserId, role: OWNER_ROLE },
      data: { role: OWNER_SUCCESSOR_ROLE },
    })

    if (demoted.count === 0) {
      throw new OwnerMembershipProtectedError('transfer_without_ownership')
    }

    await tx.tenantMembership.update({
      where: { tenantId_userId: { tenantId: params.tenantId, userId: params.targetUserId } },
      data: { role: OWNER_ROLE },
    })

    await writeAuditLog(tx, {
      tenantId: params.tenantId,
      action: 'member_role_changed',
      actorUserId: params.actorUserId,
      userId: params.actorUserId,
      ip: params.client.ip,
      userAgent: params.client.userAgent,
      diff: { from: OWNER_ROLE, to: OWNER_SUCCESSOR_ROLE },
    })

    await writeAuditLog(tx, {
      tenantId: params.tenantId,
      action: 'member_role_changed',
      actorUserId: params.actorUserId,
      userId: params.targetUserId,
      ip: params.client.ip,
      userAgent: params.client.userAgent,
      diff: { from: params.targetCurrentRole, to: OWNER_ROLE },
    })
  }

  /**
   * Davet e-postasını gönderir. ⚠ Metin KODDA SABİT YAZILMAZ (CLAUDE.md §4/
   * §10 md 17) — bir MESAJ ANAHTARI ile katalogdan istenir. Katalog bugün
   * `apps/api` içindedir çünkü i18n paketi henüz YOK (v0.0.18); çağıran
   * imzası o geçişte DEĞİŞMEYECEK biçimde seçildi.
   *
   * Başarısızlık YUTULMAZ: taşıyıcı `isRetryable: true` taşıyan bir
   * `AppError` fırlatır ve bu metot onu AYNEN yukarı iletir.
   */
  private async sendInvitationMail(recipient: string, token: string): Promise<void> {
    const url = `${this.env.AUTH_BASE_URL}${INVITATION_ACCEPT_PATH}#token=${encodeURIComponent(token)}`
    const content = renderMailMessage('tenant.memberInvitation', { url })

    await this.mail.send({
      to: recipient,
      subject: content.subject,
      text: content.text,
      html: content.html,
      messageKey: 'tenant.memberInvitation',
    })
  }
}

/** `never` döndüren tek sarmalayıcı — kabul akışının tek hatasını ifade olarak fırlatır. */
function raiseInvitationInvalid(): never {
  throw new InvitationInvalidError()
}

/**
 * İstek bağlamından istemci alanlarını okur. ⚠ Dönen değer YALNIZCA denetim
 * kaydı yazma kapısına geçer — bu dosyadaki hiçbir log çağrısına GEÇMEZ.
 */
function readClientContext(): RequestClientContext {
  return getRequestContext().client
}

/**
 * Davet edilen adresin sahibi BU kiracıda zaten üyeyse reddeder.
 *
 * `userId` bilinmiyorsa (adrese ait bir hesap YOK) kontrol doğal olarak
 * atlanır: üyelik var olmayan bir kullanıcıya bağlı OLAMAZ.
 */
async function assertNotAlreadyMember(
  tx: TenantTransactionClient,
  tenantId: string,
  userId: string | undefined,
): Promise<void> {
  if (userId === undefined) {
    return
  }

  const membership = await tx.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { id: true },
  })

  if (membership !== null) {
    throw new AlreadyMemberError({ userId })
  }
}

/**
 * Bekleyen davet üst sınırını zorlar.
 *
 * ⚠ SÜRESİ GEÇMİŞ davetler SAYILMAZ: üst sınır "bekleyen" davetler içindir ve
 * süresi dolmuş bir satır artık bekleyen değildir (temizlik işi yok, satır
 * yerinde durur). Saymak, zamanla her kiracıyı kalıcı olarak kilitlerdi.
 *
 * ⚠ TAZELEME (var olan bir adrese tekrar davet) ÜST SINIRI TETİKLEMEZ:
 * mevcut satırı güncellemek bekleyen davet SAYISINI ARTIRMAZ. Aksi hâlde
 * sınıra ulaşmış bir kiracı mevcut davetlerini bile yenileyemez ve çıkış
 * yolu kalmazdı.
 */
async function assertPendingInvitationCapacity(
  tx: TenantTransactionClient,
  isNewInvitation: boolean,
  now: number,
): Promise<void> {
  if (!isNewInvitation) {
    return
  }

  const pendingCount = await tx.tenantInvitation.count({
    where: { expiresAt: { gt: new Date(now) } },
  })

  if (pendingCount >= PENDING_INVITATION_LIMIT) {
    throw new PendingInvitationLimitReachedError(pendingCount, PENDING_INVITATION_LIMIT)
  }
}

/** Aynı adrese iki davet arasındaki asgari süreyi zorlar. */
function assertResendCooldownElapsed(lastSentAt: Date | undefined, now: number): void {
  if (lastSentAt === undefined) {
    return
  }

  const elapsedMs = now - lastSentAt.getTime()

  if (elapsedMs < INVITATION_RESEND_COOLDOWN_MS) {
    throw new InvitationResendTooSoonError(
      Math.ceil((INVITATION_RESEND_COOLDOWN_MS - elapsedMs) / 1000),
    )
  }
}

/**
 * Üyeliği yaratır; eşzamanlı ikinci bir kabul (veya başka bir yoldan kurulmuş
 * üyelik) `(tenant_id, user_id)` benzersizliğine çarparsa bunu alan bazlı
 * daraltmayla DOMAIN hatasına çevirir.
 *
 * ⚠ HATA YUTULMAZ (CLAUDE.md §10 md 16): yalnızca benzersizlik ihlali
 * dönüştürülür, TANINMAYAN her hata AYNEN yeniden fırlatılır. Boş `catch`
 * bloğu YOKTUR.
 */
async function createMembershipForInvitation(
  tx: TenantTransactionClient,
  data: { readonly tenantId: string; readonly userId: string; readonly role: TenantRoleWire },
): Promise<void> {
  try {
    await tx.tenantMembership.create({ data })
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new AlreadyMemberError({ userId: data.userId })
    }

    throw error
  }
}

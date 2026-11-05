// @arkesoft/trpc — `member.*` (ROADMAP v0.0.14, T-014/S2, architect K-A9,
// ADR-0016)
//
// ⚠⚠ PLATFORMUN İLK MUTATION'LARI. Bu dosyadan önce sözleşme yüzeyindeki
// YAZMA ucu sayısı SIFIRDI — beş prosedürün beşi de okumaydı; bundan sonraki
// her yazma ucu bu dosyayı emsal alacak. (⚠ tRPC'nin yazma çağrısının adı bu
// yorumda BİLEREK yazılmadı: "bu dosyada kaç yazma ucu var" sorusunu grep ile
// sayan kapı, adı bir yorumda bulursa sayıyı BİR FAZLA okur —
// AGENT_BASELINE.md §5 literal-jeton kuralı.) Dört bağlayıcı emsal:
//   1. Resolver gövdesi TEK İFADE (ADR-0009 madde 4): `ctx.ports.*` üzerinde
//      TEK çağrı, dallanma SIFIR. Tüm iş kuralı port arkasındadır
//      (`../ports/member-write.port.ts`).
//   2. Her prosedürün hem `.input()` hem `.output()` şeması vardır
//      (`../schemas/member.schema.ts`) — şemasız bir mutation yazılmaz.
//   3. Portlar TOTAL'dır: "zaten üye", "davet geçersiz", "owner korumalı"
//      BURAYA dönüş değeri olarak GELMEZ, port `AppError` fırlatır; bu
//      resolver'lar `null` kontrolü ve `if` YAZMAZ.
//   4. `tenantId` GİRDİDEN okunmaz (ADR-0009 madde 7) — kiracı kapsamlı üç
//      prosedürde `ctx.tenant.tenantId`'den, dördüncüsünde HİÇ okunmaz.
//
// ⚠ BU DOSYADA İKİ GÜVEN SEVİYESİ VAR ve bu `storefront.router.ts`'in "dosya
// başına TEK güven seviyesi" kuralının BİLİNÇLİ bir istisnasıdır. Gerekçe:
// `acceptInvitation` davet akışının AYRILMAZ parçasıdır (davet → kabul → rol
// değiştir → çıkar tek bir kullanıcı akışıdır) ve onu ayrı bir namespace'e
// koymak tüketiciyi aynı akış için iki yüzeye bakmaya zorlardı. İstisnanın
// bedeli ÖDENDİ: builder'lar prosedür başına AŞAĞIDA tek tek yazılı ve
// ADR-0016 madde 6'nın dört koşulu `acceptInvitation`'ın başında SAYILI.
//
// ⚠ YÜZEYİN ERİŞİLEBİLİRLİĞİ (architect K-A9, ölçülmüş topolojik gerçek):
// `member.*` v0.0.14'te TARAYICIDAN ERİŞİLEBİLİR DEĞİLDİR — kiracı kapsamlı
// prosedürler panel host'undan 404 alır (ADR-0011 madde 4) ve panel kiracı
// seçimi v0.1.0'dadır. Ulaşılabilir yüzey: kiracı host'u + sunucu/entegrasyon
// istemcisi. Bu bir eksik değil, panel ekranının bu sürümde kapsam dışı
// olmasının doğal sonucudur.

import { permissionProcedure } from '../authz/permission-procedure.js'
import {
  memberAcceptInvitationInputSchema,
  memberInvitationAcceptedSchema,
  memberInvitationSchema,
  memberInviteInputSchema,
  memberRemoveInputSchema,
  memberRemovedSchema,
  memberRoleSchema,
  memberUpdateRoleInputSchema,
} from '../schemas/member.schema.js'
import { protectedProcedure, router } from '../trpc.js'

export const memberRouter = router({
  /**
   * `permissionProcedure('member:write')` — `readonly`/`support`/`staff`
   * rolleri 403 alır (ROADMAP v0.0.14 kabul kriteri).
   */
  invite: permissionProcedure('member:write')
    .input(memberInviteInputSchema)
    .output(memberInvitationSchema)
    .mutation(({ ctx, input }) =>
      ctx.ports.memberWrite.invite(ctx.tenant.tenantId, ctx.auth.userId, input),
    ),

  /**
   * ⚠⚠ TEK AMA GERÇEK MİMARİ İSTİSNA — `protectedProcedure` (kimlik ZORUNLU,
   * kiracı MUAF). Kabul eden kişi TANIM GEREĞİ henüz üye değildir, bu yüzden
   * kiracı host'unda üyelik muhafızı onu keser ve prosedür kiracı bağlamını
   * host'tan ALAMAZ. Kiracı bağlamı YETENEKTEN (davet belirtecinden) türetilir
   * ve bu türetme PORTUN ARKASINDADIR.
   *
   * ADR-0016 madde 6'nın DÖRT KOŞULU — istisnanın "genel bir kiracı kaynağı"
   * olmadığının yazılı kanıtı, hepsi BU prosedür için sağlanıyor:
   *   A. Tek dayanak ≥256 bit entropili, diskte yalnızca ÖZETİ saklanan,
   *      süresi DOLAN, TEK KULLANIMLIK bir belirteçtir (K-A1).
   *   B. Belirteçten türeyen bağlam TEK bir kiracı kapsamlı blokta kullanılır
   *      ve o blokta BAŞKA kiracı verisi okunmaz (port uygulaması, `apps/api`).
   *   C. ⚠ Çıktı şeması kiracıya ait HİÇBİR alan taşımaz
   *      (`memberInvitationAcceptedSchema` = tek `accepted` alanı) VE bu
   *      resolver `ctx.tenant`'a ERİŞMEZ — aşağıdaki gövdede o ifade YOKTUR,
   *      yazılamaz da: `protectedProcedure` kiracıyı daraltmaz.
   *   D. TÜM başarısızlık modları TEK hata sınıfına indirgenir (port
   *      sözleşmesi) — "davet yok" ile "e-posta eşleşmiyor" AYNI yanıtı verir.
   *
   * ⚠ Bu prosedürün TAM HTTP yolunun kiracı-muaf yollar listesine eklenmesi
   * `apps/api`'nin işidir (ayrı alt görev) ve o listenin kardinalite
   * assertion'ı ELLE güncellenir.
   */
  acceptInvitation: protectedProcedure
    .input(memberAcceptInvitationInputSchema)
    .output(memberInvitationAcceptedSchema)
    .mutation(({ ctx, input }) => ctx.ports.memberWrite.acceptInvitation(ctx.auth.userId, input)),

  /**
   * `permissionProcedure('member:write')`. Sahiplik DEVRİ de bu uçtan geçer
   * (`role: 'owner'`); INV-OWNER değişmezi ve "yükselme yasağı" port
   * arkasındadır — bu dosyada rol karşılaştıran bir satır YOKTUR.
   */
  updateRole: permissionProcedure('member:write')
    .input(memberUpdateRoleInputSchema)
    .output(memberRoleSchema)
    .mutation(({ ctx, input }) =>
      ctx.ports.memberWrite.updateRole(ctx.tenant.tenantId, ctx.auth.userId, input),
    ),

  /** `permissionProcedure('member:write')`. `owner` üyeliği çıkarılamaz (port arkasında). */
  remove: permissionProcedure('member:write')
    .input(memberRemoveInputSchema)
    .output(memberRemovedSchema)
    .mutation(({ ctx, input }) =>
      ctx.ports.memberWrite.remove(ctx.tenant.tenantId, ctx.auth.userId, input),
    ),
})

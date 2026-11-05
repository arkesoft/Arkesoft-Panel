// @arkesoft/trpc — MemberWritePort (ROADMAP v0.0.14, T-014/S2, architect K-A9)
//
// Port BİLDİRİLİR (burada), `apps/api`'de UYGULANIR (ayrı alt görev).
// ⚠⚠ PLATFORMUN İLK YAZMA PORTU — bundan sonraki her yazma portu bu dosyayı
// emsal alacak. Üç bağlayıcı değişmez:
//
//   1. İŞ KURALININ TAMAMI BU PORTUN ARKASINDADIR. Resolver'lar TEK İFADEDİR
//      (ADR-0009 madde 4): "zaten üye mi", "bekleyen davet üst sınırı",
//      "yeniden gönderme bekleme süresi", "son owner korunur", "yükselme
//      yasağı", denetim kaydı ve e-posta gönderimi — hiçbiri sözleşme
//      katmanında DEĞİL, hiçbiri `packages/trpc`'de GÖRÜNMEZ.
//   2. PORT TOTAL'dır (ADR-0009 madde 3): başarısızlık `AppError` ile
//      bildirilir, dönüş tipi bir `Result` birleşimi veya `null` DEĞİLDİR.
//      Çağıran "başarılı mı" diye DALLANAMAZ.
//   3. KİRACI KİMLİĞİ PARAMETREDİR, GİRDİDE DEĞİL. `tenantId` host
//      çözümünden okunan `TrpcTenantState.tenantId`'dir; `input` nesnelerinin
//      HİÇBİRİNDE kiracı alanı yoktur (`../schemas/member.schema.ts`).
//
// ⚠ `ip`/`userAgent` BU PORTUN İMZASINDA YOKTUR ve EKLENMEZ: denetim kaydının
// istemci alanları `apps/api`'nin istek bağlamından okunur (architect K-A2).
// Onları buraya koymak, tel sözleşmesi paketini istemci PII'sinin taşıyıcısı
// yapar ve her resolver'ı tek ifadeden çıkarırdı.

import type {
  MemberAcceptInvitationInput,
  MemberInvitation,
  MemberInvitationAccepted,
  MemberInviteInput,
  MemberRemoveInput,
  MemberRemoved,
  MemberRole,
  MemberUpdateRoleInput,
} from '../schemas/member.schema.js'

export interface MemberWritePort {
  /**
   * Kiracıya üye davet eder ve davet kaydını döndürür.
   *
   * `actorUserId` daveti YAPAN kimliktir (denetim kaydının aktörü ve
   * "yükselme yasağı" kontrolünün öznesi); kimlik bağlamından gelir, girdiden
   * DEĞİL. E-posta gönderimi COMMIT'TEN SONRA yapılır (architect K-A9: sıra
   * bağlayıcı — ters sıra ÖLÜ BELİRTEÇ üretirdi) ve gönderim başarısızlığı
   * `isRetryable: true` taşıyan bir `AppError` olarak yukarı gider.
   */
  invite(tenantId: string, actorUserId: string, input: MemberInviteInput): Promise<MemberInvitation>

  /**
   * Davet belirtecini kabul eder ve üyeliği yaratır.
   *
   * ⚠⚠ İMZADA `tenantId` YOKTUR ve BU KASITLIDIR (ADR-0016 madde 6, YETENEK
   * tabanlı DAR istisna): kabul eden kişi TANIM GEREĞİ henüz üye değildir, bu
   * yüzden kiracı bağlamını host'tan ALAMAZ. Kiracı kimliği YALNIZCA
   * belirteçten türetilir ve o türetme bu portun ARKASINDADIR — sözleşme
   * katmanı bir kiracı kimliği GÖRMEZ, dolayısıyla yanlış bir kiracıya
   * GEÇİREMEZ.
   *
   * Tüm başarısızlık modları (belirteç yok / biçimi bozuk / süresi geçmiş /
   * oturum e-postası davet adresiyle eşleşmiyor / ikinci kez kullanıldı) TEK
   * hata sınıfına indirgenir (ADR-0016 madde 6 koşul D) — bu fonksiyon o
   * ayrımı ifade edebilecek bir dönüş değeri TAŞIMAZ.
   */
  acceptInvitation(
    userId: string,
    input: MemberAcceptInvitationInput,
  ): Promise<MemberInvitationAccepted>

  /**
   * Bir üyenin rolünü değiştirir. Sahiplik DEVRİ de bu yoldan geçer
   * (`role: 'owner'`, yalnızca mevcut owner tarafından) ve INV-OWNER
   * değişmezi ("her kiracının TAM OLARAK BİR owner'ı var") bu portun
   * arkasında, tek transaction içinde CAS ile zorlanır (K-A11).
   */
  updateRole(
    tenantId: string,
    actorUserId: string,
    input: MemberUpdateRoleInput,
  ): Promise<MemberRole>

  /**
   * Bir üyeyi kiracıdan çıkarır. `owner` üyeliği çıkarılamaz (INV-OWNER) —
   * bu kural portun arkasındadır ve sözleşme katmanında bir `if` olarak
   * GÖRÜNMEZ.
   */
  remove(tenantId: string, actorUserId: string, input: MemberRemoveInput): Promise<MemberRemoved>
}

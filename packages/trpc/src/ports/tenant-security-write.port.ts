// @arkesoft/trpc — TenantSecurityWritePort (ROADMAP v0.0.15, T-016/S7,
// architect md 2 — owner 2FA zorunluluğu, ADR-0018)
//
// Port BİLDİRİLİR (burada), `apps/api`'de UYGULANIR
// (`apps/api/src/trpc/ports/tenant-security-write.port.adapter.ts`).
// `MemberWritePort`'un (T-014/S2) ÜÇ bağlayıcı değişmezi burada da geçerlidir:
//
//   1. İŞ KURALININ TAMAMI BU PORTUN ARKASINDADIR — "kendini kilitlememe"
//      kontrolü (aşağıda), denetim kaydı, idempotent no-op kısayolu: hiçbiri
//      sözleşme katmanında GÖRÜNMEZ.
//   2. PORT TOTAL'dır (ADR-0009 madde 3): başarısızlık `AppError` ile
//      bildirilir, dönüş tipi bir `Result` birleşimi veya `null` DEĞİLDİR.
//   3. KİRACI KİMLİĞİ PARAMETREDİR, GİRDİDE DEĞİL — `tenantId` host
//      çözümünden okunan `TrpcTenantState.tenantId`'dir (CLAUDE.md §7,
//      ADR-0009 madde 7).

import type {
  TenantSecurityPolicy,
  TenantSecurityPolicyUpdateInput,
} from '../schemas/tenant-security.schema.js'

export interface TenantSecurityWritePort {
  /**
   * Kiracının owner 2FA zorunluluğu ayarını günceller.
   *
   * ⚠⚠ KENDİNİ KİLİTLEMEME, AYAK (a) (architect md 2, ADR-0018): zorunluluğu
   * KAPALIDAN AÇIĞA çeviren çağıran KENDİSİ 2FA kurmuş olmalı, aksi halde
   * port `AppError` (`TwoFactorSetupRequiredError`, 409) FIRLATIR — bu
   * durum dönüş değeri olarak GELMEZ. ⚠ YALNIZCA ÇAĞIRAN denetlenir;
   * kiracının BAŞKA owner'ları SORGULANMAZ ("kiracının 2FA'sız owner'ı var mı"
   * sorusu başka kullanıcıların güvenlik durumunu SIZDIRIR ve bugün bir
   * üye-okuma prosedürü yoktur — architect gerekçesi). Diğer owner'lar bu
   * yüzden kilitlenmez, 2FA kurmaya ZORLANIR; ayarın amacı tam budur.
   *
   * ⚠ İDEMPOTENT NO-OP: istenen değer MEVCUT değerle aynıysa port hiçbir
   * yazma/denetim kaydı ÜRETMEZ ve mevcut değeri AYNEN döner
   * (`MemberWritePort.updateRole`'ün "zaten o rolde" emsali).
   */
  updateSecurityPolicy(
    tenantId: string,
    actorUserId: string,
    input: TenantSecurityPolicyUpdateInput,
  ): Promise<TenantSecurityPolicy>
}

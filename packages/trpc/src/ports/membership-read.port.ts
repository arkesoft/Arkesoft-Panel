// @arkesoft/trpc — MembershipReadPort (ROADMAP v0.0.14, T-014/S2, architect
// K-A5)
//
// Port BİLDİRİLİR (burada), `apps/api`'de UYGULANIR (ayrı alt görev).
// ADR-0009 madde 3: port TOTAL'dır — "üyelik yok" durumu çağırana `null`
// olarak GEÇMEZ, port `AppError` fırlatır. Sözleşme katmanı yokluğun ne
// anlama geldiğine ASLA karar vermez; bu yüzden `permissionProcedure`
// (`../authz/permission-procedure.ts`) `null` kontrolü YAPMAZ.
//
// ⚠⚠ TOTALLİĞİN BURADAKİ ÖZEL ANLAMI — İKİNCİ SAVUNMA HATTI (architect K-A5
// gerekçe 3): üyelik satırı yoksa bu port, kimlik/üyelik muhafızının HTTP
// yolunda fırlattığı hatanın AYNISINI fırlatır. Bu, ADR-0012'nin "kiracı iki
// katmanda zorlanır" deseninin YETKİ karşılığıdır: HTTP yolunda muhafız
// üyeliği zaten doğrulamıştır, ama HTTP-DIŞI bir çağıran (ileride bir worker)
// o katmanı atlarsa izin katmanı TEK BAŞINA durdurur. Arayüzün biçimi bu
// garantiyi taşır: "üye değil" ifade edilebilecek bir dönüş değeri YOKTUR
// (`null` yok, `Result` birleşimi yok) → çağıran o ayrımı YAZAMAZ bile.
//
// ⚠ ROL ÖNBELLEKLENMEZ ve bu AÇIKÇA KABUL EDİLMİŞ BİR MALİYETTİR (architect
// K-A5): oturum kiracı taşımıyor (bağlayıcı v0.0.5 kararı) → rol oturumda
// önbelleklenemez, izinli her istekte `(tenant_id, user_id)` üzerinde bir
// nokta-okuması yapılır. Reddedilen optimizasyon: muhafızın okumasını istek
// bağlamında paylaşmak → rol için istek içinde İKİ doğruluk kaynağı. v0.0.17
// ölçümle yeniden değerlendirir.

import type { TenantRoleWire } from '../schemas/member.schema.js'

export interface MembershipReadPort {
  /**
   * Aktörün bu kiracıdaki rolünü döndürür.
   *
   * `tenantId` HER ZAMAN host çözümünden gelen `TrpcTenantState.tenantId`
   * değeridir — prosedür girdisinden ASLA gelmez (CLAUDE.md §7, ADR-0009
   * madde 7). `userId` kimlik bağlamından gelir, girdiden DEĞİL.
   *
   * Üyelik satırı yoksa — ya hiç yoksa ya da BAŞKA kiracınınsa — port
   * `AppError` fırlatır; bu fonksiyon `null`/`undefined` DÖNMEZ. İki durumun
   * AYNI hatayı üretmesi gerekir: sorgu kiracı bağlamında koşar ve ayrımı
   * uygulama kodu YAPMAZ (varlık oracle'ı yapısal olarak kapalı).
   */
  requireRole(tenantId: string, userId: string): Promise<TenantRoleWire>
}

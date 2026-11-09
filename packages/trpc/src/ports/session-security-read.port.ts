// @arkesoft/trpc — SessionSecurityReadPort (ROADMAP v0.0.15, T-016 FIX turu
// 1, madde 4/M-4; TAMAMLANDI — FIX turu 2)
//
// GÜNCELLEME (FIX turu 2): zincir TAMAMLANDI. `apps/api/src/trpc/ports/
// session-security-read.port.adapter.ts` adaptörü UYGULAR, `TrpcPorts`'a
// (`packages/trpc/src/context/trpc-context.types.ts`) ZORUNLU üye olarak
// EKLENDİ, `server.ts`'TEN tip-only dışa AÇILDI ve `apps/api/src/trpc/
// trpc.controller.ts`/`trpc.module.ts` kablolamayı TAMAMLADI.
// `session.router.ts`'in resolver'ı artık bu portu GERÇEKTEN çağırıyor.
//
// `twoFactorEnabled` KULLANICI SEVİYESİ bir alandır (`app_user.
// two_factor_enabled`) — KİRACIYA BAĞLI DEĞİL (M-4'ün gerekçesi, handoff
// bağlam özeti ④). Bu yüzden `userId` PARAMETREDİR, `tenantId` YOKTUR —
// `TwoFactorComplianceService.evaluateOwnerStatus`'un (`apps/api/src/auth/
// two-factor-compliance.service.ts`) TERSİNE, bu port TENANT POLİTİKASINI
// (`requireTwoFactorForOwner`/`setup_required`) OKUMAZ — YALNIZCA kullanıcının
// KENDİ 2FA bayrağını döner. Politika sinyali BİLEREK bu portun KAPSAMI
// DIŞINDA (v0.0.15.1 borcu, handoff'un ⚠ notu).
export interface SessionSecurityReadPort {
  /** `app_user.two_factor_enabled` — PORT TOTAL'dır (ADR-0009 madde 3), FIRLATMAZ. */
  isTwoFactorEnabled(userId: string): Promise<boolean>
}

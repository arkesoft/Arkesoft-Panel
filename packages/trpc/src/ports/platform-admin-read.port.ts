// @arkesoft/trpc — PlatformAdminReadPort (ROADMAP v0.0.20, T-021/S5,
// architect "tRPC" bölümü, ADR-0023 Karar 1/2)
//
// Port BİLDİRİLİR (burada), `apps/api`'de UYGULANIR (S7). `platformAdminProcedure`'ün
// (`../authz/platform-admin-procedure.ts`) platform yetkisi + 2FA kapısının
// TEK veri kaynağıdır; `platform.session`'ın (kapı DIŞINDA) TEK veri kaynağı
// da budur.
//
// ⚠⚠ İKİ YÖNTEM, İKİ FARKLI TOTALLİK SÖZLEŞMESİ TAŞIR — karıştırılmaması
// BAĞLAYICI (ADR-0023 Karar 2):
//   · `requirePlatformAdmin` TOTAL'dır (`membershipRead.requireRole`'ün AYNI
//     deseni, ADR-0009 madde 3): `platform_admin` kaydı YOKSA bu yöntem
//     `AppError` FIRLATIR — "yönetici değil" bir dönüş değeri olarak
//     İFADE EDİLEMEZ (`null` yok, `Result` birleşimi yok). Kayıt VARSA
//     aktörün KENDİ `app_user.two_factor_enabled` bayrağını döner; 2FA
//     kontrolü {@link import('../authz/platform-admin-procedure.js')}'in
//     MIDDLEWARE'inin işidir, bu port DEĞİL — port yalnızca VERİYİ taşır.
//   · `readPlatformSession` ASLA FIRLAMAZ: `platform.session`'ın (BİLEREK
//     kapı DIŞINDA, `trpc.ts`'in "tRPC — yeni platform router'ı" bölümü
//     madde 1) TEK amacı 2FA'sı OLMAYAN veya yönetici OLMAYAN bir aktöre
//     "sen busun" bilgisini vermektir — bu yol 403 ÜRETEMEZ, aksi hâlde
//     2FA'sız yöneticinin kuruluma yönlendirilmesi İMKÂNSIZ olurdu (AC-4(a)).
//
// ⚠ VARLIK ORACLE'I YAPISAL OLARAK KAPALI (CLAUDE.md §7 md 12): platform
// yöneticisi OLMAMAK ile 2FA'sı OLMAMAK ikisi de 403 ve ikisi de yalnızca
// ÇAĞIRANIN KENDİSİ hakkındadır (`permission-procedure.ts:70-73`'ün AYNI
// gerekçesi) — hiçbir dal başka bir kullanıcı/kiracı hakkında bilgi sızdırmaz.
//
// ⚠ `userId` kimlik bağlamından gelir (`ctx.auth.userId`), GİRDİDEN ASLA
// gelmez — platform yetkisi KULLANICI bazlıdır, OTURUMDA TAŞINMAZ (ADR-0023
// Karar 1, `permission-procedure.ts:62-66`'nın AYNI kategori-hatası
// gerekçesi: platform yetkisi oturumun değil kullanıcının özelliğidir).

import type { PlatformSession } from '../schemas/platform.schema.js'

export interface PlatformAdminReadPort {
  /**
   * `platform_admin` kaydının varlığını doğrular (TOTAL — kayıt yoksa
   * `AppError` fırlatır) ve aktörün KENDİ 2FA durumunu döndürür. 2FA'nın
   * `false` olması durumunda hangi hatanın fırlatılacağına bu port KARAR
   * VERMEZ — o karar {@link import('../authz/platform-admin-procedure.js').platformAdminProcedure}'ün
   * middleware'inindir (`ctx.errors.twoFactorRequired()`).
   */
  requirePlatformAdmin(userId: string): Promise<{ readonly twoFactorEnabled: boolean }>

  /**
   * `platform.session`'ın TEK veri kaynağı — FIRLAMAZ. Platform yöneticisi
   * OLMAYAN veya 2FA'sı OLMAYAN bir aktör için de başarıyla çözülür; dosya
   * başı yorumunun ikinci maddesi.
   */
  readPlatformSession(userId: string): Promise<PlatformSession>
}

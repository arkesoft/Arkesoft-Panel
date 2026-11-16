// @arkesoft/trpc — platformAdminProcedure, merdivenin ALTINCI builder'ı
// (ROADMAP v0.0.20, T-021/S5, architect "tRPC" bölümü, ADR-0023 Karar 1/2)
//
// Merdivenin ilk dördü `../trpc.ts`'te, beşincisi (`permissionProcedure`)
// `./permission-procedure.ts`'te tanımlıdır; bu dosya `../trpc.ts`'teki
// `protectedProcedure`'ün ÜZERİNE kurulur:
//
//   platformAdminProcedure = protectedProcedure.use(<platform kaydı + 2FA kapısı>)
//
// ⚠⚠ `tenantProcedure` ÜZERİNE KURULAMAZ (ADR-0023 Karar 2, architect
// gerekçesi birebir): süper admin host'u REZERVE bir alt alan adıdır
// (`reserved-subdomains.ts:35`), `resolveHost` onu çözümsüz BIRAKIR ve
// `ctx.tenant.kind` `'absent'` kalır — `tenantProcedure`'ün `requireTenant`
// middleware'i bu istekte HER ZAMAN 401 fırlatır. Bu, `registration.*`
// üçlüsünün (ADR-0021, `../routers/registration.router.ts`) BİREBİR AYNI
// yapısal kısıtıdır: taban `protectedProcedure`, `tenantProcedure` DEĞİL.
//
// ⚠ AYRI DOSYA, `permission-procedure.ts`'in AYNI gerekçesiyle: platform
// kapısı `platform-admin-read.port.ts`'e bağımlıdır ve bu bağımlılığı
// `../trpc.ts`'e taşımak taban merdiveni platform yetki modeline bağlardı.
//
// ⚠⚠ BU DOSYA `src/index.ts`'TEN (TARAYICI girişi) EXPORT EDİLMEZ — yalnızca
// `src/server.ts` bu dosyayı dışa açar (`permission-procedure.ts`'in AYNI
// sözleşmesi, po R-PO7'nin AYNI gerekçesi: burada `../trpc.js` import'u vardır
// ve o modül grafiği SUNUCU taraflıdır).

import { protectedProcedure } from '../trpc.js'

/**
 * `platformAdminProcedure`'ün gövdesi — AYRI fonksiyon olmasının TEK
 * gerekçesi tip türetmesidir (`permission-procedure.ts`'in `buildPermissionGate`
 * ile AYNI desen): dışa açılan her fonksiyonun dönüş tipi AÇIK yazılmak
 * zorundadır (CLAUDE.md §4) ve tRPC'nin builder tipi elle yazılamayacak kadar
 * parametriktir — tip `ReturnType<typeof buildPlatformAdminGate>` ile
 * TÜRETİLİR.
 *
 * Kapı İKİ ADIMI SIRAYLA zorlar (ADR-0023 Karar 2):
 *   (a) `platformAdminRead.requirePlatformAdmin(ctx.auth.userId)` TOTAL'dır —
 *       `platform_admin` kaydı YOKSA bu satırda `AppError` fırlatılır
 *       (`membershipRead.requireRole`'ün AYNI deseni, port kendi TOTAL
 *       sözleşmesini uygular); bu middleware o dalı KENDİSİ kodlamaz.
 *   (b) Kayıt VARSA ama `twoFactorEnabled === false` → bu middleware
 *       `ctx.errors.twoFactorRequired()` fırlatır (`permissionProcedure`'ün
 *       `ROLE_PERMISSIONS` kontrolünün AYNI deseni — port VERİ döner, karar
 *       middleware'de alınır).
 *
 * ⚠ 401 DEĞİL 403: kimlik `protectedProcedure`'de ZATEN kurulmuştur, eksik
 * olan YETKİdir. ⚠ VARLIK ORACLE'I DEĞİL — iki dal da yalnızca ÇAĞIRANIN
 * KENDİSİ hakkındadır (`permission-procedure.ts:70-73`'ün AYNI gerekçesi):
 * "yönetici değil" ile "2FA yok" arasındaki ayrım başka hiçbir kullanıcı/
 * kiracı hakkında bilgi SIZDIRMAZ.
 */
function buildPlatformAdminGate() {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const { twoFactorEnabled } = await ctx.ports.platformAdminRead.requirePlatformAdmin(
      ctx.auth.userId,
    )

    if (!twoFactorEnabled) {
      throw ctx.errors.twoFactorRequired()
    }

    return next()
  })
}

/** {@link platformAdminProcedure}'ün builder tipi — `buildPlatformAdminGate`'ten TÜRETİLİR. */
export type PlatformAdminProcedureBuilder = ReturnType<typeof buildPlatformAdminGate>

/**
 * Platform yöneticiliği VE 2FA GEREKTİREN prosedürlerin tabanı
 * (`platform.tenantList`, `platform.auditLog`). `permissionProcedure`'ün
 * TERSİNE parametrik DEĞİLDİR — platform yetkisi tek bir ikili kapıdır,
 * izin KATALOĞU gibi çeşitlenmez (ADR-0023 Karar 1: "yetki = satırın
 * varlığı").
 */
export const platformAdminProcedure: PlatformAdminProcedureBuilder = buildPlatformAdminGate()

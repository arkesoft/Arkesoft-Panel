// @arkesoft/superadmin — formatPlatformDate (ROADMAP v0.0.20, T-021/S8)
//
// SAF fonksiyon — ISO-8601 tel tarihini (`platform.tenantList`/
// `platform.auditLog`'un `createdAt` alanı) okunabilir Türkçe tarihe çevirir.
// Tele çıkan alan ZATEN `z.iso.datetime()` ile doğrulanmış bir dizedir
// (`@arkesoft/trpc`, K5 kuralı 2) — bu fonksiyon yalnızca GÖRÜNÜMÜ biçimler,
// bir doğrulama katmanı DEĞİLDİR.
export function formatPlatformDate(isoDateTime: string): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(isoDateTime),
  )
}

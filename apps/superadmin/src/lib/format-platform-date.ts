// @arkesoft/superadmin — formatPlatformDate (ROADMAP v0.0.20, T-021/S8;
// ROADMAP v0.0.18, T-027/S7/AC-50 GÜNCELLEMESİ)
//
// SAF fonksiyon — ISO-8601 tel tarihini (`platform.tenantList`/
// `platform.auditLog`'un `createdAt` alanı) okunabilir Türkçe tarihe çevirir.
// Tele çıkan alan ZATEN `z.iso.datetime()` ile doğrulanmış bir dizedir
// (`@arkesoft/trpc`, K5 kuralı 2) — bu fonksiyon yalnızca GÖRÜNÜMÜ biçimler,
// bir doğrulama katmanı DEĞİLDİR.
//
// GÜNCELLEME (AC-50): bu dosyanın eski hâlindeki yerel `Intl` tarih
// biçimlendirici çağrısı (`'tr-TR'`, `dateStyle: 'medium'`, `timeStyle:
// 'short'`) `@arkesoft/i18n`'in `formatDate`'ine DEVREDİLDİ —
// `packages/i18n/src/format-date.ts`'in VARSAYILAN seçenekleri BİREBİR AYNI
// değerlerle (`dateStyle: 'medium'`, `timeStyle: 'short'`,
// `locale: DEFAULT_LOCALE`) kurulmuştur, bu yüzden hiçbir seçenek geçilmeden
// ÇAĞRILIR — çıktı eskisiyle BİREBİR AYNI (bkz.
// `__tests__/format-platform-date.test.ts`).
import { formatDate } from '@arkesoft/i18n'

export function formatPlatformDate(isoDateTime: string): string {
  return formatDate(isoDateTime)
}

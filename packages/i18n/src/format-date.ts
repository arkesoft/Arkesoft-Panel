// @arkesoft/i18n — tarih biçimlendirici (ROADMAP v0.0.18, T-027/S5a,
// AC-50'nin yarısı)
//
// `Intl.DateTimeFormat` YERLEŞİKTİR (yeni bağımlılık DEĞİL, M14/M9). Bugün
// TEK gerçek üretim çağrı yeri `apps/superadmin/src/lib/format-platform-
// date.ts:9`'daki `new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium',
// timeStyle: 'short' })` — bu fonksiyonun VARSAYILAN seçenekleri AYNI
// değerlerle kurulmuştur ki S7 o dosyayı bu yardımcıya devretsin
// (`formatDate(isoDateTime)` ÇAĞRISI, hiçbir seçenek geçmeden, BİREBİR AYNI
// çıktıyı üretir — formatters.test.ts'te doğrulanır).

import { DEFAULT_LOCALE, type Locale } from './locale.js'

export interface FormatDateOptions {
  readonly locale?: Locale
  readonly dateStyle?: Intl.DateTimeFormatOptions['dateStyle']
  readonly timeStyle?: Intl.DateTimeFormatOptions['timeStyle']
}

/**
 * ISO-8601 tarih/saat dizesini (`isoDateTime`) okunabilir bir dizeye çevirir.
 * Bir DOĞRULAMA katmanı DEĞİLDİR — tele çıkan alanın `z.iso.datetime()` ile
 * zaten doğrulanmış olduğu varsayılır (çağıranın işi); bu fonksiyon yalnızca
 * GÖRÜNÜMÜ biçimler.
 */
export function formatDate(isoDateTime: string, options: FormatDateOptions = {}): string {
  const { locale = DEFAULT_LOCALE, dateStyle = 'medium', timeStyle = 'short' } = options

  return new Intl.DateTimeFormat(locale, { dateStyle, timeStyle }).format(new Date(isoDateTime))
}

// @arkesoft/i18n — Money'nin iki programcı hatası (ROADMAP v0.0.18,
// T-027/S5b, AC-43(a)/(b))
//
// `packages/i18n` kendi `AppError` alt sınıflarını tanımlar — emsal:
// `apps/storefront/src/themes/registry.ts` (`ThemeResolutionError extends
// AppError`). İkisi de PROGRAMCI HATASIDIR (kullanıcı girdisi DEĞİL): bir
// çağıranın `Money.of`'a ondalık bir kuruş geçmesi veya iki farklı para
// birimini toplamaya/karşılaştırmaya çalışması bir doğrulama hatası değil,
// bir kod hatasıdır. Bu yüzden S2'nin `@arkesoft/errors` defterinde
// (`ERROR_MESSAGE_KEYS.FRACTIONAL_MINOR_UNIT` / `.CURRENCY_MISMATCH`) ikisi
// de MEVCUT jenerik `errors.internal.unknown` anahtarına eşlidir — YENİ bir
// kullanıcı metni AÇMAZ, katalog `tr-TR` için TAM 35 anahtarda kalır
// (A-PO27-2: "defterin 2 Money kodunun yazıcıları S5b'de doğar" — burası).
//
// ⚠⚠ Anahtar LİTERAL yazılmaz — `ERROR_MESSAGE_KEYS`'ten okunur (S4'ün
// ESLint AST seçicisi `Property[key.name='userMessageKey'] > Literal`'ı
// yasaklıyor, `pnpm lint` bunu kırar).

import { AppError, ERROR_MESSAGE_KEYS } from '@arkesoft/errors'

/**
 * `Money.of` (ve dolaylı olarak `multiplyByRatio`'nun yuvarlama sonrası
 * güvenli-tamsayı yolunun DIŞINDAKİ her yeniden kurma noktası) tam sayı
 * OLMAYAN bir `amountMinor` ile çağrıldığında fırlar (AC-43(a)).
 */
export class FractionalMinorUnitError extends AppError {
  constructor(amountMinor: number) {
    super({
      code: 'FRACTIONAL_MINOR_UNIT',
      httpStatus: 500,
      userMessageKey: ERROR_MESSAGE_KEYS.FRACTIONAL_MINOR_UNIT,
      context: { amountMinor },
    })
  }
}

/**
 * `Money.add`/`.subtract`/`.compare`/`.equals` iki FARKLI para birimi
 * üzerinde çağrıldığında fırlar (AC-43(b)) — sessizce yanlış bir sonuç
 * (ör. TRY + USD'yi aynı birimmiş gibi toplama) ÜRETMEZ.
 */
export class CurrencyMismatchError extends AppError {
  constructor(left: string, right: string) {
    super({
      code: 'CURRENCY_MISMATCH',
      httpStatus: 500,
      userMessageKey: ERROR_MESSAGE_KEYS.CURRENCY_MISMATCH,
      context: { left, right },
    })
  }
}

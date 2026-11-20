// @arkesoft/i18n — mesaj çözümleyici (ROADMAP v0.0.18, T-027/S5a, AC-44)
//
// `createMessageResolver<L>(bundle, defaultLocale)` LOCALE'DE JENERİKTİR —
// `en-US` İÇERİĞİ gelmeden format çok-dilli KALIR; bu, testlerde sentetik
// `'xx-XX'` locale'iyle KANITLANIR (gerçek bir ikinci dil İÇERİĞİ yazmaya
// gerek yok, tek gereken bundle'da karşılığı olmayan bir locale talep
// etmek). Dönüş değeri, SEÇİLMİŞ bir locale için `{resolveMessage, t}`
// üreten bir fonksiyondur — "locale parametre, sabit DEĞİL" şartı bu
// curry'lenmiş imzayla karşılanır.
//
// Geri düşme merdiveni: istenen locale → varsayılan locale → `null`
// (`resolveMessage`, AÇIK DÜNYA — `key: string`, kapalı kümenin üyesi
// olmayan HER anahtar `null`'a elenir, SESSİZCE boş dize ÜRETMEZ).
// Tipli çağıranlar için `t(key: ErrorMessageKey): string` TOTAL'dır —
// `defaultCatalog`'un tipi (`MessageCatalog = Record<ErrorMessageKey,
// string>`) TÜM anahtarları KAPSADIĞI için (sonlu birleşim eşlemesi, indeks
// imzası DEĞİL) `defaultCatalog[key]` her zaman `string` döner, asla
// `undefined` — `t` BAŞARISIZ OLAMAZ.
//
// Narrowing mekanizması Zod'tur (CLAUDE.md §4: dış dünyadan gelen veri Zod
// ile parse edilir, `as` ile zorlanmaz) — `errorMessageKeySchema.safeParse`
// `apps/{admin,superadmin}`'in S7'de kuracağı `normalize-panel-error.ts`
// ile AYNI tek filtreleme noktasını kullanır (architect R-1 KARARI).

import { errorMessageKeySchema, type ErrorMessageKey } from '@arkesoft/errors'

import type { CatalogBundle, MessageCatalog } from './catalog-types.js'

/** Belirli bir locale'e BAĞLANMIŞ çözümleyici — `createMessageResolver`'ın döndürdüğü fonksiyonun sonucu. */
export interface MessageResolver {
  /** Açık dünya: kapalı kümenin üyesi OLMAYAN her `key` (ham sunucu metni dahil) `null`'a elenir. */
  readonly resolveMessage: (key: string) => string | null
  /** Tipli çağıranlar için TOTAL — kapalı kümenin bir üyesi için asla başarısız olmaz. */
  readonly t: (key: ErrorMessageKey) => string
}

function parseKnownKey(key: string): ErrorMessageKey | null {
  const parsed = errorMessageKeySchema.safeParse(key)
  return parsed.success ? parsed.data : null
}

function lookupInCatalog(
  catalog: MessageCatalog | undefined,
  key: ErrorMessageKey,
): string | undefined {
  return catalog?.[key]
}

/**
 * `defaultLocale`'in `bundle` içinde bir kataloğu OLMALIDIR — yoksa bu
 * fonksiyon (çağıranın bir sonraki adımı değil, KENDİSİ) SESSİZCE
 * geçmeden hemen FIRLAR. Bu bir yapılandırma/katalog kurulum hatasıdır
 * (programcı hatası), kullanıcı girdisi DEĞİLDİR.
 */
export function createMessageResolver<L extends string>(
  bundle: CatalogBundle<L>,
  defaultLocale: L,
): (locale: L) => MessageResolver {
  const maybeDefaultCatalog = bundle[defaultLocale]

  if (maybeDefaultCatalog === undefined) {
    throw new Error(`varsayılan locale için katalog bulunamadı: ${defaultLocale}`)
  }

  // ⚠ TS, iç içe fonksiyon (closure) sınırını geçerken yukarıdaki
  // `undefined` denetiminin daraltmasını KORUMAZ (çağrılma zamanı garanti
  // edilemez diye konservatif davranır) — bu yüzden `defaultCatalog`
  // AÇIK tipli (`MessageCatalog`, birleşim DEĞİL) bir değişkene yeniden
  // atanır; yakalanan değişkenin STATİK tipi zaten `undefined` içermediği
  // için alt kapanışlarda (`resolveFor`, `t`) daraltma kaybı YAŞANMAZ.
  const defaultCatalog: MessageCatalog = maybeDefaultCatalog

  return function resolveFor(locale: L): MessageResolver {
    const requestedCatalog = bundle[locale]

    function resolveMessage(key: string): string | null {
      const knownKey = parseKnownKey(key)
      if (knownKey === null) {
        return null
      }

      const fromRequested = lookupInCatalog(requestedCatalog, knownKey)
      if (fromRequested !== undefined) {
        return fromRequested
      }

      return lookupInCatalog(defaultCatalog, knownKey) ?? null
    }

    function t(key: ErrorMessageKey): string {
      return lookupInCatalog(requestedCatalog, key) ?? defaultCatalog[key]
    }

    return { resolveMessage, t }
  }
}

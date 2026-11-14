// @arkesoft/tenancy — tenant slug grameri: normalizasyon ve doğrulama
// (ROADMAP v0.1.0, T-019/S2, architect KARAR 1)
//
// TAŞIMA NOTU (bağlayıcı, T-019/S2): `TENANT_SLUG_PATTERN` bu dosyaya
// `resolve-host.ts`'teki (eski adıyla `SLUG_PATTERN`) desenden TAŞINDI
// (kopya DEĞİL) — `resolve-host.ts` artık bu dosyadan import eder. İki regex
// literali VAR OLAMAZ (R-A3): desen bu paketin `src`'inde tam BİR kez yaşar,
// `pnpm guards`'ın tek-kaynak taraması (S12) bunu mekanik olarak zorlar.
//
// NORMALİZASYON ≠ DOĞRULAMA — bağlayıcı ayrım (architect KARAR 1b):
// - `normalizeTenantSlug()` SİHİRBAZIN mağaza adından slug ÖNERMESİ
//   içindir. Sonucu kullanıcı özgürce DEĞİŞTİREBİLİR; fonksiyon asla
//   fırlatmaz, boş dize dahil her girdi için bir dize döner.
// - `validateTenantSlug()` sunucunun kullanıcının GÖNDERDİĞİ slug'ı
//   DOĞRULAMASI içindir — sessizce normalize ETMEZ, kanonik değilse
//   REDDEDER. Gerekçe: sunucunun sessizce düzeltmesi, kullanıcının bilinçli
//   düzenlemesini değiştirmek olurdu.
//
// SAF MODÜL: bu dosya hiçbir şey FIRLATMAZ, I/O yapmaz, `zod` DAHİL hiçbir
// bağımlılık kullanmaz (`purity.test.ts:60-73` `dependencies` boş küme
// assert'i bu dosyayı `readdirSync` ile OTOMATİK kapsar — dosya elle
// eklenmesi gerekmez).
//
// ⚠⚠ KABUL ORACLE'I BU DOSYA DEĞİL (R-A3): `validateTenantSlug()`'ın
// `valid` dönmesi, slug'ın host çözümlemesinde ÇÖZÜLEBİLECEĞİNİN garantisi
// DEĞİLDİR — `MAX_HOST_HEADER_LENGTH` (`resolve-host.ts`) host'un
// TAMAMINA uygulanır, slug'a değil (63 karakterlik meşru bir slug + uzun
// `APP_BASE_DOMAIN` ⇒ 255 aşılabilir). Asıl kabul oracle'ı `resolveHost()`
// FONKSİYONUNUN KENDİSİDİR; kayıt akışı (`apps/api`) son doğrulama adımında
// `resolveHost(`${slug}.${normalizedBaseDomain}`)` ile İKİNCİ bir kontrol
// yapmak ZORUNDADIR — bu dosya o ikinci kontrolü YAPMAZ (saflık kısıtı: bu
// modülün `normalizedBaseDomain`'e veya host birleştirmeye erişimi YOK).

import { RESERVED_SUBDOMAINS } from './reserved-subdomains.js'

/**
 * Slug biçimi — RFC 1123 alt alan adı etiketiyle UYUMLU, bağlayıcı regex
 * (K-A4, `resolve-host.ts`'ten TAŞINDI). 1-63 karakter; küçük harf + rakam +
 * tire; baş/son tire YASAK.
 */
export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const TENANT_SLUG_MAX_LENGTH = 63

/**
 * Türkçe harf katlama tablosu — normalizasyonun BİRİNCİ adımı,
 * `toLowerCase()`'den ÖNCE uygulanır (bağlayıcı sıra, architect KARAR 1c).
 * 7 harf çifti / 14 kod noktası: dotted-i {İ,i}, dotless-i {I,ı}, {Ş,ş},
 * {Ğ,ğ}, {Ü,ü}, {Ö,ö}, {Ç,ç}. `i` (ASCII U+0069) zaten hedefin kendisidir —
 * kimlik dönüşümü olduğu için tabloya AYRICA eklenmemiştir (gereksiz) ama
 * çift sayımına girer (`slug.test.ts` 14 kod noktasını tek tek pinler).
 *
 * NEDEN SIRA BAĞLAYICI (ölçülmüş tuzak): `'İ'.toLowerCase()` (JS/V8) İKİ kod
 * noktası üretir (`'i'` + U+0307 COMBINING DOT ABOVE — `slug.test.ts` bu
 * platform gerçeğini `'İ'.toLowerCase().length === 2` ile pinler). Katlama
 * `toLowerCase()`'den SONRA yapılsaydı "İstanbul" birleştirici işaret taşıyan
 * bir dizeye dönüşür, bu işaret aşağıdaki `[^a-z0-9]+` adımında bir TİRE'ye
 * dönüşür ve kullanıcı `istanbul-magaza` yerine "geçersiz biçim" görürdü.
 * `'I'.toLowerCase()` `'i'` verir (`'ı'` DEĞİL) — `I` → `i` eşlemesi JS'in
 * varsayılan davranışıyla ÇAKIŞMAZ, netlik ve `toLocaleLowerCase('tr')`
 * YASAĞININ (o çağrı `'I'` → `'ı'` üretirdi) hiçbir yoldan sızmadığının
 * kanıtı olarak açıkça yazılmıştır.
 */
const TURKISH_CASE_FOLD: Readonly<Record<string, string>> = {
  İ: 'i',
  I: 'i',
  ı: 'i',
  Ş: 's',
  ş: 's',
  Ğ: 'g',
  ğ: 'g',
  Ü: 'u',
  ü: 'u',
  Ö: 'o',
  ö: 'o',
  Ç: 'c',
  ç: 'c',
}

const TURKISH_CASE_FOLD_SOURCE = /[İIışŞğĞüÜöÖçÇ]/gu

function foldTurkishCase(input: string): string {
  return input.replace(TURKISH_CASE_FOLD_SOURCE, (char) => TURKISH_CASE_FOLD[char] ?? char)
}

/**
 * Mağaza adından slug ÖNERİSİ üretir (sihirbaz adımı). Asla fırlatmaz; boş
 * girdi veya tamamen yabancı/ayrılmış karakterlerden oluşan girdi için boş
 * dize döner — çağıran (`apps/admin`) boş öneriyi kullanıcıya BOŞ bir alan
 * olarak sunar, icat edilmiş bir yer tutucu YAZMAZ.
 *
 * BAĞLAYICI SIRA (architect KARAR 1c, satır satır):
 * 1. Türkçe harf katlama ({@link foldTurkishCase}) — `toLowerCase()`'den ÖNCE.
 * 2. `toLowerCase()` — locale-DUYARSIZ (`toLocaleLowerCase('tr')` YASAK).
 * 3. NFD biçimine normalize + birleştirici işaretleri (U+0300–U+036F) soy.
 * 4. `[^a-z0-9]+` → `'-'`.
 * 5. Tekrarlı `'-'`'ları tek `'-'`'a daralt.
 * 6. Baş/son `'-'`'ları kırp.
 * 7. 63 karaktere kes.
 * 8. Baş/son `'-'`'ları TEKRAR kırp (kesme bir tireyi sona açığa çıkarabilir).
 */
export function normalizeTenantSlug(input: string): string {
  const folded = foldTurkishCase(input)
  const lowered = folded.toLowerCase()
  const withoutDiacritics = lowered.normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
  const hyphenated = withoutDiacritics.replace(/[^a-z0-9]+/g, '-')
  const collapsed = hyphenated.replace(/-+/g, '-')
  const trimmedOnce = collapsed.replace(/^-+|-+$/g, '')
  const truncated = trimmedOnce.slice(0, TENANT_SLUG_MAX_LENGTH)

  return truncated.replace(/^-+|-+$/g, '')
}

/**
 * Doğrulanmış slug sonucu — ayrımlı birleşim. `kind: 'invalid'` dalı
 * SEBEBİNİ taşır; `apps/api` bunu `ValidationError`'ın `fields.slug`
 * alanına eşler (CLAUDE.md §4: kullanıcı girdisi hataları alan bazlı döner;
 * yeni `AppError` sınıfı eklenmez — bu modül zaten hiçbir şey fırlatmaz).
 */
export type SlugValidationResult =
  | { readonly kind: 'valid' }
  | { readonly kind: 'invalid'; readonly reason: 'empty' | 'reserved' | 'format' }

/**
 * Kullanıcının GÖNDERDİĞİ slug'ı DOĞRULAR — NORMALİZE ETMEZ (bağlayıcı
 * ayrım, architect KARAR 1b). Kanonik olmayan her girdi (büyük harf, Türkçe
 * karakter, baş/son tire, rezerve ad, boş dize, 63'ten uzun biçim) REDDEDİLİR.
 *
 * Kontrol sırası `resolveHost()`'un rezerve-önce-desen sırasıyla TUTARLIDIR
 * (`resolve-host.ts:220` vs `:224`): boş → rezerve → biçim.
 *
 * ⚠ Bu fonksiyonun `valid` dönmesi host çözümlemesinde ÇÖZÜLEBİLECEĞİNİN
 * garantisi DEĞİLDİR (R-A3, dosya başı yorumu) — kabul oracle'ı
 * `resolveHost()`'un kendisidir, çağıran bunu İKİNCİ bir adım olarak
 * ÇALIŞTIRMAK ZORUNDADIR.
 */
export function validateTenantSlug(input: string): SlugValidationResult {
  if (input.length === 0) {
    return { kind: 'invalid', reason: 'empty' }
  }

  if (RESERVED_SUBDOMAINS.has(input)) {
    return { kind: 'invalid', reason: 'reserved' }
  }

  if (!TENANT_SLUG_PATTERN.test(input)) {
    return { kind: 'invalid', reason: 'format' }
  }

  return { kind: 'valid' }
}

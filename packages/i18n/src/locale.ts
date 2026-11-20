// @arkesoft/i18n — yerel ayar (locale) tipi ve varsayılanı (ROADMAP v0.0.18,
// T-027/S5a, AC-44)
//
// `DEFAULT_LOCALE` bu sürümün TEK içerikli yerel ayarıdır — `en-US` İÇERİĞİ
// kullanıcı onayıyla v1.5.0'a ERTELENDİ (R1, T-027.md "KAPSAM REVİZE
// EDİLDİ"). Format katmanı (`message-resolver.ts`, `format-date.ts`,
// `format-number.ts`) yine de LOCALE'DE JENERİKTİR — tek içerik bugün
// `tr-TR` olsa da çağıran kod ikinci bir locale geçebilir; bu, sentetik
// `'xx-XX'` fixture'ıyla kanıtlanır (message-resolver.test.ts).
//
// ⚠ `locale` bu sürümde DIŞ DÜNYADAN (kullanıcı/kiracı girdisi) GELMİYOR —
// her zaman çağıran kodun geçtiği bir FONKSİYON PARAMETRESİDİR (architect,
// "TENANT İZOLASYONU" bölümü: "locale bu sürümde fonksiyon parametresi,
// kiracı yapılandırmasından gelmiyor"). `localeSchema` yine de burada
// TANIMLIDIR — v1.5.0'da (kiracı bazlı dil) dış kaynaklı bir locale değeri
// geldiğinde doğrulama noktası hazır olsun diye; bugünkü tek çağıranı
// `tr-tr-errors.ts`'in KENDİ anahtarları değil, bu dosyanın testleridir.

import { z } from 'zod'

/**
 * Bu paketin bugünkü TEK içerikli yerel ayarı. `as const` ile literal tipi
 * korunur (precedent: `packages/errors/src/error-message-keys.ts`'in
 * `ERROR_MESSAGE_KEY_VALUES`'i) — `createMessageResolver`'a geçildiğinde
 * jenerik `L` parametresi `'tr-TR'` olarak DARALTILIR, `string`'e
 * genişletilmez.
 */
export const DEFAULT_LOCALE = 'tr-TR' as const

/**
 * BCP-47'nin basitleştirilmiş biçimi: `dil-BÖLGE` (örn. `tr-TR`, `en-US`).
 * Tam BCP-47 grameri (script alt etiketleri, varyantlar vb.) KASITLI OLARAK
 * desteklenmez — bu platformun bugünkü ve öngörülebilir ihtiyacı (tek
 * içerikli `tr-TR` + testlerin sentetik ikinci locale'i) için gereğinden
 * büyük bir yüzey açardı.
 */
export const localeSchema = z
  .string()
  .regex(/^[a-z]{2}-[A-Z]{2}$/, 'BCP-47 basit biçim bekleniyor: dil-BÖLGE (örn. tr-TR)')

export type Locale = z.infer<typeof localeSchema>

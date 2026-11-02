// @arkesoft/theme-sdk — `ThemeAssetRef` KALICI tanım (ROADMAP v0.0.9,
// T-010/S5, AC13'ün İKİNCİ ÜÇTE BİRİ)
//
// ⚠ YER TUTUCU KAPANIŞI (S3 → S5 handoff'u, "KARARLAR" bölümünde ayrıca
// bildirilir): S3, `src/settings/` altında bu biçimi geçici bir YER TUTUCU
// modülde tanımlamıştı (S5 henüz çalışmadığı için `src/manifest/` YOKTU;
// o modülün dosya adı burada bilerek TEKRARLANMIYOR — kendi varlığını
// ölçen `rg` taramasını yanlışlıkla kendi yorumuyla yeşile boyamasın, bkz.
// AGENT_BASELINE "literal-jeton kuralı"). Bu dosya KALICI tanımdır — S3'ün
// yer tutucusunda OLMAYAN tek fark YOL DOĞRULAMASIDIR (aşağıda).
// `../settings/primitives.ts` ve `../settings/schema-from-definitions.ts`
// bu modüle YÖNLENDİRİLDİ, S3'ün yer tutucu modülü SİLİNDİ (handoff'ta
// `rg` ham çıktısı ile kanıtlanır).
//
// ⚠ AC13'ÜN BAĞLAYICI KURALI (architect) — manifest HİÇBİR ALANDA servis
// edilen URL yolu veya önbellek başlığı ADLANDIRMAZ. `ThemeAssetRef.path`
// bir MANTIKSAL kimliktir ("bu varlık temaya ait, adı şu" — ör.
// `'assets/hero.jpg'`), SDK bunun NEREDEN servis edileceğini (hangi route,
// hangi CDN, hangi önbellek başlığıyla) SÖYLEMEZ. Bu BİLİNÇLİ BOŞLUK
// v0.0.10'un ÜÇ önbellek yolunu AÇIK TUTAR:
//   (a) bir SSR rotası üzerinden (ör. `apps/storefront`'un kendi route
//       handler'ı dosyayı okuyup servis eder)
//   (b) `/_astro/{tenantSlug}/…` biçiminde tenant'a kapsamlı statik bir yol
//   (c) bir vekil (proxy) / CDN üzerinden (ör. Cloudflare R2 önünde bir CDN)
// SDK bu üçünden BİRİNİ seçseydi, diğer ikisi v0.0.10'da platformun
// MAJORUNU gerektirecek bir geriye dönük uyumsuzluk doğururdu — bu yüzden
// `path` kasıtlı olarak "nereden" sorusuna CEVAP VERMEZ, yalnızca "hangi
// varlık" sorusuna cevap verir. `src/__tests__/no-service-url-fields.
// test.ts` (AC13 mekanik taraması) bu boşluğun `src/manifest/**`'te
// yanlışlıkla doldurulmadığını PİNLER.
//
// ⚠ H1 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti A, security'nin bulgusu)
// — YUKARIDAKİ DÖRT MADDE bir KARA LİSTE olarak uygulanıyordu; `security`
// 36 girdi ölçtü, 22'si TEK bir baştaki boşlukla, URL kodlamasıyla
// (`%2e%2e%2f`, çift kodlama `%252e…`), Unicode taklit karakterleriyle
// (tam genişlik nokta `．`, tek nokta öncüsü `․`), NUL/CR/LF/
// sekme/RTL geçersiz kılma kontrol karakterleriyle, rakamla başlayan bir
// şema önekiyle (`a1:/foo` — `/^[a-z]+:/i` RAKAMI KAÇIRIYORDU), boş
// dizeyle, SONDAKİ `/` ile VEYA 8 KB'lık bir yolla ATLATILABİLİYORDU.
// Kara listeyi İZİN LİSTESİNE (`ASSET_PATH_FORMAT_PATTERN`) çevirmek bu
// sınıfın TAMAMINI YAPISAL olarak kapatır — izin verilen karakter kümesi
// (`A-Za-z0-9._-` + ayraç `/`) kodlanmış/Unicode/kontrol karakteri/boşluk/
// şema öneki (`:`) HİÇBİRİNİ İÇERMEZ, bu yüzden bu girdiler desenle HİÇ
// EŞLEŞMEZ (ayrı ayrı kontrol EDİLMEZLER).
//
// ⚠ BİLİNÇLİ KARAR — `a..b/c.jpg` gibi bir segment: `..` SEGMENT olarak mı
// yasak, yoksa ALT DİZE olarak mı? Segment doğru cevap. `a..b` iki nokta
// İÇEREN ama `..` OLMAYAN bir segment — meşru bir dizin/dosya adı (ör. bir
// sürüm numarası veya bileşen adının parçası). Yol geçişi riski SADECE bir
// segmentin TAM OLARAK `..` olmasından doğar (üst dizine çıkma semantiği).
// Bu yüzden izin listesi karakter kümesi düzeyinde nokta/tire/alt çizgiye
// İZİN VERİR (aksi halde `a..b` de, meşru `v1.2.3` gibi bir ad da
// reddedilirdi) ve `..` SEGMENTİ ayrı, AÇIK bir kontrolle (aşağıda,
// `isTraversalSegment`) yakalanır — izin listesi TEK BAŞINA bunu
// AYIRT EDEMEZ (`..` karakterce `a..b`'nin bir ALT KÜMESİDİR).
//
// `path` REDDEDER (→ `THEME_ASSET_REF_INVALID`):
//   - boş dize VEYA `MAX_ASSET_PATH_LENGTH`'i aşan bir uzunluk
//   - izin verilen biçimin (harf/rakam ile BAŞLAR, harf/rakam/nokta/tire/
//     alt çizgi/`/` ile SÜRER) DIŞINDAKİ HER ŞEY — bu TEK madde eski kara
//     listenin dört maddesinin TAMAMINI (mutlak URL/şema öneki, baştaki
//     `/`, `\`) VE yukarıdaki 22 atlatmanın 21'ini YAPISAL olarak kapsar
//   - bir `..` SEGMENTİ (yol geçişi — yukarıdaki "BİLİNÇLİ KARAR" notu;
//     `a..b` gibi bir ALT DİZE DEĞİL, TAM segment eşleşmesi)

import { z } from 'zod'

import type { ThemeContractErrorCode } from '../errors.js'
import { THEME_CONTRACT_MESSAGES } from '../messages.js'

const THEME_ASSET_REF_INVALID_CODE: ThemeContractErrorCode = 'THEME_ASSET_REF_INVALID'

/**
 * İzin verilen `path` biçimi — ilk karakter harf/rakam, sonraki karakterler
 * harf/rakam/nokta/tire/alt çizgi, segmentler `/` ile ayrılır (dosya başı
 * yorumu, H1). Bu desenin DIŞINDA kalan HER ŞEY (boşluk, `%`, ters eğik
 * çizgi, `:`, kontrol karakteri, Unicode taklit karakteri, sondaki `/`
 * ile biten boş segment) yapısal olarak REDDEDİLİR.
 *
 * `export` — B5 düzeltmesi (T-010 düzeltme turu 1/3 · parti B, GÖRÜNÜRLÜK
 * DEĞİŞİKLİĞİ, MANTIK AYNI): `../json-schema.ts`'in `override` mekanizması
 * bu deseni `ThemeAssetRef.path`'in yayınlanan JSON Schema izdüşümüne
 * TAŞIMAK için yeniden kullanır — B4'ün semver dersi BİREBİR: ikinci bir
 * kopya tanımlamak (`json-schema.ts` içinde) iki kaynağın SAPMASI riskini
 * yeniden doğururdu, bu yüzden TEK kaynak burada kalır, sadece dışa açılır.
 */
export const ASSET_PATH_FORMAT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9._-]+)*$/

/**
 * `path` için üst uzunluk sınırı — 8 KB'lık bir girdiyi yapısal olarak
 * kapatır (H1). `export` — B5 düzeltmesi (yukarıdaki gerekçeyle AYNI).
 */
export const MAX_ASSET_PATH_LENGTH = 512

/** Bir yol segmentinin TAM OLARAK `..` olup olmadığı — ALT DİZE DEĞİL (dosya başı yorumundaki "BİLİNÇLİ KARAR"). */
function isTraversalSegment(segment: string): boolean {
  return segment === '..'
}

/** Bir `ThemeAssetRef.path` değerinin KABUL EDİLEBİLİR olup olmadığını kontrol eder — izin listesi + uzunluk sınırı + `..` segment reddi (dosya başı yorumu, H1). */
function isValidThemeAssetPath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_ASSET_PATH_LENGTH) {
    return false
  }

  if (!ASSET_PATH_FORMAT_PATTERN.test(path)) {
    return false
  }

  if (path.split('/').some(isTraversalSegment)) {
    return false
  }

  return true
}

/**
 * `ThemeAssetRef` şeması — `source` ayırt edici (discriminant) alanı
 * SABİTTİR (`'theme-asset'`), ileride başka kaynak türleri (ör.
 * `'external-url'`) eklenirse bu bir ayrımlı birleşime GENİŞLER (minor,
 * kapsam genişlemesi) — bugün tek üye olduğu için `z.literal` yeterli.
 */
export const THEME_ASSET_REF_SCHEMA = z.strictObject({
  source: z.literal('theme-asset'),
  path: z.string().check((payload) => {
    if (!isValidThemeAssetPath(payload.value)) {
      payload.issues.push({
        code: 'custom',
        input: payload.value,
        message: THEME_CONTRACT_MESSAGES.THEME_ASSET_REF_INVALID,
        params: { themeContractErrorCode: THEME_ASSET_REF_INVALID_CODE },
      })
    }
  }),
})

/** Bir temanın bir varlığına (asset) işaret eden mantıksal referans — SERVİS YOLU TAŞIMAZ (dosya başı yorumu). */
export type ThemeAssetRef = z.infer<typeof THEME_ASSET_REF_SCHEMA>

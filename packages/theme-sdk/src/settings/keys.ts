// @arkesoft/theme-sdk — ayar anahtarı güvenlik kuralı (ROADMAP v0.0.9,
// T-010/S3, AC6 BİRİNCİ KATMAN · T-010 düzeltme turu 1/3 · parti A, M1)
//
// Prototip kirliliği (prototype pollution) sınıfına karşı BİRİNCİ savunma
// hattı: bir ayar TANIMININ (`ThemeSettingDefinition`, theme.json'daki
// `settings` dizisinin bir elemanı) `key` alanı `__proto__` / `constructor`
// / `prototype` İSE bu, şema TANIMI PARSE EDİLİRKEN reddedilir —
// `THEME_SETTING_KEY_UNSAFE`. Yani bir tema YAZARI theme.json'ına böyle bir
// anahtar yazamaz; bu, henüz bir KULLANICI girdisi (JSONB'den okunan ayar
// DEĞERİ) söz konusu bile olmadan devreye giren bir kapı.
//
// İKİNCİ katman (AC6'nın asıl riskli noktası — ham JSONB'den okunan
// kullanıcı ayar DEĞERLERİ) `validate-settings.ts`'in sorumluluğu: Zod'un
// `safeParse` ÇIKTISINI döndürmek (ham girdiyi ASLA) — bkz. o dosyanın
// başındaki yorum. Bu iki katman BİRBİRİNİ TAMAMLAR, biri diğerinin yerini
// tutmaz: birinci katman olmasa bile ikinci katman tek başına güvenlidir
// (Zod'un kendi sağlamlaştırması, dosya başı yorumuna bakınız) — ama
// birinci katman, güvensiz bir anahtarın sözleşmeye hiç GİRMEMESİNİ sağlar
// (tema yazarı hatasını en erken noktada yakalar).
//
// ⚠ M1 DÜZELTMESİ (security'nin bulgusu) — eski hâli YALNIZCA üç adlı bir
// kara listeydi, `key` için HİÇBİR biçim/uzunluk doğrulaması YOKTU: `''`,
// `' '`, `'../x'`, `'a\nb'`, `'toString'`, `'<script>'`, 5000 karakter —
// HEPSİ kabul ediliyordu. Çözüm İKİ parça: (1) bir İZİN LİSTESİ deseni
// (`SETTING_KEY_FORMAT_PATTERN`) + üst uzunluk sınırı
// (`MAX_SETTING_KEY_LENGTH`) — boşluk, yol ayracı, kontrol karakteri, HTML
// benzeri işaret, aşırı uzunluk YAPISAL olarak kapatılır. (2) AÇIK isim
// kara listesi `toString` gibi isimler için ZORUNLU KALIR — `key` hem
// camelCase (`primaryColor`) HEM kebab-case (`heading-font`) desteklemek
// ZORUNDA (mevcut testler + v0.0.21'in şema→form motoru ikisini de
// kullanıyor), bu yüzden `toString` biçimsel olarak `primaryColor`'dan
// AYIRT EDİLEMEZ (ikisi de harf dizisi, bir büyük harf içeriyor) — allow-
// list TEK BAŞINA bu sınıfı kapatamaz, açık isim listesi ZORUNLU. Üç adlı
// kara liste `__proto__`/`constructor`/`prototype`'tan `Object.prototype`'ın
// diğer yerleşik üyelerine (`toString`, `valueOf`, `hasOwnProperty` vb.)
// GENİŞLETİLDİ — AYNI risk sınıfı (bir tüketicinin `obj[key]`'i çağırırken
// kullanıcı verisi yerine yerleşik bir metoda rastlaması), AYNI mekanizma
// (`isUnsafeSettingKey` + `THEME_SETTING_KEY_UNSAFE`), YENİ bir hata kodu
// AÇILMADI.

import { z } from 'zod'

import type { ThemeContractErrorCode } from '../errors.js'
import { THEME_CONTRACT_MESSAGES } from '../messages.js'

/**
 * `Object.prototype` zincirine karışabilecek VEYA onun yerleşik bir
 * üyesiyle çakışabilecek, bir ayar anahtarı olarak GÜVENSİZ isimler
 * (dosya başı yorumu, M1). `toString`/`valueOf`/`hasOwnProperty`/
 * `isPrototypeOf`/`propertyIsEnumerable`/`toLocaleString` — `Object.
 * prototype`'ın own-enumerable OLMAYAN yerleşik üyeleri; allow-list'in
 * (aşağıda) biçimsel olarak AYIRT EDEMEDİĞİ sınıf (dosya başı yorumu).
 */
const UNSAFE_SETTING_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'toLocaleString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
])

/** Bir ayar anahtarının güvensiz isimlerden biri olup olmadığını kontrol eder. */
export function isUnsafeSettingKey(key: string): boolean {
  return UNSAFE_SETTING_KEYS.has(key)
}

const THEME_SETTING_KEY_UNSAFE_CODE: ThemeContractErrorCode = 'THEME_SETTING_KEY_UNSAFE'

/**
 * İzin verilen `key` biçimi — bir HARFLE başlar, harf/rakam/tire/alt çizgi
 * ile sürer (M1, dosya başı yorumu). Hem camelCase (`primaryColor`) HEM
 * kebab-case (`heading-font`) desteklenir — TEK bir kılık (case)
 * ZORLANMAZ (mevcut testlerin ikisini de kullandığı ölçüldü).
 *
 * `export` — F4 düzeltmesi (T-010 düzeltme turu 2/3, security'nin bulgusu
 * S4) — `../json-schema.ts`'in `override`'ı bu deseni yayınlanan şemada
 * `key` alanının `pattern`'ı olarak YENİDEN KULLANIR (tek kaynak,
 * `ASSET_PATH_FORMAT_PATTERN`'in B5 emsaliyle BİREBİR aynı gerekçe).
 */
export const SETTING_KEY_FORMAT_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/

/**
 * `key` için üst uzunluk sınırı — bir JSONB nesne anahtarı/form alanı
 * kimliği için makul bir sınır (M1). `export` — F4 düzeltmesi, `SETTING_
 * KEY_FORMAT_PATTERN`'in export gerekçesiyle AYNI (yayınlanan şemanın
 * `maxLength`'i).
 */
export const MAX_SETTING_KEY_LENGTH = 128

/**
 * Bir `key`'in TAM olarak kabul edilebilir olup olmadığını (isim kara
 * listesi İLE BİRLİKTE biçim deseni + üst uzunluk sınırı) tek bir boole
 * sorusuna indirger.
 *
 * ⚠ F1 KÖK ÇÖZÜMÜ (T-010 düzeltme turu 2/3, solid'in bulgusu M2) — bu
 * fonksiyon ARTIK iki tüketicinin PAYLAŞTIĞI TEK kaynaktır:
 *   (1) `SETTING_KEY_SCHEMA` (aşağıda) — bir ayar TANIMI theme.json'dan
 *       Zod'un `.check()`'i İLE şema ayrıştırması SIRASINDA (manifest
 *       yolu, `primitives.ts` üzerinden).
 *   (2) `./unsafe-key-scan.js`'in `findUnsafeSettingKeyIssues` — üç
 *       DOĞRUDAN giriş noktasının (`schemaFromDefinitions` → `validate-
 *       settings.ts`/`defaults.ts`/`migrations/run.ts`, bkz. `./schema-
 *       from-definitions.ts` dosya başı yorumu) ORTAK savunmacı ön
 *       kontrolü.
 * ÖNCEDEN (tur 1/3) bu iki tüketici AYNI kuralın İKİ FARKLI GÜÇTEKİ
 * kopyasını taşıyordu — (1) isim kara listesi + biçim + uzunluk,
 * (2) YALNIZCA isim kara listesi (`isUnsafeSettingKey`). Sonuç: üç
 * DOĞRUDAN giriş noktasından geçen `''`/`' '`/`'../x'`/`'a\nb'`/
 * `'<script>'`/5000 karakter gibi biçimsel olarak geçersiz ama kara
 * listede OLMAYAN anahtarlar KABUL EDİLİYORDU — manifest yolunun (1)
 * REDDETTİĞİ AYNI girdiler. Artık TEK fonksiyon, TEK GÜÇ.
 */
export function isAcceptableSettingKey(key: string): boolean {
  const isFormatInvalid =
    key.length === 0 || key.length > MAX_SETTING_KEY_LENGTH || !SETTING_KEY_FORMAT_PATTERN.test(key)

  return !isUnsafeSettingKey(key) && !isFormatInvalid
}

/**
 * Bir ayar TANIMININ `key` alanı için paylaşılan Zod şeması. Sekiz ilkelin
 * (`primitives.ts`) HER BİRİ bu şemayı kullanır — tek bir doğrulama noktası,
 * sekiz kopya DEĞİL. Güvensiz BİR İSİM VEYA geçersiz bir biçim bulunduğunda
 * (M1 düzeltmesi — ikisi de AYNI issue/koda düşer, çağıran için anlamlı
 * TEK bir kod yeterli) `code: 'custom'` + `params.themeContractErrorCode`
 * ile işaretlenmiş bir issue PUSH edilir; `./zod-issue-mapping.js` bu
 * imzayı tanıyıp nihai `ThemeContractIssue`'yu `THEME_SETTING_KEY_UNSAFE`
 * koduyla üretir (genel-geçer fallback koda DÜŞMEDEN). `path` KASITLI
 * OLARAK belirtilmiyor — bu check `key` alanının KENDİSİNE bağlı olduğu
 * için ambient path zaten doğru yeri (`...key`) gösterir (bkz. `validate-
 * settings.ts`'teki benzer not).
 *
 * ⚠ F1 DÜZELTMESİ (T-010 düzeltme turu 2/3) — artık `isAcceptableSettingKey`
 * ÜZERİNDEN kurulur (yukarıdaki dosya başı notu) — kendi kontrolünü
 * TEKRARLAMAZ.
 */
export const SETTING_KEY_SCHEMA = z.string().check((payload) => {
  if (!isAcceptableSettingKey(payload.value)) {
    payload.issues.push({
      code: 'custom',
      input: payload.value,
      message: THEME_CONTRACT_MESSAGES.THEME_SETTING_KEY_UNSAFE,
      params: { themeContractErrorCode: THEME_SETTING_KEY_UNSAFE_CODE },
    })
  }
})

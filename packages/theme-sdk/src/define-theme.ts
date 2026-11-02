// @arkesoft/theme-sdk — `defineTheme()` yazar yardımcısı (ROADMAP v0.0.9,
// T-010/S8, architect "Modül yerleşimi" + AC10)
//
// `defineTheme()` bir tema geliştiricisinin kendi `theme.config.ts`
// dosyasında doğrudan çağıracağı tek giriş noktasıdır — ör.
// `export default defineTheme({ id: 'corporate-base', ... })`. Girdi
// `unknown`'dur (CLAUDE.md §4: dış dünyadan gelen hiçbir veriye parse
// edilmeden tip verilmez) — bir tema yazarının elle yazdığı bir nesne
// literali de bu paketin SINIRI dışından gelir, derleme zamanı tip
// kontrolüne GÜVENİLMEZ, çalışma zamanında `assertThemeManifest()`
// (S5'in işi) üzerinden GERÇEKTEN doğrulanır.
//
// ⚠ FIRLATAN API, AYRIMLI BİRLEŞİM DEĞİL — bu, paketin diğer doğrulama
// fonksiyonlarından (`validateThemeManifest`, `validateThemeSettings`)
// BİLİNÇLİ bir SAPMA, ama CLAUDE.md §4'E sapma DEĞİL, aksine ONA DÖNÜŞ:
// `errors.ts`'in dosya başı yorumu ayrımlı birleşimin ZORUNLU olduğu
// gerekçeyi "bir doğrulama çağrısı tek bir TÜKETİCİ/FORM katmanında çok
// sayıda bulguyu AYNI ANDA göstermek zorunda kalabilir" (ör. bir tRPC
// prosedürü, bir admin formu) olarak açıklar. `defineTheme()`'in tüketicisi
// FARKLI bir sınıf: bir tema geliştiricisinin KENDİ KAYNAK DOSYASI (`theme.
// config.ts`), bir form/API katmanı DEĞİL. Böyle bir dosyada geçersiz bir
// manifesti sessizce `{ ok: false }` olarak DÖNDÜRMEK (çağıranı bir `if`
// dalına zorlamadan) tema yazarının hatasının FARK EDİLMEDEN `undefined`
// bir tema ihraç etmesine yol açar — CLAUDE.md §4'ün "beklenen durumlar
// için hata FIRLAT, `null`/sessiz başarısızlık döndürüp çağıranı tahmine
// ZORLAMA" ilkesi burada TAM ANLAMIYLA uygulanır: `assertThemeManifest()`
// zaten bu ikizi taşıyor, `defineTheme()` onu ÇAĞIRIR, kendi başına yeni
// bir hata yolu İCAT ETMEZ.
//
// ⚠ AC6 KATMAN 1 — bu dosya güvensiz ayar anahtarı (`__proto__` /
// `constructor` / `prototype`) kontrolü için TEK SATIR KOD YAZMAZ, hiçbir
// özel dallanma İÇERMEZ. Kontrol zaten `settings/keys.ts`'in
// `SETTING_KEY_SCHEMA`'sında kurulu ve `settings/primitives.ts`'teki SEKİZ
// ilkelin HER BİRİ bu şemayı kullanıyor (`settingMetaShape.key`); bu şema
// da `manifest/manifest.ts`'in `THEME_MANIFEST_SCHEMA`'sının `settings`
// alanında YER ALIYOR. `defineTheme()` → `assertThemeManifest()` →
// `THEME_MANIFEST_SCHEMA.safeParse()` zincirinde bu kontrol ZATEN
// ÇALIŞIYOR — `defineTheme()`'in işi bu zinciri KURMAK, kontrolü TEKRAR
// YAZMAK değil (bkz. `src/__tests__/define-theme.test.ts`'teki AC6 testi,
// tek satır kontrol EKLEMEDEN bu yolun çalıştığını KANITLAR).

import { assertThemeManifest } from './manifest/validate-manifest.js'
import type { ThemeManifest } from './manifest/manifest.js'
import { deriveDefaultSettings } from './settings/defaults.js'
import type { ThemeSettingsValue } from './settings/schema-from-definitions.js'

/**
 * `defineTheme()`'in döndürdüğü, tipli tema tanımı. `manifest` doğrulanmış
 * (şema + migration topolojisi geçmiş) hâldir; `defaultSettings` manifestin
 * `settings` tanımlarından türetilmiş, her ayarın varsayılan değerini
 * taşıyan nesnedir (`deriveDefaultSettings`, S3'ün işi) — bir tema çalışma
 * zamanında bir mağaza için ayar DEĞERİ henüz YOKSA (ör. ilk kurulum) bu
 * nesne kullanılır.
 */
export interface ThemeDefinition {
  readonly manifest: ThemeManifest
  readonly defaultSettings: ThemeSettingsValue
}

/**
 * Bir tema yazarının manifestini (`theme.json` biçimindeki, `migrate`
 * fonksiyonlarıyla birlikte bellek-içi hâli — bkz. `manifest/manifest.ts`
 * dosya başı yorumu) tipli bir {@link ThemeDefinition}'a çevirir.
 *
 * Girdi `unknown`'dur ve `assertThemeManifest()` ile doğrulanır — manifest
 * şemayla eşleşmiyorsa VEYA migration zinciri topolojisi geçersizse bu
 * fonksiyon `ThemeContractError` FIRLATIR (dosya başı yorumu). Doğrulama
 * başarılıysa `manifest.settings`'ten varsayılan ayar DEĞERLERİ türetilir
 * (`deriveDefaultSettings`) — bu türetilmiş değerler AYRICA
 * `validateThemeSettings()`'ten GEÇMEK ZORUNDADIR (AC10); bu fonksiyonun
 * KENDİSİ bunu TEKRAR doğrulamaz (zaten `manifest.settings`'in KENDİ
 * şemasından türetilmiş bir değerdir, çift doğrulama gereksiz tekrar
 * olurdu) — AC10'un kanıtı `src/__tests__/define-theme.test.ts`'tedir.
 *
 * @param input - tema yazarının `theme.config.ts`'inde oluşturduğu,
 *   henüz doğrulanmamış manifest nesnesi.
 */
export function defineTheme(input: unknown): ThemeDefinition {
  const manifest = assertThemeManifest(input)
  const defaultSettings = deriveDefaultSettings(manifest.settings)

  return { manifest, defaultSettings }
}

// @arkesoft/theme-sdk — `validateThemeManifest()` + fırlatan ikizi (ROADMAP
// v0.0.9, T-010/S5, AC3 + AC4 + AC11 + `THEME_TEMPLATE_DUPLICATE`)
//
// Bu dosya İKİ doğrulama katmanını birleştirir:
//   (1) `THEME_MANIFEST_SCHEMA`'nın (manifest.ts) TEK `safeParse` çağrısı —
//       bilinmeyen anahtar reddi (AC4), `id`/`sdkRange` biçimi, VE
//       `templates` dizisinin kendi `.check()`'i (bilinmeyen ad/tekrar/eksik
//       zorunlu küme, AC11 + `THEME_TEMPLATE_DUPLICATE` — hepsi `templates.
//       ts`'te ŞEMANIN İÇİNE gömülü, bu dosya onları TEKRAR UYGULAMAZ).
//   (2) S4'ün `validateMigrationChain(manifest.migrations, manifest.version)`
//       çağrısı — İMZA SIRASI SABİT (po handoff'ta teyit edildi): migrations
//       ÖNCE, version SONRA. Bu paket içindeki TEK migration-topolojisi
//       doğrulama noktasıdır, `validate-manifest.ts` onu TEKRAR UYGULAMAZ.
//
// Her iki katman da aynı `ThemeContractIssue[]` biçimini paylaştığı için
// basitçe BİRLEŞTİRİLİR (concat) — ikisi de başarısızsa TÜM issue'lar bir
// arada döner (CLAUDE.md §4'ün "bir çağrı çok sayıda bulgu üretebilir"
// ilkesi, `errors.ts`'in dosya başı yorumu).
//
// ⚠ DÖNÜŞ ŞEKLİ `ThemeContractResult<T>`'TEN (errors.ts) BİLEREK FARKLI —
// görev tanımının imzası `{ ok: true; manifest: ThemeManifest } | { ok:
// false; issues }` (alan adı `manifest`, GENEL `value` DEĞİL — S3'ün
// `ThemeSettingsValidationResult`'ının `unknownKeys` ile yaptığı AYNI
// BİLİNÇLİ SAPMA). Manifest doğrulamasının "SOY ama RAPORLA" kavramı YOK
// (güven sınırı TERS — manifest REDDEDİLİR, bkz. `validate-settings.ts`
// dosya başı yorumu), bu yüzden `warnings` alanı da YOK — başarı dalı
// yalnızca `manifest`'i taşır.

import {
  ThemeContractError,
  type ThemeContractFailure,
  type ThemeContractIssue,
} from '../errors.js'
import { validateMigrationChain } from '../migrations/chain.js'
// ⚠ B1 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti B, A'nın bildirdiği
// YAPISAL KALINTI) — H2'nin ORKESTRASYON seviyesindeki KÖK `settings`
// kontrolü (bu dosyanın ESKİ hâli, `findDuplicateSettingKeyIssues`
// çağrısıyla) KALDIRILDI. Gerekçe: `manifest.ts`'in `settings` alanı artık
// `THEME_SETTINGS_LIST_SCHEMA`'yı (`../settings/primitives.ts`) kullanır —
// AYNI yinelenen-`key` kontrolünü ŞEMA SEVİYESİNDE taşır (`group.children`
// İLE AYNI mekanizma, bkz. `manifest.ts`'in "B1 DÜZELTMESİ" notu). Bu
// demektir ki `THEME_MANIFEST_SCHEMA.safeParse(input)` KÖK `settings`'teki
// bir yinelenen `key`'i ZATEN `parsed.success = false` olarak işaretler —
// aşağıdaki `if (!parsed.success)` dalı HER ZAMAN bu durumda erken döner,
// bu modüldeki orkestrasyon çağrısına ASLA ulaşılmaz (ÖLÇÜLEBİLİR: iki
// yüzey — kök `settings`, `group.children` — AYNI şema-seviyesi kontrolü
// paylaştığı için bir "şema geçti AMA yinelenen key var" senaryosu
// YAPISAL olarak İMKÂNSIZ). Kaldırmamanın tek sonucu ÖLÜ KOD + okuyucuyu
// YANILTAN bir "ikinci savunma katmanı" görüntüsü olurdu (gerçekte hiçbir
// zaman tetiklenmeyen bir kod yolu, "derinlemesine savunma" DEĞİL) — bu
// yüzden KALDIRILDI, ÇİFT RAPORLAMA riski kaynağında (yani bu dosyada
// hiçbir ek issue üretilmeyerek) kapatıldı. `../settings/duplicate-key-
// issues.ts` modülü SİLİNMEDİ — tek kalan tüketicisi `../settings/
// validate-settings.ts`'tir (DOKUNULMAZ, `validateThemeSettings`'in
// SAVUNMACI ön kontrolü; o fonksiyon manifest şemasından GEÇMEMİŞ ham bir
// dizi alabildiği için orada kontrol GERÇEKTEN gereklidir, bu dosyanınkiyle
// AYNI durum DEĞİLDİR).
// ⚠ TAŞIMA KARARI (handoff "KARARLAR"): bu modül S3'te `src/settings/`
// altında doğdu ve S5 onu `src/` KÖKÜNE taşımayı değerlendirdi (iki+ alan
// tüketiyor artık) — ama S6'nın EŞZAMANLI `migrations/run.ts`'i AYNI
// modülü ESKİ konumdan (`../settings/zod-issue-mapping.js`) import ediyordu
// ve S5'in `run.ts`'e dokunması YASAKTI; taşımak onun derlemesini KIRARDI.
// Bu yüzden modül `src/settings/` altında KALDI, bu dosya ona BİR SEVİYE
// YUKARI + `settings/` ile ulaşır (bkz. `../settings/zod-issue-mapping.ts`
// dosyasının başı, aynı karar orada da belgeli).
import { themeContractIssuesFromZodError } from '../settings/zod-issue-mapping.js'
import { THEME_MANIFEST_SCHEMA, type ThemeManifest } from './manifest.js'

/** `validateThemeManifest`'in BAŞARI dalı — alan adı `manifest` (görev tanımının imzası, dosya başı yorumu). */
export interface ThemeManifestValidationSuccess {
  readonly ok: true
  readonly manifest: ThemeManifest
}

/** `validateThemeManifest`'in dönüş birleşimi. */
export type ThemeManifestValidationResult = ThemeManifestValidationSuccess | ThemeContractFailure

/**
 * Bir `theme.json` + migration kümesinin TAM manifest nesnesini
 * (`defineTheme()`'in topladığı bellek-içi hâli, `unknown` — CLAUDE.md §4)
 * doğrular. Önce şema (bilinmeyen anahtar, biçim, şablon kuralları — dosya
 * başı yorumu madde 1), sonra migration zinciri topolojisi (madde 2)
 * sırayla kontrol edilir; şema BAŞARISIZSA migration kontrolüne hiç
 * GİRİLMEZ (migration kontrolü `manifest.version`/`manifest.migrations`'ın
 * ŞEMADAN GEÇMİŞ, tipli hâline ihtiyaç duyar).
 */
export function validateThemeManifest(input: unknown): ThemeManifestValidationResult {
  const parsed = THEME_MANIFEST_SCHEMA.safeParse(input)

  if (!parsed.success) {
    const issues: readonly ThemeContractIssue[] = themeContractIssuesFromZodError(
      parsed.error,
      'THEME_MANIFEST_INVALID',
    )
    return { ok: false, issues }
  }

  const migrationResult = validateMigrationChain(parsed.data.migrations, parsed.data.version)

  if (!migrationResult.ok) {
    return { ok: false, issues: migrationResult.issues }
  }

  return { ok: true, manifest: parsed.data }
}

/**
 * `validateThemeManifest`'in fırlatan ikizi. Çağıran taraf (ör. bir
 * `defineTheme()` çağrısının içinde, ya da bir tRPC prosedürünün üst
 * katmanında) ayrımlı birleşimi kendi elleriyle daraltmak İSTEMİYORSA
 * `issues`'u `ThemeContractError` olarak fırlatıp CLAUDE.md §4'ün genel
 * akışına (yakala → sarmala → yukarı ilet) katılabilir (bkz. `errors.ts`
 * dosya başı yorumu, S2'nin ergonomi gerekçesi).
 */
export function assertThemeManifest(input: unknown): ThemeManifest {
  const result = validateThemeManifest(input)

  if (!result.ok) {
    throw new ThemeContractError(result.issues)
  }

  return result.manifest
}

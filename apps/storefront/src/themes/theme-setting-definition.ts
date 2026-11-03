// @arkesoft/storefront — `ThemeSettingDefinition` tipinin YEREL karşılığı
// (ROADMAP v0.0.10, T-012/S7)
//
// ⚠ BU TİP `@arkesoft/theme-sdk`'DAN DOĞRUDAN İTHAL EDİLMEZ (ölçüldü):
// `apps/storefront/package.json` (S3'ün dosyası, DOKUNULMADI — po'nun
// ataması) `@arkesoft/theme-sdk`'yi BAĞIMLILIK olarak BİLDİRMİYOR; pnpm'in
// KATI (strict) node_modules izolasyonu altında `apps/storefront/
// node_modules/@arkesoft/`'te `theme-sdk` YOK (`@arkesoft/themes-modern`'in
// GEÇİŞLİ bağımlılığı olsa da storefront'un KENDİ node_modules'ına
// SIZMAZ — pnpm "phantom dependency" KORUMASI). Bu yüzden `apps/storefront/
// src/**` içinde `'@arkesoft/theme-sdk'`'den DOĞRUDAN bir `import`
// (TİP-SADECE dahi) `pnpm typecheck`i KIRAR — modül FİZİKSEL OLARAK
// bulunamaz.
//
// Çözüm: zaten bağımlılık olan `@arkesoft/themes-modern`'in somut
// `modernTheme` DEĞERİNİN ÇIKARILMIŞ (`typeof`) tipinden TÜREMEK —
// `packages/themes/modern/src/theme.config.ts`'in KENDİ `import {
// defineTheme } from '@arkesoft/theme-sdk'` çağrısı o paketin KENDİ
// `node_modules` zincirinden (orada SEMBOLİK BAĞ VAR) çözülür; storefront
// yalnızca SONUCUN tipini DEVRALIR, SDK modülünü KENDİSİ hiç çözmez. Bu,
// `ThemeSettingDefinition`'IN İKİNCİ bir TANIMI DEĞİL — YAPISAL OLARAK
// AYNI tip (theme-sdk'nın sekiz ilkelinin ayrımlı birleşimi), SADECE
// ERİŞİM YOLU farklı.
//
// Bu dosya SIFIR değer EXPORT eder — yalnızca tip. `./registry.ts` ve
// `./theme-css.ts` İKİSİ de BURADAN alır; tip İKİ YERDE AYRI AYRI
// TÜRETİLMEZ (tek kaynak, bu dosya).
import type { modernTheme } from '@arkesoft/themes-modern'

/** `ThemeManifest.settings`'in tek bir elemanının tipi — sekiz ilkelin ayrımlı birleşimi. */
export type ThemeSettingDefinition = (typeof modernTheme.manifest.settings)[number]

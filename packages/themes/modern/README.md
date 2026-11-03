# @arkesoft/themes-modern

`modern` temasının ilk sürümü — `home` + `404` şablonları, temel bileşenler
(`PageSection`, `PageHeading`, `BodyText`). ROADMAP v0.0.10, T-012/S5'te
doğdu (bu paket önceki sürümde hiç yoktu — `packages/themes/*` glob'u
`pnpm-workspace.yaml:9`'da hazırdı ama dizin boştu).

Kaynak: `docs/ui/T-012.md` (palet, kontrast tablosu, bileşen envanteri,
responsive plan — birebir uygulandı) + `.claude/workflow/tasks/T-012.md`
(architect K1-K5, ADR-0002 taslağı).

## Paket yapısı — kaynak-dağıtımlı (ADR-0002 Karar 1)

Bu paket **`dist/` üretmez**, `"build"` script'i **yok**. Tek derleyici,
tüketen tarafın (bugün yalnızca `apps/storefront`) kendi Astro/Vite ardışık
düzeni. `package.json`'un `exports` alanı doğrudan kaynağa işaret eder:

```json
{
  ".": "./src/theme.config.ts",
  "./templates/*": "./src/templates/*.astro"
}
```

`"version": "0.0.0"` bir yazım hatası DEĞİL — Changesets'in
`updateInternalDependencies: "patch"` kaskadı ile `max(minor, kaskat patch)`
hesabının kasıtlı bir parçası (ayrıntı: S5 handoff "KARARLAR"). Manifestin
KENDİ `version`/`sdkRange` alanları (`src/theme.config.ts`) bu alandan
**ayrı** bir kavramdır — biri paketin npm/pnpm sürümü, diğeri **tema
sözleşmesinin** sürümü.

## Dosyalar

- `src/theme.config.ts` — `defineTheme()` ile kurulan manifest: beş ayar
  (`color-primary`, `color-surface`, `color-body`, `font-heading`,
  `font-body`), iki şablon beyanı (`home`, `404`), sıfır migration.
  **`image` tipinde ayar yok** (bilinçli — BN-1/SEC-5 sıralama kısıtı,
  varlık servis çözücüsü bu sürümde yazılmıyor).
- `src/templates/home.astro`, `src/templates/404.astro` — içerik PARÇALARI
  (fragment); `BaseLayout` İTHAL ETMEZLER (bu paket hiçbir `apps/*`'a
  bağlanmaz). Metin (`heading`/`body`) **prop**'tur, sabit Türkçe dize
  YOK (bu paket `apps/storefront/src/messages/messages.ts`'i ithal
  **edemez** — CLAUDE.md §3 yön kısıtı). ⚠ `404.astro` bu sürümde rotaya
  **bağlanmıyor** (architect risk 6) — yalnızca manifestin zorunlu şablon
  beyanını karşılamak için var.
- `src/components/PageSection.astro`, `PageHeading.astro`, `BodyText.astro`
  — saf semantik HTML (`div`/`h1`/`p`), hiçbiri etkileşimli değil. Token
  tüketimi Astro'nun bileşen-kapsamlı `<style>` elementi + düz CSS sınıfı
  ile (ne `style` özniteliği ne Tailwind'in `(--x)` kısayolu — gerekçe
  `PageSection.astro`'nun dosya başı yorumunda, özet S5 handoff'ta).
- `src/__tests__/theme-manifest.test.ts` — `validateThemeManifest()`'in
  `modern@0.1.0` manifestini kabul ettiğini, `home`+`404`'ün ikisinin de
  beyan edildiğini, `image` ayarının yokluğunu ve `color-primary`
  anahtarının varlığını doğrular (AC1).

## Bilinen sınır

`.astro` dosyaları bu paketin `typecheck`/`lint` komutlarından **geçmez**
— `tsc` `.astro` söz dizimini anlamıyor (bilinen repo-geneli borç, vade
v0.0.19, `astro check` + görsel regresyon birlikte gelecek). Bu paketin
`tsc`/`eslint` kapsamı yalnızca `src/theme.config.ts` ve
`src/__tests__/*.test.ts`'tir.

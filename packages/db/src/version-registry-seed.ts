// @arkesoft/db — sürüm kayıt defterinin seed'e yazacağı değerlerin TEK
// doğruluk kaynağı (ROADMAP v0.0.21, T-018/S5, ADR-0020 Karar 1 + architect
// AC-10/A-T18-2).
//
// AC-10 (LİTERAL YASAĞI, bağlayıcı): `seed.ts`/`seed-data.ts`/bu dosya hiçbir
// sürüm numarasını ELLE YAZMAZ. Üç kaynak:
//   - platform sürümü ← bu PAKETİN (`@arkesoft/db`) kendi `package.json`'ı
//     (`.changeset/config.json` `fixed` grup üyesi — platform sürümüyle
//     LOCKSTEP, bugün ikisinin değeri EŞİT). Desen `apps/api/src/config/
//     platform-version.ts`'ten alındı — FONKSİYONUN KENDİSİ yeniden
//     kullanılamadı (`packages/db` `apps/api`'den import EDEMEZ, bağımlılık
//     yönü), yalnızca ÖRÜNTÜ.
//   - API sürümü ← `@arkesoft/trpc`'nin (public API birimi) KENDİ
//     `package.json`'ı — BAĞIMSIZ bir semver birimi, platformun `fixed`
//     grubunun DIŞINDA (bugünkü değeri platformunkinden FARKLI; platformla
//     EŞİT OLMAK ZORUNDA DEĞİL — literal yazmak iki birimi yanlışlıkla
//     eşitlerdi). `@arkesoft/trpc`'nin
//     `exports` haritası YALNIZCA `"."` taşıdığı için
//     `createRequire(...).resolve('@arkesoft/trpc/package.json')` ÇALIŞMAZ
//     (architect üç yol değerlendirdi — Task raporu "AC-10 EK"): (a)
//     `exports['./package.json']` eklemek public API birimine dokunur, (b)
//     `trpc`'den bir sabit dışa açmak additive export = API minor bump'ı
//     olur — ikisi de REDDEDİLDİ. (c) SEÇİLEN: workspace İÇİNDEKİ BAĞIL yolu
//     Zod doğrulamalı okumak + bir DRİFT testiyle pinlemek (bkz.
//     `__tests__/version-registry-seed.test.ts`). Tüm paketler `private: true`
//     → yayınlanma kırılganlığı yok.
//   - tema id/sürüm/sdkRange ← `@arkesoft/themes-modern`'in KENDİ
//     manifestinden (`theme.config.ts`) İTHAL EDİLEREK (AC-2 türetme testi
//     bunu pinler — manifest değiştiğinde test kendiliğinden kırmızıya düşer).
//
// A-T18-2 (architect varsayımı — BURADA ÖLÇÜLDÜ, Task raporu "A-T18-2
// ÖLÇÜMÜ"): bu dosya derlenince `dist/version-registry-seed.js` olur.
// `tsconfig.build.json`'ın `rootDir: "src"` / `outDir: "dist"` AYNI
// derinlikte olduğu için (ikisi de doğrudan paket kökünün altında) kaynak ve
// derlenmiş hâlde AYNI bağıl yol çalışır:
//   src/version-registry-seed.ts  → ../package.json         = packages/db/package.json
//   dist/version-registry-seed.js → ../package.json         = packages/db/package.json
//   src/version-registry-seed.ts  → ../../trpc/package.json = packages/trpc/package.json
//   dist/version-registry-seed.js → ../../trpc/package.json = packages/trpc/package.json
// Her iki bağlam da (vitest'in `src/` koşumu VE `node dist/version-registry-seed.js`
// yolu) AYRI AYRI koşturularak doğrulandı (ham çıktı Task raporunda).
//
// `@arkesoft/themes-modern` BU PAKETİN (`@arkesoft/db`) `dependencies`'inde
// (devDependencies DEĞİL — po'nun ilk önerisinden BİLİNÇLİ SAPMA, Task
// raporunun KARARLAR'ında gerekçeli): bu modül, test DIŞINDA, ÇALIŞMA
// ZAMANINDA `seed.ts` tarafından çağrılır (`node dist/seed.js`) — tema
// değerini `@arkesoft/themes-modern`'den okumak PRODUCTION kod yolunun bir
// parçasıdır, yalnızca test'in değil. `devDependencies`'e koymak `pnpm install
// --prod` gibi bir bağlamda bu importu ÇÖZÜMSÜZ bırakırdı.
//
// Dış dünyadan gelen her veri (bir `package.json` dosyasının okunması da dış
// veridir) Zod ile parse edilir (CLAUDE.md §4).
//
// Bu dosya `src/index.ts` barrel'ından DIŞA AÇILMAZ — paket içi (private)
// kalır; TEK tüketicisi `src/seed.ts`'tir (+ kendi testi).

import { readFileSync } from 'node:fs'

import { modernTheme } from '@arkesoft/themes-modern'
import { z } from 'zod'

const PACKAGE_VERSION_SCHEMA = z.object({
  version: z.string().min(1, 'boş olamaz'),
})

/**
 * Verilen `package.json` dosyasının yalnızca `version` alanını Zod ile
 * doğrulayıp döner. Geçersiz/okunamayan dosyada `fs`/Zod hatası ÇAĞIRANA
 * iletilir (yutulmaz) — `apps/api/src/config/platform-version.ts`'in BİREBİR
 * deseni. Test için dışa açılır (bu modülün `index.ts` barrel'ından
 * GEÇMEYEN iki tüketicisi: `resolvePlatformVersion`/`resolveApiVersion` ve
 * `__tests__/version-registry-seed.test.ts`).
 */
export function readPackageVersion(packageJsonUrl: URL): string {
  const raw = readFileSync(packageJsonUrl, 'utf-8')
  const parsed = PACKAGE_VERSION_SCHEMA.parse(JSON.parse(raw) as unknown)
  return parsed.version
}

/**
 * Bu paketin (`@arkesoft/db`) kendi sürümü — platformla LOCKSTEP (dosya başı
 * yorumu). `platform_release.version` ve `tenant_version_state.platform_version`
 * BU değerden yazılır.
 */
export function resolvePlatformVersion(): string {
  return readPackageVersion(new URL('../package.json', import.meta.url))
}

/**
 * `@arkesoft/trpc`'nin (public API birimi) kendi sürümü — platformdan
 * BAĞIMSIZ (dosya başı yorumu). `platform_release.min_api_version` ve
 * `tenant_version_state.api_version` BU değerden yazılır.
 */
export function resolveApiVersion(): string {
  return readPackageVersion(new URL('../../trpc/package.json', import.meta.url))
}

/**
 * `seed.ts`'in sürüm kayıt defteri tablolarına yazacağı TÜM değerler — TEK
 * kaynak (ADR-0020 Karar 1: "Seed iki yere de yazar, tek bir kaynak
 * sabitten"). `seed.ts` bu fonksiyonu BİR KEZ çağırır; dönen nesne
 * `platform_release`/`theme`/`theme_release`/`tenant_version_state`'in
 * DÖRDÜNE DE ve `Tenant.theme*`'e (deprecated ayna kolon, ADR-0020 Karar 1)
 * YAZILIR — AC-11'in sapma testinin temel aldığı tekillik budur.
 */
export type VersionRegistrySeedValues = {
  readonly platformVersion: string
  readonly apiVersion: string
  readonly themeId: string
  readonly themeName: string
  readonly themeVersion: string
  readonly themeSdkRange: string
}

/**
 * {@link VersionRegistrySeedValues}'ı tek bir çağrıda üretir. Tema alanları
 * `@arkesoft/themes-modern`'in `defineTheme()` çıktısından (`modernTheme.manifest`)
 * okunur — AC-2'nin türetme testi bu üçünü ayrıca `@arkesoft/themes-modern`'den
 * ithal ederek karşılaştırır (manifest değişirse test kırmızıya düşer).
 */
export function resolveVersionRegistrySeedValues(): VersionRegistrySeedValues {
  return {
    platformVersion: resolvePlatformVersion(),
    apiVersion: resolveApiVersion(),
    themeId: modernTheme.manifest.id,
    themeName: modernTheme.manifest.name,
    themeVersion: modernTheme.manifest.version,
    themeSdkRange: modernTheme.manifest.sdkRange,
  }
}

// @arkesoft/db — `version-registry-seed.ts`'in SAF birim testleri (ROADMAP
// v0.0.21, T-018/S5, AC-2 türetme testi + AC-10 literal yasağı + A-T18-2
// ölçümü).
//
// Bu dosya `*.isolation.test.ts` DEĞİLDİR — DB'ye dokunmaz, normal
// `pnpm --filter @arkesoft/db test` hattında koşar. Test koşumu Vitest'in
// Vite dönüştürücüsü üzerinden `src/` TypeScript kaynağını ÇALIŞTIRIR —
// A-T18-2'nin "src/ bağlamı" ölçümü BURADAN gelir. "dist/" bağlamının ölçümü
// (derlenmiş `.js` çıktısının plain `node` ile çalıştırılması) bu test
// dosyasının DIŞINDADIR (Vitest bir derleme adımı koşturmaz) — Task
// raporunun "A-T18-2 ÖLÇÜMÜ" bölümünde AYRI bir kabuk komutuyla kanıtlanır.
//
// AC-10 (LİTERAL YASAĞI) — bu test dosyası da `0.1.0`/`0.6.0`/`0.7.0`/`0.8.0`
// gibi bir sürüm numarasını ELLE YAZMAZ: her beklenen değer BAĞIMSIZ bir
// okuma (bu dosyanın kendi `readFileSync`'i veya `@arkesoft/themes-modern`'in
// KENDİ import'u) üzerinden türetilir — `version-registry-seed.ts`'in
// DÖNÜŞÜNÜ KENDİSİYLE karşılaştırmak (tautoloji) YERİNE, İKİNCİ BAĞIMSIZ bir
// okuma yoluyla karşılaştırılır (AC-11'in "sabiti kendisiyle karşılaştırma"
// yasağının BU dosyadaki karşılığı).

import { readFileSync } from 'node:fs'

import { modernTheme } from '@arkesoft/themes-modern'
import { describe, expect, it } from 'vitest'

import {
  readPackageVersion,
  resolveApiVersion,
  resolvePlatformVersion,
  resolveVersionRegistrySeedValues,
} from '../version-registry-seed.js'

/** Gevşek bir semver-BENZERİ biçim kontrolü — tam semver grameri BU dosyanın işi değil. */
const SEMVER_LIKE_PATTERN = /^\d+\.\d+\.\d+/

describe('resolvePlatformVersion', () => {
  it('@arkesoft/db paketinin KENDİ package.json’ındaki sürümü döner (BAĞIMSIZ ikinci okuma ile)', () => {
    const independentlyRead = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
    ) as { readonly version: string }

    const resolved = resolvePlatformVersion()

    expect(resolved).toBe(independentlyRead.version)
    expect(resolved).toMatch(SEMVER_LIKE_PATTERN)
  })
})

describe('resolveApiVersion', () => {
  it('@arkesoft/trpc paketinin KENDİ package.json’ındaki sürümü döner (BAĞIMSIZ ikinci okuma ile) — A-T18-2', () => {
    // A-T18-2: `../../trpc/package.json` bağıl yolunun `src/` bağlamında
    // çözüldüğünün ölçümü — bu testin KENDİSİ bu bağlamda koşuyor (Vitest
    // `src/**/*.test.ts`'i derlemeden, Vite dönüştürücüsüyle çalıştırır).
    const independentlyRead = JSON.parse(
      readFileSync(new URL('../../../trpc/package.json', import.meta.url), 'utf-8'),
    ) as { readonly version: string }

    const resolved = resolveApiVersion()

    expect(resolved).toBe(independentlyRead.version)
    expect(resolved).toMatch(SEMVER_LIKE_PATTERN)
  })

  // ⚠⚠ qa gate T-018 tur 1, SD-6 düzeltmesi (solid gate'in bulgusu) — eski
  // hâli (`expect(platformVersion).toMatch(SEMVER_LIKE_PATTERN)` +
  // `expect(apiVersion).toMatch(SEMVER_LIKE_PATTERN)`) test adının
  // ("BAĞIMSIZLIĞI pinler") vaat ettiğinden AZINI denetliyordu: her iki
  // assertion da yukarıdaki iki `describe`'da ZATEN var olan desen
  // kontrolünün bir TEKRARIYDI — yeni bir davranışı PİNLEMİYORDU (fiilen
  // no-op). Düzeltme: bağımsızlığın GERÇEK pini — iki değerin GERÇEKTEN
  // FARKLI dosyalardan okunduğunu (aynı dosyadan tesadüfen eşit çıkıp
  // "bağımsız" sanılmadığını) ve her birinin KENDİ dosyasındaki değere
  // birebir eşit olduğunu AYNI testte doğrular.
  it('platform ve API sürümleri birbirinden TÜRETİLMEZ — GERÇEKTEN farklı iki package.json dosyasından okunur (bağımsızlığın pini, qa gate T-018 tur 1 SD-6 düzeltmesi)', () => {
    const platformPackageJsonUrl = new URL('../../package.json', import.meta.url)
    const apiPackageJsonUrl = new URL('../../../trpc/package.json', import.meta.url)

    // Önce vektörün GERÇEKTEN iki AYRI dosya olduğunu doğrula — yoksa
    // aşağıdaki eşitlik kontrolleri "bağımsız" iddiasını YANLIŞ SEBEPLE
    // (aynı dosyadan iki kez okuma) kanıtlamış olurdu.
    expect(apiPackageJsonUrl.pathname).not.toBe(platformPackageJsonUrl.pathname)

    const platformPackageJson = JSON.parse(readFileSync(platformPackageJsonUrl, 'utf-8')) as {
      readonly version: string
    }
    const apiPackageJson = JSON.parse(readFileSync(apiPackageJsonUrl, 'utf-8')) as {
      readonly version: string
    }

    expect(resolvePlatformVersion()).toBe(platformPackageJson.version)
    expect(resolveApiVersion()).toBe(apiPackageJson.version)
  })
})

describe('resolveVersionRegistrySeedValues — AC-2 türetme testi', () => {
  it('tema id/sürüm/sdkRange, @arkesoft/themes-modern’in KENDİ manifestinden İTHAL EDİLEN değerlerle BİREBİR eşittir', () => {
    // ⭐ Manifest değişirse (`packages/themes/modern/src/theme.config.ts`)
    // bu test KENDİLİĞİNDEN kırmızıya düşer — her iki taraf da AYNI
    // `@arkesoft/themes-modern` import'undan (burada İKİNCİ, BAĞIMSIZ bir
    // import satırı; `version-registry-seed.ts`'in kendi import'u DEĞİL)
    // okunur.
    const resolved = resolveVersionRegistrySeedValues()

    expect(resolved.themeId).toBe(modernTheme.manifest.id)
    expect(resolved.themeName).toBe(modernTheme.manifest.name)
    expect(resolved.themeVersion).toBe(modernTheme.manifest.version)
    expect(resolved.themeSdkRange).toBe(modernTheme.manifest.sdkRange)
  })

  it('bugün ölçülmüş değerler: id="modern", version="0.1.0", sdkRange=">=0.1.0 <1.0.0" (architect ölçümü — manifest DEĞİŞMEDİĞİ sürece)', () => {
    // ⚠ Bu test İSTİSNAİ olarak literal taşır — AC-10'un yasakladığı "seed'in
    // KENDİ yazdığı değeri elle yazmak" DEĞİL, "bugün BİLİNEN manifest
    // değerinin BEKLENDİĞİ gibi kaldığını" belgeleyen bir REGRESYON testidir
    // (architect'in Task raporundaki "bugünkü ölçülmüş değerler"). AC-10'un
    // `rg` taraması bu dosyayı KAPSAMAZ (yalnızca `seed.ts`/`seed-data.ts`/
    // `version-registry-seed.ts` taranır) — bu satır o üç dosyanın
    // HİÇBİRİNDE YOK.
    const resolved = resolveVersionRegistrySeedValues()

    expect(resolved.themeId).toBe('modern')
    expect(resolved.themeVersion).toBe('0.1.0')
    expect(resolved.themeSdkRange).toBe('>=0.1.0 <1.0.0')
  })

  it('platform/API sürümleri resolvePlatformVersion()/resolveApiVersion() ile AYNI (tek çağrı, tek kaynak)', () => {
    const resolved = resolveVersionRegistrySeedValues()

    expect(resolved.platformVersion).toBe(resolvePlatformVersion())
    expect(resolved.apiVersion).toBe(resolveApiVersion())
  })
})

describe('readPackageVersion — Zod doğrulaması (hata yutulmaz)', () => {
  it('var olmayan bir dosya için fs hatasını ÇAĞIRANA iletir (yutmaz)', () => {
    expect(() =>
      readPackageVersion(new URL('./__fixtures__/does-not-exist.json', import.meta.url)),
    ).toThrow()
  })
})

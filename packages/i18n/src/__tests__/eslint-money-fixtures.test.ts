// @arkesoft/i18n — AC-47 float-para ESLint kuralının DAVRANIŞSAL kanıtı
// (ROADMAP v0.0.18, T-027 düzeltme turu 2, `solid` tur 2 `medium` #1).
//
// BULGU (solid, `.claude/workflow/reviews/T-027-solid-tur2.md`): `pnpm guards`'ın
// 24. adımı (AC-45+AC-46) `base.js`'teki `moneyRestrictedSyntaxSelectors`
// değişkeninin VAR OLDUĞUNU ve TAM İKİ KEZ GEÇTİĞİNİ (metin sayımı) doğruluyor;
// altı fikstür (`packages/config/eslint/__fixtures__/money-{pozitif,negatif}-
// {1,2,3}.ts`) ise `base.js:32`'nin global `IGNORES` listesine
// (`'eslint/__fixtures__/**'`) girdiği için `pnpm lint` tarafından HİÇ
// değerlendirilmiyor. Depoda ESLint'i PROGRAMATİK koşturan başka hiçbir dosya
// yoktu (ölçüm: `ESLint|Linter|loadESLint` için depo geneli tarama → 0 eşleşme,
// `solid`'in raporunda kayıtlı) ⇒ kuralın gerçek fikstürler üzerinde ATEŞLEDİĞİ
// hiçbir mekanik kapı tarafından KANITLANMAMIŞTI. Kanıtlanmış atlatma
// (Orkestratör, aynı raporda): `base.js:386`'daki
// `...moneyRestrictedSyntaxSelectors,` kullanım satırı YORUMA alınınca (jeton
// metinde hâlâ geçtiği için geçiş sayısı "2" olarak KALIYOR) → `pnpm guards`
// 24/24 YEŞİL, ama üç fikstür de artık 0 hata veriyor — AC-47'nin TÜM
// korumasını metin sayımı GÖRMEDEN öldürüyor.
//
// Bu dosya base.js'in flat config'ini (`createBaseConfig`) ESLint'in
// PROGRAMATİK API'siyle (`new ESLint(...)`) yükler ve altı fikstürü
// `ignore: false` ile (base.js:30-31'in kendi önerdiği `--no-ignore`
// eşdeğeri) lint eder:
//   - 3 POZİTİF fikstür → her biri EN AZ 1 `no-restricted-syntax` hatası
//   - 3 NEGATİF fikstür → her biri TAM 0 hata
// `base.js:386`'daki spread yoruma alınırsa veya `MONEY_NAME_SOURCE` hiçbir
// şeye uymayan bir desene çevrilirse (ör. `'(?!)'`) 3 pozitif fikstür 0 hataya
// düşer ⇒ bu test KIRMIZI olur — `pnpm guards`'ın GÖRMEDİĞİ sınıfı kapatır.
//
// YENİ BAĞIMLILIK YOK: `eslint` ve `@arkesoft/config` ikisi de bu paketin
// (`@arkesoft/i18n`) ZATEN kurulu devDependency'leri (ölçüm:
// `packages/i18n/package.json`); `purity.test.ts`'in pinlediği `dependencies`
// (üretim grafiği) DEĞİŞMİYOR — bu dosya `src/__tests__/` altında, o pin
// yalnızca `src/`'in doğrudan altındaki ÜRETİM dosyalarını tarar.
//
// KONUM KARARI (solid'in sorusu — "nereye koyacaksın"): `packages/config`'in
// bir `test` script'i YOK ve `.github/ci-expected-test-packages.txt` onu
// açıkça `<NONEXISTENT>` olarak kaydetmiş durumda; o dosyaya dokunmak hem
// T-026 kısıtını (`.github/**` yasak) hem de `check_fake_green_test_packages`
// kapısını ihlal ederdi (seçenek (b), handoff'ta açıkça ELENDİ). `packages/
// i18n` üç nedenle doğru ev: (1) `@arkesoft/config`'e devDependency OLARAK
// ZATEN bağımlı, (2) float-para kuralının ASIL KONUSU (`Money`) bu pakette,
// (3) `.github/ci-expected-test-packages.txt`'te ZATEN kayıtlı bir paket ⇒
// yeni bir CI boşluğu AÇMIYOR (mevcut `admin`/`superadmin`/`api` hatlarının
// kapanışında zaten GERÇEKTEN koşuyor, bkz. o dosyanın T-027/S1 güncellemesi).
//
// TİP NOTU: `@arkesoft/config/eslint/base`'in yayımlanmış bir `.d.ts`'i yok
// (saf JS + JSDoc); bu paketin `tsconfig.json`'ı `allowJs` açmıyor. `as`/
// `as unknown as` tip zorlamasına BAŞVURMADAN (CLAUDE.md §4: tip zorlaması
// yalnızca runtime doğrulamasından hemen sonra kabul edilir, burada runtime
// doğrulaması yok) doğru tipi almak için `createBaseConfig`'in `base.js:337`
// imzasını aynalayan bir AMBİENT MODÜL BİLDİRİMİ eklendi — bkz.
// `./arkesoft-config-eslint-base.d.ts`.

import path from 'node:path'

import { createBaseConfig } from '@arkesoft/config/eslint/base'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

/** `packages/config` paketinin kök dizini — fikstürler ve `tsconfig.json` burada. */
const CONFIG_PACKAGE_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', 'config')

const FIXTURES_DIR = path.join(CONFIG_PACKAGE_ROOT, 'eslint', '__fixtures__')

const POSITIVE_FIXTURES = ['money-pozitif-1.ts', 'money-pozitif-2.ts', 'money-pozitif-3.ts']
const NEGATIVE_FIXTURES = ['money-negatif-1.ts', 'money-negatif-2.ts', 'money-negatif-3.ts']

/**
 * `base.js`'in gerçek flat config dizisi — `packages/config/eslint.config.mjs`'in
 * birebir yaptığı çağrı (`tsconfigRootDir: CONFIG_PACKAGE_ROOT`), ki
 * `allowDefaultProject: ['eslint/__fixtures__/*.ts']` deseni (base.js:360)
 * bu kökle doğru çözümlensin.
 */
const flatConfig = createBaseConfig({
  tsconfigRootDir: CONFIG_PACKAGE_ROOT,
})

/** Tek bir fikstürü lint edip `no-restricted-syntax` hata sayısını döner. */
async function lintFixture(fileName: string): Promise<number> {
  const eslint = new ESLint({
    cwd: CONFIG_PACKAGE_ROOT,
    // `base.js:32`'nin global IGNORES'u (`eslint/__fixtures__/**`) ve
    // ESLint'in varsayılan `node_modules`/nokta-dosya atlamaları bu olmadan
    // fikstürleri HİÇ lint etmez — base.js:30-31'in önerdiği `--no-ignore`
    // eşdeğeri.
    ignore: false,
    // Disk üzerinde bir `eslint.config.*` arama — yalnızca `baseConfig`
    // kullanılsın (gerçek `packages/config/eslint.config.mjs`'in yaptığı
    // `createBaseConfig(...)` çağrısının birebir aynısı).
    overrideConfigFile: true,
    baseConfig: flatConfig,
  })

  const results = await eslint.lintFiles([path.join(FIXTURES_DIR, fileName)])
  expect(results).toHaveLength(1)

  const [result] = results
  if (result === undefined) {
    throw new Error('ESLint sonucu beklenmedik şekilde boş')
  }

  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax').length
}

describe('AC-47 — float-para ESLint kuralının davranışsal kapsamı (solid tur 2, medium #1)', () => {
  it.each(POSITIVE_FIXTURES)(
    'POZİTİF fikstür %s — en az 1 no-restricted-syntax hatası üretir',
    async (fileName) => {
      const errorCount = await lintFixture(fileName)
      expect(errorCount).toBeGreaterThanOrEqual(1)
    },
  )

  it.each(NEGATIVE_FIXTURES)(
    'NEGATİF fikstür %s — 0 no-restricted-syntax hatası üretir',
    async (fileName) => {
      const errorCount = await lintFixture(fileName)
      expect(errorCount).toBe(0)
    },
  )
})

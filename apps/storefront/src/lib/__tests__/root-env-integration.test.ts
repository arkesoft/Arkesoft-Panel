// @arkesoft/storefront — root-env-integration.ts testleri (ROADMAP
// v0.0.9.1 patch, T-011/S2, AC5 dal B + AC8'in yapısal garantisi)
//
// `logger`/`AstroIntegrationLogger` (`apps/storefront/src/lib/
// __tests__/middleware.test.ts`'in `as unknown as <tip>` deseniyle AYNI,
// önceden kabul edilmiş test-dosyası yaklaşımı) SAHTE bir nesneyle
// oluşturulur — gerçek Astro çalışma zamanının karmaşık üçüncü taraf
// şeklini test burada yeniden üretmez, yalnızca `error` metodunu gözlemler.
//
// `process.env` HER testten ÖNCE/SONRA yedeklenir/geri yüklenir — bu dosya
// gerçek bir yan etki (kök `.env` okuma) tetikler, diğer testlerin ortamını
// KİRLETMEMESİ gerekir. `process.loadEnvFile` üzerindeki `vi.spyOn` çağrıları
// `afterEach`'teki `vi.restoreAllMocks()` ile geri yüklenir (`env-contract.
// test.ts`'in P4 testindeki `buildLoadEnvFileSpy.mockRestore()` deseniyle
// AYNI amaç, tek seferde tüm testler için).
//
// T-011/S4 — QA düzeltme turu 3 (F3, [low]): yukarıdaki referans ÖNCEDEN
// satır numarasıyla verilmişti (`env-contract.test.ts:198`) — o satır o
// zaman P4'ün KAPANIŞINA (`buildLoadEnvFileSpy.mockRestore()`) değil, P3'ün
// kapanış parantezine denk geliyordu (FIX 2 aynı turda o dosyaya iki yardımcı
// ~34 satır eklediği için kayma, ÖLÇÜLDÜ — security). L2'nin TAM BU YÜZDEN
// satır numarasından başlığa çevirdiği kusur ikinci dosyada tekrarlanmıştı.
// Referans artık TEST ADIYLA ("P4 testi") veriliyor — dosya tekrar kaysa da
// doğru kalır.
//
// T-011/S4 — QA düzeltme turu 2 (L3, [low]): bu başlık ÖNCEDEN "yedeklenir/
// geri yüklenir" diyordu ama `afterEach` yalnızca `process.env`'i geri
// yüklüyordu — `vi.spyOn(process, 'loadEnvFile')` ile açılan spy'lar HİÇ
// restore EDİLMİYORDU (`security` ve `solid` BAĞIMSIZ olarak tespit etti).
// Bugün kırık değildi (sayaç birikmesi yok, ölçüldü) ama beyan ile gerçeklik
// uyuşmuyordu ve aynı repoda `env-contract.test.ts`'ten FARKLI bir mock
// hijyeni kuruyordu. Başlık ve `afterEach` bu düzenlemede birlikte hizalandı.
//
// T-011/S4 — QA düzeltme turu 1 (F1, [high]): eskiden yalnızca `process.env`
// üzerinde `toBeUndefined()` assert ediliyordu — bu, `process.env`'in
// `beforeEach`'te DÜZ BİR NESNEYLE DEĞİŞTİRİLMESİ (`process.env = {
// ...ORIGINAL_ENV }`) yüzünden `process.loadEnvFile`'ın Node'un YEREL env
// deposuna yazdığı değeri ASLA GÖREMEYEN kör bir assert'ti — yani
// `command !== 'dev'` kapısı KALDIRILSA BİLE bu üç test yeşil kalırdı
// (ölçüldü, security+solid bağımsız tespiti). Her non-dev dalına artık
// `process.loadEnvFile` üzerinde DOĞRUDAN bir spy + `not.toHaveBeenCalled()`
// eklendi — bu assert sandbox'ın env-yazma anlambiliminden bağımsızdır,
// kusurun kökü tam olarak o anlambilimdi.
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AstroIntegrationLogger } from 'astro'

import { createRootEnvIntegration } from '../root-env-integration.js'

const ORIGINAL_ENV = { ...process.env }

/** Repo kökü — bu dosyadan beş seviye yukarı (`__tests__→lib→src→storefront→apps→kök`). */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..')

function fakeLogger(): { error: ReturnType<typeof vi.fn>; logger: AstroIntegrationLogger } {
  const error = vi.fn()
  return { error, logger: { error } as unknown as AstroIntegrationLogger }
}

async function runSetupHook(
  command: 'dev' | 'build' | 'preview' | 'sync',
  logger: AstroIntegrationLogger,
): Promise<void> {
  const integration = createRootEnvIntegration()
  const hook = integration.hooks['astro:config:setup']
  if (!hook) {
    throw new Error('astro:config:setup hook tanımlı değil')
  }
  // Diğer hook alanları bu test için gerekli değil — aynı `as unknown as`
  // deseni (dosya başı yorumuna bkz.).
  await hook({ command, logger } as unknown as Parameters<typeof hook>[0])
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('createRootEnvIntegration', () => {
  it('"arkesoft-root-env" adıyla bir AstroIntegration döner ve astro:config:setup hook tanımlar', () => {
    const integration = createRootEnvIntegration()
    expect(integration.name).toBe('arkesoft-root-env')
    expect(typeof integration.hooks['astro:config:setup']).toBe('function')
  })

  it('command "build" ise process.env\'e dokunmaz VE process.loadEnvFile hiç çağrılmaz (AC8 yapısal garantisi)', async () => {
    delete process.env['APP_BASE_DOMAIN']
    delete process.env['STOREFRONT_API_BASE_URL']
    const loadEnvFileSpy = vi.spyOn(process, 'loadEnvFile')
    const { logger, error } = fakeLogger()

    await expect(runSetupHook('build', logger)).resolves.toBeUndefined()

    expect(process.env['APP_BASE_DOMAIN']).toBeUndefined()
    expect(process.env['STOREFRONT_API_BASE_URL']).toBeUndefined()
    // F1: bu assert kapının KENDİSİNİ ölçer — yukarıdaki process.env
    // kontrolleri `beforeEach`'in `process.env = { ...ORIGINAL_ENV }`
    // atamasından ötürü `loadEnvFile`'ın yerel yazmasını GÖREMEZ (ölçüldü),
    // bu yüzden mekanizmayı bağımsız doğrulamak zorunludur.
    expect(loadEnvFileSpy).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('command "preview" ise process.env\'e dokunmaz VE process.loadEnvFile hiç çağrılmaz', async () => {
    delete process.env['APP_BASE_DOMAIN']
    delete process.env['STOREFRONT_API_BASE_URL']
    const loadEnvFileSpy = vi.spyOn(process, 'loadEnvFile')
    const { logger, error } = fakeLogger()

    await expect(runSetupHook('preview', logger)).resolves.toBeUndefined()

    expect(process.env['APP_BASE_DOMAIN']).toBeUndefined()
    expect(loadEnvFileSpy).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('command "sync" ise process.env\'e dokunmaz VE process.loadEnvFile hiç çağrılmaz (kapı yalnızca "dev"e özel)', async () => {
    delete process.env['APP_BASE_DOMAIN']
    delete process.env['STOREFRONT_API_BASE_URL']
    const loadEnvFileSpy = vi.spyOn(process, 'loadEnvFile')
    const { logger, error } = fakeLogger()

    await expect(runSetupHook('sync', logger)).resolves.toBeUndefined()

    expect(process.env['APP_BASE_DOMAIN']).toBeUndefined()
    expect(loadEnvFileSpy).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  // Dördüncü yoldan sonra (`parseStorefrontEnv` STATİK import + düz
  // fonksiyon çağrısı, `new Function`/dinamik `import()` YOK) bu test
  // artık asıl Zod mesajının TAM İÇERİĞİNİ doğrulayabiliyor — Vitest'in VM
  // sandbox'ında eskiden görülen "dynamic import callback" kısıtı bu
  // yaklaşımla hiç DEVREYE GİRMİYOR (A2'nin canlı süreç ölçümüyle AYNI kod
  // yolu, mock'lanmış bir parça YOK).
  it('command "dev" ve kabuk zaten geçersiz bir değer taşıyorsa (loadEnvFile EZMEZ) hook fırlar ve logger.error asıl Zod mesajıyla çağrılır (AC5 dal B)', async () => {
    // `process.loadEnvFile` zaten tanımlı env değişkenlerinin ÜZERİNE
    // yazmaz (ölçülmüş davranış) — kabuktan gelen geçersiz bir değer kök
    // `.env`'deki geçerli değeri EZER, bu da gerçek dosya içeriğine
    // bağımlı olmadan fail-fast dalını test eder.
    process.env['STOREFRONT_API_BASE_URL'] = 'not-a-url'
    // T-011/S4 — QA düzeltme turu 3 (F2, [low]): `mockImplementation(() =>
    // undefined)` eklendi (ESLint `no-empty-function` boş `{}` gövdeye izin
    // vermiyor, ifade-gövdeli ok fonksiyonu bu kuralı tetiklemiyor) — spy
    // artık GERÇEK dosya İÇERİĞİNİ okumuyor, yalnızca
    // ÇAĞRI KAYDINI tutuyor (bu, `.env` BOZUK/parse edilemez içerik taşısa
    // bile bu testin o içerikten etkilenmemesini sağlar).
    // ⚠ ÖLÇÜLMÜŞ SINIR (dürüst beyan, F2'nin orijinal önerisinin iddia
    // ettiğinden DAHA DAR): bu değişiklik aşağıdaki `toHaveBeenCalledTimes(1)`
    // assert'ini kök `.env`'in diskte VAR OLMASINDAN bağımsız KILMAZ —
    // `root-env-integration.ts`'in `if (existsSync(rootEnvPath)) {
    // process.loadEnvFile(...) }` kapısı (bu Task'ta DOKUNMA listesinde,
    // DOKUNULMADI) spy'ın ÇAĞRILIP ÇAĞRILMAYACAĞINI GERÇEK dosya sisteminden
    // belirliyor; spy'ın implementasyonu bunu DEĞİŞTİRMEZ. DOĞRULANDI (QA
    // tur 3, bu turun ÖLÇÜMLER'i): kök `.env`'i geçici olarak kaldırıp bu
    // iki testi (bu test + aşağıdaki "env geçerliyse" testi) `mockImplemen
    // tation` eklenmiş haliyle tekrar koşturmak HÂLÂ "expected 1 call, got
    // 0" ile KIRMIZI veriyor. Tam bağımsızlık ya `root-env-integration.ts`'in
    // `existsSync` kapısına dokunmayı (bu turda yasak) ya da `node:fs`'i
    // `vi.mock` ile modül-genelinde sahtelemeyi gerektirir — bu ikinci
    // seçenek de denendi ve "Cannot spy on export 'existsSync' — Module
    // namespace is not configurable in ESM" ile RED VERDİ (`vi.mock`
    // gerektirir, ki bu da altta L5'in AYNI dosyada REDDETTİĞİ orantısız
    // kapsam büyümesi — bkz. dosya sonu borç notu). Burada eklenen
    // `mockImplementation` yine de GERÇEK bir kazanç: ÇAĞRILDIĞINDA gerçek
    // dosyayı OKUMAMASI, testi `.env`'in İÇERİĞİNDEN bağımsız kılıyor; bu
    // Task'ın kapsamında (bu dosya DIŞINA çıkmadan) ulaşılabilecek en geniş
    // iyileştirme budur.
    const loadEnvFileSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => undefined)
    const { logger, error } = fakeLogger()

    await expect(runSetupHook('dev', logger)).rejects.toThrow(
      /Storefront ortam değişkenleri geçersiz/,
    )

    expect(loadEnvFileSpy).toHaveBeenCalledTimes(1)
    // T-011/S4 — QA düzeltme turu 2 (L4, [low]): eskiden
    // `loadEnvFileSpy.mock.calls[0] as [string]` ile doğrulanmamış bir `as`
    // kullanılıyordu (CLAUDE.md §4: `as` yalnızca Zod doğrulamasından hemen
    // sonra meşru — bu değildi). `toHaveBeenCalledWith` hem `as`'i kaldırır
    // hem de assert'i güçlendirir (Vitest'in kendi eşitlik denetimi, elle
    // tek-elemanlı tuple çıkarmaktan daha güvenilir).
    expect(loadEnvFileSpy).toHaveBeenCalledWith(join(REPO_ROOT, '.env'))
    expect(error).toHaveBeenCalledTimes(1)
    // T-011/S4 — QA düzeltme turu 3 (F4, [low]): eskiden
    // `error.mock.calls[0] as [string]` ile doğrulanmamış bir `as`
    // kullanılıyordu (L4 ile AYNI sınıf, farklı çağrı yeri). `toHaveBeenCalled
    // With(expect.stringMatching(...))` aynı tek çağrıyı ÜÇ farklı asimetrik
    // eşleştirici ile doğrular, `as` gerekmez.
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/Storefront ortam değişkenleri geçersiz/),
    )
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/STOREFRONT_API_BASE_URL/))
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/pnpm env:check/))
  })

  // ⚠ ÖLÇÜLDÜ: `process.loadEnvFile`, Vitest'in çalıştırdığı test ortamında
  // ÇAĞRILIYOR (spy bunu kaydediyor) ama dosyadaki değerleri `process.env`'e
  // GERÇEKTEN YAZMIYOR (muhtemelen Vitest'in izole çalışma alanı/worker
  // sandbox'ı native env-yazma bağlamasını kesiyor) — bu, GERÇEK `astro dev`
  // sürecinde (A4'ün ham çıktısı: temiz kabuk + bu çağrı → vitrin 200)
  // DOĞRULANMIŞ gerçek davranıştan FARKLI bir sandbox kısıtı, üretim
  // davranışını YANSITMIYOR. Bu yüzden bu test geçerli değerleri `loadEnvFile`
  // ÇAĞRISININ ÜRETMESİNE güvenmek YERİNE doğrudan `process.env`'e yazar —
  // yalnızca "env zaten geçerliyse hook fırlamaz" dalını doğrular; dosyadan
  // YÜKLEMENİN KENDİSİ A2/A4'ün canlı süreç ölçümüyle kanıtlıdır.
  it('command "dev" ve env geçerliyse hook fırlamadan tamamlanır, logger.error çağrılmaz', async () => {
    process.env['APP_BASE_DOMAIN'] = 'arkesoft.localhost'
    process.env['STOREFRONT_API_BASE_URL'] = 'http://127.0.0.1:3000'
    // F2 (turu 3): aynı gerekçe — bkz. yukarıdaki testin uzun yorumu.
    const loadEnvFileSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => undefined)
    const { logger, error } = fakeLogger()

    await expect(runSetupHook('dev', logger)).resolves.toBeUndefined()

    expect(loadEnvFileSpy).toHaveBeenCalledTimes(1)
    // L4: bkz. yukarıdaki aynı düzenlemenin gerekçesi.
    expect(loadEnvFileSpy).toHaveBeenCalledWith(join(REPO_ROOT, '.env'))
    expect(error).not.toHaveBeenCalled()
  })

  // T-011/S4 — QA düzeltme turu 2 (L5, [low]): bu blokta ÖNCEDEN
  // `existsSync(rootEnvPath)).toBe(true)` assert eden bir test vardı
  // ("repo kökünde `.env` dosyası gerçekten var (A3/A4 ön koşulu)"). `.env`
  // (git'te İZLENMİYOR, bkz. `.gitignore`) ve `package.json`'daki `env:init`
  // script'i onu yalnızca `pnpm infra:up`/`setup-workspace` koşarsa
  // `.env.example`'dan kopyalar — yani TEMİZ bir klonda, hiçbir kurulum
  // script'i koşulmadan doğrudan `pnpm test` çalıştırılırsa bu assert
  // KIRMIZI verirdi (ÖLÇÜLDÜ: CI'nın yeşil kalması `setup-workspace`'in
  // `create-env` varsayılanının `'true'` olmasından, bu test'in kendisinden
  // DEĞİL). Üstelik bu assert `root-env-integration.ts` içindeki HİÇBİR kod
  // yolunu EGZERSİZ ETMİYORDU — doğruladığı şey A3/A4'ün (T-011 Task
  // dosyasının ölçüm tablosu) canlı/elle yapılmış bir ön koşuluydu, bir
  // repo-kodu pini DEĞİLDİ.
  //
  // Değerlendirilen alternatif (ölçüldü, bu turda REDDEDİLDİ): `node:fs`'in
  // `existsSync`'ini `vi.mock('node:fs', ...)` ile sahteleyip "`.env` yoksa
  // `loadEnvFile` hiç çağrılmaz" dalını test etmek. Bu GERÇEKTEN repo kodunu
  // (üstteki `if (existsSync(rootEnvPath))` kapısını) egzersiz ederdi, ama
  // `node:fs` modül-genelinde mocklanırsa bu dosyadaki TÜM testlerin (ve bu
  // dosyanın kendi `import`'larının) `existsSync`'i etkilenir — güvenli
  // kapsam için her teste `vi.doMock` + `vi.resetModules()` + dinamik
  // yeniden-import iskelesi eklemek gerekir; bu, dosyanın TAMAMINI yeniden
  // yapılandırmak anlamına gelir ve bu Task'ın DOKUNMA kısıtları dışına
  // taşan bir kapsam büyümesi + yeni bir kırılganlık (flakiness) riski
  // yaratırdı. `low` önem derecesiyle orantısız — bu yüzden assert KALDIRILDI;
  // A3/A4 ön koşulu zaten canlı ölçümle doğrulanmıştı (T-011 Task dosyası,
  // "Varsayım durumu" tablosu), burada TEKRAR doğrulanması gerekmiyordu.
  //
  // T-011/S4 — QA düzeltme turu 3 (F2, [low], DOĞRULAYICI ÖLÇÜM): yukarıdaki
  // "dev" testlerine `mockImplementation` eklenmesi bu REDDİ değiştirmez —
  // `vi.spyOn` ile namespace import üzerinden `existsSync`'i hafifçe
  // spy'lamaya çalışmak bu turda da denendi ve Vitest "Cannot spy on export
  // 'existsSync' — Module namespace is not configurable in ESM" ile RED
  // VERDİ; tek çalışan yol yine tam `vi.mock('node:fs', ...)` + dinamik
  // reimport iskelesidir, ki bu REDDİN gerekçesi hâlâ geçerli.
  // `root-env-integration.ts`'in `existsSync` dalı (`.env` eksikken sessizce
  // atlama) HÂLÂ test edilmemiş durumda — bu, ROADMAP borç tablosuna ayrı bir
  // satır olarak taşınmalı (sorumlu: qa/devops, v0.0.14 borç penceresi).
  // Ayrıca yukarıdaki `toHaveBeenCalledTimes(1)` assert'lerinin kök `.env`'in
  // VARLIĞINA (içeriğine değil) bağımlı kalması da AYNI borç satırına, AYNI
  // kök nedenle (existsSync kapısı test edilemiyor) eklenmelidir.
})

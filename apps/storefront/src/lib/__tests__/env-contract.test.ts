// @arkesoft/storefront — AC6 mekanik pin: storefront env sözleşmesinin beş
// farklı yüzeyde (ROADMAP v0.0.9.1 patch, T-011/S4, architect riski 2)
// TUTARLI kaldığını doğrulayan beş assert.
//
// `architect`'in risk listesinin 2. maddesi bağlayıcı: "uygulayan ajan
// 'tutarlılık olsun' diye `build` script'ine de yükleyici eklerse AC8
// sessizce düşer. Pin P4/P5 bunu kırmızıya çevirir." Bu dosya o pini taşır.
//
// ⚠ İTHALAT KARARI (gerekçeli, po'nun handoff'unda bağlayıcı bırakıldı):
// `storefrontEnvSchema` burada `storefront-env.ts` ÜZERİNDEN DEĞİL, doğrudan
// YAN ETKİSİZ `storefront-env-schema.ts` ÜZERİNDEN import edilir.
// `storefront-env.ts` modül-yükleme-anında `parseStorefrontEnv(process.env)`
// çağırıyor (K17) — bu dosyayı STATİK import etmek bu pin'i, süit çapında
// hangi sırada çalıştığına bağlı olarak `process.env`'in GEÇERLİ bir
// APP_BASE_DOMAIN/STOREFRONT_API_BASE_URL taşımasına bağımlı kılardı (bkz.
// `storefront-env.test.ts`'in bu yüzden dinamik `import()` + `vi.resetModules()`
// kullanmak ZORUNDA kaldığı desen). Bu pin yalnızca `storefrontEnvSchema`'nın
// STATİK ŞEKLİNİ (`.shape` anahtarları) okuyor, `parseStorefrontEnv` hiç
// çağrılmıyor (P4 hariç — o da kendi env'ini try/finally ile izole eder) —
// dolayısıyla yan etkisiz modülü statik import etmek hem daha basit hem de
// testler arası env sızıntısı riskini ortadan kaldırıyor.
//
// ⚠ Bu dosya bir TEST'tir — `storefront-env.ts`'in "⚠ BAĞIMLILIK KARARI
// (RİSKLER'de de işaretli)" başlıklı yorum bloğundaki "üretim yolunda
// `@arkesoft/config` import edilmez" (devDependencies budanırsa açılış-kritik
// yol kırılır) kararını İHLAL ETMİYOR: o karar üretim modüllerine özgü, bu
// dosya hiçbir üretim modülünden import EDİLMİYOR; `@arkesoft/config`
// storefront'un `devDependencies`'inde (workspace:*) zaten mevcut ve yalnızca
// bu test dosyası tarafından, test-zamanında tüketiliyor.
// ⚠ T-011/S4 — QA düzeltme turu 2 (L2, [low]): bu referans ÖNCEDEN satır
// numarasıyla verilmişti (`storefront-env.ts:11-22`); FIX 1 başlığa 2 satır
// ekleyince kaydı, `frontend` paralel turda re-export yüzeyini daraltırken
// (DOKUNMA listesi) tekrar kayacağı ölçüldü. Bu yüzden referans artık bölüm
// BAŞLIĞIYLA veriliyor — dosya tekrar kaysa da bu yorum doğru kalır.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { AstroIntegrationLogger } from 'astro'

import { infraEnvSchema, storefrontEnvCheckSchema } from '@arkesoft/config/env'

import { createRootEnvIntegration } from '../root-env-integration.js'
import { storefrontEnvSchema } from '../storefront-env-schema.js'

/** Repo kökü — bu dosyadan beş seviye yukarı (`__tests__→lib→src→storefront→apps→kök`). */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..')

/**
 * `turbo.json`'daki yorumları ayıklar — **yalnızca tam satır** `//` yorumları
 * (baştaki boşluklar hariç, satır `//` ile başlıyorsa tüm satır atılır).
 *
 * ⚠ KISIT (A8, belgeli): satır-SONU (inline) yorum (`"foo": "bar", // açıklama`)
 * DESTEKLENMEZ — bu ayıklayıcı öyle bir satırı veri olarak bırakır ve
 * `JSON.parse` ya bozuk-JSON hatasıyla patlar ya da (daha kötü senaryoda)
 * yanlış içerik üretebilirdi. `turbo.json`'daki TÜM yorumlar bugün tam
 * satır biçiminde (S1'in kararı, BAĞLAM ÖZETİ'nde doğrulandı) — bu kısıt şu
 * an ihlal edilmiyor, ama ileride `turbo.json`'a satır-sonu yorum eklenirse
 * bu pin SESSİZCE yanlış geçmez, `JSON.parse`'ın kendisi patlar.
 *
 * Satır 2'deki `"$schema": "https://turbo.build/schema.json"` bir yorum
 * DEĞİL — çift tırnak içinde olduğu için `line.trim().startsWith('//')`
 * onu YAKALAMAZ, bozulmadan kalır.
 */
function stripFullLineJsonComments(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

/** `turbo.json`'ın bu pin'in ihtiyaç duyduğu alt kümesi — dış veri, Zod ile parse edilir (CLAUDE.md §4). */
const turboJsonSchema = z.object({
  tasks: z.object({
    dev: z.object({ env: z.array(z.string()).optional() }),
    build: z.object({ env: z.array(z.string()).optional() }),
  }),
})

/**
 * `apps/storefront/package.json`'ın bu pin'in ihtiyaç duyduğu alt kümesi —
 * dış veri, Zod ile parse edilir.
 *
 * T-011/S4 — QA düzeltme turu 1 (F2, [medium]): `dev` alanı P6 için eklendi.
 * ⚠ `package.json` bu Task'ta `DOKUNMA` listesinde İSTİSNASIZ yer alıyor
 * (bkz. handoff) — bu dosya onu yalnızca OKUR, hiçbir koşulda YAZMAZ.
 */
const storefrontPackageJsonSchema = z.object({
  scripts: z.object({ build: z.string(), dev: z.string() }),
})

function readTurboJson(): z.infer<typeof turboJsonSchema> {
  const raw = readFileSync(join(REPO_ROOT, 'turbo.json'), 'utf-8')
  const stripped = stripFullLineJsonComments(raw)
  const parsed: unknown = JSON.parse(stripped)
  return turboJsonSchema.parse(parsed)
}

function readStorefrontPackageJson(): z.infer<typeof storefrontPackageJsonSchema> {
  const raw = readFileSync(join(REPO_ROOT, 'apps', 'storefront', 'package.json'), 'utf-8')
  const parsed: unknown = JSON.parse(raw)
  return storefrontPackageJsonSchema.parse(parsed)
}

function readPlaywrightConfigRaw(): string {
  return readFileSync(join(REPO_ROOT, 'apps', 'storefront', 'playwright.config.ts'), 'utf-8')
}

/**
 * `playwright.config.ts`'in ham metninden `webServer.command` SATIRINI
 * ayıklar (baştaki boşluklar hariç, satır `command:` ile başlıyorsa o satır).
 *
 * T-011/S4 — QA düzeltme turu 2 (M1/L1, [medium]/[low]): bu mantık ÖNCEDEN
 * P8'in test gövdesine gömülüydü ve P6 TÜM dosya metninde arama yapıyordu
 * (bir yorum satırına kaçan önek bile P6'yı yeşil bırakırdı). Artık ADLANDI­
 * RILMIŞ tek bir fonksiyon — P6, P8 VE ikisinin self-test'i AYNI fonksiyonu
 * çağırıyor, dolayısıyla mantık gerçekten tek yerde yaşıyor.
 *
 * T-011/S4 — QA düzeltme turu 3 (F1, [medium], DÜZELTİLMİŞ BEYAN): yukarıdaki
 * turu 2 cümlesi "mutasyona karşı duyarlılık self-test'te GERÇEKTEN
 * ölçülüyor" diyordu — bu, ÖLÇÜLENİN TAMAMı DEĞİLDİ ve `security`/`solid`
 * BAĞIMSIZ olarak bir kör nokta buldu: turu 2'nin P8 self-test'i satır
 * İÇERİĞİNİ `toContain`/`not.toContain` (ALT DİZGE) ile doğruluyordu —
 * "hangi SATIRI döndürdü" değil "döndürülen metinde ne VAR" ölçüyordu. Bu
 * fonksiyonu "ham GİRDİYİ değiştirmeden döndür" (`return raw`) şeklinde
 * bozan bir mutasyon, hem o self-test'te HEM P6/P8'in gerçek dosya
 * üzerindeki assert'lerinde YEŞİL KALIYORDU — çünkü ham girdinin TAMAMI
 * beklenen alt dizgeleri zaten İÇERİYOR (ÖLÇÜLDÜ, T-011 Task dosyası).
 * Bu sınıf artık İKİ katmanla kapatılıyor: (1) P8 self-test `toBe` ile
 * DÖNÜLEN DEĞERİN TAM EŞİTLİĞİNİ pinliyor (ham girdinin tamamı tek satıra
 * eşit DEĞİL, dolayısıyla "return raw" orada KIRMIZIYA düşer); (2) P6, P6
 * self-test VE P8'in gerçek assert'lerine "dönen değer TEK SATIR, ÇOK
 * SATIRLI bir blob DEĞİL" invaryantı eklendi (`expectSingleLine`, aşağıya
 * bkz.) — bu, uzun/dinamik gerçek dosya metnini KIRILGAN bir `toBe` ile
 * pinlemeye gerek kalmadan "return raw" sınıfını EVRENSEL olarak yakalar.
 * Dördü BİRLİKTE "return raw" mutasyonunu KIRMIZIYA çevirir (ham kanıt: QA
 * tur 3 handoff'u, "F1 MUTASYON KANITI").
 *
 * ⚠ SINIR (ölçülmemiş/iddia edilmeyen): bu self-test'ler yalnızca BU
 * fonksiyonun KENDİ gövdesindeki mutasyonları yakalar. `extractWebServer
 * CommandLine` DIŞINDAKİ bir hata sınıfı — örn. `playwright.config.ts`'in
 * (production dosyası) `webServer.command`'ı GERÇEKTEN çok satırlı bir
 * şablona dönüştürmesi — P6/P8'i de KIRMIZIYA düşürür, ama bu YAN ETKİ
 * olarak DOĞRU davranıştır; dosya başı P8 notundaki "bileşik komut/çok
 * satır açıkları" borcuyla KARIŞTIRILMASIN — o borç `webServer.command`'ın
 * GELECEKTE `astro build && astro preview` gibi BİLEŞİK ama YİNE DE TEK
 * SATIRLI bir komuta dönmesi durumunu kapsıyor; bu assert'in sınadığı
 * "tek satır mı" sorusu farklı bir eksen.
 */
function extractWebServerCommandLine(raw: string): string | undefined {
  return raw.split('\n').find((line) => line.trim().startsWith('command:'))
}

/**
 * `extractWebServerCommandLine`'ın döndürdüğü değerin TEK SATIR olduğunu
 * (içinde `\n` TAŞIMADIĞINI) doğrular.
 *
 * T-011/S4 — QA düzeltme turu 3 (F1, [medium]): bu invaryant P6, P6
 * self-test VE P8'e EKLENDİ — üçü de ÖNCEDEN yalnızca ALT DİZGE (`toContain`/
 * `not.toContain`) doğruluyordu, bu da "ham girdiyi değiştirmeden döndür"
 * (`return raw`) mutasyonuna KÖR kalıyordu (ham girdinin TAMAMI beklenen alt
 * dizgeleri zaten İÇERİYOR — bkz. `extractWebServerCommandLine`'ın yukarıdaki
 * dosya başı notu). Gerçek `playwright.config.ts` METNİ çok satırlı olduğu
 * için bu invaryant "return raw" mutasyonunu TEKİLLEŞTİRİLMİŞ, dosyanın tam
 * içeriğine bağımlı OLMAYAN bir şekilde yakalar.
 */
function expectSingleLine(line: string): void {
  expect(line.includes('\n'), `beklenen TEK SATIR, çok satırlı bir metin alındı: "${line}"`).toBe(
    false,
  )
}

/**
 * Metnin satırları arasından `PUBLIC_` önekiyle BAŞLAYAN satırları seçer.
 *
 * T-011/S4 — QA düzeltme turu 2 (M1, [medium]): ÖNCEDEN P7'nin test gövdesine
 * gömülüydü; self-test AYNI ifadeyi satır içinde YENİDEN YAZIYORDU (gerçek
 * filtreyi hiç ÇAĞIRMIYORDU) — filtre `startsWith('PUBLIC')` (alt çizgisiz)
 * olarak bozulsa bile self-test bunu YAKALAMAZDI. Artık P7 ve self-test AYNI
 * fonksiyonu çağırıyor.
 */
function filterPublicPrefixedLines(lines: readonly string[]): string[] {
  return lines.filter((line) => line.startsWith('PUBLIC_'))
}

/**
 * `package.json`'ın `dev` script'inden `astro dev` çağrısından ÖNCEKİ öneki
 * türetir (ör. `"env -u A -u B astro dev"` → `"env -u A -u B"`).
 *
 * ⚠ Literal-jeton disiplini (AGENT_BASELINE §5): bu fonksiyon öneki sabit bir
 * dizgeyle KARŞILAŞTIRMAZ, `scripts.dev`'in KENDİSİNDEN TÜRETİR — aksi halde
 * test, önekin ÜÇÜNCÜ bir kopyası olurdu ve sapma yine görünmez kalırdı.
 */
function deriveAstroDevEnvPrefix(devScript: string): string {
  const marker = ' astro dev'
  const idx = devScript.indexOf(marker)
  if (idx === -1) {
    throw new Error(
      `package.json "dev" script'i "${marker}" alt dizgesini içermiyor: "${devScript}"`,
    )
  }
  return devScript.slice(0, idx)
}

/** Astro'nun `astro:config:setup` hook imzası — `root-env-integration.test.ts`'in AYNI yardımcı deseni. */
async function runSetupHook(
  command: 'dev' | 'build' | 'preview' | 'sync',
  logger: AstroIntegrationLogger,
): Promise<void> {
  const integration = createRootEnvIntegration()
  const hook = integration.hooks['astro:config:setup']
  if (!hook) {
    throw new Error('astro:config:setup hook tanımlı değil')
  }
  await hook({ command, logger } as unknown as Parameters<typeof hook>[0])
}

function fakeLogger(): { error: ReturnType<typeof vi.fn>; logger: AstroIntegrationLogger } {
  const error = vi.fn()
  return { error, logger: { error } as unknown as AstroIntegrationLogger }
}

const STOREFRONT_ENV_KEYS = Object.keys(storefrontEnvSchema.shape)

describe('AC6 — storefront env sözleşmesi mekanik pin', () => {
  it("P1: storefrontEnvSchema'nın her anahtarı turbo.json tasks.dev.env VE tasks.build.env içinde var", () => {
    const turbo = readTurboJson()
    const devEnv = turbo.tasks.dev.env ?? []
    const buildEnv = turbo.tasks.build.env ?? []

    for (const key of STOREFRONT_ENV_KEYS) {
      expect(devEnv, `turbo.json tasks.dev.env "${key}" anahtarını içermiyor`).toContain(key)
      expect(buildEnv, `turbo.json tasks.build.env "${key}" anahtarını içermiyor`).toContain(key)
    }
  })

  it('P2: storefrontEnvSchema\'nın her anahtarı .env.example\'da "KEY=" satırı olarak var', () => {
    const envExample = readFileSync(join(REPO_ROOT, '.env.example'), 'utf-8')
    const lines = envExample.split('\n')

    for (const key of STOREFRONT_ENV_KEYS) {
      const hasLine = lines.some((line) => line.startsWith(`${key}=`))
      expect(hasLine, `.env.example "${key}=" satırını içermiyor`).toBe(true)
    }
  })

  it("P3: storefrontEnvSchema'nın her anahtarı env:check'in birleşik kapsamında (infraEnvSchema ∪ storefrontEnvCheckSchema)", () => {
    const coveredKeys = new Set<string>([
      ...Object.keys(infraEnvSchema.shape),
      ...Object.keys(storefrontEnvCheckSchema.shape),
    ])

    for (const key of STOREFRONT_ENV_KEYS) {
      expect(coveredKeys.has(key), `env:check birleşik kapsamı "${key}" anahtarını içermiyor`).toBe(
        true,
      )
    }
  })

  it('P4: createRootEnvIntegration() → command "build" process.env\'e dokunmaz VE loadEnvFile çağırmaz; command "dev" yükler VE geçersiz env\'de fırlar (AC8 yapısal garantisi)', async () => {
    const ORIGINAL_ENV = { ...process.env }
    try {
      // --- build dalı: dokunmama garantisi ---
      delete process.env['APP_BASE_DOMAIN']
      delete process.env['STOREFRONT_API_BASE_URL']
      const buildLoadEnvFileSpy = vi.spyOn(process, 'loadEnvFile')
      const { logger: buildLogger, error: buildError } = fakeLogger()

      await expect(runSetupHook('build', buildLogger)).resolves.toBeUndefined()

      expect(process.env['APP_BASE_DOMAIN']).toBeUndefined()
      expect(process.env['STOREFRONT_API_BASE_URL']).toBeUndefined()
      // T-011/S4 — QA düzeltme turu 1 (F1, [high]): process.env üzerindeki
      // `toBeUndefined()` kontrolleri `beforeEach`'in nesne DEĞİŞTİRMESİ
      // yüzünden `loadEnvFile`'ın yerel yazmasını GÖREMEZ — mekanizmanın
      // KENDİSİ doğrudan spy ile ölçülür.
      expect(buildLoadEnvFileSpy).not.toHaveBeenCalled()
      expect(buildError).not.toHaveBeenCalled()
      buildLoadEnvFileSpy.mockRestore()

      // --- dev dalı: geçersiz env'de fırlama garantisi ---
      process.env['APP_BASE_DOMAIN'] = 'arkesoft.localhost'
      process.env['STOREFRONT_API_BASE_URL'] = 'not-a-url'
      const { logger: devLogger, error: devError } = fakeLogger()

      await expect(runSetupHook('dev', devLogger)).rejects.toThrow(
        /Storefront ortam değişkenleri geçersiz/,
      )
      expect(devError).toHaveBeenCalledTimes(1)
    } finally {
      process.env = { ...ORIGINAL_ENV }
    }
  })

  it("P5: apps/storefront/package.json build script'i --env-file içermez", () => {
    const pkg = readStorefrontPackageJson()
    expect(pkg.scripts.build).not.toContain('--env-file')
  })

  // T-011/S4 — QA düzeltme turu 1 (F2, [medium]): `package.json`'ın `dev`
  // script'indeki `env -u ...` öneki ile `playwright.config.ts`'in
  // `webServer.command`'ındaki öneki İKİ YERDE elle BİREBİR aynı literal
  // olarak tutuluyor (solid'in kabul ettiği, tekilleştirmesi T3-1/v0.0.14'ü
  // bekleyen borç) — ama bugün HİÇBİR assert bu ikisini birbirine pinlemiyor,
  // yani dördüncü bir `-u` tek yere eklenirse sapma `pnpm lint`/`typecheck`/
  // `test`'in HİÇBİRİNDE görünmez (playwright.config.ts'in kendi dosya başı
  // notu bunu itiraf ediyor). Bu pin öneki `scripts.dev`'den TÜRETİR (sabit
  // literal YAZILMAZ).
  //
  // T-011/S4 — QA düzeltme turu 2 (L1, [low]): ÖNCEDEN önek TÜM dosya
  // metninde aranıyordu — önek bir YORUMA kaçsa (satır değişse de komut
  // satırı kalsa) bu pin bunu GÖREMEZDİ. Artık `extractWebServerCommandLine`
  // ile YALNIZCA gerçek `command:` SATIRINDA aranıyor.
  it('P6: playwright.config.ts webServer.command satırı, package.json dev script\'inin "astro dev" öncesi öneki ile BAŞLIYOR (scripts.dev\'den türetilmiş, literal yazılmamış)', () => {
    const pkg = readStorefrontPackageJson()
    const prefix = deriveAstroDevEnvPrefix(pkg.scripts.dev)
    const playwrightConfigRaw = readPlaywrightConfigRaw()
    const webServerCommandLine = extractWebServerCommandLine(playwrightConfigRaw)

    if (!webServerCommandLine) {
      throw new Error('playwright.config.ts içinde "command:" satırı bulunamadı')
    }

    // T-011/S4 — QA düzeltme turu 3 (F1, [medium]): bkz.
    // `extractWebServerCommandLine`'ın dosya başı notu — bu invaryant
    // olmadan "return raw" mutasyonu alttaki `toContain` assert'ini YEŞİL
    // bırakıyordu (ham dosya metninin TAMAMI beklenen alt dizgeyi zaten
    // İÇERİYOR).
    expectSingleLine(webServerCommandLine)
    expect(webServerCommandLine).toContain(`${prefix} astro dev`)
  })

  // F2 MUTASYON KANITI (metin üzerinde — `package.json`'a DOKUNULMADI,
  // DOKUNMA listesinde istisnasız yer alıyor): gerçek `playwright.config.ts`
  // metni OKUNUYOR ama `package.json`'daki `dev` script'i SAPMIŞ gibi
  // davranmak için SENTETİK (fabricated) bir dizge kullanılıyor — bu, P6'nın
  // asıl dosyayı bozmadan sapmayı yakaladığını kanıtlar.
  it("P6 self-test: scripts.dev'e dördüncü bir `-u` değişkeni eklenmiş SENTETİK bir önek, gerçek playwright.config.ts metninde BULUNAMAZ (mutasyon hassasiyeti kanıtı)", () => {
    const driftedDevScript =
      'env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AI_AGENT -u EXTRA_DETECTOR_VAR astro dev'
    const driftedPrefix = deriveAstroDevEnvPrefix(driftedDevScript)
    const playwrightConfigRaw = readPlaywrightConfigRaw()
    const webServerCommandLine = extractWebServerCommandLine(playwrightConfigRaw)

    if (!webServerCommandLine) {
      throw new Error('playwright.config.ts içinde "command:" satırı bulunamadı')
    }

    // F1 (turu 3): P6'nın aynı invaryantı — bkz. yukarıdaki yorum.
    expectSingleLine(webServerCommandLine)
    expect(webServerCommandLine).not.toContain(`${driftedPrefix} astro dev`)
  })

  // T-011/S4 — QA düzeltme turu 1 (F3, [low], "yolu üstündeyse kapat"):
  // security'nin ölçtüğü zincir — Astro'nun varsayılan `PUBLIC_` öneki,
  // Vite'ın `loadEnv`'i `process.env`'den de topluyor, bu hook `dev`'de kök
  // `.env`'i yüklüyor → `.env`/`.env.example`'a bir `PUBLIC_*` anahtarı
  // eklenirse LAN'daki herhangi bir makine `server.host: true` ile değeri
  // istemci paketinden okuyabilir. `.env`'in kendisi makineye özgü ve CI'da
  // yok — bu yüzden yalnızca repoda İZLENEN `.env.example` pinlenir.
  it('P7: .env.example\'da "PUBLIC_" önekiyle başlayan satır yok', () => {
    const envExample = readFileSync(join(REPO_ROOT, '.env.example'), 'utf-8')
    const lines = envExample.split('\n')
    const publicLines = filterPublicPrefixedLines(lines)

    expect(publicLines).toEqual([])
  })

  // F3 MUTASYON KANITI (metin üzerinde — `.env.example`'a DOKUNULMADI,
  // DOKUNMA listesinde istisnasız yer alıyor): AYNI `filterPublicPrefixedLines`
  // fonksiyonu SENTETİK bir `.env.example` içeriği üzerinde çalıştırılır.
  //
  // T-011/S4 — QA düzeltme turu 2 (M1, [medium]): ÖNCEKİ sürüm filtreyi
  // SATIR İÇİNDE yeniden yazıyordu — gerçek fonksiyonu hiç ÇAĞIRMIYORDU,
  // yani filtre `startsWith('PUBLIC')` (alt çizgisiz) olarak bozulsa bile bu
  // self-test YEŞİL KALIRDI. Artık `filterPublicPrefixedLines` ÇAĞRILIYOR ve
  // sentetik veri BİLEREK bir "yakın-kaçırma" satırı (`PUBLICSENTINEL=1` —
  // `PUBLIC` ile başlıyor ama `PUBLIC_` ile BAŞLAMIYOR) içeriyor; bu satır
  // beklenen çıktıda YOK. Filtre `startsWith('PUBLIC')`'e gevşerse bu satır
  // da eşleşir ve `toEqual` kırmızıya düşer (aşağıdaki DOD mutasyon kanıtına
  // bkz.).
  it('P7 self-test: filterPublicPrefixedLines SENTETİK girdide "PUBLIC_" ile başlayan satırı YAKALAR, yalnızca "PUBLIC" ile başlayan (alt çizgisiz) yakın-kaçırma satırını YAKALAMAZ (mutasyon hassasiyeti kanıtı)', () => {
    const syntheticLines = [
      'DATABASE_URL=',
      'PUBLIC_ARKESOFT_SENTINEL=1',
      'PUBLICSENTINEL=1',
      'REDIS_URL=',
    ]
    const publicLines = filterPublicPrefixedLines(syntheticLines)

    expect(publicLines).toEqual(['PUBLIC_ARKESOFT_SENTINEL=1'])
  })

  // T-011/S4 — QA düzeltme turu 1 (F4, [low], "yolu üstündeyse kapat"):
  // `playwright.config.ts:83-86`'daki kök `.env` yüklemesi bugün güvenli
  // (webServer.command her zaman `astro dev`, yani zaten `dev` dalı) ama
  // HİÇBİR assert bunu pinlemiyor — `webServer.command` ileride
  // `astro build && astro preview`'e dönerse build alt süreci kök `.env`'i
  // MİRAS alır ve kapı bypass olur. `playwright.config.ts`'e DOKUNULMADI
  // (bu turda F2'nin ölçüm kaynağı) — yalnızca test tarafı pinlenir.
  it('P8: playwright.config.ts webServer.command "astro dev" içeriyor VE "astro build"/"astro preview" içermiyor', () => {
    const playwrightConfigRaw = readPlaywrightConfigRaw()
    const webServerCommandLine = extractWebServerCommandLine(playwrightConfigRaw)

    if (!webServerCommandLine) {
      throw new Error('playwright.config.ts içinde "command:" satırı bulunamadı')
    }

    // F1 (turu 3): P6'nın aynı invaryantı — bkz. `extractWebServerCommandLine`
    // dosya başı notu.
    expectSingleLine(webServerCommandLine)
    expect(webServerCommandLine).toContain('astro dev')
    expect(webServerCommandLine).not.toContain('astro build')
    expect(webServerCommandLine).not.toContain('astro preview')
  })

  // F4 MUTASYON KANITI (metin üzerinde — `playwright.config.ts`'e
  // DOKUNULMADI, F4'ün kendi talimatı bunu açıkça yasaklıyor): AYNI
  // `extractWebServerCommandLine` fonksiyonu SENTETİK, ÇOK SATIRLI bir
  // `webServer` bloğu üzerinde çalıştırılır.
  //
  // T-011/S4 — QA düzeltme turu 2 (M1, [medium]): ÖNCEKİ sürüm `command:`
  // satırını İKİ SATIR YUKARIDA tanımlanmış bir LİTERAL üzerinde assert
  // ediyordu — gerçek çıkarıcıyı hiç ÇAĞIRMIYORDU, yani çıkarıcı
  // `.find((line) => line.includes('webServer'))`'a bozulsa bile (yanlış
  // satırı seçip `webServer: {` satırını döndürse bile) bu self-test YEŞİL
  // KALIRDI.
  //
  // T-011/S4 — QA düzeltme turu 3 (F1, [medium], DÜZELTİLMİŞ BEYAN): turu
  // 2'nin düzeltmesi `extractWebServerCommandLine`'ı ÇAĞIRIYORDU ama hâlâ
  // `toContain`/`not.toContain` (ALT DİZGE) ile doğruluyordu — "ham girdiyi
  // DEĞİŞTİRMEDEN döndür" (`return raw`) mutasyonu bu self-test'i DE YEŞİL
  // bırakıyordu, çünkü sentetik bloğun TAMAMI beklenen alt dizgeleri zaten
  // İÇERİYOR (ÖLÇÜLDÜ — security VE solid bağımsız tespiti, T-011 Task
  // dosyası). Bu self-test artık `filterPublicPrefixedLines` self-test'inin
  // TAM-ÇIKTI desenini (`toBe`) izliyor VE sentetik veriye bir YAKIN-KAÇIRMA
  // satırı eklendi (`commandLabel: \`webServer\`,` — "command" ile
  // BAŞLIYOR ama "command:" ile BAŞLAMIYOR; aynı zamanda eski self-test'in
  // amacını da taşıyor: "webServer" kelimesini `command:`'DAN ÖNCE farklı
  // bir satırda içeriyor).
  //
  // ÖLÇÜLEN KAPSAM (dürüst beyan): bu self-test artık (a) yanlış SATIR
  // seçimini (`.find((line) => line.includes('webServer'))` mutasyonu) VE
  // (b) ham girdiyi aynen geri döndürmeyi (`return raw` mutasyonu) YAKALAR —
  // ikisi de dönen değerin beklenen TEK SATIRA `toBe` ile TAM eşit olmasını
  // gerektirir, bir ALT DİZGE eşleşmesi YETMEZ. Bu self-test'in kapsamı
  // yalnızca `extractWebServerCommandLine`'ın KENDİ gövdesidir — P6/P8'in
  // gerçek dosya assert'lerinin aynı iki mutasyona karşı duyarlılığı artık
  // `expectSingleLine` invaryantıyla (yukarı bkz.) AYRICA sağlanıyor.
  it('P8 self-test: extractWebServerCommandLine SENTETİK, ÇOK SATIRLI bir webServer bloğundan "command:" ile BAŞLAYAN SATIRIN TAMAMINI (ve yalnızca onu) döner — ne "webServer" kelimesini taşıyan ÖNCEKİ satırı ne ona yakın-kaçırmış bir satırı (mutasyon hassasiyeti kanıtı)', () => {
    const syntheticWebServerBlock = [
      '  webServer: {',
      '    commandLabel: `webServer`,',
      '    command: `astro build && astro preview`,',
      '    port: 4321,',
      '  },',
    ].join('\n')

    const webServerCommandLine = extractWebServerCommandLine(syntheticWebServerBlock)

    if (!webServerCommandLine) {
      throw new Error('sentetik blokta "command:" satırı bulunamadı')
    }

    expect(webServerCommandLine).toBe('    command: `astro build && astro preview`,')
  })
})

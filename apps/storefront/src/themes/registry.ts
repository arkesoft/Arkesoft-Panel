// @arkesoft/storefront — tema kayıt defteri + TAM EŞLEŞME çözücü (ROADMAP
// v0.0.10, T-012/S7, architect K5 "Tema çözücüsü `apps/storefront/src/
// themes/` içinde yaşar" + ADR-0002 Karar 2/3/5)
//
// ⚠⚠ ADR-0002 Karar 2 (bağlayıcı): eşleşme yoksa `resolveTheme()`
// ADLANDIRILMIŞ BİR HATA FIRLATIR — `null` DÖNMEZ (CLAUDE.md §4). Sessizce
// varsayılana düşmek REDDEDİLDİ: kiracı seçtiğinden FARKLI bir temayı
// FARKINA VARMADAN görür ve bozuk bir dağıtım MASKELENİR. Aralık/major
// çözümlemesi YAPILMAZ (ROADMAP.md:1409 — tema yayınları kiracıya ZORLA
// uygulanmaz; aralık hesabı `packages/versioning`'in işi, henüz YOK).
//
// ⚠⚠ ADR-0002 Karar 3 — N-2 modeli ŞİMDİ kurulur: anahtar biçimi
// `"{themeId}@{themeVersion}"` ve `THEME_REGISTRY` id BAŞINA ÇOK girdi
// taşıyabilir (yan yana yaşayacak majorlar AYRI workspace paketleri olur,
// `packages/themes/{id}-v{major}`). Bugün TEK girdi var; bu anahtar biçimi
// ve `resolveTheme()`'in imzası İKİNCİ girdi geldiğinde DEĞİŞMEYECEK şekilde
// tasarlandı (v0.0.21 geriye dönük KIRMAZ).
//
// ⚠⚠ ADR-0002 Karar 5 — `DEFAULT_THEME_SELECTION` kayıt defteriyle AYNI
// modülde VE tipi kayıt defterinin anahtar birleşimine BAĞLI: aşağıdaki
// `DEFAULT_THEME_REGISTRY_KEY: ThemeRegistryKey` ataması, `THEME_REGISTRY`
// içindeki karşılık gelen girdi SİLİNİRSE (veya adı yazım hatasıyla
// değiştirilirse) `pnpm typecheck`'i KIRAR — var olmayan bir temaya işaret
// etmek DERLEME HATASIDIR, çalışma zamanı sürprizi DEĞİL. Env/DB/API
// reddedildi (ADR-0002 Karar 5'in gerekçesi): env derleme çıktısında
// BULUNMAYAN bir temaya işaret edebilirdi (A4 ihlali); DB'nin ilgili tablosu
// (`PlatformRelease`) v0.0.21'de doğuyor, bugün YOK.
//
// ⚠ SÜREÇ BAŞINA BİR KEZ (K5): `THEME_REGISTRY`'nin her girdisinin
// `styleText`'i bu MODÜL YÜKLENİRKEN (import zamanında) hesaplanır —
// `generateThemeCss()` (SAF fonksiyon, `./theme-css.js`) burada TAM OLARAK
// BİR KEZ çağrılır. `resolveTheme()`'in HER çağrısı AYNI önceden-hesaplanmış
// dize REFERANSINI döndürür (istek başına SIFIR dize birleştirme — bkz.
// `__tests__/registry.test.ts`'in `toBe` kimlik testi). Hata (geçersiz ad/
// değer) AÇILIŞTA fırlar — fail-closed, `src/lib/storefront-env.ts`'in K17
// deseniyle AYNI: bu modül `import` edildiği an (THEME_REGISTRY'nin ÜST
// SEVİYE başlatması sırasında) parse/doğrulama olur, süreç o anda durur.
//
// ⚠ `process.env`'e BU MODÜLDE DOKUNULMAZ (ADR-0014 AC8 değişmezi korunur).
//
// ⚠ Bu dosya `.astro` İTHAL ETMEZ (A-A1'in garantili yolu, architect K5) —
// `pnpm typecheck`'in `.ts` dosyalarından `.astro` statik ithalini
// ÇÖZEBİLDİĞİ hiçbir yerde SINANMAMIŞ; tipli kayıt defteri bu yüzden SAF
// `.ts` kalır. `.astro` ithalleri TEK bir dosyada (`./ThemeTemplate.astro`)
// toplanır, tutarlılık `__tests__/theme-template-dispatch.test.ts`'teki
// MEKANİK (grep tabanlı) drift pin testiyle sağlanır.

import { AppError } from '@arkesoft/errors'

import { modernTheme } from '@arkesoft/themes-modern'

import { generateThemeCss } from './theme-css.js'

/**
 * `@arkesoft/theme-sdk`'nin `ThemeDefinition` tipi BU dosyadan DOĞRUDAN
 * ithal EDİLMİYOR — `./theme-setting-definition.ts`'in dosya başı
 * yorumuyla AYNI gerekçe (ölçüldü: `apps/storefront/package.json`
 * `@arkesoft/theme-sdk`'yi bağımlılık olarak BİLDİRMİYOR, pnpm'in katı
 * izolasyonu altında bu paket storefront'un `node_modules`'ına SIZMAZ).
 * Zaten bağımlılık olan `@arkesoft/themes-modern`'in somut `modernTheme`
 * DEĞERİNİN ÇIKARILMIŞ (`typeof`) tipinden türetilir — YAPISAL OLARAK AYNI
 * tip (`defineTheme()`'in dönüş tipi), ikinci bir tanım DEĞİL.
 */
type ThemeDefinition = typeof modernTheme

/** Bir kiracının (veya platform varsayılanının) tema seçimi — `themeId`/`themeVersion` çifti. */
export interface ThemeSelection {
  readonly themeId: string
  readonly themeVersion: string
}

/** Kayıt defterinin tek bir girdisi — doğrulanmış tema tanımı + önceden hesaplanmış CSS metni. */
export interface ThemeRegistryEntry {
  readonly definition: ThemeDefinition
  readonly styleText: string
}

/** `THEME_REGISTRY`'nin bir girdisini, kendi manifestinden türeterek inşa eder — `styleText` burada SÜREÇ BAŞINA BİR KEZ hesaplanır. */
function buildRegistryEntry(definition: ThemeDefinition): ThemeRegistryEntry {
  return { definition, styleText: generateThemeCss(definition.manifest.settings) }
}

/** Bir tema tanımının kayıt defteri anahtarını (`"{id}@{version}"`) manifestinin KENDİSİNDEN türetir — ikinci bir yazılı kopya YOK. */
function registryKeyOf(definition: ThemeDefinition): string {
  return `${definition.manifest.id}@${definition.manifest.version}`
}

/**
 * Tema kayıt defteri — id başına ÇOK girdi taşıyabilir (ADR-0002 Karar 3,
 * N-2). Bugün tek girdi: `modern@0.1.0`. `as const satisfies` — literal
 * anahtar birleşimi (`ThemeRegistryKey`) korunur, Karar 5'in derleme-zamanı
 * garantisi BUNA dayanır.
 */
const THEME_REGISTRY = {
  'modern@0.1.0': buildRegistryEntry(modernTheme),
} as const satisfies Record<string, ThemeRegistryEntry>

/**
 * Bir kayıt defteri girdisinin yazılı anahtarının, o girdinin KENDİ
 * manifestinden türeyen anahtarla EŞLEŞTİĞİNİ doğrular — bir gelecekteki
 * ikinci girdi eklenirken (N-2) kopyala-yapıştır anahtar/manifest
 * uyuşmazlığını AÇILIŞTA yakalar (fail-closed, dosya başı yorumu). Bu
 * kontrol OLMADAN `THEME_REGISTRY`'nin anahtarı ile içindeki manifestin
 * `id`/`version`'ı SESSİZCE SAPABİLİRDİ.
 */
function assertRegistryKeysMatchManifests(
  registry: Readonly<Record<string, ThemeRegistryEntry>>,
): void {
  for (const [key, entry] of Object.entries(registry)) {
    const derivedKey = registryKeyOf(entry.definition)
    if (key !== derivedKey) {
      throw new ThemeRegistryIntegrityError(
        `registry.ts: kayıt defteri anahtarı ("${key}") kendi manifestinden türeyen anahtarla ("${derivedKey}") eşleşmiyor.`,
      )
    }
  }
}

/**
 * Kayıt defterinin kendi iç tutarlılık hatası — bir tema YAZARI/geliştirici
 * hatasıdır (kiracı girdisi DEĞİL), AÇILIŞTA (modül yüklenirken) yakalanır.
 * `ThemeResolutionError`'dan FARKLI olarak `AppError`'dan TÜREMEZ (solid
 * gate, DÜZELTME TURU 1, K-A kararı — bağlayıcı): bu hata bir HTTP isteği
 * sırasında DEĞİL, SÜREÇ BAŞLARKEN oluşur; `AppError` `abstract` olduğu
 * için `userMessageKey` ZORUNLUDUR, ama açılışta çöken bir sürece
 * kullanıcıya dönük bir mesaj ATFETMEK ANLAMSIZDIR (hiçbir HTTP yanıtı
 * üretilmeyecek, süreç hiç ayağa kalkmayacak). Yerel, adlandırılmış
 * (`name` açıkça set edilir) bir `Error` alt sınıfı olarak KALIR.
 */
export class ThemeRegistryIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThemeRegistryIntegrityError'
  }
}

assertRegistryKeysMatchManifests(THEME_REGISTRY)

/** `THEME_REGISTRY`'nin anahtar birleşimi — Karar 5'in derleme-zamanı garantisinin dayandığı literal tip. */
export type ThemeRegistryKey = keyof typeof THEME_REGISTRY

/**
 * `resolveTheme()`'in bilinmeyen bir `(themeId, themeVersion)` çifti için
 * fırlattığı ADLANDIRILMIŞ hata (ADR-0002 Karar 2, CLAUDE.md §4: `null`
 * DÖNMEZ). `context`'i `themeId`/`themeVersion` taşır (PII DEĞİL,
 * architect risk 9'un bağlayıcı notu).
 *
 * DÜZELTME (T-012, düzeltme turu 1, `solid` gate M1 — bağlayıcı, ölçülerek
 * doğrulandı): bu sınıf önceki turda yerel bir `Error`'dan türetilmişti;
 * iki gerekçe de `solid` tarafından ÇÜRÜTÜLDÜ — (1) "vitrin `AppError`'ı
 * tüketmiyor" YANLIŞ: `apps/storefront/package.json` `@arkesoft/errors`'u
 * ZATEN bağımlılık olarak bildiriyor ve `src/lib/map-api-error.ts` ondan
 * import ediyor; (2) emsal olarak gösterilen `StorefrontApiFailure` bir
 * `Error` SINIFI değil, ayrımlı birleşim (discriminated union) — emsal
 * DEĞİLDİ. Bu hata ŞİMDİ `AppError`'dan türer: `code`/`httpStatus`/
 * `userMessageKey`/`context` dörtlüsü CLAUDE.md §4 desenine uyar.
 * `httpStatus: 503` — bilinmeyen bir tema seçimi HTTP düzeyinde her zaman
 * "mağaza şu anda yanıt vermiyor" olarak ele alınır (ADR-0012 §8); bu alan
 * artık çağıranın (middleware.ts) `instanceof ThemeResolutionError` ELLE
 * kontrolünü TEKRARLAMASINA gerek bırakmaz — `isAppError(error) &&
 * error.httpStatus` yeterlidir. `userMessageKey` i18n kataloğu
 * sözleşmesine uyar (`errors.<alan>.<ad>` biçimi, `apps/api/src/errors/
 * domain/**`'in tamamıyla AYNI desen) — bu anahtar bugün HİÇBİR yerde
 * kullanıcıya doğrudan render EDİLMEZ (hata middleware'de yakalanıp
 * `/503` sayfasına yönlendirilir, o sayfa KENDİ metnini `messages.ts`'in
 * `storefront.unavailable.*` alanından okur); yine de CLAUDE.md §10 md 17
 * uyarınca ham metin DEĞİL, anahtar taşır.
 */
export class ThemeResolutionError extends AppError {
  constructor(selection: ThemeSelection) {
    super({
      code: 'THEME_RESOLUTION_FAILED',
      httpStatus: 503,
      userMessageKey: 'errors.theme.resolutionFailed',
      context: { themeId: selection.themeId, themeVersion: selection.themeVersion },
    })
  }
}

/** `key`'in `THEME_REGISTRY`'nin bilinen bir anahtarı olup olmadığını çalışma zamanında daraltan tip koruyucusu (type guard). */
function isThemeRegistryKey(key: string): key is ThemeRegistryKey {
  return Object.hasOwn(THEME_REGISTRY, key)
}

/**
 * `THEME_REGISTRY`'nin KENDİSİ dışa AÇILMAZ (S7'nin kapalı yüzeyi KORUNUR)
 * — ama anahtar KÜMESİ, `ThemeTemplate.astro` ↔ `registry.ts` drift-pin
 * testinin (`__tests__/theme-template-dispatch.test.ts`) GERÇEK modülden
 * okuyabilmesi için BURADAN sunulur (T-012, düzeltme turu 1, `solid` gate
 * M3 — bağlayıcı: önceki pin, registry tarafını da GREP ile okuyordu,
 * yani registry.ts'in anahtar biçimini İKİNCİ kez — regex'le — uyguluyordu;
 * `length > 0` kontrolü BOŞ kümeyi yakalar ama KISMİ bir kümeyi yakalamaz).
 * `Object.keys(...).filter(isThemeRegistryKey)` `as` GEREKTİRMEDEN
 * `string[]`'i `ThemeRegistryKey[]`'e daraltır — tip koruyucusuyla süzme,
 * CLAUDE.md §4'ün "`as` yalnızca runtime doğrulamasından hemen sonra"
 * kuralının `as`'ı SIFIRA indirgenmiş hali.
 */
export const THEME_REGISTRY_KEYS: readonly ThemeRegistryKey[] =
  Object.keys(THEME_REGISTRY).filter(isThemeRegistryKey)

/**
 * `resolveTheme()`'in dönüş şekli — çözülmüş kayıt defteri girdisi İLE o
 * girdinin kayıt defterindeki BİLİNEN anahtarı bir ARADA.
 *
 * DÜZELTME (T-012, düzeltme turu 1, `solid` gate M2/K-C — bağlayıcı):
 * önceki turda `resolveTheme()` yalnızca `ThemeRegistryEntry` döndürüyordu
 * ve çağıran (`middleware.ts`) kayıt defteri anahtarını KENDİ başına
 * `` `${themeId}@${themeVersion}` as ThemeRegistryKey `` ile YENİDEN
 * İNŞA EDİYORDU — anahtar formülü İKİ üretici yerde (`registry.ts`'in
 * `isThemeRegistryKey`'i ve `middleware.ts`'in elle birleştirmesi) YAŞIYOR
 * ve `as` doğrulanmamış bir YALAN olabiliyordu (ayraç biçimi değişirse
 * `middleware.ts`'in yeniden inşası `isThemeRegistryKey`'in kabul ettiği
 * biçimle SESSİZCE sapar, dispatch düşer, ziyaretçi 503 yerine 500 görür).
 * Artık BU fonksiyonun İÇİNDE `isThemeRegistryKey(key)` ÇAĞRISI `key`'i
 * zaten `ThemeRegistryKey`'e DARALTIYOR (tip koruyucusu — `as` DEĞİL,
 * gerçek runtime doğrulaması) — o doğrulanmış değer burada DIŞA AÇILIR,
 * ikinci bir üretici yerde YENİDEN HESAPLANMAZ.
 */
export interface ResolvedTheme {
  readonly key: ThemeRegistryKey
  readonly entry: ThemeRegistryEntry
}

/**
 * Bir `ThemeSelection`'ı kayıt defterindeki girdiye çözer — TAM EŞLEŞME.
 * Eşleşme yoksa (bilinmeyen id VEYA bilinmeyen version) `ThemeResolutionError`
 * FIRLATIR, `null`/`undefined` DÖNMEZ (ADR-0002 Karar 2). Aralık/major
 * çözümlemesi YAPILMAZ — `0.1.0` isteyen bir kiracı `0.1.3` ile RENDER
 * EDİLEMEZ.
 *
 * Döndürülen `ResolvedTheme.entry.styleText` SÜREÇ BAŞINA BİR KEZ
 * hesaplanmış bir dizedir — bu fonksiyonun aynı seçimle İKİ çağrısı AYNI
 * dize REFERANSINI döndürür (`__tests__/registry.test.ts`'in `toBe` kimlik
 * testi). `ResolvedTheme.key` ise çağıranın İKİNCİ bir biçim İCAT ETMEDEN
 * kullanacağı, ZATEN doğrulanmış kayıt defteri anahtarıdır.
 */
export function resolveTheme(selection: ThemeSelection): ResolvedTheme {
  const key = `${selection.themeId}@${selection.themeVersion}`

  if (!isThemeRegistryKey(key)) {
    throw new ThemeResolutionError(selection)
  }

  return { key, entry: THEME_REGISTRY[key] }
}

/**
 * Platformun derleme-zamanı varsayılan tema seçimi (ADR-0002 Karar 5) —
 * kiracının HİÇBİR tema seçimi olmadığında (`themeId`/`themeVersion`
 * `null`) vitrinin uyguladığı tema. Env/DB/API DEĞİL: bu sabit `THEME_
 * REGISTRY`'nin KENDİ girdisinden türer (`DEFAULT_THEME_REGISTRY_KEY`'in
 * atanabilirliği derleme zamanında zorlanır — dosya başı yorumu).
 */
const DEFAULT_THEME_REGISTRY_KEY: ThemeRegistryKey = 'modern@0.1.0'

const DEFAULT_THEME_ENTRY = THEME_REGISTRY[DEFAULT_THEME_REGISTRY_KEY]

export const DEFAULT_THEME_SELECTION: ThemeSelection = {
  themeId: DEFAULT_THEME_ENTRY.definition.manifest.id,
  themeVersion: DEFAULT_THEME_ENTRY.definition.manifest.version,
}

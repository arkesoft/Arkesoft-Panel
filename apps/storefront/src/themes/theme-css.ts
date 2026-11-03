// @arkesoft/storefront — tema ayarlarını CSS custom property'lerine çeviren
// SAF üreteç (ROADMAP v0.0.10, T-012/S7, architect K5 "Ayar → CSS değişkeni
// eşlemesi" + AC3'ün bağlayıcı düzeltmesi)
//
// ⚠⚠ TÜRETME KURALI (bağlayıcı, İSTİSNASIZ): her değişken adı `--${setting.
// key}` ile İNŞA EDİLİR. Bu dosyada HİÇBİR gerçek ayar anahtarının (ör.
// manifestteki herhangi bir `settings[].key` değeri) literal metni GEÇMEZ —
// bu, "adın ikinci bir DOĞRULUK KAYNAĞI olmaması" değişmezinin kanıtı
// (po'nun AC3 düzeltmesi: `rg` hedefi artık `--<anahtar>` değil, bu dosyada
// manifestin GERÇEK bir anahtar değerinin TAM 1 defa dahi GEÇMEMESİ — ölçüm
// `__tests__/theme-css-no-literal-keys.test.ts`'te, MUTASYON KANITLI; o test
// dosyası KENDİSİ gerçek anahtar adlarını özgürce kullanır, bu dosya
// KULLANMAZ).
//
// ⚠ Üretecin KENDİ izin listesi (security gate'in BİRİNCİ maddesi, bugün
// girdi sabit ama v0.3.0 bu fonksiyona KİRACI JSONB'si besleyecek):
//   - Türetilen AD (`setting.key`) katı bir desene (`CSS_VARIABLE_NAME_
//     PATTERN`) uymak ZORUNDADIR — uymuyorsa adlandırılmış hata FIRLATIR.
//   - DEĞER tip başına KENDİ deseniyle doğrulanır. `@arkesoft/theme-sdk`'nın
//     `THEME_COLOR_HEX_PATTERN`'i paketin barrel'ında (`index.ts`) YOK —
//     devralmak YAPISAL OLARAK İMKÂNSIZ (bilinçli SDK kararı); bu dosya
//     KENDİ hex desenini (`COLOR_VALUE_PATTERN`) tanımlar.
//   - ⚠⚠ FONT DEĞERİ RİSKİ (S5'in bıraktığı, docs/ui/T-012.md "RİSKLER"):
//     bir `font` ayarının `default`'ı SERBEST METİNDİR ve bu temanın sistem
//     font yığını virgül/tırnak/tire İÇERİR (`theme.config.ts`'teki
//     `SYSTEM_FONT_STACK`). Bu değer kaçışsız bir `<style>` elementine
//     yazılırsa ENJEKSİYON YÜZEYİ doğar. Çözüm KAÇIŞLAMA değil İZİN
//     LİSTESİ.
//     ⚠⚠ DÜZELTME (T-012, düzeltme turu 1, `security` gate `medium` —
//     bağlayıcı): önceki tur tırnağı İZİN LİSTESİNE DOĞRUDAN eklemişti
//     (`FONT_VALUE_PATTERN`), bu DENGE'yi hiç kontrol ETMİYORDU — `Arial"`,
//     `Arial'`, tek karakter `"`, `Arial" ,x` hepsi KABUL ediliyordu
//     (ölçüldü). Dengesiz bir tırnak CSS Söz Dizimi §4.3.1 gereği EOF'a
//     kadar süren bir `<string-token>` AÇAR, `:root{...}` hiç KAPANMAZ.
//     Şimdi değer virgülle AYRILIR, her aile belirteci TIRNAKSIZ bir
//     izin listesine (`BARE_FONT_FAMILY_PATTERN`) VEYA dengeli-tırnaklı bir
//     kabuğa (`QUOTED_FONT_FAMILY_SHELL_PATTERN` + İÇ içerik deseni) karşı
//     doğrulanır, tırnak karakterinin KENDİSİ çıktıya girdiden KOPYALANMAZ —
//     ÜRETEÇ (`formatFontFamily`) hangi ailenin tırnak GEREKTİRDİĞİNE
//     (boşluk içeriyorsa) kendi karar verir. Dengesiz/tek karakterlik bir
//     tırnak bu yüzden YAPISAL OLARAK çıktıya hiç ULAŞAMAZ.
//
// ⚠ YAYILAN KÜME: YALNIZCA `color` ve `font` (architect K5). `group`
// derinlik-1 çocuklarına İNİLİR (theme-sdk `primitives.ts:187-204` —
// `group` içinde `group` YOK, derleyici bunu zaten zorluyor). Diğer beş
// ilkel (`select`/`toggle`/`image`/`text`/`number`) YAYILMAZ — HER dalda
// yazılı gerekçe (aşağıdaki `switch`). Yayılan kümeyi BÜYÜTMEK additive'dir,
// bugünden spekülatif eklenmez.
//
// ⚠ SAFLIK: bu modül hiçbir I/O yapmaz, `process.env`'e dokunmaz (ADR-0014
// AC8 değişmezi), hiçbir modül-düzeyi yan etki TAŞIMAZ — `generateThemeCss`
// SAF bir fonksiyondur, çağıranı (`src/themes/registry.ts`) SÜREÇ BAŞINA
// BİR KEZ çağırır (K5 "Bir kez, SÜREÇ BAŞINA" kararı, bu dosyanın işi
// DEĞİL — çağırma SIKLIĞI registry.ts'in sorumluluğu).
//
// ⚠ Üretilen `styleText`'in NEREYE yazılacağı (hangi `<style>` idiomu,
// `head-extra` slotu) bu dosyanın işi DEĞİLDİR — K1'in "DEĞER kiracıya
// bağlıdır → yalnızca middleware'in ulaştığı yanıtta, `private, no-store`.
// KURAL kiracıdan bağımsızdır → derleme çıktısında donar; hangi kanalda
// taşındığı (satır-içi veya `/_astro/*`) önbellek politikasını ETKİLEMEZ"
// değişmezinin TAŞIYICI kısmı S8'in işi (`apps/storefront/src/pages/
// index.astro`, DOKUNULMADI). Bu dosya sadece DEĞERİ üretir.

import { assertNever } from '../lib/assert-never.js'
import type { ThemeSettingDefinition } from './theme-setting-definition.js'

/**
 * Üretilecek CSS özel özellik (custom property) ADI için üreteçin KENDİ izin
 * listesi — SDK'nın `SETTING_KEY_FORMAT_PATTERN`'inden (`A-Za-z0-9_-`, büyük
 * harf + alt çizgi destekli) daha SIKI: yalnızca küçük harf + rakam + tire,
 * harfle BAŞLAR. Bir CSS özel özelliği adı olarak kullanılacak her değer bu
 * dosyanın KENDİ kararıdır, SDK'nın daha gevşek kuralını DEVRALMAZ.
 */
const CSS_VARIABLE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * `color` ilkelinin DEĞERİ için üreteçin KENDİ hex deseni — `#rrggbb` veya
 * `#rrggbbaa`. `@arkesoft/theme-sdk`'nın `THEME_COLOR_HEX_PATTERN`'i paketin
 * barrel'ında (`index.ts`) EXPORT EDİLMİYOR (bilinçli SDK kararı, dosya başı
 * yorumu) — bu yüzden bu desen BAĞIMSIZ tanımlanır, devralınmaz.
 */
const COLOR_VALUE_PATTERN = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/**
 * `font` ilkelinin DEĞERİ için üreteçin KENDİ izin listesi (dosya başı
 * yorumu, "FONT DEĞERİ RİSKİ").
 *
 * DÜZELTME (T-012, düzeltme turu 1, `security` gate `medium` — bağlayıcı,
 * ölçülerek doğrulandı): önceki desen (`/^[A-Za-z0-9 ,"'-]+$/`) tırnağı
 * izin listesine DOĞRUDAN ekliyordu — bu, tırnak DENGESİNİ hiç kontrol
 * ETMİYORDU (`Arial"` · `Arial'` · tek karakter `"` · `Arial" ,x` hepsi
 * KABUL ediliyordu, ölçüldü). Dengesiz bir tırnak, üretilen `<style>`
 * içinde CSS Söz Dizimi §4.3.1 gereği EOF'a kadar süren bir `<string-token>`
 * AÇAR — `:root{...}` BLOĞU hiç kapanmaz, SONRAKİ TÜM custom property'ler
 * düşer (XSS/exfiltration YOK, ama vitrin tipografisiz/renksiz render
 * edilir).
 *
 * TERCİH EDİLEN DÜZELTME (security'nin tercih ettiği yol, T-010'un kara
 * liste → izin listesi dönüşümüyle AYNI ilke): tırnak karakteri izin
 * listesinden TAMAMEN ÇIKARILDI — bu desen artık TEK bir virgülle ayrılmış
 * yazı tipi AİLE BELİRTECİNİ (tırnaklar HARİÇ) doğrular. Tırnaklama artık
 * GİRDİDEN kopyalanmaz, ÜRETEÇ tarafından (`formatFontFamilyDeclaration`)
 * KARAR VERİLİR — bu yüzden dengesiz/tek karakterlik bir tırnak YAPISAL
 * OLARAK çıktıya hiç ULAŞAMAZ (devralınan bir string değil, üretilen bir
 * string). `-apple-system` gibi baştan tireli sistem belirteçleri için
 * baştaki tireye İZİN VERİLİR.
 */
const BARE_FONT_FAMILY_PATTERN = /^-?[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/

/**
 * Girdide TIRNAKLANMIŞ gelen bir belirtecin DIŞ kabuğu — eşleşen çift/tek
 * tırnak, aralarında İKİNCİ bir tırnak karakteri YOK (bu yüzden `Arial"`,
 * `"`, dengesiz herhangi bir tırnak BU DESENLE EŞLEŞMEZ — denge burada
 * YAPISAL olarak zorlanır, girdiye GÜVENİLMEZ).
 */
const QUOTED_FONT_FAMILY_SHELL_PATTERN = /^(["'])([^"']*)\1$/

/** Tırnaklı bir belirtecin İÇ İÇERİĞİ — harf/rakam, kelimeler TEK boşlukla ayrılır (tırnak zaten dıştaki kabukta tüketildi, burada YOK). */
const QUOTED_FONT_FAMILY_INNER_PATTERN = /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/

/**
 * Bu üretecin adlandırılmış hatası — `resolveTheme()`'in `registry.ts`'teki
 * ikiziyle AYNI aile (CLAUDE.md §4: beklenen durum için hata FIRLAT, sessizce
 * atlama/kaçışlama YOK). `name` AÇIKÇA set edilir (CLAUDE.md §4'ün
 * "adlandırılmış hata" ruhu) — bu paket bugün hiçbir yerde `@arkesoft/
 * errors`'un `AppError` hiyerarşisini TÜKETMİYOR (ölçüldü, `rg -n "extends
 * AppError" apps/storefront` → 0 eşleşme); bu hata bir HTTP/i18n sözleşmesi
 * TAŞIMAZ, modül YÜKLENİRKEN (fail-closed, `storefront-env.ts` deseni) bir
 * TEMA YAZARI/geliştirme hatasını yakalar.
 */
export class ThemeCssGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThemeCssGenerationError'
  }
}

/** Türetilen CSS özel özellik adını KENDİ izin listesine karşı doğrular. */
function assertValidVariableName(name: string): void {
  if (!CSS_VARIABLE_NAME_PATTERN.test(name)) {
    throw new ThemeCssGenerationError(
      `theme-css.ts: türetilen CSS değişken adı izin listesine uymuyor — "${name}"`,
    )
  }
}

/** `color` ilkelinin değerini KENDİ hex desenine karşı doğrular. */
function assertValidColorValue(name: string, value: string): void {
  if (!COLOR_VALUE_PATTERN.test(value)) {
    throw new ThemeCssGenerationError(
      `theme-css.ts: "${name}" için geçersiz renk değeri (hex beklenir) — "${value}"`,
    )
  }
}

/**
 * TEK bir yazı tipi aile belirtecini (virgülle ayrılmış listenin bir
 * öğesini) doğrular ve TIRNAKSIZ aile ADINI döndürür — girdi tırnaklı
 * (`"Segoe UI"`/`'Segoe UI'`) VEYA çıplak (`Arial`) olabilir, ama İKİSİ
 * DIŞINDA (dengesiz tırnak dahil) her biçim REDDEDİLİR. Tırnağın KENDİSİ
 * dönüş değerine hiç GİRMEZ — yeniden tırnaklama kararı çağıranın
 * (`formatFontFamilyDeclaration`) işidir.
 */
function parseFontFamilyToken(name: string, rawToken: string): string {
  const token = rawToken.trim()

  const quotedMatch = QUOTED_FONT_FAMILY_SHELL_PATTERN.exec(token)
  if (quotedMatch?.[2] !== undefined) {
    const inner = quotedMatch[2]
    if (QUOTED_FONT_FAMILY_INNER_PATTERN.test(inner)) {
      return inner
    }
  } else if (BARE_FONT_FAMILY_PATTERN.test(token)) {
    return token
  }

  throw new ThemeCssGenerationError(
    `theme-css.ts: "${name}" için geçersiz yazı tipi aile belirteci (izin listesi dışı karakter veya dengesiz tırnak) — "${rawToken}"`,
  )
}

/** Tırnaksız bir aile adını CSS çıktısı için biçimlendirir — tırnaklama kararı BURADA verilir, girdiden KOPYALANMAZ (F4 düzeltmesi). */
function formatFontFamily(family: string): string {
  return family.includes(' ') ? `"${family}"` : family
}

/**
 * `font` ilkelinin TAM değerini (virgülle ayrılmış aile listesini) doğrular
 * ve ÜRETEÇİN KENDİ tırnaklama kararıyla yeniden oluşturur. Enjeksiyon
 * savunması: her belirteç `parseFontFamilyToken` ile tek tek doğrulanır,
 * tırnak karakteri çıktıya SADECE bu fonksiyonun kararıyla (boşluk içeren
 * aile adları için) eklenir.
 */
function toSafeFontValue(name: string, value: string): string {
  return value
    .split(',')
    .map((rawToken) => parseFontFamilyToken(name, rawToken))
    .map(formatFontFamily)
    .join(', ')
}

/** Tek bir CSS özel özelliği bildirimi — `name` `--` ÖNEKİ TAŞIMAZ (türetme `toDeclarationLine`'da olur). */
interface CssDeclaration {
  readonly name: string
  readonly value: string
}

/**
 * Tek bir ayar tanımından (gerekirse `group` için ÖZYİNELİ) sıfır veya daha
 * fazla CSS bildirimi üretir. Sekiz ilkelin TAMAMI üzerinde EXHAUSTIVE
 * `switch` + `assertNever` — architect K5'in bağlayıcı kararı.
 */
function declarationsOf(definition: ThemeSettingDefinition): readonly CssDeclaration[] {
  switch (definition.type) {
    case 'color': {
      assertValidVariableName(definition.key)
      assertValidColorValue(definition.key, definition.default)
      return [{ name: definition.key, value: definition.default }]
    }
    case 'font': {
      assertValidVariableName(definition.key)
      const safeValue = toSafeFontValue(definition.key, definition.default)
      return [{ name: definition.key, value: safeValue }]
    }
    case 'group':
      // `group`'un çocukları derinlik-1 "yaprak" ilkellerdir (theme-sdk
      // `primitives.ts:187-204`, `group` İÇERMEZ) — bu fonksiyona ÖZYİNELİ
      // geçirmek güvenli, sonsuz döngü riski YOK.
      return definition.children.flatMap(declarationsOf)
    case 'select':
      // GEREKÇE (architect K5): bir `select` DEĞERİ (ör. "izgara" / "liste")
      // tema YAZARININ tanımladığı serbest bir etiket kümesidir — doğrudan
      // CSS'e yazmak bir enjeksiyon yüzeyi açardı (değer `options`
      // listesinde doğrulanmış OLSA bile, CSS BAĞLAMINDA güvenli olduğu
      // ANLAMINA gelmez). v0.0.10 kapsamı yalnızca renk/yazı tipini CSS'e
      // taşıyor.
      return []
    case 'toggle':
      // GEREKÇE: bir boole bir CSS özel özelliği DEĞERİ değildir — bir
      // ikili DURUM, genellikle bir CSS KURALININ (seçici/medya sorgusu)
      // varlığına karşılık gelir, bir DEĞERE değil. Bu üreteç kural
      // ÜRETMEZ, sadece değer.
      return []
    case 'image':
      // GEREKÇE (BN-1/SEC-5 sıralama kısıtı, ROADMAP v0.0.10 Task): bir
      // görsel REFERANSI (yol/URL) bir CSS DEĞİŞKENİ değil, bir VARLIK
      // kimliğidir — servis çözücüsü olmadan (bu sürümde YOK, SEC-5b
      // ertelendi) yayılamaz; yayılırsa `background-image: var(--x)`
      // çağıranı sağlanmamış bir servis sözleşmesine bağlardı.
      return []
    case 'text':
      // GEREKÇE: serbest metin KULLANICI girdisidir (v0.3.0'dan itibaren
      // kiracı JSONB'si) — doğrudan bir CSS değerine yazmak bu dosyanın
      // BİRİNCİ risk sınıfı (dosya başı yorumu); bugün hiçbir tüketici
      // metin tabanlı bir CSS özel özelliği beklemiyor.
      return []
    case 'number':
      // GEREKÇE: bugün hiçbir tüketici sayısal bir CSS özel özelliği (ör.
      // bir boşluk ÖLÇEĞİ) beklemiyor; yayılan kümeyi büyütmek additive'dir,
      // bugünden spekülatif eklenmiyor.
      return []
    default:
      return assertNever(definition, 'theme-css.ts: ThemeSettingDefinition.type')
  }
}

/** Tek bir bildirimi `--ad:değer;` satırına çevirir — `--` ÖNEKİ BURADA, TÜRETME KURALI İSTİSNASIZ. */
function toDeclarationLine(declaration: CssDeclaration): string {
  return `--${declaration.name}:${declaration.value};`
}

/**
 * Bir ayar tanımı listesinden `:root` seçicili TAM bir CSS metni üretir.
 * SAF fonksiyon — I/O yok, `process.env` yok, modül-düzeyi yan etki yok.
 * Çağıranı (`registry.ts`) bu fonksiyonu SÜREÇ BAŞINA BİR KEZ çağırır; bu
 * fonksiyonun KENDİSİ o garantiyi TAŞIMAZ (saf fonksiyonlar idempotenttir,
 * memoizasyon çağıranın sorumluluğudur).
 */
export function generateThemeCss(settings: readonly ThemeSettingDefinition[]): string {
  const declarations = settings.flatMap(declarationsOf)
  const body = declarations.map(toDeclarationLine).join('')

  return `:root{${body}}`
}

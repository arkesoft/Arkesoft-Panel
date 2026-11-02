// @arkesoft/theme-sdk — şablon/slot tanımı (ROADMAP v0.0.9, T-010/S5,
// architect "Tip tasarımı" + "Zorunlu şablon kümesi" kararları, AC11 +
// `THEME_TEMPLATE_DUPLICATE`)
//
// ⚠ `templates` BİR DİZİDİR, ANAHTARLI (keyed) NESNE DEĞİLDİR — gerekçe
// ÖLÇÜLMÜŞ (architect'in Teknik Tasarım bölümü): `'404'` bir JS nesnesinde
// anahtar olarak kullanılsa, JS'in SAYI-BENZERİ (integer-like) anahtar
// semantiği onu nesnenin BAŞINA taşırdı (`Object.keys({ product: 1, '404':
// 2 })` → `['404', 'product']`, bildirim sırası KORUNMAZ) ve bu,
// `z.toJSONSchema()`'nın (S7'nin işi) ürettiği çıktının DETERMİNİZMİNİ
// bozardı — AC12'nin bayt-birebir karşılaştırması bu yüzden kırılırdı. Bir
// DİZİ'de sıra her zaman bildirim sırasıdır, `'404'` tel değeri (wire
// value) hiçbir normalleştirmeye UĞRAMAZ ve bir TEMA YAZARI theme.json'ına
// `"404"` yazar (bu tel değeri KORUNUR, değişmez — mimarın bağlayıcı
// kararı). Bedeli: dizi şekli aynı `type`'ın BİRDEN FAZLA kez tanımlanmasını
// yapısal olarak MÜMKÜN kılar — `THEME_TEMPLATE_DUPLICATE` bu yüzden VAR,
// bu AC listesinde olmayan ama dizi şeklinin ZORUNLU SONUCU olan bir kod
// (kapsam genişlemesi DEĞİL, aşağıdaki `.check()`'in gerekçesi).
//
// ⚠ ZORUNLU ŞABLON KÜMESİ: `home` + `404` (V6, architect'in bağlayıcı
// kararı) — gerekçe: CLAUDE.md §3'ün paket ağacında `packages/themes/
// corporate/` VAR (bir KURUMSAL SİTE teması, e-ticaret değil).
// `cart`/`product`/`collection`'ı ZORUNLU kılmak bu temayı TEMSİL EDİLEMEZ
// yapardı (kurumsal bir sitede sepet/ürün/koleksiyon şablonu YOKTUR, olması
// da GEREKMEZ). Ayrıca zorunlu kümeyi GENİŞLETMEK **major** (var olan bir
// temanın yayınını BOZAR), DARALTMAK **minor**'dır — bu asimetri yüzünden
// BUGÜN en KÜÇÜK güvenli küme seçilir (`home` + `404`, her site türünün
// ortak paydası: bir giriş sayfası ve bir "bulunamadı" sayfası); küme
// ileride GENİŞLETİLEBİLİR ama bu bir `major` kararı gerektirir.

import { z } from 'zod'

import type { ThemeContractErrorCode } from '../errors.js'
import { THEME_CONTRACT_MESSAGES } from '../messages.js'

/** Desteklenen yedi şablon türünün TEL (wire) değerleri — bildirim sırası KORUNUR (dosya başı yorumu). */
export const THEME_TEMPLATE_TYPES = [
  '404',
  'home',
  'product',
  'collection',
  'cart',
  'page',
  'blog',
] as const

/** Bir şablon türünün çıkarılmış TypeScript tipi. */
export type ThemeTemplateType = (typeof THEME_TEMPLATE_TYPES)[number]

const KNOWN_TEMPLATE_TYPES: ReadonlySet<string> = new Set(THEME_TEMPLATE_TYPES)

/** Her temanın (e-ticaret VEYA kurumsal site) temsil etmek ZORUNDA olduğu en küçük ortak küme (V6, dosya başı yorumu). */
export const REQUIRED_THEME_TEMPLATE_TYPES: readonly ThemeTemplateType[] = ['home', '404']

const THEME_TEMPLATE_UNKNOWN_CODE: ThemeContractErrorCode = 'THEME_TEMPLATE_UNKNOWN'
const THEME_TEMPLATE_DUPLICATE_CODE: ThemeContractErrorCode = 'THEME_TEMPLATE_DUPLICATE'
const THEME_TEMPLATE_MISSING_CODE: ThemeContractErrorCode = 'THEME_TEMPLATE_MISSING'

/**
 * Bir şablonun `type` alanı — bilinen yedi değerden biri değilse
 * `THEME_TEMPLATE_UNKNOWN` ile işaretlenmiş bir `custom` issue üretir
 * (`../settings/keys.ts`/`select` refine'ı İLE AYNI desen: tek doğrulama
 * noktası + `params.themeContractErrorCode` etiketi). `.transform()`
 * YALNIZCA bu check BAŞARILI OLDUKTAN SONRA çalışır — bu noktada değerin
 * {@link ThemeTemplateType} kümesinde olduğu Zod tarafından ZATEN
 * doğrulanmıştır; `as` burada CLAUDE.md §2'nin izin verdiği "runtime
 * doğrulamasından HEMEN SONRA" durumudur (Zod enum'u yerine bilerek `.check
 * ()` + `.transform()` seçildi — bir `z.enum` kullansaydık uyumsuzluk
 * issue'su `invalid_value` kodunda doğardı ve bunu `THEME_TEMPLATE_UNKNOWN`
 * ile eşlemek için ayrı bir path-bazlı sezgisel eşleme gerekirdi; `.check()`
 * ile doğrudan doğru kodu üretmek, paketin HER YERDE kullandığı tek
 * doğrulama idiomuyla TUTARLIDIR).
 */
const THEME_TEMPLATE_TYPE_SCHEMA = z
  .string()
  .check((payload) => {
    if (!KNOWN_TEMPLATE_TYPES.has(payload.value)) {
      payload.issues.push({
        code: 'custom',
        input: payload.value,
        message: THEME_CONTRACT_MESSAGES.THEME_TEMPLATE_UNKNOWN,
        params: { themeContractErrorCode: THEME_TEMPLATE_UNKNOWN_CODE },
      })
    }
  })
  .transform((value) => value as ThemeTemplateType)

/** Bir şablonun TEK bir slotu — hangi bölüm (section) türlerinin bu slota konabileceğini bildirir. */
export const THEME_SLOT_SCHEMA = z.strictObject({
  id: z.string().min(1),
  label: z.string(),
  allowedSections: z.array(z.string()).readonly(),
  maxSections: z.number().int().positive().optional(),
  isRequired: z.boolean().optional(),
})

/** Tek bir slot tanımının çıkarılmış TypeScript tipi. */
export type ThemeSlot = z.infer<typeof THEME_SLOT_SCHEMA>

/** Tek bir şablon tanımı — `type` + slot listesi. */
export const THEME_TEMPLATE_SCHEMA = z.strictObject({
  type: THEME_TEMPLATE_TYPE_SCHEMA,
  slots: z.array(THEME_SLOT_SCHEMA).readonly(),
})

/** Tek bir şablon tanımının çıkarılmış TypeScript tipi. */
export type ThemeTemplate = z.infer<typeof THEME_TEMPLATE_SCHEMA>

/**
 * `templates` DİZİSİNİN TAMAMI — tekrar (`THEME_TEMPLATE_DUPLICATE`) ve
 * eksik zorunlu küme (`THEME_TEMPLATE_MISSING`) kontrolleri BURADA, dizi
 * SEVİYESİNDE bir `.check()` ile yapılır (tek elemanın kendi başına
 * BİLEMEYECEĞİ, TÜM diziye bakması gereken kurallar — `../migrations/
 * chain.ts`'in topoloji kontrolleriyle AYNI "manuel geçiş" felsefesi, ama
 * burada `.check()` ile ŞEMANIN KENDİSİNE gömülü, çünkü `validateThemeManifest`
 * (S5'in `validate-manifest.ts`'i) tek bir `safeParse` çağrısıyla TÜM
 * manifestin issue'larını toplayabilsin — ayrı bir manuel geçiş katmanı
 * GEREKMEZ).
 */
export const THEME_TEMPLATES_SCHEMA = z
  .array(THEME_TEMPLATE_SCHEMA)
  .readonly()
  .check((payload) => {
    const firstIndexOfType = new Map<ThemeTemplateType, number>()

    payload.value.forEach((template, index) => {
      const firstIndex = firstIndexOfType.get(template.type)

      if (firstIndex !== undefined) {
        payload.issues.push({
          code: 'custom',
          input: template.type,
          path: [index, 'type'],
          message: THEME_CONTRACT_MESSAGES.THEME_TEMPLATE_DUPLICATE,
          params: { themeContractErrorCode: THEME_TEMPLATE_DUPLICATE_CODE },
        })
        return
      }

      firstIndexOfType.set(template.type, index)
    })

    const presentTypes = new Set(payload.value.map((template) => template.type))
    const isMissingRequiredTemplate = REQUIRED_THEME_TEMPLATE_TYPES.some(
      (requiredType) => !presentTypes.has(requiredType),
    )

    if (isMissingRequiredTemplate) {
      payload.issues.push({
        code: 'custom',
        input: payload.value,
        path: [],
        message: THEME_CONTRACT_MESSAGES.THEME_TEMPLATE_MISSING,
        params: { themeContractErrorCode: THEME_TEMPLATE_MISSING_CODE },
      })
    }
  })

/** `templates` dizisinin çıkarılmış TypeScript tipi. */
export type ThemeTemplates = z.infer<typeof THEME_TEMPLATES_SCHEMA>

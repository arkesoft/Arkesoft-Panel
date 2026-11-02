// @arkesoft/theme-sdk — hata kodu → Türkçe geliştirici metni (ROADMAP v0.0.9,
// T-010/S2, architect "Mesaj dili: Türkçe geliştirici metni, i18n anahtarı
// DEĞİL" kararı, ADR-0013 taslağı)
//
// ⚠ MESAJ DİLİ KARARI (architect, BAĞLAYICI) — gerekçe:
// Bu tablonun TÜKETİCİSİ tema GELİŞTİRİCİSİDİR, platformun SON KULLANICISI
// DEĞİL. Metin bir CI logunda, terminalde veya `pnpm --filter
// @arkesoft/theme-sdk test` çıktısında okunur — hiçbir zaman doğrudan bir
// tarayıcı ekranına YAZILMAZ. Bu yüzden CLAUDE.md §4'ün "kullanıcıya dönük
// hata mesajları i18n kataloğundan gelir" kuralı burada İHLAL EDİLMİYOR,
// farklı bir tüketici sınıfına uygulanıyor: platformun KARARLI makine
// sözleşmesi `errors.ts`'teki `code`'dur, BU TABLODAKİ `message` DEĞİL.
//   - `message` metni değiştirmek → **patch** (CLAUDE.md §9 semver kuralı).
//   - `code` eklemek/silmek/anlamını değiştirmek → **minor**/**major**.
// Son kullanıcıya gösterilecek ÇEVİRİ, `code` → i18n anahtarı eşlemesiyle
// UYGULAMA katmanında yapılır (v0.0.21, `packages/ui` şema→form motoru bu
// eşlemeyi tüketecek) — yani CLAUDE.md §4 İHLAL EDİLMİYOR, DOĞRU KATMANDA
// uygulanıyor; bu paket sunum/i18n katmanı DEĞİL (bkz. README "Yapmaz").
//
// ⚠ Zod'un hazır `tr` locale'i (`zod/v4/locales/tr.js`) BİLİNÇLİ OLARAK
// KULLANILMADI — iki gerekçe: (1) Zod'un genel şema hata metinleri
// ("Beklenen string, alınan number" gibi) bu paketin KARARLI 15 kodluk
// tablosunu bulanıklaştırır; her Zod issue'su `errors.ts`'teki belirli bir
// `ThemeContractErrorCode`'a elle eşlenir, Zod'un kendi metni asla dışarı
// sızmaz. (2) `z.config({ customError: ... })` ile locale kurmak GLOBAL bir
// yan etkidir (modül yüklendiği anda `zod`'un paylaşılan ayar nesnesini
// değiştirir) — bu paketin saflık pini (`__tests__/purity.test.ts`) ve
// README'nin "Yapmaz" sütunu I/O/yan etki İÇERMEZ der; global `z.config()`
// çağrısı bu garantiyi ÇÜRÜTÜRDÜ (aynı process'te theme-sdk'yı import eden
// başka bir paketin Zod locale'ini sessizce değiştirirdi).
//
// ⚠ ÖLÇÜLEBİLİR GÜVENCE (bu dosyanın asıl değeri): `satisfies
// Record<ThemeContractErrorCode, string>` — `errors.ts`'e yeni bir kod
// EKLENİP buraya karşılık gelen mesaj EKLENMEZSE `pnpm typecheck` KIRILIR.
// Bu iddia S2'de KASITLI BOZMAYLA kanıtlandı (bir mesaj satırı silinip
// typecheck'in kırmızı çıktığı gözlemlendi, sonra geri alındı) — kanıt
// handoff paketinde ham çıktı olarak taşınır, bu dosyada TEKRARLANMAZ.

import type { ThemeContractErrorCode } from './errors.js'

/**
 * Hata kodu → Türkçe geliştirici metni. `satisfies` anahtar sözcüğü bu
 * nesnenin `ThemeContractErrorCode` birleşiminin TAMAMINI kapsadığını
 * derleme zamanında zorlar (dosya başı yorumuna bakınız).
 */
export const THEME_CONTRACT_MESSAGES = {
  THEME_MANIFEST_UNKNOWN_KEY: 'theme.json içinde sözleşmede tanımlı olmayan bir anahtar var.',
  THEME_MANIFEST_INVALID: 'theme.json şemayla eşleşmiyor.',
  THEME_ID_INVALID:
    "Tema id'si geçersiz biçimde — küçük harf, rakam ve tire ile başlayan bir harfle kurulmalı.",
  THEME_SDK_RANGE_INVALID: 'sdkRange alanı geçerli bir semver aralığı biçiminde değil.',
  THEME_TEMPLATE_UNKNOWN: 'Tanımlanan şablon türü desteklenen şablon kümesinde yok.',
  THEME_TEMPLATE_MISSING: 'Zorunlu şablon(lar) eksik (en az home ve 404 bulunmalı).',
  THEME_TEMPLATE_DUPLICATE: 'Aynı şablon türü birden fazla kez tanımlanmış.',
  THEME_SETTING_KEY_UNSAFE:
    'Ayar anahtarı güvensiz bir biçimde — izin verilen karakter kümesi dışında.',
  THEME_SETTING_INVALID: 'Ayar tanımı kendi ilkel tipinin şemasıyla eşleşmiyor.',
  THEME_ASSET_REF_INVALID:
    'Varlık (asset) referansının yolu geçersiz — mutlak URL, baştaki "/", ".." veya "\\" içeremez.',
  THEME_MIGRATION_MISSING: 'Sürümler arası geçiş için gerekli migration tanımı eksik.',
  THEME_MIGRATION_GAP: 'Migration zincirinde sürüm boşluğu var (ardışık from/to eşleşmiyor).',
  THEME_MIGRATION_DUPLICATE: 'Aynı from/to çifti için birden fazla migration tanımlanmış.',
  THEME_MIGRATION_CYCLE: 'Migration zincirinde döngü var.',
  THEME_MIGRATION_RESULT_INVALID:
    'Migration fonksiyonunun döndürdüğü ayar nesnesi hedef şemayla eşleşmiyor.',
} satisfies Record<ThemeContractErrorCode, string>

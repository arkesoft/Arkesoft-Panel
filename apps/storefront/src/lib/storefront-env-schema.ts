// @arkesoft/storefront — storefront env şeması + saf ayrıştırıcı (ROADMAP
// v0.0.9.1 patch, T-011/S2, orkestratör düzeltmesi: "dördüncü yol")
//
// ⚠ BU DOSYANIN TEK VARLIK SEBEBİ: `process.env`'e DOKUNMADAN (SIFIR yan
// etkiyle) içe aktarılabilen bir Zod şeması + saf ayrıştırma fonksiyonu
// sağlamak. `storefront-env.ts`'in KENDİSİ modül-yükleme-anında
// `parseStorefrontEnv(process.env)` çağırıyor (K17, bilinçli yan etki) —
// ES modül anlambilimi bir modülden TEK bir adı import etmeyi bile o
// modülün TÜM üst seviye kodunu değerlendirmeye zorlar. Yani
// `storefront-env.ts`'ten `storefrontEnvSchema`'yı alsan bile, o modülün
// `storefrontEnv` satırı da ÇALIŞIR — `root-env-integration.ts`'in `dev`
// dışı dallarda (`build`/`preview`/`sync`) `process.env`'e HİÇ DOKUNMAMASI
// gereken AC8 garantisini bu yan etki İHLAL EDERDİ (ölçüldü: İLK denemede
// — düz `await import(...)` — "Vite module runner has been closed" hatası
// alınmıştı, çünkü bu hook Astro'nun config-yükleme modül çalıştırıcısı
// KAPANDIKTAN SONRA çalışıyor. ÜÇÜNCÜ deneme — `new Function` ile Node'un
// gerçek ESM yükleyicisine kaçış — GERÇEKTEN ÇALIŞIYORDU, ama T-010'un
// theme-sdk için koyduğu saflık pinine aykırıydı ve kaçınılmaz bir `as`
// istisnası gerektiriyordu; bu yüzden reddedildi. Ayrıntı
// `root-env-integration.ts`'in güncel :33-50 satırlarında.)
// Bu dosya BAĞIMSIZ ve YAN ETKİSİZ olduğu için HER İKİ tüketici de
// (`storefront-env.ts`'in açılış-kritik eager yolu VE
// `root-env-integration.ts`'in `dev`-only hook yolu) TEK kaynaktan
// (şema/ayrıştırıcı tekrarlanmaz) besleniyor, hiçbiri diğerinin yan
// etkisini TETİKLEMİYOR.
import { z } from 'zod'

/** `apps/storefront`'un ihtiyaç duyduğu TEK iki ortam değişkeni. */
export const storefrontEnvSchema = z.object({
  APP_BASE_DOMAIN: z.string().min(1, 'boş olamaz'),
  STOREFRONT_API_BASE_URL: z.url('geçerli bir URL olmalı'),
})

export type StorefrontEnv = z.infer<typeof storefrontEnvSchema>

/**
 * `@arkesoft/config/env`'in `EnvValidationError`'ının AYNI davranışı
 * (`storefront-env.ts`'in bağımlılık kararı yorumuna bkz.) — değişken
 * DEĞERLERİ asla hata mesajına yazılmaz, yalnızca değişken adı ve ihlal
 * edilen kural. SAF fonksiyon: `source` parametresi DIŞINDA hiçbir global
 * duruma (özellikle `process.env`'e) dokunmaz.
 */
export function parseStorefrontEnv(source: Record<string, string | undefined>): StorefrontEnv {
  const result = storefrontEnvSchema.safeParse(source)

  if (result.success) {
    return result.data
  }

  const issues = result.error.issues.map((issue) => {
    const key = issue.path.map(String).join('.')
    return key.length > 0 ? `${key}: ${issue.message}` : issue.message
  })

  throw new Error(
    [
      'Storefront ortam değişkenleri geçersiz veya eksik:',
      ...issues.map((issue) => `  - ${issue}`),
      '',
      // T-009 düzeltme turu 1 / İŞ 3 (qa'nın bulgusu — S9 yerelde yaşadı):
      // yalnızca "`.env.example`'a bakın" demek operatöre HANGİ dosyayı
      // DÜZENLEMESİ gerektiğini söylemiyordu (S9'un ölçtüğü asıl kopukluk
      // buydu — `.env.example` referans, DÜZENLENECEK dosya `.env`).
      // Eyleme dönük: hangi dosyayı aç, hangi dosyayı örnek al.
      'Repo kökündeki `.env` dosyanıza yukarıdaki değişkenleri ekleyin/düzeltin',
      "(biçim örneği için repo kökündeki `.env.example`'a bakın).",
      // T-011/S2 — tek ekleme: operatöre hızlı doğrulama için komut adı.
      'Hızlı kontrol için: `pnpm env:check`',
    ].join('\n'),
  )
}

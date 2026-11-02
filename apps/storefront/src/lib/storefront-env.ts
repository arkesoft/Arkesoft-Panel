// @arkesoft/storefront — storefrontEnv: K17'nin TEK `process.env` okuma
// noktası (ROADMAP v0.0.8, T-009/S6, architect K17)
//
// Dış dünyadan gelen her veri Zod ile parse edilir (CLAUDE.md §4). Ortam
// değişkenleri de dış veridir — bu modül YÜKLENİRKEN (import zamanında) BİR
// KEZ parse edilir; geçersizse süreç AÇILIŞTA durur (`apps/api/src/config/
// api-env.ts`'in fail-fast DESENİ emsal alındı — aşağıdaki not bu desenin
// NEDEN birebir `@arkesoft/config/env`'in `parseEnv`/`EnvValidationError`'ını
// YENİDEN KULLANMADIĞINI açıklıyor).
//
// ⚠ BAĞIMLILIK KARARI (RİSKLER'de de işaretli): `@arkesoft/config`,
// `apps/storefront/package.json`'da (S3'ün dosyası — DOKUNULMADI, bu alt
// görevin DOKUNMA kısıtı) `devDependencies` altında, `dependencies` altında
// DEĞİL. Üretim imajı ileride `pnpm install --prod` ile devDependencies'i
// BUDARSA, bu AÇILIŞ-KRİTİK yoldan `@arkesoft/config/env`'i import etmek
// süreci sessizce kırardı (modül bulunamaz). Bu yüzden `parseEnv`/
// `EnvValidationError` BURADA TEKRAR KULLANILMIYOR — yalnızca AYNI
// davranışın (tek seferlik Zod parse, değer sızdırmayan hata mesajı, açılışta
// fail-fast) BAĞIMSIZ, küçük bir kopyası. `apps/storefront` bu paketin tek
// tüketicisi değilse ve ileride gerçek bir Dockerfile yazılırsa, devops bu
// kararı (`@arkesoft/config`'i `dependencies`'e taşımak vs. bu bağımsız
// kopyayı sürdürmek) gözden geçirmeli.
//
// `process.env` `src/**` altında YALNIZCA bu dosyada okunur (K17, mekanik
// pin) — `src/components/**` için ayrıca `no-restricted-globals` bunu
// zorluyor (eslint.config.mjs), bu dosya o kapsamın DIŞINDA (`src/lib/**`).

import { z } from 'zod'

/** `apps/storefront`'un ihtiyaç duyduğu TEK iki ortam değişkeni. */
export const storefrontEnvSchema = z.object({
  APP_BASE_DOMAIN: z.string().min(1, 'boş olamaz'),
  STOREFRONT_API_BASE_URL: z.url('geçerli bir URL olmalı'),
})

export type StorefrontEnv = z.infer<typeof storefrontEnvSchema>

/**
 * `@arkesoft/config/env`'in `EnvValidationError`'ının AYNI davranışı
 * (yukarıdaki dosya başı gerekçesi) — değişken DEĞERLERİ asla hata
 * mesajına yazılmaz, yalnızca değişken adı ve ihlal edilen kural.
 */
function parseStorefrontEnv(source: Record<string, string | undefined>): StorefrontEnv {
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
    ].join('\n'),
  )
}

/** Modül YÜKLENİRKEN bir kez parse edilir (K17) — tüketiciler bu sabiti import eder. */
export const storefrontEnv: StorefrontEnv = parseStorefrontEnv(process.env)

// @arkesoft/storefront — kök `.env`'i YALNIZCA `astro dev` sürecine
// geçiren Astro integration'ı (ROADMAP v0.0.9.1 patch, T-011/S2,
// architect K-env1, po "mekanizmanın tek sahibi" kararı)
//
// ⚠ BAĞLAYICI SÖZLEŞME — `createRootEnvIntegration` adı, export biçimi ve
// `command` kapısı davranışı başka bir ajanın (S4) sözleşme testinin
// (`env-contract.test.ts`, P4) assert ettiği YÜZEYDİR. Burada DEĞİŞTİRME.
//
// KÖK NEDEN (T-011 Halka 1, ölçülmüş): `turbo.json`'daki `dev` görevi için
// `env: ["APP_BASE_DOMAIN", "STOREFRONT_API_BASE_URL"]` bildirimi (S1'in
// işi) turbo'nun kabuktan `astro dev`'e GEÇİRGENLİĞİNİ sağlıyor — ama bu,
// değişkenlerin kabukta ZATEN tanımlı olması GEREKTİĞİ anlamına gelir.
// `apps/api`'nin emsali (`node --env-file-if-exists=../../.env dist/main.js`)
// buraya TAŞINAMADI: `apps/storefront/node_modules/.bin/astro` bir POSIX
// kabuk şimi (`#!/bin/sh`), JS değil; gerçek hedef dosya pnpm'in hash'li
// `.pnpm/astro@.../` yoluna gidiyor ve her bağımlılık yükseltmesinde
// değişiyor — `--env-file` bayrağını ekleyecek sabit bir giriş noktası YOK.
// Bu yüzden YÜKLEME burada, Astro'nun KENDİ yapılandırma hattında (jiti ile
// çalıştırılan bu dosyada) yapılıyor.
//
// ⚠⚠ `command === 'dev'` KAPISI AC8'İN TEK YAPISAL SAVUNMASI (yorumu
// SİLME). Vite'ın `loadEnv`'i önek uyumlu (`PUBLIC_*`) anahtarları yalnızca
// `.env` dosyalarından değil `process.env`'den de toplar (ölçüldü — Vite
// kaynağı). Yani "kök `.env`'i sürece yükle" demek, bir `PUBLIC_*`
// anahtarını İSTEMCİ BUNDLE'ININ görüş alanına sokmak demektir. Kök `.env`
// SIR taşıyor (`BETTER_AUTH_SECRET`, rol parolaları — bkz. repo kökü
// `.env`). `build`/`preview` dallarında `process.env`'e KOŞULSUZ dokunmak,
// bu sırların bir gün yanlışlıkla `PUBLIC_*` önekiyle bundle'a sızmasının
// önünü açardı. Bu yüzden yükleme YALNIZCA `dev` dalında yapılır; `build`
// ve `preview` dalları `process.env`'e HİÇ DOKUNMAZ — üretim ortamının
// gerçek env'i (gerçek secret yöneticisi/kabuk) tek kaynak kalır.
//
// ⚠ DÖRDÜNCÜ DENEME (orkestratör düzeltmesi, ÖLÇÜLDÜ — ÇALIŞIYOR,
// uygulandı): bu hook `storefront-env.ts`'i DİNAMİK import ETMİYOR.
// İlk üç deneme (düz `await import(...)`, `@vite-ignore` yorumlu
// `import(...)`, `new Function('specifier','return import(specifier)')`
// ile Node'un gerçek ESM yükleyicisine kaçış) sırasıyla: (1) "Vite module
// runner has been closed" (hook, Astro'nun config-yükleme modül
// çalıştırıcısı KAPANDIKTAN SONRA çalışıyor), (2) Vite'ın bu belirli yol
// için `@vite-ignore`'u yok sayması, (3) GERÇEKTEN ÇALIŞIYORDU ama
// `eval`/`new Function` (T-010'da `security`'nin theme-sdk için koyduğu
// saflık pinine aykırı) + kaçınılmaz bir `as` istisnası gerektiriyordu.
// Dördüncü yol bunların HİÇBİRİNE gerek bırakmıyor: `parseStorefrontEnv`
// (YAN ETKİSİZ, `storefront-env-schema.ts`'ten) STATİK olarak içe
// aktarılır — bu içe aktarma `process.env`'e dokunmaz, dolayısıyla
// `build`/`preview`/`sync` dallarında (bu dosya o dallarda da yüklenir)
// AC8'i İHLAL ETMEZ. Doğrulamanın KENDİSİ (çağrı, import DEĞİL) yalnızca
// `command === 'dev'` dalında, `loadEnvFile`'dan SONRA, düz bir fonksiyon
// çağrısı olarak yapılır — modül çalıştırıcısı/`import()` hiç devreye
// girmediği için "kapalı grafik" sorunu YAPISAL OLARAK oluşmuyor.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { AstroIntegration } from 'astro'

import { parseStorefrontEnv } from './storefront-env-schema.js'

/**
 * Repo kökündeki `.env` dosyasının mutlak yolu. `import.meta.dirname` bu
 * dosyanın KENDİ dizinidir (`apps/storefront/src/lib`) — dört seviye yukarı
 * repo köküne çıkar (`lib → src → storefront → apps → kök`). `apps/admin/
 * vite.config.ts`'in K5 kararıyla AYNI aileden ama TERS yönde bir karar:
 * K5 kök `.env`'i Vite'ın görüş alanının DIŞINDA tutuyordu (hiç okuma);
 * burada `dev`'e ÖZEL, bilinçli ve kapılı bir okuma var.
 */
function resolveRootEnvPath(): string {
  return join(import.meta.dirname, '..', '..', '..', '..', '.env')
}

/**
 * Kök `.env`'i `astro dev` sürecine yükler ve storefront env şemasını
 * (`storefront-env-schema.ts`'in saf `parseStorefrontEnv`'i) sunucu
 * dinlemeye BAŞLAMADAN önce doğrular.
 *
 * - `command === 'dev'`     → kök `.env` varsa `process.loadEnvFile` ile
 *                             yükle, ardından `parseStorefrontEnv(process.
 *                             env)`'i ÇAĞIRARAK doğrula (import DEĞİL, düz
 *                             fonksiyon çağrısı). Geçersizse bu hook
 *                             FIRLATIR → Astro config kurulumu başarısız
 *                             olur → `astro dev` sıfır-dışı çıkış kodu ile
 *                             düşer, hiçbir döngüye girmeden, 4321 portunda
 *                             DİNLEMEYE BAŞLAMADAN (A2).
 * - `command === 'build'`   → `process.env`'e HİÇ DOKUNMAZ (AC8'in yapısal
 *                             garantisi — yukarıdaki dosya başı gerekçesi).
 * - `command === 'preview'` → dokunmaz; üretim env'ini gerçek ortamdan alır.
 * - `command === 'sync'`    → dokunmaz (kapı yalnızca `dev`'e özel — fail-closed).
 */
export function createRootEnvIntegration(): AstroIntegration {
  return {
    name: 'arkesoft-root-env',
    hooks: {
      'astro:config:setup': ({ command, logger }): void => {
        if (command !== 'dev') {
          return
        }

        const rootEnvPath = resolveRootEnvPath()
        if (existsSync(rootEnvPath)) {
          process.loadEnvFile(rootEnvPath)
        }

        try {
          parseStorefrontEnv(process.env)
        } catch (error) {
          // Asıl Zod teşhisi (storefront-env-schema.ts'in fail-closed
          // mesajı, `pnpm env:check` adını anıyor) stderr'de AÇIKÇA
          // basılır, sonra ORİJİNAL hata yeniden fırlatılır — hook'un
          // başarısız olma ve süreci sıfır-dışı kapatma davranışı
          // DEĞİŞMEZ (A2).
          const message = error instanceof Error ? error.message : String(error)
          logger.error(message)
          throw error
        }
      },
    },
  }
}

// @arkesoft/admin — Vite yapılandırması (ROADMAP v0.0.7, T-008/S5, architect
// K1/K5/K7, A-A1/A-A2)
//
// A-A1 (ÖLÇÜLDÜ, frontend): Vite'ın `*.localhost` için "varsayılan izin
// ver"i FAIL-OPEN bir davranıştır — bu dosya ona GÜVENMEZ (fail-closed, K1).
// `server.allowedHosts` İÇİNDE `panel.arkesoft.localhost` AÇIKÇA yazılır;
// `server.port` + `strictPort: true` ile `PANEL_DEV_PORT`'a (K1'in "sessiz
// 403 tuzağı" telafisi) PIN'lenir — port ÇAKIŞIRSA sessizce başka porta
// kaymak YERİNE GÜRÜLTÜLÜ kırılır.
//
// DÜZELTME TURU 1 (`security` low 8a): `server.host: true` SİLİNDİ — tüm
// ağ arayüzlerine bağlanmak (`0.0.0.0`) GEREKSİZDİ: `panel.arkesoft.
// localhost` ZATEN `127.0.0.1`'e çözülüyor (`/etc/hosts` emsali, diğer
// `*.arkesoft.localhost` host'larıyla AYNI desen) ve dev sunucusunun
// `allowedHosts` fail-closed doğrulaması yabancı `Host` başlıklarını
// reddediyor ama IP-literal `Host` değerlerini (`127.0.0.1:${PANEL_DEV_PORT}`)
// zaten geçiriyordu — `host: true`'nun verdiği "ağdaki başka cihazlardan
// erişim" yeteneğine hiçbir akış İHTİYAÇ DUYMUYOR. Vite'ın varsayılanı
// (`host` belirtilmezse `127.0.0.1`) yeterli ve daha dar saldırı yüzeyli.
//
// K1 (tek orijin topolojisi, ADR-0011, CORS AÇILMADI): `/trpc` ve `/auth`
// Vite dev sunucusunun proxy'si ÜZERİNDEN `apps/api`'ye (`127.0.0.1:3000`)
// gider. `changeOrigin: false` (AÇIKÇA) — proxy `Host` BAŞLIĞINI
// DEĞİŞTİRMEZ: `apps/api`'nin `resolveHost` (tenancy/resolve-host.ts) tenant
// seçimini YALNIZCA `Host` başlığından yapıyor; `changeOrigin: true` olsaydı
// `Host` `127.0.0.1:3000`'e dönüşür, panel host'unun `reserved_subdomain`
// muafiyeti (K2, `tenant-exempt-paths.ts`) TETİKLENMEZ ve istek 404
// `TENANT_NOT_FOUND` alırdı (ÖLÇÜLDÜ, kaynak kodu okunarak).
//
// K5: `ARKESOFT_PANEL_DEV_API_TARGET` — dev-only OPSİYONEL proxy hedefi,
// `VITE_` ÖNEKİ YOK (bundle'a ASLA inline edilmez, bu değişken yalnızca Node
// tarafında — bu dosyada — okunur). Zod ile fail-fast doğrulanır; `envDir`
// KÖK `.env`'E İŞARET ETMEZ (K5 bilinçli güvenlik kararı) — bu yüzden değer
// gerçek kabukta `process.env`'den (örn. kabuk `export` veya CI secret) gelir,
// `.env` dosyasından OKUNMAZ.
//
// K7 (AC16): `build.manifest: true` — `scripts/check-bundle-budget.ts`
// `dist/.vite/manifest.json`'u okur.
//
// Eklenti SIRASI bağlayıcı: `tanstackRouter` React eklentisinden ÖNCE
// (resmî gereksinim — router plugin JSX dönüşümünden ÖNCE route dosyalarını
// işlemek zorunda).

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { z } from 'zod'

import { PANEL_DEV_PORT, TRPC_URL } from './src/app/panel-config.js'

/**
 * Dev-only proxy hedefi — `VITE_` ÖNEKİ YOK (K5), bu yüzden istemci
 * bundle'ına ASLA sızmaz (yalnızca bu dosyanın Node tarafında okunur).
 * Fail-fast: geçersiz bir değer `vite`/`vite build`'i hemen durdurur.
 * `.url()` zincir metodu eski (`@typescript-eslint/no-deprecated`) —
 * `.pipe(z.url())` resmî yerine geçen biçim.
 */
const devApiTargetSchema = z.string().pipe(z.url()).default('http://127.0.0.1:3000')
const API_PROXY_TARGET = devApiTargetSchema.parse(process.env['ARKESOFT_PANEL_DEV_API_TARGET'])

export default defineConfig({
  // Kök `.env`'i Vite'ın görüş alanına hiç SOKMAZ (K5 bilinçli güvenlik
  // kararı). Vite'ın varsayılanı ZATEN `root` (bu paketin kendi dizini) ama
  // bu, `vite`'ın HANGİ `cwd`'den çağrıldığına bağlıdır (örn. biri yanlışlıkla
  // repo KÖKÜNDEN `vite` çalıştırırsa varsayılan `envDir` repo köküne
  // KAYARDI) — fail-closed olmak için `import.meta.dirname` (bu paketin
  // KENDİ, mutlak dizini) AÇIKÇA yazılır; bu dizinde `.env` dosyası YOK
  // (yalnızca repo kökünde var), dolayısıyla hiçbir `VITE_*` değişkeni
  // bundle'a kök `.env`'den sızamaz.
  envDir: import.meta.dirname,
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: PANEL_DEV_PORT,
    strictPort: true,
    allowedHosts: ['panel.arkesoft.localhost'],
    // Vite dev sunucusunun KENDİ varsayılanı tüm yanıtlara (dev-only, prod'da
    // YOK) `Access-Control-Allow-Origin` ekliyor (ÖLÇÜLDÜ — `curl` ile) —
    // K1'in "CORS AÇILMADI" topolojisiyle dev ortamında TUTARSIZ görünüp
    // kafa karıştırabilirdi (`apps/api` BİZZAT bu başlığı HİÇ üretmiyor,
    // ÖLÇÜLDÜ: `:3000`'e doğrudan istekte başlık YOK). Dev'i prod'a daha
    // SADIK kılmak için KAPATILDI.
    cors: false,
    proxy: {
      [TRPC_URL]: { target: API_PROXY_TARGET, changeOrigin: false },
      '/auth': { target: API_PROXY_TARGET, changeOrigin: false },
    },
  },
  build: {
    manifest: true,
  },
})

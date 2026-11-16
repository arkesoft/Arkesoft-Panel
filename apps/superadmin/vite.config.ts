// @arkesoft/superadmin — Vite yapılandırması (ROADMAP v0.0.20, T-021/S8,
// A-A21-3, ADR-0023 §4) — `apps/admin/vite.config.ts`'in BİREBİR deseni,
// port + host + env değişken adları süper admine uyarlandı.
//
// K1 (tek orijin topolojisi, ADR-0011/ADR-0023 §4, CORS AÇILMADI): `/trpc`
// VE `/auth` Vite dev sunucusunun proxy'si ÜZERİNDEN `apps/api`'ye
// (`127.0.0.1:3000`) gider. `changeOrigin: false` (AÇIKÇA) — proxy `Host`
// BAŞLIĞINI DEĞİŞTİRMEZ: `apps/api`'nin `resolveHost`'u tenant seçimini
// YALNIZCA `Host` başlığından yapar; süper admin host'u (`superadmin.
// arkesoft.localhost`) rezerve bir alt alan adıdır (`reserved-subdomains.ts`)
// — `changeOrigin: true` olsaydı `Host` `127.0.0.1:3000`'e dönüşür, bu
// muafiyet TETİKLENMEZ.
//
// K5: `ARKESOFT_SUPERADMIN_DEV_API_TARGET` — dev-only OPSİYONEL proxy
// hedefi, `VITE_` ÖNEKİ YOK (bundle'a ASLA inline edilmez, bu değişken
// yalnızca Node tarafında — bu dosyada — okunur). Zod ile fail-fast
// doğrulanır; `envDir` KÖK `.env`'E İŞARET ETMEZ (bilinçli güvenlik kararı).
//
// `build.manifest: true` — `scripts/check-bundle-budget.ts`
// `dist/.vite/manifest.json`'u okur.
//
// Eklenti SIRASI bağlayıcı: `tanstackRouter` React eklentisinden ÖNCE
// (resmî gereksinim).

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { z } from 'zod'

import { resolveSuperadminDevPort, TRPC_URL } from './src/app/superadmin-config.js'

/**
 * Dev-only proxy hedefi — `VITE_` ÖNEKİ YOK, bu yüzden istemci bundle'ına
 * ASLA sızmaz. Fail-fast: geçersiz bir değer `vite`/`vite build`'i hemen
 * durdurur.
 */
const devApiTargetSchema = z.string().pipe(z.url()).default('http://127.0.0.1:3000')
const API_PROXY_TARGET = devApiTargetSchema.parse(process.env['ARKESOFT_SUPERADMIN_DEV_API_TARGET'])

// devops (gate paralelliği): `ARKESOFT_SUPERADMIN_E2E_PORT` VERİLMEZSE
// davranış birebir VARSAYILAN gibidir (`resolveSuperadminDevPort(undefined)
// === SUPERADMIN_DEV_PORT`).
const PORT = resolveSuperadminDevPort(process.env['ARKESOFT_SUPERADMIN_E2E_PORT'])

export default defineConfig({
  // Kök `.env`'i Vite'ın görüş alanına hiç SOKMAZ (K5 bilinçli güvenlik
  // kararı, `apps/admin/vite.config.ts`'in aynı notu).
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
    port: PORT,
    strictPort: true,
    allowedHosts: ['superadmin.arkesoft.localhost'],
    // `apps/admin/vite.config.ts`'in aynı kararı — apps/api bu başlığı HİÇ
    // üretmiyor, dev'i prod'a daha SADIK kılmak için KAPATILDI.
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

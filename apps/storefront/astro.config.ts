// @arkesoft/storefront — Astro yapılandırması (ROADMAP v0.0.8, T-009/S4,
// architect K13/K18, ADR-0011 "Etkilenen sonraki kararlar — v0.0.8")
//
// ⚠ `.ts` UZANTILI — `.mjs` DEĞİL (CLAUDE.md §2: tipsiz JS kaynak dosyası
// yok; `apps/admin/vite.config.ts` emsali).
//
// `output: 'server'` — `'hybrid'` YASAK (K13): bu Astro sürümünde (7.4.2)
// `output` tipi ZATEN `'static' | 'server'`dir (`astro/dist/types/public/
// config.d.ts:321`, `'hybrid'` HİÇ YOK) — `'hybrid'` yazmak tip hatası
// verirdi, ölçülerek doğrulandı. `'server'` modunda rota varsayılanı
// SUNUCU TARAFI render'dır; bir rotayı statikleştirmek için AÇIKÇA
// `export const prerender = true` YAZILMASI gerekir (A-M3, ÖLÇÜLDÜ —
// handoff raporundaki ölçüme bkz.). Bu dosyanın tek sayfası (`index.astro`)
// `prerender` İHRAÇ ETMEZ → derleme anında bilinmeyen bir host için statik
// HTML üretilmez (K13'ün çapraz kiracı sızıntısı riski buradan DOĞMAZ).
//
// `adapter: node({ mode: 'standalone' })` — kendi HTTP sunucusunu başlatır
// (`node_modules/@astrojs/node/dist/standalone.js`, ÖLÇÜLDÜ): port
// `process.env.PORT` → yoksa bu dosyadaki `server.port` → yoksa `8080`.
// Dördüncü bir bağımlılık (örn. Express/Fastify saran bir ara sunucu)
// GEREKMEZ ve AC1'in beklediği `dist/server/entry.mjs`'i DOĞRUDAN üretir.
//
// `@tailwindcss/vite` — `@astrojs/tailwind` BİLİNÇLİ EKLENMEDİ (architect
// K12, devops ölçümü `eslint.config.mjs` üst yorumunda tekrarlanıyor): o
// Tailwind v3 köprüsü, katalogdaki v4'ün resmî entegrasyon yolu değil.
//
// `server.port: 4321` — Astro'nun KENDİ varsayılanı ve ROADMAP v0.0.8 kabul
// kriterinin sabitlediği değer (`demo-magaza.arkesoft.localhost:4321`);
// S6/S9 bu portu AYNI DEĞERLE paylaşır. `server.host: true` — tüm ağ
// arayüzlerine bağlanır (plan gereği; tenant host'ları `*.arkesoft.
// localhost` zaten 127.0.0.1'e çözülüyor ama standalone üretim sunucusu
// konteyner/VM içinde `0.0.0.0` dinlemek ZORUNDADIR — admin panelinin
// aksine storefront bir KONTEYNERDE koşacak tek dağıtım, `host: true`
// bilinçli bir fark).
import { defineConfig } from 'astro/config'

import node from '@astrojs/node'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

import { createRootEnvIntegration } from './src/lib/root-env-integration.js'

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // `createRootEnvIntegration()` ÖNCE: `astro:config:setup` hook'ları
  // KAYIT SIRASINA göre çalışır — kök `.env`'in (yalnızca `dev` dalında)
  // yüklenmesi, aynı aşamada `process.env`'i okuyabilecek SONRAKİ hiçbir
  // entegrasyon/eklentiden ÖNCE tamamlanmış olmalı (T-011/S2).
  integrations: [createRootEnvIntegration(), react()],
  vite: {
    // Kök `.env`'i Vite'ın KENDİ (dosya tarayan) `loadEnv`'inin görüş
    // alanına hiç SOKMAZ — `apps/admin/vite.config.ts:70-79`'un (K5) BİREBİR
    // İKİZİ, aynı gerekçeyle: `envDir` belirtilmezse Vite'ın varsayılanı
    // `root`tur ve `root` HANGİ `cwd`'den çağrıldığına bağlı kayabilir; bu
    // paketin KENDİ mutlak dizini (`import.meta.dirname`) AÇIKÇA yazılır.
    // Bu dizinde `.env` YOK (yalnızca repo kökünde var) → hiçbir `PUBLIC_*`
    // anahtarı Vite'ın DOSYA tarama yoluyla bundle'a kök `.env`'den sızamaz
    // (AC8). Kök `.env`'in `dev`'e GEÇİŞİ yukarıdaki integration'ın
    // `process.loadEnvFile` çağrısıyla olur — o da ayrı bir kapıdan
    // (`command === 'dev'`) geçmek zorunda; bu `envDir` o kapıyı BYPASS
    // edecek ikinci bir yol AÇMAZ.
    envDir: import.meta.dirname,
    plugins: [tailwindcss()],
  },
  server: {
    port: 4321,
    host: true,
  },
})

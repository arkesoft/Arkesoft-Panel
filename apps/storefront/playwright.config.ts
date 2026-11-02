// @arkesoft/storefront — Playwright yapılandırması (ROADMAP v0.0.8, T-009/S9,
// qa — ÜRETİM ROLÜNDE, e2e hattının KENDİSİ)
//
// ROADMAP v0.0.8 kabul kriterinin BİREBİR metni: "Playwright testi
// `demo-magaza.arkesoft.localhost:4321` adresinde tenant adını içeren
// sayfayı, `yok.arkesoft.localhost` adresinde 404'ü doğrular." — bu dosya o
// kriterin koşum altyapısıdır, testlerin kendisi `e2e/storefront-host.spec.ts`.
//
// v0.0.8 ASGARİ (apps/admin'in `playwright.config.ts` emsaliyle BİREBİR,
// v0.0.19'da RESMÎLEŞİR, bu sürümde YASAK olanlar): `projects` **1**
// (chromium, masaüstü, TEK viewport) · `workers: 1` · `toHaveScreenshot`/
// `toMatchSnapshot` BU DOSYADA/spec'te YOK (görsel regresyon v0.0.19) · kök
// `test:e2e` script'i EKLENMEDİ · `turbo.json`'a görev EKLENMEDİ · CI job'u
// EKLENMEDİ (R6 — `.github/ci-forbidden-tokens.txt` satır 125/127, bağlayıcı).
//
// A-M5 (ÖLÇÜLDÜ — qa, bu alt görev): Astro'nun `astro dev --help` çıktısında
// `--strictPort` YOK (`apps/admin`'in `vite --port <PORT> --strictPort`
// emsali Astro'da KARŞILIĞI YOK bir bayrak ister). Astro port çakışmasında
// SESSİZCE bir üst porta kayıyor (ölçüldü: ikinci bir `astro dev` denemesi
// "already running" diyerek İLK süreci kullanmaya devam ediyor, kaymanın
// kendisi ayrı bir davranış — ikisi de SESSİZ). TELAFİ (bağlayıcı):
// `webServer.url` AŞAĞIDA tam olarak `BASE_URL`'e (sabit `PORT`'a) pinli —
// Astro gerçekten başka bir porta kayarsa Playwright'ın hazırlık probu bu
// sabit URL'de ASLA 200 almaz ve `timeout` sonunda GÜRÜLTÜLÜ bir hata ile
// kırılır (sessiz yanlış-pozitif DEĞİL, bkz. admin'in "K1 sessiz 403 tuzağı"
// dersiyle AYNI sınıf önlem).
//
// A-M7 (ÖLÇÜLDÜ — qa, bu alt görev): bu makinede (macOS) `ping`/`getent`
// ile doğrulandı — `demo-magaza.arkesoft.localhost`, `yok.arkesoft.localhost`,
// `panel.arkesoft.localhost`, `a.b.arkesoft.localhost`, `arkesoft.localhost`
// HİÇBİR `/etc/hosts` kaydı OLMADAN 127.0.0.1'e çözülüyor (RFC 6761 — `.
// localhost` TLD'si işletim sistemi çözücüsü tarafından özel durum olarak
// ele alınır). `apps/admin`'in `panel.arkesoft.localhost` emsaliyle TUTARLI.
// `/etc/hosts` değişikliği GEREKMEDİ — devops/docs'a aktarılacak bir risk YOK.
//
// PORT: `apps/storefront/src/lib/**` içinde paylaşılabilir bir port
// sabiti/çözücü YOK (ölçüldü — `storefront-env.ts`/`api-client.ts`/
// `request-origin.ts`/`cache-policy.ts`/`storefront-tenant-context.ts`/
// `storefront-server-fetch.ts` taranmış, hiçbiri port döndürmüyor). Bu yüzden
// `astro.config.ts`'in (S4'ün dosyası, DOKUNULMADI) `server.port: 4321`
// değeriyle AYNI sabit burada TEKRARLANIR — ROADMAP kabul kriterinin kendisi
// zaten `:4321`'i metinde sabitliyor, `ARKESOFT_STOREFRONT_E2E_PORT` ile
// override edilebilir (admin'in `ARKESOFT_PANEL_E2E_PORT` emsali,
// ÖNERİLDİ/ZORUNLU DEĞİL) — override EDİLMEZSE davranış birebir ROADMAP
// metnindeki gibidir.
import { defineConfig, devices } from '@playwright/test'

import { STOREFRONT_E2E_PORT, storefrontUrl } from './e2e/e2e-port.js'

/** Çözümlenen demo kiracının host'u (`packages/db/src/seed-data.ts`'in `slug`'ı, DOKUNULMADI). */
const BASE_URL = storefrontUrl('demo-magaza.arkesoft.localhost')

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // AC6/AC7/AC8 fixture'ları (docker exec ile Postgres'e yazan) ve rezerve
  // alt alan adı/rate-limit bütçesi paylaşımı PARALEL koşumla YARIŞMASIN —
  // apps/admin'in AC18 gerekçesiyle AYNI sınıf önlem.
  fullyParallel: false,
  workers: 1,
  // v0.0.19'a kadar TEK proje, TEK viewport (bağlayıcı asgari, dosya başı notu).
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: {
    baseURL: BASE_URL,
  },
  webServer: {
    command: `astro dev --port ${String(STOREFRONT_E2E_PORT)}`,
    url: BASE_URL,
    // A-M5 telafisi: `reuseExistingServer` CI'da KAPALI (admin emsali) —
    // yerelde zaten çalışan bir `astro dev` varsa onu YENİDEN KULLANIR, bu
    // da port kaymasını MASKELEYEBİLİR; bu yüzden CI'da (gelecekte eklenirse)
    // her koşum TEMİZ bir sunucuyla başlar.
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
})

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
// A-M5 (ÖLÇÜLDÜ — qa, T-009/S9; GÜNCELLENDİ — qa, T-011/S3, halka 3 katman 2):
// Astro'nun `astro dev --help` çıktısında `--strictPort` YOK (`apps/admin`'in
// `vite --port <PORT> --strictPort` emsali Astro'da KARŞILIĞI YOK bir bayrak
// ister). Astro port çakışmasında SESSİZCE bir üst porta kayıyor (ölçüldü:
// ikinci bir `astro dev` denemesi "already running" diyerek İLK süreci
// kullanmaya devam ediyor, kaymanın kendisi ayrı bir davranış — ikisi de
// SESSİZ). TELAFİ (bağlayıcı): `webServer.url` AŞAĞIDA tam olarak `BASE_URL`'e
// (sabit `PORT`'a) pinli — Astro gerçekten başka bir porta kayarsa
// Playwright'ın hazırlık probu bu sabit URL'de ASLA 200 almaz ve `timeout`
// sonunda GÜRÜLTÜLÜ bir hata ile kırılır (sessiz yanlış-pozitif DEĞİL, bkz.
// admin'in "K1 sessiz 403 tuzağı" dersiyle AYNI sınıf önlem).
// T-011/S3 GÜNCELLEMESİ: `reuseExistingServer` artık KOŞULSUZ `false`
// (aşağıya bkz, halka 3 katman 2) — bu, A-M5 telafisini GÜÇLENDİRİYOR:
// Playwright hiçbir koşumda var olan bir sunucuyu yeniden kullanmadığından,
// port çakışması/kayması HER koşumda aynı gürültülü `timeout` hatasıyla
// görünür kalır; artık süreç kalıcılaşıp bu hatayı gelecekteki koşumlardan
// SAKLAYAMAZ (ölçülmüş bilinçli yan etki, önceki kalıcı artık süreç riskine
// göre tercih edilen taraf: sessiz yanlış-pozitif yerine okunur hata).
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
//
// T-011/S3 — HALKA 3 KÖK NEDENİ (ÖLÇÜLDÜ, `docs/development.md:842-855`):
// Astro 7.4.2'nin bağımlılığı `am-i-vibing`, `CLAUDECODE`/
// `CLAUDE_CODE_ENTRYPOINT`/`AI_AGENT` ortamda varken `astro dev`'i OTOMATİK
// arka plana alıyor; arka plana alınan süreç Playwright'ın süreç ağacından
// KOPUYOR → Playwright öldüremiyor → artık süreç. İlke: dev sunucusu kendisini
// kimin başlattığına göre süreç semantiğini değiştirmemeli — bu dosya iki
// katmanla bunu düzeltiyor: (1) aşağıdaki `webServer.command` üç dedektör
// değişkenini `env -u` ile temizliyor, (2) `reuseExistingServer` koşulsuz
// `false` — Playwright'ın BAŞLATMADIĞI bir sunucuyu kapatma yetkisi yok,
// `true` kaldığı sürece artık süreç her koşumda yeniden kullanılıp
// kalıcılaşıyordu. Kalıcı çözüm (paylaşılan sarmalayıcı script) `scripts/`
// klasörünün workspace'e alınmasını bekliyor (T3-1, v0.0.14 borcu) — bu
// Task'ta `env -u` öneki iki yerde (bu dosya + `package.json`'ın `dev`
// script'i) BİREBİR AYNI literal olarak elle tekrarlanıyor; hiçbir assert bu
// ikisini pinlemiyor, sapma `pnpm test`'te GÖRÜNMEZ.
import { existsSync } from 'node:fs'

import { defineConfig, devices } from '@playwright/test'

import { STOREFRONT_E2E_PORT, storefrontUrl } from './e2e/e2e-port.js'

// T-011/S3 — HALKA 3 KATMAN 1 (yükleme): `e2e/global-setup.ts` `storefrontEnv`'i
// (dolayısıyla `APP_BASE_DOMAIN`/`STOREFRONT_API_BASE_URL`'i) Playwright KOŞUCU
// sürecinde import ediyor — bu süreç kendi ortamını `webServer`'ın yüklemesinden
// BAĞIMSIZ olarak ister (ölçüldü: `webServer` çocuğuna miras geçen değerler bu
// sürecin kendisine yetmiyor). `apps/api/vitest.config.ts:19-26` ile BİREBİR
// AYNI desen: `existsSync` ile dosya varsa yükle, yoksa sessizce atla — CI
// runner'ında kök `.env` yok (git izlemiyor), koşulsuz çağrı `ENOENT` ile
// Playwright'ı başlamadan çökertirdi.
const rootEnvUrl = new URL('../../.env', import.meta.url)
if (existsSync(rootEnvUrl)) {
  process.loadEnvFile(rootEnvUrl)
}

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
    // T-011/S3 — HALKA 3 KATMAN 1 (dedektör temizliği): `package.json`'ın
    // `dev` script'indeki önekle BİREBİR AYNI olmak zorunda (dosya başı
    // notu). Üç token: `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `AI_AGENT`.
    command: `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AI_AGENT astro dev --port ${String(STOREFRONT_E2E_PORT)}`,
    url: BASE_URL,
    // T-011/S3 — HALKA 3 KATMAN 2: eskiden CI dışında koşullu kalan ifade
    // KALDIRILDI, koşulsuz `false`. Gerekçe: Playwright BAŞLATMADIĞI sunucuyu KAPATMAZ; `true`
    // olduğu sürece (yerelde) artık süreç her koşumda yeniden kullanılıyor ve
    // kalıcılaşıyordu (ölçülmüş zincir, T-009'da iki kez, T-010'da bir kez).
    // `false` ile sahiplik tek: Playwright başlatır, Playwright öldürür.
    // BİLİNÇLİ YAN ETKİ: port meşgulse Astro sessizce üst porta kayar (A-M5,
    // yukarı bkz.) ve `url` sabit porta pinli olduğu için koşum GÜRÜLTÜLÜ
    // düşer (`timeout` hatası) — sessiz yanlış-pozitif yerine okunur hata,
    // bilinçli olarak tercih edilen taraf.
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

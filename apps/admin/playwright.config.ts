// @arkesoft/admin — Playwright yapılandırması (ROADMAP v0.0.7, T-008/S5,
// architect "Test yapılandırması", PO "AC17 mekanik")
//
// v0.0.7 ASGARİ (AC17 bağlayıcı — v0.0.19'da RESMÎLEŞİR, bu sürümde YASAK
// olanlar aşağıda işaretli): `projects` **1** (chromium, masaüstü, TEK
// viewport) · `workers: 1` · `toHaveScreenshot`/`toMatchSnapshot` BU
// DOSYADA/spec'te YOK · kök `test:e2e`/`test:visual` script'i EKLENMEDİ ·
// `turbo.json`'a görev EKLENMEDİ · CI job'u EKLENMEDİ.
//
// A-A9 (ÖLÇÜLDÜ, frontend+qa): `vite preview`'un varsayılan portu **4173**
// — `AUTH_BASE_URL` `:5173` ile eşleşmez, her giriş SESSİZCE 403 alırdı
// (K1 "sessiz 403 tuzağı"nın AYNISI). `webServer.command` bu yüzden `vite`
// (DEV sunucusu, `--port`/`--strictPort` AÇIKÇA `PANEL_DEV_PORT`'a pinli) —
// `vite preview` DEĞİL. Port ÇAKIŞIRSA `--strictPort` GÜRÜLTÜLÜ kırılır
// (sessizce başka porta kaymaz).
//
// AC18 (bütçe, bağlayıcı — DÜZELTME TURU 2: `solid` tur 2 M-N1, yorum
// düzeltildi): `workers: 1` + HER SPEC dosyasının KENDİSİ `test.describe.
// serial` kullanıyor — `/auth/sign-in/email` IP bazlı `platform:auth:*`
// sayacını (20/pencere, BAŞARILI istekler DE sayılıyor) paylaşan İKİ spec
// dosyası var (`panel-flow.spec.ts` + `qa-blind-spot-and-negative-
// scenarios.qa.spec.ts`), paralel koşum bu sayacı YARIŞTIRMAZ ama İKİSİ
// AYNI IP'den aynı pencereyi TÜKETİR.
//
// TEK doğruluk kaynağı (architect Risk 5 — bağlayıcı) BURASI: koşum
// başına (iki spec dosyasının TOPLAMI, TEK dosya DEĞİL) `sign-in` ≤4,
// `sign-up` ≤ (sign-up tavanının 10/saat'e göre en az ~2 ardışık koşuma
// izin verecek düzeyde kalması). Üçüncü bir spec dosyası `/auth/sign-in/
// email` veya `/auth/sign-up/email`'e GERÇEK bir çağrı eklerse bu toplam
// BURADA güncellenmek ZORUNDA — her spec dosyası kendi PAYINI kendi
// başında yorumlar (bkz. `panel-flow.spec.ts` + ilgili `qa` dosyası),
// TOPLAMI TEKRAR ETMEZ.
//
// Bugünkü ÖLÇÜLMÜŞ toplam (qa tur 2, Redis sayaç delta'sı ile doğrulandı):
//   sign-in: panel-flow.spec.ts (3) + qa-blind-spot-…qa.spec.ts (1) = 4/4
//   sign-up: panel-flow.spec.ts (3) + qa-blind-spot-…qa.spec.ts (0) = 3
//
// MEKANİK bir çapraz-dosya toplam denetimi (DEĞERLENDİRİLDİ, KURULMADI):
// statik regex taraması "gerçek ağ çağrısı" ile "page.route() ile taklit
// edilen aynı metinsel örüntü"yü GÜVENİLİR AYIRT EDEMİYOR — ÖLÇÜLDÜ, bu
// dosyanın KENDİ (D) ve (G) testleri BİREBİR AYNI `getByRole('button',
// { name: 'Giriş yap' }).press('Enter')` örüntüsünü taşıyor, biri taklit
// (sıfır maliyet) biri gerçek (G); `panel-flow.spec.ts`'in alan-doğrulama
// testi de AYNI örüntüyü istemci tarafı Zod reddiyle (sıfır ağ çağrısı)
// taşıyor. Güvenilir bir çapraz-dosya mekanizması Redis sayaç delta'sını
// `globalSetup`/`globalTeardown`'da okumayı gerektirirdi — bu, e2e
// koşumuna YENİ bir altyapı bağımlılığı (Redis bağlantısı) ve yeni bir
// kırılganlık kaynağı (CI'da farklı `REDIS_URL`, paylaşılan ortamda
// eşzamanlı başka süreçler) eklerdi; bugünkü kazanç (bir yorumun
// doğruluğu) bu riske değmedi. Toplam bu yüzden BURADA, TEK yerde, elle
// tutuluyor — ikinci bir spec dosyası ekleyen HER ajan bu bloğu
// GÜNCELLEMEK ZORUNDA.
import { defineConfig, devices } from '@playwright/test'

import { PANEL_DEV_PORT } from './src/app/panel-config.js'

const BASE_URL = `http://panel.arkesoft.localhost:${String(PANEL_DEV_PORT)}`

export default defineConfig({
  testDir: './e2e',
  // AC18: oran sınırı bütçesi dar (≤4 `sign-in`/koşum) — testler SIRALI
  // koşmak ZORUNDA, aksi hâlde aynı IP'den paralel giriş denemeleri sayacı
  // beklenenden hızlı tüketir (`test.describe.serial` spec İÇİNDE de var,
  // bu BAĞIMSIZ bir ikinci güvence).
  fullyParallel: false,
  workers: 1,
  // v0.0.19'a kadar TEK proje, TEK viewport (AC17) — masaüstü varsayılanı
  // (mobil/responsive davranış bu sürümde görsel regresyonla DEĞİL, UX'in
  // planıyla doğrulandı).
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: {
    baseURL: BASE_URL,
  },
  webServer: {
    command: `vite --port ${String(PANEL_DEV_PORT)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
})

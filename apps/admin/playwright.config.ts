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
// (DEV sunucusu, `--port`/`--strictPort` AÇIKÇA `resolvePanelDevPort`'un
// döndürdüğü porta pinli — varsayılan `PANEL_DEV_PORT`, `ARKESOFT_PANEL_
// E2E_PORT` ile override edilebilir, devops "gate paralelliği" chore'una
// bkz.) — `vite preview` DEĞİL. Port ÇAKIŞIRSA `--strictPort` GÜRÜLTÜLÜ
// kırılır (sessizce başka porta kaymaz).
//
// AC18 (bütçe, bağlayıcı — DÜZELTME TURU 2: `solid` tur 2 M-N1, yorum
// düzeltildi; qa tur 2/DAR İŞ ①: ÜÇÜNCÜ spec dosyası eklendi, toplam
// AŞAĞIDA yeniden hesaplandı): `workers: 1` + HER SPEC dosyasının KENDİSİ
// `test.describe.serial` kullanıyor — `/auth/sign-in/email` IP bazlı
// `platform:auth:*` sayacını (gerçek sınır `LOGIN_IP_LIMIT` = 20 deneme /
// 15 dk, `rate-limit.policy.ts:127` — BAŞARILI istekler DE sayılıyor,
// SIFIRLANMAZ) paylaşan ÜÇ spec dosyası var (`panel-flow.spec.ts` +
// `qa-blind-spot-and-negative-scenarios.qa.spec.ts` + `session-security-
// dialog-focus.qa.spec.ts`), paralel koşum bu sayacı YARIŞTIRMAZ ama
// ÜÇÜ AYNI IP'den aynı pencereyi TÜKETİR.
//
// TEK doğruluk kaynağı (architect Risk 5 — bağlayıcı) BURASI: koşum
// başına (TÜM spec dosyalarının TOPLAMI, TEK dosya DEĞİL) gerçek sınıra
// (20/pencere) GÜVENLİ bir pay bırakılması — bu dosyanın kendi KARARI
// "güvenli pay" için SABİT bir tavan sayı DEĞİL, ÖLÇÜLEN gerçek toplamın
// 20'nin ÇOK altında kalması (bugün 7/20, %65 pay) VE hesap bazlı sınırın
// (`LOGIN_ACCOUNT_LIMIT`, aynı dosya) her testin KENDİ fixture kullanıcısı
// İÇİN tek haneli denemede kalmasıdır. Yeni bir spec dosyası `/auth/
// sign-in/email` veya `/auth/sign-up/email`'e GERÇEK bir çağrı eklerse bu
// toplam BURADA güncellenmek ZORUNDA — her spec dosyası kendi PAYINI kendi
// başında yorumlar (bkz. `panel-flow.spec.ts` + ilgili `qa` dosyaları),
// TOPLAMI TEKRAR ETMEZ.
//
// Bugünkü ÖLÇÜLMÜŞ toplam (qa tur 2/DAR, İŞ ① — `session-security-dialog-
// focus.qa.spec.ts` EKLENDİ; gerçek sınıra göre KARŞILAŞTIRMALI):
//   sign-in: panel-flow.spec.ts (3) + qa-blind-spot-…qa.spec.ts (1) +
//            session-security-dialog-focus.qa.spec.ts (3) = 7/20
//   sign-up: panel-flow.spec.ts (3) + qa-blind-spot-…qa.spec.ts (0) +
//            session-security-dialog-focus.qa.spec.ts (2) = 5
// (ÖNCEKİ tur: sign-in 4, sign-up 3 — iki dosyayla; bu turda ÜÇÜNCÜ dosya
// +3 sign-in + 2 sign-up ekledi, gerçek 20/pencere sınırına göre HÂLÂ
// büyük pay var; "≤4" biçimindeki ÖNCEKİ ifade iki dosyanın o ANKİ toplamı
// idi, gerçek sınırın KENDİSİ DEĞİLDİ — qa tur 2/DAR raporunda VARSAYIM
// olarak işaretlendi, architect/Orkestratör'ün gözden geçirmesi gerekirse
// diye.)
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
// tutuluyor — yeni bir spec dosyası ekleyen HER ajan bu bloğu
// GÜNCELLEMEK ZORUNDA.
import { defineConfig, devices } from '@playwright/test'

import { resolvePanelDevPort } from './src/app/panel-config.js'

// devops (gate paralelliği): `ARKESOFT_PANEL_E2E_PORT` VERİLMEZSE davranış
// birebir ESKİSİ GİBİDİR. `vite.config.ts` AYNI fonksiyonu AYNI env
// değişkeninden okur — ikisi BİRLİKTE kayar (K1'in değişmezi: Vite portu =
// Playwright'ın hedef aldığı port). `AUTH_BASE_URL`'in (apps/api, SUNUCU
// tarafı) de BU PORTLA eşleşmesi gerekir — BU DOSYA onu KAYDIRAMAZ (apps/api
// bu görevin dosya listesi DIŞINDA); override kullanan çağıran, kendi
// `AUTH_BASE_URL`/`API_PORT` ile eşleşen AYRI bir `apps/api` süreci
// başlatmak ZORUNDADIR — aksi hâlde K1'in "sessiz 403 tuzağı" AYNEN
// tekrarlanır (bkz. devops raporu KARARLAR/RİSKLER).
const PORT = resolvePanelDevPort(process.env['ARKESOFT_PANEL_E2E_PORT'])
const BASE_URL = `http://panel.arkesoft.localhost:${String(PORT)}`

export default defineConfig({
  testDir: './e2e',
  // AC18: oran sınırı bütçesi dar (gerçek sınırın 20'nin altında güvenli
  // pay) — testler SIRALI koşmak ZORUNDA, aksi hâlde aynı IP'den paralel
  // giriş denemeleri sayacı beklenenden hızlı tüketir (`test.describe.
  // serial` spec İÇİNDE de var, bu BAĞIMSIZ bir ikinci güvence).
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
    command: `vite --port ${String(PORT)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
})

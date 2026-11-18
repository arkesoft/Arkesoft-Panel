// @arkesoft/admin — Playwright yapılandırması (ROADMAP v0.0.7, T-008/S5;
// v0.0.19, T-020/S5, ADR-0022 Karar 3 (K3) — proje matrisi RESMÎLEŞTİ)
//
// v0.0.19 İKİ DEĞİŞİKLİK (AC17'nin eski "TEK proje" asgarisinin YERİNE):
// (1) İKİ ADLANDIRILMIŞ proje, DİZİN TABANLI ayrım — `--grep` KULLANILMADI
//     (ADR Karar 3: "başlık düzenlemesi kapsamı sessizce kaydırır"). `admin-
//     desktop` (`testDir: './e2e'`, `testIgnore: ['**/responsive/**']`) ve
//     `admin-mobile` (`testDir: './e2e/responsive'`) — kullanıcı kararı 2
//     ("çoklu viewport" DARALTILDI): auth tüketen DÖRT spec SADECE masaüstü
//     projesinde koşar, mobil proje auth TÜKETMEYEN bir yerleşim spec'i
//     taşır (`e2e/responsive/sign-in-layout.spec.ts`).
// (2) Bütçe BURADAN `e2e/auth-budget.ts`'e TAŞINDI (tek doğruluk kaynağı
//     ARTIK O DOSYA, `auth-budget.test.ts`'in fail-closed değişmezleriyle
//     korunuyor) — bu dosya yalnızca ONA işaret eder, sayıları TEKRARLAMAZ.
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
// AC18 bütçesinin TEK doğruluk kaynağı artık `e2e/auth-budget.ts`
// (`AUTH_IP_LIMITS`/`SPEC_AUTH_COST`) — gerçek sınırlar (`LOGIN_IP_LIMIT=20`/
// 15dk, `EMAIL_IP_LIMIT=10`/saat, `rate-limit.policy.ts:127,134`) ve beş
// spec'in payı O DOSYADA tutulur, `auth-budget.test.ts` kapsam/çarpan/
// toplam değişmezlerini MEKANİK doğrular. Burada yalnızca İTHAL EDİLİP
// `workers`/`fullyParallel` kararının GEREKÇESİ olarak kullanılıyor —
// sayılar BURADA TEKRARLANMAZ (tek yerde elle tutulan sayı disiplini,
// eski yorumun AYNI gerekçesi).
import {
  createPlaywrightBaseConfig,
  desktopDevice,
  reflowMobileDevice,
} from '../../scripts/playwright/base.js'
import { AUTH_IP_LIMITS, SPEC_AUTH_COST } from './e2e/auth-budget.js'
import { resolvePanelDevPort } from './src/app/panel-config.js'

// T-020/S5 — ADR-0022 K1(b): `fixtures/tenant-cleanup.ts`'in fail-closed
// `NODE_ENV=test` kapısı için BURADA sabitleniyor (`playwright test`
// NODE_ENV'i KENDİSİ AYARLAMAZ, ÖLÇÜLDÜ:
// `node -e "console.log(process.env.NODE_ENV)"` → `undefined`; emsal
// Vitest'in KENDİLİĞİNDEN ayarladığı bir bağlamda yazılmıştı, bu BAĞLAM
// FARKLI). `??=` — zaten `test` İSE (örn. bir üst katman ayarlamışsa)
// DOKUNULMAZ. `webServer.command` AŞAĞIDA bu değeri vite'ın ÇOCUK
// sürecinden `env NODE_ENV=development` İLE AÇIKÇA GERİ ALIR (storefront'un
// `env -u …` ÖN EKİYLE AYNI utility, ters yönde kullanım) — NODE_ENV=test'in
// dev sunucusuna SIZMASI riske değmez (admin'in uygulama kodu `NODE_ENV`'e
// BAKMIYOR, ÖLÇÜLDÜ — `grep` sıfır eşleşme — ama bu YİNE DE savunma amaçlı
// bir izolasyon, storefront'un "dedektör temizliği" disipliniyle AYNI sınıf).
process.env['NODE_ENV'] ??= 'test'

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

// İKİNCİ, BAĞIMSIZ fail-closed kapı (T-020/S5) — `auth-budget.test.ts`'in
// "toplam" assertion'ıyla AYNI hesabı burada TEKRARLAR, ama config YÜKLENİR
// YÜKLENMEZ fırlar (Vitest'i ÇALIŞTIRMAYI beklemez). Biri bu dosyadaki
// `SPEC_AUTH_COST`'u sınırın ÜSTÜNE çıkaracak şekilde değiştirip `pnpm test`
// koşturmadan DOĞRUDAN `playwright test` koşturursa BİLE yakalanır.
const declaredAuthTotals = Object.values(SPEC_AUTH_COST).reduce(
  (accumulator, cost) => ({
    signIn: accumulator.signIn + cost.signIn,
    signUp: accumulator.signUp + cost.signUp,
  }),
  { signIn: 0, signUp: 0 },
)
if (
  declaredAuthTotals.signIn > AUTH_IP_LIMITS.signIn ||
  declaredAuthTotals.signUp > AUTH_IP_LIMITS.signUp
) {
  throw new Error(
    `playwright.config.ts: auth-budget.ts toplamı sınırı aşıyor (signIn ${String(declaredAuthTotals.signIn)}/${String(AUTH_IP_LIMITS.signIn)}, signUp ${String(declaredAuthTotals.signUp)}/${String(AUTH_IP_LIMITS.signUp)}) — yeni bir spec eklenmiş olabilir, e2e/auth-budget.ts güncellenmeli.`,
  )
}

export default createPlaywrightBaseConfig({
  testDir: './e2e',
  // DÜZELTME (ROADMAP v0.0.20.3, T-024 fix turu 1, `security` tur1 F4 —
  // medium) — AC-21'in "onaylanmış `incomplete` ad ad raporlanır" yarısı
  // ÖLÇÜLEREK sessiz bulundu: CI'nın varsayılan reporter'ı (`dot`) ve
  // bu depodaki hiçbir `playwright.config.ts` `testInfo.annotations`'ı
  // (`scripts/playwright/a11y.ts`'in yazdığı `a11y-incomplete` kaydı)
  // STDOUT'a/artefakta BASMIYORDU — `apps/*/playwright-report` (html
  // reporter'ın ürettiği dizin) de hiç DOĞMUYORDU (grep: üç config'te de
  // `reporter` alanı YOK). `html` reporter EKLENEREK çözülmedi: o dizin
  // `ci.yml:1564`'ün (bugün `:apps/*/playwright-report`) ZATEN YÜKLEDİĞİ
  // yola düşer ve html reporter trace/snapshot'ı GÖMER — F1'in kapattığı
  // PII kanalını BAŞKA bir reporter'la GERİ AÇARDI. Seçilen yol: `dot`
  // (CI varsayılanı, DAVRANIŞ DEĞİŞMİYOR) + `json` (outputFile BİLEREK
  // `apps/*/test-results`/`apps/*/playwright-report` glob'unun DIŞINDA,
  // bu yüzden `ci.yml`'in mevcut yükleme adımına HİÇ GİRMEZ) — `ci.yml`
  // bu JSON'ı `jq` ile okuyup YALNIZCA `a11y-incomplete` açıklamasını
  // (`<scanName>/<ruleId> × <düğüm sayısı>` — PII TAŞIMAZ, `a11y.ts`
  // ölçüldü) `GITHUB_STEP_SUMMARY`'ye yazar; JSON dosyasının KENDİSİ
  // (hata mesajları/target snippet'leri taşıyabilir, F1'in `medium`
  // bulgu 2'siyle AYNI sınıf) hiçbir yere YÜKLENMEZ. Yalnızca CI'da
  // (`process.env['CI']` — `base.ts`'in `forbidOnly` deseniyle AYNI
  // koşul) — yerelde reporter DEĞİŞMEZ (Playwright'ın varsayılanı
  // `list`), geliştiricinin yerel teşhis deneyimi ETKİLENMEZ.
  // `exactOptionalPropertyTypes: true` — `reporter: undefined` TS2379
  // verir (alanın KENDİSİ `undefined` KABUL ETMEZ, yalnızca YOK OLABİLİR);
  // bu yüzden anahtar CI DIŞINDA hiç SPREAD EDİLMEZ, `undefined`'A
  // ATANMAZ.
  ...(process.env['CI']
    ? { reporter: [['dot'], ['json', { outputFile: 'playwright-annotations.json' }]] as const }
    : {}),
  // ⚠⚠ T-020/S5 ÖLÇÜMÜ (negatif kanıt sırasında bulundu): Playwright'ın
  // VARSAYILAN `testMatch`'i `*.test.ts`'i DE eşleştirir (`*.spec.ts`
  // KADAR) — `e2e/__tests__/auth-budget.test.ts` (Vitest testi, `describe`/
  // `it` Playwright'ın DEĞİL) BU YÜZDEN Playwright TARAFINDAN da yükleniyor
  // ve `Cannot read properties of undefined (reading 'config')` ile
  // ÇÖKÜYORDU (ÖLÇÜLDÜ: `playwright test --list` bu hatayla "Total: 0 tests"
  // döndü). `testMatch` BURADA AÇIKÇA `.spec.ts`'e SABİTLENDİ — Vitest'in
  // `include`'u (`vitest.config.ts`) `.test.ts`'e, Playwright'ınki `.spec.
  // ts`'e; ikisi KESİŞMEZ.
  testMatch: '**/*.spec.ts',
  // T-020/S5 — ADR-0022 K1, "+ globalTeardown (idempotent önek süpürmesi)":
  // her spec'in KENDİ `afterAll`'ı kendi sızıntısını kapatır; bu güvenlik
  // AĞI bir çökme/timeout yüzünden `afterAll`'ın HİÇ çalışmadığı satırları
  // temizler (bkz. `e2e/global-teardown.ts` dosya başı notu).
  globalTeardown: './e2e/global-teardown.ts',
  // AC18: oran sınırı bütçesi dar (gerçek sınırın altında güvenli pay) —
  // testler SIRALI koşmak ZORUNDA, aksi hâlde aynı IP'den paralel giriş
  // denemeleri sayacı beklenenden hızlı tüketir (`test.describe.serial`
  // spec İÇİNDE de var, bu BAĞIMSIZ bir ikinci güvence).
  fullyParallel: false,
  // T-020/S5 — ADR-0022 K3: İKİ adlandırılmış proje, DİZİN tabanlı ayrım
  // (`--grep` YASAK). `admin-desktop` auth tüketen DÖRT spec'i taşır;
  // `admin-mobile` SADECE auth tüketMEYEN yerleşim spec'ini
  // (`e2e/responsive/sign-in-layout.spec.ts`) — kullanıcı kararı 2'nin
  // mekanik karşılığı ("çoklu viewport"un amacı duyarlı render, auth
  // akışını İKİNCİ kez koşmak DEĞİL).
  projects: [
    {
      name: 'admin-desktop',
      testDir: './e2e',
      testIgnore: ['**/responsive/**'],
      use: { ...desktopDevice },
    },
    {
      name: 'admin-mobile',
      testDir: './e2e/responsive',
      // T-024 (ROADMAP v0.0.20.3): WCAG 1.4.10 referans genişliği (320 px)
      // — `mobileDevice` (412 px) DEĞİL, `reflowMobileDevice` (bkz. base.ts).
      use: { ...reflowMobileDevice },
    },
  ],
  use: {
    baseURL: BASE_URL,
  },
  webServer: {
    // T-020/S5 — dosya başı NODE_ENV notu: vite'ın ÇOCUK süreci `NODE_ENV=
    // development`'a AÇIKÇA PİNLİ (storefront'un `env -u …` deseniyle AYNI
    // utility, ters yönde) — ebeveynin `NODE_ENV=test`'i (tenant-cleanup
    // fixture'ının fail-closed kapısı İÇİN) buraya SIZMAZ.
    command: `env NODE_ENV=development vite --port ${String(PORT)} --strictPort`,
    url: BASE_URL,
    // ⚠⚠ T-020/S3 ÖLÇÜMÜ (devops, bağlayıcı): `reuseExistingServer: !process.
    // env['CI']` yerelde 5173'te ZATEN koşan bir vite'ı SESSİZCE yeniden
    // KULLANIYORDU — o süreç `ARKESOFT_PANEL_DEV_API_TARGET` TAŞIMIYORSA
    // proxy varsayılana (`vite.config.ts:60` → `http://127.0.0.1:3000`)
    // DÜŞÜYOR ve HER tRPC çağrısı kullanıcının `demo-site` Next.js
    // projesine GİDİYOR (ÖLÇÜLDÜ: env YOKKEN `/trpc/session.me` → 404 ·
    // `x-nextjs-cache: HIT` · `<!DOCTYPE html>`; env VARKEN → 401 ·
    // `{"code":"UNAUTHENTICATED"}`) — T-020/S3'te BU TUZAK DÖRT testi
    // düşürdü (`demo-site` port 3000 tuzağının İKİNCİ kapısı). ÇÖZÜM EMSALİ
    // ZATEN REPODA: `apps/storefront/playwright.config.ts` BİLEREK
    // `reuseExistingServer: false` kullanıyor (T-011 "halka 3" gerekçesi) —
    // admin BURADA onunla HİZALANDI. ⚠ DAVRANIŞ DEĞİŞİKLİĞİ: her koşum
    // KENDİ vite'ını başlatır (biraz yavaş, ama DETERMİNİSTİK) — bir SONRAKİ
    // ajan bunu "gereksiz yavaşlık" sanıp GERİ ALMASIN.
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

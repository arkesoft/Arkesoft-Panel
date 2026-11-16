// @arkesoft/superadmin — Playwright yapılandırması (ROADMAP v0.0.20,
// T-021/S10, ADR-0022 Karar 6 — üçüncü tüketici).
//
// ⭐ `scripts/playwright/base.ts`'i TÜKETİR (`createPlaywrightBaseConfig` +
// `DESKTOP_DEVICE_NAME`) — `apps/admin/playwright.config.ts`'in AYNI deseni,
// tek farkla: ⚠⚠ Orkestratör kararı (R-PO1, T-021 Task dosyası) `base.ts`'in
// DÖRT export'undan yalnızca `DESKTOP_DEVICE_NAME`'in BU sürümde gerçek bir
// tüketicisi olabileceğini tespit etti — `MOBILE_DEVICE_NAME` ve iki
// `VISUAL_*` sabiti bu uygulamada `responsive/`/`visual/` dizini OLMADIĞI
// (A-T21-5, bilerek — bu dosya o dizinleri AÇMAZ) için BU sürümde meşru bir
// tüketici KAZANAMAZ; vadeleri `v0.0.20.1`. Onları yapay olarak import etmek
// (örn. kullanılmayan bir `mobileDevice` projesi eklemek) borcu KAPATMAZ,
// GİZLER — bu dosya bunu BİLEREK yapmaz.
//
// TEK PROJE, DİZİN AYRIMI YOK (ADR-0022 Karar 3 BU sürümde AÇILMADI —
// `scripts/playwright/sql.ts`'in dosya başı yorumu/ADR-0022 GÜNCELLEME
// bloğu): `superadmin` yalnızca `e2e/*.spec.ts` taşır, `responsive/`/
// `visual/` YOKTUR.
//
// A-A21-1 ÖLÇÜMÜ (S1, T-021, bağlayıcı) — 2FA bayrağı `enable` SONRASINDA
// değil `verify-totp` onayı SONRASINDA `true` olur VE bayrak `true` iken
// HER `sign-in` yeniden bir TOTP sınaması ister. Bu yüzden
// `e2e/fixtures/platform-admin.ts` (S10) `scripts/playwright/totp.ts`'i
// (S9, R-A4) tüketir — `apps/api`'den İTHAL ETMEZ (CLAUDE.md §3).
//
// AC18 oran sınırı bütçesi — `e2e/auth-budget.ts`'in (bu dosya) TEK doğruluk
// kaynağı olduğu desen `apps/admin/playwright.config.ts:25-32`'nin AYNISI:
// bu dosya SADECE ithal eder, sayıları TEKRARLAMAZ.
import { createPlaywrightBaseConfig, desktopDevice } from '../../scripts/playwright/base.js'
import { AUTH_IP_LIMITS, SPEC_AUTH_COST } from './e2e/auth-budget.js'
import { resolveSuperadminDevPort } from './src/app/superadmin-config.js'

// T-021/S10 — ADR-0022 K1(b)'nin AYNI fail-closed kapısı (`apps/admin/
// playwright.config.ts:41-53`'ün AYNI gerekçesi): `playwright test`
// `NODE_ENV`'i KENDİSİ ayarlamaz — `scripts/playwright/sql.ts`'in
// `assertTestEnvironment()` kapısı için BURADA sabitlenir. `webServer.command`
// AŞAĞIDA bu değeri vite'ın ÇOCUK sürecinden AÇIKÇA GERİ ALIR.
process.env['NODE_ENV'] ??= 'test'

// devops (T-021/S10, A-PO21-3): `ARKESOFT_SUPERADMIN_E2E_PORT` VERİLMEZSE
// davranış `vite.config.ts`'in VARSAYILANIYLA BİREBİR AYNIDIR — ikisi AYNI
// `resolveSuperadminDevPort`'u AYNI env değişkeninden okur, birlikte kayar.
const PORT = resolveSuperadminDevPort(process.env['ARKESOFT_SUPERADMIN_E2E_PORT'])
const BASE_URL = `http://superadmin.arkesoft.localhost:${String(PORT)}`

// İKİNCİ, BAĞIMSIZ fail-closed kapı (`apps/admin/playwright.config.ts:67-86`
// ile AYNI desen) — `auth-budget.test.ts`'in "toplam" assertion'ını config
// YÜKLENİR YÜKLENMEZ TEKRARLAR.
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
  // `apps/admin/playwright.config.ts:90-98`'in AYNI ölçülmüş tuzağı:
  // Playwright'ın varsayılan `testMatch`'i `*.test.ts`'i de eşleştirir —
  // `e2e/__tests__/auth-budget.test.ts` (Vitest testi) BU YÜZDEN burada
  // AÇIKÇA `.spec.ts`'e sabitlenir.
  testMatch: '**/*.spec.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // AC18: oran sınırı bütçesi dar — testler SIRALI koşmak ZORUNDA.
  fullyParallel: false,
  // ⭐ AC-3: TEK adlandırılmış proje, `DESKTOP_DEVICE_NAME`'in GERÇEK
  // tüketicisi (`scripts/playwright/base.ts`'in `desktopDevice`'ı).
  // `responsive/`/`visual/` dizini YOK (A-T21-5) — ikinci bir proje İCAT
  // EDİLMEZ.
  projects: [
    {
      name: 'superadmin',
      testDir: './e2e',
      use: { ...desktopDevice },
    },
  ],
  use: {
    baseURL: BASE_URL,
  },
  webServer: {
    // `apps/admin/playwright.config.ts:132-156`'nın AYNI deseni: vite'ın
    // ÇOCUK süreci `NODE_ENV=development`'a AÇIKÇA PİNLİ — ebeveynin
    // `NODE_ENV=test`'i (yukarıdaki fail-closed kapı İÇİN) buraya SIZMAZ.
    command: `env NODE_ENV=development vite --port ${String(PORT)} --strictPort`,
    url: BASE_URL,
    // `apps/admin`'in AYNI ölçülmüş kararı (T-020/S3) — yerelde ZATEN
    // koşan bir vite'ı SESSİZCE yeniden KULLANMAK, o sürecin
    // `ARKESOFT_SUPERADMIN_DEV_API_TARGET` TAŞIMAMASI durumunda K1'in
    // "sessiz 403 tuzağı"nı tekrarlar — her koşum KENDİ vite'ını başlatır.
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

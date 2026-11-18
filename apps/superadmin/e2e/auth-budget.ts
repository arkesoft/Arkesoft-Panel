// @arkesoft/superadmin — e2e oran sınırı bütçesi (ROADMAP v0.0.20, T-021/S10,
// ADR-0022 Karar 3 "bütçe beyan tablosu" — `apps/admin/e2e/auth-budget.ts`'in
// AYNI deseni).
//
// `e2e/__tests__/auth-budget.test.ts` bu dosyanın tipli verisine karşı İKİ
// değişmezi assert eder (fail-closed kapsama · toplam sınır altı) — bu
// uygulamada `responsive/`/`visual/` dizini OLMADIĞI için (A-T21-5) admin'in
// ÜÇÜNCÜ değişmezi (çarpan sıfırı) BURADA YOKTUR; vacuous bir testi İCAT
// ETMEK yerine BİLEREK YAZILMADI.
//
// AUTH_IP_LIMITS BAĞIMSIZ BİR PİN'DİR (`rate-limit.policy.ts`'ten İTHAL
// EDİLMEZ) — `apps/superadmin`'in `apps/api`'ye KAYNAK bağımlılığı YOK.
// Gerçek sınırla uyumu (ÖLÇÜLDÜ, `apps/admin/e2e/auth-budget.ts`'in AYNI
// ölçümü, `rate-limit.policy.ts:127,134`): `LOGIN_IP_LIMIT = 20` (15 dk
// pencere) · `EMAIL_IP_LIMIT = 10` (1 saat pencere).
export const AUTH_IP_LIMITS = { signIn: 20, signUp: 10 } as const

/**
 * Her `e2e/*.spec.ts` dosyasının `/auth/sign-in/email` ve `/auth/sign-up/
 * email`'e yaptığı GERÇEK ağ çağrısı sayısı — anahtar, `e2e/` kökünden POSIX
 * (`/`) ayraçlı GÖRELİ yoldur. Ölçülmüş sayılar (dosya başı yorumları
 * `superadmin-flow.spec.ts`/`superadmin-authz.spec.ts`'in KENDİ payını
 * belgeler, BURADA TEKRARLANMAZ):
 *   - `superadmin-flow.spec.ts`: 1 sign-up + 1 sign-in — TEK kullanıcı
 *     (platform yöneticisi VE iki kiracının sahibi AYNI kullanıcı);
 *     `enable`/`verify-totp`/`createTenant`/`platform.*` İKİNCİ bir kimlik
 *     doğrulama çağrısı GEREKTİRMEZ (S1'in "aynı sessionCookiePair zincir
 *     boyunca geçerli" ölçümü).
 *   - `superadmin-authz.spec.ts`: 1 sign-up (2FA'sız platform yöneticisi) +
 *     1 sign-in.
 *   - `sidebar-focus-return.qa.spec.ts` (EKLENDİ: qa tur 1, T-021 — wcag
 *     tur1 M1'in canlı DOM kanıtı, Orkestratör devri): 1 sign-up + 1
 *     sign-in — TEK kullanıcı, `beforeAll` içinde kurulur, İKİ testin
 *     (Escape/bağlantı seçimi) ikisi de AYNI `storageState`'i okur (ikinci
 *     bir kimlik doğrulama çağrısı YOK). ⚠ Bu dosyanın kalıcı sahipliği
 *     (korunacak mı, admin'in `session-security-dialog-focus.qa.spec.ts`
 *     emsali gibi kalıcı mı olacak, yoksa `devops` tarafından başka bir
 *     spec'e taşınacak mı) qa tur1 raporunda Orkestratöre bırakıldı.
 *   - `two-factor-setup-reload.spec.ts` (EKLENDİ: T-022/S5, AC-1/AC-2 —
 *     bu sürümün TEK uçtan uca kapısı): 1 sign-in + 1 sign-up —
 *     `createVerifiedFixtureUser` TEK çağrıda ikisini de üretir (`superadmin-
 *     authz.spec.ts`'in AYNI deseni), İKİNCİ bir `sign-in` GEREKMEZ
 *     (storageState ile context açılır; 2FA'nın kendi `enable`/`get-totp-
 *     uri`/`verify-totp` çağrıları bu bütçeye GİRMEZ).
 *   - `accessibility.spec.ts` (EKLENDİ: T-024/S6, AC-19/AC-20/AC-21): 1
 *     sign-up + 1 sign-in — `createVerifiedFixtureUser` TEK zincirde
 *     ikisini üretir, `enableTotpTwoFactor`'ün `enable`/`verify-totp`
 *     çağrıları (`/giris` + `/` taramaları AYNI `beforeAll`'ın kullanıcısını
 *     paylaşır) İKİNCİ bir `sign-in`/`sign-up` GEREKTİRMEZ.
 */
export const SPEC_AUTH_COST: Record<string, { readonly signIn: number; readonly signUp: number }> =
  {
    'superadmin-flow.spec.ts': { signIn: 1, signUp: 1 },
    'superadmin-authz.spec.ts': { signIn: 1, signUp: 1 },
    'sidebar-focus-return.qa.spec.ts': { signIn: 1, signUp: 1 },
    'two-factor-setup-reload.spec.ts': { signIn: 1, signUp: 1 },
    'accessibility.spec.ts': { signIn: 1, signUp: 1 },
  }

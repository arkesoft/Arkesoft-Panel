// @arkesoft/admin — e2e oran sınırı bütçesi (ROADMAP v0.0.19, T-020/S5,
// ADR-0022 Karar 3 (K3) "bütçe beyan tablosu").
//
// ⚠⚠ Bu dosya `playwright.config.ts:43-58`'in YERİNE GEÇER (po kararı,
// bağlayıcı — bu sürümde o blok "tek doğruluk kaynağı" OLMAKTAN ÇIKIYOR):
// kaynak BURASI, `playwright.config.ts`'te yalnızca BURAYA işaret eden bir
// not kalır. `docs/testing.md` (S10) bütçeyi TEKRAR ETMEZ, BU DOSYAYA atıf
// yapar.
//
// `e2e/__tests__/auth-budget.test.ts` bu dosyanın tipli verisine karşı ÜÇ
// değişmezi assert eder (fail-closed kapsama · responsive/ çarpan sıfırı ·
// toplam sınır altı) — dosya başı yorumuna bkz. Dördüncü değişmez (pin
// tazeliği, `AUTH_IP_LIMITS`'in `rate-limit.policy.ts`'teki gerçek sınırla
// uyumu) BU alt görevin kapsamı DIŞINDA — `guards.sh`'e gidiyor (T-020/S7).
//
// AUTH_IP_LIMITS BAĞIMSIZ BİR PİN'DİR (`rate-limit.policy.ts`'ten
// İTHAL EDİLMEZ) — `apps/admin`'in `apps/api`'ye KAYNAK bağımlılığı YOK
// (yalnızca HTTP/tRPC ile konuşuyor) ve bu paket `@arkesoft/trpc`/
// `@arkesoft/errors` dışında apps/api'nin hiçbir dosyasını İTHAL EDEMEZ.
// Gerçek sınırla uyumu (ÖLÇÜLDÜ, `rate-limit.policy.ts:127,134`):
// `LOGIN_IP_LIMIT = 20` (15 dk pencere) · `EMAIL_IP_LIMIT = 10` (1 saat
// pencere) — bu iki sayı BİREBİR aynı.
export const AUTH_IP_LIMITS = { signIn: 20, signUp: 10 } as const

/**
 * Her `e2e/*.spec.ts` dosyasının `/auth/sign-in/email` ve `/auth/sign-up/
 * email`'e yaptığı GERÇEK ağ çağrısı sayısı — anahtar, `e2e/` kökünden
 * POSIX (`/`) ayraçlı GÖRELİ yoldur. ÖLÇÜLMÜŞ sayılar (dosya başı yorumları
 * `panel-flow.spec.ts`/`registration-flow.spec.ts`/`session-security-
 * dialog-focus.qa.spec.ts`'in KENDİ payını belgeler, BURADA TEKRARLANMAZ —
 * toplamın `playwright.config.ts:43-58`'deki ESKİ toplamla eşleştiği
 * `auth-budget.test.ts`'in kapsam/toplam assertion'larıyla mekanik olarak
 * doğrulanır):
 *   - `panel-flow.spec.ts`: 3 sign-in (AC2/AC4, AC10, AC9 `beforeAll`) + 3
 *     sign-up (her `sign-in` kendi `createVerifiedFixtureUser`'ını açıyor).
 *   - `qa-blind-spot-and-negative-scenarios.qa.spec.ts`: 1 sign-in (var
 *     OLMAYAN bir e-posta ile başarısız deneme, `sign-up` GEREKMİYOR) + 0
 *     sign-up.
 *   - `session-security-dialog-focus.qa.spec.ts`: 3 sign-in (ActiveSessions
 *     senaryosu 2 + 2FA senaryosu 1) + 2 sign-up (iki senaryo da kendi
 *     fixture kullanıcısını açıyor).
 *   - `registration-flow.spec.ts`: 1 sign-in + 1 sign-up (`beforeAll`'da
 *     BİR kez, TÜM testler storageState'i paylaşır).
 *   - `responsive/sign-in-layout.spec.ts`: 0 sign-in + 0 sign-up (yalnızca
 *     istemci tarafı yerleşim gözlemi — ağ çağrısı YOK, bkz. dosyanın
 *     kendisi).
 *   - `two-factor-setup-reload.spec.ts` (EKLENDİ: T-022/S5, AC-1/AC-2 —
 *     bu sürümün TEK uçtan uca kapısı): 1 sign-in + 1 sign-up — TEK fixture
 *     kullanıcısı, TEK test (`createVerifiedFixtureUser` 1 sign-up, UI
 *     `sign-in` gönderimi 1 sign-in; 2FA'nın kendi `enable`/`get-totp-uri`/
 *     `verify-totp` çağrıları BU bütçeye GİRMEZ — dosya başı yorumunun
 *     `/auth/sign-in/email` ve `/auth/sign-up/email`'e ÖZEL tanımı).
 *   - `a11y-helper-self-test.spec.ts` (EKLENDİ: T-024/S3, AC-21/AC-22):
 *     0 sign-in + 0 sign-up — beş senaryo da `page.setContent` ile sentetik
 *     DOM üretir, kimlik doğrulama uçlarına TEK bir ağ çağrısı bile yapmaz
 *     (dosya başı notu: "auth MALİYETİ sıfır").
 *   - `accessibility.spec.ts` (EKLENDİ: T-024/S5, AC-19/AC-20/AC-21; ⚠
 *     DÜZELTİLDİ — Orkestratör, "ek sign-in maliyeti sıfır" kısıtının
 *     gereksiz daraltıcı olduğunu ÖLÇTÜ, bkz. dosyanın kendi başı yorumu):
 *     1 sign-up + 2 sign-in — `beforeAll`'da BİR `sign-up` + İKİ `sign-in`
 *     (AYNI fixture kullanıcısıyla, İKİNCİ `APIRequestContext`) — "Sonlandır"
 *     tetikleyicisini render eden İKİNCİ oturum satırı GERÇEK bir ikinci
 *     `/auth/sign-in/email` çağrısıyla üretiliyor, SQL `INSERT` YOK.
 */
export const SPEC_AUTH_COST: Record<string, { readonly signIn: number; readonly signUp: number }> =
  {
    'panel-flow.spec.ts': { signIn: 3, signUp: 3 },
    'qa-blind-spot-and-negative-scenarios.qa.spec.ts': { signIn: 1, signUp: 0 },
    'session-security-dialog-focus.qa.spec.ts': { signIn: 3, signUp: 2 },
    'registration-flow.spec.ts': { signIn: 1, signUp: 1 },
    'responsive/sign-in-layout.spec.ts': { signIn: 0, signUp: 0 },
    'two-factor-setup-reload.spec.ts': { signIn: 1, signUp: 1 },
    'a11y-helper-self-test.spec.ts': { signIn: 0, signUp: 0 },
    'accessibility.spec.ts': { signIn: 2, signUp: 1 },
  }

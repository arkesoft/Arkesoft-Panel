// @arkesoft/superadmin — platform yöneticisi e2e fixture'ı (ROADMAP v0.0.20,
// T-021/S10, ADR-0023, mimari karar: `apps/superadmin/e2e` `apps/api`'den
// İTHAL EDEMEZ — CLAUDE.md §3).
//
// ⭐ `scripts/playwright/sql.ts`'TEN `runSql`/`querySqlRows`'u İTHAL EDER
// (ADR-0022 GÜNCELLEME, S9) — KENDİ GÖVDESİ YOK (K1(d) kapısının tek doğruluk
// kaynağı istisnasız bu modüldür; üçüncü bir kopya `guards.sh`'i KIRMIZI
// yapar, S9'un mutasyon kanıtı). ⭐ `scripts/playwright/totp.ts`'TEN
// `generateTotpCode`'u İTHAL EDER (R-A4, S9) — `apps/api`'nin kendi TOTP
// üreticisi (`totp-code-generator.port.ts`) BAĞIMSIZ, AYRI implementasyon.
// ⭐ `scripts/playwright/mailpit.ts`'TEN `findVerificationToken`'ı İTHAL EDER
// (T-021/S10 FIX turu 1, dalga 2, `solid` M2 — bağlayıcı) — KENDİ GÖVDESİ
// YOK; dört BİREBİR kopyanın (bu dosya + üç `apps/admin` dosyası) taşındığı
// tek paylaşılan modül.
//
// ⚠⚠ OTURUM KURMA SIRASI (S1'in ÖLÇÜMÜ, bağlayıcı — T-021/S1):
//   1. `enable` ÇAĞRISI YETMEZ: bayrak (`two_factor_enabled`) `enable`
//      SONRASI DEĞİL, `verify-totp` ONAYI SONRASI `true` olur.
//   2. Bayrak `true` OLDUKTAN SONRA HER `sign-in` YENİDEN bir TOTP sınaması
//      ister (`twoFactorRedirect:true` ara durumu, tam oturum DEĞİL).
//   3. Ama İLK kurulumda ayrı bir "sınama çerezi" GEREKMEZ — `enable` →
//      `verify-totp` zinciri boyunca AYNI `sessionCookiePair` geçerli kalır
//      (S1'in canlı ölçümü). Bu yüzden bu fixture bir kullanıcı için TEK
//      `sign-in` ile tüm akışı (2FA kurulumu + iki kiracı oluşturma + platform
//      yöneticiliği) yürütür — İKİNCİ bir `sign-in` GEREKMEZ.
//
// ⚠⚠ DOĞRUDAN BACKEND BAĞLANTISI (Host tuzağından kaçış) — bu fixture `apps/
// superadmin`'in KENDİ Vite proxy'sini (CORS AÇILMADAN, `changeOrigin:
// false`) KULLANMAZ; `apps/api`'ye DOĞRUDAN bağlanır. Üç ÖLÇÜLMÜŞ gerekçe:
//   (a) `/auth/sign-up/email`, `/auth/sign-in/email`, `/auth/two-factor/*`,
//       `/trpc/registration.*` VE `/trpc/platform.*`'IN TAMAMI
//       `TENANT_EXEMPT_PATHS`'TEDİR (`apps/api/src/tenancy/
//       tenant-exempt-paths.ts`, OKUNDU) — tenant çözümü bu yollar için HANGİ
//       Host değeri verilirse verilsin ATLANIR; Host'un rezerve bir alt alan
//       adı OLMASI (`panel`/`superadmin`) bu yollarda ŞART DEĞİLDİR (canlı
//       ölçüldü: `curl -H "Host: panel.arkesoft.localhost"` ve Host'suz
//       istek AYNI yanıtı verdi).
//   (b) Better Auth oturum çerezi `Domain=.${APP_BASE_DOMAIN}` taşır
//       (`auth-instance.ts:177`, `crossSubDomainCookies`) — bir HTTP istemci
//       çerez kavanozu bu Domain'i yalnızca İSTEK HOST'U `.arkesoft.localhost`
//       ile EŞLEŞİYORSA (RFC 6265 domain-match) KABUL EDER. Ham IP'ye
//       (`127.0.0.1`) bağlanmak çerezi SESSİZCE DÜŞÜRÜR — bu yüzden
//       `superadmin.arkesoft.localhost` (işletim sisteminin `*.localhost`
//       özel çözümlemesiyle `127.0.0.1`'e çözülür, CI'da da — admin/
//       storefront e2e'nin ZATEN kanıtladığı mekanizma) KULLANILIR, ham IP
//       DEĞİL.
//   (c) GERÇEK backend portu ortam bağımlıdır (yerelde kullanıcının kendi
//       `demo-site`'ı `:3000`'i işgal ettiği için `apps/api` `:3100`'de
//       koşabilir; CI'da `:3000`). Bu fixture PORTU `ARKESOFT_SUPERADMIN_
//       DEV_API_TARGET`'TAN okur (`vite.config.ts`'in ZATEN okuduğu AYNI
//       değişken — YENİ bir env İCAT EDİLMEZ) ve `superadmin.arkesoft.
//       localhost` host'unu O PORTLA birleştirir — Host/çerez eşleşmesi İLE
//       gerçek bağlantı PORTU böylece AYRIŞTIRILIR.
//
// ⚠ ORİJİN BAŞLIĞI — `POST /auth/two-factor/enable|verify-totp` VE
// `POST /trpc/registration.createTenant` oturum çerezi TAŞIYAN GÜVENSİZ
// (POST) istekler; `SameOriginGuard`/Better Auth'un KENDİ Origin denetimi bu
// durumda `Origin` başlığının GÜVENİLİR orijinlerden BİRİYLE eşleşmesini
// ister (`trusted-origins.ts`, OKUNDU). Bu fixture gerçek TCP bağlantısının
// PORTUNDAN BAĞIMSIZ olarak bir `Origin` başlığını AÇIKÇA EKLER.
//
// ⚠⚠ DÜZELTME (ROADMAP v0.0.21.1, T-025/S2, D22/AC-30): bu başlık ARTIK sabit
// bir port JETONU TAŞIMIYOR — `resolveSuperadminDevPort(process.env['ARKESOFT_
// SUPERADMIN_E2E_PORT'])`'TEN türetilir (`apps/superadmin/src/app/
// superadmin-config.ts`'in SAF, fail-fast fonksiyonu — `vite.config.ts` VE
// `playwright.config.ts`'in AYNI çağrısı, böylece üçü BİRLİKTE kayar). Sabit
// port yüzünden süper admin dev sunucusu VARSAYILAN DIŞI bir portta koşarken
// bu fixture'ın `Origin` başlığı gerçek orijini TAKLİT ETMİYORDU ve guard
// `origin_mismatch` veriyordu (T-024'te AC-19/AC-20'nin superadmin ayağı BU
// YÜZDEN yerelde doğrulanamadı). `ARKESOFT_SUPERADMIN_E2E_PORT` VERİLMEZSE
// davranış BAYT-BİREBİR bugünküyle (`SUPERADMIN_DEV_PORT` varsayılanı) AYNIDIR
// — CI bu env'i VERMEZ.
import { randomUUID } from 'node:crypto'

import { expect, type APIRequestContext } from '@playwright/test'
import { z } from 'zod'

import { findVerificationToken } from '../../../../scripts/playwright/mailpit.js'
import { generateTotpCode } from '../../../../scripts/playwright/totp.js'
import { querySqlRows, runSql } from '../../../../scripts/playwright/sql.js'
import { resolveSuperadminDevPort } from '../../src/app/superadmin-config.js'

/** Bu fabrikanın paylaşılan modüle geçirdiği hata metni öneki. */
const SQL_ERROR_LABEL = 'superadmin-platform-admin-fixture'

/**
 * Süper admin rezerve alt alan adı — bu dosyadaki TEK doğruluk kaynağı
 * (T-025/S2 tekilleştirmesi). {@link SUPERADMIN_TRUSTED_ORIGIN} VE
 * {@link resolveDirectApiBaseUrl} İKİSİ DE bu sabiti tüketir; host etiketi
 * iki yerde AYRI AYRI yazılmaz.
 */
const SUPERADMIN_HOST = 'superadmin.arkesoft.localhost'

/**
 * Yalnızca `Origin` başlığı için — gerçek TCP bağlantı portundan BAĞIMSIZ
 * (dosya başı notu (c)). Port `resolveSuperadminDevPort`'tan türetilir:
 * `ARKESOFT_SUPERADMIN_E2E_PORT` verilmezse `SUPERADMIN_DEV_PORT`'un (`.env.
 * example`'daki `SUPERADMIN_BASE_URL` yorumuyla, ADR-0023 §4, AYNI) varsayılan
 * değerine düşer; verilmişse `vite.config.ts`/`playwright.config.ts`'in AYNI
 * anda dinlediği gerçek portla eşleşir (T-025/S2, D22/AC-30).
 */
const SUPERADMIN_TRUSTED_ORIGIN = `http://${SUPERADMIN_HOST}:${String(resolveSuperadminDevPort(process.env['ARKESOFT_SUPERADMIN_E2E_PORT']))}`

/**
 * `apps/api`'ye DOĞRUDAN bağlanacak taban URL — Host `superadmin.arkesoft.
 * localhost` (çerez `Domain` eşleşmesi İÇİN, dosya başı notu (b)), PORT
 * `ARKESOFT_SUPERADMIN_DEV_API_TARGET`'tan (`vite.config.ts`'in AYNI
 * değişkeni, varsayılan `http://127.0.0.1:3000`). ⚠ Bu PORT, {@link
 * SUPERADMIN_TRUSTED_ORIGIN}'in portuyla (dev sunucusunun portu) KARIŞTIRILMAZ
 * — ikisi bağımsız eksenler (dosya başı notu (c)).
 */
function resolveDirectApiBaseUrl(): string {
  const target = process.env['ARKESOFT_SUPERADMIN_DEV_API_TARGET'] ?? 'http://127.0.0.1:3000'
  const parsed = new URL(target)
  const port = parsed.port.length > 0 ? parsed.port : parsed.protocol === 'https:' ? '443' : '80'
  return `${parsed.protocol}//${SUPERADMIN_HOST}:${port}`
}

/**
 * E2E fixture kullanıcılarının e-posta biçimi — `apps/admin/e2e/fixtures/
 * tenant-cleanup.ts`'in AYNI disiplini (kendi önek/biçim, paylaşılan yalnızca
 * mekanizma).
 */
const E2E_FIXTURE_EMAIL_PATTERN = /^[a-z0-9-]+-\d{10,}-[a-z0-9]{1,10}@arkesoft\.test$/

/** E2E fixture kiracı slug biçimi — `<önek>-<13+ haneli zaman damgası>-<rastgele kuyruk>`. */
const E2E_FIXTURE_TENANT_SLUG_PATTERN = /^e2e-[a-z0-9]+-\d{10,}-[a-z0-9]{1,10}$/

/**
 * `platform_admin.user_id`/`platform_audit_log.actor_user_id` için beklenen
 * kullanıcı kimliği biçimi — çıplak silme/sorgu YOK. Better Auth'un ürettiği
 * kimlikler cuid(2) DEĞİL, Better Auth'un KENDİ üreticisi (karışık büyük/küçük
 * harf alfasayısal, ÖLÇÜLDÜ: canlı `sign-up` yanıtından — ör.
 * `T1mUBHTOedUDabmLmxI5cwPICnHDC0bs`) — bu yüzden desen `[a-zA-Z0-9]`'dır,
 * `packages/db`'nin `cuid(2)` varsayılanıyla (yalnızca küçük harf) KARIŞTIRILMAZ.
 */
const USER_ID_PATTERN = /^[a-zA-Z0-9]{20,36}$/

function assertValidUserId(userId: string): void {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new Error(
      `${SQL_ERROR_LABEL}: "${userId}" beklenen kullanıcı kimliği biçimine uymuyor — fail-closed kapı tetiklendi.`,
    )
  }
}

// Mailpit yardımcısı (`findVerificationToken`) ARTIK bu dosyada DEĞİL —
// `scripts/playwright/mailpit.ts`'TEN İTHAL EDİLİYOR (T-021/S10 FIX turu 1,
// dalga 2, `solid` M2 — bağlayıcı): dördüncü BİREBİR kopya, `sql.ts`/
// `totp.ts`'in AYNI alanına (`scripts/playwright/`) taşındı. Üç kardeş kopya
// (`apps/admin/e2e/helpers/verified-fixture-user.ts`,
// `apps/admin/e2e/panel-flow.spec.ts`,
// `apps/admin/e2e/session-security-dialog-focus.qa.spec.ts`) AYNI turda
// güncellendi.
const FIXTURE_PASSWORD = 'arkesoft-e2e-superadmin-fixture-password-123'

/**
 * `test(...)`/`test.beforeAll(...)` callback'lerinin `playwright` fixture'ının
 * (`typeof import('playwright-core')`, `@playwright/test`'in KENDİSİ bu adla
 * bir tip EXPORT ETMİYOR) bu dosyanın TEK kullandığı yüzeyi — minimal
 * YAPISAL (structural) tip, iç Playwright tiplerine BAĞIMLI DEĞİL.
 */
export interface PlaywrightApiRequestFactory {
  readonly request: {
    newContext(options?: { readonly baseURL?: string }): Promise<APIRequestContext>
  }
}

export interface PlatformAdminFixture {
  readonly email: string
  readonly password: string
  readonly userId: string
  /** Hâlâ AÇIK — çağıran `enableTotpTwoFactor`/`createE2eTenant` için kullanır, sonunda `dispose()` eder. */
  readonly request: APIRequestContext
}

/**
 * Kayıt → Mailpit doğrulaması → giriş. 2FA KURMAZ, platform yöneticisi
 * YAPMAZ — çağıran sırasıyla {@link grantPlatformAdmin} ve/veya
 * {@link enableTotpTwoFactor} ile devam eder.
 */
export async function createVerifiedFixtureUser(
  playwright: PlaywrightApiRequestFactory,
  emailPrefix: string,
): Promise<PlatformAdminFixture> {
  const request = await playwright.request.newContext({ baseURL: resolveDirectApiBaseUrl() })

  const email = `${emailPrefix}-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}@arkesoft.test`

  const signUpResponse = await request.post('/auth/sign-up/email', {
    data: { name: 'E2E Süper Admin Fixture', email, password: FIXTURE_PASSWORD },
  })
  expect(signUpResponse.ok()).toBe(true)
  const signUpBody: unknown = await signUpResponse.json()
  const { user } = z.object({ user: z.object({ id: z.string() }) }).parse(signUpBody)

  const token = await findVerificationToken(email)
  const verifyResponse = await request.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
  expect(verifyResponse.ok()).toBe(true)

  const signInResponse = await request.post('/auth/sign-in/email', {
    data: { email, password: FIXTURE_PASSWORD },
  })
  expect(signInResponse.ok()).toBe(true)

  return { email, password: FIXTURE_PASSWORD, userId: user.id, request }
}

/** `platform_admin` satırını yazar — "yetki = satırın varlığı" (ADR-0023 Karar 1). */
export function grantPlatformAdmin(userId: string): void {
  assertValidUserId(userId)
  const id = randomUUID()
  runSql(
    `INSERT INTO platform_admin (id, user_id, created_at, updated_at) VALUES ('${id}', '${userId}', now(), now());`,
    SQL_ERROR_LABEL,
  )
}

const enableTwoFactorBodySchema = z.object({
  method: z.literal('totp'),
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
})

/**
 * `enable` → GERÇEK TOTP kodu üret → `verify-totp` (S1'in ölçtüğü TEK geçerli
 * sıra). Aynı `request`'in oturum çerezi bu zincir boyunca GEÇERLİ kalır —
 * ikinci bir `sign-in` GEREKMEZ (dosya başı notu).
 */
export async function enableTotpTwoFactor(
  request: APIRequestContext,
  password: string,
): Promise<void> {
  const enableResponse = await request.post('/auth/two-factor/enable', {
    headers: { Origin: SUPERADMIN_TRUSTED_ORIGIN },
    data: { password, method: 'totp' },
  })
  expect(enableResponse.ok()).toBe(true)
  const enableBody: unknown = await enableResponse.json()
  const { totpURI } = enableTwoFactorBodySchema.parse(enableBody)

  const secret = new URL(totpURI).searchParams.get('secret')
  if (secret === null) {
    throw new Error(`totpURI içinde 'secret' sorgu parametresi bulunamadı: ${totpURI}`)
  }
  const code = generateTotpCode({ base32Secret: secret })

  const verifyResponse = await request.post('/auth/two-factor/verify-totp', {
    headers: { Origin: SUPERADMIN_TRUSTED_ORIGIN },
    data: { code },
  })
  expect(verifyResponse.ok()).toBe(true)
}

const createTenantResponseEnvelopeSchema = z.object({
  result: z.object({ data: z.object({ slug: z.string(), status: z.string() }) }),
})

export interface CreatedE2eTenant {
  readonly name: string
  readonly slug: string
  readonly status: string
}

/**
 * `/trpc/registration.createTenant`'ı DOĞRUDAN çağırır (admin SPA'sının
 * sihirbazı üzerinden DEĞİL — bu alt görev `apps/admin/**`'e dokunamaz,
 * CLAUDE.md §3). Benzersiz `e2e-tenant-<zaman damgası>-<rastgele>` slug'ı
 * ÜRETİR — biçim {@link E2E_FIXTURE_TENANT_SLUG_PATTERN}'le eşleşir.
 */
export async function createE2eTenant(
  request: APIRequestContext,
  options: { readonly namePrefix: string; readonly siteType: 'ecommerce' | 'corporate' },
): Promise<CreatedE2eTenant> {
  const slug = `e2e-tenant-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`
  const name = `${options.namePrefix} ${String(Date.now())}`

  const response = await request.post('/trpc/registration.createTenant', {
    headers: { Origin: SUPERADMIN_TRUSTED_ORIGIN },
    data: { name, slug, siteType: options.siteType },
  })
  expect(response.ok()).toBe(true)
  const body: unknown = await response.json()
  const envelope = createTenantResponseEnvelopeSchema.parse(body)

  return { name, slug: envelope.result.data.slug, status: envelope.result.data.status }
}

export interface TenantRealValues {
  readonly name: string
  readonly status: string
  readonly planName: string
  /** ISO-8601 UTC — `tenant.created_at`'in GERÇEK veritabanı değeri (saniye/milisaniye dahil). */
  readonly createdAtIso: string
}

/**
 * Oluşturulan bir kiracının GERÇEK veritabanı değerlerini (mağaza adı, durum,
 * plan adı, oluşturulma) okur — `platform.tenantList`'in UI'da gösterdiği
 * değerlerle AC-7'nin "gerçek değerlerle" şartını DOĞRULAMAK için. `arkesoft`
 * Postgres rolü `BYPASSRLS`dir (bootstrap superuser, ÖLÇÜLDÜ) — `subscription`
 * (kiracı kapsamlı, RLS) GUC'suz okunabilir.
 */
export function queryTenantRealValues(slug: string): TenantRealValues {
  if (!E2E_FIXTURE_TENANT_SLUG_PATTERN.test(slug)) {
    throw new Error(
      `${SQL_ERROR_LABEL}: "${slug}" e2e fixture tenant slug biçimine uymuyor — fail-closed kapı tetiklendi.`,
    )
  }
  const rows = querySqlRows(
    `SELECT t.name, t.status, p.name, to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ` +
      `FROM tenant t JOIN subscription s ON s.tenant_id = t.id JOIN plan p ON p.id = s.plan_id ` +
      `WHERE t.slug = '${slug}';`,
    SQL_ERROR_LABEL,
  )
  const row = rows[0]
  if (row === undefined) {
    throw new Error(`${SQL_ERROR_LABEL}: "${slug}" için kiracı/abonelik/plan satırı bulunamadı.`)
  }
  const [name, status, planName, createdAtIso] = row.split('|')
  if (
    name === undefined ||
    status === undefined ||
    planName === undefined ||
    createdAtIso === undefined
  ) {
    throw new Error(`${SQL_ERROR_LABEL}: beklenmeyen sorgu satırı biçimi: "${row}"`)
  }
  return { name, status, planName, createdAtIso }
}

/** `platform_audit_log` satır sayısı — AC-8'in "öncesi + 2" sayımı İÇİN. */
export function countPlatformAuditLogRows(): number {
  const rows = querySqlRows('SELECT count(*) FROM platform_audit_log;', SQL_ERROR_LABEL)
  const raw = rows[0]
  if (raw === undefined) {
    throw new Error(`${SQL_ERROR_LABEL}: count(*) sorgusu satır döndürmedi.`)
  }
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`${SQL_ERROR_LABEL}: count(*) sonucu sayı değil: "${raw}"`)
  }
  return parsed
}

/**
 * `/trpc/platform.tenantList`'i DOĞRUDAN (tarayıcı/React Query'den BAĞIMSIZ)
 * çağırır — AC-8'in sayımını StrictMode'un çift-render'ından/`refetchOnWindow
 * Focus`'tan İZOLE eder (GET, güvenli metot — `Origin` GEREKMEZ).
 */
export async function callTenantListDirectly(request: APIRequestContext): Promise<{
  readonly status: number
  readonly body: unknown
}> {
  const response = await request.get(
    `/trpc/platform.tenantList?input=${encodeURIComponent(JSON.stringify({}))}`,
  )
  const body: unknown = await response.json()
  return { status: response.status(), body }
}

/** `tenant` satırını siler (`subscription`/`tenant_membership` CASCADE ile gider). */
export function deleteFixtureTenantBySlug(slug: string): void {
  if (!E2E_FIXTURE_TENANT_SLUG_PATTERN.test(slug)) {
    throw new Error(
      `${SQL_ERROR_LABEL}: "${slug}" e2e fixture tenant slug biçimine uymuyor — fail-closed kapı tetiklendi.`,
    )
  }
  runSql(`DELETE FROM tenant WHERE slug = '${slug}';`, SQL_ERROR_LABEL)
}

/** `platform_audit_log` satırlarını aktöre göre siler — `actorUserId`'de FK YOK (olgu, CASCADE gelmez), elle temizlenir. */
export function deletePlatformAuditLogByActor(userId: string): void {
  assertValidUserId(userId)
  runSql(`DELETE FROM platform_audit_log WHERE actor_user_id = '${userId}';`, SQL_ERROR_LABEL)
}

/** `app_user` satırını siler — `platform_admin`/`session`/`account`/`two_factor`/`tenant_membership` CASCADE ile gider. */
export function deleteFixtureUserByEmail(email: string): void {
  if (!E2E_FIXTURE_EMAIL_PATTERN.test(email)) {
    throw new Error(
      `${SQL_ERROR_LABEL}: "${email}" e2e fixture e-posta biçimine uymuyor — fail-closed kapı tetiklendi.`,
    )
  }
  runSql(`DELETE FROM app_user WHERE email = '${email}';`, SQL_ERROR_LABEL)
}

/**
 * İdempotent önek süpürmesi (`global-teardown.ts`'in TEK çağıranı) —
 * `apps/admin/e2e/fixtures/tenant-cleanup.ts`'in `sweepOrphanedE2eFixtures`'ı
 * ile AYNI desen: bir çökme/timeout yüzünden `afterAll`'ın HİÇ çalışmadığı
 * satırları temizler. Hiç aday yoksa (normal yol) sıfır kez döner.
 */
export function sweepOrphanedSuperadminE2eFixtures(): void {
  const candidateSlugs = querySqlRows(
    `SELECT slug FROM tenant WHERE slug ~ '^e2e-tenant-[0-9]{10,}-[a-z0-9]{1,10}$';`,
    SQL_ERROR_LABEL,
  )
  for (const slug of candidateSlugs) {
    if (E2E_FIXTURE_TENANT_SLUG_PATTERN.test(slug)) {
      deleteFixtureTenantBySlug(slug)
    }
  }

  const candidateUserIds = querySqlRows(
    `SELECT au.id FROM app_user au WHERE au.email ~ '^[a-z0-9-]+-[0-9]{10,}-[a-z0-9]{1,10}@arkesoft\\.test$' ` +
      `AND EXISTS (SELECT 1 FROM platform_admin pa WHERE pa.user_id = au.id);`,
    SQL_ERROR_LABEL,
  )
  for (const userId of candidateUserIds) {
    if (USER_ID_PATTERN.test(userId)) {
      deletePlatformAuditLogByActor(userId)
    }
  }

  const candidateEmails = querySqlRows(
    `SELECT email FROM app_user WHERE email ~ '^[a-z0-9-]+-[0-9]{10,}-[a-z0-9]{1,10}@arkesoft\\.test$';`,
    SQL_ERROR_LABEL,
  )
  for (const email of candidateEmails) {
    if (E2E_FIXTURE_EMAIL_PATTERN.test(email)) {
      deleteFixtureUserByEmail(email)
    }
  }
}

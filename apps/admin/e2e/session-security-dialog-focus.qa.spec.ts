// @arkesoft/admin — `qa` tur 2 DAR kapsam, İŞ ① (ROADMAP v0.0.15.1, T-017,
// `solid` tur 2 MED-2 bulgusu — bağlayıcı):
//
//   "apps/admin/e2e/panel-flow.spec.ts (eksik test; emsal :256-282) — wcag
//    W-1 (high) düzeltmesinin davranışını PİNLEYEN hiçbir otomatik test
//    yok. Ölçüldü: apps/admin/e2e altında
//    ConfirmDialog|Vazgeç|Sonlandır|Kapat eşleşmesi SIFIR; admin birim
//    testleri DOM'suz (vitest.config.ts:15, environment:'node'). Oysa AYNI
//    davranış için kurulu emsal var: panel-flow.spec.ts:256-282 UserMenu'de
//    Escape → await expect(trigger).toBeFocused() (:282). Düzeltme:
//    :256-282 desenini oturum kartı ve 2FA kartı için TEKRARLA."
//
// `panel-flow.spec.ts`'in (S5, üretim ajanı) SAHİBİ OLDUĞU dosyaya
// DOKUNMADAN eklenen YENİ bir dosya (AGENT_BASELINE §5 — "başka ajanın
// dosyasını değiştirme"; `qa-blind-spot-and-negative-scenarios.qa.spec.ts`
// ile AYNI emsal/disiplin).
//
// ⚠⚠ DAVRANIŞ SEVİYESİ, MEKANİZMA DEĞİL (handoff'un açık uyarısı): bu dosya
// `ActiveSessionsCard.tsx`/`TwoFactorStatusCard.tsx`'in İÇİNDEKİ
// `setTimeout(…, 0)` + `dialogTriggerRef` mekanizmasına HİÇBİR ATIF
// YAPMAZ — yalnızca GÖZLEMLENEBİLİR sonucu assert eder: "diyalog Escape/
// 'Vazgeç'/'×' ile İPTAL edildiğinde odak tetikleyici butona DÖNER, body'ye
// DÜŞMEZ". `wcag` tur 2 bu mekanizmayı `onCloseAutoFocus` + `preventDefault`
// ile DEĞİŞTİRİRSE bu test YİNE geçerli kalır.
//
// İKİ KART da PİNLENDİ (handoff: "en az biri", ikisi de erişilebilir
// olduğu ÖLÇÜLDÜ):
//   (1) ActiveSessionsCard — tetikleyici "Sonlandır" satırı butonu; İKİNCİ
//       bir aktif oturum GEREKİR (satırın "Sonlandır" butonu yalnızca
//       `isCurrent === false` satırlarda render edilir) — bu yüzden AYNI
//       kullanıcı için İKİ AYRI `sign-in/email` çağrısı (iki ayrı
//       `APIRequestContext`, iki ayrı oturum) kullanılır.
//   (2) TwoFactorStatusCard — tetikleyici "Devre dışı bırak" butonu; bu
//       buton yalnızca `twoFactorEnabled === true` iken render edilir — 2FA
//       KURULUMU UI sihirbazı ÜZERİNDEN DEĞİL, doğrudan `/auth/two-factor/
//       enable` → gerçek TOTP kodu üret → `/auth/two-factor/verify-totp`
//       zinciriyle (apps/api'nin KENDİ `two-factor-acceptance-ac1-setup-
//       flow.test.ts`'inin BİREBİR ölçtüğü sıra) API seviyesinde kurulur —
//       UI sihirbazını ayrıca e2e'de sürmek bu testin KONUSU DEĞİL (o,
//       T-016'nın kendi AC'leri).
//
// ⚠⚠ TOTP KOD ÜRETİCİSİ BİLEREK BU DOSYADA KENDİ KENDİNE YETERLİ (apps/
// api/src/auth/two-factor/totp-code-generator.port.ts'TEN İTHAL EDİLMEDİ):
// `apps/admin`'in `apps/api`'ye paket bağımlılığı YOK ve CLAUDE.md §3
// "Bağımlılık yönü: apps/* → packages/*" kuralı apps'ler ARASI ithalatı
// zaten ÖNGÖRMÜYOR. Algoritma (RFC 6238/4226, HMAC-SHA1, node:crypto,
// YENİ BAĞIMLILIK YOK) o port dosyasıyla BİREBİR aynı — kaynağı aynı dosya
// başı yorumunda AÇIKLANAN "Better Auth kaynağı OKUNARAK ölçüldü" sözleşme.
//
// AC18 BÜTÇE GÜNCELLEMESİ (bağlayıcı — bu dosya YENİ bir spec dosyası,
// `playwright.config.ts`'in "ikinci bir spec dosyası ekleyen HER ajan bu
// bloğu GÜNCELLEMEK ZORUNDA" kuralı tetiklendi, ORADA da güncellendi):
// bu dosyanın payı 2 `sign-up` + 3 `sign-in` (test (1): 1 sign-up + 2
// sign-in; test (2): 1 sign-up + 1 sign-in). Koşum başına YENİ TOPLAM:
// sign-up 3+0+2=5, sign-in 3+1+3=7 — gerçek sınır (20/pencere) hâlâ ÇOK
// altında, bu güncelleme SALT KAYIT DİSİPLİNİ (teknik bir risk DEĞİL).
import { createHmac } from 'node:crypto'

import { expect, test, type APIRequestContext } from '@playwright/test'
import { z } from 'zod'

const FIXTURE_PASSWORD = 'arkesoft-e2e-med2-fixture-password-123'
const MAILPIT_BASE_URL = 'http://127.0.0.1:8025'

// ---------------------------------------------------------------------------
// Mailpit yardımcıları — `panel-flow.spec.ts`'in AYNI deseni, o dosyaya
// DOKUNMAMAK için BİREBİR kopya (fonksiyonlar orada dışa AÇILMIYOR).
// ---------------------------------------------------------------------------
interface MailpitAddress {
  readonly Address: string
}
interface MailpitMessageSummary {
  readonly ID: string
  readonly To: readonly MailpitAddress[]
}
interface MailpitMessagesListResponse {
  readonly messages: readonly MailpitMessageSummary[]
}
interface MailpitMessageDetail {
  readonly Text: string
}

function isMailpitMessagesListResponse(value: unknown): value is MailpitMessagesListResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return Array.isArray((value as Record<string, unknown>)['messages'])
}

function isMailpitMessageDetail(value: unknown): value is MailpitMessageDetail {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return typeof (value as Record<string, unknown>)['Text'] === 'string'
}

async function findVerificationToken(email: string): Promise<string> {
  const target = email.toLowerCase()

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listResponse = await fetch(`${MAILPIT_BASE_URL}/api/v1/messages?limit=50`)
    const listRaw: unknown = await listResponse.json()

    if (isMailpitMessagesListResponse(listRaw)) {
      const match = listRaw.messages.find((message) =>
        message.To.some((address) => address.Address.toLowerCase() === target),
      )

      if (match !== undefined) {
        const detailResponse = await fetch(`${MAILPIT_BASE_URL}/api/v1/message/${match.ID}`)
        const detailRaw: unknown = await detailResponse.json()

        if (!isMailpitMessageDetail(detailRaw)) {
          throw new Error('Mailpit mesaj gövdesi beklenen şekilde değil')
        }

        const urlMatch = /https?:\/\/\S+/.exec(detailRaw.Text)
        if (urlMatch === null) {
          throw new Error('Doğrulama e-postasında bağlantı bulunamadı')
        }

        const token = new URL(urlMatch[0]).searchParams.get('token')
        if (token === null) {
          throw new Error("Doğrulama bağlantısında 'token' sorgu parametresi bulunamadı")
        }

        return token
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250)
    })
  }

  throw new Error(`Mailpit'te ${email} alıcısına gönderilmiş mesaj bulunamadı`)
}

interface FixtureUser {
  readonly email: string
  readonly password: string
}

async function createVerifiedFixtureUser(
  request: APIRequestContext,
  emailPrefix: string,
): Promise<FixtureUser> {
  const email = `${emailPrefix}-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}@arkesoft.test`
  const password = FIXTURE_PASSWORD

  const signUpResponse = await request.post('/auth/sign-up/email', {
    data: { name: 'QA MED-2 Kullanıcısı', email, password },
  })
  expect(signUpResponse.ok()).toBe(true)

  const token = await findVerificationToken(email)
  const verifyResponse = await request.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
  expect(verifyResponse.ok()).toBe(true)

  return { email, password }
}

// ---------------------------------------------------------------------------
// TOTP — RFC 4226/6238, `totp-code-generator.port.ts` ile BİREBİR aynı
// algoritma (dosya başı notuna bkz.). `digits`/`period` bu dosyada sabit
// (6/30, Better Auth varsayılanı) — zaman kayması parametresi GEREKMİYOR
// (bu test "şimdi" için geçerli kod üretir, yakın-ışka senaryosu değil).
// ---------------------------------------------------------------------------
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const BASE32_DECODE_MAP: ReadonlyMap<string, number> = new Map(
  BASE32_ALPHABET.split('').map((char, index) => [char, index]),
)

function decodeBase32(input: string): Uint8Array {
  const normalized = input.toUpperCase().replaceAll(/[\s-]/g, '').replaceAll('=', '')
  const bytes: number[] = []
  let buffer = 0
  let bitsCollected = 0

  for (const char of normalized) {
    const value = BASE32_DECODE_MAP.get(char)
    if (value === undefined) {
      throw new Error(`geçersiz Base32 karakteri: ${char}`)
    }
    buffer = (buffer << 5) | value
    bitsCollected += 5
    if (bitsCollected >= 8) {
      bitsCollected -= 8
      bytes.push((buffer >> bitsCollected) & 0xff)
    }
  }

  return Uint8Array.from(bytes)
}

function readByte(bytes: Uint8Array, index: number): number {
  const value = bytes[index]
  if (value === undefined) {
    throw new Error(`dijest beklenenden kısa (index ${String(index)})`)
  }
  return value
}

function generateTotpCodeNow(base32Secret: string): string {
  const digits = 6
  const period = 30
  const keyBytes = decodeBase32(base32Secret)
  const counter = BigInt(Math.floor(Date.now() / 1000 / period))

  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(counter)
  const digest = createHmac('sha1', Buffer.from(keyBytes)).update(counterBuffer).digest()

  const offset = readByte(digest, digest.length - 1) & 0x0f
  const truncated =
    ((readByte(digest, offset) & 0x7f) << 24) |
    ((readByte(digest, offset + 1) & 0xff) << 16) |
    ((readByte(digest, offset + 2) & 0xff) << 8) |
    (readByte(digest, offset + 3) & 0xff)

  return (truncated % 10 ** digits).toString().padStart(digits, '0')
}

const enableTwoFactorBodySchema = z.object({
  totpURI: z.string(),
})

/** `otpauth://totp/...?secret=XXXX&issuer=...` — `extractQueryParam`'ın AYNI tekniği (apps/api'nin mailpit-client.ts'i). */
function extractSecretFromTotpUri(totpURI: string): string {
  const parsed = new URL(totpURI)
  const secret = parsed.searchParams.get('secret')
  if (secret === null) {
    throw new Error(`totpURI içinde 'secret' sorgu parametresi bulunamadı: ${totpURI}`)
  }
  return secret
}

test.describe.serial('Diyalog iptali odağı tetikleyiciye döndürür (qa tur 2, solid MED-2)', () => {
  // -------------------------------------------------------------------------
  // (1) ActiveSessionsCard — `panel-flow.spec.ts:256-282`'nin AYNI deseni,
  // oturum kartının tekil "Sonlandır" diyaloğuna uygulanmış.
  // -------------------------------------------------------------------------
  test('Aktif oturumlar kartında Escape/Vazgeç/Kapat diyaloğu kapatır ve odağı "Sonlandır" tetikleyicisine geri verir', async ({
    playwright,
    browser,
    baseURL,
  }) => {
    if (baseURL === undefined) {
      throw new Error('playwright.config.ts içinde use.baseURL tanımlı değil')
    }

    // İKİNCİ bir aktif oturum üretmek için AYRI bir `APIRequestContext`
    // (farklı çerez kavanozu) — AYNI kullanıcı, AYNI parola, İKİ FARKLI
    // `sign-in/email` çağrısı (bu test için AC18 payı: 2 sign-in).
    const primaryRequest = await playwright.request.newContext({ baseURL })
    const { email, password } = await createVerifiedFixtureUser(primaryRequest, 'med2-sessions')

    const primarySignIn = await primaryRequest.post('/auth/sign-in/email', {
      data: { email, password },
    })
    expect(primarySignIn.ok()).toBe(true)
    const currentSessionStorageState = await primaryRequest.storageState()
    await primaryRequest.dispose()

    const secondaryRequest = await playwright.request.newContext({ baseURL })
    const secondarySignIn = await secondaryRequest.post('/auth/sign-in/email', {
      data: { email, password },
    })
    expect(secondarySignIn.ok()).toBe(true)
    await secondaryRequest.dispose()

    const context = await browser.newContext({ storageState: currentSessionStorageState })
    const page = await context.newPage()
    await page.goto('/hesap/guvenlik')

    // İki oturum VAR — satırın "Sonlandır" butonu yalnızca `isCurrent ===
    // false` olan (ikinci) satırda render edilir. Erişilebilir ad
    // `resolveTerminateAccessibleName`'den gelir ("{cihaz} oturumunu
    // sonlandır (IP {ip}, son görülme {süre})") — cihaz/IP/süre'ye BAĞIMLI
    // OLMAYAN ortak alt dizeyle eşleştiriliyor.
    const terminateTrigger = page.getByRole('button', { name: /oturumunu sonlandır/ })
    await expect(terminateTrigger).toBeVisible()

    const dialog = page.getByRole('dialog')
    const cancelButton = page.getByRole('button', { name: 'Vazgeç', exact: true })
    const closeIconButton = page.getByRole('button', { name: 'Kapat', exact: true })

    // --- Escape ---
    await terminateTrigger.click()
    await expect(dialog).toBeVisible()
    await expect(cancelButton).toBeVisible()
    await expect(closeIconButton).toBeVisible()
    // wcag FIX turu 1/W-2'nin düzeltmesi — × ikonu ARTIK "Vazgeç" adını
    // PAYLAŞMIYOR (eski hata: `aria-label={cancelLabel}`).
    expect(await page.locator('button[aria-label="Vazgeç"]').count()).toBe(0)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(terminateTrigger).toBeFocused()

    // --- "Vazgeç" tıklaması ---
    await terminateTrigger.click()
    await expect(dialog).toBeVisible()
    await cancelButton.click()
    await expect(dialog).toBeHidden()
    await expect(terminateTrigger).toBeFocused()

    // --- × "Kapat" ikonu tıklaması ---
    await terminateTrigger.click()
    await expect(dialog).toBeVisible()
    await closeIconButton.click()
    await expect(dialog).toBeHidden()
    await expect(terminateTrigger).toBeFocused()

    await context.close()
  })

  // -------------------------------------------------------------------------
  // (2) TwoFactorStatusCard — AYNI desen, "Devre dışı bırak" diyaloğuna
  // uygulanmış. 2FA API seviyesinde kuruluyor (dosya başı notu).
  // -------------------------------------------------------------------------
  test('2FA kartında Escape/Vazgeç/Kapat diyaloğu kapatır ve odağı "Devre dışı bırak" tetikleyicisine geri verir', async ({
    playwright,
    browser,
    baseURL,
  }) => {
    if (baseURL === undefined) {
      throw new Error('playwright.config.ts içinde use.baseURL tanımlı değil')
    }

    const requestContext = await playwright.request.newContext({ baseURL })
    const { email, password } = await createVerifiedFixtureUser(requestContext, 'med2-2fa')

    const signInResponse = await requestContext.post('/auth/sign-in/email', {
      data: { email, password },
    })
    expect(signInResponse.ok()).toBe(true)

    // `enable` → gerçek TOTP kodu üret → `verify-totp` — apps/api'nin
    // `two-factor-acceptance-ac1-setup-flow.test.ts`'inin BİREBİR aynı sırası.
    // Better Auth'un KENDİ yerleşik `Origin` denetimi (oturum çerezi VARKEN
    // `Origin` eksikse `403 MISSING_OR_NULL_ORIGIN` — ÖLÇÜLDÜ): `sign-in`
    // çerezsiz olduğu için bu denetime GİRMİYOR, bu uç GİRİYOR — tarayıcının
    // KENDİSİ her zaman eklediği başlık, test istemcisi (`APIRequestContext`)
    // İÇİN AÇIKÇA EKLENİYOR (K1'in "sessiz 403 tuzağı"nın BİR TÜRÜ daha).
    const enableResponse = await requestContext.post('/auth/two-factor/enable', {
      headers: { Origin: baseURL },
      data: { password, method: 'totp' },
    })
    expect(enableResponse.ok()).toBe(true)
    const enableBody: unknown = await enableResponse.json()
    const { totpURI } = enableTwoFactorBodySchema.parse(enableBody)
    const code = generateTotpCodeNow(extractSecretFromTotpUri(totpURI))

    const verifyResponse = await requestContext.post('/auth/two-factor/verify-totp', {
      headers: { Origin: baseURL },
      data: { code },
    })
    expect(verifyResponse.ok()).toBe(true)

    const storageState = await requestContext.storageState()
    await requestContext.dispose()

    const context = await browser.newContext({ storageState })
    const page = await context.newPage()
    await page.goto('/hesap/guvenlik')

    const disableTrigger = page.getByRole('button', { name: 'Devre dışı bırak', exact: true })
    await expect(disableTrigger).toBeVisible()

    const dialog = page.getByRole('dialog')
    const cancelButton = page.getByRole('button', { name: 'Vazgeç', exact: true })
    const closeIconButton = page.getByRole('button', { name: 'Kapat', exact: true })

    // --- Escape ---
    await disableTrigger.click()
    await expect(dialog).toBeVisible()
    await expect(cancelButton).toBeVisible()
    await expect(closeIconButton).toBeVisible()
    expect(await page.locator('button[aria-label="Vazgeç"]').count()).toBe(0)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(disableTrigger).toBeFocused()

    // --- "Vazgeç" tıklaması ---
    await disableTrigger.click()
    await expect(dialog).toBeVisible()
    await cancelButton.click()
    await expect(dialog).toBeHidden()
    await expect(disableTrigger).toBeFocused()

    // --- × "Kapat" ikonu tıklaması ---
    await disableTrigger.click()
    await expect(dialog).toBeVisible()
    await closeIconButton.click()
    await expect(dialog).toBeHidden()
    await expect(disableTrigger).toBeFocused()

    await context.close()
  })
})

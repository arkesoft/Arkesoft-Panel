// @arkesoft/admin — ORTAK fixture yardımcısı: e-posta doğrulanmış kullanıcı
// (ROADMAP v0.1.0, T-019/S11, po R-PO10 — bağlayıcı)
//
// ⚠⚠ ÜÇÜNCÜ KOPYA, REFAKTÖR DEĞİL (po'nun kararı, bağlayıcı): bu fonksiyon
// bugün `panel-flow.spec.ts:120-134` ve `session-security-dialog-focus.qa.
// spec.ts:144-161`'de BİREBİR (küçük farkla — ikincisi bir `emailPrefix`
// parametresi alıyor) iki kez yazılı. Bu dosya o iki kopyayı REFAKTÖR ETMEZ
// (AGENT_BASELINE §5 "başka ajanın dosyasını değiştirme" + CLAUDE.md §10 md
// 13 "yolum üstündeydi" refactor'u yasak + ikisi de `qa`'nın metin
// pinlerini taşıyor) — yalnızca BUNDAN SONRAKİ yeni spec dosyalarının (bu
// görevde: `registration-flow.spec.ts`) kullanacağı ORTAK bir üçüncü nokta
// kurar. Sonuç bilerek "2 eski kopya + 1 ortak yardımcı" — borç satırı
// `docs`'a (S13) yazılacak.
//
// Mailpit yardımcıları (`findVerificationToken` + tipler) AYNI gerekçeyle
// BİREBİR kopya — `panel-flow.spec.ts`/`session-security-dialog-focus.qa.
// spec.ts`'in ikisi de bunu dışa AÇMIYOR, bu dosya onlardan İTHAL EDEMEZ.
//
// Kayıt (sign-up) YAPAR, GİRİŞ (sign-in) YAPMAZ (panel-flow.spec.ts'in AYNI
// disiplini) — çağıran taraf kendi `sign-in/email` çağrısını (AC18 bütçesine
// sayılan) kendisi yapar, bu fonksiyon bütçeye YALNIZCA bir `sign-up` olarak
// girer.
import { expect, type APIRequestContext } from '@playwright/test'

const FIXTURE_PASSWORD = 'arkesoft-e2e-registration-fixture-password-123'
const MAILPIT_BASE_URL = 'http://127.0.0.1:8025'

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

/**
 * Mailpit'ten (`infra/docker-compose.yml`'in açtığı `:8025`) belirli bir
 * alıcıya gönderilmiş e-postadaki doğrulama bağlantısının `token` sorgu
 * parametresini okur. "Token üretildi" varsayımıyla sessizce boş DÖNMEZ —
 * bulunamazsa throw eder (`panel-flow.spec.ts`'in AYNI disiplini).
 */
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

export interface FixtureUser {
  readonly email: string
  readonly password: string
}

/**
 * Kayıt → Mailpit'ten doğrulama bağlantısı → doğrulama. GİRİŞ (sign-in)
 * YAPMAZ — çağıran kendi `sign-in/email` çağrısını yapar (AC18 bütçesi
 * `panel-flow.spec.ts`'in dosya başı yorumuyla AYNI disiplin).
 */
export async function createVerifiedFixtureUser(
  request: APIRequestContext,
  emailPrefix = 'e2e-registration',
): Promise<FixtureUser> {
  const email = `${emailPrefix}-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}@arkesoft.test`
  const password = FIXTURE_PASSWORD

  const signUpResponse = await request.post('/auth/sign-up/email', {
    data: { name: 'E2E Kayıt Kullanıcısı', email, password },
  })
  expect(signUpResponse.ok()).toBe(true)

  const token = await findVerificationToken(email)
  const verifyResponse = await request.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
  expect(verifyResponse.ok()).toBe(true)

  return { email, password }
}

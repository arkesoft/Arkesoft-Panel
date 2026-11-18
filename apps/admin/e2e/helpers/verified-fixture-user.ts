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
// Mailpit yardımcısı (`findVerificationToken`) ARTIK bu dosyada DEĞİL —
// `scripts/playwright/mailpit.ts`'TEN İTHAL EDİLİYOR (T-021/S10 FIX turu 1,
// dalga 2, `solid` M2 — bağlayıcı): bu, `panel-flow.spec.ts`/
// `session-security-dialog-focus.qa.spec.ts`/`apps/superadmin/e2e/fixtures/
// platform-admin.ts` ile BİREBİR aynı dördüncü kopyaydı. Önceki not
// ("apps/* → apps/* ithalatı YASAK, bu yüzden REFAKTÖR EDİLMEDİ") yalnızca
// "admin'den import edilemez"i kapatıyordu — `scripts/playwright/`'e taşımak
// o engeli AŞMIYOR, mimari sınırın DIŞINDA bir paylaşılan alana taşıyor
// (`sql.ts`/`totp.ts`'in AYNI deseni, `apps/*/e2e` → `scripts/playwright/`
// GÖRELİ import CLAUDE.md §3'ü ihlal ETMİYOR).
//
// Kayıt (sign-up) YAPAR, GİRİŞ (sign-in) YAPMAZ (panel-flow.spec.ts'in AYNI
// disiplini) — çağıran taraf kendi `sign-in/email` çağrısını (AC18 bütçesine
// sayılan) kendisi yapar, bu fonksiyon bütçeye YALNIZCA bir `sign-up` olarak
// girer.
import { expect, type APIRequestContext } from '@playwright/test'

import { findVerificationToken } from '../../../../scripts/playwright/mailpit.js'

const FIXTURE_PASSWORD = 'arkesoft-e2e-registration-fixture-password-123'

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

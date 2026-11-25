// @arkesoft/api — `qa` gate (T-028, tur 2) — EKSİK SENARYO testi.
//
// Handoff'un sorduğu soru: "`SENTRY_DSN` geçersiz biçimdeyse ne olur?"
// Bugüne kadar bu soruyu doğrudan ölçen hiçbir test YOK (`sentry-bootstrap-
// initializer.test.ts` yalnızca TANIMLI/TANIMSIZ ikiliğini test ediyor,
// `sentry-invariants.test.ts` her zaman GEÇERLİ bir sahte DSN kullanıyor).
//
// Cevap (bu testle PİNLENİR): `apiEnvSchema.SENTRY_DSN` `z.url().optional()`
// (`config/api-env.ts:246`) — biçimsiz bir değer `startSentry()`'ye HİÇ
// ULAŞMAZ, `parseEnv` AÇILIŞTA (env doğrulama katmanında) fırlatır. Yani
// davranış FAIL-CLOSED: uygulama BOZUK bir DSN'le SESSİZCE ayakta kalıp
// `Sentry.init`'i ATLAMAZ/yutmaz — hiç açılmaz. `DATABASE_AUTH_URL` emsali
// (`database-auth-url-fail-fast.test.ts`) ile AYNI desen.

import { EnvValidationError, parseEnv } from '@arkesoft/config/env'
import { describe, expect, it } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'

type EnvSource = Record<string, string | undefined>

/** `process.env`'in KOPYASI, `SENTRY_DSN` İSTENEN değerle EZİLMİŞ (mutasyonsuz). */
function envWithSentryDsn(value: string): EnvSource {
  return { ...process.env, SENTRY_DSN: value }
}

describe('apiEnvSchema — SENTRY_DSN biçimsizken FAIL-CLOSED (AC-58 bağlamı, handoff "eksik senaryo" sorusu)', () => {
  it('geçerli bir URL OLMAYAN bir değerle parseEnv(apiEnvSchema) EnvValidationError fırlatır — startSentry() ÇAĞRILAMAZ bile', () => {
    const source = envWithSentryDsn('not-a-valid-dsn-at-all')

    expect(() => parseEnv(apiEnvSchema, source)).toThrow(EnvValidationError)
  })

  it('hata metni DEĞİŞKEN ADINI içerir — "boş kanıt" ama ÖLÇÜLEBİLİR', () => {
    const source = envWithSentryDsn('not-a-valid-dsn-at-all')

    expect(() => parseEnv(apiEnvSchema, source)).toThrow(/SENTRY_DSN/)
  })

  it('TANIMSIZKEN (operatör hiç ayarlamamış) parseEnv BAŞARILI olur — SENTRY_DSN gerçekten OPSİYONEL (AC-57 ön koşulu)', () => {
    const { SENTRY_DSN: _omitted, ...rest } = process.env

    expect(() => parseEnv(apiEnvSchema, rest)).not.toThrow()
  })

  it('GEÇERLİ bir URL biçimiyle (gerçek olmayan host) parseEnv BAŞARILI olur — biçim kontrolü sahte-pozitif ÜRETMİYOR', () => {
    const source = envWithSentryDsn('https://fakepublickey@o0.ingest.sentry.invalid/0')

    expect(() => parseEnv(apiEnvSchema, source)).not.toThrow()
  })
})

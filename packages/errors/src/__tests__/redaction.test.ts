// @arkesoft/errors — redaction birim testleri (ROADMAP v0.0.4, T-002/ST-3b, architect K-A7)
//
// EKLEME (ROADMAP v0.0.15, T-016/S8): sentinel probu — `apps/api`'nin
// `root-logger.ts`'inin KURDUĞU `redact: { paths: [...PINO_REDACT_PATHS],
// censor: '[redacted]' }` şeklini BİREBİR izleyen GERÇEK bir pino örneği
// kurar (bellek `Writable`, `auth-secret-leak.test.ts`'in deseniyle AYNI) ve
// NDJSON çıktısını ölçer. Yalnızca dizi üyeliğini (`toContain`) değil,
// pino'nun BU yolları GERÇEKTEN redakte ettiğini kanıtlar.

import { Writable } from 'node:stream'

import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { maskEmail, PINO_REDACT_PATHS } from '../redaction.js'

const SENTINEL = 'X-SENTINEL-9f3a'

/** `auth-secret-leak.test.ts`'in AYNI yardımcısı — bilerek yerel kopya. */
function createMemoryLogStream(): {
  readonly stream: Writable
  readonly getFullText: () => string
} {
  const chunks: Buffer[] = []

  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })

  return { stream, getFullText: () => Buffer.concat(chunks).toString('utf-8') }
}

/**
 * `apps/api`'nin `root-logger.ts`'indeki pino yapılandırmasıyla BİREBİR
 * (`redact.paths` + `censor: '[redacted]'`) — kök logger'ı burada yeniden
 * inşa etmiyoruz, yalnızca `PINO_REDACT_PATHS`'in pino'ya VERİLDİĞİNDE
 * gerçekten ne yaptığını ölçüyoruz.
 */
function createProbeLogger(stream: Writable): pino.Logger {
  return pino(
    {
      redact: { paths: [...PINO_REDACT_PATHS], censor: '[redacted]' },
    },
    stream,
  )
}

describe('maskEmail', () => {
  it('standart bir e-postayı maskeler', () => {
    expect(maskEmail('ahmet@example.com')).toBe('a***@example.com')
  })

  it.each([
    ['boş dize', ''],
    ['@ yok', 'ahmetexamplecom'],
    ['birden çok @', 'ahmet@example@com'],
    ['yerel kısım boş (@ ile başlıyor)', '@example.com'],
    ['alan adı boş (@ ile bitiyor)', 'ahmet@'],
    ['yalnızca @', '@'],
  ])('%s → tamamen maskelenir', (_label, value) => {
    expect(maskEmail(value)).toBe('***')
  })

  it('yerel kısım tek karakter olsa da ilk karakteri korur, gerisini maskeler', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com')
  })

  it('hiçbir kenar durumda ham e-postayı geri döndürmez', () => {
    const inputs = [
      'ahmet@example.com',
      'ahmetexamplecom',
      'ahmet@example@com',
      '@example.com',
      'ahmet@',
      'a@example.com',
    ]

    for (const input of inputs) {
      expect(maskEmail(input)).not.toBe(input)
    }
  })
})

describe('PINO_REDACT_PATHS', () => {
  it('cookie, authorization ve set-cookie içerir', () => {
    expect(PINO_REDACT_PATHS).toContain('cookie')
    expect(PINO_REDACT_PATHS).toContain('authorization')
    expect(PINO_REDACT_PATHS).toContain('set-cookie')
  })

  it('sır alanlarını (password, token, apiKey, secret) içerir', () => {
    expect(PINO_REDACT_PATHS).toContain('password')
    expect(PINO_REDACT_PATHS).toContain('token')
    expect(PINO_REDACT_PATHS).toContain('apiKey')
    expect(PINO_REDACT_PATHS).toContain('secret')
  })

  it('req/res başlık karşılıklarını içerir', () => {
    expect(PINO_REDACT_PATHS).toContain('req.headers.cookie')
    expect(PINO_REDACT_PATHS).toContain('req.headers.authorization')
    expect(PINO_REDACT_PATHS).toContain('res.headers.cookie')
  })

  // ROADMAP v0.0.5, T-006/S3, architect "LOG DESENİ" — Better Auth'un sır
  // taşıyan altı alanı (CLAUDE.md §4/§10.7: şifre, token, oturum kimliği
  // asla loglanmaz).
  it('Better Auth sır alanlarını (sessionToken/verificationToken/resetToken/passwordHash) içerir', () => {
    expect(PINO_REDACT_PATHS).toContain('sessionToken')
    expect(PINO_REDACT_PATHS).toContain('verificationToken')
    expect(PINO_REDACT_PATHS).toContain('resetToken')
    expect(PINO_REDACT_PATHS).toContain('passwordHash')
  })

  it('Better Auth sır alanlarının joker ön ekli (*.sessionToken/*.passwordHash) karşılıklarını içerir', () => {
    expect(PINO_REDACT_PATHS).toContain('*.sessionToken')
    expect(PINO_REDACT_PATHS).toContain('*.passwordHash')
  })

  it("'*.value' İÇERMEZ (architect kararı — fazla geniş joker, meşru alanları siler)", () => {
    expect(PINO_REDACT_PATHS).not.toContain('*.value')
  })

  // ROADMAP v0.0.15, T-016/S8, architect K-A3 — TOTP sırrı/URI'si ve yedek
  // kodlar `enable`/`get-totp-uri` yanıtlarında KASTEN tele çıkar (kullanıcı
  // QR'ı/anahtarı görmek zorunda); bu, LOGLANMAMALARI gerektiği gerçeğini
  // DEĞİŞTİRMEZ.
  it('totpURI ve backupCodes içerir (TOTP sırrının/yedek kodun KENDİSİ — T-016/S8)', () => {
    expect(PINO_REDACT_PATHS).toContain('totpURI')
    expect(PINO_REDACT_PATHS).toContain('backupCodes')
  })

  it("iç içe sır alanı için joker '*.secret' içerir (düz 'secret' yalnızca KÖK seviyeyi kapsar)", () => {
    expect(PINO_REDACT_PATHS).toContain('*.secret')
  })

  // ⛔ architect'in BAĞLAYICI kararı: `'code'` ASLA eklenmez — `AppError.code`
  // bu projenin teşhis omurgası (`INVALID_CODE`, `ACCOUNT_TEMPORARILY_LOCKED`
  // gibi SIR OLMAYAN kararlı makine kodları). `'code'` eklenirse bu alan HER
  // YERDE redakte olur ve teşhis ölür. Bu assert, gelecekte biri `'code'`'u
  // eklemeye kalkarsa KIRMIZI olsun diye var.
  it("'code' İÇERMEZ (architect kararı, bağlayıcı — AppError.code teşhis alanı, sır DEĞİL)", () => {
    expect(PINO_REDACT_PATHS).not.toContain('code')
  })
})

describe('PINO_REDACT_PATHS — sentinel probu (gerçek pino örneği, T-016/S8)', () => {
  it('totpURI, backupCodes ve iç içe *.secret sentinel değerini redakte eder; zararsız alan ETKİLENMEZ (pozitif kontrol)', async () => {
    const { stream, getFullText } = createMemoryLogStream()
    const logger = createProbeLogger(stream)

    logger.info({ totpURI: `otpauth://totp/X-SENTINEL-9f3a?secret=${SENTINEL}` }, 'prob')
    logger.info({ backupCodes: [SENTINEL] }, 'prob')
    logger.info({ twoFactor: { secret: SENTINEL } }, 'prob')
    // Pozitif kontrol — redakte EDİLMEYEN bir alana AYNI sentinel: yakalamanın
    // gerçekten çalıştığını (log'un gerçekten yazıldığını) kanıtlar. Bu
    // olmadan "0 eşleşme" sonucu hiçbir şey ispatlamaz (T-015 QA-3 sınıfı).
    logger.info({ harmlessField: SENTINEL }, 'prob')

    await new Promise<void>((resolve) => stream.end(resolve))

    const fullLogText = getFullText()

    // Pozitif kontrol — ölçüm zinciri GERÇEKTEN çalışıyor; sentinel zararsız
    // alanda GÖRÜNÜYOR.
    expect(fullLogText).toContain(`"harmlessField":"${SENTINEL}"`)

    // Redakte edilen üç yolun ham sentinel'i TAŞIMADIĞI — tek tek, satır
    // satır (hangi yolun kırılırsa testi kırdığını ayırt edilebilir kılmak
    // için).
    const lines = fullLogText
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
    expect(lines).toHaveLength(4)

    const [totpLine, backupCodesLine, nestedSecretLine, harmlessLine] = lines
    if (
      totpLine === undefined ||
      backupCodesLine === undefined ||
      nestedSecretLine === undefined ||
      harmlessLine === undefined
    ) {
      throw new Error('beklenen dört NDJSON satırı yok — assert vakumla sonuçlanırdı')
    }

    const probeLineSchema = z.looseObject({
      totpURI: z.string().optional(),
      backupCodes: z.string().optional(),
      twoFactor: z.looseObject({ secret: z.string() }).optional(),
      harmlessField: z.string().optional(),
    })

    expect(probeLineSchema.parse(JSON.parse(totpLine) as unknown).totpURI).toBe('[redacted]')
    expect(probeLineSchema.parse(JSON.parse(backupCodesLine) as unknown).backupCodes).toBe(
      '[redacted]',
    )
    expect(probeLineSchema.parse(JSON.parse(nestedSecretLine) as unknown).twoFactor?.secret).toBe(
      '[redacted]',
    )
    expect(probeLineSchema.parse(JSON.parse(harmlessLine) as unknown).harmlessField).toBe(SENTINEL)

    // Ham sentinel dizesi, redakte edilmiş satırların HİÇBİRİNDE görünmez —
    // yalnızca zararsız satırda görünür (tam olarak bir kez: `harmlessField`
    // değeri olarak).
    const occurrences = fullLogText.split(SENTINEL).length - 1
    expect(occurrences).toBe(1)
  })
})

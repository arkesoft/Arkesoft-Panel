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

import { maskEmail, PINO_REDACT_PATHS, redactDeep, SECRET_FIELD_NAMES } from '../redaction.js'

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

  // ROADMAP v0.0.15.1, T-017/S6, kullanıcı kararı 2026-11-09 — İKİNCİL
  // savunma (BİRİNCİL: hiçbir kod yolu bu değeri bir log çağrısına geçirmez).
  it("'ipAddress' ve '*.ipAddress' içerir (T-017/S6 — IKİNCİL savunma)", () => {
    expect(PINO_REDACT_PATHS).toContain('ipAddress')
    expect(PINO_REDACT_PATHS).toContain('*.ipAddress')
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

  // ROADMAP v0.0.15.1, T-017/S6 — `ipAddress`/`*.ipAddress` İKİNCİL savunma
  // kanıtı. AYNI yöntem: kök + iç içe alan, bir pozitif kontrol (zararsız
  // alan ETKİLENMEZ).
  it('ipAddress (kök) ve *.ipAddress (iç içe) sentinel değerini redakte eder; zararsız alan ETKİLENMEZ (pozitif kontrol)', async () => {
    const { stream, getFullText } = createMemoryLogStream()
    const logger = createProbeLogger(stream)

    logger.info({ ipAddress: SENTINEL }, 'prob')
    logger.info({ client: { ipAddress: SENTINEL } }, 'prob')
    logger.info({ harmlessField: SENTINEL }, 'prob')

    await new Promise<void>((resolve) => stream.end(resolve))

    const fullLogText = getFullText()

    expect(fullLogText).toContain(`"harmlessField":"${SENTINEL}"`)

    const lines = fullLogText
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
    expect(lines).toHaveLength(3)

    const [rootIpLine, nestedIpLine, harmlessLine] = lines
    if (rootIpLine === undefined || nestedIpLine === undefined || harmlessLine === undefined) {
      throw new Error('beklenen üç NDJSON satırı yok — assert vakumla sonuçlanırdı')
    }

    const probeLineSchema = z.looseObject({
      ipAddress: z.string().optional(),
      client: z.looseObject({ ipAddress: z.string() }).optional(),
      harmlessField: z.string().optional(),
    })

    expect(probeLineSchema.parse(JSON.parse(rootIpLine) as unknown).ipAddress).toBe('[redacted]')
    expect(probeLineSchema.parse(JSON.parse(nestedIpLine) as unknown).client?.ipAddress).toBe(
      '[redacted]',
    )
    expect(probeLineSchema.parse(JSON.parse(harmlessLine) as unknown).harmlessField).toBe(SENTINEL)

    // Ham sentinel dizesi redakte edilmiş satırların HİÇBİRİNDE görünmez —
    // yalnızca zararsız satırda (tam olarak bir kez).
    const occurrences = fullLogText.split(SENTINEL).length - 1
    expect(occurrences).toBe(1)
  })
})

// ROADMAP v0.0.17, T-028/S3, architect K-A28-5 — AC-63: `PINO_REDACT_PATHS`
// artık `SECRET_FIELD_NAMES`'ten TÜRETİLİYOR (elle bakımlanan ikinci bir liste
// DEĞİL). Bu süit, türetimin T-016/T-017 sonrasında elle bakımlanan 28
// girdilik listenin (po'nun R-PO1 ölçümü — architect'in "29" iddiası YANLIŞTI)
// TAMAMINI (süperküme olarak) kapsadığını doğrular.
//
// ⚠⚠ `po`'nun dersi: pin SAYIYA değil `PINO_REDACT_PATHS.length`'e dayanmalı
// (borç :3942'nin "sayıyı kopyalama, kaynağa atıf ver" dersinin yenisi). Bu
// yüzden aşağıda `28` gibi sabit bir sayı YOK — karşılaştırma iki DİZİNİN
// (bu testteki tarihî anlık görüntü ile bugünkü türetilmiş liste) birbirine
// göre `.length`'i ve üyelikleri üzerinden yapılıyor.
describe('PINO_REDACT_PATHS — AC-63: türetilen liste, refactor-öncesi listenin süperkümesi', () => {
  // Bu dizi, SECRET_FIELD_NAMES'e taşınmadan ÖNCE `redaction.ts`'te ELLE
  // bakımlanan son hâlin (T-017 sonrası) BİREBİR anlık görüntüsüdür —
  // regresyon pini bu yüzden TARİHÎ bir referansa ihtiyaç duyar; bu, S3'ün
  // kendisinin açtığı tek istisnai "ikinci liste"dir (geleceğe doğru
  // büyümez, yalnızca geçmişe doğru bir kıyas noktasıdır).
  const PRE_REFACTOR_SNAPSHOT: readonly string[] = [
    'cookie',
    'authorization',
    'set-cookie',
    'req.headers.cookie',
    'req.headers.authorization',
    'req.headers["set-cookie"]',
    'res.headers.cookie',
    'res.headers.authorization',
    'res.headers["set-cookie"]',
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'secret',
    '*.password',
    '*.token',
    'sessionToken',
    'verificationToken',
    'resetToken',
    'passwordHash',
    '*.sessionToken',
    '*.passwordHash',
    'totpURI',
    'backupCodes',
    '*.secret',
    'ipAddress',
    '*.ipAddress',
  ]

  it('türetilmiş liste refactor-öncesi anlık görüntünün HER girdisini içerir', () => {
    for (const path of PRE_REFACTOR_SNAPSHOT) {
      expect(PINO_REDACT_PATHS).toContain(path)
    }
  })

  it('türetilmiş listenin uzunluğu refactor-öncesi anlık görüntüden KISA DEĞİLDİR (süperküme)', () => {
    expect(PINO_REDACT_PATHS.length).toBeGreaterThanOrEqual(PRE_REFACTOR_SNAPSHOT.length)
  })

  it('her girdi SECRET_FIELD_NAMES kaynağından türetildiği için benzersizdir (tekrar yok)', () => {
    expect(new Set(PINO_REDACT_PATHS).size).toBe(PINO_REDACT_PATHS.length)
  })
})

// ROADMAP v0.0.17, T-028/S3, borç :3957/L-11 — AC-59: `redactDeep()` iki yönlü
// mutasyon kanıtı. `AppError.context` bu sürümde İLK KEZ süreç dışına
// (Sentry zarfı) taşındığı için bu fonksiyon zarf sınırındaki ÜÇÜNCÜ savunma
// katmanıdır.
describe('redactDeep — AC-59', () => {
  const DEEP_SENTINEL = 'X-DEEP-SENTINEL-4b7c'

  it('derinlik-3teki bir sır alanını düz metin olarak SIZDIRMAZ (pozitif kontrol dahil)', () => {
    const input = {
      level1: {
        level2: {
          level3: {
            password: DEEP_SENTINEL,
            harmlessField: DEEP_SENTINEL,
          },
        },
      },
    }

    const result = redactDeep(input)
    const serialized = JSON.stringify(result)

    // Pozitif kontrol — ölçüm zinciri GERÇEKTEN çalışıyor; sentinel zararsız
    // alanda hâlâ GÖRÜNÜYOR (yalnızca sır alanı redakte edildi, her şey
    // vakumla silinmedi).
    expect(serialized).toContain(`"harmlessField":"${DEEP_SENTINEL}"`)
    expect(serialized).toContain('"password":"[redacted]"')
    // Ham sentinel, redakte edilen alanın DEĞERİ olarak hiçbir yerde görünmez
    // (tam olarak bir kez — zararsız alanda).
    expect(serialized.split(DEEP_SENTINEL).length - 1).toBe(1)
  })

  it('kök seviyede de aynı adla eşleşen sır alanını redakte eder', () => {
    const result = redactDeep({ secret: DEEP_SENTINEL }) as Record<string, unknown>

    expect(result['secret']).toBe('[redacted]')
  })

  it('dizi içindeki nesnelerin iç içe sır alanlarını da redakte eder', () => {
    const result = redactDeep({
      items: [{ token: DEEP_SENTINEL }, { harmlessField: DEEP_SENTINEL }],
    }) as { items: Record<string, unknown>[] }

    expect(result.items[0]?.['token']).toBe('[redacted]')
    expect(result.items[1]?.['harmlessField']).toBe(DEEP_SENTINEL)
  })

  it('derinlik sınırını AŞAN bir nesnede fırlatmaz/takılmaz — kalan alt ağacı keser', () => {
    // 50 seviye iç içe — varsayılan derinlik sınırının (6) çok üzerinde.
    let deeplyNested: Record<string, unknown> = { password: DEEP_SENTINEL }
    for (let depth = 0; depth < 50; depth += 1) {
      deeplyNested = { nested: deeplyNested }
    }

    expect(() => redactDeep(deeplyNested)).not.toThrow()
    expect(JSON.stringify(redactDeep(deeplyNested))).not.toContain(DEEP_SENTINEL)
  })

  it('devirli (circular) bir nesnede fırlatmaz/takılmaz — sonsuz özyinelemeye GİRMEZ', () => {
    const circular: Record<string, unknown> = { password: DEEP_SENTINEL }
    circular['self'] = circular

    expect(() => redactDeep(circular)).not.toThrow()

    const result = redactDeep(circular) as Record<string, unknown>
    expect(result['password']).toBe('[redacted]')
    expect(result['self']).toBe('[circular]')
  })

  it('birincil tipleri (string/number/boolean/null/undefined) DEĞİŞTİRMEDEN döner', () => {
    expect(redactDeep('plain string')).toBe('plain string')
    expect(redactDeep(42)).toBe(42)
    expect(redactDeep(true)).toBe(true)
    expect(redactDeep(null)).toBe(null)
    expect(redactDeep(undefined)).toBe(undefined)
  })

  it('SECRET_FIELD_NAMES kümesindeki HER ad en az bir testte örtük olarak doğrulanır (tamlık hatırlatması)', () => {
    // Bu test, SECRET_FIELD_NAMES'in BOŞ KALMADIĞINI ve redactDeep'in onu
    // GERÇEKTEN okuduğunu (yukarıdaki testlerin vakumla geçmediğini) ayrıca
    // doğrular — küme büyüklüğü sıfırsa veya fonksiyon kümeyi hiç
    // kullanmıyorsa bu assert kırılır.
    expect(SECRET_FIELD_NAMES.size).toBeGreaterThan(0)
    const probe = Object.fromEntries([...SECRET_FIELD_NAMES].map((name) => [name, DEEP_SENTINEL]))
    const result = redactDeep(probe) as Record<string, unknown>

    for (const name of SECRET_FIELD_NAMES) {
      expect(result[name]).toBe('[redacted]')
    }
  })
})

// ROADMAP v0.0.17, T-028, düzeltme turu 1, `security` BULGU 4 — CLAUDE.md
// §4 hizalaması. Her ad, S3'te eklenmeden ÖNCE bu testler KIRMIZI döndü
// (küme girdisi geçici olarak silinip doğrulandı, sonra `Edit` ile geri
// alındı — boşa-çıkmama kanıtı handoff raporunda).
describe('redactDeep — BULGU 4(b): CLAUDE.md §4 hizalaması (yeni sır alanları)', () => {
  const ALIGNMENT_SENTINEL = 'X-CLAUDE-SEC4-SENTINEL-9c1d'

  it.each([
    ['cardNumber', 'kart numarası'],
    ['pan', 'kart numarası (PAN)'],
    ['cvv', 'kartın güvenlik kodu'],
    ['cvc', 'kartın güvenlik kodu (CVC yazımı)'],
    ['tckn', 'TCKN'],
    ['nationalId', 'TCKN (İngilizce alan adı)'],
    ['address', 'tam adres'],
    ['email', 'tam e-posta'],
    ['clientSecret', 'OAuth istemci sırrı'],
    ['jwt', 'JSON Web Token'],
    ['otp', 'tek kullanımlık şifre'],
  ])('%s (%s) redakte edilir, zararsız alan ETKİLENMEZ', (fieldName) => {
    const result = redactDeep({
      [fieldName]: ALIGNMENT_SENTINEL,
      harmlessField: ALIGNMENT_SENTINEL,
    }) as Record<string, unknown>

    expect(result[fieldName]).toBe('[redacted]')
    expect(result['harmlessField']).toBe(ALIGNMENT_SENTINEL)
  })
})

// ROADMAP v0.0.17, T-028, düzeltme turu 1, `security` BULGU 4(a) — anahtar
// normalizasyonu SADECE redactDeep'in ARAMA tarafında (`toLowerCase()` +
// `-`/`_` kaldırma). Normalizasyon EKLENMEDEN ÖNCE bu testler KIRMIZI
// döndü (normalizasyon çağrısı geçici olarak `SECRET_FIELD_NAMES.has(key)`
// ile DEĞİŞTİRİLİP doğrulandı, sonra `Edit` ile geri alındı).
describe('redactDeep — BULGU 4(a): anahtar normalizasyonu (harfe/yazıma duyarsız)', () => {
  const CASE_SENTINEL = 'X-CASE-SENTINEL-1a2b'

  it.each([
    ['Authorization', 'büyük başlık biçimi'],
    ['API_KEY', 'alt çizgili BÜYÜK biçim'],
    ['api-key', 'tire ayraçlı biçim'],
    ['apiKey', 'kanonik camelCase biçim (regresyon)'],
    ['CLIENT_SECRET', 'clientSecret alt çizgili BÜYÜK biçim'],
  ])('%s (%s) redakte edilir', (variantKey) => {
    const result = redactDeep({ [variantKey]: CASE_SENTINEL }) as Record<string, unknown>
    expect(result[variantKey]).toBe('[redacted]')
  })
})

// ROADMAP v0.0.17, T-028, düzeltme turu 1, `security` BULGU 4 kısıt 3 —
// yanlış pozitif KONTROLÜ: normalizasyon/yeni adlar `'value'`/`'code'`
// dışlamalarını BOZMAZ. Bu, (a) ve (b)'nin dışlamaları BOZMADIĞININ kanıtı.
describe('redactDeep — BULGU 4 kısıt 3: yanlış pozitif KONTROLÜ (value/code redakte EDİLMEZ)', () => {
  it("'value' alanı redakte EDİLMEZ (architect dışlaması — redactDeep'te de geçerli)", () => {
    const result = redactDeep({ value: 'ham-belirtec-degeri' }) as Record<string, unknown>
    expect(result['value']).toBe('ham-belirtec-degeri')
  })

  it("'code' alanı redakte EDİLMEZ (architect dışlaması — AppError.code teşhis alanı)", () => {
    const result = redactDeep({ code: 'ACCOUNT_TEMPORARILY_LOCKED' }) as Record<string, unknown>
    expect(result['code']).toBe('ACCOUNT_TEMPORARILY_LOCKED')
  })

  it("'VALUE'/'Code' gibi yazım varyantları da redakte EDİLMEZ (normalizasyon dışlamaları BOZMADI)", () => {
    const result = redactDeep({ VALUE: 'ham-deger', Code: 'INVALID_CODE' }) as Record<
      string,
      unknown
    >
    expect(result['VALUE']).toBe('ham-deger')
    expect(result['Code']).toBe('INVALID_CODE')
  })
})

// ROADMAP v0.0.17, T-028, düzeltme turu 1, `security` BULGU 4 kısıt 4 —
// normalizasyon YALNIZCA redactDeep ARAMA tarafındadır; `PINO_REDACT_PATHS`
// pino'nun KENDİ sözleşmesi gereği HARFE DUYARLIDIR ve buraya normalizasyon
// UYGULANAMAZ (bilinen, belgelenmiş sınır — birincil savunma
// `RequestLoggingInterceptor`'ın başlıkları hiç OKUMAMASIdır).
describe('PINO_REDACT_PATHS — BULGU 4 kısıt 4: normalizasyon UYGULANMAZ (pino harfe duyarlı)', () => {
  it("yalnızca kanonik (küçük harf) yazım listede bulunur — 'Authorization'/'API_KEY' YOKTUR", () => {
    expect(PINO_REDACT_PATHS).toContain('authorization')
    expect(PINO_REDACT_PATHS).not.toContain('Authorization')
    expect(PINO_REDACT_PATHS).not.toContain('API_KEY')
  })
})

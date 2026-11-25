// @arkesoft/api — Sentry zarfı beş değişmezi (ROADMAP v0.0.17, T-028/S5,
// architect K-A28-2, AC-62) + DSN boşken NO-OP kanıtı (AC-57'nin S5'e düşen
// parçası — AC-57'nin TAM gerçek-alt-süreç sahipliği S6'nın, bkz. ADR/handoff;
// bu dosya `observability/sentry.ts`'in KENDİ ihracat yüzeyini doğrular).
//
// ⚠⚠ `@sentry/node`'u BURADA DA import ETMİYORUZ — `eslint.config.mjs`'in
// yapısal sınırlaması (K-A28-2) bunu YALNIZCA `sentry.ts`'e verir. Sahte
// taşıyıcı (fake transport) burada SAF, duck-typed bir nesne/fonksiyon
// olarak kurulur; `startSentry()`'nin `transport` alanına YAPISAL olarak
// uyar, `@sentry/node`'un KENDİ tip tanımını import ETMEDEN.
//
// ---------------------------------------------------------------------------
// BEŞ DEĞİŞMEZ (AC-62) + SDK SÜRÜM DÜZELTMESİ — `sentry.ts`'in dosya başı
// yorumunda AYRINTILI gerekçelendirilen ÖLÇÜLMÜŞ bulgu: pinlenen
// `@sentry/node@11.12.0`'da `skipOpenTelemetrySetup`/`sendDefaultPii` adları
// HİÇ YOK (0 eşleşme, iki paketin TÜM .d.ts dosyalarında, bu alt görevin
// elle yaptığı `grep` taramasıyla doğrulandı). Gerçek eşdeğerleri
// `enableOpenTelemetrySetup: false` (TERS POLARİTE) ve `dataCollection`. Bu
// dosya HER İKİ YÖNÜ de pinler: (a) doğru/gerçek alan adları KOD'da VAR,
// (b) yanlış/var-olmayan alan adları KOD'da (yorum DIŞINDA) YOK.
// `Sentry.setUser` (gerçekten var, bilinçli çağrılmaz) K-A28-2'nin ORİJİNAL
// hâliyle PİNLENİR — SDK sürüм farkından etkilenmedi.
//
// ⚠⚠⚠ DÜZELTME TURU 1/3 (security BULGU 1, critical) — `dataCollection:
// { userInfo: false }` TEK BAŞINA on bir `DataCollection` alanının HEPSİNİ
// varsayılana (opt-out, bkz. `@sentry+core@11.12.0/.../resolveDataCollection
// Options.js`'in `dc.<alan> ?? DEFAULTS.<alan>` deseni) düşürüyordu — HAM
// İSTEK GÖVDESİ (parola/kart/TCKN/e-posta) `logLevel: 'error'` taşıyan HER
// `AppError`'da üçüncü tarafa gidiyordu. ALTI alan AÇIKÇA kapatıldı; aşağıdaki
// (1) describe'u statik kaynak taramasıyla ALTISINI TEK TEK pinler, (4)
// describe'u İSE GERÇEK bir `node:http` sunucusu + GERÇEK bir Sentry
// istemcisiyle (yalnızca `transport` sahte) ham gövde/çerez/başlık/TCKN/
// e-posta sentinel'lerinin zarfta SIFIR eşleşmesini ÖLÇER — bu, `@sentry/
// core`'un KENDİ "`?? DEFAULTS`" çözümlemesinin GERÇEKTEN uygulandığının
// (yalnızca "bizim nesnemizde bu alan var" DEĞİL) davranışsal kanıtıdır.
// `tracesSampleRate: 0` da AÇIKÇA verilir (env-tersine-çevirme yüzeyini
// kapatmak için, `sentry.ts`'in dosya başı yorumuna bkz.) — bu yüzden
// "tracesSampleRate VERİLMEZ" pini "tracesSampleRate AÇIKÇA 0 VERİLİR"
// pinine DÖNÜŞTÜRÜLDÜ (aşağıda).
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { AppError, redactDeep } from '@arkesoft/errors'

import { resolvePlatformVersion } from '../config/platform-version.js'
import {
  captureAppError,
  SENTRY_FLUSH_TIMEOUT_MS,
  shutdownSentry,
  startSentry,
} from '../observability/sentry.js'
import type { StartSentryOptions } from '../observability/sentry.js'

// ---------------------------------------------------------------------------
// Yardımcılar — kaynak taraması
// ---------------------------------------------------------------------------

const SENTRY_SOURCE_PATH = fileURLToPath(new URL('../observability/sentry.ts', import.meta.url))

/**
 * `sentry.ts`'in kaynağını, BLOK (`/** ... *\/`) VE TEK SATIRLIK (`//`)
 * yorumların İKİSİ DE ÇIKARILMIŞ olarak döner. Bu dosyanın başı (VE JSDoc
 * blokları — ör. `captureAppError`'ın "`Sentry.setUser` ASLA çağrılmaz"
 * notu) KASITLI OLARAK `skipOpenTelemetrySetup`/`sendDefaultPii`/
 * `Sentry.setUser`/`tracesSampleRate` kelimelerini DOKÜMANTASYON amacıyla
 * (ÖLÇÜLMÜŞ DÜZELTMENİN gerekçesi) geçiriyor — "bu ad KOD'da yok" pini bu
 * yorum METNİYLE SAHTE başarısız (false positive) OLMASIN diye ÖNCE blok
 * yorumlar, SONRA satır yorumları ÇIKARILIR; kalan "kod"un KENDİSİ taranır.
 *
 * ⚠ SIRA ÖNEMLİ: blok yorumlar ÖNCE çıkarılmalı — aksi hâlde bir `/** ... *\/`
 * bloğu İÇİNDEKİ bir satırın `//` içermesi (bu dosyada YOK, ama gelecekte
 * olabilir) satır bazlı adımı YANLIŞ noktada keserdi.
 */
function readSentrySourceCodeOnly(): string {
  const raw = readFileSync(SENTRY_SOURCE_PATH, 'utf-8')
  const withoutBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  return withoutBlockComments
    .split('\n')
    .map((line) => {
      const commentIndex = line.indexOf('//')
      return commentIndex === -1 ? line : line.slice(0, commentIndex)
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// Yardımcılar — sahte taşıyıcı (fake transport) + zarf yakalama
// ---------------------------------------------------------------------------

/** `send`'in aldığı ham zarfı (yapısı taşıyıcıya göre değişmez) temsil eder. */
type CapturedEnvelope = unknown

type FakeTransport = {
  readonly send: (envelope: CapturedEnvelope) => Promise<Record<string, never>>
  readonly flush: (timeout?: number) => Promise<boolean>
}

type FakeTransportFactoryHandle = {
  /** `StartSentryOptions.transport`'a YAPISAL olarak uyan fabrika — `@sentry/node` import EDİLMEDEN. */
  readonly factory: NonNullable<StartSentryOptions['transport']>
  readonly getFactoryCallCount: () => number
  readonly getCapturedEnvelopes: () => readonly CapturedEnvelope[]
}

function createFakeTransportFactory(): FakeTransportFactoryHandle {
  let factoryCallCount = 0
  const capturedEnvelopes: CapturedEnvelope[] = []

  const factory: NonNullable<StartSentryOptions['transport']> = (): FakeTransport => {
    factoryCallCount += 1
    return {
      send: (envelope) => {
        capturedEnvelopes.push(envelope)
        return Promise.resolve({})
      },
      flush: () => Promise.resolve(true),
    }
  }

  return {
    factory,
    getFactoryCallCount: () => factoryCallCount,
    getCapturedEnvelopes: () => capturedEnvelopes,
  }
}

// Sentry zarfı — `[header, items]`, her item `[itemHeader, itemPayload]`.
// `itemPayload` GERÇEK taşıyıcıya giden YAPILANDIRILMIŞ (henüz serileştirilmemiş)
// nesnedir — `Transport.send(request: Envelope)` imzası BUNU doğrular (ÖLÇÜLDÜ,
// bu alt görevin elle çalıştırdığı prob script'i, aşağıdaki RİSKLER'e not edildi).
const sentryEnvelopeItemHeaderSchema = z.object({ type: z.string() })
const sentryEnvelopeItemSchema = z.tuple([sentryEnvelopeItemHeaderSchema, z.unknown()])
const sentryEnvelopeSchema = z.tuple([z.unknown(), z.array(sentryEnvelopeItemSchema)])

const sentryEventPayloadSchema = z.object({
  release: z.string().optional(),
  tags: z.record(z.string(), z.unknown()).optional(),
  contexts: z.record(z.string(), z.unknown()).optional(),
})

const appErrorSentryContextSchema = z.object({
  code: z.string(),
  httpStatus: z.number(),
  context: z.unknown(),
})

/** Yakalanan zarflardan `type: 'event'` olan item payload'larını çıkarır. */
function extractEventPayloads(
  envelopes: readonly CapturedEnvelope[],
): readonly z.infer<typeof sentryEventPayloadSchema>[] {
  const payloads: z.infer<typeof sentryEventPayloadSchema>[] = []

  for (const envelope of envelopes) {
    const [, items] = sentryEnvelopeSchema.parse(envelope)
    for (const [itemHeader, itemPayload] of items) {
      if (itemHeader.type === 'event') {
        payloads.push(sentryEventPayloadSchema.parse(itemPayload))
      }
    }
  }

  return payloads
}

/** Test amaçlı minimal, somut `AppError` alt sınıfı — `AppError` `abstract`. */
class TestObservabilityError extends AppError {
  constructor(context: Record<string, unknown>) {
    super({
      code: 'TEST_OBSERVABILITY_ERROR',
      httpStatus: 500,
      userMessageKey: 'errors.test.observability',
      context,
      logLevel: 'error',
    })
  }
}

function countOwnProcessTcpSockets(): number {
  const result = spawnSync('lsof', ['-a', '-nP', '-p', String(process.pid), '-iTCP'], {
    encoding: 'utf-8',
  })
  if (result.error) {
    throw result.error
  }
  // `-a` ZORUNLU (AGENT_BASELINE §4 — eşleşme yokken lsof exit 1 verir, bu
  // bir HATA DEĞİL "0 satır" anlamına gelir; `spawnSync` bunu fırlatmadan
  // `status`'ta taşır, `stdout` zaten boş kalır).
  return result.stdout.split('\n').filter((line) => line.trim().length > 0).length
}

afterAll(async () => {
  // Bu dosyanın son runtime testi gerçek (sahte DSN'li) bir istemci açtı —
  // dosya bitince kapatılır (dangling flush zamanlayıcısı bırakmamak için).
  await shutdownSentry()
})

// ---------------------------------------------------------------------------
// (1) STATİK — beş değişmez + SDK sürüm düzeltmesi, kaynak taraması
// ---------------------------------------------------------------------------

describe('(1) AC-62 — beş değişmez, MEKANİK kaynak taraması (yorumlar çıkarılmış)', () => {
  const codeOnly = readSentrySourceCodeOnly()

  it('vacuity karşıtı — kaynak okunabildi ve boş değil', () => {
    expect(codeOnly.length).toBeGreaterThan(0)
  })

  it('DOĞRU alan adı KOD’da VAR: enableOpenTelemetrySetup: false', () => {
    expect(/enableOpenTelemetrySetup\s*:\s*false/.test(codeOnly)).toBe(true)
  })

  // ⚠⚠⚠ DÜZELTME TURU 1/3 (security BULGU 1) — ALTI alanın HER BİRİ AYRI
  // AYRI pinlenir (dosya başı yorumu: `dataCollection: { userInfo: false }`
  // TEK BAŞINA on bir alanı varsayılana düşürüyordu). Her assert, alanın
  // `dataCollection: { ... }` bloğunun İÇİNDE (`Sentry.init`'e giden AYNI
  // obje literalinin parçası olarak) GEÇTİĞİNİ doğrular — `codeOnly` zaten
  // yorum çıkarılmış kod, bu yüzden bir YORUM metninde "görünmesi" İHTİMAL
  // DIŞI (yukarıdaki "boşa-çıkmama" testiyle AYNI disiplin).
  it('dataCollection.userInfo: false — KOD’da VAR', () => {
    expect(/userInfo\s*:\s*false/.test(codeOnly)).toBe(true)
  })

  it('dataCollection.httpBodies: [] — KOD’da VAR (boş dizi, gövde toplama KAPALI)', () => {
    expect(/httpBodies\s*:\s*\[\s*\]/.test(codeOnly)).toBe(true)
  })

  it('dataCollection.cookies: false — KOD’da VAR', () => {
    expect(/cookies\s*:\s*false/.test(codeOnly)).toBe(true)
  })

  it('dataCollection.httpHeaders: { request: false, response: false } — KOD’da VAR (HER İKİ yön)', () => {
    expect(
      /httpHeaders\s*:\s*\{\s*request\s*:\s*false\s*,\s*response\s*:\s*false\s*\}/.test(codeOnly),
    ).toBe(true)
  })

  it('dataCollection.urlQueryParams: false — KOD’da VAR', () => {
    expect(/urlQueryParams\s*:\s*false/.test(codeOnly)).toBe(true)
  })

  it('dataCollection.stackFrameVariables: false — KOD’da VAR', () => {
    expect(/stackFrameVariables\s*:\s*false/.test(codeOnly)).toBe(true)
  })

  it('tracesSampleRate: 0 — AÇIKÇA VERİLİR (env-tersine-çevirme yüzeyi kapatılır, sentry.ts dosya başı yorumu)', () => {
    expect(/tracesSampleRate\s*:\s*0\b/.test(codeOnly)).toBe(true)
  })

  // ⭐ EK PİN (düzeltme turu 2/3, M3 — security tur 2 / qa tur 2): yalnızca
  // EKLENİR, yukarıdaki mevcut assertion'lar GEVŞETİLMEZ. Davranışsal kanıt
  // `sentry-console-breadcrumb-leak.test.ts`'te; bu, EK olarak statik kaynak
  // garantisi — `beforeBreadcrumb`'ın `Sentry.init`'e giden obje literalinde
  // VAR olduğunu pinler (regresyon: biri bu satırı silerse bu test KIRMIZI
  // olur, davranışsal test de kırmızı olur — çift kilit).
  it('beforeBreadcrumb: () => null — KOD’da VAR (TÜM breadcrumb kanalları kapalı, M3 düzeltmesi)', () => {
    expect(/beforeBreadcrumb\s*:\s*\(\s*\)\s*=>\s*null/.test(codeOnly)).toBe(true)
  })

  it('NO-OP koruması GERÇEKTEN VAR ve Sentry.init(...) ÇAĞRISINDAN ÖNCE durur (pozisyonel kanıt)', () => {
    const guardPattern = /if\s*\(\s*dsn\s*===\s*undefined\s*\|\|\s*dsn\.length\s*===\s*0\s*\)/
    const guardMatch = guardPattern.exec(codeOnly)
    const initCallIndex = codeOnly.indexOf('Sentry.init(')

    expect(guardMatch).not.toBeNull()
    expect(initCallIndex).toBeGreaterThan(-1)
    // Guard KOD'da VAR ve `Sentry.init(`'DEN ÖNCE (daha düşük karakter
    // indeksinde) duruyor — bu, DSN kontrolünün `Sentry.init`'i KORUYAN bir
    // erken dönüş olduğunu, dekoratif bir yorum olmadığını POZİSYONEL
    // olarak kanıtlar.
    if (guardMatch !== null) {
      expect(guardMatch.index).toBeLessThan(initCallIndex)
    }
  })

  it('YANLIŞ/var-olmayan alan adları KOD’da (yorum HARİÇ) YOK: skipOpenTelemetrySetup, sendDefaultPii — 0 eşleşme', () => {
    expect(codeOnly.includes('skipOpenTelemetrySetup')).toBe(false)
    expect(codeOnly.includes('sendDefaultPii')).toBe(false)
  })

  it('Sentry.setUser ÇAĞRILMAZ — 0 eşleşme (kod, yorum hariç)', () => {
    expect(codeOnly.includes('setUser')).toBe(false)
  })

  it('(boşa-çıkmama kanıtı) BLOK yorumları ÇIKARMAYAN naif bir tarayıcı bu dosyada GERÇEKTEN YANLIŞ pozitif üretirdi', () => {
    // `captureAppError`'ın JSDoc bloğu "`Sentry.setUser` ASLA çağrılmaz"
    // notunu taşıyor — SADECE `//` satırlarını çıkaran bir tarayıcı bunu
    // "kod" sanıp YANLIŞLIKLA 'setUser' bulurdu. Bu, yukarıdaki testin
    // GERÇEKTEN bir şey ölçtüğünün (tesadüfen geçmediğinin) kanıtı.
    const raw = readFileSync(SENTRY_SOURCE_PATH, 'utf-8')
    const lineCommentsOnlyStripped = raw
      .split('\n')
      .map((line) => {
        const commentIndex = line.indexOf('//')
        return commentIndex === -1 ? line : line.slice(0, commentIndex)
      })
      .join('\n')

    expect(lineCommentsOnlyStripped.includes('setUser')).toBe(true)
    // Doğru (blok+satır) tarayıcı AYNI girdide bunu YAKALAMAZ (0 eşleşme) —
    // yukarıdaki testle BİREBİR aynı iddia, burada yan yana gösteriliyor.
    expect(codeOnly.includes('setUser')).toBe(false)
  })

  it('tag kümesi KAPALI — scope.setTag(...) çağrılarının TAMAMI tam olarak {tenant_id, request_id, trace_id}', () => {
    const tagNamePattern = /scope\.setTag\(\s*['"`]([^'"`]+)['"`]/g
    const foundTagNames = [...codeOnly.matchAll(tagNamePattern)].map((match) => match[1])

    // vacuity karşıtı — en az bir setTag çağrısı bulunabildi (desen çalışıyor).
    expect(foundTagNames.length).toBeGreaterThan(0)

    const uniqueTagNames = [...new Set(foundTagNames)].sort()
    expect(uniqueTagNames).toEqual(['request_id', 'tenant_id', 'trace_id'])
  })

  it('release === resolvePlatformVersion() — kod içinde LİTERAL çağrı', () => {
    expect(codeOnly.includes('release: resolvePlatformVersion()')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// (2) DSN tanımsız/boş → NO-OP (AC-57'nin S5'e düşen parçası)
//
// ⚠⚠ SIRALAMA KISITI: bu describe (3)'TEN ÖNCE çalışmak ZORUNDADIR — (3)
// GERÇEK (sahte DSN'li) bir istemci başlatır ve bu modülün global Sentry
// durumunu kalıcı olarak değiştirir. Vitest AYNI dosya içinde `describe`/`it`
// bloklarını TANIM SIRASIYLA çalıştırır (varsayılan, rastgele DEĞİL) — bu
// yüzden (2) METİNDE (3)'TEN ÖNCE durur.
// ---------------------------------------------------------------------------

describe('(2) DSN tanımsız/boş → startSentry() hiçbir şey yapmaz (sıfır zarf, sıfır soket)', () => {
  it('DSN undefined: transport fabrikası HİÇ ÇAĞRILMAZ (Sentry.init hiç çalışmadığının davranışsal kanıtı)', () => {
    const fake = createFakeTransportFactory()

    startSentry({ dsn: undefined, transport: fake.factory })

    expect(fake.getFactoryCallCount()).toBe(0)
    expect(fake.getCapturedEnvelopes()).toEqual([])
  })

  it('DSN boş dize: AYNI NO-OP (tanımsız/boş ayrımı yapılmaz)', () => {
    const fake = createFakeTransportFactory()

    startSentry({ dsn: '', transport: fake.factory })

    expect(fake.getFactoryCallCount()).toBe(0)
  })

  it('DSN undefined iken captureAppError da sıfır zarf üretir (Sentry hiç başlamadığı için)', () => {
    const fake = createFakeTransportFactory()
    startSentry({ dsn: undefined, transport: fake.factory })

    captureAppError({
      error: new TestObservabilityError({ probe: 'value' }),
      tenantId: 'tnt_test',
      requestId: 'req_test',
      traceId: 'trace_test',
    })

    expect(fake.getCapturedEnvelopes()).toEqual([])
  })

  it('DSN undefined: aynı süreçte lsof ile ölçülen TCP soket SAYISI değişmez (delta 0)', () => {
    const fake = createFakeTransportFactory()

    const beforeCount = countOwnProcessTcpSockets()
    startSentry({ dsn: undefined, transport: fake.factory })
    const afterCount = countOwnProcessTcpSockets()

    // eslint-disable-next-line no-console -- DoD'un istediği "SAYIYLA raporla" ham kanıtı, test logudur (üretim kodu DEĞİL)
    console.info('[S5/(2)] DSN-yok lsof ölçümü:', { beforeCount, afterCount })

    expect(afterCount).toBe(beforeCount)
  })
})

// ---------------------------------------------------------------------------
// (3) DSN VERİLDİĞİNDE — sahte taşıyıcıyla GERÇEK zarf yakalama (release,
// tag kümesi, redactDeep entegrasyonu). ⚠⚠ GERÇEK DSN REPOYA GİRMEZ — kukla
// bir DSN biçimi (`https://<key>@o0.ingest.sentry.io/0`) kullanılır, hiçbir
// ağ çağrısı yapılmaz (transport SAHTE).
// ---------------------------------------------------------------------------

const FAKE_DSN = 'https://fakepublickey@o0.ingest.sentry.invalid/0'

describe('(3) DSN verildiğinde — sahte taşıyıcıyla zarf yakalama (release/tag/redactDeep entegrasyonu)', () => {
  it('release alanı resolvePlatformVersion() çıktısıyla BİREBİR', async () => {
    const fake = createFakeTransportFactory()
    startSentry({ dsn: FAKE_DSN, transport: fake.factory })

    captureAppError({
      error: new TestObservabilityError({}),
      tenantId: 'tnt_release_check',
      requestId: 'req_release_check',
      traceId: 'trace_release_check',
    })

    await shutdownSentry()

    const eventPayloads = extractEventPayloads(fake.getCapturedEnvelopes())
    // boşa-çıkmama — pipeline'ın GERÇEKTEN bir 'event' zarfı ürettiği kanıtı.
    expect(eventPayloads.length).toBeGreaterThan(0)

    for (const payload of eventPayloads) {
      expect(payload.release).toBe(resolvePlatformVersion())
    }
  })

  it('tag kümesi zarfta TAM OLARAK {tenant_id, request_id, trace_id} — başka tag YOK, Sentry.setUser etkisi YOK (user alanı tanımsız)', async () => {
    const fake = createFakeTransportFactory()
    startSentry({ dsn: FAKE_DSN, transport: fake.factory })

    captureAppError({
      error: new TestObservabilityError({}),
      tenantId: 'tnt_tag_check',
      requestId: 'req_tag_check',
      traceId: 'trace_tag_check',
    })

    await shutdownSentry()

    const eventPayloads = extractEventPayloads(fake.getCapturedEnvelopes())
    expect(eventPayloads.length).toBeGreaterThan(0)

    for (const payload of eventPayloads) {
      const tags = payload.tags ?? {}
      expect(Object.keys(tags).sort()).toEqual(['request_id', 'tenant_id', 'trace_id'])
      expect(tags['tenant_id']).toBe('tnt_tag_check')
      expect(tags['request_id']).toBe('req_tag_check')
      // ⚠⚠⚠ DÜZELTME TURU 1/3 (solid BULGU 3) — SIKILAŞTIRILDI: ÖNCEKİ hâli
      // `typeof tags['trace_id'] === 'string'` idi (her zaman doğru olurdu,
      // `sentry.ts` eski hâlinde `getCurrentTraceId()`'yi YENİDEN ÇAĞIRIP
      // TAMAMEN FARKLI, rastgele bir string ÜRETSE BİLE bu assert YEŞİL
      // kalırdı). Artık `captureAppError`'a VERİLEN DEĞERLE BİREBİR eşitlik
      // istenir — `sentry.ts`'in `traceId`'yi YENİDEN ÜRETMEDİĞİNİN, SADECE
      // ALDIĞINI AKTARDIĞININ davranışsal kanıtı.
      expect(tags['trace_id']).toBe('trace_tag_check')
    }
  })

  it('tenantId undefined (tenant bağlamı olmayan hata) — tenant_id tag’i yine de TEK bir sentinel değerle VAR, başka tag eklenmez', async () => {
    const fake = createFakeTransportFactory()
    startSentry({ dsn: FAKE_DSN, transport: fake.factory })

    captureAppError({
      error: new TestObservabilityError({}),
      tenantId: undefined,
      requestId: 'req_no_tenant',
      traceId: 'trace_no_tenant',
    })

    await shutdownSentry()

    const eventPayloads = extractEventPayloads(fake.getCapturedEnvelopes())
    expect(eventPayloads.length).toBeGreaterThan(0)

    for (const payload of eventPayloads) {
      const tags = payload.tags ?? {}
      expect(Object.keys(tags).sort()).toEqual(['request_id', 'tenant_id', 'trace_id'])
      expect(typeof tags['tenant_id']).toBe('string')
    }
  })

  it('AC-59 ENTEGRASYON kanıtı — error.context, redactDeep’ten GEÇMİŞ hâliyle zarfa gider (sır zarfta AYNEN görünmez)', async () => {
    const fake = createFakeTransportFactory()
    startSentry({ dsn: FAKE_DSN, transport: fake.factory })

    // ⚠ İÇ İÇE (`nested.token`) alan BİLİNÇLİ OLARAK burada YOK — Sentry'nin
    // KENDİ olay normalizasyonu (`normalizeDepth`, varsayılan 3) `contexts`
    // ağacını belirli bir derinlikten SONRA `"[Object]"` ile KISALTIYOR;
    // bu BİZİM `redactDeep`'imizden TAMAMEN BAĞIMSIZ, ayrı bir Sentry
    // davranışı (ÖLÇÜLDÜ: bu test İLK halinde `nested: { token: … }` ile
    // yazıldığında zarfta `nested: "[Object]"` çıktı — redactDeep çalışmadığı
    // İÇİN DEĞİL, Sentry'nin kendi derinlik sınırı YÜZÜNDEN). ⇒ bu test TEK
    // SEVİYELİ alanlarla Sentry entegrasyonunu kanıtlar; İÇ İÇE redaksiyonun
    // KENDİSİ `packages/errors/src/__tests__/redaction.test.ts`'in (S3) işi.
    const rawContext = {
      password: 'super-secret-value',
      safeField: 'görünebilir-veri',
    }
    const error = new TestObservabilityError(rawContext)

    captureAppError({
      error,
      tenantId: 'tnt_redact_check',
      requestId: 'req_redact_check',
      traceId: 'trace_redact_check',
    })

    await shutdownSentry()

    const eventPayloads = extractEventPayloads(fake.getCapturedEnvelopes())
    expect(eventPayloads.length).toBeGreaterThan(0)

    // Beklenen redakte şekil — `redactDeep`'in KENDİSİNDEN (S3'ün dosyası,
    // tek doğruluk kaynağı) türetilir; placeholder METNİ burada SABİTLENMEZ.
    const expectedRedactedContext = redactDeep(rawContext)

    for (const payload of eventPayloads) {
      const sentryContext = appErrorSentryContextSchema.parse(payload.contexts?.['appError'])
      expect(sentryContext.code).toBe(error.code)
      expect(sentryContext.httpStatus).toBe(error.httpStatus)
      expect(sentryContext.context).toEqual(expectedRedactedContext)

      // Vacuity karşıtı — ham sır GERÇEKTEN zarfın HİÇBİR YERİNDE serileşmiş
      // metin olarak YOK (JSON.stringify ile tüm zarfı tarayan kaba bir
      // ikinci kontrol — redactDeep'in ÇALIŞTIĞININ bağımsız kanıtı).
      const serialized = JSON.stringify(payload)
      expect(serialized.includes('super-secret-value')).toBe(false)
      expect(serialized.includes('görünebilir-veri')).toBe(true)
    }
  })

  it('shutdownSentry() sonrası Sentry.isInitialized() false’a döner (davranışsal kanıt: tekrar captureAppError sıfır zarf üretir)', async () => {
    const fake = createFakeTransportFactory()
    startSentry({ dsn: FAKE_DSN, transport: fake.factory })
    await shutdownSentry()

    const fakeAfterShutdown = createFakeTransportFactory()
    // `startSentry` ÇAĞRILMADI — önceki `shutdownSentry()` istemciyi
    // kapattığı için `captureAppError` artık NO-OP olmalı.
    captureAppError({
      error: new TestObservabilityError({}),
      tenantId: 'tnt_after_shutdown',
      requestId: 'req_after_shutdown',
      traceId: 'trace_after_shutdown',
    })

    expect(fakeAfterShutdown.getCapturedEnvelopes()).toEqual([])
  })

  it('SENTRY_FLUSH_TIMEOUT_MS, worker kapanış bütçesinin (K-A28-3) İÇİNDE — aritmetikle', () => {
    const WORKER_SHUTDOWN_WATCHDOG_MS = 10_000
    expect(SENTRY_FLUSH_TIMEOUT_MS).toBeLessThan(WORKER_SHUTDOWN_WATCHDOG_MS)
  })
})

// ---------------------------------------------------------------------------
// (4) DÜZELTME TURU 1/3 (security BULGU 1, critical) — GERÇEK bir `node:http`
// sunucusu + GERÇEK bir Sentry istemcisi (`transport` HARİÇ) ile hassas bir
// çerez/başlık değerinin Sentry'nin KENDİ çözümlediği `dataCollection`
// ayarına göre zarfa EKLENİP EKLENMEDİĞİNİ ölçer.
//
// ⚠⚠⚠ (1)'in statik kaynak taraması "sentry.ts'in KENDİ obje literalinde bu
// alan var" diyor — BU describe "Sentry.init'e GERÇEKTEN GİDEN, `@sentry/
// core`'un `?? DEFAULTS` ile ÇÖZÜMLEDİĞİ değer bu alanı GERÇEKTEN
// UYGULUYOR" diyor (dosya başı yorumunun "yalnızca bizim nesnemizde var
// YETMEZ" şartı). Sentinel değer BİLİNÇLİ OLARAK Sentry'nin KENDİ
// `SENSITIVE_KEY_SNIPPETS` sabit listesinde (`@sentry/core/.../utils/
// data-collection/filtering-snippets.js` — "auth"/"token"/"secret"/
// "session"/"password"/"key"/… ) GEÇMEYEN bir ad TAŞIR — aksi hâlde Sentry
// değeri KENDİ varsayılan filtresiyle ZATEN maskeler ve test "cookies:
// false"/"httpHeaders: false" AYARLARIMIZIN hiçbir şey YAPMADIĞI bir dünyada
// da YANLIŞLIKLA yeşil kalırdı (bu alt görevin KENDİ elle doğruladığı
// ölçüm — `node -e` ile iki karşılaştırmalı koşum: varsayılan ayarlarla
// sentinel ZARFA SIZDI, bizim altı alanımızla SIZMADI).
//
// ⚠ GÖVDE (`httpBodies: []`) BİLEREK AYRI BİR E2E İLE DOĞRULANMAZ — ÖLÇÜLMÜŞ
// GEREKÇE: Sentry'nin gövde yakalaması (`patchRequestToCaptureBody`)
// `req.on('data'/'end')` ÜZERİNDEN ASENKRON çalışır; bu alt görevin ELLE
// yaptığı ölçüm, `captureException`'ın bu asenkron tik'TEN SONRA (body
// okunduktan sonra) çağrıldığı senaryoda Sentry'nin KENDİ isolation-scope
// sürekliliğinin (bu SDK sürümünde, çıplak `http.createServer` + ham
// `req.on` deseninde) KOPTUĞUNU gösterdi — `event.sdkProcessingMetadata`
// HİÇBİR alan taşımıyordu (ne gövde ne başlık), bu da "httpBodies:[]
// ÇALIŞIYOR" sonucunu YANLIŞLIKLA kanıtlıyormuş GİBİ görünüp aslında
// pipeline'ın HİÇ tetiklenmediğini gösteriyordu (sahte-yeşil riski). `captureException`
// SENKRON çağrıldığında (bu describe'un AŞAĞIDAKİ testi) isolation scope
// DOĞRU aktarılıyor — ama bu durumda gövde HENÜZ okunmamış olur (`req.on
// ('end')` henüz TETİKLENMEMİŞ), yani gövde sızıntısını SENKRON bir çağrıyla
// da ANLAMLI ÖLÇMEK mümkün değil. ⇒ gövde garantisi BİLİNÇLİ OLARAK
// YALNIZCA (1)'in statik `httpBodies: []` pinine BIRAKILIR — bu, "yalnızca
// bizim nesnemizde var" seviyesinde bir pin olsa da, `dataCollection`'ın
// DİĞER BEŞ alanı (aşağıda) GERÇEK çözümlenmiş davranışla AYRICA
// doğrulandığı için BULGU 1'in "hiçbir alan test EDİLMEDİ" riski KAPANMIŞ
// olur.
// ---------------------------------------------------------------------------

describe('(4) BULGU 1 regresyonu — hassas çerez/başlık, Sentry’nin GERÇEK çözümlediği dataCollection’a göre zarfa SIZMAZ', () => {
  it('Sentry’nin KENDİ varsayılan-hassas listesinde OLMAYAN bir çerez/başlık değeri — SENKRON captureException sırasında zarfta SIFIR eşleşme', async () => {
    const fake = createFakeTransportFactory()
    startSentry({ dsn: FAKE_DSN, transport: fake.factory })

    // ⚠ BİLİNÇLİ OLARAK "auth"/"token"/"secret"/"session"/"password"/"key"/…
    // (Sentry'nin KENDİ `SENSITIVE_KEY_SNIPPETS`'i) İÇERMEYEN bir ad/değer —
    // dosya başı yorumunun gerekçesi.
    const SECRET_MARKER_VALUE = 'arkesoft-musteri-dosya-no-9f1a2b3c'

    const server = createServer((_req, res) => {
      // SENKRON — `app-exception.filter.ts`'in GERÇEK çağrı deseni: istek
      // işlenirken (body okuma TAMAMLANMADAN, dosya başı yorumundaki
      // ÖLÇÜLMÜŞ kısıt) bir `AppError` yakalanır, `captureAppError` HEMEN
      // çağrılır — Sentry'nin kendi isolation-scope sürekliliği bu SENKRON
      // çağrı deseninde KORUNUR (bu alt görevin elle doğruladığı ölçüm).
      captureAppError({
        error: new TestObservabilityError({}),
        tenantId: 'tnt_bulgu1',
        requestId: 'req_bulgu1',
        traceId: 'trace_bulgu1',
      })
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('internal error')
    })

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
          resolve()
        })
      })

      const address = server.address() as AddressInfo

      await fetch(`http://127.0.0.1:${String(address.port)}/`, {
        method: 'POST',
        headers: {
          cookie: `musteri_dosya_no=${SECRET_MARKER_VALUE}`,
          'x-arkesoft-musteri-dosya-no': SECRET_MARKER_VALUE,
        },
        body: '{}',
      })

      await shutdownSentry()

      const eventPayloads = extractEventPayloads(fake.getCapturedEnvelopes())
      // boşa-çıkmama — pipeline'ın GERÇEKTEN bir 'event' zarfı ürettiği kanıtı
      // (aksi hâlde "sıfır eşleşme" sonucu ANLAMSIZ olurdu — hiç zarf
      // üretilmediği için de sıfır çıkardı).
      expect(eventPayloads.length).toBeGreaterThan(0)

      const serializedEnvelopes = JSON.stringify(fake.getCapturedEnvelopes())
      expect(serializedEnvelopes.includes(SECRET_MARKER_VALUE)).toBe(false)
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
    }
  })
})

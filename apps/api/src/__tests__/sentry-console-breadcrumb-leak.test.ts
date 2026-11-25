// @arkesoft/api — `qa` gate (T-028, tur 2) — EKSİK SENARYO testi.
//
// Kaynak: `security` gate tur 2 bulgusu M3 (medium) —
// `.claude/workflow/reviews/T-028-security-tur2.md:165-178`.
//
// ⚠⚠ Bu test BİLEREK KIRMIZI — `observability/sentry.ts` bugün Sentry'nin
// VARSAYILAN `Console` entegrasyonunu FİLTRELEMİYOR
// (`integrations`/`beforeBreadcrumb` alanı YOK, ölçüldü: `grep -n
// "integrations\|beforeBreadcrumb" observability/sentry.ts` → 0 eşleşme).
//
// `@sentry/node@11.12.0`'ın `getBaseDefaultIntegrations()`'ı
// `consoleIntegration()`'ı VARSAYILAN kümeye dahil eder
// (`node_modules/.pnpm/@sentry+node@11.12.0/.../sdk/index.js:41`) ve bu
// entegrasyon `console.*` çağrılarının TÜM argümanlarını (`arguments: args`)
// breadcrumb'a yazar — `dataCollection` ayarına, `redactDeep`'e veya pino
// `redact.paths`'e BAKMADAN
// (`@sentry+core@11.12.0/.../integrations/console.js` → `addConsoleBreadcrumb`).
// `qa` bu kaynağı BAĞIMSIZ olarak okudu VE bir `node:http` gerektirmeyen
// bağımsız `node` script'iyle (bu Task'ın brief'i uyarınca repoya
// COMMIT'LENMEDİ, yalnızca ölçüm için çalıştırıldı ve silindi) breadcrumb'ın
// GERÇEKTEN zarfa `{"category":"console","data":{"arguments":[...]}}`
// biçiminde girdiğini doğruladı.
//
// Üçüncü parti bir bağımlılığın (Better Auth/Prisma/bir sürücü) ürettiği bir
// `console.warn` senaryosu taklit edilir — birinci parti üretim kodu
// `console.*` ÇAĞIRMAZ (`no-console: 'error'` mekanik zorlu,
// `packages/config/eslint/base.js:220`), bu yüzden bugün somut bir saldırgan
// yolu YOK (bu yüzden `security` bunu `medium` derecelendirdi, `critical`
// DEĞİL) — ama kanal AÇIK. Bu dosyadaki TEK `console.warn` çağrısı o üçüncü
// parti senaryoyu TAKLİT ETMEK için VAR olduğundan (ROADMAP v0.0.17, T-028,
// `qa` tur 2) `no-console` kuralı satır bazlı devre dışı bırakılır
// (CLAUDE.md §2 — "kaçınılmaz durumda eslint-disable + gerekçe + ROADMAP
// notu").
//
// Önerilen düzeltme (security'nin önerisi, `backend`'e):
//   `integrations: (defaults) => defaults.filter((i) => i.name !== 'Console')`
//   veya `beforeBreadcrumb: () => null`
// + bu testin KENDİSİ yeşile döndürülür (eşik düşürülmez, test DEĞİŞMEZ).

import { afterAll, describe, expect, it } from 'vitest'

import { AppError } from '@arkesoft/errors'

import { captureAppError, shutdownSentry, startSentry } from '../observability/sentry.js'
import type { StartSentryOptions } from '../observability/sentry.js'

const FAKE_DSN = 'https://fakepublickey@o0.ingest.sentry.invalid/0'

type CapturedEnvelope = unknown

type FakeTransportFactoryHandle = {
  readonly factory: NonNullable<StartSentryOptions['transport']>
  readonly getCapturedEnvelopes: () => readonly CapturedEnvelope[]
}

function createFakeTransportFactory(): FakeTransportFactoryHandle {
  const capturedEnvelopes: CapturedEnvelope[] = []

  const factory: NonNullable<StartSentryOptions['transport']> = () => ({
    send: (envelope: CapturedEnvelope) => {
      capturedEnvelopes.push(envelope)
      return Promise.resolve({})
    },
    flush: () => Promise.resolve(true),
  })

  return { factory, getCapturedEnvelopes: () => capturedEnvelopes }
}

/** Test amaçlı minimal, somut `AppError` alt sınıfı — `AppError` `abstract`. */
class TestConsoleBreadcrumbError extends AppError {
  constructor() {
    super({
      code: 'TEST_CONSOLE_BREADCRUMB_ERROR',
      httpStatus: 500,
      userMessageKey: 'errors.test.observability',
      context: {},
      logLevel: 'error',
    })
  }
}

afterAll(async () => {
  await shutdownSentry()
})

describe('M3 (security tur2, medium) — Sentry `Console` breadcrumb kanalı redaksiyonun ÜÇÜNÜ DE baypas ediyor', () => {
  it('console.warn ile "loglanan" bir sır, dataCollection/redactDeep/pino redaksiyonunun hiçbirinden geçmeden zarfa breadcrumb olarak gider', async () => {
    const fake = createFakeTransportFactory()
    startSentry({ dsn: FAKE_DSN, transport: fake.factory })

    const SECRET_MARKER = 'arkesoft-musteri-sir-7c2e9f1a'

    // ⚠ Birinci parti kod BÖYLE BİR ÇAĞRI YAPMAZ (no-console mekanik zorlu) —
    // bu, üçüncü parti bir bağımlılığın (Better Auth/Prisma/sürücü) kiracı
    // verisi/sır taşıyan bir `console.warn` üretmesini TAKLİT eder (dosya
    // başı yorumuna bkz. — gerekçeli devre dışı bırakma).
    // eslint-disable-next-line no-console -- ROADMAP v0.0.17 (T-028, qa tur2): üçüncü parti bağımlılık console.warn'ını taklit eden kasıtlı regresyon pini
    console.warn(`beklenmeyen bağımlılık uyarısı: ${SECRET_MARKER}`)

    // Aynı istekte `logLevel: 'error'` bir AppError yakalanır — üretimin
    // GERÇEK çağrı deseni (`app-exception.filter.ts` → `captureAppError`).
    captureAppError({
      error: new TestConsoleBreadcrumbError(),
      tenantId: 'tnt_console_breadcrumb',
      requestId: 'req_console_breadcrumb',
      traceId: 'trace_console_breadcrumb',
    })

    // ⚠⚠ Sentry'nin kendi event-işleme/gönderme hattı ASENKRON (stack trace
    // bağlam satırlarının OKUNMASI dahil) — zarfı kontrol etmeden ÖNCE
    // `shutdownSentry()` ile BOŞALTILMASI (flush) ZORUNLU, aksi hâlde
    // `getCapturedEnvelopes()` SESSİZCE boş döner ve bu test SAHTE-YEŞİL olur
    // (bu test YAZILIRKEN BİR KEZ ölçüldü: `shutdownSentry()` çağrısı
    // EKSİKKEN `captured.length === 0` ⇒ aşağıdaki boşa-çıkmama kontrolü
    // olmadan "sıfır eşleşme" YANLIŞ-POZİTİF bir güvenlik sonucu verirdi).
    await shutdownSentry()

    const capturedEnvelopes = fake.getCapturedEnvelopes()

    // Vacuity karşıtı — zarf DİZİSİ GERÇEKTEN üretildi mi. ⚠⚠ Dizinin
    // UZUNLUĞU kontrol edilir, `JSON.stringify(capturedEnvelopes)` STRING'inin
    // uzunluğu DEĞİL (`JSON.stringify([])` === '[]' iki karakterdir ve
    // `.length > 0` BOŞ dizide de `true` döner — bu dosyanın KENDİSİNİN
    // ilk taslağında yapılan ve bu yorumla düzeltilen hata).
    expect(capturedEnvelopes.length).toBeGreaterThan(0)

    const serialized = JSON.stringify(capturedEnvelopes)

    // ⭐ BEKLENEN (güvenli) davranış: sır zarfa HİÇ GİTMEMELİ.
    // ⚠⚠ BU ASSERTION BUGÜN KIRMIZI — Console entegrasyonu filtrelenmiyor.
    expect(serialized.includes(SECRET_MARKER)).toBe(false)
  })
})

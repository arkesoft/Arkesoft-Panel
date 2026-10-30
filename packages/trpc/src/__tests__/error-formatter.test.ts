// @arkesoft/trpc — `errorFormatter` sızdırmazlık + cause-parse-başarısızlığı
// gözlemlenebilirlik testleri (ROADMAP v0.0.6, T-007/ST-3 (S4), ADR-0010 §3)
//
// Bu dosyadaki testler BİLEREK "bilinmeyen prosedür yolu" (çerçeve hatası,
// architect "Kapsam dışı": `appErrorBoundary`'den HİÇ GEÇMEYEN bir senaryo)
// tetikleyicisini kullanır — bu, `errorFormatter`'ın fail-closed
// (`trpcErrorDataSchema.safeParse` başarısız) dalını `appErrorBoundary`'nin
// kendisine BAĞIMLI OLMADAN, güvenilir biçimde tetikler.
//
// GEÇMİŞ TUR NOTU (T-007/S4 bulgusu, solid tur1 M1 ile aynı desende
// güncellendi): tRPC v11'in `callRecursive`'i her middleware seviyesinde
// kendi hatasını YAKALAR ve hatayı FIRLATMAZ, `{ok:false, error}` DÖNÜŞ
// DEĞERİNE çevirir — bu yüzden `appErrorBoundary` (`src/trpc.ts`) `next()`'in
// DÖNÜŞ DEĞERİNİ okuyan bir desenle yazılmıştır (ADR-0010 madde 3.4'ün
// uygulama notu — solid tur2 M5: ADR düzeltmesiyle atıf hizalandı, önceki
// tur "3.5" yazıyordu). AC3/AC6-benzeri senaryoların GERÇEK-HATA-YOLU testleri bu
// yüzden bu dosyada DEĞİL, `procedures.test.ts`'te yer alıyor. Bu dosya,
// appErrorBoundary'den TAMAMEN bağımsız olan iki garantiyi (çerçeve hatası
// sızdırmazlığı + NODE_ENV bağımsızlığı + cause-parse-fail
// gözlemlenebilirliği) doğrular.
//
// T-007 düzeltme turu 2 (solid tur2 M6) EKLEDİ: dosyanın son describe
// bloğu `create-trpc-request-handler.ts`'e bağlanan `onError` kancasının
// (ADR-0010 madde 3.2 — ham mesaj/yığın izi yalnızca loga gider) GERÇEKTEN
// çağrıldığını ve rutin çerçeve hatasından AYIRT edilebilir olduğunu
// doğrular.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { appErrorBodySchema } from '@arkesoft/errors'
import { isTRPCClientError } from '@trpc/client'

import { createHarness } from './harness.js'
import type { AppRouter } from '../routers/app.router.js'

/** JSON-RPC2 hata zarfının GEVŞETİLMEMİŞ (data alanı `z.unknown()`) şeması — `Object.keys` ile sızıntı denetimi için `data`'nın HAM anahtar kümesi korunur. */
const ERROR_ENVELOPE_SCHEMA = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown(),
  }),
})

/** `error.data`'nın kayıt (record) biçimine doğrulanması — `as` kullanmadan tipli erişim sağlar (Zod çıkarımı). */
const DATA_RECORD_SCHEMA = z.record(z.string(), z.unknown())

async function requestUnknownProcedure(harness: ReturnType<typeof createHarness>): Promise<{
  readonly status: number
  readonly rawText: string
  readonly data: Record<string, unknown>
}> {
  const response = await harness.rawRequest('does.not.exist')
  const rawText = await response.text()
  const envelope = ERROR_ENVELOPE_SCHEMA.parse(JSON.parse(rawText))
  const data = DATA_RECORD_SCHEMA.parse(envelope.error.data)

  return { status: response.status, rawText, data }
}

describe('errorFormatter — çerçeve hatası (bilinmeyen prosedür yolu) sızdırmazlığı', () => {
  it('error.data anahtar kümesi TAM OLARAK {code, httpStatus, appError} — stack/zodError/path YOK', async () => {
    const harness = createHarness()
    const { data } = await requestUnknownProcedure(harness)

    expect(Object.keys(data).sort()).toEqual(['appError', 'code', 'httpStatus'])
    expect('stack' in data).toBe(false)
    expect('zodError' in data).toBe(false)
    expect('path' in data).toBe(false)
  })

  it("error.data.appError appErrorBodySchema'yı karşılar ve anahtar kümesi TAM OLARAK dört alandır", async () => {
    const harness = createHarness()
    const { data } = await requestUnknownProcedure(harness)

    const appError = appErrorBodySchema.parse(data['appError'])
    expect(Object.keys(appError).sort()).toEqual(['code', 'details', 'message', 'requestId'])
    expect(appError.requestId).toBe(harness.context.requestId)
  })

  it('ham hata mesajı/yığın izi gövdenin HİÇBİR yerinde yok (programatik, göz kararı değil)', async () => {
    const harness = createHarness()
    const { rawText } = await requestUnknownProcedure(harness)

    expect(rawText.toLowerCase()).not.toContain('stack')
    expect(rawText).not.toContain('.ts:')
    expect(rawText).not.toContain('at file://')
    expect(rawText).not.toMatch(/no procedure found/i)
  })

  it('NODE_ENV değiştirildiğinde gövde DEĞİŞMEZ (ADR-0010 §3.3 — ortam dallanması yok)', async () => {
    const originalNodeEnv = process.env['NODE_ENV']

    try {
      process.env['NODE_ENV'] = 'development'
      const developmentResult = await requestUnknownProcedure(
        createHarness({ requestId: 'req_env_test' }),
      )

      process.env['NODE_ENV'] = 'production'
      const productionResult = await requestUnknownProcedure(
        createHarness({ requestId: 'req_env_test' }),
      )

      expect(developmentResult.rawText).toBe(productionResult.rawText)
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env['NODE_ENV']
      } else {
        process.env['NODE_ENV'] = originalNodeEnv
      }
    }
  })
})

describe('errorFormatter — cause parse başarısızlığı (fail-closed) gözlemlenebilirliği', () => {
  it("bilinmeyen prosedür yolu için trpcErrorDataSchema PARSE EDEMEZ ve genericTransportErrorBody fallback'i (AYIRT EDİLEBİLİR appError.code) devreye girer", async () => {
    const harness = createHarness()
    const { status, data } = await requestUnknownProcedure(harness)

    // `appErrorBoundary`'den hiç GEÇMEYEN bu senaryoda `error.cause` bizim
    // {code,httpStatus,appError} şeklimizi TAŞIMAZ (tRPC'nin kendi NOT_FOUND
    // hatası) — `trpcErrorDataSchema.safeParse` BAŞARISIZ olur ve
    // `genericTransportErrorBody` fallback'i devreye girer. Bu, tam olarak
    // S3'ün bildirdiği risk 1'in canlı kanıtı: fallback AYIRT EDİLEBİLİR bir
    // gövde ÜRETİYOR (appError.code === 'HTTP_EXCEPTION', normal bir domain
    // hatasının KODU asla bu olamaz — CLAUDE.md §4 SCREAMING_SNAKE_CASE
    // domain kodları `TENANT_NOT_FOUND` gibi isimlerdir).
    expect(status).toBe(404)
    expect(data['code']).toBe('NOT_FOUND')
    expect(data['httpStatus']).toBe(404)
    expect(appErrorBodySchema.parse(data['appError']).code).toBe('HTTP_EXCEPTION')
  })

  it('cause-parse-fail dalı warn ÜRETİR ve requestId taşır (trpc.error-formatter.unparsable-cause, solid M4(b))', async () => {
    const harness = createHarness({ requestId: 'req_cause_parse_fail' })
    await requestUnknownProcedure(harness)

    // T-007 düzeltme turu 1, solid M4(b): bu assert artık "hiç log yok"
    // (niyetten GENİŞ, uygulama detayını pinleyen bir assert'ti) DEĞİL,
    // "tam olarak bir `warn` var ve mesajı/bağlamı budur" — `httpStatusToTrpcCode`'un
    // unmapped-status dalıyla kurulan asimetri (M2'nin ikinci savunma hattı)
    // bu testle kapatılıyor. Filtre `warn` seviyesiyle sınırlı tutulur ki
    // ileride eklenecek meşru bir `info`/`debug` kaydı (ör. OTel köprüsü,
    // v0.0.17) bu testi ilgisiz bir sebeple kırmasın.
    //
    // T-007 düzeltme turu 2, solid tur2 M6(3): assert SIKILAŞTIRILDI —
    // `context` artık yalnızca `{requestId}` DEĞİL, `trpcCode`/`httpStatus`
    // da BİREBİR doğrulanıyor (M6(2)'nin zenginleştirmesi). Bu senaryo
    // (bilinmeyen prosedür → tRPC'nin kendi `NOT_FOUND`/404'ü) aşağıdaki
    // "onError" describe bloğundaki ANOMALİ senaryosundan (`INTERNAL_SERVER_ERROR`/500)
    // tam olarak bu iki alanla AYIRT EDİLİR.
    const warnEntries = harness.logger.entries.filter((entry) => entry.level === 'warn')

    expect(warnEntries).toHaveLength(1)
    expect(warnEntries[0]?.message).toBe('trpc.error-formatter.unparsable-cause')
    expect(warnEntries[0]?.context).toEqual({
      requestId: 'req_cause_parse_fail',
      trpcCode: 'NOT_FOUND',
      httpStatus: 404,
    })
  })
})

describe('onError — sınıflandırılamayan hata tanılanabilirliği (solid tur2 M6)', () => {
  it("appErrorBoundary'nin yeniden fırlattığı NON-AppError programlama hatası için onError ÇAĞRILIR; ham mesaj/yığın izi `error` SEVİYESİNDE LOGLANIR ve tele HİÇ ÇIKMAZ", async () => {
    // `TenantReadPort` SÖZLEŞMESİ "bulunamadı durumunda AppError fırlatır"
    // der (tenant-read.port.ts) — burada BİLEREK ihlal edilir: bu, M6(b)'nin
    // tarif ettiği "port adaptöründe beklenmeyen bir programlama hatası"
    // sınıfının (ör. yakalanmamış bir `TypeError`) test-yerel simülasyonudur.
    // Zincir: resolver → trpc'nin kendi `callRecursive`'i bunu YAKALAR ve
    // `{ok:false, error}`'a çevirir (code: INTERNAL_SERVER_ERROR) →
    // `appErrorBoundary` (`trpc.ts`) `isAppError(result.error.cause)` →
    // false → `throw result.error` (trpc.ts:150 civarı, SARMALAMADAN
    // yeniden fırlatır) → `errorFormatter`'ın cause-parse-fail dalı +
    // `onError` İKİSİ DE bu TRPCError'ı görür.
    const rawMessage = 'boom — beklenmeyen TypeError (test-yerel, trpc.ts:150 dalını tetikler)'
    const harness = createHarness({
      tenantRead: { findSummary: () => Promise.reject(new Error(rawMessage)) },
    })

    let caught: unknown
    try {
      await harness.client.tenant.current.query()
      throw new Error(
        'beklenen hata fırlatılmadı — port non-AppError fırlatmasına rağmen istek BAŞARILI oldu',
      )
    } catch (error) {
      caught = error
    }

    if (!isTRPCClientError<AppRouter>(caught)) {
      throw new Error(`beklenen TRPCClientError değil: ${String(caught)}`)
    }

    // Tele ÇIKAN gövde jenerik — ham mesaj/yığın izi burada HİÇ YOK
    // (ADR-0010 madde 3.2; `onError` ve `errorFormatter` BAĞIMSIZ çalışır).
    expect(caught.data?.code).toBe('INTERNAL_SERVER_ERROR')
    expect(caught.data?.httpStatus).toBe(500)
    expect(appErrorBodySchema.parse(caught.data?.appError).code).toBe('HTTP_EXCEPTION')
    expect(JSON.stringify(caught.data)).not.toContain(rawMessage)

    // `onError` GERÇEKTEN çağrıldı — ham mesaj + yığın izi `error` SEVİYESİNDE
    // (CLAUDE.md §4: "müdahale gerekir") loglandı, programatik assert.
    const errorEntries = harness.logger.entries.filter((entry) => entry.level === 'error')

    expect(errorEntries).toHaveLength(1)
    expect(errorEntries[0]?.message).toBe('trpc.request-handler.unclassified-error')
    expect(errorEntries[0]?.context?.['requestId']).toBe(harness.context.requestId)
    expect(errorEntries[0]?.context?.['trpcCode']).toBe('INTERNAL_SERVER_ERROR')
    expect(errorEntries[0]?.context?.['message']).toBe(rawMessage)
    expect(typeof errorEntries[0]?.context?.['stack']).toBe('string')

    // AYIRT EDİLEBİLİRLİK (M6(2) + M6'nın "ayırt edilebilir olduğu
    // gösterildi" DoD maddesi): bu ANOMALİ senaryosunun `warn`'ı yukarıdaki
    // "bilinmeyen prosedür" (rutin çerçeve hatası, NOT_FOUND/404) testinin
    // `warn`'ından `trpcCode`/`httpStatus` üzerinden AYRIŞIR — aynı
    // `{requestId}` yalnız başına bu ayrımı YAPAMAZDI (M6 bulgu (a)).
    const warnEntries = harness.logger.entries.filter((entry) => entry.level === 'warn')

    expect(warnEntries).toHaveLength(1)
    expect(warnEntries[0]?.context).toEqual({
      requestId: harness.context.requestId,
      trpcCode: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
    })
  })
})

// @arkesoft/trpc — `appErrorBoundary`'nin `logAppError`'ı `AppError.context`'i
// `redactDeep()` ÜZERİNDEN loglar (ROADMAP v0.0.17, T-028/S9, borç :3957/L-11)
//
// ⚠⚠ GEREKÇE (`trpc.ts`'teki dosya başı yorumuyla AYNI): bu sürümden itibaren
// `AppError.context` İLK KEZ süreç dışına (Sentry zarfı, S5'in
// `captureAppError`'ı) taşınıyor — bugünkü "ulaşılamaz" sızıntı sınıfı
// "ulaşılabilir" hâle geliyor. `redactDeep()`'in KENDİSİ zaten
// `packages/errors`'ta (AC-59, `redaction.test.ts`) iki yönlü mutasyon
// kanıtıyla ölçüldü; bu dosya onu TEKRARLAMAZ — onun yerine `trpc.ts`'in
// `logAppError`'ının `redactDeep`'i GERÇEKTEN ÇAĞIRDIĞINI (kablolama/wiring)
// ölçer.
//
// ⚠⚠ İKİ YÖNLÜ MUTASYON KANITI (handoff raporunda koşturularak doğrulandı,
// bu dosyada KALICI OLARAK TUTULMAZ): `trpc.ts`'teki `logAppError`'da
// `context: redactDeep(appError.context)` satırı geçici olarak
// `context: appError.context` ile DEĞİŞTİRİLDİ → aşağıdaki test KIRMIZI
// göründü (ham sentinel sır alanında BİREBİR göründü) → `Edit` ile geri
// alındı → yeşile döndü. Vacuity kanıtı budur; kontrol GERÇEKTEN çalışıyor.

import { AppError } from '@arkesoft/errors'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createHarness } from './harness.js'
import type { RecordedLog } from './harness.js'

/** Hata sınırının yazdığı TEK kaydın olay adı — `trpc.ts`'teki üretim sabitinden KOPYA. */
const BOUNDARY_LOG_EVENT = 'trpc.error-boundary.app-error'

/** Derinlik-3'teki sır/zararsız alanları ayırt etmek için kullanılan tekil işaret. */
const DEEP_SECRET_SENTINEL = 'X-L11-DEEP-SECRET-7a2f'

/** Hata sınırı kaydının iş alanlarının ÖLÇÜLEN şekli. */
const BOUNDARY_PAYLOAD_SCHEMA = z.object({
  code: z.string(),
  httpStatus: z.number(),
  isRetryable: z.boolean(),
  context: z.record(z.string(), z.unknown()),
})

/**
 * `context`'i DERİNLİK-3'TE bir sır (`token`, `SECRET_FIELD_NAMES`'in bir
 * üyesi) VE zararsız bir alanı BİRLİKTE taşıyan test-yerel bir `AppError`.
 * `packages/trpc` hiçbir hata sınıfı TANIMLAMAZ — bu sınıf yalnızca bu
 * dosyada yaşar (`harness.ts`'teki test-yerel sınıfların AYNI deseni).
 */
class HarnessDeepSecretContextError extends AppError {
  constructor() {
    super({
      code: 'HARNESS_DEEP_SECRET_CONTEXT',
      httpStatus: 404,
      userMessageKey: 'errors.harness.deepSecretContext',
      context: {
        level1: {
          level2: {
            level3: {
              token: DEEP_SECRET_SENTINEL,
              harmlessField: DEEP_SECRET_SENTINEL,
            },
          },
        },
      },
    })
  }
}

/** Verilen olay adına sahip kayıtları süzer (`app-error-boundary-logging.test.ts`'in AYNI yardımcısı). */
function entriesFor(entries: readonly RecordedLog[], message: string): RecordedLog[] {
  return entries.filter((entry) => entry.message === message)
}

describe('appErrorBoundary — AppError.context redactDeep() ÜZERİNDEN loglanır (L-11)', () => {
  it(
    'derinlik-3teki bir sır alanı SINIR KAYDINDA düz metin olarak SIZMAZ ' +
      '(pozitif kontrol dahil — vakumla her şey silinmedi)',
    async () => {
      const harness = createHarness({
        tenantRead: {
          findSummary: () => Promise.reject(new HarnessDeepSecretContextError()),
        },
      })

      await harness.rawRequest('tenant.current')

      const boundaryEntries = entriesFor(harness.logger.entries, BOUNDARY_LOG_EVENT)
      expect(boundaryEntries).toHaveLength(1)
      const [entry] = boundaryEntries
      if (entry === undefined) {
        throw new Error('hata sınırı kaydı bulunamadı')
      }

      // 4xx (404) → `warn` — bu testin ODAĞI DEĞİL (R-PO3 ayrı testte
      // ölçülüyor), yalnızca kaydın GERÇEKTEN yazıldığının ikinci kanıtı.
      expect(entry.level).toBe('warn')

      const payload = BOUNDARY_PAYLOAD_SCHEMA.parse(entry.context)
      const serializedContext = JSON.stringify(payload.context)

      // Pozitif kontrol: zararsız alanda sentinel HÂLÂ görünür — `redactDeep`
      // her şeyi vakumla silmiyor, yalnızca SIR ADINI taşıyan alanı.
      expect(serializedContext).toContain(`"harmlessField":"${DEEP_SECRET_SENTINEL}"`)
      // Sır alanı (`token`) redakte edildi.
      expect(serializedContext).toContain('"token":"[redacted]"')
      // ⚠⚠ Ham sentinel TAM OLARAK BİR KEZ görünür (zararsız alanda) — sır
      // alanındaki ham DEĞER hiçbir yere SIZMADI. Kontrol kaldırılsaydı bu
      // sayı İKİ olurdu (ham sentinel ayrıca `token` altında da görünürdü) —
      // bu assert'in boşa-çıkmama (vacuity) gücü budur.
      expect(serializedContext.split(DEEP_SECRET_SENTINEL).length - 1).toBe(1)
    },
  )
})

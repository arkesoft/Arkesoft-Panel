// @arkesoft/errors — `qa` gate (T-028, tur 2) — EKSİK SENARYO testi.
//
// Kaynak: `solid` gate tur 2 bulgusu "yeni medium-1" —
// `.claude/workflow/reviews/T-028-solid-tur2.md` (ve Task dosyası
// `.claude/workflow/tasks/T-028.md:2367-2386`).
//
// `redactDeep`'in KENDİ JSDoc'u (`redaction.ts:271-272`) şunu TAŞIYICI bir
// değişmez olarak beyan eder: "YENİ bir değer döner — girdi MUTASYONA
// UĞRAMAZ." Bu değişmez ÜÇ dosyada tüketicisi tarafından VARSAYILIR
// (`observability/sentry.ts` — `redactedErrorContext`'in YANINDA
// `error.context`'in KENDİSİ de Sentry zarfının `exception`/`extra`
// alanlarına GİDER; `errors/error-mapping.ts:95`; `packages/trpc/src/
// trpc.ts:200`) — ama BU DOSYAYA KADAR bunu doğrudan ölçen hiçbir test
// YOKTU. `sentry-invariants.test.ts:494`'teki `expectedRedactedContext =
// redactDeep(rawContext)` deseni de bu değişmezi KORUMAZ: beklenen değer
// `captureAppError` koştuktan SONRA AYNI `rawContext` referansından
// hesaplanıyor — `rawContext` mutasyona uğramış olsaydı bile `redactDeep`
// onu YİNE AYNI (mutasyona uğramış) hâliyle redakte eder ve test YEŞİL
// kalırdı (karşılaştırma kendi kendine döngüsel).
//
// Bu dosya değişmezi DOĞRUDAN, girdiyi ÖNCE/SONRA karşılaştırarak pinler.

import { describe, expect, it } from 'vitest'

import { redactDeep } from '../redaction.js'

describe('redactDeep — girdi MUTASYONA UĞRAMAZ (solid tur2 "yeni medium-1" — eksik test)', () => {
  it('tek seviyeli bir sır alanı redakte edildikten SONRA, orijinal girdi nesnesi DEĞİŞMEMİŞ olur', () => {
    const input = { token: 'cok-gizli-deger', safe: 1 }
    const snapshotBeforeCall = JSON.stringify(input)

    redactDeep(input)

    expect(JSON.stringify(input)).toBe(snapshotBeforeCall)
    expect(input.token).toBe('cok-gizli-deger')
  })

  it('iç içe (nested) bir sır alanı redakte edildikten SONRA, orijinal İÇ İÇE nesne DE değişmemiş olur', () => {
    const input = { nested: { cvv: '123', harmless: 'x' }, top: 'y' }
    const snapshotBeforeCall = JSON.stringify(input)

    const result = redactDeep(input) as { nested: { cvv: string } }

    // Çıktı GERÇEKTEN redakte edilmiş (vacuity karşıtı — aksi hâlde aşağıdaki
    // "girdi değişmedi" sonucu "fonksiyon hiçbir şey yapmadı" ile KARIŞABİLİR).
    expect(result.nested.cvv).toBe('[redacted]')

    expect(JSON.stringify(input)).toBe(snapshotBeforeCall)
    expect(input.nested.cvv).toBe('123')
  })

  it('dönen değer, girdiden BAĞIMSIZ bir referanstır (kök VE iç içe nesne için) — paylaşılan mutasyon kanalı YOK', () => {
    const input = { nested: { token: 'x' } }
    const result = redactDeep(input) as { nested: unknown }

    expect(result).not.toBe(input)
    expect(result.nested).not.toBe(input.nested)
  })

  it('dizi içindeki bir sır alanı redakte edildikten SONRA, orijinal dizi/eleman DEĞİŞMEMİŞ olur', () => {
    const input = { items: [{ password: 'p1' }, { harmless: 'ok' }] }
    const snapshotBeforeCall = JSON.stringify(input)

    redactDeep(input)

    expect(JSON.stringify(input)).toBe(snapshotBeforeCall)
    expect(input.items[0]?.password).toBe('p1')
  })
})

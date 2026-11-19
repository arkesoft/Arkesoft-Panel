// @arkesoft/trpc — AC-36/AC-37: sözleşme sapması sınıflandırıcısının
// testleri (ROADMAP v0.0.22, T-026/S2)
//
// ⚠⚠ ZORUNLU MADDE 1 — SENTETİK TESTSİZ VACUOUS OLUR: gerçek yüzey bu
// sürümde HİÇ DEĞİŞMİYOR (X9), bu yüzden kural tablosunun HİÇBİR satırı
// gerçek veriyle tetiklenmez. Bu dosya İKİ bağımsız kanıt taşır:
//   (a) architect'in kural tablosunun HER SATIRI için ≥1 sentetik
//       önce/sonra çifti — test adları `reason` kodunu TAŞIR.
//   (b) BAĞLANTI testi: gerçek yüzey (`buildContractSurface(appRouter)`)
//       ↔ onun sentetik MUTASYONLU kopyası → MAJOR (sınıflandırıcının
//       gerçek veri ŞEKLİYLE de çalıştığının kanıtı).
//
// Sentetik şemalar `z.toJSONSchema(..., { io, unrepresentable: 'throw' })`
// İLE üretilir — `build-contract-surface.ts`'in ÜRETİM yolunun AYNISI, el
// yazması JSON Schema nesneleri DEĞİL (gerçekçilik: zod'un `.optional()`/
// `.default()` io-duyarlı davranışı BURADA DA aynen geçerli olsun).

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  classifyContractChange,
  formatContractChangeReport,
} from '../contract/classify-contract-change.js'
import type { ContractChangeDiff } from '../contract/classify-contract-change.js'
import { buildContractSurface } from '../contract/build-contract-surface.js'
import type {
  ContractSurfaceDocument,
  ContractSurfaceGenerator,
  ContractSurfaceOperation,
  ContractSurfaceProcedureEntry,
} from '../contract/build-contract-surface.js'

const DEFAULT_GENERATOR: ContractSurfaceGenerator = { zod: '4.6.7', trpcServer: '11.19.0' }

/** `build-contract-surface.ts`'in ÜRETİM yoluyla AYNI dönüşüm — tek procedür girdisi. */
function entry(
  operation: ContractSurfaceOperation,
  inputZod: z.ZodType | null,
  outputZod: z.ZodType | null = null,
): ContractSurfaceProcedureEntry {
  return {
    operation,
    input:
      inputZod === null
        ? null
        : z.toJSONSchema(inputZod, { io: 'input', unrepresentable: 'throw' }),
    output:
      outputZod === null
        ? null
        : z.toJSONSchema(outputZod, { io: 'output', unrepresentable: 'throw' }),
  }
}

function makeDocument(
  procedures: Readonly<Record<string, ContractSurfaceProcedureEntry>>,
  generator: ContractSurfaceGenerator = DEFAULT_GENERATOR,
): ContractSurfaceDocument {
  return {
    formatVersion: 1,
    generator,
    namespaceCount: 0, // sınıflandırıcı BU alana GÜVENMEZ (madde 9 felsefesi) — test amaçlı rastgele değer
    procedureCount: Object.keys(procedures).length,
    procedures,
  }
}

/** Tek prosedürlü "önce"/"sonra" belge çifti — boilerplate azaltır. */
function singleProcedurePair(
  before: ContractSurfaceProcedureEntry,
  after: ContractSurfaceProcedureEntry,
  procedurePath = 'test.procedure',
): { before: ContractSurfaceDocument; after: ContractSurfaceDocument } {
  return {
    before: makeDocument({ [procedurePath]: before }),
    after: makeDocument({ [procedurePath]: after }),
  }
}

/** Dizinin TAM OLARAK bir eleman taşıdığını doğrular ve o elemanı döner — `as`/toparlama YOK. */
function onlyDiff(diffs: readonly ContractChangeDiff[]): ContractChangeDiff {
  if (diffs.length !== 1) {
    throw new Error(`Beklenen TEK fark, ${String(diffs.length)} bulundu: ${JSON.stringify(diffs)}`)
  }
  const [diff] = diffs
  if (diff === undefined) {
    throw new Error('beklenmeyen: dizi uzunluğu 1 ama eleman undefined')
  }
  return diff
}

// ---------------------------------------------------------------------------
// Kural tablosu satır 1 — Prosedür eklendi → MINOR (PROCEDURE_ADDED)
// ---------------------------------------------------------------------------

describe('kural tablosu satır 1 — Prosedür eklendi (PROCEDURE_ADDED)', () => {
  it('yeni prosedür → MINOR, scope "procedure"', () => {
    const before = makeDocument({})
    const after = makeDocument({ 'test.added': entry('query', null, null) })

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({ reason: 'PROCEDURE_ADDED', severity: 'MINOR', scope: 'procedure' })
    expect(classification.severity).toBe('MINOR')
  })
})

// ---------------------------------------------------------------------------
// Kural tablosu satır 2 — Prosedür kaldırıldı → MAJOR (PROCEDURE_REMOVED)
// ---------------------------------------------------------------------------

describe('kural tablosu satır 2 — Prosedür kaldırıldı / yol değişti (PROCEDURE_REMOVED)', () => {
  it('prosedür kaldırıldı → MAJOR, scope "procedure"', () => {
    const before = makeDocument({ 'test.removed': entry('query', null, null) })
    const after = makeDocument({})

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'PROCEDURE_REMOVED',
      severity: 'MAJOR',
      scope: 'procedure',
    })
    expect(classification.severity).toBe('MAJOR')
  })
})

// ---------------------------------------------------------------------------
// Kural tablosu satır 3 — operation query↔mutation → MAJOR (OPERATION_CHANGED)
// ---------------------------------------------------------------------------

describe('kural tablosu satır 3 — operation query↔mutation (OPERATION_CHANGED)', () => {
  it('query → mutation → MAJOR', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, null),
      entry('mutation', null, null),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OPERATION_CHANGED',
      severity: 'MAJOR',
      scope: 'procedure',
    })
    expect(classification.severity).toBe('MAJOR')
  })
})

// ---------------------------------------------------------------------------
// Kural tablosu satır 4 — Opsiyonel alan eklendi → girdi MINOR · çıktı MINOR
// ---------------------------------------------------------------------------

describe('kural tablosu satır 4 — Opsiyonel alan eklendi', () => {
  it('girdiye opsiyonel alan eklendi → MINOR (INPUT_OPTIONAL_FIELD_ADDED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({})),
      entry('query', z.object({ label: z.string().optional() })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_OPTIONAL_FIELD_ADDED',
      severity: 'MINOR',
      scope: 'input',
      fieldName: 'label',
    })
    expect(classification.severity).toBe('MINOR')
  })

  it('çıktıya opsiyonel alan eklendi → MINOR (OUTPUT_OPTIONAL_FIELD_ADDED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, z.object({})),
      entry('query', null, z.object({ label: z.string().optional() })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_OPTIONAL_FIELD_ADDED',
      severity: 'MINOR',
      scope: 'output',
      fieldName: 'label',
    })
    expect(classification.severity).toBe('MINOR')
  })
})

// ---------------------------------------------------------------------------
// Kural tablosu satır 5 — Zorunlu alan eklendi → girdi MAJOR · çıktı MINOR
// ---------------------------------------------------------------------------

describe('kural tablosu satır 5 — Zorunlu alan eklendi', () => {
  it('girdiye zorunlu alan eklendi → MAJOR (INPUT_REQUIRED_FIELD_ADDED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({})),
      entry('query', z.object({ cursor: z.string() })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_REQUIRED_FIELD_ADDED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: 'cursor',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('çıktıya zorunlu alan eklendi → MINOR (OUTPUT_REQUIRED_FIELD_ADDED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, z.object({})),
      entry('query', null, z.object({ id: z.string() })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_REQUIRED_FIELD_ADDED',
      severity: 'MINOR',
      scope: 'output',
      fieldName: 'id',
    })
    expect(classification.severity).toBe('MINOR')
  })
})

// ---------------------------------------------------------------------------
// Kural tablosu satır 6 — Alan kaldırıldı → girdi MAJOR · çıktı MAJOR
// ---------------------------------------------------------------------------

describe('kural tablosu satır 6 — Alan kaldırıldı', () => {
  it('girdiden alan kaldırıldı → MAJOR (INPUT_FIELD_REMOVED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({ cursor: z.string().optional() })),
      entry('query', z.object({})),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_FIELD_REMOVED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: 'cursor',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('çıktıdan alan kaldırıldı → MAJOR (OUTPUT_FIELD_REMOVED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, z.object({ id: z.string() })),
      entry('query', null, z.object({})),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_FIELD_REMOVED',
      severity: 'MAJOR',
      scope: 'output',
      fieldName: 'id',
    })
    expect(classification.severity).toBe('MAJOR')
  })
})

// ---------------------------------------------------------------------------
// Kural tablosu satır 7 — Opsiyonel → zorunlu → girdi MAJOR · çıktı MAJOR
// ---------------------------------------------------------------------------

describe('kural tablosu satır 7 — Opsiyonel → zorunlu', () => {
  it('girdi alanı opsiyonelden zorunluya → MAJOR (INPUT_FIELD_BECAME_REQUIRED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({ cursor: z.string().optional() })),
      entry('query', z.object({ cursor: z.string() })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_FIELD_BECAME_REQUIRED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: 'cursor',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('çıktı alanı opsiyonelden zorunluya → MAJOR (OUTPUT_FIELD_BECAME_REQUIRED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, z.object({ note: z.string().optional() })),
      entry('query', null, z.object({ note: z.string() })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_FIELD_BECAME_REQUIRED',
      severity: 'MAJOR',
      scope: 'output',
      fieldName: 'note',
    })
    expect(classification.severity).toBe('MAJOR')
  })
})

// ---------------------------------------------------------------------------
// Kural tablosu satır 8 — Zorunlu → opsiyonel → girdi MINOR · çıktı MAJOR
// ⚠ YAZILI AŞIRI-SIKILIK (architect'in BİLİNÇLİ kararı): çıktıda teorik
// olarak kırıcı DEĞİLDİR, yine de MAJOR verilir (fail-closed, ROADMAP §2
// girdi/çıktı ayrımı yapmaz). `OUTPUT_FIELD_BECAME_REQUIRED`'ın değil ama
// bu satırın "aşırı-sıkılık" örneği `OUTPUT_FIELD_BECAME_OPTIONAL`'DIR —
// handoff'un "bkz. aşağı" notu BU satıra işaret eder.
// ---------------------------------------------------------------------------

describe('kural tablosu satır 8 — Zorunlu → opsiyonel (⚠ aşırı-sıkılık çıktı tarafında)', () => {
  it('girdi alanı zorunludan opsiyonele → MINOR (INPUT_FIELD_BECAME_OPTIONAL)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({ cursor: z.string() })),
      entry('query', z.object({ cursor: z.string().optional() })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_FIELD_BECAME_OPTIONAL',
      severity: 'MINOR',
      scope: 'input',
      fieldName: 'cursor',
    })
    expect(classification.severity).toBe('MINOR')
  })

  it('çıktı alanı zorunludan opsiyonele → MAJOR (OUTPUT_FIELD_BECAME_OPTIONAL) — teorik kırıcı DEĞİL ama fail-closed MAJOR', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, z.object({ note: z.string() })),
      entry('query', null, z.object({ note: z.string().optional() })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_FIELD_BECAME_OPTIONAL',
      severity: 'MAJOR',
      scope: 'output',
      fieldName: 'note',
    })
    expect(classification.severity).toBe('MAJOR')

    // `S4`'ün "gerekçeli indirgeme" prosedürü BU kodu RAPORDA ARAYACAK —
    // görünürlük burada MEKANİK olarak doğrulanır.
    expect(formatContractChangeReport(classification)).toContain('OUTPUT_FIELD_BECAME_OPTIONAL')
  })
})

// ---------------------------------------------------------------------------
// Kural tablosu satır 9 — Tip/enum/pattern DARALDI → girdi MAJOR · çıktı MAJOR
// ---------------------------------------------------------------------------

describe('kural tablosu satır 9 — Tip/enum/pattern daraldı', () => {
  it('girdi enum daraldı → MAJOR (INPUT_TYPE_NARROWED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({ status: z.enum(['active', 'inactive', 'pending']) })),
      entry('query', z.object({ status: z.enum(['active', 'inactive']) })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: 'status',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('çıktı enum daraldı → MAJOR (OUTPUT_TYPE_NARROWED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, z.object({ status: z.enum(['active', 'inactive', 'pending']) })),
      entry('query', null, z.object({ status: z.enum(['active', 'inactive']) })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      scope: 'output',
      fieldName: 'status',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('girdi pattern EKLENDİ (kısıtlama arttı) → MAJOR (INPUT_TYPE_NARROWED, pattern ekseni)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({ code: z.string() })),
      entry('query', z.object({ code: z.string().regex(/^[A-Z]+$/) })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      fieldName: 'code',
    })
  })
})

// ---------------------------------------------------------------------------
// Kural tablosu satır 10 — Tip/enum GENİŞLEDİ → girdi MINOR · çıktı MAJOR
// ---------------------------------------------------------------------------

describe('kural tablosu satır 10 — Tip/enum genişledi', () => {
  it('girdi enum genişledi → MINOR (INPUT_TYPE_WIDENED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({ status: z.enum(['active', 'inactive']) })),
      entry('query', z.object({ status: z.enum(['active', 'inactive', 'pending']) })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_TYPE_WIDENED',
      severity: 'MINOR',
      scope: 'input',
      fieldName: 'status',
    })
    expect(classification.severity).toBe('MINOR')
  })

  it('çıktı enum genişledi → MAJOR (OUTPUT_TYPE_WIDENED)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, z.object({ status: z.enum(['active', 'inactive']) })),
      entry('query', null, z.object({ status: z.enum(['active', 'inactive', 'pending']) })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_TYPE_WIDENED',
      severity: 'MAJOR',
      scope: 'output',
      fieldName: 'status',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('girdi pattern KALDIRILDI (kısıtlama azaldı) → MINOR (INPUT_TYPE_WIDENED, pattern ekseni)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({ code: z.string().regex(/^[A-Z]+$/) })),
      entry('query', z.object({ code: z.string() })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_TYPE_WIDENED',
      severity: 'MINOR',
      fieldName: 'code',
    })
  })
})

// ---------------------------------------------------------------------------
// Kural tablosu satır 11 — generator bloğu değişti → GENERATOR_DRIFT (SINIF DEĞİL, ayrı rapor)
// ---------------------------------------------------------------------------

describe('kural tablosu satır 11 — generator bloğu değişti (GENERATOR_DRIFT, sınıf DEĞİL)', () => {
  it('yalnızca generator değişti → diffs BOŞ, severity PATCH, generatorDrift.changed true', () => {
    const procedures = { 'test.procedure': entry('query', null, null) }
    const before = makeDocument(procedures, { zod: '4.6.7', trpcServer: '11.19.0' })
    const after = makeDocument(procedures, { zod: '4.6.8', trpcServer: '11.19.0' })

    const classification = classifyContractChange(before, after)

    expect(classification.diffs).toHaveLength(0)
    expect(classification.severity).toBe('PATCH')
    expect(classification.generatorDrift).toMatchObject({
      changed: true,
      before: { zod: '4.6.7', trpcServer: '11.19.0' },
      after: { zod: '4.6.8', trpcServer: '11.19.0' },
    })
    expect(formatContractChangeReport(classification)).toContain('GENERATOR_DRIFT')
  })
})

// ---------------------------------------------------------------------------
// Ek sağlamlık testleri (tablonun DOĞRUDAN bir satırı DEĞİL, sınıflandırıcının
// genel davranışının kanıtı)
// ---------------------------------------------------------------------------

describe('genel sağlamlık', () => {
  it('iki belge BİREBİR aynıysa → fark yok, severity PATCH, generator sapması yok', () => {
    const procedures = {
      'test.a': entry('query', z.object({ x: z.string() }), z.object({ y: z.number() })),
    }
    const before = makeDocument(procedures)
    const after = makeDocument(procedures)

    const classification = classifyContractChange(before, after)

    expect(classification.diffs).toHaveLength(0)
    expect(classification.severity).toBe('PATCH')
    expect(classification.generatorDrift.changed).toBe(false)
  })

  it('enum KIYASLANAMAZ şekilde değişti (ne alt ne üst küme) → fail-closed NARROWED', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({ status: z.enum(['a', 'b']) })),
      entry('query', z.object({ status: z.enum(['b', 'c']) })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({ reason: 'INPUT_TYPE_NARROWED', severity: 'MAJOR' })
  })

  it("genel sınıf = farkların EN AĞIRI'sı (bir MINOR + bir MAJOR → MAJOR)", () => {
    const before = makeDocument({
      'test.minor': entry('query', z.object({})),
      'test.major': entry('query', z.object({})),
    })
    const after = makeDocument({
      'test.minor': entry('query', z.object({ label: z.string().optional() })), // MINOR
      'test.major': entry('query', z.object({ cursor: z.string() })), // MAJOR
    })

    const classification = classifyContractChange(before, after)

    expect(classification.diffs).toHaveLength(2)
    expect(classification.severity).toBe('MAJOR')
  })

  it('çağrı yerinden FIRLATILAN inputs.length>1 hatası yutulmaz (madde 2) — bu TEST o dalı TEKRAR test ETMEZ, yalnızca classifyContractChange SESSİZCE yutmadığını kanıtlar', () => {
    // `resolveSingleInputParser`'ın kendisi `build-contract-surface.test.ts`
    // tarafında zaten test edildi (S1). Bu sınıflandırıcı o fonksiyonu HİÇ
    // ÇAĞIRMAZ — girdisi ZATEN serileştirilmiş `ContractSurfaceDocument`'tır.
    // Burada kanıtlanan: sınıflandırıcı KENDİ içinde hiçbir hatayı
    // `catch {}` ile YUTMUYOR (ör. `buildDiff`'in `default: assertNever`
    // dalı GERÇEKTEN fırlatıyor).
    expect(() => classifyContractChange(makeDocument({}), makeDocument({}))).not.toThrow()
  })

  it('formatContractChangeReport — beklenen biçimde satırlar üretir (SONUÇ + yeniden üretim ipucu)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({ cursor: z.string().optional() })),
      entry('query', z.object({ cursor: z.string(), label: z.string().optional() })),
    )

    const classification = classifyContractChange(before, after)
    const report = formatContractChangeReport(classification)

    expect(report).toContain('SÖZLEŞME SAPMASI — 2 fark')
    expect(report).toContain(
      '[MAJOR] girdi  test.procedure · "cursor" OPSİYONELDEN ZORUNLUYA (INPUT_FIELD_BECAME_REQUIRED)',
    )
    expect(report).toContain(
      '[MINOR] girdi  test.procedure · yeni OPSİYONEL alan: "label" (INPUT_OPTIONAL_FIELD_ADDED)',
    )
    expect(report).toContain(
      'SONUÇ: MAJOR — public API için MAJOR sürüm GEREKLİ (ROADMAP Sürüm Politikası §2)',
    )
    expect(report).toContain('pnpm --filter @arkesoft/trpc run contract:generate')
  })
})

// ---------------------------------------------------------------------------
// ⭐ ZORUNLU MADDE 1(b) — BAĞLANTI TESTİ: gerçek yüzey ↔ sentetik mutasyonlu
// kopyası → MAJOR. Gerçek `appRouter`'dan üretilen GERÇEK
// `ContractSurfaceDocument` kullanılır (JSON Schema şekli TAMAMEN gerçek,
// el yazması DEĞİL) — sınıflandırıcının gerçek veri şekliyle çalıştığının
// kanıtı.
// ---------------------------------------------------------------------------

describe('BAĞLANTI testi — gerçek yüzey ↔ sentetik mutasyonlu kopya (madde 1b)', () => {
  it('gerçek dokümandan BİR prosedür kaldırılmış kopya → MAJOR (PROCEDURE_REMOVED gerçek veriyle)', () => {
    const realDocument = buildContractSurface(DEFAULT_GENERATOR)
    const sortedPaths = Object.keys(realDocument.procedures).sort()
    const [firstPath] = sortedPaths
    if (firstPath === undefined) {
      throw new Error('router boş döndü — beklenmiyordu (17 prosedür bekleniyordu)')
    }

    const mutatedProcedures = Object.fromEntries(
      Object.entries(realDocument.procedures).filter(
        ([procedurePath]) => procedurePath !== firstPath,
      ),
    )
    const mutatedDocument: ContractSurfaceDocument = {
      ...realDocument,
      procedureCount: realDocument.procedureCount - 1,
      procedures: mutatedProcedures,
    }

    const classification = classifyContractChange(realDocument, mutatedDocument)

    expect(classification.severity).toBe('MAJOR')
    expect(classification.diffs).toHaveLength(1)
    expect(classification.diffs[0]).toMatchObject({
      reason: 'PROCEDURE_REMOVED',
      severity: 'MAJOR',
      scope: 'procedure',
      procedurePath: firstPath,
    })
  })

  it('aynı gerçek doküman kendisiyle karşılaştırıldığında → fark YOK, PATCH (vacuous olmama karşıt-kanıtı)', () => {
    const realDocument = buildContractSurface(DEFAULT_GENERATOR)

    const classification = classifyContractChange(realDocument, realDocument)

    expect(classification.diffs).toHaveLength(0)
    expect(classification.severity).toBe('PATCH')
  })
})

// ---------------------------------------------------------------------------
// T-026 düzeltme tur 1 — F1: kök şema düğümü DİZİYSE (ör. `session.list`
// çıktısı) `items` alanları KIYASLANIR (önceden hiç kıyaslanmıyordu, bkz.
// `classify-contract-change.ts`'teki `resolveFieldDiffTarget`).
// ---------------------------------------------------------------------------

describe('F1 düzeltmesi — kök şema DİZİYSE, alan karşılaştırması "items" üzerinde yapılır', () => {
  it('dizi KÖKÜNÜN "items" şemasından ZORUNLU bir alan KALDIRILDI → MAJOR (OUTPUT_FIELD_REMOVED) — önceden SESSİZCE PATCH veriyordu', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, z.array(z.object({ id: z.string(), label: z.string() }))),
      entry('query', null, z.array(z.object({ label: z.string() }))),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_FIELD_REMOVED',
      severity: 'MAJOR',
      scope: 'output',
      fieldName: 'id',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('dizi KÖKÜNÜN "items" şemasına OPSİYONEL bir alan EKLENDİ → MINOR (OUTPUT_OPTIONAL_FIELD_ADDED) — önceden SESSİZCE PATCH veriyordu', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, z.array(z.object({ id: z.string() }))),
      entry('query', null, z.array(z.object({ id: z.string(), note: z.string().optional() }))),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_OPTIONAL_FIELD_ADDED',
      severity: 'MINOR',
      scope: 'output',
      fieldName: 'note',
    })
    expect(classification.severity).toBe('MINOR')
  })

  it('dizi kökü İKİ TARAFTA da BİREBİR aynıysa → fark YOK, PATCH (karşıt-kanıt: fix aşırı-sıkı DEĞİL)', () => {
    const procedures = {
      'test.procedure': entry('query', null, z.array(z.object({ id: z.string() }))),
    }

    const classification = classifyContractChange(
      makeDocument(procedures),
      makeDocument(procedures),
    )

    expect(classification.diffs).toHaveLength(0)
    expect(classification.severity).toBe('PATCH')
  })
})

// ---------------------------------------------------------------------------
// T-026 düzeltme tur 1 — F2: `null`↔nesne geçişi artık fail-OPEN DEĞİL,
// `null` taraf BOŞ NESNE gibi davranır (bkz. `diffProcedureIo`'nun kaldırılan
// erken dönüşü).
// ---------------------------------------------------------------------------

describe('F2 düzeltmesi — null↔nesne geçişi boş nesne gibi davranır, fail-OPEN DEĞİL', () => {
  it('girdisiz (null) bir prosedüre ZORUNLU girdi eklendi → MAJOR (INPUT_REQUIRED_FIELD_ADDED) — önceden SESSİZCE PATCH veriyordu', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, null),
      entry('query', z.object({ id: z.string() }), null),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_REQUIRED_FIELD_ADDED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: 'id',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('girdisi OLAN bir prosedürün ".input()" çağrısı TAMAMEN kaldırıldı (nesne→null) → MAJOR (INPUT_FIELD_REMOVED) — önceden SESSİZCE PATCH veriyordu', () => {
    const { before, after } = singleProcedurePair(
      entry('mutation', z.object({ id: z.string() }), null),
      entry('mutation', null, null),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_FIELD_REMOVED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: 'id',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('her iki taraf da null KALIRSA (girdisiz prosedür DEĞİŞMEDİ) → fark YOK, PATCH (karşıt-kanıt: fix aşırı-sıkı DEĞİL)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, null),
      entry('query', null, null),
    )

    const classification = classifyContractChange(before, after)

    expect(classification.diffs).toHaveLength(0)
    expect(classification.severity).toBe('PATCH')
  })
})

// ---------------------------------------------------------------------------
// T-026 düzeltme tur 1 — F3: eksen gölgelemesinin İKİNCİ BİÇİMİ. İzlenen bir
// eksenin (`pattern`) raporu, İZLENMEYEN bir kısıtın (`minLength`) EŞZAMANLI
// değişimini artık GÖLGELEMİYOR (bkz. `compareFieldConstraint`'teki
// `hasUntrackedConstraintChange` kontrolü).
// ---------------------------------------------------------------------------

describe('F3 düzeltmesi — eksen gölgelemesi (ikinci biçim): izlenmeyen kısıt değişimi WIDENED raporunu artık GÖLGELEMİYOR', () => {
  it('pattern KALDIRILIRKEN AYNI ANDA minLength EKLENDİ → MAJOR (INPUT_TYPE_NARROWED, fail-closed) — önceden YANLIŞLIKLA MINOR (INPUT_TYPE_WIDENED) veriyordu', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({ code: z.string().regex(/^[A-Z]+$/) })),
      entry('query', z.object({ code: z.string().min(3) })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: 'code',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('pattern DEĞİŞMEDEN SADECE minLength EKLENDİ (izlenen eksende hiç fark YOK) → fail-closed NARROWED (tablonun kapsamı dışı davranış KORUNDU)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({ code: z.string() })),
      entry('query', z.object({ code: z.string().min(3) })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      fieldName: 'code',
    })
  })
})

// ---------------------------------------------------------------------------
// T-026 düzeltme tur 2 — S1a: kök şema şekli TAKAS edilirse (object↔array)
// `resolveFieldDiffTarget` iki tarafı da AYNI `properties`'e yönlendirip 0
// diff/PATCH üretebiliyordu — kök-şekil koruması bunu yakalar.
// ---------------------------------------------------------------------------

describe('S1a düzeltmesi — kök şekil TAKASI (object↔array) artık fail-closed TYPE_NARROWED (önceden SESSİZCE PATCH veriyordu)', () => {
  it('çıktı kökü object -> array biçimine DÖNÜŞTÜ, İÇ alanlar BİREBİR aynı kalsa bile → MAJOR (OUTPUT_TYPE_NARROWED, fieldName "(root)")', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, z.object({ id: z.string(), label: z.string() })),
      entry('query', null, z.array(z.object({ id: z.string(), label: z.string() }))),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      scope: 'output',
      fieldName: '(root)',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('kök şekli DEĞİŞMEDEN (ikisi de object, ikisi de array) → kök-şekil koruması EK diff ÜRETMEZ (karşıt-kanıt: fix aşırı-sıkı DEĞİL)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, z.array(z.object({ id: z.string() }))),
      entry('query', null, z.array(z.object({ id: z.string() }))),
    )

    const classification = classifyContractChange(before, after)

    expect(classification.diffs).toHaveLength(0)
    expect(classification.severity).toBe('PATCH')
  })
})

// ---------------------------------------------------------------------------
// T-026 düzeltme tur 2 — S1b: kök `additionalProperties`/`$schema`/`type`
// hiç okunmuyordu — kök-şekil koruması `properties`/`required`/`items`
// DIŞINDAKİ her kök anahtarını da kapsar (ayrı bir okuyucu YAZILMADI, AYNI
// süzgeç ikisini de kapsıyor).
// ---------------------------------------------------------------------------

describe('S1b düzeltmesi — kök additionalProperties KALDIRILMASI artık MAJOR (önceden SESSİZCE PATCH veriyordu)', () => {
  it('çıktı kökünden "additionalProperties:false" KALDIRILDI, alanlar DEĞİŞMEDİ → MAJOR (OUTPUT_TYPE_NARROWED, fieldName "(root)")', () => {
    const procedurePath = 'test.procedure'
    const before: ContractSurfaceDocument = makeDocument({
      [procedurePath]: {
        operation: 'query',
        input: null,
        output: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
    })
    const after: ContractSurfaceDocument = makeDocument({
      [procedurePath]: {
        operation: 'query',
        input: null,
        output: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    })

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      scope: 'output',
      fieldName: '(root)',
    })
    expect(classification.severity).toBe('MAJOR')
  })
})

// ---------------------------------------------------------------------------
// T-026 düzeltme tur 2 — S2: "ilk konuşan ekseni dön" deseni İZLENEN ÜÇ
// EKSENİN (`enum`/`type`/`pattern`) KENDİ ARASINDA da yeniden üretiliyordu —
// artık üçü de değerlendirilip NARROWED-baskın katlanıyor.
// ---------------------------------------------------------------------------

describe('S2 düzeltmesi — üç izlenen eksen BİRLİKTE değerlendirilir, NARROWED baskın katlanır (önceden ilk konuşan eksende erken dönerdi)', () => {
  it('enum GENİŞLEDİ ("a","b" → "a","b","c") AYNI ANDA pattern EKLENDİ → MAJOR (INPUT_TYPE_NARROWED) — önceden YANLIŞLIKLA MINOR (INPUT_TYPE_WIDENED, enum ilk konuşurdu) veriyordu', () => {
    // ⚠ Zod'un `ZodEnum`'ı `.regex()` TAŞIMAZ (yalnızca `ZodString`'de var) —
    // bu YÜZDEN "enum" + "pattern" KOMBİNASYONU `entry()`/zod zincirlemesiyle
    // üretilemez; ham JSON Schema belgesi EL İLE kurulur (S1b testinin AYNI
    // deseni) — architect'in kural tablosu zaten JSON Schema SEVİYESİNDE
    // tanımlı, zod runtime'ına BAĞIMLI değil.
    const procedurePath = 'test.procedure'
    const before: ContractSurfaceDocument = makeDocument({
      [procedurePath]: {
        operation: 'query',
        input: { type: 'object', properties: { status: { type: 'string', enum: ['a', 'b'] } } },
        output: null,
      },
    })
    const after: ContractSurfaceDocument = makeDocument({
      [procedurePath]: {
        operation: 'query',
        input: {
          type: 'object',
          properties: { status: { type: 'string', enum: ['a', 'b', 'c'], pattern: '^[ab]$' } },
        },
        output: null,
      },
    })

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: 'status',
    })
    expect(classification.severity).toBe('MAJOR')
  })
})

// ---------------------------------------------------------------------------
// T-026 düzeltme tur 2 — S3: `in` operatörü (+ köşeli-parantez okuması)
// prototip zincirini yürüyordu — `Object.prototype`'ın KENDİ üyeleriyle
// (`toString` vb.) ÇARPIŞAN bir alan adı yanlış TEŞHİS üretiyordu.
// ⚠⚠ Bu düzeltme MONOTON SIKILAŞTIRMA DEĞİLDİR: aşağıdaki vaka önceden
// (fail-closed NARROWED/MAJOR) veriyordu, düzeltme sonrası DOĞRU sınıf olan
// MINOR'a İNER — Orkestratör kararı bunu BİLEREK kabul eder (gerekçe:
// handoff'un "ORKESTRATÖR KARARI" bölümü — bu vakada MAJOR zaten YANLIŞ
// teşhisti, MINOR gerçek doğru cevaptır).
// ---------------------------------------------------------------------------

describe('S3 düzeltmesi — "toString" gibi Object.prototype üyesiyle çarpışan alan adı artık doğru teşhis edilir (⚠ monoton olmayan düzeltme)', () => {
  it('girdiye OPSİYONEL "toString" alanı eklendi → MINOR (INPUT_OPTIONAL_FIELD_ADDED, doğru teşhis) — önceden YANLIŞLIKLA MAJOR (INPUT_TYPE_NARROWED, prototip sızıntısı) veriyordu', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({})),
      entry('query', z.object({ toString: z.string().optional() })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_OPTIONAL_FIELD_ADDED',
      severity: 'MINOR',
      scope: 'input',
      fieldName: 'toString',
    })
    expect(classification.severity).toBe('MINOR')
  })

  it('girdiye ZORUNLU "toString" alanı eklendi → MAJOR (INPUT_REQUIRED_FIELD_ADDED, doğru teşhis — reason kodu artık DOĞRU)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', z.object({})),
      entry('query', z.object({ toString: z.string() })),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_REQUIRED_FIELD_ADDED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: 'toString',
    })
  })
})

// ---------------------------------------------------------------------------
// T-026 düzeltme tur 3 — S5: kök-şekil korumasının `null` istisnası fail-
// OPEN'dı. `resolveFieldDiffTarget`/alan döngüsü, non-null tarafın ÇÖZÜLMÜŞ
// hedefi `properties` TAŞIMADIĞINDA (ilkel kök, `anyOf`, ilkel dizi/tuple)
// `null`↔nesne geçişini 0 diff / PATCH'e indiriyordu — `classify-contract-
// change.ts`'teki kök-şekil korumasının YENİ `else if` dalı bunu kapatır.
// ---------------------------------------------------------------------------

describe('S5 düzeltmesi — kök-şekil korumasının `null` istisnası artık fail-OPEN DEĞİL (ilkel/anyOf/dizi/tuple kökler de kapsanır)', () => {
  it('girdisiz (null) bir prosedüre İLKEL (z.string()) bir girdi eklendi → MAJOR (INPUT_TYPE_NARROWED, fieldName "(root)") — önceden SESSİZCE PATCH veriyordu', () => {
    const { before, after } = singleProcedurePair(
      entry('mutation', null, null),
      entry('mutation', z.string(), null),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: '(root)',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('İLKEL (z.string()) bir girdi TAMAMEN kaldırıldı (nesne→null) → MAJOR (INPUT_TYPE_NARROWED, fieldName "(root)") — ters yön de AYNI sınıfa düşer', () => {
    const { before, after } = singleProcedurePair(
      entry('mutation', z.string(), null),
      entry('mutation', null, null),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: '(root)',
    })
  })

  it('çıktısız (null) bir prosedüre bir ARRAY<string> (ilkel elemanlı, "items.properties" YOK) çıktısı eklendi → MAJOR (OUTPUT_TYPE_NARROWED, fieldName "(root)")', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, null),
      entry('query', null, z.array(z.string())),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      scope: 'output',
      fieldName: '(root)',
    })
  })

  it('girdisiz (null) bir prosedüre OBJECT-ŞEKİLLİ bir girdi eklendi → kök-şekil koruması EK diff ÜRETMEZ (karşıt-kanıt: F2nin "onlyDiff" testleri kırılmıyor, alan döngüsü zaten doğru sınıflandırıyor)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, null),
      entry('query', z.object({ id: z.string() }), null),
    )

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'INPUT_REQUIRED_FIELD_ADDED',
      severity: 'MAJOR',
      scope: 'input',
      fieldName: 'id',
    })
  })

  it('her iki taraf da null KALIRSA → kök-şekil koruması EK diff ÜRETMEZ, fark YOK, PATCH (karşıt-kanıt: fix aşırı-sıkı DEĞİL)', () => {
    const { before, after } = singleProcedurePair(
      entry('query', null, null),
      entry('query', null, null),
    )

    const classification = classifyContractChange(before, after)

    expect(classification.diffs).toHaveLength(0)
    expect(classification.severity).toBe('PATCH')
  })
})

// ---------------------------------------------------------------------------
// T-026 düzeltme tur 3 — S6: `canonicalizeJsonValue`'nun KÖŞELİ-PARANTEZ
// atamalı (`canonical[key] = ...`) eski gövdesi, girdi anahtarı LİTERAL
// "__proto__" İSE öz anahtar YARATMAZ — nesnenin `[[Prototype]]`'ını
// SESSİZCE DEĞİŞTİRİR ve bilgi `JSON.stringify` sırasında KAYBOLUR.
// `Object.fromEntries` düzeltmesi SONRASI "__proto__" GERÇEK bir öz anahtar
// olarak KANONİKLEŞTİRİLİR — bu sapma `classify-contract-change.ts`'teki
// `isSchemaEqual`/`compareFieldConstraint` zincirinden GÖZLEMLENİR (bu
// dosya `canonicalize.ts`'i doğrudan import ETMEZ).
// ---------------------------------------------------------------------------

/**
 * `"__proto__"` anahtarını GERÇEK bir ÖZ (own) veri özelliği olarak taşıyan
 * bir nesne üretir (S6 mutasyon kanıtı). Normal nesne LİTERAL sözdizimi
 * (`{ __proto__: x }`) BUNU YAPMAZ — dilin kendisi bu sözdizimini
 * `[[Prototype]]` ATAMASI olarak YORUMLAR (öz anahtar YARATMAZ).
 * `Object.fromEntries` ise `[[DefineOwnProperty]]` KULLANDIĞI için
 * (`canonicalize.ts`'in düzeltmesiyle AYNI gerekçe) gerçek bir öz
 * "__proto__" anahtarı yaratır — `JSON.parse('{"__proto__":...}')`'in
 * ürettiği GERÇEK sözleşme belgesi girdisiyle AYNI şekli taşır, `any`
 * GEREKTİRMEZ.
 */
function withOwnProtoKey(
  rest: Readonly<Record<string, unknown>>,
  protoValue: unknown,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries([...Object.entries(rest), ['__proto__', protoValue]])
}

describe('S6 düzeltmesi — canonicalizeJsonValue, öz "__proto__" anahtarını artık SESSİZCE KAYBETMİYOR', () => {
  it('bir alan şemasında "__proto__" anahtarı TAŞIYAN ve TAŞIMAYAN iki sürüm artık FARKLI sınıflandırılır (OUTPUT_TYPE_NARROWED, MAJOR) — düzeltme ÖNCESİ bilgi SESSİZCE kaybolup PATCH verirdi', () => {
    const secretWithProtoKey = withOwnProtoKey({ type: 'string' }, { type: 'number' })
    const procedurePath = 'test.procedure'

    const before: ContractSurfaceDocument = makeDocument({
      [procedurePath]: {
        operation: 'query',
        input: null,
        output: { type: 'object', properties: { secret: secretWithProtoKey } },
      },
    })
    const after: ContractSurfaceDocument = makeDocument({
      [procedurePath]: {
        operation: 'query',
        input: null,
        output: { type: 'object', properties: { secret: { type: 'string' } } },
      },
    })

    const classification = classifyContractChange(before, after)
    const diff = onlyDiff(classification.diffs)

    expect(diff).toMatchObject({
      reason: 'OUTPUT_TYPE_NARROWED',
      severity: 'MAJOR',
      scope: 'output',
      fieldName: 'secret',
    })
    expect(classification.severity).toBe('MAJOR')
  })

  it('İKİ TARAF da AYNI "__proto__" anahtarını AYNI değerle taşırsa → fark YOK, PATCH (karşıt-kanıt: fix aşırı-sıkı DEĞİL)', () => {
    const secretWithProtoKey = withOwnProtoKey({ type: 'string' }, { type: 'number' })
    const procedurePath = 'test.procedure'

    const before: ContractSurfaceDocument = makeDocument({
      [procedurePath]: {
        operation: 'query',
        input: null,
        output: { type: 'object', properties: { secret: secretWithProtoKey } },
      },
    })
    const after: ContractSurfaceDocument = makeDocument({
      [procedurePath]: {
        operation: 'query',
        input: null,
        output: {
          type: 'object',
          properties: { secret: withOwnProtoKey({ type: 'string' }, { type: 'number' }) },
        },
      },
    })

    const classification = classifyContractChange(before, after)

    expect(classification.diffs).toHaveLength(0)
    expect(classification.severity).toBe('PATCH')
  })
})

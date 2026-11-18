// @arkesoft/superadmin — `check-bundle-budget.ts`'in dışa açık, saf
// fail-closed assertion'larının birim testi (ROADMAP v0.0.20, T-021/S8,
// `apps/admin/scripts/__tests__/check-bundle-budget.test.ts`'in AYNI
// mekanizması).
import { describe, expect, it } from 'vitest'

import {
  assertDeclaredPrefixesExist,
  assertEveryDynamicEntryIsAccountedFor,
  type Manifest,
} from '../check-bundle-budget.js'

import { DELIBERATELY_LAZY_ROUTE_SRCS } from '../../bundle-budget.config.js'

function manifest(entries: Manifest): Manifest {
  return entries
}

describe('assertDeclaredPrefixesExist (fail-closed A)', () => {
  it('bildirilen önek manifestte EN AZ BİR "src" ile eşleşirse eşleşen anahtarları döner', () => {
    const result = assertDeclaredPrefixesExist(
      manifest({
        'src/routes/_app.tsx': { file: 'assets/_app.js', src: 'src/routes/_app.tsx' },
      }),
      [{ label: 'test', routeModuleSrcPrefixes: ['src/routes/_app.tsx'] }],
    )
    expect(result.get('src/routes/_app.tsx')).toEqual(['src/routes/_app.tsx'])
  })

  it('bildirilen önek HİÇBİR "src" ile eşleşmezse FIRLATIR (process.exitCode = 1 YETMEZ)', () => {
    expect(() =>
      assertDeclaredPrefixesExist(
        manifest({
          'src/routes/_app.tsx': { file: 'assets/_app.js', src: 'src/routes/_app.tsx' },
        }),
        [{ label: 'kayıp rota', routeModuleSrcPrefixes: ['src/routes/_missing.tsx'] }],
      ),
    ).toThrow(/FAIL-CLOSED A/)
  })

  it('`?tsr-split=component` gibi sonek taşıyan "src" değerleri de ÖNEK ile eşleşir', () => {
    const result = assertDeclaredPrefixesExist(
      manifest({
        key1: {
          file: 'assets/_app.js',
          src: 'src/routes/_app.tsx?tsr-split=component',
        },
      }),
      [{ label: 'test', routeModuleSrcPrefixes: ['src/routes/_app.tsx'] }],
    )
    expect(result.get('src/routes/_app.tsx')).toEqual(['key1'])
  })
})

describe('assertEveryDynamicEntryIsAccountedFor (fail-closed B)', () => {
  it('bir giriş noktası tarafından TALEP EDİLEN dinamik girdi için FIRLATMAZ', () => {
    expect(() => {
      assertEveryDynamicEntryIsAccountedFor(
        manifest({
          key1: {
            file: 'x.js',
            src: 'src/routes/_app.index.tsx',
            isDynamicEntry: true,
          },
        }),
        ['src/routes/_app.index.tsx'],
        [],
      )
    }).not.toThrow()
  })

  it('muafiyet listesinde TAM EŞLEŞEN bir dinamik girdi için FIRLATMAZ', () => {
    expect(() => {
      assertEveryDynamicEntryIsAccountedFor(
        manifest({
          key1: { file: 'x.js', src: 'src/routes/_future-lazy.tsx', isDynamicEntry: true },
        }),
        [],
        ['src/routes/_future-lazy.tsx'],
      )
    }).not.toThrow()
  })

  it('talep EDİLMEYEN VE muafiyet listesinde OLMAYAN dinamik girdi için FIRLATIR', () => {
    expect(() => {
      assertEveryDynamicEntryIsAccountedFor(
        manifest({
          key1: { file: 'x.js', src: 'src/routes/_surprise.tsx', isDynamicEntry: true },
        }),
        [],
        [],
      )
    }).toThrow(/FAIL-CLOSED B/)
  })

  it("muafiyet eşleşmesi TAM EŞİTLİKTİR, ÖNEK DEĞİL — geniş bir önek assertion B'yi etkisizleştiremez", () => {
    expect(() => {
      assertEveryDynamicEntryIsAccountedFor(
        manifest({
          key1: {
            file: 'x.js',
            src: 'src/routes/_surprise-not-actually-lazy.tsx',
            isDynamicEntry: true,
          },
        }),
        [],
        ['src/routes/'], // kasıtlı GENİŞ önek — TAM eşitlikte İŞE YARAMAMALI
      )
    }).toThrow(/FAIL-CLOSED B/)
  })
})

describe('DELIBERATELY_LAZY_ROUTE_SRCS kardinalite (`tenant-exempt-paths.ts` emsalinin aynısı)', () => {
  it('bugün TAM OLARAK 3 eleman — büyürse bu test KIRILIR ve görünür inceleme zorunlu olur', () => {
    expect(DELIBERATELY_LAZY_ROUTE_SRCS.length).toBe(3)
  })
})

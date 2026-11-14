// @arkesoft/admin — `check-bundle-budget.ts`'in dışa açık, saf fail-closed
// assertion'larının birim testi (DÜZELTME TURU 2, T-008/S5, `solid` tur 2
// L-N5 + L-N6 — bağlayıcı).
//
// `assertDeclaredPrefixesExist` (fail-closed A) ve
// `assertEveryDynamicEntryIsAccountedFor` (fail-closed B) artık `main()`'in
// İÇİNE GÖMÜLÜ DEĞİL — saf (yan etkisiz) fonksiyonlar, burada İZOLE test
// ediliyor. `architect` Risk 2'nin üç yasağı (throw kalacak, bildirim
// listesi boşaltılmayacak, assertion B kaldırılmayacak) davranış
// DEĞİŞMEDEN KORUNDU — testler bunu doğrudan assert eder.
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

  it("İŞ 5 — DÜZELTME TURU 2 (`solid` L-N6): muafiyet eşleşmesi artık TAM EŞİTLİK, ÖNEK DEĞİL — eski `startsWith` davranışı assertion B'yi ETKİSİZLEŞTİRİRDİ", () => {
    // `'src/routes/'` gibi KISA bir önek muafiyet listesine TEK satır olarak
    // eklenseydi, ESKİ `startsWith` eşleşmesiyle TÜM `src/routes/**`
    // dinamik girdileri (talep edilmemiş olsalar BİLE) "bilerek tembel"
    // sayılırdı — assertion B TÜMÜYLE etkisizleşirdi. YENİ (tam eşitlik)
    // davranış bunu FIRLATARAK reddeder: önek listede olsa bile "src" TAM
    // eşleşmediği için muaf SAYILMAZ.
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

describe('DELIBERATELY_LAZY_ROUTE_SRCS kardinalite (İŞ 5 — `tenant-exempt-paths.ts` emsalinin aynısı)', () => {
  // GÜNCELLEME (ROADMAP v0.0.15, T-016/S10): 0 → 1 — `/hesap/guvenlik`
  // rotası (`_app.hesap.guvenlik.tsx`, 2FA ekranları) EKLENDİ. Bu test
  // TAM OLARAK bu dosya başı yorumunun öngördüğü gibi KIRILDI (`expected 1
  // to be +0`) ve GÖRÜNÜR inceleme (bu satır) zorunlu kıldı — `tenant-
  // exempt-paths.ts`'in 12→13 emsaliyle AYNI desen. Büyümek GEREKÇELİ:
  // `/hesap/guvenlik` hiçbir giriş noktasından statik import EDİLMİYOR
  // (`/` ve `/sign-in` ikisi de bu rotayı hiç referans almıyor), TanStack
  // Router'ın `autoCodeSplitting`'i bunu KENDİ chunk'ına ayırıyor — bilerek
  // tembel (kullanıcı bu rotaya gitmeden kodu indirmiyor).
  //
  // GÜNCELLEME (ROADMAP v0.1.0, T-019/S10): 1 → 3 — `/magaza-olustur` ve
  // `/kurulum/{slug}` EKLENDİ (docs/ui/T-019 KARAR 1). Bu test YİNE AYNI
  // disiplinle KIRILDI (`expected 3 to be 1`) ve bu GÖRÜNÜR inceleme
  // satırını zorunlu kıldı. Büyümek GEREKÇELİ: ikisi de bookmarklanabilir/
  // paylaşılabilir olmaları onları OTOMATİK ilk-boya YAPMIYOR — `/hesap/
  // guvenlik` emsali (üstteki not) AYNI ayrımı ZATEN kanıtlıyor; `/` ve
  // `/sign-in` ikisi de bu iki yeni rotayı hiç statik REFERANS almıyor.
  it('bugün TAM OLARAK 3 eleman — büyürse bu test KIRILIR ve görünür inceleme zorunlu olur', () => {
    expect(DELIBERATELY_LAZY_ROUTE_SRCS.length).toBe(3)
  })
})

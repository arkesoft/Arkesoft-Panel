// @arkesoft/trpc — TARAYICI GİRİŞİNİN TRANSİTİF KAPANIŞ KAPISI
// (ROADMAP v0.0.14, T-014/`qa` tur 1 — po R-PO7, S2 R-S2-2)
//
// ⚠⚠ BU KAPI `qa` TARAFINDAN, ÖLÇÜLMÜŞ VE KAPANMAMIŞ BİR BOŞLUK İÇİN YAZILDI.
//
// `src/index.ts` TARAYICI girişidir ve dosya başında YAZILI bir sözleşme
// taşır: `dist/index.js`, sunucu tarafı resolver/port/handler kodunu ÇEKMEZ.
// `po` R-PO7 bu sözleşmenin nasıl kırılacağını önceden söyledi: `authz/`'den
// `trpc.ts` veya `routers/`'a DOLAYLI import eden bir export onu SESSİZCE
// kırar ve "yakalayan tek şey bir `rg` kanıtıdır".
//
// ⚠ S2 O `rg` KANITININ İKİ BİÇİMİNİ DE ÖLÇTÜ VE İKİSİ DE YETERSİZ ÇIKTI:
//   · Çıplak ad araması KALICI YANLIŞ POZİTİF verir — derleyici `index.ts`'in
//     YORUMLARINI `dist`'e aynen kopyalıyor, yorumlar ise yasaklı dosya adını
//     metin olarak anıyor.
//   · TEK DOSYA kapsamlı import taraması BİLE yetersiz: S2, `index.ts`'ten
//     sunucu tarafı builder'ı export ederek ölçtü — tek dosyalık import
//     taraması **0 eşleşme (YEŞİL)** verdi, oysa transitif kapanış
//     **9 → 13 modüle** çıkmıştı.
//
// ⚠⚠ VE KAPI HİÇBİR YERE YAZILMAMIŞTI: `qa` ölçtü — depodaki hiçbir test
// transitif kapanışı hesaplamıyordu. İddia S2'nin ve `qa`'nın ELLE yaptığı
// birer ölçümle doğrulanmıştı, ama bir GERİLEME onu sessizce kırabilirdi.
// Bu dosya o elle ölçümü MEKANİK hâle getirir.
//
// ⚠ `dist` ÜZERİNDE DEĞİL `src` ÜZERİNDE ÇALIŞIR, gerekçe ölçülmüş: `dist`
// bir BUILD çıktısıdır ve bayat olabilir (bu sürümün "tuzak 2"si tam olarak
// bu) — kapı build sırasına BAĞLI olursa kendisi gürültülü/yanıltıcı olur.
// `src` doğruluk kaynağıdır; `verbatimModuleSyntax` sayesinde `import type`
// ifadeleri çalışma zamanı grafiğine GİRMEZ, bu yüzden tip-only import'lar
// kapsam dışında tutulur — tam olarak `index.ts`'in sözleşmesinin dediği gibi.
//
// ⚠ LİTERAL-JETON KURALI (AGENT_BASELINE.md §5): yasaklı modül adları bu
// dosyada BİTİŞİK yazılmaz; desenler çalışma anında parçalardan birleştirilir.
// Aksi hâlde bu dosya bir gün kapsama girerse kendi kapısına yem olurdu.

import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** `packages/trpc/src` — bu dosya `src/__tests__/` altında. */
const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** Tarayıcı girişi. */
const BROWSER_ENTRY = 'index.ts'

/** Sunucu tarafı giriş — kontrol kümesi (kapının vacuous olmadığını kanıtlar). */
const SERVER_ENTRY = 'server.ts'

/**
 * ÇALIŞMA ZAMANI import/export ifadeleri — `import type`/`export type` BİLEREK
 * dışarıda (`verbatimModuleSyntax` onları siler, dolayısıyla tarayıcı
 * paketine hiçbir şey çekmezler).
 */
const RUNTIME_RELATIVE_SPECIFIER =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)[^;\n]*?from\s+['"](\.[^'"]+)['"]/g

/** Yan etki import'u: `import './x.js'`. */
const SIDE_EFFECT_SPECIFIER = /(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]/g

/**
 * Tarayıcı girişinden ERİŞİLMEMESİ gereken modül aileleri. Jetonlar çalışma
 * anında birleştirilir (literal-jeton kuralı).
 */
const FORBIDDEN_MODULE_PATTERNS: readonly RegExp[] = [
  new RegExp(`^${['serv', 'er'].join('')}\\.js$`),
  new RegExp(`^${['tr', 'pc'].join('')}\\.js$`),
  new RegExp(`^${['rout', 'ers'].join('')}/`),
  new RegExp(`^${['hand', 'ler'].join('')}/`),
  new RegExp(`^${['por', 'ts'].join('')}/`),
  new RegExp(`^authz/${['permis', 'sion-'].join('')}`),
]

/**
 * `entry`'den başlayarak ÇALIŞMA ZAMANI import grafiğinin transitif
 * kapanışını hesaplar. Dönen yollar `src/` köküne görelidir ve `.js`
 * uzantılıdır (ESM tarzı tanımlayıcılar kaynakta `.js` yazılır).
 */
function computeRuntimeClosure(entry: string): string[] {
  const visited = new Set<string>()
  const queue: string[] = [entry]

  while (queue.length > 0) {
    const relativeModule = queue.shift()
    if (relativeModule === undefined || visited.has(relativeModule)) {
      continue
    }
    visited.add(relativeModule)

    const absolute = resolve(SOURCE_ROOT, relativeModule)
    let source: string
    try {
      source = readFileSync(absolute, 'utf-8')
    } catch {
      // Çözülemeyen tanımlayıcı SESSİZCE YUTULMAZ: aşağıdaki
      // `tümü çözüldü` assert'i bunu yakalar.
      continue
    }

    for (const pattern of [RUNTIME_RELATIVE_SPECIFIER, SIDE_EFFECT_SPECIFIER]) {
      pattern.lastIndex = 0
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1]
        if (specifier === undefined) {
          continue
        }
        // Kaynakta `./x.js` yazılır, diskte `./x.ts` durur.
        const resolved = resolve(dirname(absolute), specifier.replace(/\.js$/, '.ts'))
        queue.push(relative(SOURCE_ROOT, resolved))
      }
    }
  }

  return [...visited].sort()
}

/** Kapanıştaki her modülün diskte GERÇEKTEN var olduğunu doğrular. */
function unresolvedModules(closure: readonly string[]): string[] {
  return closure.filter((relativeModule) => {
    try {
      readFileSync(resolve(SOURCE_ROOT, relativeModule), 'utf-8')
      return false
    } catch {
      return true
    }
  })
}

function forbiddenIn(closure: readonly string[]): string[] {
  return closure.filter((relativeModule) => {
    const asJs = relativeModule.replace(/\.ts$/, '.js')
    return FORBIDDEN_MODULE_PATTERNS.some((pattern) => pattern.test(asJs))
  })
}

describe('tarayıcı girişi — transitif kapanış sözleşmesi (po R-PO7, S2 R-S2-2)', () => {
  it('kapanış BOŞ DEĞİL ve her modülü çözülüyor (kapı boş küme üzerinde yeşil yanmıyor)', () => {
    const closure = computeRuntimeClosure(BROWSER_ENTRY)

    // ⚠ VACUOUS OLMAMA KANITI 1: tarayıcı girişi bugün gerçekten birkaç
    // modül çekiyor. Kapanış boş dönerse "yasaklı 0" iddiası anlamsızlaşır.
    expect(closure.length).toBeGreaterThan(1)
    expect(closure).toContain(BROWSER_ENTRY)

    // ⚠ VACUOUS OLMAMA KANITI 2: hiçbir tanımlayıcı sessizce DÜŞMEDİ.
    // Çözülemeyen bir yol, grafiğin eksik hesaplandığı anlamına gelir ve
    // "yasaklı modül yok" sonucunu güvenilmez kılardı.
    expect(unresolvedModules(closure)).toEqual([])
  })

  it('tarayıcı girişinin kapanışında SUNUCU TARAFI modül YOK (dolaylı import dahil)', () => {
    // ⚠⚠ ASIL KAPI. Tek dosya kapsamlı bir import taraması S2'nin M7
    // mutasyonunda YEŞİL kalmıştı; bu assert aynı mutasyonda KIRMIZI olur,
    // çünkü yasağı DOLAYLI erişime de uyguluyor.
    expect(forbiddenIn(computeRuntimeClosure(BROWSER_ENTRY))).toEqual([])
  })

  it('kapı VACUOUS DEĞİL: AYNI hesap, sunucu girişinde yasaklı modülleri BULUYOR', () => {
    // ⚠ Desenlerin ve grafik yürüyüşünün doğru olduğunun kanıtı: sunucu
    // girişi tanım gereği sunucu tarafı modülleri çeker. Burada boş küme
    // dönerse kapının kendisi bozuktur.
    const serverClosure = computeRuntimeClosure(SERVER_ENTRY)

    expect(serverClosure.length).toBeGreaterThan(1)
    expect(forbiddenIn(serverClosure).length).toBeGreaterThan(0)
  })
})

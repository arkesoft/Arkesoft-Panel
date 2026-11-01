// @arkesoft/ui — Tailwind v4 "sarılmamış özel özellik" regresyon bekçisi
// (QA, T-008 tur 1 bulgusu — AC13'ün kör noktası; T-008 Düzeltme Turu 1'de
// architect'in bulduğu İKİNCİ kör nokta için genişletildi, bkz. "TUR 1
// DÜZELTMESİ" bölümü aşağıda)
//
// YETKİ UYARISI (architect, T-008 Düzeltme Turu 1 KARAR 2) — BU TESTİN
// YETKİSİ YOK: tek yetkili bekçi derlenmiş CSS'i okuyan
// `apps/admin/scripts/check-compiled-css-contract.ts` (S5 yazdı, `vite build`
// zincirinde koşar, N1+N2+P1+P2 assertion'larını taşır, token namespace ↔
// CSS özelliği eşlemesini derlenmiş artefaktta doğrular). BU DOSYA yalnızca
// bir HIZLI GERİ BİLDİRİM katmanıdır — derleme gerekmeden saniyeler içinde
// çalışır. Kaynak taraması Tailwind'in KENDİ tip çıkarsamasını (hangi
// namespace `length:` ipucu ister, hangisi istemez) BİLMEDİĞİ için, bilinen
// iki hata sınıfı DIŞINDA bir üçüncü varyantı (söz dizimi doğru görünür ama
// yine de yanlış CSS özelliğine iner) TANIM GEREĞİ KAÇIRABİLİR. Şüpheli bir
// derlenmiş-CSS bulgusu varsa yetki `check-compiled-css-contract.ts`'tedir,
// bu dosya DEĞİL.
//
// MOTİVASYON (orijinal, tur 1 — sınıf 1, `[--x]` sarılmamış söz dizimi):
// `tokens.test.ts`'in AC13 kontrast testi HAM HEX DİZELERİ üzerinde matematik
// yapıyor; hiçbir React bileşenini RENDER ETMİYOR, hiçbir derlenmiş CSS'i
// OKUMUYOR. Bu sürümde `packages/ui`'nin beş bileşeni Tailwind v4'te GEÇERSİZ
// CSS üretmişti çünkü renk/yarıçap/odak token'larına `[--renk-token]`
// biçimindeki KÖŞELİ PARANTEZ söz dizimiyle başvurulmuştu — Tailwind v4'te bu
// söz dizimi `var()` ile SARILMADAN derlenir (ham özel özellik ADI, literal
// bir CSS değeri olarak yazılır → tarayıcı bildirimi GEÇERSİZ sayıp atar).
// Sonuç: buton şeffaf, metin yanlış renkte, `border-radius: 0` — derlenen
// CSS'te 20 geçersiz bildirim. `tokens.test.ts` bunu YAKALAYAMADI (DOM/CSS'e
// hiç bakmıyor); S5 tarayıcıda `getComputedStyle` ile buldu, S2 düzeltti
// (doğru söz dizimi: `(--x)` parantez — Tailwind bunu `var(--x)`'e çevirir).
//
// Bu test AYNI SINIF regresyonu KAYNAK SEVİYESİNDE (derleme/tarayıcı
// gerekmeden, saniyeler içinde) yakalar: `packages/ui/src` ve `apps/admin/src`
// kaynak dosyalarını tarar, TEHLİKELİ söz dizimine (`-[--x]`) dönüş olup
// olmadığını denetler. AC12'nin odak deseni grep'i de AYNI kör noktadan
// muzdarip (sınıf listesinin VARLIĞINI doğruluyor, derlenen CSS'in GEÇERLİLİĞİNİ
// doğrulamıyor) — bu test o boşluğu da kapatır (odak halkası token'ı
// `FOCUS_RING_CLASS_NAMES` dahil taranan yüzeyde).
//
// TUR 1 DÜZELTMESİ — sınıf 2 (`text-(--font-size-*)`, YANLIŞ CSS özelliğine
// iniyor) ve bu dosyanın KENDİ KUSURU (architect buldu): Tailwind v4 UZUNLUK
// değerleri için ayrı bir tip ipucu istiyor; `text-` öneki renk token'ı için
// `(--color-...)` yeterliyken, `--font-size-*` gibi bir UZUNLUK token'ı için
// `(length:--font-size-...)` YAZILMASI ZORUNLU. Yanlış biçim — iki parçaya
// bölünerek yazılıyor (bu dosyanın KENDİSİ taranan ağaçta, literal-jeton
// kuralı AGENT_BASELINE §5 gereği): `'text-(' + '--font-size-h1)'` — SÖZ
// DİZİMİ AÇISINDAN geçerli görünür (parantez var, `-[...]` değil `-(...)` )
// ama derlenen CSS'te `color: var(--font-size-h1)` üretir (`font-size`
// DEĞİL) — ikinci bir, FARKLI hata sınıfı.
//
// Eskiden `WRAPPED_CUSTOM_PROPERTY_PATTERN` BU yanlış biçimi de eşleştiriyordu
// ve genel "doğru söz dizimi kullanılıyor" SAĞLIK KONTROLÜNE dahil ediyordu —
// yani test, 23 BOZUK `text-(--font-size-*)` kullanımını kendi totoloji-karşıtı
// kanıtı olarak sayıyordu (bozuk kodun VARLIĞI test'i yeşil tutuyordu). Şimdi:
// (1) genel sağlık sayacı bu özel biçimi artık SAYMIYOR, (2) iki YENİ kaynak
// kuralı eklendi — uzunluk ipucu OLMAYAN biçim YASAK (0), uzunluk ipuçlu
// biçim EN AZ bir yerde ZORUNLU (≥1).
//
// YENİ BAĞIMLILIK YOK — yalnızca `node:fs` + düzenli ifade (ADR-0009 madde 5
// deseninin aynısı, `tokens.test.ts`'in `theme.css` okuma şekli).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))

/** Bir dizin ağacındaki tüm `.tsx`/`.ts` kaynak dosyalarının tam yolu → içeriği. */
function readSourceFilesRecursively(rootDir: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>()

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry)
      const stats = statSync(fullPath)
      if (stats.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
        result.set(fullPath, readFileSync(fullPath, 'utf-8'))
      }
    }
  }

  walk(rootDir)
  return result
}

/**
 * Tailwind v4'ün TEHLİKELİ söz dizimi: bir utility öneki + KÖŞELİ PARANTEZ +
 * CSS özel özellik adı (`--...`). Örnek (iki parçadan birleştirilerek
 * yazılıyor — bu dosyanın KENDİSİ taranan ağaçta, literal-jeton kuralı
 * (AGENT_BASELINE §5) gereği): `'ring-' + '[--color-focus-ring]'`. Bu,
 * `var()` ile SARILMADAN derlenir → geçersiz bildirim (sessizce atılır).
 */
const UNWRAPPED_CUSTOM_PROPERTY_PATTERN = /[a-z-]+-\[--[\w-]+\]/g

/**
 * Söz dizimi açısından DOĞRU (yuvarlak parantez) genel biçim — Tailwind bunu
 * `var(--x)`'e çevirir. **DİKKAT (tur 1 düzeltmesi):** bu genel desen,
 * `--font-size-*` gibi UZUNLUK token'larının `length:` ipucu OLMADAN
 * kullanıldığı (söz dizimi geçerli ama YANLIŞ CSS özelliğine inen) biçimi de
 * eşleştirir — bu yüzden bu desenin eşleşme SAYISI tek başına "doğru"
 * kanıtı DEĞİLDİR; aşağıdaki `countWrappedUsagesExcludingUnhintedFontSize`
 * bu biçimi sağlık sayacından HARİÇ tutar.
 */
const WRAPPED_CUSTOM_PROPERTY_PATTERN = /[a-z-]+-\(--[\w-]+\)/g

/**
 * `--font-size-*` İÇİN doğru söz dizimi: açılış parantezinin içinde `length:`
 * ipucu + iki tire + namespace. Örnek (iki parçaya bölünerek yazılıyor, bu
 * dosyanın KENDİSİ taranan ağaçta): `'text-(length:--' + 'font-size-h1)'`.
 */
const FONT_SIZE_WITH_LENGTH_HINT_PATTERN = /text-\(length:--font-size-[\w-]+\)/g

/**
 * `text-(--font-size-` öneki — UZUNLUK ipucu OLMADAN, bozuk biçim. İki
 * parçaya bölünerek yazılıyor (bu dosyanın KENDİSİ taranan ağaçta, aksi
 * halde bu sabit kendi kendini eşleştirip sayıları bozar):
 * `'text-(--' + 'font-size-'`.
 */
const FONT_SIZE_WITHOUT_LENGTH_HINT_PREFIX = 'text-(--' + 'font-size-'

const packagesUiSrcDir = join(currentDir, '..')
const adminSrcDir = join(currentDir, '..', '..', '..', '..', 'apps', 'admin', 'src')

function findOffendingUnwrappedUsages(rootDir: string): readonly string[] {
  const files = readSourceFilesRecursively(rootDir)
  const offenders: string[] = []
  for (const [path, content] of files) {
    const matches = content.match(UNWRAPPED_CUSTOM_PROPERTY_PATTERN)
    if (matches !== null) {
      offenders.push(`${path}: ${matches.join(', ')}`)
    }
  }
  return offenders
}

/**
 * Genel "yuvarlak parantez söz dizimi kullanılıyor" sağlık sayacı.
 * TUR 1 DÜZELTMESİ: `text-(--font-size-...)` (uzunluk ipucu OLMAYAN, bozuk)
 * eşleşmeleri bu sayaçtan HARİÇ tutulur — aksi halde bozuk bir kullanımın
 * VARLIĞI, testin kendi totoloji-karşıtı sağlık kanıtı sayılır (architect'in
 * bulduğu ters yönde totoloji).
 */
function countWrappedUsagesExcludingUnhintedFontSize(rootDir: string): number {
  const files = readSourceFilesRecursively(rootDir)
  let total = 0
  for (const [, content] of files) {
    const matches = content.match(WRAPPED_CUSTOM_PROPERTY_PATTERN) ?? []
    const healthyMatches = matches.filter(
      (match) => !match.startsWith(FONT_SIZE_WITHOUT_LENGTH_HINT_PREFIX),
    )
    total += healthyMatches.length
  }
  return total
}

/** Belirli bir deseni verilen ağaçta kaç kez geçtiğini sayar. */
function countPatternUsages(rootDir: string, pattern: RegExp): number {
  const files = readSourceFilesRecursively(rootDir)
  let total = 0
  for (const [, content] of files) {
    const matches = content.match(pattern)
    total += matches?.length ?? 0
  }
  return total
}

/** `text-(--font-size-...)` (uzunluk ipucu OLMAYAN, bozuk biçim) sayısı. */
function countUnhintedFontSizeUsages(rootDir: string): number {
  const files = readSourceFilesRecursively(rootDir)
  let total = 0
  for (const [, content] of files) {
    const matches = content.match(WRAPPED_CUSTOM_PROPERTY_PATTERN) ?? []
    total += matches.filter((match) =>
      match.startsWith(FONT_SIZE_WITHOUT_LENGTH_HINT_PREFIX),
    ).length
  }
  return total
}

describe('Tailwind v4 özel özellik söz dizimi — AC13 kör noktası regresyon bekçisi (QA, T-008 tur 1)', () => {
  it('packages/ui/src içinde SARILMAMIŞ `-[--x]` söz dizimi YOK', () => {
    expect(findOffendingUnwrappedUsages(packagesUiSrcDir)).toEqual([])
  })

  it('apps/admin/src içinde SARILMAMIŞ `-[--x]` söz dizimi YOK', () => {
    expect(findOffendingUnwrappedUsages(adminSrcDir)).toEqual([])
  })

  // Totoloji karşıtı sağlık kontrolü: DOĞRU (parantez) söz dizimi en az bir
  // yerde kullanılıyor — bu testin "her şey eşleşmiyor çünkü regex bozuk"
  // şeklinde sessizce yeşil kalmadığının kanıtı. TUR 1 DÜZELTMESİ: bu sayaç
  // artık `text-(--font-size-...)` (bozuk) kullanımlarını SAYMIYOR; sağlık
  // kanıtı gerçekten iyi huylu eşleşmelerden (renk/yarıçap/font-weight/gölge
  // token'ları) gelmek zorunda.
  it('packages/ui/src içinde DOĞRU `(--x)` söz dizimi en az bir yerde kullanılıyor (totoloji karşıtı sağlık kontrolü, bozuk font-size hariç)', () => {
    expect(countWrappedUsagesExcludingUnhintedFontSize(packagesUiSrcDir)).toBeGreaterThan(0)
  })

  it('apps/admin/src içinde DOĞRU `(--x)` söz dizimi en az bir yerde kullanılıyor (totoloji karşıtı sağlık kontrolü, bozuk font-size hariç)', () => {
    expect(countWrappedUsagesExcludingUnhintedFontSize(adminSrcDir)).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------
  // TUR 1 — architect T-008 Düzeltme Turu 1 KARAR 2: `--font-size-*`
  // namespace'i Tailwind'in UZUNLUK tipi ipucu istediği TEK namespace.
  // Bu iki kural `countWrappedUsagesExcludingUnhintedFontSize`'ın
  // DIŞLADIĞI şeyin KENDİSİNİ açıkça, ayrı assertion'larla pinler —
  // dışlamanın "sessizce" olmadığının kanıtı.
  // ---------------------------------------------------------------------
  describe('`--font-size-*` namespace kuralı (uzunluk ipucu zorunlu)', () => {
    it('packages/ui/src içinde UZUNLUK ipucu OLMAYAN `text-(--font-size-*)` kullanımı YOK (0)', () => {
      expect(countUnhintedFontSizeUsages(packagesUiSrcDir)).toBe(0)
    })

    it('apps/admin/src içinde UZUNLUK ipucu OLMAYAN `text-(--font-size-*)` kullanımı YOK (0)', () => {
      expect(countUnhintedFontSizeUsages(adminSrcDir)).toBe(0)
    })

    it('packages/ui/src içinde UZUNLUK ipuçlu `text-(length:--font-size-*)` kullanımı EN AZ bir yerde var', () => {
      expect(
        countPatternUsages(packagesUiSrcDir, FONT_SIZE_WITH_LENGTH_HINT_PATTERN),
      ).toBeGreaterThan(0)
    })

    it('apps/admin/src içinde UZUNLUK ipuçlu `text-(length:--font-size-*)` kullanımı EN AZ bir yerde var', () => {
      expect(countPatternUsages(adminSrcDir, FONT_SIZE_WITH_LENGTH_HINT_PATTERN)).toBeGreaterThan(0)
    })
  })
})

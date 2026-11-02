// @arkesoft/theme-sdk — ayar migration zincirinin TOPOLOJİ doğrulaması
// (ROADMAP v0.0.9, T-010/S4, architect "Ayar migration sözleşmesi" bölümü)
//
// ⚠ SEMVER KARŞILAŞTIRMASI YAPILMADI — bağlayıcı kısıt (po handoff, V-PO
// notu). Bu dosya `from`/`to` arasında "1.2.0 < 1.5.0" türünden bir ARALIK/
// ÖNCELİK (precedence) hesabı YAPMAZ — o `packages/versioning`'in işi
// (ROADMAP:1301) ve bu pakete o pakete bağımlılık DOĞMADI (CLAUDE.md §3,
// architect "Modül yerleşimi" kararı). Burada yapılan üç şey:
//   (1) `from`/`to`'nun semver BİÇİMİ (yalnızca biçim, karşılaştırma değil)
//   (2) zincirin TOPOLOJİSİ — saf graf işi (boşluk/tekrar/döngü), düğümler
//       OPAK dize kimlikleridir, büyüklük sırası hiç kullanılmaz
//   (3) AC7'nin major kontrolü — major alanının TAMSAYI EŞİTLİĞİ, aralık
//       hesabı DEĞİL (`'^1.2.0' ⊇ '1.5.0'` gibi bir sorgu burada YOK)
//
// ⚠ TERS MİGRASYON YAZILMAZ (V4, architect kararı) — geri yön ayar anlık
// görüntüsüyle çözülür (ROADMAP §5). `ThemeSettingsMigration` yalnızca İLERİ
// yönü taşır.
//
// ⚠ `migrate` girdisi `unknown`'tur — kaynak sürümün ayar şeması SDK'ya
// verilmiyor (her tema sürümü kendi şemasını taşır, SDK bunları bilmez).
// Çıktının HEDEF şemadan geçirilmesi bu dosyanın işi DEĞİL — S6'nın
// `src/migrations/run.ts`'i AC9'u karşılar; bu dosya yalnızca zincirin
// TOPOLOJİSİNİ doğrular, `migrate` fonksiyonunu ÇAĞIRMAZ.
//
// ⚠ İMZA KARARI (po handoff'ta teyit edildi, Grup 3/4 paralelliği için
// BAĞLAYICI): `themeVersion` PARAMETRE olarak alınır, `ThemeManifest` tipi
// İTHAL EDİLMEZ. `ThemeManifest` S5'in işi (Grup 4) ve S5 bu modülden
// SONRA çalışır — eğer bu dosya `ThemeManifest`'i import etseydi, Grup 3
// (bu dosya, S4) ile Grup 4 (S5) arasında S4→S5 yönünde bir bağımlılık
// DOĞARDI ve po'nun tasarladığı `3=[S3 ║ S4]` / `4=[S5 ║ S6]` paralelliği
// BOZULURDU. Bunun yerine S5'in `validateThemeManifest()`'i bu modülü
// `manifest.version` değerini ÇIKARIP parametre olarak GEÇİREREK çağırır.
//
// ⚠ DÜRÜSTLÜK NOTU (architect, AYNEN TAŞINDI) — AC7'nin kontrolü yalnızca
// TEK BİR MANİFEST İÇİNDİR: "bu manifestteki migration zinciri, bu
// manifestin beyan ettiği `version`'ın majorunu KAPSIYOR mu" sorusuna
// cevap verir. *"Yayınlanmış v1'den v2'ye gerçekten bir migration var mı"*
// türünden ÇAPRAZ-SÜRÜM kontrolü (yayınlanmış önceki tema sürümünün
// kayıtlı migration zinciriyle karşılaştırılması) `ThemeRelease` kaydını
// gerektirir ve bu paketin bugün erişimi OLMAYAN bir veri kaynağıdır
// (paket DB'ye gitmez, I/O yapmaz — saflık pini). Bu KAPSAM DIŞI kalan bir
// kontrol, "çözüldü" OLARAK İŞARETLENMEDİ — v0.0.10+ işi.
//
// ⚠ B4 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti B) — semver BİÇİM deseni
// VE `extractMajor()` artık BU DOSYADA TANIMLANMIYOR, `../semver-format.js`'
// TEN import edilir (tek kaynak — `manifest/manifest.ts` AYNI kaynağı
// kullanır, `rg` ile tanım sayısı 1). Gerekçe `../semver-format.ts`'in
// dosya başı yorumunda: bu dosyanın ESKİ yerel deseni (resmi semver.org
// kopyası) ile `manifest.ts`'in ESKİ yerel deseni (daha gevşek) SAPMIŞTI
// (`"1.0.0-01"` biri kabul biri red ediyordu) — artık TEK, DAHA KATI bir
// kaynak var.

import type { ThemeContractIssue, ThemeContractResult } from '../errors.js'
import { THEME_CONTRACT_MESSAGES } from '../messages.js'
import { formatThemeContractPath } from '../paths.js'
import { extractMajor } from '../semver-format.js'

/**
 * Bir ayar migration tanımı — İLERİ yönlü (V4, ters migration yazılmaz).
 * `from`/`to` semver BİÇİMİNDE dizelerdir (yalnızca biçim doğrulanır, aralık
 * hesabı yapılmaz). `migrate` girdisi `unknown`'tur — kaynağın şeması bu
 * pakete verilmez; çıktının hedef şemadan geçirilmesi S6'nın işidir (AC9).
 */
export interface ThemeSettingsMigration {
  readonly from: string
  readonly to: string
  readonly migrate: (settings: unknown) => unknown
}

/** Biçimi geçerli olduğu doğrulanmış, grafa dahil edilebilir tek bir kenar. */
interface ParsedMigrationEdge {
  readonly index: number
  readonly from: string
  readonly to: string
  readonly toMajor: number
}

/**
 * Ayar migration zincirinin TOPOLOJİSİNİ doğrular: boşluk, tekrar, döngü ve
 * (AC7) manifestin beyan ettiği `themeVersion`'ın majorunu zincirin
 * ulaşmadığı durum. `migrations` dizisinin KENDİSİ bu fonksiyon tarafından
 * ne çalıştırılır ne de değiştirilir — yalnızca `from`/`to` alanları
 * okunur.
 *
 * @param migrations - manifestteki migration zinciri (S5'in
 *   `validateThemeManifest()`'i bu diziyi `manifest.migrations`'tan geçirir)
 * @param themeVersion - manifestin beyan ettiği `version` alanı (S5 bunu
 *   `manifest.version`'dan ÇIKARIP parametre olarak verir — bu fonksiyon
 *   `ThemeManifest` tipini ASLA import etmez, bkz. dosya başı yorumu)
 */
export function validateMigrationChain(
  migrations: readonly ThemeSettingsMigration[],
  themeVersion: string,
): ThemeContractResult<readonly ThemeSettingsMigration[]> {
  const issues: ThemeContractIssue[] = []
  const parsedEdges: ParsedMigrationEdge[] = []

  // (1) Biçim denetimi — yalnızca BİÇİM, karşılaştırma değil. Biçimi
  // geçersiz bir kenar grafa DAHİL EDİLMEZ (aşağıdaki topoloji kontrolleri
  // onu görmez) ama kendi `THEME_MANIFEST_INVALID` bulgusunu üretir. Bu
  // paketin kararlı 15 kodluk kataloğunda migration'a özel bir "biçim
  // geçersiz" kodu YOK (architect'in kapalı kod listesi) — en yakın anlamı
  // taşıyan `THEME_MANIFEST_INVALID` kullanılır: migration da manifestin
  // bir alanıdır, biçimi bozuksa manifest şemayla eşleşmiyor demektir.
  migrations.forEach((migration, index) => {
    const fromMajor = extractMajor(migration.from)
    const toMajor = extractMajor(migration.to)

    if (fromMajor === undefined) {
      issues.push({
        code: 'THEME_MANIFEST_INVALID',
        path: formatThemeContractPath(['migrations', index, 'from']),
        message: THEME_CONTRACT_MESSAGES.THEME_MANIFEST_INVALID,
      })
    }

    if (toMajor === undefined) {
      issues.push({
        code: 'THEME_MANIFEST_INVALID',
        path: formatThemeContractPath(['migrations', index, 'to']),
        message: THEME_CONTRACT_MESSAGES.THEME_MANIFEST_INVALID,
      })
    }

    if (fromMajor !== undefined && toMajor !== undefined) {
      parsedEdges.push({ index, from: migration.from, to: migration.to, toMajor })
    }
  })

  // (2) TEKRAR — aynı `from` birden fazla kez tanımlanmış mı? Topoloji
  // kenar haritası (`fromToMap`) İLK GÖRÜLEN kenarı tutar; tekrar eden
  // kenarlar kendi bulgusunu üretir ama grafa İKİNCİ KEZ eklenmez (aksi
  // halde döngü/boşluk tespiti hangi hedefi izleyeceğini bilemez).
  const fromToMap = new Map<string, string>()

  for (const edge of parsedEdges) {
    if (fromToMap.has(edge.from)) {
      issues.push({
        code: 'THEME_MIGRATION_DUPLICATE',
        path: formatThemeContractPath(['migrations', edge.index, 'from']),
        message: THEME_CONTRACT_MESSAGES.THEME_MIGRATION_DUPLICATE,
      })
      continue
    }

    fromToMap.set(edge.from, edge.to)
  }

  // (3) DÖNGÜ — her düğümden başlayıp `fromToMap`'i izleyerek bir düğümü
  // ikinci kez ziyaret edip etmediğimize bakarız (fonksiyonel graf: her
  // düğümün en fazla bir çıkış kenarı var, tekrar ayıklaması sayesinde).
  // Döngüye dahil TÜM düğümler `cyclicNodes`'a eklenir; raporlama tek bir
  // bulguyla yapılır (en küçük orijinal index'e sahip kenardan) — zincirin
  // her adımı için ayrı bulgu üretmek gürültü olurdu.
  const cyclicNodes = new Set<string>()

  for (const startNode of fromToMap.keys()) {
    const visitedOrder: string[] = []
    const visitedSet = new Set<string>()
    let current: string | undefined = startNode

    while (current !== undefined) {
      if (visitedSet.has(current)) {
        const cycleStartPosition = visitedOrder.indexOf(current)
        for (const cycleNode of visitedOrder.slice(cycleStartPosition)) {
          cyclicNodes.add(cycleNode)
        }
        break
      }

      visitedSet.add(current)
      visitedOrder.push(current)
      current = fromToMap.get(current)
    }
  }

  if (cyclicNodes.size > 0) {
    const firstCyclicEdge = parsedEdges.find((edge) => cyclicNodes.has(edge.from))
    if (firstCyclicEdge !== undefined) {
      issues.push({
        code: 'THEME_MIGRATION_CYCLE',
        path: formatThemeContractPath(['migrations', firstCyclicEdge.index, 'from']),
        message: THEME_CONTRACT_MESSAGES.THEME_MIGRATION_CYCLE,
      })
    }
  } else {
    // (4) BOŞLUK — döngü YOKSA anlamlı: zincirin "kök" düğümleri (bir
    // kenarın `from`'u ama HİÇBİR kenarın `to`'su olmayan düğümler)
    // birden fazlaysa zincir TEK PARÇA değildir, ayrık segmentlere
    // bölünmüştür (ör. `1.0.0→1.1.0` ve `1.3.0→2.0.0` — aralarında
    // `1.1.0→1.3.0` yok). Kanonik kök, en küçük orijinal index'e sahip
    // kenarın kökü sayılır; diğer her kök kendi boşluk bulgusunu üretir.
    const fromNodes = new Set(fromToMap.keys())
    const toNodes = new Set(fromToMap.values())
    const rootNodes = [...fromNodes].filter((node) => !toNodes.has(node))

    if (rootNodes.length > 1) {
      const rootEdges = rootNodes
        .map((root) => parsedEdges.find((edge) => edge.from === root))
        .filter((edge): edge is ParsedMigrationEdge => edge !== undefined)
        .sort((a, b) => a.index - b.index)

      for (const extraRootEdge of rootEdges.slice(1)) {
        issues.push({
          code: 'THEME_MIGRATION_GAP',
          path: formatThemeContractPath(['migrations', extraRootEdge.index, 'from']),
          message: THEME_CONTRACT_MESSAGES.THEME_MIGRATION_GAP,
        })
      }
    }
  }

  // (5) AC7 — EKSİK HEDEF MAJOR. `themeVersion`'ın majoru 1'den büyükse
  // (yani tema en az bir kez major yükseltmiş demektir, CLAUDE.md §9:
  // "migration'sız tema majoru yayınlanamaz") zincirdeki EN AZ BİR
  // kenarın `to` majoru bu değere EŞİT olmalı. `migrations` boşsa
  // `toMajors` boş küme olur ve kontrol doğal biçimde başarısız olur —
  // major 1'in (ilk/temel sürüm) migration beklememesi için özel bir dal
  // YAZMAYA gerek yok, `themeMajor > 1` koşulu bunu zaten dışarıda tutar.
  const themeMajor = extractMajor(themeVersion)

  if (themeMajor === undefined) {
    issues.push({
      code: 'THEME_MANIFEST_INVALID',
      path: formatThemeContractPath(['version']),
      message: THEME_CONTRACT_MESSAGES.THEME_MANIFEST_INVALID,
    })
  } else if (themeMajor > 1) {
    const toMajors = new Set(parsedEdges.map((edge) => edge.toMajor))

    if (!toMajors.has(themeMajor)) {
      // ⚠ Bu kontrol TEK MANİFEST İÇİNDİR (dosya başı "dürüstlük notu").
      // "Yayınlanmış önceki majordan gerçekten migration var mı" çapraz-
      // sürüm kontrolü `ThemeRelease` kaydını gerektirir — bu fonksiyonun
      // (ve bu paketin) erişimi olmayan bir veri kaynağı, v0.0.10+ işi.
      issues.push({
        code: 'THEME_MIGRATION_MISSING',
        path: formatThemeContractPath(['migrations']),
        message: THEME_CONTRACT_MESSAGES.THEME_MIGRATION_MISSING,
      })
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  return { ok: true, value: migrations, warnings: [] }
}

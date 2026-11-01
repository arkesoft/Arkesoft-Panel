// @arkesoft/admin — derlenmiş CSS sözleşme denetimi (ROADMAP v0.0.7,
// T-008/S5, DÜZELTME TURU 1 — architect Karar 2, BAĞLAYICI)
//
// LİTERAL-JETON UYARISI (AGENT_BASELINE §5): bu dosya `apps/admin` kök
// dizininin İÇİNDE olduğu için Tailwind'in otomatik İÇERİK TARAMASININ
// (yalnızca `@source` globu DEĞİL — Tailwind v4 proje kökünü de otomatik
// tarar) kapsamında. Aşağıdaki kök neden açıklaması KASITLI OLARAK köşeli
// parantez söz dizimini BİTİŞİK YAZMAZ (örn. "bg" + "-[" + "--…" yerine
// boşluklu/ayrık betimleme) — aksi hâlde bu YORUM METNİNİN KENDİSİ
// Tailwind'e geçersiz bir utility ÜRETTİRİR ve N1 bu dosyayı DEĞİŞTİRMEDEN
// KIRMIZI verir (ÖLÇÜLDÜ — bu script yazılırken bizzat yaşandı).
//
// KÖK NEDEN: aynı sınıf hata bu sürümde İKİ KEZ üretildi —
//   (1) köşeli parantezli eski söz dizimi (sınıf adı, tire, açık köşeli
//       parantez, İKİ TİRE'li özel özellik adı, kapalı köşeli parantez) →
//       derlenen bildirimde DEĞER `var()` ile SARILMAMIŞ, GEÇERSİZ bildirim
//       (S2'nin bu turda düzelttiği 35 kullanım, bkz. Gate Tur 1 sentezi)
//   (2) yuvarlak parantezli söz dizimi (sınıf adı, tire, açık yuvarlak
//       parantez, İKİ TİRE'li `font-size` namespace'inden bir token, kapalı
//       yuvarlak parantez) bir `length:` tip ipucu TAŞIMADIĞINDA Tailwind
//       v4'te `color`'a derleniyor, `font-size`'a DEĞİL (bu YANLIŞ özelliğe
//       inen, ama SARILMIŞ hâl — bkz. bu dosyanın N2 assertion'ı)
// — VE hiçbir statik kapı İKİSİNİ DE göremedi. Bu bekçi İKİSİNİ DE TEK
// ARTEFAKTTA (derlenmiş CSS) yakalıyor çünkü ikisi AYNI şeyin iki yüzü:
// "yazarın yazdığı sınıf, derlenmiş bildirimin anlamını VERMİYOR".
//
// KATMAN SEÇİMİ (architect ölçtü): kaynak taraması sınıf (1)'i yakalar ama
// sınıf (2)'yi KAÇIRIR (daha kötüsü: YANLIŞ YÖNDE sayabilir — bkz.
// `packages/ui/src/__tests__/tailwind-custom-property-syntax.qa.test.ts`
// dosya başı notu, `qa`'nın bu turda düzelttiği totoloji). Render edilmiş
// DOM yavaş/kırılgan. DERLENMİŞ CSS — Tailwind'in GERÇEK çıkarsamasını
// ölçer, build GEREKTİRİR (bu yüzden `package.json`'un `build` script'inde
// `vite build`'DEN SONRA koşar) — YETKİ BURADA.
//
// NEREDE KOŞAR (bağlayıcı, `turbo.json` okunarak karar verildi): `test`
// görevi `dependsOn: ["^build","generate"]` — yalnızca UPSTREAM build'lere
// bağlı, `@arkesoft/admin:test` KENDİ `build`'ini TETİKLEMEZ → `pnpm test`
// içinden `dist` okumak ya YANLIŞ-YEŞİL (eski dist) ya YANLIŞ-KIRMIZI (dist
// yok) verir. REDDEDİLDİ. Doğru yer: `apps/admin`'in KENDİ `build` zinciri
// (`check-bundle-budget.ts`'in kanıtlanmış emsali), `turbo.json`'a
// DOKUNULMUYOR. Gerçek zincirin GÜNCEL hâli `package.json`'un (S1'in
// dosyası) `build` script'inde YAŞAR — BURADA KOPYALANMAZ (DÜZELTME TURU
// 2, `solid` L-N4: metnin burada tekrarlanması bayatlama YARATIYORDU, S1
// zincire `&& rm -rf dist/.vite` eklediğinde bu yorum GÜNCELLENMEMİŞTİ).
// Bilinmesi gereken İKİ ŞEY (kopya DEĞİL, DEĞİŞMEZ): (1) bu script `vite
// build`'den SONRA, `check-bundle-budget.ts`'den ÖNCE koşar — doğruluk
// (stylesheet geçerli mi) boyut politikasından ÖNCE, bozuk CSS'te boyut
// raporu YANILTICIDIR; (2) zincirdeki olası bir `rm -rf dist/.vite` (veya
// benzeri manifest temizliği) bu script'ten SONRA gelmek ZORUNDA — bu
// script manifesti OKUR, silinmişse `throw` eder (fail-closed, sessiz
// geçmez).
//
// Girdi `dist/.vite/manifest.json`'un `isEntry:true` girdilerinin `css`
// dizisidir — HASH'TEN BAĞIMSIZ (dosya adını glob'la aramak YASAK, yanlış
// dosyayı tarayıp yeşil kalma riski). Dizi yoksa/boşsa FIRLATILIR.
//
// Yalnızca `node:fs`/`node:path`/`node:url` — YENİ BAĞIMLILIK YOK
// (`check-bundle-budget.ts` emsalinin aynısı). `no-console` BU DİZİNDE
// KAPALI (`apps/admin/eslint.config.mjs`) — doğrudan stdout/stderr.
//
// DÖRT ASSERTION — hepsi BİLDİRİM-YEREL ve YAPI-BAĞIMSIZ (AST GEREKMEZ,
// `@media`/`@supports` yuvalanmasından ve cascade sırasından bağımsız):
//   N1 — sarılmamış özel özellik DEĞERİ (sınıf 1'in regresyon koruması)
//   N2 — `var(--token)` içeren HER bildirimde namespace↔özellik eşlemesi
//        (sınıf 2'nin regresyon koruması)
//   P1 — kaynakta `-(--token)` ile referans verilen HER token derlenmiş
//        CSS'te İZİNLİ bir özellik üzerinde EN AZ BİR KEZ `var(--token)`
//        olarak geçmek ZORUNDA (totoloji-karşıtı — "kullanımı ÖLÇER")
//   P2 — sağlık/totoloji: taranan CSS boş/yanlış dosya OLMASIN
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ADMIN_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const DIST_DIR = join(ADMIN_ROOT, 'dist')
const MANIFEST_PATH = join(DIST_DIR, '.vite', 'manifest.json')
const REPO_ROOT = resolve(ADMIN_ROOT, '..', '..')
const ADMIN_SRC_DIR = join(ADMIN_ROOT, 'src')
const UI_SRC_DIR = join(REPO_ROOT, 'packages', 'ui', 'src')

// ---------------------------------------------------------------------------
// Fail-closed allowlist (architect'in derlenmiş CSS'ten BİZZAT ölçtüğü
// eşleme tablosu). Tabloda OLMAYAN (namespace, özellik) çifti → KIRMIZI —
// anlamı "izinsiz" DEĞİL, "DOĞRULANMAMIŞ". Varsayılan REDDETMEK; Tailwind
// meşru yeni bir çift ürettiğinde biri bu tabloyu Türkçe GEREKÇEYLE
// genişletir (`TENANT_EXEMPT_PATHS` disiplininin aynısı — görünür inceleme).
// ---------------------------------------------------------------------------
const NAMESPACE_ALLOWED_PROPERTIES: ReadonlyMap<string, readonly string[]> = new Map([
  ['--color-', ['color', 'background-color', 'border-color', '--tw-ring-color']],
  ['--font-size-', ['font-size']],
  ['--font-weight-', ['font-weight', '--tw-font-weight']],
  ['--radius-', ['border-radius']],
  ['--shadow-', ['--tw-shadow']],
])

/** Bir token'ın (`--color-brand-500` gibi) hangi İZLENEN namespace'e ait olduğunu bulur — hiçbiri değilse `null` (kapsam DIŞI, ör. Tailwind'in kendi `--tw-*`/`--spacing`/`--font-sans` altyapı değişkenleri). */
function findTrackedNamespace(token: string): string | null {
  for (const namespace of NAMESPACE_ALLOWED_PROPERTIES.keys()) {
    if (token.startsWith(namespace)) {
      return namespace
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Manifest okuma — `check-bundle-budget.ts` ile AYNI desen (el ile yapısal
// doğrulama, Zod YOK — bu script da `zod`'a bağımlı değil).
// ---------------------------------------------------------------------------
interface ManifestEntry {
  readonly isEntry?: boolean
  readonly css?: readonly string[]
}

type Manifest = Readonly<Record<string, ManifestEntry>>

function isManifestEntry(value: unknown): value is ManifestEntry {
  return typeof value === 'object' && value !== null
}

function parseManifest(raw: unknown): Manifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('dist/.vite/manifest.json beklenen şekilde değil (kök nesne değil)')
  }
  const result: Record<string, ManifestEntry> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isManifestEntry(value)) {
      throw new Error(`dist/.vite/manifest.json içindeki "${key}" girdisi beklenen şekilde değil`)
    }
    result[key] = value
  }
  return result
}

/** `isEntry:true` girdilerinin `css` dizilerini BİRLEŞTİRİR (tekilleştirilmiş) — glob YOK, hash'ten bağımsız. */
function collectEntryCssFiles(manifest: Manifest): readonly string[] {
  const cssFiles = new Set<string>()
  let sawEntry = false

  for (const entry of Object.values(manifest)) {
    if (entry.isEntry !== true) {
      continue
    }
    sawEntry = true
    for (const cssFile of entry.css ?? []) {
      cssFiles.add(cssFile)
    }
  }

  if (!sawEntry) {
    throw new Error(
      '[check-compiled-css-contract] dist/.vite/manifest.json içinde isEntry:true taşıyan hiçbir girdi yok',
    )
  }
  if (cssFiles.size === 0) {
    throw new Error(
      '[check-compiled-css-contract] derlenmiş CSS bulunamadı — bekçi sessizce geçemez (isEntry girdilerinin "css" dizisi boş)',
    )
  }

  return [...cssFiles]
}

// ---------------------------------------------------------------------------
// Kaynak taraması (P1) — `packages/ui/src` + `apps/admin/src`, `.ts` VE
// `.tsx` (Risk 1 — BAĞLAYICI: `.ts` kapsam DIŞI bırakılamaz, `tokens.ts`'teki
// `FOCUS_RING_CLASS_NAMES` BİR `.ts` dosyasında yaşıyor; `.ts`'i kapsam dışı
// bırakmak sessizce kaybolan odak halkasını GÖRÜNMEZ kılar).
// ---------------------------------------------------------------------------
function collectSourceFiles(rootDir: string): readonly string[] {
  const results: string[] = []
  const entries = readdirSync(rootDir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath))
      continue
    }
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(fullPath)
    }
  }

  return results
}

/** Kaynaktaki `-(--token)`/`-(length:--token)` Tailwind v4 özel-özellik referanslarını toplar. */
function collectReferencedTokens(sourceFiles: readonly string[]): ReadonlySet<string> {
  const tokens = new Set<string>()
  const referencePattern = /-\((?:length:)?(--[a-zA-Z0-9-]+)\)/g

  for (const filePath of sourceFiles) {
    const content = readFileSync(filePath, 'utf-8')
    for (const match of content.matchAll(referencePattern)) {
      const token = match[1]
      if (token !== undefined) {
        tokens.add(token)
      }
    }
  }

  return tokens
}

// ---------------------------------------------------------------------------
// Derlenmiş CSS'in bildirim-yerel taraması. AST YOK: `property:value;`
// biçimindeki HER bildirim (sonu `;` VEYA `}` ile kapanan — minified CSS
// son bildirimin `;`sini ATLAYABİLİR) metin genelinde ARANIR; seçici/at-rule
// YUVALANMASI önemsiz çünkü bir bildirimin ANLAMI kendi `property:value`
// çiftinden okunur, çevresinden DEĞİL.
// ---------------------------------------------------------------------------
interface CssDeclaration {
  readonly property: string
  readonly value: string
}

function collectDeclarations(css: string): readonly CssDeclaration[] {
  const declarationPattern = /([a-zA-Z-]+)\s*:\s*([^;{}]*)[;}]/g
  const declarations: CssDeclaration[] = []

  for (const match of css.matchAll(declarationPattern)) {
    const property = match[1]
    const value = match[2]
    if (property !== undefined && value !== undefined) {
      declarations.push({ property, value: value.trim() })
    }
  }

  return declarations
}

/**
 * Bir bildirim DEĞERİNDEKİ her `--token` görünümünü bulur ve `var(...)` ile
 * SARILI OLMAYANLARI döner (sınıf 1 regresyonu — DÜZELTME TURU 2, `solid`
 * L-N7: eski desen yalnızca değerin TAMAMI çıplak bir token olduğunda
 * yakalıyordu, `box-shadow: 0 0 0 2px --color-x` gibi ÇOK BİLEŞENLİ bir
 * değerde `--color-x` GÖRÜNMEZDİ). Her eşleşme için hemen ÖNCESİNDE
 * (boşluk hariç) `var(` var mı diye bakılır — varsa SARILI, yoksa ÇIPLAK.
 */
function collectBareCustomPropertyTokensInValue(value: string): readonly string[] {
  const tokenPattern = /--[a-zA-Z0-9-]+/g
  const bareTokens: string[] = []

  for (const match of value.matchAll(tokenPattern)) {
    const precedingText = value.slice(0, match.index)
    const isWrappedInVar = /var\(\s*$/.test(precedingText)
    if (!isWrappedInVar) {
      bareTokens.push(match[0])
    }
  }

  return bareTokens
}

/** Bir bildirim değerindeki `var(--token...)` çağrılarının token'larını toplar (bir değerde BİRDEN FAZLA olabilir, ör. `box-shadow`). */
function collectVarTokensInValue(value: string): readonly string[] {
  const varPattern = /var\((--[a-zA-Z0-9-]+)/g
  const tokens: string[] = []
  for (const match of value.matchAll(varPattern)) {
    const token = match[1]
    if (token !== undefined) {
      tokens.push(token)
    }
  }
  return tokens
}

interface VarUsage {
  readonly property: string
  readonly token: string
}

function collectVarUsages(declarations: readonly CssDeclaration[]): readonly VarUsage[] {
  const usages: VarUsage[] = []
  for (const declaration of declarations) {
    for (const token of collectVarTokensInValue(declaration.value)) {
      usages.push({ property: declaration.property, token })
    }
  }
  return usages
}

function readCompiledCss(cssRelativeFiles: readonly string[]): string {
  return cssRelativeFiles
    .map((relativePath) => readFileSync(join(DIST_DIR, relativePath), 'utf-8'))
    .join('\n')
}

function main(): void {
  const manifestRaw: unknown = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
  const manifest = parseManifest(manifestRaw)
  const cssFiles = collectEntryCssFiles(manifest)
  const css = readCompiledCss(cssFiles)

  const declarations = collectDeclarations(css)
  const varUsages = collectVarUsages(declarations)

  const failures: string[] = []

  // --- N1 — sarılmamış özel özellik DEĞERİ (sınıf 1 regresyonu) -----------
  // DÜZELTME TURU 2 (`solid` L-N7 — bağlayıcı): artık BİLDİRİM DEĞERİNİN
  // TAMAMI değil, değerin İÇİNDEKİ HER `--token` görünümü ayrı ayrı
  // denetleniyor — `box-shadow: 0 0 0 2px --color-x` gibi ÇOK BİLEŞENLİ
  // bir değerde SARILMAMIŞ bir token artık da YAKALANIYOR (kasıtlı bozma
  // kanıtı raporda).
  // SADECE İZLENEN namespace'ler (`--color-`/`--font-size-`/vb.) — N2'nin
  // AYNI kapsam disiplini (`findTrackedNamespace`). Bu kısıt OLMADAN
  // Tailwind'in KENDİ altyapı değişkenlerini (ör. `--tw-gradient-from`)
  // `transition-property` gibi bir ÖZELLİK LİSTESİNDE kullanan MEŞRU
  // bildirimler YANLIŞ POZİTİF üretirdi (ÖLÇÜLDÜ — bu kısıt EKLENMEDEN
  // bu script kendi derlediği CSS'e karşı KIRMIZI verdi, `transition-
  // property: …,--tw-gradient-from,…` bir `var()` kullanımı DEĞİL, bir
  // ÖZELLİK ADI listesi).
  const bareTokenFailures: string[] = []
  for (const declaration of declarations) {
    for (const bareToken of collectBareCustomPropertyTokensInValue(declaration.value)) {
      if (findTrackedNamespace(bareToken) === null) {
        continue
      }
      bareTokenFailures.push(
        `N1: sarılmamış özel özellik değeri bulundu — özellik "${declaration.property}", değer "${declaration.value}" içindeki "${bareToken}" \`var()\` ile SARILMAMIŞ`,
      )
    }
  }
  if (bareTokenFailures.length > 0) {
    failures.push(
      `N1: toplam ${String(bareTokenFailures.length)} sarılmamış özel özellik değeri bulundu (beklenen 0)`,
      ...bareTokenFailures,
    )
  }

  // --- N2 — namespace ↔ özellik eşlemesi (sınıf 2 regresyonu) -------------
  for (const usage of varUsages) {
    const namespace = findTrackedNamespace(usage.token)
    if (namespace === null) {
      // İZLENMEYEN namespace (Tailwind'in kendi `--tw-*`/`--spacing`/
      // `--font-sans` vb. altyapı değişkenleri) — KAPSAM DIŞI, DEĞERLENDİRİLMEZ.
      continue
    }
    const allowedProperties = NAMESPACE_ALLOWED_PROPERTIES.get(namespace) ?? []
    if (!allowedProperties.includes(usage.property)) {
      failures.push(
        `N2: doğrulanmamış (namespace, özellik) çifti — özellik "${usage.property}", token "${usage.token}" (namespace "${namespace}") tabloda İZİNLİ değil. İzinli özellikler: ${allowedProperties.join(', ')}`,
      )
    }
  }

  // --- P1 — kullanım ölçümü (totoloji-karşıtı) -----------------------------
  const sourceFiles = [...collectSourceFiles(UI_SRC_DIR), ...collectSourceFiles(ADMIN_SRC_DIR)]
  const referencedTokens = collectReferencedTokens(sourceFiles)

  for (const token of referencedTokens) {
    const namespace = findTrackedNamespace(token)
    const foundOnAllowedProperty = varUsages.some((usage) => {
      if (usage.token !== token) {
        return false
      }
      if (namespace === null) {
        return true
      }
      const allowedProperties = NAMESPACE_ALLOWED_PROPERTIES.get(namespace) ?? []
      return allowedProperties.includes(usage.property)
    })
    if (!foundOnAllowedProperty) {
      failures.push(
        `P1: kaynakta "-(${token})" ile referans verilen token derlenmiş CSS'te İZİNLİ bir özellik üzerinde "var(${token})" olarak HİÇ geçmiyor`,
      )
    }
  }

  // --- P2 — sağlık/totoloji (boş/yanlış dosya sessizce geçemez) -----------
  const MIN_DECLARATION_COUNT = 50
  if (declarations.length < MIN_DECLARATION_COUNT) {
    failures.push(
      `P2: taranan CSS yalnızca ${String(declarations.length)} bildirim içeriyor (beklenen ≥ ${String(MIN_DECLARATION_COUNT)}) — yanlış/boş dosya okunmuş olabilir`,
    )
  }
  const themeTokenDefinitionPattern =
    /(?:--color-|--font-size-|--font-weight-|--radius-|--shadow-)[a-zA-Z0-9-]+\s*:\s*[^;]+;/g
  const themeTokenDefinitionCount = [...css.matchAll(themeTokenDefinitionPattern)].length
  const MIN_THEME_TOKEN_DEFINITION_COUNT = 5
  if (themeTokenDefinitionCount < MIN_THEME_TOKEN_DEFINITION_COUNT) {
    failures.push(
      `P2: taranan CSS'te yalnızca ${String(themeTokenDefinitionCount)} "@theme" token tanımı bulundu (beklenen ≥ ${String(MIN_THEME_TOKEN_DEFINITION_COUNT)}) — @theme bloğu işlenmemiş olabilir`,
    )
  }
  if (referencedTokens.size === 0) {
    failures.push(
      'P2: kaynakta (packages/ui/src + apps/admin/src, .ts ve .tsx) HİÇBİR "-(--token)" referansı bulunamadı — kaynak tarama yanlış dizini okuyor olabilir',
    )
  }

  process.stdout.write(
    `[check-compiled-css-contract] taranan CSS dosyası sayısı: ${String(cssFiles.length)}, bildirim sayısı: ${String(declarations.length)}, @theme token tanımı: ${String(themeTokenDefinitionCount)}, kaynakta referans verilen token sayısı: ${String(referencedTokens.size)}\n`,
  )

  if (failures.length > 0) {
    process.stderr.write('[check-compiled-css-contract] FAIL:\n')
    for (const failure of failures) {
      process.stderr.write(`  - ${failure}\n`)
    }
    process.exitCode = 1
    return
  }

  process.stdout.write('[check-compiled-css-contract] PASS — N1/N2/P1/P2 hepsi geçti.\n')
}

try {
  main()
} catch (error: unknown) {
  const message = error instanceof Error ? (error.stack ?? error.message) : 'bilinmeyen hata'
  process.stderr.write(`[check-compiled-css-contract] Beklenmeyen hata: ${message}\n`)
  process.exitCode = 1
}

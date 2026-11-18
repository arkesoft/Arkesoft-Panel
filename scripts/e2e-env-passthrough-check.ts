// @arkesoft — `pnpm guards` adımı: "e2e koşum yolunda okunan `process.env` ⊆
// `turbo.json`'ın `tasks['test:e2e'].passThroughEnv`" mekanik kontrolü
// (ROADMAP v0.0.20, T-021 FIX turu 2, devops — qa tur1 `high` bulgusunun
// İŞ ③'ü: "mekanik kapı kurulabilir mi?" sorusunun CEVABI).
//
// Node'un yerel tip sıyırması ile (derlemesiz) `node scripts/
// e2e-env-passthrough-check.ts` olarak koşar — SİLİNEBİLİR (erasable)
// olmayan sözdizimi KULLANILMAZ: `enum` yok, `namespace` yok, yapıcı
// parametre özelliği yok, dekoratör yok (sync-platform-version.ts'in A-V23
// emsali).
//
// NEDEN BU KAPI VAR (üç bağımsız vaka, aynı sınıf):
//   T-020/S9c — iki `E2E_PORT` değişkeni bildirilmemişti.
//   T-021/S10 — `*_DEV_API_TARGET` değişkenleri bildirilmemişti.
//   T-021 FIX turu 2 — `STOREFRONT_API_BASE_URL`/`APP_BASE_DOMAIN`
//     bildirilmemişti; S10'un taraması `*.config.ts` ile SINIRLIYDI ve
//     `src/lib/storefront-env.ts`'i KAÇIRDI.
// Üçünde de elle grep "hangi dosyaları tarayacağını varsaymak" yüzünden
// eksik kaldı. Bu script taramayı MEKANİK ve TEKRARLANABİLİR yapar.
//
// ⚠⚠ KAPSAM VE BİLİNEN KÖR NOKTA (İŞ ③'ün "gerekçeli görüş" kısmı) — BU
// KAPI TAM DEĞİL, İKİ EKSENİ AYRI AYRI ELE ALIR:
//
// (A) "ADLANDIRILMIŞ" okuma — `process.env['X']` / `process.env.X`. Bu
//     metin tabanlı regex ile GÜVENİLİR biçimde yakalanır (yukarıdaki ÜÇ
//     vakanın İKİSİ bu biçimdeydi) — sıfır bilinen yanlış-pozitif (bu
//     dosyanın yazıldığı turda repo'nun TAMAMI üzerinde ölçüldü).
//
// (B) "BÜTÜN NESNE" geçişi — `parseEnv(process.env)` biçiminde process.env
//     TÜMÜYLE bir fonksiyona verilir, hangi anahtarların okunduğu BAŞKA bir
//     dosyadaki bir Zod şemasından (örn. `storefrontEnvSchema`) gelir. BU
//     TAM OLARAK bu düzeltme turunun KENDİ bulduğu bug'ın biçimiydi
//     (`storefront-env.ts`) — VE metin tabanlı bir regex'in `process.env`'in
//     HANGİ anahtarları okuduğunu BU BİÇİMDE ÇÖZEMEYECEĞİNİN kanıtı: anahtar
//     adları bu dosyada hiç GEÇMİYOR. Gerçek bir çözüm TypeScript Compiler
//     API'siyle tip akışını takip etmeyi (şemanın `z.object({...})`
//     alanlarını (B)'deki çağrı noktasına kadar izlemeyi) gerektirir — bu
//     ölçekte bir statik analiz motoru BU DÜZELTME TURUNUN kapsamı DIŞI
//     (yeni ana bağımlılık/mühendislik yükü, Orkestratör onayı gerektirir).
//     ⇒ Bu kapı (B) sınıfını OTOMATİK ÇÖZMEZ — bunun yerine HER bütün-nesne
//     geçişini `KNOWN_WHOLE_OBJECT_ENV_PASS_FILES`'e KARŞI denetler: listede
//     OLMAYAN bir dosyada yeni bir `process.env` (bütün nesne) geçişi
//     bulunursa kapı KIRMIZI düşer — bu, geliştiriciyi listeye EKLEMEYE VE
//     o dosyanın şemasını ELLE `passThroughEnv` ile karşılaştırmaya ZORLAR.
//     Listede OLAN dosyalar (bugün: `storefront-env.ts`, `root-env-
//     integration.ts`) için HİÇBİR otomatik doğrulama YOK — bu KALICI bir
//     teknik borç (ROADMAP'e not düşüldü, bkz. devops T-021 FIX turu 2
//     raporu).
//
// Satır numarasına DEĞİL dosya yoluna atıfla çalışır (sync-platform-
// version.ts'in CHANGELOG_SENTINEL emsali — satır numarası dosya
// değiştikçe kayar, dosya yolu kaymaz).
//
// ⚠ Yorum/ string sınırı: satır-içi `//` yorumu, satırı İLK `//`'den
// itibaren KESER — bir `http://` gibi bir URL LİTERALİ process.env
// okumasından ÖNCE aynı satırda geçerse bu sahte-negatif üretebilir
// (BİLİNEN, kabul edilmiş sınırlama; bugünkü repo'da ölçülen: SIFIR vaka).
// Blok yorumlar (`/* ... */`) satır SAYISINI korumak için boşlukla
// DOLDURULUR (silinmez) — dosya:satır referanslarının kaymaması için.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const TURBO_JSON_PATH = join(REPO_ROOT, 'turbo.json')
const TARGET_TASK = 'test:e2e'

/**
 * Taranacak kök yollar (REPO_ROOT'a göre) — her uygulamanın `src/**` ve
 * `e2e/**` ağaçları, Playwright/Vite/Astro yapılandırma dosyaları ve `scripts/
 * playwright/**`. T-021 FIX turu 2'nin dersi burada: liste `*.config.ts`
 * İLE SINIRLI DEĞİL — tüm `src/**` ağacı dahil, "açılış-kritik eager
 * process.env okuyan bir yardımcı dosya" bir kez daha kaçırılmasın.
 */
const SCAN_ROOTS: readonly string[] = [
  'apps/admin/src',
  'apps/admin/e2e',
  'apps/admin/playwright.config.ts',
  'apps/admin/vite.config.ts',
  'apps/superadmin/src',
  'apps/superadmin/e2e',
  'apps/superadmin/playwright.config.ts',
  'apps/superadmin/vite.config.ts',
  'apps/storefront/src',
  'apps/storefront/e2e',
  'apps/storefront/playwright.config.ts',
  'apps/storefront/astro.config.ts',
  'scripts/playwright',
]

/**
 * `__tests__` dizinleri kapsam DIŞI — `storefront-env.ts`'in dosya başı
 * yorumunun BİLEREK kabul ettiği istisna: o dosyalardaki `process.env`
 * kullanımı AMBIENT test kurulumu içindir (`setValidEnv()` vb.), gerçek
 * `test:e2e` koşum yoluna GİRMEZ.
 */
const EXCLUDED_DIR_SEGMENT = '__tests__'

/**
 * (B) sınıfı — `process.env` BÜTÜN NESNE olarak bir fonksiyona geçildiği
 * BİLİNEN dosyalar. Yeni bir dosya bu listeye GİRMEDEN (B) deseniyle
 * eşleşirse kapı KIRMIZI düşer.
 *
 * ⚠⚠ ÖLÇÜLMÜŞ KANIT (bu script'in yazıldığı turda, NEGATİF test): bir dosya
 * yalnızca BU LİSTEDE olduğu için "güvenilir" sayılırsa, o dosyanın İÇİNDEKİ
 * Zod şemasının GERÇEK alan adları HİÇBİR ZAMAN doğrulanmaz — `turbo.json`'dan
 * `STOREFRONT_API_BASE_URL`'i elle SİLİP bu script TEKRAR çalıştırıldığında
 * kapı YEŞİL KALDI (çünkü bu ad METİNDE `process.env.X` biçiminde HİÇ
 * GEÇMİYOR, yalnızca bir Zod `z.object({...})` alanı). Bu YÜZDEN her giriş
 * BİR şema dosyasına eşlenir — aşağıdaki `extractZodObjectKeys` o dosyadaki
 * ÜST SEVİYE `z.object({ KEY: ... })` alan adlarını çıkarır ve onları da
 * `allowed` kümesine karşı denetler. Bu, (B) sınıfını TAM AST analizi
 * OLMADAN kapatmaya çalışan BİLİNÇLİ, dar bir ek — şemanın adı/şekli
 * DEĞİŞİRSE (örn. iç içe nesne, hesaplanmış alan adı) bu regex'in de
 * GÜNCELLENMESİ gerekir; bu YÜZDEN hâlâ "tam" değil, ama (A) + bu ek
 * olmadan kapı tamamen KÖRDÜ — ölçüldü.
 */
const KNOWN_WHOLE_OBJECT_ENV_PASS_FILES: ReadonlyMap<string, string> = new Map([
  ['apps/storefront/src/lib/storefront-env.ts', 'apps/storefront/src/lib/storefront-env-schema.ts'],
  [
    'apps/storefront/src/lib/root-env-integration.ts',
    'apps/storefront/src/lib/storefront-env-schema.ts',
  ],
])

/** Üst seviye `z.object({ KEY: ..., KEY2: ... })` alan adlarını çıkarır (yukarıdaki ⚠⚠ notuna bkz. — DAR, şema şekli değişirse güncellenmeli). */
function extractZodObjectKeys(schemaSource: string): readonly string[] {
  const objectMatch = /z\.object\(\s*\{([\s\S]*?)\}\s*\)/.exec(schemaSource)
  if (objectMatch === null) {
    return []
  }
  const body = objectMatch[1] ?? ''
  const keyPattern = /^\s*([A-Z][A-Z0-9_]*)\s*:/gm
  const keys: string[] = []
  let match: RegExpExecArray | null
  while ((match = keyPattern.exec(body)) !== null) {
    const key = match[1]
    if (key !== undefined) {
      keys.push(key)
    }
  }
  return keys
}

/**
 * ADLANDIRILMIŞ okumalardan `test:e2e`'nin `passThroughEnv`'inde OLMASI
 * BEKLENMEYEN, BİLİNÇLİ ve YAZILI gerekçeli istisnalar. Turbo.json'ın
 * kendi dosya başı yorumlarıyla (satır 132-149, 196) TUTARLI tutulur.
 */
const INTENTIONAL_EXCLUSIONS: ReadonlyMap<string, string> = new Map([
  [
    'ARKESOFT_STOREFRONT_VISUAL_RUN',
    'yalnızca test:visual dalını seçer; test:e2e `--project` bayraklarını AÇIKÇA veriyor, bu değişkene bağımlı DEĞİL (turbo.json:145-149).',
  ],
  [
    'ARKESOFT_STOREFRONT_VISUAL_PORT',
    'yalnızca test:visual görev tanımında bildirilir (turbo.json), test:e2e dev projeleri bunu OKUMAZ/İHTİYAÇ DUYMAZ.',
  ],
  [
    'ARKESOFT_STOREFRONT_VISUAL_HOST_GATEWAY_IP',
    'yalnızca Docker içi görsel koşumda (ADR-0022 Karar 4/5) anlamlı; eksikse fonksiyon sessizce undefined döner, test:e2e dalı etkilenmez.',
  ],
])

const NAMED_ENV_PATTERN = /process\.env\[(['"])([A-Z0-9_]+)\1\]|process\.env\.([A-Z0-9_]+)/g
const BARE_ENV_PATTERN = /process\.env(?!\.\w|\[)/g

type NamedHit = { readonly name: string; readonly file: string; readonly line: number }
type BareHit = { readonly file: string; readonly line: number }

function stripCommentsPreservingLineCount(source: string): string {
  const blockStripped = source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
  return blockStripped
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//')
      return idx === -1 ? line : line.slice(0, idx)
    })
    .join('\n')
}

function collectFiles(relRoot: string): string[] {
  const absRoot = join(REPO_ROOT, relRoot)
  const stat = statSync(absRoot, { throwIfNoEntry: false })
  if (stat === undefined) {
    return []
  }
  if (stat.isFile()) {
    return absRoot.endsWith('.ts') || absRoot.endsWith('.tsx') ? [absRoot] : []
  }
  const out: string[] = []
  const entries = readdirSync(absRoot, { withFileTypes: true, recursive: true })
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }
    if (!(entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      continue
    }
    // `recursive: true` ile `entry.parentPath`/`entry.path` Node sürümüne göre
    // değişir; güvenli yol: entry'nin ait olduğu dizini AYRICA yürüyerek
    // mutlak yolu kendimiz kuruyoruz.
    const parentPath = (entry as unknown as { parentPath?: string; path?: string }).parentPath
    const basePath = parentPath ?? (entry as unknown as { path?: string }).path ?? absRoot
    const abs = join(basePath, entry.name)
    if (abs.split('/').includes(EXCLUDED_DIR_SEGMENT)) {
      continue
    }
    out.push(abs)
  }
  return out
}

function scan(): { readonly named: readonly NamedHit[]; readonly bare: readonly BareHit[] } {
  const named: NamedHit[] = []
  const bare: BareHit[] = []
  const seenFiles = new Set<string>()

  for (const root of SCAN_ROOTS) {
    for (const abs of collectFiles(root)) {
      if (seenFiles.has(abs)) {
        continue
      }
      seenFiles.add(abs)
      const rel = relative(REPO_ROOT, abs)
      const raw = readFileSync(abs, 'utf8')
      const clean = stripCommentsPreservingLineCount(raw)
      const lines = clean.split('\n')
      lines.forEach((line, i) => {
        const lineNumber = i + 1
        let namedMatch: RegExpExecArray | null
        const namedRe = new RegExp(NAMED_ENV_PATTERN)
        while ((namedMatch = namedRe.exec(line)) !== null) {
          const name = namedMatch[2] ?? namedMatch[3]
          if (name !== undefined) {
            named.push({ name, file: rel, line: lineNumber })
          }
        }
        const bareRe = new RegExp(BARE_ENV_PATTERN)
        if (bareRe.test(line)) {
          bare.push({ file: rel, line: lineNumber })
        }
      })
    }
  }

  return { named, bare }
}

/** `turbo.json`'daki satır-başı `//` yorumlarını KALDIRIR (dosyada hiçbir satır-içi/takip eden yorum YOK — bu script'in yazıldığı turda `grep` ile doğrulandı) ve JSON olarak ayrıştırır. */
function parseTurboJson(): {
  readonly globalEnv: readonly string[]
  readonly taskEnv: readonly string[]
  readonly taskPassThroughEnv: readonly string[]
} {
  const raw = readFileSync(TURBO_JSON_PATH, 'utf8')
  const withoutLineComments = raw
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line))
    .join('\n')

  let parsed: unknown
  try {
    parsed = JSON.parse(withoutLineComments)
  } catch (cause) {
    throw new Error(
      `turbo.json JSON olarak ayrıştırılamadı (yorum temizleme sözdizimi bozmuş olabilir): ${String(cause)}`,
      { cause },
    )
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('turbo.json kök nesne DEĞİL.')
  }
  const root = parsed as Record<string, unknown>
  const globalEnvRaw = root['globalEnv']
  const globalEnv = Array.isArray(globalEnvRaw)
    ? globalEnvRaw.filter((v): v is string => typeof v === 'string')
    : []

  const tasks = root['tasks']
  if (typeof tasks !== 'object' || tasks === null) {
    throw new Error('turbo.json: "tasks" alanı YOK veya nesne DEĞİL.')
  }
  const task = (tasks as Record<string, unknown>)[TARGET_TASK]
  if (typeof task !== 'object' || task === null) {
    throw new Error(`turbo.json: "tasks.${TARGET_TASK}" alanı YOK veya nesne DEĞİL.`)
  }
  const taskRecord = task as Record<string, unknown>
  const taskEnvRaw = taskRecord['env']
  const taskEnv = Array.isArray(taskEnvRaw)
    ? taskEnvRaw.filter((v): v is string => typeof v === 'string')
    : []
  const taskPassThroughEnvRaw = taskRecord['passThroughEnv']
  const taskPassThroughEnv = Array.isArray(taskPassThroughEnvRaw)
    ? taskPassThroughEnvRaw.filter((v): v is string => typeof v === 'string')
    : []

  return { globalEnv, taskEnv, taskPassThroughEnv }
}

function main(): number {
  const { named, bare } = scan()
  const { globalEnv, taskEnv, taskPassThroughEnv } = parseTurboJson()
  const allowed = new Set<string>([...globalEnv, ...taskEnv, ...taskPassThroughEnv])

  const violations: string[] = []

  const namedByName = new Map<string, NamedHit[]>()
  for (const hit of named) {
    const bucket = namedByName.get(hit.name) ?? []
    bucket.push(hit)
    namedByName.set(hit.name, bucket)
  }

  for (const [name, hits] of namedByName) {
    if (allowed.has(name) || INTENTIONAL_EXCLUSIONS.has(name)) {
      continue
    }
    const locations = hits.map((h) => `${h.file}:${String(h.line)}`).join(', ')
    violations.push(
      `ADLANDIRILMIŞ: "${name}" e2e koşum yolunda okunuyor (${locations}) ama turbo.json'ın tasks['${TARGET_TASK}'].passThroughEnv/env/globalEnv kümesinde YOK ve INTENTIONAL_EXCLUSIONS'ta gerekçeli bir istisna da YOK.`,
    )
  }

  const bareFiles = new Set(bare.map((b) => b.file))
  const checkedSchemaFiles = new Set<string>()
  for (const file of bareFiles) {
    const schemaFile = KNOWN_WHOLE_OBJECT_ENV_PASS_FILES.get(file)
    if (schemaFile === undefined) {
      const lines = bare
        .filter((b) => b.file === file)
        .map((b) => String(b.line))
        .join(', ')
      violations.push(
        `BÜTÜN NESNE: "${file}" satır ${lines} process.env'i TÜMÜYLE bir fonksiyona geçiriyor ve KNOWN_WHOLE_OBJECT_ENV_PASS_FILES'te YOK — bu dosyanın (muhtemelen bir Zod şemasıyla) okuduğu anahtarları ELLE inceleyip ya listeye (şema dosyasıyla eşleyerek) ekleyin ya da turbo.json'ı güncelleyin.`,
      )
      continue
    }
    if (checkedSchemaFiles.has(schemaFile)) {
      continue
    }
    checkedSchemaFiles.add(schemaFile)
    const schemaAbs = join(REPO_ROOT, schemaFile)
    const schemaStat = statSync(schemaAbs, { throwIfNoEntry: false })
    if (schemaStat === undefined) {
      violations.push(
        `BÜTÜN NESNE: "${file}" → eşlenen şema dosyası "${schemaFile}" bulunamadı (taşınmış/silinmiş olabilir) — KNOWN_WHOLE_OBJECT_ENV_PASS_FILES güncellenmeli.`,
      )
      continue
    }
    const schemaKeys = extractZodObjectKeys(readFileSync(schemaAbs, 'utf8'))
    if (schemaKeys.length === 0) {
      violations.push(
        `BÜTÜN NESNE: "${schemaFile}" içinde üst seviye bir "z.object({...})" bulunamadı — şema şekli değişmiş olabilir, extractZodObjectKeys regex'i güncellenmeli (fail-closed: boş sonuç doğrulanamaz anlamına gelir).`,
      )
      continue
    }
    for (const key of schemaKeys) {
      if (allowed.has(key) || INTENTIONAL_EXCLUSIONS.has(key)) {
        continue
      }
      violations.push(
        `BÜTÜN NESNE (şema-türevi): "${schemaFile}" şemasının "${key}" alanı "${file}" üzerinden e2e koşum yolunda ZORUNLU okunuyor ama turbo.json'ın tasks['${TARGET_TASK}'].passThroughEnv/env/globalEnv kümesinde YOK.`,
      )
    }
  }

  if (violations.length > 0) {
    process.stderr.write('e2e-env-passthrough-check: İHLAL(LER) bulundu:\n')
    for (const v of violations) {
      process.stderr.write(`  - ${v}\n`)
    }
    return 1
  }

  process.stdout.write(
    `e2e-env-passthrough-check: ${String(namedByName.size)} adlandırılmış değişken + ${String(bareFiles.size)} bütün-nesne geçişi tarandı, hepsi karşılandı/istisnalı.\n`,
  )
  return 0
}

process.exit(main())

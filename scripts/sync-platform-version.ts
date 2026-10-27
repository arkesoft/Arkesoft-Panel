// Platformun kök `package.json` sürümünü ve kök `CHANGELOG.md`'sini Changesets'in
// `fixed` grubuyla senkronize eden yardımcı script (T-003/K-B1, ROADMAP v0.0.12).
//
// Kök `arkesoft` paketi pnpm workspace üyesi DEĞİL (bilinçli tasarım, ADR-0006) — bu
// yüzden `changeset version` kök sürümüne hiç dokunmaz ve kök `CHANGELOG.md`'yi hiç
// açmaz. Bu script o boşluğu dolduruyor.
//
// Node'un yerel tip sıyırması ile (derlemesiz) `node scripts/sync-platform-version.ts`
// olarak koşar — bu yüzden SİLİNEBİLİR (erasable) olmayan sözdizimi KULLANILMAZ:
// `enum` yok, `namespace` yok, yapıcı parametre özelliği yok, dekoratör yok (A-V23).
//
// Kullanım:
//   node scripts/sync-platform-version.ts --collect   # .changeset/*.md özetlerini topla
//   node scripts/sync-platform-version.ts --apply     # kök version + CHANGELOG.md güncelle
//   node scripts/sync-platform-version.ts --check     # sürüm tutarlılığını doğrula (CI guards)
//
// `--collect` zorunlu çünkü `changeset version` `.changeset/*.md` dosyalarını SİLER —
// Türkçe özetler o anda kaybolmadan önce ara bir dosyaya (`.platform-notes.json`)
// taşınır. `--apply` o ara dosyayı Zod ile parse eder (kendi yazdığımız dosya da
// "dış dünyadan gelen veri" sayılır, CLAUDE.md §4) ve işi bittiğinde siler.

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

// --- Yollar -----------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')

const ROOT_PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json')
const CHANGELOG_PATH = join(REPO_ROOT, 'CHANGELOG.md')
const CHANGESET_DIR = join(REPO_ROOT, '.changeset')
const CHANGESET_CONFIG_PATH = join(CHANGESET_DIR, 'config.json')
const PLATFORM_NOTES_PATH = join(CHANGESET_DIR, '.platform-notes.json')

/** CHANGELOG.md'de Changesets'in yazacağı alanı işaretleyen sabit satır (bu dizenin birebir metni CHANGELOG.md içinde aranır — satır numarasına değil, içeriğe atıf; satır numarası dosya büyüdükçe kayar). */
const CHANGELOG_SENTINEL = '<!-- Changesets bu çizginin altına yazar. Elle girdi eklemeyin. -->'

/**
 * `fixed` grubun dışında ama kendi bağımsız semver'ini taşıyan BİLİNEN paketler
 * (T-003/K-B1, A-V22). Bilinçli olarak elle tutulur, `.changeset/config.json`'dan
 * türetilmez — `--check`'in "yeni paket drifti" kuralı bir workspace paketi ne
 * fixed grupta ne burada bulunduğunda mekanik olarak kırmızıya düşer (A-V25).
 */
const KNOWN_INDEPENDENT_PACKAGES: ReadonlySet<string> = new Set([
  '@arkesoft/theme-sdk',
  '@arkesoft/trpc',
])

/** Workspace paketlerinin arandığı dizinler (`pnpm-workspace.yaml` ile birebir aynı). */
const WORKSPACE_PACKAGE_GROUP_DIRS: readonly string[] = ['apps', 'packages', 'packages/themes']

// --- Zod şemaları (dış dünyadan gelen her veri burada doğrulanır) -----------

const packageNameAndVersionSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
})

const rootPackageJsonSchema = z.object({ version: z.string().min(1) }).loose()

const changesetConfigSchema = z
  .object({
    fixed: z.array(z.array(z.string().min(1))).default([]),
  })
  .loose()

const platformNoteSchema = z.object({
  file: z.string().min(1),
  summary: z.string().min(1),
})

const platformNotesFileSchema = z.object({
  collectedAt: z.string().min(1),
  notes: z.array(platformNoteSchema),
})

type ChangesetConfig = z.infer<typeof changesetConfigSchema>
type PlatformNote = z.infer<typeof platformNoteSchema>
type PlatformNotesFile = z.infer<typeof platformNotesFileSchema>
type WorkspacePackage = { name: string; version: string }

// --- Yardımcılar: JSON okuma --------------------------------------------------

function readJsonUnknown(path: string): unknown {
  const raw = readFileSync(path, 'utf8')
  // JSON.parse'ın dönüş tipi `any`dir; hemen `unknown`'a daraltıp Zod'a devrediyoruz
  // (CLAUDE.md §4 — bilinmeyen için `unknown` + Zod doğrulaması).
  const parsed: unknown = JSON.parse(raw)
  return parsed
}

// --- Semver karşılaştırma (yalnızca major.minor.patch, bağımlılık eklemeden) --

type SemverParts = { major: number; minor: number; patch: number }

function parseSemver(version: string): SemverParts {
  // Düzeltme turu 1 (solid C9): desen önceden sonda "$" TAŞIMIYORDU — ön-sürüm
  // ("-rc.1") ve build eki ("+build.5") SESSİZCE yok sayılıyordu; "0.0.5-rc.1"
  // "0.0.5" ile EŞİT sayılıyordu. Değişiklik: tam eşleşme + varsa ek (`rest`)
  // AÇIKÇA yakalanıp hata fırlatılır — bu script'in karşılaştırma mantığı
  // ön-sürüm/build eklerini desteklemiyor, sessiz yanlış sonuç vermek yerine
  // bunu söyler (CLAUDE.md §4 "hata yutma yasak").
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version)
  if (match === null) {
    throw new Error(`Geçersiz semver dizesi: "${version}"`)
  }
  const majorText = match[1]
  const minorText = match[2]
  const patchText = match[3]
  const rest = match[4]
  if (
    majorText === undefined ||
    minorText === undefined ||
    patchText === undefined ||
    rest === undefined
  ) {
    throw new Error(`Semver bileşenleri okunamadı: "${version}"`)
  }
  if (rest.length > 0) {
    throw new Error(
      `Bu script ön-sürüm/build eki olan semver'leri desteklemiyor: "${version}" (ek: "${rest}").`,
    )
  }
  return { major: Number(majorText), minor: Number(minorText), patch: Number(patchText) }
}

function compareSemver(a: string, b: string): number {
  const left = parseSemver(a)
  const right = parseSemver(b)
  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  return left.patch - right.patch
}

// --- Workspace paket keşfi -----------------------------------------------------

/** `apps/*`, `packages/*`, `packages/themes/*` altındaki her `package.json`'u okur. */
function discoverWorkspacePackages(): WorkspacePackage[] {
  const results: WorkspacePackage[] = []
  for (const groupDir of WORKSPACE_PACKAGE_GROUP_DIRS) {
    const absoluteGroupDir = join(REPO_ROOT, groupDir)
    if (!existsSync(absoluteGroupDir)) {
      continue
    }
    const entries = readdirSync(absoluteGroupDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const packageDir = join(absoluteGroupDir, entry.name)
      const packageJsonPath = join(packageDir, 'package.json')
      if (!existsSync(packageJsonPath)) {
        continue
      }
      const parsed = readJsonUnknown(packageJsonPath)
      const pkg = packageNameAndVersionSchema.parse(parsed)
      results.push({ name: pkg.name, version: pkg.version })
    }
  }
  return results
}

function getFixedGroupMembers(config: ChangesetConfig): string[] {
  const members = new Set<string>()
  for (const group of config.fixed) {
    for (const name of group) {
      members.add(name)
    }
  }
  return [...members]
}

function readChangesetConfig(): ChangesetConfig {
  const parsed = readJsonUnknown(CHANGESET_CONFIG_PATH)
  return changesetConfigSchema.parse(parsed)
}

// --- `.changeset/*.md` → Türkçe özet toplama (--collect) ----------------------

const FRONT_MATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/

function readChangesetSummaries(): PlatformNote[] {
  if (!existsSync(CHANGESET_DIR)) {
    return []
  }
  const entries = readdirSync(CHANGESET_DIR, { withFileTypes: true })
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  return fileNames.map((fileName) => {
    const raw = readFileSync(join(CHANGESET_DIR, fileName), 'utf8')
    const match = FRONT_MATTER_PATTERN.exec(raw)
    if (match === null) {
      throw new Error(
        `Changeset dosyası beklenen ön-madde (front-matter) biçiminde değil: ${fileName}`,
      )
    }
    const body = match[1]
    if (body === undefined) {
      throw new Error(`Changeset dosyasının gövdesi okunamadı: ${fileName}`)
    }
    const summary = body.trim()
    if (summary.length === 0) {
      throw new Error(`Changeset dosyasının Türkçe özeti boş: ${fileName}`)
    }
    return { file: fileName, summary }
  })
}

// --- CHANGELOG.md girdisi üretimi ve ekleme (--apply) --------------------------

function buildChangelogEntryLines(version: string, notes: readonly PlatformNote[]): string[] {
  const date = new Date().toISOString().slice(0, 10)
  const bulletLines =
    notes.length > 0
      ? notes.map((note) => `- ${note.summary}`)
      : ['- (bu sürümde toplanan Türkçe özet yok)']
  return [`## ${version} — ${date}`, '', ...bulletLines]
}

/**
 * Yeni girdiyi sentinel satırın hemen altına ekler. Sentinel bulunamazsa dosyaya
 * DOKUNMADAN hata fırlatır (fail-closed) — çağıran bu sonucu yazmadan önce üretir,
 * böylece hata durumunda hiçbir dosya değişmemiş olur.
 */
function insertChangelogEntry(entryLines: readonly string[]): string {
  const original = readFileSync(CHANGELOG_PATH, 'utf8')
  const lines = original.split('\n')
  const sentinelIndex = lines.findIndex((line) => line === CHANGELOG_SENTINEL)
  if (sentinelIndex === -1) {
    throw new Error(
      `CHANGELOG.md içinde sentinel satırı bulunamadı: "${CHANGELOG_SENTINEL}". Dosyaya dokunulmadı.`,
    )
  }
  const before = lines.slice(0, sentinelIndex + 1)
  const after = lines.slice(sentinelIndex + 1)
  return [...before, '', ...entryLines, ...after].join('\n')
}

function readPlatformNotes(): PlatformNotesFile {
  if (!existsSync(PLATFORM_NOTES_PATH)) {
    throw new Error(
      `${PLATFORM_NOTES_PATH} bulunamadı. Önce "--collect" çalıştırılmalı ("changeset version" ` +
        '.changeset/*.md dosyalarını siler, özetler ondan önce toplanmalı).',
    )
  }
  const parsed = readJsonUnknown(PLATFORM_NOTES_PATH)
  return platformNotesFileSchema.parse(parsed)
}

function resolveFixedGroupVersion(
  members: readonly string[],
  packages: readonly WorkspacePackage[],
): string {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg.version]))
  const versions = new Set<string>()
  for (const name of members) {
    const version = byName.get(name)
    if (version === undefined) {
      throw new Error(`fixed grup üyesi "${name}" workspace'te bulunamadı.`)
    }
    versions.add(version)
  }
  if (versions.size !== 1) {
    throw new Error(
      `fixed grup üyeleri aynı sürümde değil: ${[...versions].sort().join(', ')}. ` +
        '"changeset version" önce koşmuş olmalı.',
    )
  }
  const [version] = versions
  if (version === undefined) {
    throw new Error('fixed grup boş; sürüm belirlenemedi.')
  }
  return version
}

/** Kök `package.json`'da YALNIZCA `version` alanını değiştirir; diğer her şey (anahtar
 * sırası, 2-boşluk girinti, sondaki satır sonu) birebir korunur. Bunun için Zod ile
 * doğrulanmış ORİJİNAL nesne mutasyona uğratılır — yeniden inşa edilmez. */
function updateRootVersion(newVersion: string): void {
  const parsed = readJsonUnknown(ROOT_PACKAGE_JSON_PATH)
  rootPackageJsonSchema.parse(parsed) // doğrulama; dönen (yeniden inşa edilmiş) değeri KULLANMIYORUZ
  const rootPackage = parsed as { version: string; [key: string]: unknown }
  rootPackage.version = newVersion
  writeFileSync(ROOT_PACKAGE_JSON_PATH, `${JSON.stringify(rootPackage, null, 2)}\n`, 'utf8')
}

function runApply(): void {
  const config = readChangesetConfig()
  const fixedMembers = getFixedGroupMembers(config)
  const packages = discoverWorkspacePackages()
  const newVersion = resolveFixedGroupVersion(fixedMembers, packages)
  const notesFile = readPlatformNotes()

  // Sentinel yoksa burada (yazmadan önce) hata fırlar — hiçbir dosya değişmemiş olur.
  const entryLines = buildChangelogEntryLines(newVersion, notesFile.notes)
  const newChangelogContent = insertChangelogEntry(entryLines)

  updateRootVersion(newVersion)
  writeFileSync(CHANGELOG_PATH, newChangelogContent, 'utf8')
  rmSync(PLATFORM_NOTES_PATH, { force: true })

  process.stdout.write(
    `--apply: kök sürüm → ${newVersion} · CHANGELOG.md güncellendi · ${PLATFORM_NOTES_PATH} silindi.\n`,
  )
}

// --- --collect ------------------------------------------------------------------

function runCollect(): void {
  const notes = readChangesetSummaries()
  const payload: PlatformNotesFile = {
    collectedAt: new Date().toISOString(),
    notes,
  }
  // Yazmadan önce kendi ürettiğimiz veriyi de Zod ile doğruluyoruz (CLAUDE.md §4 —
  // kendi yazdığımız ara dosya da "--apply" için dış dünyadan gelen veri sayılır).
  platformNotesFileSchema.parse(payload)
  writeFileSync(PLATFORM_NOTES_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  process.stdout.write(
    `--collect: ${String(notes.length)} changeset özeti toplandı → ${PLATFORM_NOTES_PATH}\n`,
  )
}

// --- --check ----------------------------------------------------------------------

function runCheck(): void {
  const config = readChangesetConfig()
  const fixedMembers = getFixedGroupMembers(config)
  const packages = discoverWorkspacePackages()
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg.version]))

  const rootParsed = readJsonUnknown(ROOT_PACKAGE_JSON_PATH)
  const rootVersion = rootPackageJsonSchema.parse(rootParsed).version

  let hasError = false

  const fixedVersions: string[] = []
  for (const name of fixedMembers) {
    const version = byName.get(name)
    if (version === undefined) {
      process.stderr.write(`HATA: fixed grup üyesi "${name}" workspace'te bulunamadı.\n`)
      hasError = true
      continue
    }
    fixedVersions.push(version)
  }

  if (fixedVersions.length > 0) {
    const maxFixedVersion = fixedVersions.reduce((max, version) =>
      compareSemver(version, max) > 0 ? version : max,
    )

    // Kural 1 (HATA): kök sürüm, fixed grubun en yüksek sürümüne eşit olmalı.
    if (compareSemver(rootVersion, maxFixedVersion) !== 0) {
      process.stderr.write(
        `HATA: kök sürüm (${rootVersion}) fixed grubun en yüksek sürümüyle ` +
          `(${maxFixedVersion}) eşleşmiyor.\n`,
      )
      hasError = true
    }

    // Kural 3 (UYARI): fixed grup içi sürüm sapması — hata DEĞİL.
    const uniqueFixedVersions = [...new Set(fixedVersions)].sort(compareSemver)
    if (uniqueFixedVersions.length > 1) {
      process.stdout.write(
        `UYARI: fixed grup içi sürüm sapması var: ${uniqueFixedVersions.join(', ')}\n`,
      )
    }
  }

  // Kural 2 (HATA): workspace paketi ne fixed grupta ne bilinen bağımsız kümede
  // (yeni paket drifti — @arkesoft/versioning / @arkesoft/i18n oluşturulduğunda tetiklenir, A-V25).
  const fixedMemberSet = new Set(fixedMembers)
  for (const pkg of packages) {
    if (!fixedMemberSet.has(pkg.name) && !KNOWN_INDEPENDENT_PACKAGES.has(pkg.name)) {
      process.stderr.write(
        `HATA: paket "${pkg.name}" ne fixed grupta ne bilinen bağımsız kümede (yeni paket drifti).\n`,
      )
      hasError = true
    }
  }

  if (hasError) {
    process.exitCode = 1
    return
  }
  process.stdout.write('--check: sürüm tutarlılığı doğrulandı.\n')
}

// --- Mod seçimi: discriminated union + exhaustive switch ---------------------------

type Mode = { kind: 'collect' } | { kind: 'apply' } | { kind: 'check' }

function assertNever(value: never): never {
  throw new Error(`Beklenmeyen mod: ${JSON.stringify(value)}`)
}

function printUsageAndExit(): never {
  process.stderr.write(
    [
      'Kullanım: node scripts/sync-platform-version.ts <--collect|--apply|--check>',
      'Tam olarak bir bayrak verilmelidir.',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

function parseArgs(argv: readonly string[]): Mode {
  if (argv.length !== 1) {
    printUsageAndExit()
  }
  const flag = argv[0]
  if (flag === undefined) {
    printUsageAndExit()
  }
  switch (flag) {
    case '--collect':
      return { kind: 'collect' }
    case '--apply':
      return { kind: 'apply' }
    case '--check':
      return { kind: 'check' }
    default:
      printUsageAndExit()
  }
}

function main(): void {
  const mode = parseArgs(process.argv.slice(2))
  switch (mode.kind) {
    case 'collect':
      runCollect()
      return
    case 'apply':
      runApply()
      return
    case 'check':
      runCheck()
      return
    default:
      assertNever(mode)
  }
}

try {
  main()
} catch (error) {
  // Düzeltme turu 1 (solid C12): önceden yalnızca "error.message" yazılıyordu
  // — beklenmeyen bir programlama hatasında (ör. TypeError) yığın izi
  // (stack) kaybolup CI'da teşhisi zorlaştırıyordu. "stack" varsa mesajı
  // ZATEN içerir; yoksa (Error olmayan fırlatma) ham değere düşülür.
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`HATA: ${message}\n`)
  process.exitCode = 1
}

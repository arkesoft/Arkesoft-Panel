// scripts/playwright/sql.ts — Paylaşılan e2e "docker exec … psql" alt
// süreç yardımcısı (ROADMAP v0.0.20, T-021/S9, ADR-0022 Karar 1 — ⭐
// GÜNCELLEME bloğu, 2026-11-15).
//
// NEDEN BU DOSYA VAR: ADR-0022 Karar 1'in UYGULAMASI (`runSql`/`querySqlRows`
// gövdeleri + dört korumanın ((a)-(d)) gövdeleri) iki e2e fabrikasında
// (`apps/admin/e2e/fixtures/tenant-cleanup.ts`,
// `apps/storefront/e2e/fixtures/custom-domain-tenant.ts`) BAĞIMSIZ kopya
// olarak yaşıyordu. `solid` tur2 sapmayı ~117 satır / +%41 ölçtü; v0.0.20'nin
// ÜÇÜNCÜ bir e2e fabrikası (`apps/superadmin`) getirmesi kopyayı ÜÇE
// çıkaracaktı. ADR-0022'nin gözden geçirme koşulu İKİ ŞARTLI okundu
// ("üçüncü uygulama e2e kazanır VE dizin sözleşmesi yetersiz kalırsa") —
// ikinci şart gerçekleşmedi (`superadmin`'de `responsive/`/`visual/` yok)
// ⇒ Karar 3 (dizin tabanlı proje ayrımı) AÇILMADI, yalnızca Karar 1'in
// UYGULAMASI bu tek modülde birleştirildi.
//
// NE TAŞINDI / NE KALDI (ADR-0022 güncelleme bloğu, birebir):
// Taşınan: `docker exec … psql` alt süreç yardımcısının gövdesi
// (`runSql`/`querySqlRows`) + dört korumanın ((a)-(d)) gövdeleri +
// `DOCKER_HOST_ALLOWED_HOSTNAMES` + `resolveEffectiveDockerEndpoint()` +
// `resolvePostgresContainerName()`.
// Kalan (fabrika başına, BU DOSYADA DEĞİL): kendi `e2e-` önek deseni, kendi
// tablo/temizlik mantığı, kendi hata metni öneki (aşağıdaki `label`
// parametresiyle taşınır — her çağıran KENDİ önekini verir, bu dosya
// sabit bir önek DAYATMAZ).
//
// KARAR 1'İN YASAKLARI DEĞİŞMEDİ: yol hâlâ `docker exec … psql` alt
// sürecidir; e2e katmanında Prisma/`@arkesoft/db`/Node Postgres sürücüsü
// YOKTUR — bu dosya da istisna değildir (yalnızca `node:child_process`).
//
// YER SEÇİMİ: `scripts/playwright/` (Karar 6'nın zaten kurduğu alan —
// `scripts/tsconfig.json`'ın `include: ["*.ts", "playwright/*.ts"]`'i bu
// dosyayı da kapsıyor, `base.ts`'in T-020/S4 düzeltmesiyle AYNI genişletme).
// `packages/config` DEĞİL: Playwright'ın TypeScript dönüştürücüsü
// `node_modules`'ü hariç tutar, bir workspace paketinden ham `.ts` ihraç
// edilip fixture'dan import edilemez (`base.ts`'in dosya başı notuyla AYNI
// gerekçe).
//
// ⚠ GÜVENCE — R-PO3 ÖLÇÜMÜ: bu modül fixture'lardan (paket kökü DIŞINA,
// `apps/<app>/e2e/fixtures/**` → kök `scripts/playwright/`) GÖRELİ yolla
// import ediliyor; bu, `playwright.config.ts`'in kullandığı (config YÜKLEME)
// transform yolundan FARKLI bir yol (TEST ÇALIŞTIRMA transformu). Bu
// farkın ÖLÇÜLMÜŞ kanıtı rapor paketindedir (`npx playwright test --list`
// her iki fabrika için de BAŞARIYLA transform/import çözümlüyor).
//
// `label` PARAMETRESİ: her çağıran KENDİ hata metni önekini verir (ör.
// `'e2e fixture'`, `'tenant-cleanup'`) — bu, taşınmadan ÖNCEki iki
// fabrikanın birbirinden farklı hata metinlerini KORUR; bu dosya bir
// varsayılan önek DAYATMAZ.
//
// ⚠ LİTERAL-JETON DİSİPLİNİ (AGENT_BASELINE.md §5): bu dosyanın KENDİSİ
// `scripts/guards.sh`'in ADR-0022 K1(d) taramasının BEKLENEN TEK hedefidir
// — "docker exec"/"psql" jetonlarını (mekanizma + düzyazı) TAŞIMASI
// BEKLENİR. Taşımaması gereken yer `apps/*/src/**` ve İKİ fabrikanın
// KENDİ dosyalarıdır (K1(d) alt kontrol 1 ve 2) — bu yüzden fabrikaların
// yorumlarında bu jetonlar bitişik YAZILMAZ; bu dosyanın YORUMLARINDA da
// (yalnızca KOD içindeki gerçek `execFileSync` çağrıları için literal
// gereklidir) bitişik düzyazı jetonu TEKRARLANMAZ — kod zaten tek doğruluk
// kaynağıdır.
import { execFileSync } from 'node:child_process'

/**
 * Postgres'in HOST'ta yayınlandığı (published) port — compose'daki
 * `${POSTGRES_PORT:-5432}:5432` ile birebir aynı varsayılan/override
 * sözleşmesi; CI'nın `services:` bloğu bunu her zaman sabit `5432` olarak
 * yayınlıyor — bu yüzden CI'da override gerekmez, yalnızca yerel
 * özelleştirme için var.
 */
export const POSTGRES_HOST_PORT = process.env['POSTGRES_PORT'] ?? '5432'
export const POSTGRES_USER = process.env['POSTGRES_USER'] ?? 'arkesoft'
export const POSTGRES_DB = process.env['POSTGRES_DB'] ?? 'arkesoft'

/**
 * Koruma (a) allowlist'i — iki fabrikanın taşınmadan önceki birebir aynı
 * kümesi.
 */
export const DOCKER_HOST_ALLOWED_HOSTNAMES: ReadonlySet<string> = new Set([
  '127.0.0.1',
  '::1',
  'localhost',
])

/**
 * Koruma (b) — bu modül `NODE_ENV`'i AYARLAMAZ, yalnızca OKUR. Tek yazıcı
 * her uygulamanın kendi `playwright.config.ts`'i (`NODE_ENV ??= 'test'`).
 */
export function assertTestEnvironment(label: string): void {
  const nodeEnv = process.env['NODE_ENV']
  if (nodeEnv !== 'test') {
    throw new Error(
      `${label} yalnızca NODE_ENV=test ortamında koşabilir — fail-closed kapı tetiklendi (ölçülen process.env.NODE_ENV: ${String(nodeEnv)}). playwright.config.ts bu değeri ayarlamalı.`,
    )
  }
}

/**
 * Docker CLI'ın GERÇEKTEN bağlanacağı daemon uç noktasını döner —
 * `DOCKER_HOST` ortam değişkeni TANIMLIYSA onu, DEĞİLSE aktif context'in
 * uç noktasını (bu ikisi docker CLI'ın KENDİ önceliğiyle AYNI sıra).
 * Komut başarısızsa veya boş dönerse fail-closed fırlatır (sessiz "yerel
 * ⇒ güvenli" varsayımı YOK).
 */
export function resolveEffectiveDockerEndpoint(label: string): string {
  let output: Buffer
  try {
    output = execFileSync(
      'docker',
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (error) {
    throw new Error(
      `${label}: docker'ın efektif daemon uç noktası okunamadı ("docker context inspect" başarısız oldu) — fail-closed kapı tetiklendi.`,
      { cause: error },
    )
  }
  const endpoint = output.toString('utf8').trim()
  if (endpoint === '') {
    throw new Error(
      `${label}: docker context'in efektif daemon uç noktası boş döndü — fail-closed kapı tetiklendi.`,
    )
  }
  return endpoint
}

/**
 * Koruma (a) — hedef docker daemon'ı yalnızca loopback (unix:///npipe://
 * veya 127.0.0.1/::1/localhost üzerinden tcp://,ssh://) ise izin verir.
 * `DOCKER_HOST`'u DOĞRUDAN okumaz — `docker context inspect` üzerinden
 * efektif uç noktayı sorar (bu, hem `DOCKER_HOST` override'ını hem aktif
 * context'i aynı sorguda kapsar).
 */
export function assertDockerHostIsLoopback(label: string): void {
  const endpoint = resolveEffectiveDockerEndpoint(label)
  let endpointUrl: URL
  try {
    endpointUrl = new URL(endpoint)
  } catch (error) {
    throw new Error(
      `${label}: docker'ın efektif daemon uç noktası ayrıştırılamadı — fail-closed kapı tetiklendi (uç nokta: ${endpoint})`,
      { cause: error },
    )
  }
  if (endpointUrl.protocol === 'unix:' || endpointUrl.protocol === 'npipe:') {
    // Yerel soket (unix domain socket) / Windows named pipe — hostname
    // TAŞIMAZ, KOŞULSUZ güvenli.
    return
  }
  if (!DOCKER_HOST_ALLOWED_HOSTNAMES.has(endpointUrl.hostname)) {
    throw new Error(
      `${label} yalnızca loopback docker daemon'a (unix://, npipe:// veya 127.0.0.1/::1/localhost üzerinden tcp://,ssh://) karşı koşabilir — fail-closed kapı tetiklendi (çözülen uç nokta: ${endpoint})`,
    )
  }
}

/**
 * `docker ps`'in KENDİSİ tek bir koşumda değişmeyen bir gerçeği sorguluyor
 * (hangi konteyner `POSTGRES_HOST_PORT`'u yayınlıyor) — süreç ömrü boyunca
 * bellek içi önbelleğe alınır, her SQL çağrısında TEKRAR sorgulanmaz.
 * ⚠ Önbellek bu modülün süreç ömrü boyunca PAYLAŞILIR — aynı Playwright
 * süreci içinde birden fazla fabrika çağırırsa (bugün olmuyor, her
 * uygulama kendi Playwright sürecinde koşuyor) port AYNI olduğu için
 * sonuç da aynıdır; davranış değişmez.
 */
let cachedContainerName: string | undefined

/**
 * Host'ta `POSTGRES_HOST_PORT`'u yayınlayan (published) TEK konteynerin
 * adını döner. Hem yerelde (`arkesoft-postgres`, compose) hem CI'da
 * (`services:` bloğunun otomatik ürettiği ad) AYNI şekilde çalışır — isim
 * yerine PORT'tan türetilmiş bağlantı bilgisiyle çözümlenir. Sıfır/birden-
 * fazla eşleşme FAIL-CLOSED'tır (belirsiz durumda sessizce ilkini seçmek
 * YASAK).
 */
export function resolvePostgresContainerName(label: string): string {
  if (cachedContainerName !== undefined) {
    return cachedContainerName
  }
  assertTestEnvironment(label)
  assertDockerHostIsLoopback(label)
  let output: Buffer
  try {
    output = execFileSync(
      'docker',
      ['ps', '--filter', `publish=${POSTGRES_HOST_PORT}`, '--format', '{{.Names}}'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (error) {
    throw new Error(
      [
        `${label}: host portu ${POSTGRES_HOST_PORT}'u yayınlayan konteyner listelenemedi ("docker ps" başarısız oldu).`,
        "Ön koşul: yerelde `pnpm infra:up`, CI'da `services: postgres` ayakta olmalı.",
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
      { cause: error },
    )
  }
  const names = output
    .toString('utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (names.length === 0) {
    throw new Error(
      `${label}: host portu ${POSTGRES_HOST_PORT}'u yayınlayan hiçbir Docker konteyneri bulunamadı — fail-closed kapı tetiklendi. Ön koşul: yerelde \`pnpm infra:up\`, CI'da \`services: postgres\` ayakta olmalı.`,
    )
  }
  if (names.length > 1) {
    throw new Error(
      `${label}: host portu ${POSTGRES_HOST_PORT}'u BİRDEN FAZLA konteyner yayınlıyor (${names.join(', ')}) — belirsiz hedef, fail-closed kapı tetiklendi.`,
    )
  }
  const resolved = names[0]
  if (resolved === undefined) {
    throw new Error(`${label}: beklenmeyen durum — tek eşleşme bulundu ama ad okunamadı.`)
  }
  cachedContainerName = resolved
  return resolved
}

/**
 * Tek bir SQL ifadesini çalışan Postgres konteynerine yazar (sonuç
 * döndürmez). `maxBuffer` iki taşınan gövdenin en büyüğüne göre AÇIKÇA
 * büyütüldü (varsayılan 1MB) — `tenant-cleanup.ts`'in ölçülmüş `ENOBUFS`
 * arızasının (geniş `LIKE` taraması) ikinci savunma katmanı; küçük
 * yazmalar için davranış DEĞİŞMEZ.
 */
export function runSql(sql: string, label: string): void {
  assertTestEnvironment(label)
  assertDockerHostIsLoopback(label)
  const containerName = resolvePostgresContainerName(label)
  try {
    execFileSync(
      'docker',
      [
        'exec',
        containerName,
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        POSTGRES_USER,
        '-d',
        POSTGRES_DB,
        '-c',
        sql,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 },
    )
  } catch (error) {
    throw new Error(
      [
        `${label}: "${containerName}" Docker konteynerinde SQL çalıştırılamadı.`,
        "Ön koşul: yerelde `pnpm infra:up`, CI'da `services: postgres` ayakta olmalı.",
        `Denenen komut: docker exec ${containerName} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "${sql}"`,
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
      { cause: error },
    )
  }
}

/**
 * Bir SELECT'in satırlarını (`-tAc`: tuples-only, unaligned) düz metin
 * dizisi olarak döner — her satır tek sütun, satır sonlarıyla ayrılmış.
 */
export function querySqlRows(sql: string, label: string): readonly string[] {
  assertTestEnvironment(label)
  assertDockerHostIsLoopback(label)
  const containerName = resolvePostgresContainerName(label)
  let output: Buffer
  try {
    output = execFileSync(
      'docker',
      [
        'exec',
        containerName,
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        POSTGRES_USER,
        '-d',
        POSTGRES_DB,
        '-tAc',
        sql,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 },
    )
  } catch (error) {
    throw new Error(
      [
        `${label}: "${containerName}" Docker konteynerinde SQL çalıştırılamadı.`,
        "Ön koşul: yerelde `pnpm infra:up`, CI'da `services: postgres` ayakta olmalı.",
        `Denenen komut: docker exec ${containerName} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -tAc "${sql}"`,
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
      { cause: error },
    )
  }
  return output
    .toString('utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

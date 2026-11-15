// @arkesoft/storefront — e2e DB fixture'ları: soft-delete (AC6) ve özel alan
// adı (AC7) senaryoları (ROADMAP v0.0.8, T-009/S9, qa — ÜRETİM ROLÜNDE)
//
// NEDEN `@arkesoft/db` İTHAL EDİLMİYOR (AC10'un mimari sınırı, bağlayıcı):
// `apps/storefront/src/**` veritabanına DOĞRUDAN dokunmaz — bu hem
// `eslint.config.mjs`'in `dbRestriction` kuralıyla hem de YAPISAL olarak
// (`@arkesoft/db` bu paketin `package.json`'ında dependency/devDependency
// DEĞİL; pnpm'in sembolik bağlantı çözümlemesi `apps/storefront/node_modules/
// @arkesoft/db`'yi hiç ÜRETMEZ) zorlanıyor. Bu dosya `apps/storefront/
// package.json`'a DOKUNMADAN (S3'ün dosyası, DOKUNMA kısıtı) AYNI sınırı
// korur: `@arkesoft/db`'yi hiç ithal ETMEZ.
//
// AC6/AC7'nin gerektirdiği iki ek tenant satırı (soft-delete edilmiş / özel
// alan adlı) seed'de YOK ve bu sürümde (v0.1.0'a kadar) bir tenant oluşturma/
// silme tRPC uç noktası da YOK — bu yüzden bu dosya `pnpm infra:up`'ın
// başlattığı, ÇALIŞAN `arkesoft-postgres` Docker konteynerine `docker exec
// ... psql` ile DOĞRUDAN SQL yazar/siler. Bu, hem AC10'un mimari sınırını
// (storefront KODU asla DB'ye dokunmuz — burada dokunan storefront'un KODU
// DEĞİL, bu e2e YARDIMCISININ çalışma zamanı kabuk komutu) hem "AC7: seed
// DEĞİŞMEZ" şartını (hiçbir repo dosyası yazılmıyor — `git diff --stat --
// packages/db` bu yüzden BOŞ kalır, yalnızca ÇALIŞAN konteynerin verisi
// değişir) ihlal etmeden iki fixture satırını üretir/temizler.
//
// Konteyner kapalıyken (ön koşul karşılanmadıysa) Türkçe, AÇIK bir hata
// fırlatılır — `global-setup.ts`'in "en pahalı teşhis sınıfı" ilkesiyle
// tutarlı.
//
// ⚠⚠ DÜZELTME (devops, T-020/S9a, 2026-11-15 — Orkestratör'ün CI koşumu
// `43713883521` bulgusu): konteyner adı ESKİDEN `POSTGRES_CONTAINER =
// 'arkesoft-postgres'` SABİTİYLE aranıyordu. Bu YERELDE doğru
// (`infra/docker-compose.yml:23`'ün `container_name:`'i) AMA CI'da Postgres
// bir GitHub Actions `services:` konteyneri — adı OTOMATİK üretiliyor,
// `arkesoft-postgres` YOK (`.github/workflows/ci.yml` `e2e`/`api` job'ları,
// `ports: ['5432:5432']`). ⭐ ADR-0022 Karar 1'in KENDİ METNİ bu ismi hiç
// ZORUNLU KILMIYOR — "çalışan Postgres konteynerine `docker exec … psql`
// ile" diyor, bir isim BELİRTMİYOR; arıza KARARIN değil, UYGULAMANIN
// sabit-isim varsayımıydı (`apps/admin/e2e/fixtures/tenant-cleanup.ts`'teki
// BİREBİR AYNI düzeltme notuna bakın — po'nun "iki kopya, ortak modül
// değil" kararı GEÇERLİ, bu yüzden aynı düzeltme İKİ dosyada BAĞIMSIZ
// uygulanıyor). Düzeltme: konteyner adı artık host'ta YAYINLANAN
// (published) porttan `docker ps --filter publish=<port>` ile DİNAMİK
// çözülüyor — TEK mekanizma hem yerelde hem CI'da aynı şekilde çalışıyor;
// `docker exec … psql` YAZMA YOLU DEĞİŞMEDİ. `scripts/guards.sh`'in
// `check_adr22_k1d_shellout_boundary` allowlist'i bu dosyada hâlâ BİREBİR
// AYNI "docker exec"/"psql" jetonlarını görüyor — tarama GÜNCELLEME
// GEREKTİRMİYOR (ölçüldü, S9a raporunda).
import { execFileSync } from 'node:child_process'

/**
 * Postgres'in HOST'ta yayınlandığı (published) port — compose'daki
 * `${POSTGRES_PORT:-5432}:5432` ile BİREBİR aynı varsayılan/override
 * sözleşmesi; CI'nın `services:` bloğu bunu her zaman sabit `5432` olarak
 * yayınlıyor (`ci.yml` `api`/`e2e` job'ları, `ports: ['5432:5432']`) — bu
 * yüzden CI'da override GEREKMEZ, yalnızca yerel özelleştirme için var.
 */
const POSTGRES_HOST_PORT = process.env['POSTGRES_PORT'] ?? '5432'
const POSTGRES_USER = process.env['POSTGRES_USER'] ?? 'arkesoft'
const POSTGRES_DB = process.env['POSTGRES_DB'] ?? 'arkesoft'

/**
 * `docker ps`'in KENDİSİ tek bir koşumda değişmeyen bir gerçeği sorguluyor
 * (hangi konteyner `POSTGRES_HOST_PORT`'u yayınlıyor) — süreç ömrü boyunca
 * bellek içi önbelleğe alınır, her SQL çağrısında TEKRAR sorgulanmaz.
 */
let cachedContainerName: string | undefined

/**
 * Host'ta `POSTGRES_HOST_PORT`'u yayınlayan (published) TEK konteynerin
 * adını döner. Hem yerelde (`arkesoft-postgres`, compose) hem CI'da
 * (`services:` bloğunun otomatik ürettiği ad) AYNI şekilde çalışır — isim
 * yerine PORT'tan türetilmiş bağlantı bilgisiyle çözümlenir (dosya başı
 * DÜZELTME notu). Sıfır/birden-fazla eşleşme FAIL-CLOSED'tır (belirsiz
 * durumda sessizce ilkini seçmek YASAK).
 */
function resolvePostgresContainerName(): string {
  if (cachedContainerName !== undefined) {
    return cachedContainerName
  }
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
        `e2e fixture: host portu ${POSTGRES_HOST_PORT}'u yayınlayan konteyner listelenemedi ("docker ps" başarısız oldu).`,
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
      `e2e fixture: host portu ${POSTGRES_HOST_PORT}'u yayınlayan hiçbir Docker konteyneri bulunamadı — fail-closed kapı tetiklendi. Ön koşul: yerelde \`pnpm infra:up\`, CI'da \`services: postgres\` ayakta olmalı.`,
    )
  }
  if (names.length > 1) {
    throw new Error(
      `e2e fixture: host portu ${POSTGRES_HOST_PORT}'u BİRDEN FAZLA konteyner yayınlıyor (${names.join(', ')}) — belirsiz hedef, fail-closed kapı tetiklendi.`,
    )
  }
  const resolved = names[0]
  if (resolved === undefined) {
    throw new Error('e2e fixture: beklenmeyen durum — tek eşleşme bulundu ama ad okunamadı.')
  }
  cachedContainerName = resolved
  return resolved
}

export interface TenantFixture {
  readonly id: string
  readonly slug: string
  readonly name: string
}

/** AC7 fixture'ının ek alanı — özel alan adı, çağıranın `page.goto`/`request.get` için kullanacağı host. */
export interface CustomDomainTenantFixture extends TenantFixture {
  readonly primaryDomain: string
}

function runSql(sql: string): void {
  const containerName = resolvePostgresContainerName()
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
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (error) {
    throw new Error(
      [
        `e2e fixture: "${containerName}" Docker konteynerinde SQL çalıştırılamadı.`,
        "Ön koşul: yerelde `pnpm infra:up`, CI'da `services: postgres` ayakta olmalı.",
        `Denenen komut: docker exec ${containerName} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "${sql}"`,
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
      { cause: error },
    )
  }
}

/** Her çağrıda tekil, çarpışmayan bir id/slug çifti üretir (paralel koşum YOK — `workers: 1` — ama tekrarlı koşumlar arasında tekillik gerekir). */
function uniqueSuffix(label: string): string {
  return `${label}-${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * AC6: önceden var olmuş, SONRADAN soft-delete edilmiş bir kiracı —
 * `deleted_at` ekleme ANINDA set edilir (seed'de böyle bir satır yok, bu
 * yüzden testin kendisi üretir). Temizlik çağıranın sorumluluğundadır
 * (`deleteTenantFixture`, genellikle `test.afterAll`'da).
 */
export function createSoftDeletedTenantFixture(): TenantFixture {
  const fixture: TenantFixture = {
    id: uniqueSuffix('e2e-soft-deleted'),
    slug: uniqueSuffix('e2e-soft-deleted'),
    name: 'E2E Soft Delete Kurgusu',
  }

  runSql(
    `INSERT INTO tenant (id, slug, name, status, deleted_at) VALUES ('${fixture.id}', '${fixture.slug}', '${fixture.name}', 'active', now());`,
  )

  return fixture
}

/**
 * AC7: özel alan adı dalını (`resolveHost`'un `custom-domain` kolu) tetikleyen,
 * `primaryDomain` taşıyan bir kiracı. Alan adının kendisi `.localhost` TLD'si
 * (RFC 6761 — A-M7, bu dosyanın çağıranı `playwright.config.ts`'in dosya başı
 * notuyla AYNI ÖLÇÜM) altında, AMA `.arkesoft.localhost` SONEKİYLE BİTMEYECEK
 * şekilde üretilir — `resolveHost` bu yüzden bunu `subdomain` DEĞİL
 * `custom-domain` dalına düşürür, ve tarayıcı/`request` istemcisi host'u
 * `/etc/hosts` GEREKMEDEN 127.0.0.1'e çözer (A-M7).
 */
export function createCustomDomainTenantFixture(): CustomDomainTenantFixture {
  const suffix = uniqueSuffix('e2e-custom-domain')
  const fixture: CustomDomainTenantFixture = {
    id: suffix,
    slug: suffix,
    name: 'E2E Özel Alan Adı Kurgusu',
    primaryDomain: `${suffix}.localhost`,
  }

  runSql(
    `INSERT INTO tenant (id, slug, name, status, primary_domain) VALUES ('${fixture.id}', '${fixture.slug}', '${fixture.name}', 'active', '${fixture.primaryDomain}');`,
  )

  return fixture
}

/** Her iki fixture türü için de TEK temizlik yolu — `id` tekil anahtar olduğu için tek satır siler. */
export function deleteTenantFixture(fixture: TenantFixture): void {
  runSql(`DELETE FROM tenant WHERE id = '${fixture.id}';`)
}

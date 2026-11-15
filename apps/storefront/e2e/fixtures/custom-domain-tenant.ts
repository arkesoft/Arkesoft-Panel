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
//
// ⚠⚠⚠ GATE DÜZELTME (devops, T-020 gate fix turu 1, 2026-11-15 —
// `solid`+`security` tur 1'in BAĞIMSIZ buluştuğu `high` bulgu, S-1/İŞ ①):
// ADR-0022 Karar 1 DÖRT korumayı ZORUNLU kılıyor; bu dosyada (a) fail-closed
// loopback allowlist VE (b) `NODE_ENV`/test-ortamı kapısı EKSİKTİ (kardeş
// dosya `apps/admin/e2e/fixtures/tenant-cleanup.ts` ikisini de taşıyordu).
// SÖMÜRÜ SENARYOSU (security ölçtü): `DOCKER_HOST=tcp://10.0.0.5:2375`
// ile çalışan bir geliştirici/koşucu `pnpm --filter @arkesoft/storefront
// test:e2e` koşturursa `docker ps`/`docker exec` UZAKTAKİ bir daemon'da
// çözülür — yerel kapı OLMADIĞI için hiçbir şey durdurmaz; sonuç UZAK bir
// veritabanında tablo-sahibi rolüyle (RLS BAYPAS) `INSERT`/`DELETE FROM
// tenant` çalıştırmak olur. Düzeltme: admin'in `assertDockerHostIsLoopback`
// + `assertTestEnvironment` çifti BİREBİR buraya taşındı (emsal
// `apps/api/src/__tests__/helpers/create-test-app.ts:380-408`'in
// `REDIS_URL` hostname denetimiyle AYNI desen) ve her iki fonksiyon
// `resolvePostgresContainerName`/`runSql`'in BAŞINDA (admin'deki çağrı
// noktalarıyla AYNI yerlerde) çağrılıyor. `NODE_ENV`'i BU dosya AYARLAMAZ,
// yalnızca OKUR — tek yazıcı `apps/storefront/playwright.config.ts`
// (`NODE_ENV ??= 'test'`, admin'in `playwright.config.ts:53` emsali).
// (c)'nin biçim kapısı da GÜÇLENDİRİLDİ — aşağıya, `E2E_FIXTURE_ID_PATTERN`.
//
// ⚠⚠ GATE DÜZELTME (devops, T-020 gate fix turu 2, 2026-11-15 — S-9/S-10,
// İŞ ③): yukarıdaki (a) kapısı tur 1'de YALNIZCA `DOCKER_HOST` ortam
// değişkenini okuyordu; `docker context use <uzak>` (DOCKER_HOST
// tanımsız) ile kapı baypas EDİLEBİLİYORDU ve `DOCKER_HOST=unix:///…`
// (colima/podman) MEŞRU bir yerel soketi REDDEDİYORDU. `assertDockerHostIsLoopback`
// artık `DOCKER_HOST`'u DOĞRUDAN OKUMUYOR — ayrıntı fonksiyonun KENDİ
// docblock'unda.
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
 * Koruma (a) allowlist'i — `apps/admin/e2e/fixtures/tenant-cleanup.ts:166-170`
 * ve `apps/api/src/__tests__/helpers/create-test-app.ts:380-384` ile
 * BİREBİR AYNI küme (emsal).
 */
const DOCKER_HOST_ALLOWED_HOSTNAMES: ReadonlySet<string> = new Set([
  '127.0.0.1',
  '::1',
  'localhost',
])

/**
 * E2E fixture tenant id/slug biçimi — `uniqueSuffix()`'in ürettiği
 * `<önek>-<13+ haneli zaman damgası>-<rastgele alfasayısal kuyruk>` kalıbı
 * (`uniqueSuffix('e2e-soft-deleted')` → `e2e-soft-deleted-1731712345678-
 * ab12cd`). `apps/admin/e2e/fixtures/tenant-cleanup.ts`'in
 * `E2E_FIXTURE_TENANT_SLUG_PATTERN`'ı ile AYNI disiplin (zaman damgalı
 * segment ZORUNLU) — ama storefront'un kuyruk segmentini (zaman
 * damgasından SONRAKİ rastgele parça) de HESABA katacak şekilde
 * genişletilmiş. Koruma (c)'nin biçim kapısı — GATE DÜZELTME notu.
 */
const E2E_FIXTURE_ID_PATTERN = /^e2e-[a-z0-9-]+-\d{10,}-[a-z0-9]{1,10}$/

/**
 * Koruma (b) — bu dosya `NODE_ENV`'i AYARLAMAZ, yalnızca OKUR. Tek yazıcı
 * `playwright.config.ts` (`NODE_ENV ??= 'test'`) — admin ikizinin AYNI
 * disiplini.
 */
function assertTestEnvironment(): void {
  const nodeEnv = process.env['NODE_ENV']
  if (nodeEnv !== 'test') {
    throw new Error(
      `e2e fixture yalnızca NODE_ENV=test ortamında koşabilir — fail-closed kapı tetiklendi (ölçülen process.env.NODE_ENV: ${String(nodeEnv)}). playwright.config.ts bu değeri ayarlamalı.`,
    )
  }
}

/**
 * ⚠⚠ GATE DÜZELTME (S-9/S-10, İŞ ③, devops, T-020 gate fix turu 2,
 * 2026-11-15): BU KAPI ESKİDEN YALNIZCA `DOCKER_HOST` ortam değişkenini
 * okuyordu — `security` tur 2 ÖLÇTÜ: `DOCKER_HOST` TANIMSIZKEN docker
 * CLI'ın efektif daemon'u `docker context use <uzak>` ile AYARLANMIŞ bir
 * CONTEXT'ten gelebilir ve bu kapı o durumda erken `return` edip
 * ("yerel soket ⇒ güvenli") UZAK bir daemon'a karşı `docker exec`
 * çalıştırılmasına İZİN verirdi (S-9, `medium`). Ek olarak
 * `DOCKER_HOST=unix:///…` (colima/podman/Docker Desktop) MEŞRU bir yerel
 * soketi `new URL(...).hostname === ''` olduğu için REDDEDİYORDU (S-10,
 * `low`). Düzeltme: artık `DOCKER_HOST` ortam değişkenini DOĞRUDAN
 * OKUMUYOR — `resolveEffectiveDockerEndpoint()` ile docker'ın KENDİSİNDEN
 * efektif uç noktayı soruyor (`docker context inspect --format
 * '{{.Endpoints.docker.Host}}'`); bu komut `DOCKER_HOST` override'ını DA
 * yansıtıyor (bu makinede ÖLÇÜLDÜ: override'lı bir alt kabukta komut
 * override'ı basıyor, gerçek aktif context DEĞİŞMİYOR) — tek sorgu hem
 * context hem env eksenini kapsıyor. `unix://`/`npipe://` şemaları
 * (yerel soket/named pipe, hostname TAŞIMAZ) KOŞULSUZ güvenli; diğer
 * şemalar (`tcp://`/`ssh://` dahil) hostname allowlist'iyle (aşağıdaki
 * SET, DEĞİŞMEDİ) denetleniyor — bu aynı zamanda S-10'u da kapatıyor
 * (artık `unix://` hostname'e bakmadan kabul ediliyor).
 * `apps/admin/e2e/fixtures/tenant-cleanup.ts`'in `assertDockerHostIsLoopback`'i
 * ile BİREBİR AYNI gövde (po'nun "iki kopya, ortak modül değil" kararı —
 * ADR-0022 K1 — geçerli; `pnpm guards`'ın ADR-0022 K1(d) alt kontrol 3'ü
 * artık bu eşitliği MEKANİK olarak zorluyor).
 */
function assertDockerHostIsLoopback(): void {
  const endpoint = resolveEffectiveDockerEndpoint()
  let endpointUrl: URL
  try {
    endpointUrl = new URL(endpoint)
  } catch (error) {
    throw new Error(
      `e2e fixture: docker'ın efektif daemon uç noktası ayrıştırılamadı — fail-closed kapı tetiklendi (uç nokta: ${endpoint})`,
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
      `e2e fixture yalnızca loopback docker daemon'a (unix://, npipe:// veya 127.0.0.1/::1/localhost üzerinden tcp://,ssh://) karşı koşabilir — fail-closed kapı tetiklendi (çözülen uç nokta: ${endpoint})`,
    )
  }
}

/**
 * Docker CLI'ın GERÇEKTEN bağlanacağı daemon uç noktasını döner —
 * `DOCKER_HOST` ortam değişkeni TANIMLIYSA onu, DEĞİLSE aktif context'in
 * uç noktasını (bu ikisi docker CLI'ın KENDİ önceliğiyle AYNI sıra).
 * Komut başarısızsa veya boş dönerse fail-closed fırlatır (sessiz "yerel
 * ⇒ güvenli" varsayımı YOK — S-9'un tam tersi).
 */
function resolveEffectiveDockerEndpoint(): string {
  let output: Buffer
  try {
    output = execFileSync(
      'docker',
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (error) {
    throw new Error(
      'e2e fixture: docker\'ın efektif daemon uç noktası okunamadı ("docker context inspect" başarısız oldu) — fail-closed kapı tetiklendi.',
      { cause: error },
    )
  }
  const endpoint = output.toString('utf8').trim()
  if (endpoint === '') {
    throw new Error(
      "e2e fixture: docker context'in efektif daemon uç noktası boş döndü — fail-closed kapı tetiklendi.",
    )
  }
  return endpoint
}

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
  assertTestEnvironment()
  assertDockerHostIsLoopback()
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
  assertTestEnvironment()
  assertDockerHostIsLoopback()
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

/**
 * Her iki fixture türü için de TEK temizlik yolu — `id` tekil anahtar
 * olduğu için tek satır siler. GATE DÜZELTME (koruma (c)'nin biçim kapısı):
 * `fixture.id` `E2E_FIXTURE_ID_PATTERN`'a UYMUYORSA fırlatır — çıplak
 * `DELETE FROM tenant` YASAK (`apps/admin/e2e/fixtures/tenant-cleanup.ts`'in
 * `deleteFixtureTenantBySlug`/`deleteFixtureUserByEmail`'i ile AYNI
 * disiplin). Bu dosyanın `id`'si HER ZAMAN `uniqueSuffix()`'in kendi
 * ürettiği değer olduğu için pratikte bu kapı tetiklenmez — ama "çağıranın
 * verdiği id'ye güven" yerine "biçimi doğrula" ikinci bir savunma katmanı
 * sağlar (tek nokta arızası yok, admin ikizinin emsali).
 */
export function deleteTenantFixture(fixture: TenantFixture): void {
  if (!E2E_FIXTURE_ID_PATTERN.test(fixture.id)) {
    throw new Error(
      `e2e fixture: "${fixture.id}" e2e fixture id biçimine uymuyor — fail-closed kapı tetiklendi (çıplak silme reddedildi)`,
    )
  }
  runSql(`DELETE FROM tenant WHERE id = '${fixture.id}';`)
}

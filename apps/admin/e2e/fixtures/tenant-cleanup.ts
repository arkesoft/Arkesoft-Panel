// @arkesoft/admin — e2e veri fabrikası temizliği: tenant + app_user (+ onun
// CASCADE ile giden tenant_membership/session/account/two_factor satırları)
// (ROADMAP v0.0.19, T-020/S5, ADR-0022 Karar 1 — K1, dört zorunlu koruma).
//
// NEDEN BU DOSYA VAR (architect D-1, bağlayıcı): `registration-flow.spec.ts`
// HER koşumda bir `tenant` + `app_user` + `tenant_membership` SIZDIRIYOR
// (eskiden `afterAll` yoktu, yalnızca `context.close()` vardı); `panel-flow.
// spec.ts` ve `session-security-dialog-focus.qa.spec.ts` da kendi fixture
// kullanıcılarını SIZDIRIYORDU. Bu dosya üçünün de teardown'ını taşır.
//
// İKİ KOPYA, ORTAK MODÜL DEĞİL (po kararı, bağlayıcı, ADR-0022 K1):
// `apps/storefront/e2e/fixtures/custom-domain-tenant.ts` BİREBİR AYNI
// `node:child_process` → `docker exec arkesoft-postgres psql` desenini
// kullanır (Prisma/`@arkesoft/db` YOK — K2'nin "ikinci test-only bağlantı
// profili AÇILMAYACAK" kararını BOZMAZ, `apps/admin`'in `package.json`'ında
// `@arkesoft/db` bağımlılığı/devDependency'si zaten YOK, pnpm sembolik bağı
// onu hiç ÜRETMEZ). Ortak paket YOK çünkü (i) ADR-0022 K1 fixture'ların
// `apps/<app>/e2e/fixtures/**` altında yaşayacağını BİREBİR yazıyor, (ii)
// `scripts/playwright/base.ts`'i meşru kılan şey onun ARAÇ YAPILANDIRMASI
// olması — bir `e2e/*.spec.ts`'in `scripts/`'ten import etmesi uygulama test
// kodunu paket DIŞI bir yola bağlar (architect'in `packages/config` + relatif
// import adayını elediği AYNI gerekçe).
//
// TABLO ADLARI (packages/db/prisma/schema.prisma, DOKUNULMADI, OKUNDU):
// kiracı → `tenant` (kolon `slug`), kullanıcı → `app_user` (R3 — model adı
// `User`, tablo adı `app_user`, kolon `email`). `TenantMembership.tenant` VE
// `TenantMembership.user` İKİSİ DE `onDelete: Cascade` (`schema.prisma:414,
// 428`) — `tenant` veya `app_user` satırını silmek `tenant_membership`'i
// YETİM BIRAKMAZ. `Session`/`Account`/`TwoFactor` da `onDelete: Cascade`
// (`schema.prisma:266,299,394`) — `app_user` silinince hepsi gider. Bu
// yüzden çağıran sırasıyla ÖNCE `deleteFixtureTenantBySlug` (varsa) SONRA
// `deleteFixtureUserByEmail` çağırır — ikisi de SIFIR satır eşleşirse
// (zaten silinmiş/hiç oluşmamışsa) sessizce no-op'tur (idempotent).
//
// DÖRT ZORUNLU KORUMA (bugün (a) ve (b) YOK, bu alt görevin eklemesi):
// (a) FAIL-CLOSED loopback allowlist — `docker exec`, `DOCKER_HOST` bir TCP
//     soketine işaret ediyorsa UZAK bir docker daemon'una bağlanabilir
//     (yerel `arkesoft-postgres` adı o zaman UZAKTAKİ bir konteynere
//     karşılık gelebilir). Emsal `apps/api/src/__tests__/helpers/
//     create-test-app.ts:380-408`'in `REDIS_URL` hostname denetimiyle
//     BİREBİR AYNI desen — tek fark, orada doğrulanan URL `REDIS_URL`
//     iken burada `DOCKER_HOST` (bu paketin TEK dış-host yapılandırma
//     yüzeyi `docker exec`'in kendisi, `POSTGRES_USER`/`POSTGRES_DB` bir
//     HOST taşımaz, YALNIZCA kimlik/veritabanı adı — `storefront` emsaliyle
//     BİREBİR).
// (b) Test-ortamı kapısı — emsalin `NODE_ENV==='test'` denetimi BİREBİR
//     KOPYALANMADI (ÖLÇÜLDÜ: `playwright test` NODE_ENV'i KENDİSİ
//     ayarlamaz — `node -e "console.log(process.env.NODE_ENV)"` →
//     `undefined`; emsal Vitest'in KENDİLİĞİNDEN `NODE_ENV=test` ayarladığı
//     bir bağlamda yazıldı). Bunun yerine `playwright.config.ts`
//     `NODE_ENV`'i `??='test'` ile SABİTLİYOR (webServer'ın vite çocuğu
//     AYRICA `env NODE_ENV=development` ile korunuyor, dosya başı notuna
//     bkz.) — bu dosya o sabitlenmiş değeri okur, KENDİSİ ayarlamaz (tek
//     yazıcı `playwright.config.ts`, çelişen iki kapı olmasın).
// (c) Kapsamlı silme — ÇIPLAK `DELETE FROM tenant`/`DELETE FROM "app_user"`
//     YASAK. Her silme KENDİ fail-closed biçim denetiminden geçmek zorunda
//     (aşağıdaki iki regex). Seed'in `demo-yonetici@arkesoft.test` kullanıcısı
//     BU BİÇİME UYMAZ (ÖLÇÜLDÜ: `panel-flow.spec.ts:160` bu e-postayı
//     SEED'İN sabit kullanıcısı olarak anıyor — sabit bir ad, zaman damgası
//     YOK) ⇒ `@arkesoft.test` domain'i TEK BAŞINA yetersiz bir sınır olurdu
//     (seed verisiyle ÇAKIŞIRDI), bu yüzden biçim denetimi zaman damgası
//     segmentini de ZORUNLU kılıyor. Tenant slug biçimi
//     `store-wizard-controller.ts:136`'nın `normalizeTenantSlug` çıktısıdır
//     (OKUNDU, UYDURULMADI — `packages/tenancy/src/slug.ts:102-112`): testler
//     mağaza adını BİLEREK `E2E Mağaza ${Date.now()}` ile giriyor, normalize
//     edilince `e2e-magaza-<13 haneli zaman damgası>` olur.
// (d) Bu dosyanın `docker exec`+`psql` kullanımı `scripts/guards.sh`'in
//     (S7'nin işi) ADR K1(d) taramasının GÖRÜŞ ALANINDA — `apps/admin/src/
//     **`'e tek bir `psql`/`docker exec` satırı sızarsa o tarama KIRMIZI
//     verir.
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
// sabit-isim varsayımıydı. Düzeltme: konteyner adı artık host'ta
// YAYINLANAN (published) porttan `docker ps --filter publish=<port>` ile
// DİNAMİK çözülüyor (aşağıda `resolvePostgresContainerName`) — TEK
// mekanizma hem yerelde (compose'un `arkesoft-postgres`'i, port
// `${POSTGRES_PORT:-5432}:5432`) hem CI'da (`services:` bloğunun otomatik
// adı, `5432:5432`) aynı şekilde çalışıyor; `docker exec … psql` YAZMA
// YOLU DEĞİŞMEDİ (ADR Karar 1'e UYGUN). Dört koruma ((a)-(d)) ETKİLENMEDİ;
// (d)'nin allowlist'i (`scripts/guards.sh`, `check_adr22_k1d_shellout_
// boundary`) bu dosyada hâlâ BİREBİR AYNI "docker exec"/"psql" jetonlarını
// görüyor — tarama GÜNCELLEME GEREKTİRMİYOR (ölçüldü, S9a raporunda).
//
// ⚠⚠ GATE DÜZELTME (devops, T-020 gate fix turu 2, 2026-11-15 — S-9/S-10,
// İŞ ③): koruma (a) (`assertDockerHostIsLoopback`) tur 1'de YALNIZCA
// `DOCKER_HOST` ortam değişkenini okuyordu; `docker context use <uzak>`
// (DOCKER_HOST tanımsız) ile kapı baypas EDİLEBİLİYORDU ve
// `DOCKER_HOST=unix:///…` (colima/podman) MEŞRU bir yerel soketi
// REDDEDİYORDU. `assertDockerHostIsLoopback` artık `DOCKER_HOST`'u
// DOĞRUDAN OKUMUYOR — ayrıntı fonksiyonun KENDİ docblock'unda
// (`apps/storefront/e2e/fixtures/custom-domain-tenant.ts`'in BİREBİR
// AYNI gövdesiyle — po'nun "iki kopya, ortak modül değil" kararı).
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
        `tenant-cleanup: host portu ${POSTGRES_HOST_PORT}'u yayınlayan konteyner listelenemedi ("docker ps" başarısız oldu).`,
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
      `tenant-cleanup: host portu ${POSTGRES_HOST_PORT}'u yayınlayan hiçbir Docker konteyneri bulunamadı — fail-closed kapı tetiklendi. Ön koşul: yerelde \`pnpm infra:up\`, CI'da \`services: postgres\` ayakta olmalı.`,
    )
  }
  if (names.length > 1) {
    throw new Error(
      `tenant-cleanup: host portu ${POSTGRES_HOST_PORT}'u BİRDEN FAZLA konteyner yayınlıyor (${names.join(', ')}) — belirsiz hedef, fail-closed kapı tetiklendi.`,
    )
  }
  const resolved = names[0]
  if (resolved === undefined) {
    throw new Error('tenant-cleanup: beklenmeyen durum — tek eşleşme bulundu ama ad okunamadı.')
  }
  cachedContainerName = resolved
  return resolved
}

/** `create-test-app.ts:380-384` ile BİREBİR aynı allowlist — emsal. */
const DOCKER_HOST_ALLOWED_HOSTNAMES: ReadonlySet<string> = new Set([
  '127.0.0.1',
  '::1',
  'localhost',
])

/**
 * E2E fixture kullanıcılarının e-posta biçimi — `<önek>-<13+ haneli zaman
 * damgası>-<rastgele alfasayısal kuyruk>@arkesoft.test`. Dört gerçek üretici
 * BU BİÇİME uyuyor (`verified-fixture-user.ts:118`, `panel-flow.spec.ts:121`,
 * `session-security-dialog-focus.qa.spec.ts:148` — üçü de `Date.now()` +
 * `Math.random().toString(36).slice(2,10)` kullanıyor), seed'in sabit
 * `demo-yonetici@arkesoft.test`'i UYMUYOR (zaman damgası segmenti YOK).
 */
const E2E_FIXTURE_EMAIL_PATTERN = /^[a-z0-9-]+-\d{10,}-[a-z0-9]{1,10}@arkesoft\.test$/

/**
 * E2E fixture tenant slug biçimi — `e2e-` önek + zaman damgalı segment
 * ZORUNLU (`normalizeTenantSlug('E2E Mağaza 1731712345678')` →
 * `e2e-magaza-1731712345678`, OKUNDU — `packages/tenancy/src/slug.ts`).
 */
const E2E_FIXTURE_TENANT_SLUG_PATTERN = /^e2e-[a-z0-9-]*\d{10,}$/

/** Koruma (b) — dosya başı notu: BU dosya `NODE_ENV`'i AYARLAMAZ, yalnızca okur. */
function assertTestEnvironment(): void {
  const nodeEnv = process.env['NODE_ENV']
  if (nodeEnv !== 'test') {
    throw new Error(
      `tenant-cleanup yalnızca NODE_ENV=test ortamında koşabilir — fail-closed kapı tetiklendi (ölçülen process.env.NODE_ENV: ${String(nodeEnv)}). playwright.config.ts bu değeri ayarlamalı.`,
    )
  }
}

/**
 * Koruma (a) — dosya başı notu (GATE DÜZELTME, S-9/S-10, İŞ ③). Gövde
 * `apps/storefront/e2e/fixtures/custom-domain-tenant.ts`'in
 * `assertDockerHostIsLoopback`'i ile BİREBİR AYNI.
 */
function assertDockerHostIsLoopback(): void {
  const endpoint = resolveEffectiveDockerEndpoint()
  let endpointUrl: URL
  try {
    endpointUrl = new URL(endpoint)
  } catch (error) {
    throw new Error(
      `tenant-cleanup: docker'ın efektif daemon uç noktası ayrıştırılamadı — fail-closed kapı tetiklendi (uç nokta: ${endpoint})`,
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
      `tenant-cleanup yalnızca loopback docker daemon'a (unix://, npipe:// veya 127.0.0.1/::1/localhost üzerinden tcp://,ssh://) karşı koşabilir — fail-closed kapı tetiklendi (çözülen uç nokta: ${endpoint})`,
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
      'tenant-cleanup: docker\'ın efektif daemon uç noktası okunamadı ("docker context inspect" başarısız oldu) — fail-closed kapı tetiklendi.',
      { cause: error },
    )
  }
  const endpoint = output.toString('utf8').trim()
  if (endpoint === '') {
    throw new Error(
      "tenant-cleanup: docker context'in efektif daemon uç noktası boş döndü — fail-closed kapı tetiklendi.",
    )
  }
  return endpoint
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
      // `maxBuffer` AÇIKÇA büyütüldü (varsayılan 1MB) — ÖLÇÜLMÜŞ `ENOBUFS`
      // arızasının (dosya başı `sweepOrphanedE2eFixtures` notu) İKİNCİ
      // savunma katmanı; SQL-seviyesi regex zaten adayı DAR tutuyor, bu
      // yalnızca savunma amaçlı bir tavan.
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 },
    )
  } catch (error) {
    throw new Error(
      [
        `e2e temizliği: "${containerName}" Docker konteynerinde SQL çalıştırılamadı.`,
        "Ön koşul: yerelde `pnpm infra:up`, CI'da `services: postgres` ayakta olmalı.",
        `Denenen komut: docker exec ${containerName} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "${sql}"`,
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
      { cause: error },
    )
  }
}

/**
 * `-tAc` (tuples-only, unaligned): her satır TEK sütun, satır sonlarıyla
 * ayrılmış ham metin döner — `globalTeardown`'ın süpürmesi (aşağıda) bunu
 * biçim denetiminden GEÇEN satırları seçmek için kullanır.
 */
function querySqlRows(sql: string): readonly string[] {
  assertTestEnvironment()
  assertDockerHostIsLoopback()
  const containerName = resolvePostgresContainerName()
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
      // `maxBuffer` AÇIKÇA büyütüldü (varsayılan 1MB) — ÖLÇÜLMÜŞ `ENOBUFS`
      // arızasının (dosya başı `sweepOrphanedE2eFixtures` notu) İKİNCİ
      // savunma katmanı; SQL-seviyesi regex zaten adayı DAR tutuyor, bu
      // yalnızca savunma amaçlı bir tavan.
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 },
    )
  } catch (error) {
    throw new Error(
      [
        `e2e süpürmesi: "${containerName}" Docker konteynerinde SQL çalıştırılamadı.`,
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

/**
 * Bir e2e fixture kullanıcısını (ve `app_user`'a CASCADE ile bağlı
 * `session`/`account`/`two_factor`/`tenant_membership` satırlarını)
 * e-postasıyla siler. Biçim UYMUYORSA fırlatır — ÇIPLAK silme YOK (dosya
 * başı (c)). Eşleşen satır YOKSA (zaten silinmiş) sessizce no-op.
 */
export function deleteFixtureUserByEmail(email: string): void {
  if (!E2E_FIXTURE_EMAIL_PATTERN.test(email)) {
    throw new Error(
      `tenant-cleanup: "${email}" e2e fixture e-posta biçimine uymuyor — fail-closed kapı tetiklendi (çıplak silme reddedildi)`,
    )
  }
  runSql(`DELETE FROM app_user WHERE email = '${email}';`)
}

/**
 * Bir e2e fixture kiracısını slug'ıyla siler — `tenant_membership` satırı
 * `tenant_id` FK'sinin `ON DELETE CASCADE`'iyle (packages/db şeması,
 * DOKUNULMADI) birlikte gider; `app_user` satırına bu fonksiyon DOKUNMAZ
 * (çağıran `deleteFixtureUserByEmail`'i AYRICA çağırmalı). Biçim UYMUYORSA
 * fırlatır — ÇIPLAK silme YOK (dosya başı (c)). Eşleşen satır YOKSA
 * (zaten silinmiş/hiç oluşturulamamış) sessizce no-op.
 */
export function deleteFixtureTenantBySlug(slug: string): void {
  if (!E2E_FIXTURE_TENANT_SLUG_PATTERN.test(slug)) {
    throw new Error(
      `tenant-cleanup: "${slug}" e2e fixture tenant slug biçimine uymuyor — fail-closed kapı tetiklendi (çıplak silme reddedildi)`,
    )
  }
  runSql(`DELETE FROM tenant WHERE slug = '${slug}';`)
}

/**
 * ⚠ İDEMPOTENT ÖNEK SÜPÜRMESİ (`globalTeardown`'ın TEK çağıranı, bkz.
 * `../global-teardown.ts`). Tek testin kendi `afterAll`'ı bir çökme/timeout
 * yüzünden ÇALIŞMAZSA bırakılan satırları temizler. `LIKE` yalnızca
 * ADAY satırları Postgres'ten ÇEKMEK için kullanılır (geniş tarama) —
 * GERÇEK silme kararı (c)'nin AYNI katı regex'inden geçen satırlar İÇİN
 * verilir (seed verisi `LIKE` ile ADAY olabilir ama regex'i GEÇEMEZ, bkz.
 * dosya başı (c)). Hiç aday yoksa (önceki koşumun kendi `afterAll`'ları
 * başarıyla temizlediği durum — NORMAL YOL) iki döngü de SIFIR kez döner ⇒
 * idempotent.
 */
export function sweepOrphanedE2eFixtures(): void {
  // ⚠ ÖLÇÜLMÜŞ DÜZELTME (T-020/S5, gerçek altyapıda bulundu): bu sorgu
  // ESKİDEN gevşek bir `LIKE` kullanıyordu (yalnızca Postgres'ten ADAY
  // ÇEKMEK için) — bu depoda `@arkesoft.test` domaini `apps/api`'nin KENDİ
  // Vitest fixture'ları TARAFINDAN DA kullanıldığından (ÖLÇÜLDÜ: 56785
  // satır), gevşek sorgu TEK SEFERDE >1MB metin döndürdü ve `execFileSync`
  // VARSAYILAN `maxBuffer`'ı (1MB) AŞTI → `ENOBUFS`. Sorgu BURADA JS
  // regex'iyle BİREBİR aynı POSIX düzenli ifadeye (`~`) SIKILAŞTIRILDI —
  // Postgres'in KENDİSİ dar adayı (ÖLÇÜLDÜ: 471/56785) döner, JS regex'i
  // AYNI katılıkta İKİNCİ bir savunma katmanı olarak KALIR (dosya başı (c),
  // tek nokta ARIZASI yok).
  const candidateSlugs = querySqlRows(
    `SELECT slug FROM tenant WHERE slug ~ '^e2e-[a-z0-9-]*[0-9]{10,}$';`,
  )
  for (const slug of candidateSlugs) {
    if (E2E_FIXTURE_TENANT_SLUG_PATTERN.test(slug)) {
      deleteFixtureTenantBySlug(slug)
    }
  }

  const candidateEmails = querySqlRows(
    `SELECT email FROM app_user WHERE email ~ '^[a-z0-9-]+-[0-9]{10,}-[a-z0-9]{1,10}@arkesoft\\.test$';`,
  )
  for (const email of candidateEmails) {
    if (E2E_FIXTURE_EMAIL_PATTERN.test(email)) {
      deleteFixtureUserByEmail(email)
    }
  }
}

// @arkesoft/storefront — e2e DB fixture'ları: soft-delete (AC6) ve özel alan
// adı (AC7) senaryoları (ROADMAP v0.0.8, T-009/S9, qa — ÜRETİM ROLÜNDE;
// v0.0.20, T-021/S9, ADR-0022 Karar 1 — ⭐ GÜNCELLEME — alt süreç
// yardımcısının gövdesi `scripts/playwright/sql.ts`'e TAŞINDI).
//
// NEDEN `@arkesoft/db` İTHAL EDİLMİYOR (AC10'un mimari sınırı, bağlayıcı):
// `apps/storefront/src/**` veritabanına DOĞRUDAN dokunmaz — bu hem
// `eslint.config.mjs`'in `dbRestriction` kuralıyla hem de YAPISAL olarak
// (`@arkesoft/db` bu paketin `package.json`'ında dependency/devDependency
// DEĞİL; pnpm'in sembolik bağlantı çözümlemesi `apps/storefront/node_modules/
// @arkesoft/db`'yi hiç ÜRETMEZ) zorlanıyor. Bu dosya `apps/storefront/
// package.json`'a DOKUNMADAN AYNI sınırı korur: `@arkesoft/db`'yi hiç ithal
// ETMEZ.
//
// AC6/AC7'nin gerektirdiği iki ek tenant satırı (soft-delete edilmiş / özel
// alan adlı) seed'de YOK ve bu sürümde (v0.1.0'a kadar) bir tenant oluşturma/
// silme tRPC uç noktası da YOK — bu yüzden bu dosya `pnpm infra:up`'ın
// başlattığı, ÇALIŞAN Postgres konteynerine bir alt süreç ile DOĞRUDAN SQL
// yazar/siler (gövde `scripts/playwright/sql.ts`'te — AŞAĞIDAKİ import).
// Bu, hem AC10'un mimari sınırını (storefront KODU asla DB'ye dokunmaz —
// burada dokunan storefront'un KODU DEĞİL, bu e2e YARDIMCISININ çalışma
// zamanı kabuk komutu) hem "AC7: seed DEĞİŞMEZ" şartını (hiçbir repo dosyası
// yazılmıyor — `git diff --stat -- packages/db` bu yüzden BOŞ kalır,
// yalnızca ÇALIŞAN konteynerin verisi değişir) ihlal etmeden iki fixture
// satırını üretir/temizler.
//
// ⭐ GÜNCELLEME (devops, T-021/S9, 2026-11-15 — ADR-0022 Karar 1'in UYGULAMA
// birleştirmesi): `runSql`'in gövdesi + dört korumanın ((a)-(d)) gövdeleri
// + `resolvePostgresContainerName`/`resolveEffectiveDockerEndpoint`/
// `DOCKER_HOST_ALLOWED_HOSTNAMES` artık `apps/admin/e2e/fixtures/
// tenant-cleanup.ts`'in İKİZİ DEĞİL — TEK paylaşılan modülde
// (`scripts/playwright/sql.ts`); gerekçe o modülün dosya başı yorumunda ve
// ADR-0022'nin güncelleme bloğunda. Bu dosyada KALAN: kendi `e2e-` önek
// deseni (`E2E_FIXTURE_ID_PATTERN`), kendi tablo/temizlik mantığı
// (`createSoftDeletedTenantFixture`/`createCustomDomainTenantFixture`/
// `deleteTenantFixture`) ve `runSql`'e geçirilen kendi hata metni öneki
// (`'e2e fixture'` — taşınmadan ÖNCEki metinle BİREBİR aynı).
// `scripts/guards.sh`'in ADR-0022 K1(d) taraması artık bu dosyanın
// kabuk-çağrısı jetonu TAŞIMADIĞINI (mekanizma de düzyazı da) ve paylaşılan
// modülün TEK beklenen hedef olduğunu doğruluyor.
import { runSql } from '../../../../scripts/playwright/sql.js'

/** E2E fixture tenant id/slug biçimi — `uniqueSuffix()`'in ürettiği
 * `<önek>-<13+ haneli zaman damgası>-<rastgele alfasayısal kuyruk>` kalıbı
 * (`uniqueSuffix('e2e-soft-deleted')` → `e2e-soft-deleted-1731712345678-
 * ab12cd`). `apps/admin/e2e/fixtures/tenant-cleanup.ts`'in
 * `E2E_FIXTURE_TENANT_SLUG_PATTERN`'ı ile AYNI disiplin (zaman damgalı
 * segment ZORUNLU) — ama storefront'un kuyruk segmentini (zaman
 * damgasından SONRAKİ rastgele parça) de HESABA katacak şekilde
 * genişletilmiş.
 */
const E2E_FIXTURE_ID_PATTERN = /^e2e-[a-z0-9-]+-\d{10,}-[a-z0-9]{1,10}$/

/** Bu fabrikanın `runSql`'e geçirdiği hata metni öneki — taşınmadan ÖNCEki
 * metinle BİREBİR aynı ("e2e fixture: ..."). */
const SQL_ERROR_LABEL = 'e2e fixture'

export interface TenantFixture {
  readonly id: string
  readonly slug: string
  readonly name: string
}

/** AC7 fixture'ının ek alanı — özel alan adı, çağıranın `page.goto`/`request.get` için kullanacağı host. */
export interface CustomDomainTenantFixture extends TenantFixture {
  readonly primaryDomain: string
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
    SQL_ERROR_LABEL,
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
    SQL_ERROR_LABEL,
  )

  return fixture
}

/**
 * Her iki fixture türü için de TEK temizlik yolu — `id` tekil anahtar
 * olduğu için tek satır siler. `fixture.id` `E2E_FIXTURE_ID_PATTERN`'a
 * UYMUYORSA fırlatır — çıplak toplu silme YASAK
 * (`apps/admin/e2e/fixtures/tenant-cleanup.ts`'in
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
  runSql(`DELETE FROM tenant WHERE id = '${fixture.id}';`, SQL_ERROR_LABEL)
}

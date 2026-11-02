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
import { execFileSync } from 'node:child_process'

const POSTGRES_CONTAINER = 'arkesoft-postgres'
const POSTGRES_USER = process.env['POSTGRES_USER'] ?? 'arkesoft'
const POSTGRES_DB = process.env['POSTGRES_DB'] ?? 'arkesoft'

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
  try {
    execFileSync(
      'docker',
      [
        'exec',
        POSTGRES_CONTAINER,
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
        `e2e fixture: "${POSTGRES_CONTAINER}" Docker konteynerinde SQL çalıştırılamadı.`,
        'Ön koşul: `pnpm infra:up` ile Postgres konteyneri ayakta olmalı.',
        `Denenen komut: docker exec ${POSTGRES_CONTAINER} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "${sql}"`,
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

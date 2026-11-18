// @arkesoft/db — sürüm kayıt defteri tablolarının kısıt (UNIQUE/CHECK/ENUM)
// davranışının CANLI doğrulaması (qa gate T-018 tur 1, KENDİ bulgusu —
// AGENT_BASELINE §"İŞ ④").
//
// ⚠⚠ NEDEN BU DOSYA YAZILDI — AC-1/AC-5'in "geçersiz kanal reddi" ve "CHECK
// kısıtı ters sıra reddi" ölçülebilir kriterleri `migration-sql.test.ts`'te
// yalnızca SQL METNİ üzerinden (CHECK/ENUM İFADESİNİN migration.sql'de
// BEKLENEN biçimde YAZILI OLDUĞU) pinlenmişti — hiçbir test bu kısıtların
// CANLI Postgres'te GERÇEKTEN davranıp davranmadığını (bir INSERT/UPDATE
// GERÇEKTEN kabul/red ediliyor mu) ÖLÇMÜYORDU. `security` gate'in F2
// bulgusu (ad-hoc, tek seferlik `psql` ölçümü) bu boşluğun KANITIYDI ama
// kalıcı bir test DEĞİLDİ — qa gate bu dosyada onu KALICI bir regresyon
// bekçisine çevirir.
//
// Her `describe` kendi satırlarını `afterAll`'da HARD DELETE eder
// (`tenant.test.ts`'in BİREBİR deseni) — demo seed verisine dokunulmaz.
// Platform seviyesi tablolar (`platform_release`, `theme`, `theme_release`)
// RLS'e TABİ DEĞİL → `testAppPrisma` üzerinden context'siz yazılır. Kiracıya
// bağlı tablolar (`tenant_version_state`, `tenant_update_history`) RLS
// FORCE altında → `withTenant()` İÇİNDE yazılır (R-A3 deseni).
//
// ⚠⚠ ÖLÇÜLMÜŞ TUZAK (bu dosyanın yazımı sırasında): `withTenant()` tek bir
// Postgres `$transaction` açar. Callback İÇİNDE `try/catch` ile yakalanan
// bir kısıt ihlali JS tarafında "yutulmuş" GÖRÜNSE de, Postgres tarafında
// transaction'ı ABORTED durumuna düşürür — `$transaction` COMMIT'te bunu
// fark eder ve TÜM transaction'ı (ihlalden ÖNCEKİ başarılı yazmalar DAHİL)
// geri alır. Bu yüzden "önce başarılı yaz, sonra İHLAL DENE, sonra satır
// sayısını DOĞRULA" üçlüsü AYRI `withTenant()` çağrılarında (AYRI SQL
// transaction'larında) yapılmak ZORUNDADIR — aksi halde test, ilk satırın
// da hiç yazılmamış gibi görünmesiyle YANLIŞ SEBEPLE başarısız olur
// (ilk denemede BÖYLE kırmızı verdi, ölçülerek düzeltildi).

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  isUniqueConstraintError,
  ReleaseChannel,
  TenantStatus,
  ThemeReleaseStatus,
  ThemeStatus,
  UpdateStatus,
  UpdateTrigger,
  withTenant,
} from '../index.js'
import { testAppPrisma } from './helpers/test-client.js'

const PROBE_SDK_RANGE = '>=0.1.0 <1.0.0'

describe('platform_release — @@unique([version, channel]) + ENUM (qa gate T-018 tur 1, kendi testi)', () => {
  const createdVersions: string[] = []

  afterAll(async () => {
    if (createdVersions.length > 0) {
      await testAppPrisma.platformRelease.deleteMany({
        where: { version: { in: createdVersions } },
      })
    }
  })

  it('aynı version, FARKLI channel KABUL edilir (iki ayrı satır — "aynı sürüm farklı kanalda" senaryosu)', async () => {
    const version = `0.0.0-qa-dup-channel-${randomUUID().slice(0, 8)}`
    createdVersions.push(version)

    await testAppPrisma.platformRelease.create({
      data: {
        version,
        channel: ReleaseChannel.stable,
        releasedAt: new Date(),
        minApiVersion: '0.0.0',
      },
    })
    await testAppPrisma.platformRelease.create({
      data: {
        version,
        channel: ReleaseChannel.canary,
        releasedAt: new Date(),
        minApiVersion: '0.0.0',
      },
    })

    const rows = await testAppPrisma.platformRelease.findMany({ where: { version } })
    expect(rows.map((row) => row.channel).toSorted()).toEqual(['canary', 'stable'])
  })

  it('aynı version + aynı channel REDDEDİLİR (P2002)', async () => {
    const version = `0.0.0-qa-reject-${randomUUID().slice(0, 8)}`
    createdVersions.push(version)

    await testAppPrisma.platformRelease.create({
      data: {
        version,
        channel: ReleaseChannel.stable,
        releasedAt: new Date(),
        minApiVersion: '0.0.0',
      },
    })

    let caughtError: unknown
    try {
      await testAppPrisma.platformRelease.create({
        data: {
          version,
          channel: ReleaseChannel.stable,
          releasedAt: new Date(),
          minApiVersion: '0.0.0',
        },
      })
    } catch (error) {
      caughtError = error
    }

    expect(isUniqueConstraintError(caughtError)).toBe(true)
  })

  // AC-1 "geçersiz kanal reddi" — Prisma'nın TS enum tipi geçersiz bir
  // `channel` değerini DERLEME ZAMANINDA zaten engeller; veritabanı
  // seviyesindeki GERÇEK zorlamayı ölçmek için (ör. ileride tele çıkan bir
  // uç bu kısıtı Zod DIŞINDA bir yoldan atlatırsa) ENUM'un CANLI Postgres
  // katalogunda da reddettiği `$executeRaw` (parametreli, Unsafe DEĞİL) ile
  // doğrudan ölçülür.
  it('geçersiz channel REDDEDİLİR — Postgres ENUM seviyesinde (AC-1, raw SQL ile canlı ölçüm)', async () => {
    const id = randomUUID()
    const version = `0.0.0-qa-invalid-channel-${id.slice(0, 8)}`

    await expect(
      testAppPrisma.$executeRaw`INSERT INTO platform_release (id, version, channel, released_at, min_api_version) VALUES (${id}, ${version}, 'nightly', now(), '0.0.0')`,
    ).rejects.toThrow(/invalid input value for enum release_channel/)

    // Reddedildiği için satır oluşmamış olmalı (ikinci bir doğrulama katmanı
    // — reddin GERÇEKTEN hiçbir satır bırakmadığını kanıtlar).
    const rows = await testAppPrisma.platformRelease.findMany({ where: { version } })
    expect(rows).toHaveLength(0)
  })
})

// ⚠⚠ ÖLÇÜLMÜŞ KUSUR (T-019/S14, Orkestratör'ün ölçtüğü 248/249 kırmızısı):
// bu önekle üretilen tema fixture'ları çöken/kesilen bir ÖNCEKİ koşumda
// `afterAll`'a hiç varmadan artık (orphan) kalabiliyordu — canlı ölçüldü:
// `qa-constraint-theme-a-3233db49` / `qa-constraint-theme-b-28cf1320` bu
// koşumdan ÖNCEKİ bir çöküşün artığıydı. `afterAll` zaten var (aşağıda);
// kusur "temizlik yok" değil, "çöken koşuma karşı dayanıksızlık" — bir
// önceki koşum `afterAll`'a varamazsa sonraki koşumu zehirliyordu.
const PROBE_THEME_ID_PREFIX = 'qa-constraint-theme-'

describe('theme_release — @@unique([themeId, version]) + CHECK #1 pairing (qa gate T-018 tur 1, kendi testi)', () => {
  const themeIds: string[] = []

  // Çöken bir önceki koşumun artıklarını BU koşum başlamadan temizle —
  // `afterAll`'ın tersi yönde aynı güvence (bkz. dosya başı not). Önek
  // bazlı silme güvenli ve hedefli: bu describe'ın ürettiği HER tema id'si
  // `PROBE_THEME_ID_PREFIX` ile başlar, demo seed verisine dokunmaz.
  beforeAll(async () => {
    await testAppPrisma.theme.deleteMany({
      where: { id: { startsWith: PROBE_THEME_ID_PREFIX } },
    })
  })

  afterAll(async () => {
    if (themeIds.length > 0) {
      // `ThemeRelease.theme` ilişkisi `onDelete: Cascade` — tema silinince
      // ona bağlı tüm sürüm kayıtları da silinir (ADR-0020 Karar 3).
      await testAppPrisma.theme.deleteMany({ where: { id: { in: themeIds } } })
    }
  })

  async function createProbeTheme(label: string): Promise<string> {
    const id = `${PROBE_THEME_ID_PREFIX}${label}-${randomUUID().slice(0, 8)}`
    themeIds.push(id)
    await testAppPrisma.theme.create({
      data: { id, name: 'QA Constraint Probu', status: ThemeStatus.active },
    })
    return id
  }

  it('FARKLI temada AYNI sürüm KABUL edilir (unique bileşiği tema bazlıdır, sürüm bazlı DEĞİL)', async () => {
    const themeA = await createProbeTheme('a')
    const themeB = await createProbeTheme('b')
    const version = '9.9.9-qa-same-version-diff-theme'

    await testAppPrisma.themeRelease.create({
      data: {
        themeId: themeA,
        version,
        sdkRange: PROBE_SDK_RANGE,
        status: ThemeReleaseStatus.draft,
      },
    })
    await testAppPrisma.themeRelease.create({
      data: {
        themeId: themeB,
        version,
        sdkRange: PROBE_SDK_RANGE,
        status: ThemeReleaseStatus.draft,
      },
    })

    // ⚠⚠ ÖLÇÜLMÜŞ DÜZELTME (T-019/S14): `version` burada BİLEREK SABİT bir
    // literaldir (testin iddiası "aynı sürüm string'i farklı temalarda
    // çakışmaz" olduğu için randomize edilmez) — ama sorgu SADECE `version`
    // ile kapsanırsa, çöken bir önceki koşumun (farklı, random `themeId`
    // taşıyan ama AYNI sabit `version`'a sahip) artık satırları bu
    // `findMany`'ye sızar ve sonuç 2 yerine 4+ döner (canlı ölçüldü, S14
    // handoff). Sorguyu BU koşumda üretilen iki `themeId`'ye kapsamak
    // (dosyanın geri kalanının zaten kullandığı "random id ile kapsama"
    // deseninin aynısı) testin ASIL iddiasını DEĞİŞTİRMEZ, yalnızca harici
    // veriye karşı bağışık hâle getirir.
    const rows = await testAppPrisma.themeRelease.findMany({
      where: { version, themeId: { in: [themeA, themeB] } },
    })
    expect(rows.map((row) => row.themeId).toSorted()).toEqual([themeA, themeB].toSorted())
  })

  it('AYNI temada AYNI sürüm REDDEDİLİR (P2002)', async () => {
    const themeId = await createProbeTheme('dup')
    const version = '9.9.9-qa-dup'

    await testAppPrisma.themeRelease.create({
      data: { themeId, version, sdkRange: PROBE_SDK_RANGE, status: ThemeReleaseStatus.draft },
    })

    let caughtError: unknown
    try {
      await testAppPrisma.themeRelease.create({
        data: { themeId, version, sdkRange: PROBE_SDK_RANGE, status: ThemeReleaseStatus.draft },
      })
    } catch (error) {
      caughtError = error
    }

    expect(isUniqueConstraintError(caughtError)).toBe(true)
  })

  it('draft + publishedAt NULL KABUL edilir (CHECK #1: true = true)', async () => {
    const themeId = await createProbeTheme('check1-draft-null')
    await expect(
      testAppPrisma.themeRelease.create({
        data: {
          themeId,
          version: '0.0.1',
          sdkRange: PROBE_SDK_RANGE,
          status: ThemeReleaseStatus.draft,
          publishedAt: null,
        },
      }),
    ).resolves.toMatchObject({ status: 'draft' })
  })

  it('draft + publishedAt NOT NULL REDDEDİLİR (CHECK #1: true = false)', async () => {
    const themeId = await createProbeTheme('check1-draft-notnull')
    await expect(
      testAppPrisma.themeRelease.create({
        data: {
          themeId,
          version: '0.0.1',
          sdkRange: PROBE_SDK_RANGE,
          status: ThemeReleaseStatus.draft,
          publishedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/theme_release_published_at_pairing_check/)
  })

  it('published + publishedAt NOT NULL KABUL edilir (CHECK #1: false = false)', async () => {
    const themeId = await createProbeTheme('check1-published-notnull')
    await expect(
      testAppPrisma.themeRelease.create({
        data: {
          themeId,
          version: '0.0.1',
          sdkRange: PROBE_SDK_RANGE,
          status: ThemeReleaseStatus.published,
          publishedAt: new Date(),
        },
      }),
    ).resolves.toMatchObject({ status: 'published' })
  })

  it('published + publishedAt NULL REDDEDİLİR (CHECK #1: false = true)', async () => {
    const themeId = await createProbeTheme('check1-published-null')
    await expect(
      testAppPrisma.themeRelease.create({
        data: {
          themeId,
          version: '0.0.1',
          sdkRange: PROBE_SDK_RANGE,
          status: ThemeReleaseStatus.published,
          publishedAt: null,
        },
      }),
    ).rejects.toThrow(/theme_release_published_at_pairing_check/)
  })

  // ⚠⚠ security gate T-018 tur 1, bulgu F2 ([low], CHECK #1 tasarımının
  // KENAR DURUMU) — bu test o bulguyu KALICI bir regresyon bekçisine
  // çevirir: "hiç yayınlanmamış bir `draft` sürüm `deprecated`'a geçmek
  // istendiğinde, CHECK #1 bunu `publishedAt` de AYNI anda doldurulmadıkça
  // REDDEDER" — ADR-0002 Karar 8 / V5 disiplininin yasakladığı "kaydı
  // uydurma bir `published_at` ile yalanla başlatma" dışında bir çıkış yolu
  // YOKTUR (bugün yazıcı olmadığı için etki sıfır — security'nin [low]
  // değerlendirmesiyle UYUMLU; qa bu Task'ta önem derecesini DEĞİŞTİRMEZ).
  it('⚠ F2 KENAR DURUMU (security gate bulgusu, [low] — burada PİNLENDİ): deprecated + publishedAt NULL REDDEDİLİR', async () => {
    const themeId = await createProbeTheme('f2-never-published')
    await testAppPrisma.themeRelease.create({
      data: {
        themeId,
        version: '0.0.1',
        sdkRange: PROBE_SDK_RANGE,
        status: ThemeReleaseStatus.draft,
        publishedAt: null,
      },
    })

    await expect(
      testAppPrisma.themeRelease.update({
        where: { themeId_version: { themeId, version: '0.0.1' } },
        data: { status: ThemeReleaseStatus.deprecated },
      }),
    ).rejects.toThrow(/theme_release_published_at_pairing_check/)
  })

  it('deprecated + publishedAt NOT NULL KABUL edilir (yayınlanmış bir sürümün geri çekilmesi — F2nin TERSİ, regresyon yok)', async () => {
    const themeId = await createProbeTheme('f2-was-published')
    await testAppPrisma.themeRelease.create({
      data: {
        themeId,
        version: '0.0.1',
        sdkRange: PROBE_SDK_RANGE,
        status: ThemeReleaseStatus.published,
        publishedAt: new Date(),
      },
    })

    await expect(
      testAppPrisma.themeRelease.update({
        where: { themeId_version: { themeId, version: '0.0.1' } },
        data: { status: ThemeReleaseStatus.deprecated },
      }),
    ).resolves.toMatchObject({ status: 'deprecated' })
  })
})

describe('tenant_version_state — tenantId @unique, GERÇEK 1:1 (qa gate T-018 tur 1, kendi testi)', () => {
  const tenantIds: string[] = []

  afterAll(async () => {
    if (tenantIds.length > 0) {
      await testAppPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } })
    }
  })

  // ⚠ Bu senaryo po'nun R-PO1/S4'ün ölçtüğü senaryodan FARKLIDIR: R-PO1
  // "A bağlamında B'nin tenant_id'siyle INSERT" (ÇAPRAZ kiracı, RLS
  // `WITH CHECK` 42501 ile reddeder) sorusunu ölçtü. Bu test "AYNI
  // kiracının bağlamında AYNI kiracı için İKİNCİ satır" sorusunu sorar —
  // burada RLS `WITH CHECK` GEÇER (tenant_id gerçekten eşleşiyor), tek
  // olası red sebebi `tenantId @unique` kısıtıdır (P2002). İkisi birlikte
  // "1:1 gerçekten 1:1 mi?" sorusunu İKİ AYRI yoldan (yetkisizlik VE
  // tekillik) kapatır.
  //
  // ⚠ ÜÇ AYRI `withTenant()` ÇAĞRISI — dosya başı "ÖLÇÜLMÜŞ TUZAK" notu:
  // ilk yazma kendi transaction'ında COMMIT edilir, ikinci (ihlal eden)
  // deneme AYRI bir transaction'da çalışır ve o transaction'ın KENDİSİ
  // geri alınır (ilk satır ETKİLENMEZ), satır sayısı doğrulaması ÜÇÜNCÜ
  // bir (salt okunur) transaction'da yapılır.
  it('AYNI tenant için İKİNCİ satır REDDEDİLİR (P2002 — RLS DEĞİL, çünkü tenant_id GERÇEKTEN eşleşiyor)', async () => {
    const tenant = await testAppPrisma.tenant.create({
      data: {
        slug: `qa-tvs-${randomUUID()}`,
        name: 'QA Constraint Probu',
        status: TenantStatus.active,
      },
    })
    tenantIds.push(tenant.id)

    await withTenant(testAppPrisma, tenant.id, (tx) =>
      tx.tenantVersionState.create({
        data: {
          tenantId: tenant.id,
          platformVersion: '0.0.0-qa',
          themeId: 'qa-probe',
          themeVersion: '0.0.0-qa',
          apiVersion: '0.0.0-qa',
          lastUpdatedAt: new Date(),
        },
      }),
    )

    let caughtError: unknown
    try {
      await withTenant(testAppPrisma, tenant.id, (tx) =>
        tx.tenantVersionState.create({
          data: {
            tenantId: tenant.id,
            platformVersion: '0.0.1-qa',
            themeId: 'qa-probe',
            themeVersion: '0.0.0-qa',
            apiVersion: '0.0.0-qa',
            lastUpdatedAt: new Date(),
          },
        }),
      )
    } catch (error) {
      caughtError = error
    }

    expect(isUniqueConstraintError(caughtError)).toBe(true)

    // İkinci satır GERÇEKTEN oluşmadı — tam olarak bir satır var (ilk,
    // AYRI ve ÖNCEDEN COMMIT edilmiş transaction'ın satırı).
    const rowCount = await withTenant(testAppPrisma, tenant.id, (tx) =>
      tx.tenantVersionState.count({ where: { tenantId: tenant.id } }),
    )
    expect(rowCount).toBe(1)
  })
})

describe('tenant_update_history — CHECK #2 (finished_at IS NULL OR finished_at >= started_at) (qa gate T-018 tur 1, kendi testi)', () => {
  const tenantIds: string[] = []

  afterAll(async () => {
    if (tenantIds.length > 0) {
      await testAppPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } })
    }
  })

  async function createProbeTenant(label: string): Promise<string> {
    const tenant = await testAppPrisma.tenant.create({
      data: {
        slug: `qa-tuh-${label}-${randomUUID()}`,
        name: 'QA Constraint Probu',
        status: TenantStatus.active,
      },
    })
    tenantIds.push(tenant.id)
    return tenant.id
  }

  it('finishedAt = startedAt (EŞİTLİK) KABUL edilir (CHECK #2 >= dahil, > DEĞİL)', async () => {
    const tenantId = await createProbeTenant('equal')
    const startedAt = new Date('2026-01-01T00:00:00.000Z')

    await expect(
      withTenant(testAppPrisma, tenantId, (tx) =>
        tx.tenantUpdateHistory.create({
          data: {
            tenantId,
            toState: { platformVersion: '0.0.0-qa' },
            triggeredBy: UpdateTrigger.platform_auto,
            status: UpdateStatus.completed,
            startedAt,
            finishedAt: startedAt,
          },
        }),
      ),
    ).resolves.toMatchObject({ status: 'completed' })
  })

  it('finishedAt < startedAt REDDEDİLİR (CHECK #2 ihlali — ters sıra)', async () => {
    const tenantId = await createProbeTenant('reversed')
    const startedAt = new Date('2026-01-02T00:00:00.000Z')
    const finishedAt = new Date('2026-01-01T00:00:00.000Z')

    await expect(
      withTenant(testAppPrisma, tenantId, (tx) =>
        tx.tenantUpdateHistory.create({
          data: {
            tenantId,
            toState: { platformVersion: '0.0.0-qa' },
            triggeredBy: UpdateTrigger.platform_auto,
            status: UpdateStatus.failed,
            startedAt,
            finishedAt,
          },
        }),
      ),
    ).rejects.toThrow(/tenant_update_history_finished_after_started_check/)
  })

  it('finishedAt NULL (devam eden güncelleme) KABUL edilir', async () => {
    const tenantId = await createProbeTenant('running')

    await expect(
      withTenant(testAppPrisma, tenantId, (tx) =>
        tx.tenantUpdateHistory.create({
          data: {
            tenantId,
            toState: { platformVersion: '0.0.0-qa' },
            triggeredBy: UpdateTrigger.tenant_user,
            status: UpdateStatus.running,
            startedAt: new Date(),
            finishedAt: null,
          },
        }),
      ),
    ).resolves.toMatchObject({ status: 'running', finishedAt: null })
  })
})

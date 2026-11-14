// @arkesoft/db — demo veri seed script'i (ROADMAP v0.0.3, T-001/ST-4)
//
// Prisma'nın `migrations.seed` komutu (`prisma.config.ts`) bu dosyayı
// `node --env-file=../../.env dist/seed.js` olarak çalıştırır — `DATABASE_URL`
// Node'un `--env-file` bayrağıyla ZATEN yüklenmiş olur, bu dosya kendi başına
// `.env` okumaz.
//
// İdempotans tamamen `upsert` + doğal anahtarlar (slug, email, (tenantId,userId))
// üzerinden kurulur; rastgele ID üretimi mükerrer kayıt YARATMAZ (AC1 — aynı
// komut iki kez üst üste çalıştırılabilir).
//
// `tenant.primaryDomain` BİLİNÇLİ OLARAK `null` — alt alan adı `slug` +
// `APP_BASE_DOMAIN`'den türetilir, saklanmaz (A-V7). Owner kullanıcıda
// şifre/token YOK (Better Auth tabloları v0.0.5'te gelecek) → bu dosyada ve
// seed çıktısında hiçbir sır yok.
//
// İKİ TRANSACTION'A BİLİNÇLİ BÖLÜNME (ROADMAP v0.0.13, T-005/S3, architect
// K-E2.2, PM riski 1/architect riski 10 — CLAUDE.md §4'ün "çok kayıtlı yazma
// işlemi TEK transaction'da olur" kuralından GEREKÇELİ sapma):
//   1. Platform tabloları (`tenant`, `app_user`, ve ROADMAP v0.0.21/T-018/S5
//      itibariyle `platform_release`/`theme`/`theme_release`) — RLS YOK,
//      tenant context GEREKMEZ. TEK `$transaction` içinde upsert edilir.
//   2. `tenant_membership` ve (v0.0.21'den itibaren) `tenant_version_state`
//      yazımı — RLS + `FORCE ROW LEVEL SECURITY` altında (bkz. ilgili
//      migration'lar), bu yüzden `withTenant(tenant.id, …)` İÇİNDE yapılmak
//      ZORUNDA. Bölme KAÇINILMAZ: `withTenant`'ın girdisi olan `tenant.id`,
//      1. adımın ÇIKTISIDIR — ikisi aynı transaction'da OLAMAZ (context
//      kurulacak tenant henüz var olmadan context kurulamaz). Seed BİLEREK
//      `arkesoft_app` bağlantısıyla koşar (K-E2.2) → bu iki upsert çağrısı
//      `withTenant()`'ın ÇALIŞMA ZAMANI yolunu egzersiz eder (AC10 + AC2'nin
//      "uygulama bağlantısıyla" şartı). ⚠⚠ R-A3 (architect/po, T-018): FORCE
//      RLS'li bir tabloya context KURULMADAN yazılan bir `INSERT` reddedilir
//      ya da bir `UPDATE`/`SELECT` SESSİZCE 0 satır eder ("tablo boş sonucu
//      kanıt DEĞİLDİR") — `tenant_version_state` bu yüzden BİLEREK 1. adıma
//      DEĞİL, bu 2. adıma (zaten kurulu `withTenant` bloğunun İÇİNE) eklendi.
// Atomiklik kaybı sınırlıdır ve idempotent `upsert`'lerle TELAFİ EDİLİR:
// 1. adım yarıda kalırsa (`tenant`/`owner`/`platform_release`/`theme`/
// `theme_release` upsert edilmiş, 2. adıma hiç ulaşılmamış) komutun tekrar
// çalıştırılması aynı doğal anahtarlar (slug/email/(tenantId,userId)/
// (version,channel)/themeId/(themeId,version)) üzerinden YAKINSAR —
// mükerrer kayıt üretmez, eksik üyeliği/sürüm durumunu tamamlar.
//
// CLI girdi noktası: `console.*` yasağı (packages/config/eslint/base.js)
// bilerek burada da uygulanıyor; `process.stdout/stderr.write` kullanılır.
// Yapılandırılmış pino logger'ı v0.0.4'te gelecek (R-A7) — bu script
// migration/seed aşamasında logger'dan önce çalıştığı için bekleyemez.
//
// DERİNLİK SAVUNMASI (Gate Tur 1, S5): resmi `pnpm db:seed` script'i artık
// `run-guarded-prisma.ts` üzerinden geçiyor, ama bu dosya İKİ başka yoldan da
// tetiklenebiliyor — `prisma.config.ts` → `migrations.seed` kancası
// (`migrate dev`/`migrate reset` otomatik çalıştırır) ve doğrudan
// `node dist/seed.js`. Bu iki yol sarmalayıcıyı HİÇ GÖRMEZ; bu yüzden `seed.ts`
// kendi başına `readDatabaseEnv()` + `evaluateTargetDatabase()` çalıştırır —
// staging/üretim `DATABASE_URL`'i tanımlı bir kabukta demo tenant + owner
// üyeliğinin onaysız upsert edilmesini (gerçek bir owner yetkisi doğurmasını)
// engeller.
//
// GÜNCELLEME (ROADMAP v0.0.21, T-018/S5, ADR-0020 Karar 1 — ÇİFT DOĞRULUK
// KAYNAĞI KAPATILDI): `platform_release`/`theme`/`theme_release`/
// `tenant_version_state` EKLENDİ. Sürüm değerleri (platform/API/tema)
// `resolveVersionRegistrySeedValues()` İLE BİR KEZ okunur (`versionValues`,
// aşağıda) ve HEM `Tenant.theme*` (deprecated ayna kolon) HEM
// `tenant_version_state.theme*`'E YAZILIR — "tek bir kaynak sabitten" şartı
// (AC-11'in sapma testi bunu pinler). Hiçbir sürüm numarası ELLE YAZILMAZ
// (AC-10, bkz. `version-registry-seed.ts` dosya başı). `theme_release`
// ADR-0002 Karar 8 gereği `status='draft'`, `publishedAt=null` yazılır —
// `published` ASLA (yayın koşulunun iki bileşeni, görsel regresyon v0.0.19 +
// Lighthouse v0.1.x+, bu sürümde karşılanamaz).

import { maskEmail } from '@arkesoft/errors'

import { createPrismaClient } from './client.js'
import { readDatabaseEnv } from './env.js'
import { evaluateTargetDatabase } from './guard-policy.js'
import { DEMO_SEED, TRIAL_PLAN } from './seed-data.js'
import { TENANT_CONTEXT_SETTING, withTenant } from './tenant-context.js'
import { resolveVersionRegistrySeedValues } from './version-registry-seed.js'
import {
  Prisma,
  ReleaseChannel,
  SubscriptionStatus,
  TenantRole,
  TenantStatus,
  ThemeReleaseStatus,
  ThemeStatus,
  UserStatus,
} from '#prisma'

async function main(): Promise<void> {
  let env: ReturnType<typeof readDatabaseEnv>
  try {
    env = readDatabaseEnv()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen ortam doğrulama hatası.'
    process.stderr.write(`[seed] ${message}\n`)
    process.exit(1)
  }

  const decision = evaluateTargetDatabase(env, process.env['ARKESOFT_CONFIRM_DESTRUCTIVE'])
  if (decision.kind === 'reject') {
    process.stderr.write(`[seed] ${decision.message}\n`)
    process.exit(1)
  }

  const prisma = createPrismaClient({
    databaseUrl: env.databaseUrl,
    tenantContextSetting: TENANT_CONTEXT_SETTING,
  })

  // ADR-0020 Karar 1 — TEK kaynak sabit: platform/API/tema sürüm değerleri
  // BİR KEZ okunur, aşağıdaki HER İKİ adımda da (Tenant.theme* ayna kolonu VE
  // tenant_version_state.theme*) AYNI nesneden yazılır. Hiçbir sürüm numarası
  // elle yazılmaz (AC-10, `version-registry-seed.ts` dosya başı).
  const versionValues = resolveVersionRegistrySeedValues()

  try {
    // Adım 1/2 — platform tabloları (`tenant`, `app_user`, `platform_release`,
    // `theme`, `theme_release`): RLS yok, tenant context gerekmez. Dosya başı
    // yorumundaki gerekçeyle TEK `$transaction`.
    const { tenant, owner } = await prisma.$transaction(async (tx) => {
      // Platformun kendi sürüm kaydı — V5 disiplini: tarihsel sürümler
      // (bugünkünden önceki her sürüm) GERİYE DOLDURULMAZ, `releasedAt`
      // seed'in KOŞMA ANINI yazar; `(version, channel)` üzerinden upsert
      // edildiği için tekrar koşum satır KAYDIRMAZ/ÇOĞALTMAZ. `notes` V5
      // disipliniyle `null` (veri yok, uydurulmaz).
      await tx.platformRelease.upsert({
        where: {
          version_channel: {
            version: versionValues.platformVersion,
            channel: ReleaseChannel.stable,
          },
        },
        create: {
          version: versionValues.platformVersion,
          channel: ReleaseChannel.stable,
          releasedAt: new Date(),
          notes: null,
          minApiVersion: versionValues.apiVersion,
        },
        update: {
          minApiVersion: versionValues.apiVersion,
        },
      })

      // Tema kaydı — `Theme.id` doğal anahtar (ADR-0020 Karar 3, manifestin
      // `id`'si).
      await tx.theme.upsert({
        where: { id: versionValues.themeId },
        create: {
          id: versionValues.themeId,
          name: versionValues.themeName,
          status: ThemeStatus.active,
        },
        update: { name: versionValues.themeName, status: ThemeStatus.active },
      })

      // Tema SÜRÜM kaydı — ⚠⚠ ADR-0002 Karar 8 (bağlayıcı): bugünkü tema
      // sürümü yayınlanmış bir tema sürümü DEĞİLDİR (yayın koşulunun iki bileşeni,
      // görsel regresyon v0.0.19 + Lighthouse v0.1.x+, bu sürümde
      // karşılanamaz) → `status='draft'`, `publishedAt=null`. `published`
      // YAZMAK kaydı YALANLA başlatırdı. CHECK #1
      // (`(status='draft') = (published_at IS NULL)`) bu eşleşmeyi
      // veritabanı seviyesinde zorlar.
      await tx.themeRelease.upsert({
        where: {
          themeId_version: { themeId: versionValues.themeId, version: versionValues.themeVersion },
        },
        create: {
          themeId: versionValues.themeId,
          version: versionValues.themeVersion,
          sdkRange: versionValues.themeSdkRange,
          changelog: null,
          status: ThemeReleaseStatus.draft,
          publishedAt: null,
        },
        update: {
          sdkRange: versionValues.themeSdkRange,
          status: ThemeReleaseStatus.draft,
          publishedAt: null,
        },
      })

      // ROADMAP v0.1.0 (T-019/S1, architect VERİ MODELİ — ADR-0021 §4):
      // `trial` planı — doğal anahtar (`Plan.id`, `Theme.id` emsali),
      // PLATFORM seviyesi (RLS yok) → bu TEK `$transaction` içinde upsert
      // edilebilir (`theme`/`platformRelease` emsali). `limits` ŞABLONDUR;
      // aşağıdaki `subscription` yazımı bunun bir ANLIK GÖRÜNTÜSÜNÜ alır.
      await tx.plan.upsert({
        where: { id: TRIAL_PLAN.id },
        create: {
          id: TRIAL_PLAN.id,
          name: TRIAL_PLAN.name,
          limits: TRIAL_PLAN.limits,
        },
        update: {
          name: TRIAL_PLAN.name,
          limits: TRIAL_PLAN.limits,
        },
      })

      const createdTenant = await tx.tenant.upsert({
        where: { slug: DEMO_SEED.tenant.slug },
        create: {
          slug: DEMO_SEED.tenant.slug,
          name: DEMO_SEED.tenant.name,
          status: TenantStatus.active,
          primaryDomain: null,
          // ROADMAP v0.0.21, T-018/S5 (ADR-0020 Karar 1): deprecated ayna
          // kolon — AYNI `versionValues`'tan yazılır (ikinci bir doğruluk
          // kaynağı AÇILMAZ; aşağıdaki `tenant_version_state` yazımıyla
          // karşılaştır, AC-11 sapma testi).
          themeId: versionValues.themeId,
          themeVersion: versionValues.themeVersion,
          // ROADMAP v0.1.0 (T-019/S1): kayıt akışının yazdığı alanın demo
          // karşılığı — NULLABLE, DB `DEFAULT` YOK (bkz. `Tenant.siteType`
          // model doc'u); seed burada açıkça yazar.
          siteType: DEMO_SEED.tenant.siteType,
        },
        update: {
          name: DEMO_SEED.tenant.name,
          status: TenantStatus.active,
          primaryDomain: null,
          themeId: versionValues.themeId,
          themeVersion: versionValues.themeVersion,
          siteType: DEMO_SEED.tenant.siteType,
        },
      })

      const createdOwner = await tx.user.upsert({
        where: { email: DEMO_SEED.owner.email },
        create: {
          email: DEMO_SEED.owner.email,
          name: DEMO_SEED.owner.name,
          status: UserStatus.active,
        },
        update: {
          name: DEMO_SEED.owner.name,
          status: UserStatus.active,
        },
      })

      return { tenant: createdTenant, owner: createdOwner }
    })

    // Adım 2/2 — `tenant_membership` VE `tenant_version_state`: RLS + FORCE
    // altında, `withTenant()` İÇİNDE yazılmak ZORUNDA (dosya başı yorumu).
    // Girdisi (`tenant.id`) 1. adımın çıktısı olduğu için AYNI transaction'da
    // olamaz. ⚠⚠ R-A3: context KURULMADAN bu tabloya yazılan bir INSERT
    // reddedilir, context'siz bir UPDATE/SELECT SESSİZCE 0 satır eder — bu
    // yüzden İKİSİ de AYNI `withTenant` bloğunun içinde, context kurulduktan
    // SONRA çalışır.
    await withTenant(prisma, tenant.id, async (tx) => {
      await tx.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: owner.id } },
        create: { tenantId: tenant.id, userId: owner.id, role: TenantRole.owner },
        update: { role: TenantRole.owner },
      })

      // ADR-0020 Karar 1 — kiracının sürüm bileşiminin TEK yazılabilir
      // doğruluk kaynağı. AYNI `versionValues`'tan (yukarıdaki `Tenant.theme*`
      // yazımıyla TEK kaynak) — AC-11'in sapma testi bu iki satırın
      // veritabanından okunduğunda EŞİT olduğunu doğrular. `previousState`
      // NULL: ilk kurulumun önceki hâli YOK (A-T18 varsayım teyidi).
      await tx.tenantVersionState.upsert({
        where: { tenantId: tenant.id },
        create: {
          tenantId: tenant.id,
          platformVersion: versionValues.platformVersion,
          themeId: versionValues.themeId,
          themeVersion: versionValues.themeVersion,
          apiVersion: versionValues.apiVersion,
          lastUpdatedAt: new Date(),
          // `Json?` kolonuna açık `NULL` yazmak `null` LİTERALİYLE değil,
          // Prisma'nın sentinel değerleriyle yapılır (plain `null` "alan
          // güncellenmesin" anlamına gelirdi, `tsc` bunu bu yüzden reddeder).
          // ⚠ `Prisma.DbNull` SEÇİLDİ, `Prisma.JsonNull` DEĞİL: "ilk
          // kurulumun önceki hâli YOK" olgusu GERÇEK bir SQL `NULL`'dur
          // (jsonb kolonunda `'null'::jsonb` DEĞİL — o, "değer VAR ve o değer
          // JSON null'dur" anlamına gelirdi, farklı bir olgu). Desen
          // `job-runner.ts:303`'ün ÖLÇTÜĞÜ API, burada `apps/api`'nin
          // aksine `packages/db`'nin KENDİ `#prisma` erişimi üzerinden
          // (`Prisma` DEĞER olarak, barrel'ın type-only kısıtlaması burayı
          // BAĞLAMAZ).
          previousState: Prisma.DbNull,
        },
        update: {
          platformVersion: versionValues.platformVersion,
          themeId: versionValues.themeId,
          themeVersion: versionValues.themeVersion,
          apiVersion: versionValues.apiVersion,
          lastUpdatedAt: new Date(),
        },
      })

      // ROADMAP v0.1.0 (T-019/S1, architect VERİ MODELİ — ADR-0021 §4):
      // `trial` aboneliği — KİRACIYA BAĞLI, RLS + FORCE altında → bu
      // `withTenant` bloğunun İÇİNDE (context kurulduktan SONRA) yazılmak
      // ZORUNDA (dosya başı yorumu, `tenant_version_state`'in BİREBİR aynı
      // gerekçesi). `limits` yalnızca `create`'te `TRIAL_PLAN.limits`'ten
      // ANLIK GÖRÜNTÜ olarak yazılır — bir sonraki seed koşumunda plan
      // şablonu değişse bile bu satırın `limits`'i GEÇMİŞE DÖNÜK
      // değiştirilmez (`Subscription.limits` model doc'u); `update` bu
      // yüzden yalnızca `status`'u yeniden onaylar (tek değer, `active`),
      // `limits`/`planId`/`startedAt`'e DOKUNMAZ.
      await tx.subscription.upsert({
        where: { tenantId: tenant.id },
        create: {
          tenantId: tenant.id,
          planId: TRIAL_PLAN.id,
          status: SubscriptionStatus.active,
          limits: TRIAL_PLAN.limits,
          startedAt: new Date(),
        },
        update: {
          status: SubscriptionStatus.active,
        },
      })
    })

    // Onay #2 (T-002): stdout'a yazılan e-posta maskelenir — bu değer RFC 2606
    // `.test` fixture'ı olsa da amaç pino'ya geçişte aynı deseni (ham e-posta
    // loglama) kopyalamayı engellemek (CLAUDE.md §4 maskeleme kuralı).
    process.stdout.write(
      `[seed] Demo tenant ("${DEMO_SEED.tenant.slug}") ve sahip kullanıcı ("${maskEmail(DEMO_SEED.owner.email)}") hazır.\n`,
    )
    process.stdout.write(
      `[seed] Sürüm kaydı: platform=${versionValues.platformVersion}, api=${versionValues.apiVersion}, tema=${versionValues.themeId}@${versionValues.themeVersion}.\n`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  // Onay #2 (T-002): `String(error)` yığın izini (stack trace) kaybediyordu;
  // dosyanın :44 satırındaki daraltma deseniyle tutarlı hâle getirildi — hata
  // yine YUTULMUYOR, exit 1 korunuyor.
  const message = error instanceof Error ? (error.stack ?? error.message) : 'bilinmeyen hata'
  process.stderr.write(`[seed] Beklenmeyen hata: ${message}\n`)
  process.exit(1)
})

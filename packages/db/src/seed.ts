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
// Tamamı TEK `$transaction` içinde (CLAUDE.md §4: çok kayıtlı yazma işlemi
// transaction'da olur). `tenant.primaryDomain` BİLİNÇLİ OLARAK `null` — alt
// alan adı `slug` + `APP_BASE_DOMAIN`'den türetilir, saklanmaz (A-V7). Owner
// kullanıcıda şifre/token YOK (Better Auth tabloları v0.0.5'te gelecek) → bu
// dosyada ve seed çıktısında hiçbir sır yok.
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

import { maskEmail } from '@arkesoft/errors'

import { createPrismaClient } from './client.js'
import { readDatabaseEnv } from './env.js'
import { evaluateTargetDatabase } from './guard-policy.js'
import { DEMO_SEED } from './seed-data.js'
import { TenantRole, TenantStatus, UserStatus } from '#prisma'

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

  const prisma = createPrismaClient({ databaseUrl: env.databaseUrl })

  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: DEMO_SEED.tenant.slug },
        create: {
          slug: DEMO_SEED.tenant.slug,
          name: DEMO_SEED.tenant.name,
          status: TenantStatus.active,
          primaryDomain: null,
        },
        update: {
          name: DEMO_SEED.tenant.name,
          status: TenantStatus.active,
          primaryDomain: null,
        },
      })

      const owner = await tx.user.upsert({
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

      await tx.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: owner.id } },
        create: { tenantId: tenant.id, userId: owner.id, role: TenantRole.owner },
        update: { role: TenantRole.owner },
      })
    })

    // Onay #2 (T-002): stdout'a yazılan e-posta maskelenir — bu değer RFC 2606
    // `.test` fixture'ı olsa da amaç pino'ya geçişte aynı deseni (ham e-posta
    // loglama) kopyalamayı engellemek (CLAUDE.md §4 maskeleme kuralı).
    process.stdout.write(
      `[seed] Demo tenant ("${DEMO_SEED.tenant.slug}") ve sahip kullanıcı ("${maskEmail(DEMO_SEED.owner.email)}") hazır.\n`,
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
